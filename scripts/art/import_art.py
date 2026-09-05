"""Pink Slips card art import.

Turns the owner's own car illustrations into card art. Each PNG in game-images/cars, named by
car id, is cut out of its background, given the same print look as the rest of the set, put on
the cream backdrop, and saved as an 800 by 600 WebP under 60 KB in public/art, credited as an
owner illustration. Run from the repo root with the art venv:

    scripts/art/.venv/Scripts/python scripts/art/import_art.py                      # every file in the folder
    scripts/art/.venv/Scripts/python scripts/art/import_art.py ford-mustang-mach-1   # just some
    scripts/art/.venv/Scripts/python scripts/art/import_art.py --flip ford-shelby-gt500-2020

Cards face right; list an id after --flip when its picture faces left. --dir reads from another
folder and --out writes elsewhere, for a check that leaves the repo alone.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

from make_art import (
    BACKDROP,
    CREDITS_DATA,
    OUT,
    ROOT,
    car_names,
    compose,
    cut_out,
    save_webp,
    write_credits,
)

SOURCES_DIR = ROOT / "game-images" / "cars"


def flatten(picture: Image.Image) -> Image.Image:
    """An opaque RGB picture: transparent areas become the card cream before the cut-out."""
    picture = ImageOps.exif_transpose(picture)
    if picture.mode in ("RGBA", "LA") or "transparency" in picture.info:
        rgba = picture.convert("RGBA")
        flat = Image.new("RGB", rgba.size, BACKDROP)
        flat.paste(rgba, mask=rgba.getchannel("A"))
        return flat
    return picture.convert("RGB")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description="Import the owner's car illustrations.")
    parser.add_argument("ids", nargs="*", help="car ids to import; default is every PNG in the folder")
    parser.add_argument("--flip", nargs="*", default=[], help="ids whose picture faces left")
    parser.add_argument("--dir", default=str(SOURCES_DIR), help="folder of <id>.png files")
    parser.add_argument("--out", default=str(OUT), help="where the WebP files go")
    args = parser.parse_args(argv)

    from rembg import new_session

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    names = car_names()
    source = Path(args.dir)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    files = [source / f"{car_id}.png" for car_id in args.ids] or sorted(source.glob("*.png"))
    if not files:
        raise SystemExit(f"nothing to do: no PNG files in {source}")
    for path in files:
        if path.stem not in names:
            raise SystemExit(f"{path.stem}: not a car id in cars.ts")
        if not path.exists():
            raise SystemExit(f"{path}: no such file")

    credits: dict[str, dict] = (
        json.loads(CREDITS_DATA.read_text(encoding="utf-8")) if CREDITS_DATA.exists() else {}
    )
    flip = set(args.flip)
    session = new_session("u2net")
    for path in files:
        car_id = path.stem
        with Image.open(path) as picture:
            cut = cut_out(flatten(picture), session)
        image = compose(cut, car_id in flip)
        size = save_webp(image, out / f"{car_id}.webp")
        credits[car_id] = {"owner": True}
        print(f"{car_id}: {size:,} bytes, owner illustration")

    if out.resolve() == OUT.resolve():
        CREDITS_DATA.write_text(json.dumps(credits, indent=2), encoding="utf-8")
        write_credits(credits, names)
        print(f"credits: {OUT / 'CREDITS.md'}")
    else:
        print("check run: credits left alone")


if __name__ == "__main__":
    main(sys.argv[1:])
