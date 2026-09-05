"""Pink Slips owner artwork import.

Encodes the owner's artwork from game-images/ into the sizes and budgets the game expects
(DESIGN.md 8, Owner artwork), writes a credits note beside each output folder, and rewrites
src/ui/assets.ts, the list of what is present, so the game switches each piece on only when
its file exists. Run from the repo root with the art venv:

    scripts/art/.venv/Scripts/python scripts/art/import_assets.py --kind mods          # every file in the folder
    scripts/art/.venv/Scripts/python scripts/art/import_assets.py --kind frames sports back
    scripts/art/.venv/Scripts/python scripts/art/import_assets.py --kind backgrounds collection track
    scripts/art/.venv/Scripts/python scripts/art/import_assets.py --kind icons

Kinds: mods (fitted whole into 640 by 360, padded with the picture's own edge colour, one per mod id), frames (512 square tiles: the six
car types, mod-part, mod-boost, mod-sabotage, back), backgrounds (screens as drawn, track as a
strip), icons (128 square with transparency). --dir and --out point elsewhere for a check that
leaves the repo alone.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
BACKDROP = (0xF3, 0xE7, 0xC9)
TYPES = ["sports", "luxury", "muscle", "jdm", "ev", "offroad"]
FAMILIES = ["part", "boost", "sabotage"]
SCREENS = ["collection", "builder", "online", "profile", "result"]
ICON_NAMES = (
    [f"type-{t}" for t in TYPES]
    + [f"family-{f}" for f in FAMILIES]
    + ["fuel", "wear", "pink-slip", "pack"]
)
ASSETS_TS = ROOT / "src" / "ui" / "assets.ts"


def mod_ids() -> dict[str, str]:
    text = (ROOT / "src" / "data" / "mods.ts").read_text(encoding="utf-8")
    pairs = re.findall(r"id: '([a-z0-9-]+)',\s*name: (?:'([^']*)'|\"([^\"]*)\")", text)
    return {mod_id: single or double for mod_id, single, double in pairs}


KINDS = {
    "mods": {
        "source": ROOT / "game-images" / "mods",
        "out": ROOT / "public" / "art" / "mods",
        "size": (640, 360),
        "budget": 30_000,
        "fit": "contain-pad",
        "alpha": False,
        "names": lambda: set(mod_ids()),
        "title": "Mod card illustration credits",
        "where": lambda name: f"The {mod_ids().get(name, name)} card",
    },
    "frames": {
        "source": ROOT / "game-images" / "frames",
        "out": ROOT / "public" / "frames",
        "size": (512, 512),
        "budget": 60_000,
        "fit": "cover",
        "alpha": False,
        "names": lambda: set(TYPES) | {f"mod-{f}" for f in FAMILIES} | {"back"},
        "title": "Card frame credits",
        "where": lambda name: (
            "The card back"
            if name == "back"
            else f"Mod card frame, {name.removeprefix('mod-')}"
            if name.startswith("mod-")
            else f"Frame of {name} cars"
        ),
    },
    "backgrounds": {
        "source": ROOT / "game-images" / "game-background",
        "out": ROOT / "public" / "backgrounds",
        "size": None,
        "budget": 250_000,
        "fit": "keep",
        "alpha": False,
        "names": lambda: set(SCREENS) | {"track"} | {f"start-screen{n}" for n in ["", *map(str, range(1, 10))]},
        "title": "Background credits",
        "where": lambda name: (
            "The track lanes"
            if name == "track"
            else "The start screen"
            if name.startswith("start-screen")
            else f"The {name} screen"
        ),
    },
    "icons": {
        "source": ROOT / "game-images" / "icons",
        "out": ROOT / "public" / "icons",
        "size": (128, 128),
        "budget": 8_000,
        "fit": "contain",
        "alpha": True,
        "names": lambda: set(ICON_NAMES),
        "title": "Icon and token credits",
        "where": lambda name: {
            "fuel": "Fuel tokens on car cards",
            "wear": "Wear marks on car cards",
            "pink-slip": "The pink slip badge",
            "pack": "The pack pop-up",
        }.get(
            name,
            f"Type badge, {name.removeprefix('type-')}"
            if name.startswith("type-")
            else f"Family mark, {name.removeprefix('family-')}",
        ),
    },
}


def flatten(picture: Image.Image) -> Image.Image:
    picture = ImageOps.exif_transpose(picture)
    if picture.mode in ("RGBA", "LA") or "transparency" in picture.info:
        rgba = picture.convert("RGBA")
        flat = Image.new("RGB", rgba.size, BACKDROP)
        flat.paste(rgba, mask=rgba.getchannel("A"))
        return flat
    return picture.convert("RGB")


def edge_colour(picture: Image.Image) -> tuple[int, int, int]:
    """The mean colour around the picture's outer edge, so padding vanishes into it."""
    w, h = picture.size
    step = max(1, min(w, h) // 40)
    samples = [picture.getpixel((x, y)) for x in range(0, w, step) for y in (0, h - 1)]
    samples += [picture.getpixel((x, y)) for y in range(0, h, step) for x in (0, w - 1)]
    return tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))  # type: ignore[return-value]


def fit(picture: Image.Image, spec: dict) -> Image.Image:
    size = spec["size"]
    if spec["fit"] == "keep":
        return flatten(picture)
    if spec["fit"] == "contain-pad":
        # The whole picture, centred; the bars beside it continue its own edges, stretched and
        # softened, so a gradient or a scene runs on instead of stopping at a flat band.
        flat = flatten(picture)
        canvas = Image.new("RGB", size, edge_colour(flat))
        flat.thumbnail(size, Image.Resampling.LANCZOS)
        x = (size[0] - flat.width) // 2
        y = (size[1] - flat.height) // 2
        sliver = max(4, flat.width // 32)
        if x > 0:
            left = flat.crop((0, 0, sliver, flat.height)).resize((x, flat.height))
            right = flat.crop((flat.width - sliver, 0, flat.width, flat.height)).resize(
                (size[0] - x - flat.width, flat.height)
            )
            canvas.paste(left.filter(ImageFilter.GaussianBlur(6)), (0, y))
            canvas.paste(right.filter(ImageFilter.GaussianBlur(6)), (x + flat.width, y))
        if y > 0:
            top = flat.crop((0, 0, flat.width, sliver)).resize((flat.width, y))
            bottom = flat.crop((0, flat.height - sliver, flat.width, flat.height)).resize(
                (flat.width, size[1] - y - flat.height)
            )
            canvas.paste(top.filter(ImageFilter.GaussianBlur(6)), (x, 0))
            canvas.paste(bottom.filter(ImageFilter.GaussianBlur(6)), (x, y + flat.height))
        canvas.paste(flat, (x, y))
        return canvas
    if spec["fit"] == "contain":
        rgba = ImageOps.exif_transpose(picture).convert("RGBA")
        rgba.thumbnail(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        canvas.alpha_composite(rgba, ((size[0] - rgba.width) // 2, (size[1] - rgba.height) // 2))
        return canvas
    return ImageOps.fit(flatten(picture), size, Image.Resampling.LANCZOS)


def save_webp(image: Image.Image, target: Path, budget: int) -> int:
    quality = 82
    while True:
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=quality, method=6)
        if buffer.tell() <= budget or quality <= 40:
            target.write_bytes(buffer.getvalue())
            return buffer.tell()
        quality -= 6


def write_credits(kind: str, spec: dict, out: Path) -> None:
    files = sorted(p.name for p in out.glob("*.webp"))
    folder = spec["source"].relative_to(ROOT).as_posix()
    lines = [
        f"# {spec['title']}",
        "",
        "The artwork in this folder was supplied by the owner for Pink Slips and is part of this",
        f"repository under its terms. The sources are the PNG files in `{folder}/`;",
        f"`scripts/art/import_assets.py --kind {kind}` produces these WebP copies.",
        "",
        "| File | Where it shows |",
        "| --- | --- |",
    ]
    for name in files:
        lines.append(f"| {name} | {spec['where'](name.removesuffix('.webp'))} |")
    (out / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def write_assets_ts() -> None:
    def names(folder: Path) -> list[str]:
        return sorted(p.stem for p in folder.glob("*.webp")) if folder.exists() else []

    def const(name: str, items: list[str]) -> str:
        # The shape the formatter would choose: one line while it fits, else one item per line.
        joined = ", ".join(f"'{item}'" for item in items)
        one_line = f"export const {name}: readonly string[] = [{joined}]\n"
        if len(one_line) <= 101:
            return one_line
        body = "".join(f"  '{item}',\n" for item in items)
        return f"export const {name}: readonly string[] = [\n{body}]\n"

    text = (
        "/**\n"
        " * Owner artwork present under public/, by kind (DESIGN.md 8, Owner artwork). Written by\n"
        " * scripts/art/import_assets.py after every import; do not edit by hand. An empty list means\n"
        " * the game draws that piece itself.\n"
        " */\n"
        + const("ART_MODS", names(KINDS["mods"]["out"]))
        + const("FRAMES", names(KINDS["frames"]["out"]))
        + const("BACKDROPS", names(KINDS["backgrounds"]["out"]))
        + const("ICONS", names(KINDS["icons"]["out"]))
    )
    ASSETS_TS.write_text(text, encoding="utf-8", newline="\n")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description="Import the owner's artwork.")
    parser.add_argument("--kind", required=True, choices=sorted(KINDS))
    parser.add_argument("names", nargs="*", help="asset names to import; default is every PNG in the folder")
    parser.add_argument("--dir", help="read from another folder")
    parser.add_argument("--out", help="write elsewhere, for a check that leaves the repo alone")
    args = parser.parse_args(argv)

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    spec = KINDS[args.kind]
    source = Path(args.dir) if args.dir else spec["source"]
    out = Path(args.out) if args.out else spec["out"]
    allowed = spec["names"]()
    files = [source / f"{name}.png" for name in args.names] or sorted(source.glob("*.png"))
    if not files:
        raise SystemExit(f"nothing to do: no PNG files in {source}")
    for path in files:
        if path.stem not in allowed:
            raise SystemExit(f"{path.stem}: not a {args.kind} name the game knows")
        if not path.exists():
            raise SystemExit(f"{path}: no such file")

    out.mkdir(parents=True, exist_ok=True)
    for path in files:
        budget = 40_000 if (args.kind == "backgrounds" and path.stem == "track") else spec["budget"]
        with Image.open(path) as picture:
            image = fit(picture, spec)
        size = save_webp(image, out / f"{path.stem}.webp", budget)
        flag = "" if size <= budget else " (over budget even at the lowest quality)"
        print(f"{path.stem}: {size:,} bytes{flag}")

    if out.resolve() == spec["out"].resolve():
        write_credits(args.kind, spec, out)
        write_assets_ts()
        print(f"credits: {out / 'CREDITS.md'}; assets list: {ASSETS_TS.relative_to(ROOT)}")
    else:
        print("check run: credits and the assets list left alone")


if __name__ == "__main__":
    main(sys.argv[1:])
