"""Pink Slips sound effects encoder.

Encodes the owner's effect recordings, one WAV per effect name in music/effects/, to MP3 in
public/audio/effects/: mono, leading and trailing silence trimmed, peak-normalised to -3 dBFS,
cut to the effect's length with a short fade, at about 96 kbps and under 64 KB each. Writes the
credits note beside the files and src/ui/sound/effectFiles.ts, the list of what is present, so
the game plays a recording where one exists and its own synthesized effect where none does.
Run with the art venv's Python from the repo root:

    scripts/art/.venv/Scripts/python.exe scripts/audio/encode_effects.py            # every WAV in the folder
    scripts/art/.venv/Scripts/python.exe scripts/audio/encode_effects.py stage fuel  # just some

--dir and --out point elsewhere for a check that leaves the repo alone. The MP3 is written fresh
from samples, so nothing embedded in a source file carries over.
"""

from __future__ import annotations

import argparse
import io
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "music" / "effects"
TARGET = ROOT / "public" / "audio" / "effects"
LIST_TS = ROOT / "src" / "ui" / "sound" / "effectFiles.ts"
PEAK = 10 ** (-3 / 20)  # -3 dBFS
SILENCE = 10 ** (-60 / 20)  # trim below this
BUDGET = 64_000

# Longest each effect may run, in seconds, and where it plays, for the credits note.
EFFECTS: dict[str, tuple[float, str]] = {
    "stage": (0.6, "Staging a car"),
    "fuel": (0.6, "Placing a fuel token"),
    "advance": (1.5, "A car's advance; pitch and level follow the distance"),
    "stall": (1.0, "An advance that cannot be made"),
    "boost": (1.0, "Playing a Boost"),
    "part": (0.6, "Fitting a Part"),
    "sabotage": (1.0, "Playing a Sabotage"),
    "deflect": (0.6, "A Sabotage that does not take"),
    "coin": (1.5, "A coin flip"),
    "raceEnd": (2.0, "A race ending"),
    "matchEnd": (4.0, "A match ending"),
    "shuffle": (0.6, "A draw or a reshuffle"),
    "yourTurn": (0.6, "The player's own turn beginning"),
    "sparkle": (1.0, "A pack reveal"),
    "shimmer": (1.0, "A rare pull in a pack"),
}


def prepare(path: Path, name: str) -> tuple[np.ndarray, int]:
    data, rate = sf.read(path, dtype="float32", always_2d=True)
    mono = data.mean(axis=1)
    loud = np.where(np.abs(mono) > SILENCE)[0]
    if loud.size:
        start = max(0, int(loud[0]) - int(0.005 * rate))
        end = min(mono.size, int(loud[-1]) + int(0.02 * rate))
        mono = mono[start:end]
    longest = int(EFFECTS[name][0] * rate)
    if mono.size > longest:
        mono = mono[:longest]
    fade = min(mono.size, int(0.02 * rate))
    if fade > 0:
        mono[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    if peak > 0:
        mono = mono * (PEAK / peak)
    return mono, rate


def write_mp3(mono: np.ndarray, rate: int, out: Path) -> int:
    # Higher compression levels mean lower bitrates; step down until the file fits the budget.
    for level in (0.7, 0.8, 0.9, 1.0):
        buffer = io.BytesIO()
        sf.write(buffer, mono, rate, format="MP3", compression_level=level)
        if buffer.tell() <= BUDGET or level == 1.0:
            out.write_bytes(buffer.getvalue())
            return buffer.tell()
    raise AssertionError("unreachable")


def write_credits(out: Path) -> None:
    files = sorted(p.name for p in out.glob("*.mp3"))
    lines = [
        "# Sound effect credits",
        "",
        "The effects in this folder were made by the owner for Pink Slips and are part of this",
        "repository under its terms. The originals are WAV files kept by the owner outside the",
        "repository; `scripts/audio/encode_effects.py` produces these MP3 copies. An effect with no",
        "file here is synthesized by the game itself.",
        "",
        "| File | Where it plays |",
        "| --- | --- |",
    ]
    for name in files:
        lines.append(f"| {name} | {EFFECTS[name.removesuffix('.mp3')][1]} |")
    (out / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def write_list() -> None:
    names = sorted(p.stem for p in TARGET.glob("*.mp3")) if TARGET.exists() else []
    joined = ", ".join(f"'{n}'" for n in names)
    one_line = f"export const EFFECT_FILES: readonly string[] = [{joined}]\n"
    if len(one_line) > 101:
        one_line = "export const EFFECT_FILES: readonly string[] = [\n" + "".join(f"  '{n}',\n" for n in names) + "]\n"
    version = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    text = (
        "/**\n"
        " * Owner-made effects present under public/audio/effects, written by\n"
        " * scripts/audio/encode_effects.py after every encode; do not edit by hand. An effect that is\n"
        " * not listed is synthesized by the game (DESIGN.md 8, Sound).\n"
        " */\n"
        + one_line
        + "/** Bumped by every encode, so browsers fetch changed files under the same names. */\n"
        + f"export const EFFECTS_VERSION = '{version}'\n"
    )
    LIST_TS.write_text(text, encoding="utf-8", newline="\n")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Encode the owner's sound effects.")
    parser.add_argument("names", nargs="*", help="effect names to encode; default is every WAV in the folder")
    parser.add_argument("--dir", help="read from another folder")
    parser.add_argument("--out", help="write elsewhere, for a check that leaves the repo alone")
    args = parser.parse_args(argv)
    if "MP3" not in sf.available_formats():
        print("This libsndfile build cannot write MP3; install a newer soundfile wheel.")
        return 1
    source = Path(args.dir) if args.dir else SOURCE
    out = Path(args.out) if args.out else TARGET
    wanted = [source / f"{n}.wav" for n in args.names] or sorted(source.glob("*.wav"))
    if not wanted:
        print(f"No WAV files in {source}")
        return 1
    for path in wanted:
        if path.stem not in EFFECTS:
            print(f"{path.stem}: not an effect the game knows")
            return 1
        if not path.exists():
            print(f"Missing {path}")
            return 1
    out.mkdir(parents=True, exist_ok=True)
    for path in wanted:
        mono, rate = prepare(path, path.stem)
        size = write_mp3(mono, rate, out / f"{path.stem}.mp3")
        flag = "" if size <= BUDGET else " (over budget even at the lowest bitrate)"
        print(f"{path.stem}: {mono.size / rate:.2f}s, {size:,} bytes{flag}")
    if out.resolve() == TARGET.resolve():
        write_credits(out)
        write_list()
        print(f"credits: {out / 'CREDITS.md'}; list: {LIST_TS.relative_to(ROOT)}")
    else:
        print("check run: credits and the list left alone")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
