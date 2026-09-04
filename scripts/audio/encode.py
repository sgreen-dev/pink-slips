"""Encodes the music originals in music/ to MP3 in public/audio/.

Run with the art venv's Python from the repo root:

    scripts/art/.venv/Scripts/python.exe scripts/audio/encode.py [name ...]

Each WAV is peak-normalised to -1 dBFS and written at about 128 kbps. With no names every
track in music/ is encoded; with names only those. Needs the soundfile package, whose
bundled libsndfile encodes MP3.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "music"
TARGET = ROOT / "public" / "audio"
PEAK = 10 ** (-1 / 20)  # -1 dBFS


def encode(path: Path) -> Path:
    data, rate = sf.read(path, dtype="float32", always_2d=True)
    peak = float(np.max(np.abs(data))) or 1.0
    data = data * (PEAK / peak)
    out = TARGET / f"{path.stem}.mp3"
    # compression_level 0.5 lands near 128 kbps for the bundled LAME build.
    sf.write(out, data, rate, format="MP3", compression_level=0.5)
    return out


def main(names: list[str]) -> int:
    if "MP3" not in sf.available_formats():
        print("This libsndfile build cannot write MP3; install a newer soundfile wheel.")
        return 1
    TARGET.mkdir(parents=True, exist_ok=True)
    wanted = [SOURCE / f"{n}.wav" for n in names] if names else sorted(SOURCE.glob("*.wav"))
    if not wanted:
        print(f"No WAV files in {SOURCE}")
        return 1
    for path in wanted:
        if not path.exists():
            print(f"Missing {path}")
            return 1
        out = encode(path)
        seconds = sf.info(path).duration
        print(f"{path.name} -> {out.relative_to(ROOT)} ({seconds:.0f}s, {out.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
