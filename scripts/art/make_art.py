"""Pink Slips card art pipeline.

Turns one Wikimedia Commons photograph per car into the card illustration: the car cut out of
its background, posterized and outlined so every card shares one printed look, set on the cream
card backdrop, and saved as an 800 by 600 WebP under 60 KB. Also writes public/art/CREDITS.md
with the photographer and license for each image.

Requires Python 3.10 or later. From the repo root:

    python -m venv scripts/art/.venv
    scripts/art/.venv/Scripts/pip install -r scripts/art/requirements.txt
    scripts/art/.venv/Scripts/python scripts/art/make_art.py            # every car in sources.csv
    scripts/art/.venv/Scripts/python scripts/art/make_art.py honda-civic-si   # just some
    scripts/art/.venv/Scripts/python scripts/art/make_art.py --out tmp honda-civic-si  # try one

--out writes the cards somewhere else and leaves public/art and the credits untouched, so a
candidate photograph can be tried without dirtying the repo.

Inputs: scripts/art/sources.csv with columns carId, commonsFile, flip. commonsFile is the Commons
file title, for example "File:2021 Ford F-150 Raptor.jpg". flip is y when the car faces left.
Only CC0, public domain, CC BY, and CC BY-SA photographs are accepted.

Each card is also inspected and anything odd is printed under it: a car that runs off the edge
of its photograph, a second object nearly as big as the car, or a subject filling an unusual
share of the frame. Those are notes, never refusals, and they miss plenty. Look at the card.
"""

from __future__ import annotations

import csv
import hashlib
import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

# The look. Tune here, then rerun.
COLORS = 8  # tones after posterizing
SATURATION = 1.3  # before posterizing, so the tones stay lively
BRIGHTNESS = 1.12  # lifts dark paint so the tones read on the cream backdrop
ALPHA_CUTOFF = 110  # cutout alpha below this is dropped, which removes ghosting at the edges
EDGE_OPACITY = 0.45  # strength of the printed line layer
EDGE_THRESHOLD = 40  # lower keeps more lines
FILL = 0.8  # car width as a fraction of the image width
BASELINE = 0.86  # where the tires sit, as a fraction of the image height
SHADOW_ALPHA = 70
SHADOW_BLUR = 14
BACKDROP = (0xF3, 0xE7, 0xC9)  # the card cream from src/index.css
SIZE = (800, 600)
MAX_BYTES = 60_000
START_QUALITY = 82
DOWNLOAD_WIDTH = 1920  # a standard Commons thumbnail width; originals are refused in bulk

# Bands for inspect_cutout. Warnings only, never a refusal.
SECOND_REGION_WARN = 0.05  # a second blob this share of the car is worth mentioning
FILL_BAND = (0.25, 0.69)  # the middle of the spread measured across every source

Image.MAX_IMAGE_PIXELS = None  # Commons originals can be very large; they are trusted downloads

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SOURCES = HERE / "sources.csv"
CACHE = HERE / "cache"
CREDITS_DATA = HERE / "credits.json"
OUT = ROOT / "public" / "art"
CARS_TS = ROOT / "src" / "data" / "cars.ts"
USER_AGENT = "PinkSlipsArtPipeline/1.0 (card game art; see repository README)"
API = "https://commons.wikimedia.org/w/api.php"
ACCEPTED_LICENSES = ("cc0", "public domain", "cc by", "cc-by")


def car_names() -> dict[str, str]:
    """Reads id and display name pairs out of cars.ts without needing a TypeScript runtime."""
    text = CARS_TS.read_text(encoding="utf-8")
    pairs = re.findall(r"id: '([a-z0-9-]+)',\s*name: (?:'([^']*)'|\"([^\"]*)\")", text)
    return {car_id: single or double for car_id, single, double in pairs}


def open_url(url: str, timeout: int) -> bytes:
    """Fetches with a User-Agent, backing off and retrying when Commons rate-limits."""
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return res.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(15 * (attempt + 1))
    raise SystemExit("unreachable")


def fetch_json(params: dict[str, str]) -> dict:
    url = API + "?" + urllib.parse.urlencode({"format": "json", **params})
    return json.loads(open_url(url, 60))


def strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def commons_info(title: str) -> dict[str, str]:
    """Original file URL and credit fields for one Commons file title."""
    data = fetch_json(
        {
            "action": "query",
            "prop": "imageinfo",
            "titles": title,
            "iiprop": "url|extmetadata",
            "iiurlwidth": str(DOWNLOAD_WIDTH),
        }
    )
    pages = data["query"]["pages"]
    page = next(iter(pages.values()))
    if "imageinfo" not in page:
        raise SystemExit(f"{title}: not found on Commons")
    info = page["imageinfo"][0]
    meta = info.get("extmetadata", {})
    field = lambda key: strip_tags(meta.get(key, {}).get("value", ""))
    license_name = field("LicenseShortName")
    if not license_name.lower().startswith(ACCEPTED_LICENSES):
        raise SystemExit(f"{title}: license {license_name!r} is not in the accepted list")
    return {
        "title": page["title"],
        # A standard thumbnail size: plenty for the card and kinder to Commons than originals.
        "url": info.get("thumburl") or info["url"],
        "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(page["title"]),
        "author": field("Artist") or field("Credit") or "unknown",
        "license": license_name,
        "licenseUrl": field("LicenseUrl"),
    }


def download(url: str, target: Path) -> Path:
    if target.exists():
        return target
    target.write_bytes(open_url(url, 120))
    return target


def cut_out(photo: Image.Image, session) -> tuple[Image.Image, list[str]]:
    from rembg import remove

    photo.thumbnail((2400, 2400))  # plenty for 800 by 600 and keeps the model fast
    cut = remove(photo, session=session).convert("RGBA")
    alpha = cut.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0)
    kept, census = largest_region(alpha)
    notes = inspect_cutout(alpha, census)
    cut.putalpha(kept.filter(ImageFilter.GaussianBlur(1.2)))
    return cut, notes


def inspect_cutout(alpha: Image.Image, census: list[int]) -> list[str]:
    """
    What might be wrong with a photograph, as notes for whoever looks at the card.

    Nothing here refuses a render. These are triage: on the set as it stood when this was
    written they caught three of the eight bad cards that a person found by eye, so a clean
    report is not a promise that the picture is right. Look at the card.

    The bands come from measuring all the sources in sources.csv at the time: the subject
    filled 46.5% of the photograph on average, with a standard deviation of 11 points.
    """
    import numpy as np

    mask = np.array(alpha) > 0
    if not mask.any():
        return ["nothing was found in the photograph"]
    notes: list[str] = []
    columns = np.where(mask.any(axis=0))[0]
    width = mask.shape[1]
    if columns[0] <= 2 or columns[-1] >= width - 3:
        side = "left" if columns[0] <= 2 else "right"
        notes.append(f"runs off the {side} edge of the photograph, so the car may be cut off")
    if len(census) > 1 and census[1] >= census[0] * SECOND_REGION_WARN:
        share = census[1] / census[0]
        notes.append(
            f"a second object is {share:.0%} the size of the car; it is only dropped "
            "if it does not touch the car"
        )
    fill = mask.mean()
    if not FILL_BAND[0] <= fill <= FILL_BAND[1]:
        low, high = FILL_BAND
        notes.append(
            f"fills {fill:.0%} of the photograph, outside the usual {low:.0%} to {high:.0%}"
        )
    return notes


def largest_region(mask: Image.Image) -> tuple[Image.Image, list[int]]:
    """
    Keeps the biggest connected blob of the cutout, dropping fragments of nearby cars.

    Also returns the sizes of every blob it found, biggest first, so a caller can say when a
    second object was nearly as big as the car. That census is taken before the MaxFilter
    below, which grows the kept blob by about four pixels of the downscaled grid and can pull
    a close fragment back in.

    A neighbouring car that *touches* the car shares its blob and cannot be dropped here at
    all; that is a photograph to replace, not a mask to fix.
    """
    import numpy as np
    from collections import deque

    scale = 4
    small = mask.resize((max(1, mask.width // scale), max(1, mask.height // scale)), Image.Resampling.NEAREST)
    grid = np.array(small) > 0
    h, w = grid.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes: dict[int, int] = {}
    label = 0
    for y in range(h):
        for x in range(w):
            if not grid[y, x] or labels[y, x]:
                continue
            label += 1
            queue = deque([(y, x)])
            labels[y, x] = label
            count = 0
            while queue:
                cy, cx = queue.popleft()
                count += 1
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and grid[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        queue.append((ny, nx))
            sizes[label] = count
    if not sizes:
        return mask, []
    census = sorted(sizes.values(), reverse=True)
    keep = max(sizes, key=sizes.get)
    kept = Image.fromarray((labels == keep).astype(np.uint8) * 255).resize(mask.size, Image.Resampling.NEAREST)
    kept = kept.filter(ImageFilter.MaxFilter(scale * 2 + 1))
    return ImageChops.multiply(mask, kept), census


def stylize(car: Image.Image) -> Image.Image:
    """Posterize the car and multiply in a line layer, keeping its alpha."""
    alpha = car.getchannel("A")
    rgb = car.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(SATURATION)
    rgb = ImageEnhance.Brightness(rgb).enhance(BRIGHTNESS)
    poster = rgb.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT).convert("RGB")
    edges = rgb.convert("L").filter(ImageFilter.GaussianBlur(1)).filter(ImageFilter.FIND_EDGES)
    lines = ImageOps.invert(edges.point(lambda v: 255 if v > EDGE_THRESHOLD else 0))
    lined = ImageChops.multiply(poster, Image.merge("RGB", (lines, lines, lines)))
    result = Image.blend(poster, lined, EDGE_OPACITY)
    result.putalpha(alpha)
    return result


def compose(car: Image.Image, flip: bool) -> Image.Image:
    bbox = car.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit("the cutout is empty")
    car = car.crop(bbox)
    if flip:
        car = ImageOps.mirror(car)
    car_w, car_h = car.size
    width = car_w / FILL
    height = width * 3 / 4
    if car_h > height * 0.7:  # tall shapes such as trucks: fit by height instead
        height = car_h / 0.7
        width = height * 4 / 3
    width, height = int(width), int(height)
    canvas = Image.new("RGB", (width, height), BACKDROP)

    x = (width - car_w) // 2
    y = int(height * BASELINE) - car_h
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        (x + car_w * 0.08, y + car_h * 0.86, x + car_w * 0.92, y + car_h * 1.06),
        fill=(40, 30, 20, SHADOW_ALPHA),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(stylize(car), (x, y))
    return canvas.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)


def save_webp(image: Image.Image, target: Path) -> int:
    quality = START_QUALITY
    while True:
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=quality, method=6)
        if buffer.tell() <= MAX_BYTES or quality <= 40:
            target.write_bytes(buffer.getvalue())
            return buffer.tell()
        quality -= 6


def credit_name(raw: str) -> str:
    """The photographer's name from an Artist field that may carry a whole paragraph."""
    text = re.sub(r"\S+@\S+", "", raw)
    text = re.sub(
        r"^(?:this (?:picture|photo|image) (?:has been|was) taken by|photo(?:graph)? by|by)\s+",
        "",
        text,
        flags=re.I,
    )
    first = re.split(r"[.\n]", text, maxsplit=1)[0].strip(" ,;")
    return (first or raw.strip())[:60]


def write_credits(credits: dict[str, dict], names: dict[str, str]) -> None:
    lines = [
        "# Card art credits",
        "",
        "Each illustration is the owner's own or is derived from a photograph on Wikimedia Commons,",
        "processed into the card style. The photograph-derived illustrations are published under",
        "CC BY-SA 4.0, and each source photograph's own license is listed. Thank you to the",
        "photographers.",
        "",
        "| Car id | Car | Photograph | Author | License |",
        "| --- | --- | --- | --- | --- |",
    ]
    for car_id in sorted(credits):
        if not (OUT / f"{car_id}.webp").exists():
            continue
        c = credits[car_id]
        if c.get("owner"):
            lines.append(f"| {car_id} | {names.get(car_id, car_id)} | Owner illustration | | |")
            continue
        author = credit_name(c["author"])
        license_cell = f"[{c['license']}]({c['licenseUrl']})" if c["licenseUrl"] else c["license"]
        lines.append(
            f"| {car_id} | {names.get(car_id, car_id)} | [{c['title'].removeprefix('File:')}]({c['page']}) "
            f"| {author} | {license_cell} |"
        )
    # newline="\n" so a rerun that changes nothing leaves no diff: git stores LF, and letting
    # Python translate to CRLF on Windows marks the file modified every time it is written.
    (OUT / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def main(argv: list[str]) -> None:
    from rembg import new_session

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    # --out sends the cards somewhere else and leaves the credits alone, so a candidate
    # photograph can be tried without touching the repo. import_art.py has the same escape.
    out_dir = OUT
    check_run = False
    only: list[str] = []
    rest = list(argv)
    while rest:
        item = rest.pop(0)
        if item == "--out":
            if not rest:
                raise SystemExit("--out needs a directory")
            out_dir = Path(rest.pop(0))
            check_run = True
        elif item.startswith("-"):
            raise SystemExit(f"unknown option: {item}")
        else:
            only.append(item)
    out_dir.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    names = car_names()
    credits: dict[str, dict] = (
        json.loads(CREDITS_DATA.read_text(encoding="utf-8")) if CREDITS_DATA.exists() else {}
    )
    with SOURCES.open(encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("carId")]
    if only:
        rows = [row for row in rows if row["carId"] in only]
    if not rows:
        raise SystemExit("nothing to do: no matching rows in sources.csv")

    session = new_session("u2net")
    flagged: list[str] = []
    for row in rows:
        car_id = row["carId"].strip()
        if car_id not in names:
            raise SystemExit(f"{car_id}: not a car id in cars.ts")
        if credits.get(car_id, {}).get("owner"):
            print(f"{car_id}: owner illustration kept")
            continue
        info = commons_info(row["commonsFile"].strip())
        suffix = Path(urllib.parse.urlparse(info["url"]).path).suffix or ".jpg"
        stamp = hashlib.sha1(info["title"].encode("utf-8")).hexdigest()[:8]
        photo_path = download(info["url"], CACHE / f"{car_id}-{stamp}{suffix}")
        with Image.open(photo_path) as photo:
            photo = ImageOps.exif_transpose(photo).convert("RGB")
            cut, notes = cut_out(photo, session)
        image = compose(cut, row.get("flip", "").strip().lower() == "y")
        size = save_webp(image, out_dir / f"{car_id}.webp")
        print(f"{car_id}: {size:,} bytes, {info['license']}, {info['author']}")
        for note in notes:
            print(f"  look at this one: {note}")
            flagged.append(car_id)
        time.sleep(1)  # every run asks Commons for the metadata, check runs included
        if check_run:
            continue
        credits[car_id] = info
        CREDITS_DATA.write_text(json.dumps(credits, indent=2), encoding="utf-8", newline="\n")

    if check_run:
        print(f"check run: cards written to {out_dir}, credits left alone")
    else:
        CREDITS_DATA.write_text(json.dumps(credits, indent=2), encoding="utf-8", newline="\n")
        write_credits(credits, names)
        print(f"credits: {OUT / 'CREDITS.md'}")
    if flagged:
        print(f"worth a look: {', '.join(sorted(set(flagged)))}")


if __name__ == "__main__":
    main(sys.argv[1:])
