"""Encodes a background from game-images/game-background/ to WebP in public/backgrounds/.

Run with the art venv's Python from the repo root:

    scripts/art/.venv/Scripts/python.exe scripts/art/encode_background.py start-screen2

The pixel size is kept; quality 82 lands well under a quarter of a megabyte for these scenes.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "game-images" / "game-background"
TARGET = ROOT / "public" / "backgrounds"


def main(names: list[str]) -> int:
    if not names:
        print("Name the backgrounds to encode, without extension.")
        return 1
    TARGET.mkdir(parents=True, exist_ok=True)
    for name in names:
        source = SOURCE / f"{name}.png"
        if not source.exists():
            print(f"Missing {source}")
            return 1
        out = TARGET / f"{name}.webp"
        with Image.open(source) as image:
            image.convert("RGB").save(out, "WEBP", quality=82, method=6)
        print(f"{source.name} -> {out.relative_to(ROOT)} ({out.stat().st_size / 1e3:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
