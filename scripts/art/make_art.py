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

Inputs: scripts/art/sources.csv with columns carId, commonsFile, flip. commonsFile is the Commons
file title, for example "File:2021 Ford F-150 Raptor.jpg". flip is y when the car faces left.
Only CC0, public domain, CC BY, and CC BY-SA photographs are accepted.
"""

from __future__ import annotations

import csv
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
    for attempt in range(5):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return res.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))
    raise SystemExit("unreachable")


def fetch_json(params: dict[str, str]) -> dict:
    url = API + "?" + urllib.parse.urlencode({"format": "json", **params})
    return json.loads(open_url(url, 60))


def strip_tags(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def commons_info(title: str) -> dict[str, str]:
    """Original file URL and credit fields for one Commons file title."""
    data = fetch_json(
        {"action": "query", "prop": "imageinfo", "titles": title, "iiprop": "url|extmetadata"}
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
        "url": info["url"],
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


def cut_out(photo: Image.Image, session) -> Image.Image:
    from rembg import remove

    photo.thumbnail((2400, 2400))  # plenty for 800 by 600 and keeps the model fast
    cut = remove(photo, session=session).convert("RGBA")
    alpha = cut.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0)
    cut.putalpha(alpha.filter(ImageFilter.GaussianBlur(1.2)))
    return cut


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


def write_credits(credits: dict[str, dict[str, str]], names: dict[str, str]) -> None:
    lines = [
        "# Card art credits",
        "",
        "Each illustration is derived from a photograph on Wikimedia Commons, processed into the",
        "card style. The illustrations are published under CC BY-SA 4.0; each source photograph's",
        "own license is listed. Thank you to the photographers.",
        "",
        "| Car id | Car | Photograph | Author | License |",
        "| --- | --- | --- | --- | --- |",
    ]
    for car_id in sorted(credits):
        if not (OUT / f"{car_id}.webp").exists():
            continue
        c = credits[car_id]
        license_cell = f"[{c['license']}]({c['licenseUrl']})" if c["licenseUrl"] else c["license"]
        lines.append(
            f"| {car_id} | {names.get(car_id, car_id)} | [{c['title'].removeprefix('File:')}]({c['page']}) "
            f"| {c['author']} | {license_cell} |"
        )
    (OUT / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(only: list[str]) -> None:
    from rembg import new_session

    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    names = car_names()
    credits: dict[str, dict[str, str]] = (
        json.loads(CREDITS_DATA.read_text(encoding="utf-8")) if CREDITS_DATA.exists() else {}
    )
    with SOURCES.open(encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("carId")]
    if only:
        rows = [row for row in rows if row["carId"] in only]
    if not rows:
        raise SystemExit("nothing to do: no matching rows in sources.csv")

    session = new_session("u2net")
    for row in rows:
        car_id = row["carId"].strip()
        if car_id not in names:
            raise SystemExit(f"{car_id}: not a car id in cars.ts")
        info = commons_info(row["commonsFile"].strip())
        suffix = Path(urllib.parse.urlparse(info["url"]).path).suffix or ".jpg"
        photo_path = download(info["url"], CACHE / f"{car_id}{suffix}")
        with Image.open(photo_path) as photo:
            photo = ImageOps.exif_transpose(photo).convert("RGB")
            cut = cut_out(photo, session)
        image = compose(cut, row.get("flip", "").strip().lower() == "y")
        size = save_webp(image, OUT / f"{car_id}.webp")
        credits[car_id] = info
        print(f"{car_id}: {size:,} bytes, {info['license']}, {info['author']}")

    CREDITS_DATA.write_text(json.dumps(credits, indent=2), encoding="utf-8")
    write_credits(credits, names)
    print(f"credits: {OUT / 'CREDITS.md'}")


if __name__ == "__main__":
    main(sys.argv[1:])
