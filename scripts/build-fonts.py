#!/usr/bin/env python3
"""
Build the bundled web faces and the @font-face block that declares them.

The app ships one typeface and no network calls, so the faces live in the
repository. Everything on screen is set in Martian Mono: the question, the
prose, the notation. It is a terminal face, and the game is about machines.

Martian Mono has no Greek, no arrows and no mathematical operators, which is
most of what the formal layer draws: δ, ε, Σ, Γ, →, ∈, ⊢. Left alone, every one
of those would fall back to whatever monospace the system has, mid-formula. So
JetBrains Mono is cut down to exactly the codepoints Martian Mono lacks and
declared under the same family name. The browser takes each character from
whichever face covers it, and the two ranges never overlap.

Two adjustments make them read as one face rather than two:

- Martian Mono is a variable font with a width axis whose default, 112.5, is
  very wide. It is pinned at 100, the width the Chamber prototype was approved
  in, where a character is 700 units across.
- JetBrains Mono's x-height is 550 units against Martian Mono's 600, so its
  faces carry size-adjust: 109%. That lands its Greek on the same x-height,
  and about 654 units across, close enough that δ(q0, a) is one line of type.

Each face is cut from the vendor's release down to the ranges the app can put
on screen, which is wider than the app's own copy because a player may rename
a state to anything they can type. The unicode-range in the emitted CSS is read
back out of the cut file's cmap, so the declaration cannot drift from the bytes.

    python3 scripts/build-fonts.py [--vendor DIR]

DIR defaults to node_modules, and needs @fontsource-variable/martian-mono and
jetbrains-mono. Neither is a dependency of the app: the cut files are
committed, and the vendor packages are only needed to cut them again.
"""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "src" / "fonts"
FAMILY = "Automata Mono"

# Latin, Latin-1, Latin Extended-A, the combining marks the formal layer uses,
# Greek, punctuation, super/subscripts, letterlike, arrows, mathematical
# operators, misc technical, control pictures, geometric shapes, check marks.
RANGES = [
    (0x0000, 0x00FF),
    (0x0100, 0x017F),
    (0x0300, 0x0304),
    (0x0308, 0x0308),
    (0x0370, 0x03FF),
    (0x2010, 0x2027),
    (0x2030, 0x205E),
    (0x2070, 0x209F),
    (0x20A0, 0x20BF),
    (0x2100, 0x214F),
    (0x2190, 0x21FF),
    (0x2200, 0x22FF),
    (0x2300, 0x23FF),
    (0x2400, 0x2426),
    (0x25A0, 0x25FF),
    (0x2713, 0x2718),
]
WANTED = {cp for lo, hi in RANGES for cp in range(lo, hi + 1)}

# Martian Mono, pinned to one width and limited to the weights the styles use.
MARTIAN_WIDTH = 100
MARTIAN_WEIGHTS = (300, 700)
MARTIAN = [
    ("@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2", "mono-latin.woff2"),
    ("@fontsource-variable/martian-mono/files/martian-mono-latin-ext-standard-normal.woff2", "mono-latin-ext.woff2"),
]

# JetBrains Mono, for whatever Martian Mono cannot draw.
SYMBOL_SIZE_ADJUST = "109%"
SYMBOLS = [
    ("jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2", "mono-symbols-400.woff2", "400"),
    ("jetbrains-mono/fonts/webfonts/JetBrainsMono-Medium.woff2", "mono-symbols-500.woff2", "500"),
    ("jetbrains-mono/fonts/webfonts/JetBrainsMono-Bold.woff2", "mono-symbols-700.woff2", "700"),
]

# Files earlier builds produced that nothing declares any more.
RETIRED = ["mono-400.woff2", "mono-500.woff2", "mono-700.woff2", "sans-latin.woff2", "sans-greek.woff2", "serif-latin.woff2"]


def covered(path: pathlib.Path) -> list[int]:
    font = TTFont(path, lazy=True)
    points: set[int] = set()
    for table in font["cmap"].tables:
        points |= set(table.cmap.keys())
    return sorted(points)


def to_range(points: list[int]) -> str:
    """Collapse a sorted codepoint list into CSS unicode-range syntax."""
    parts: list[str] = []
    start = prev = points[0]
    for point in points[1:]:
        if point == prev + 1:
            prev = point
            continue
        parts.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        start = prev = point
    parts.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
    return ", ".join(parts)


def subset(src: pathlib.Path, dst: pathlib.Path, points: set[int]) -> bool:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as listing:
        listing.write("\n".join(f"U+{cp:04X}" for cp in sorted(points)))
    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(src),
        f"--output-file={dst}",
        "--flavor=woff2",
        f"--unicodes-file={listing.name}",
        "--layout-features=kern,liga,calt",
        "--no-hinting",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    pathlib.Path(listing.name).unlink()
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        return False
    return True


def face(out: str, weight: str, extra: str = "") -> str:
    dst = OUT / out
    return (
        "@font-face {\n"
        f"  font-family: '{FAMILY}';\n"
        "  font-style: normal;\n"
        f"  font-weight: {weight};\n"
        "  font-display: block;\n"
        f"  src: url('./fonts/{out}') format('woff2');\n"
        f"{extra}"
        f"  unicode-range: {to_range(covered(dst))};\n"
        "}"
    )


def report(src: pathlib.Path, dst: pathlib.Path) -> int:
    size = dst.stat().st_size
    print(f"  {dst.name:<26} {src.stat().st_size / 1024:7.1f}KB -> {size / 1024:6.1f}KB")
    return size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vendor", default=str(ROOT / "node_modules"))
    args = parser.parse_args()
    vendor = pathlib.Path(args.vendor)

    for src, *_ in MARTIAN + SYMBOLS:
        if not (vendor / src).exists():
            print(f"missing {vendor / src}", file=sys.stderr)
            return 1

    OUT.mkdir(parents=True, exist_ok=True)
    faces: list[str] = []
    total = 0

    # Martian Mono: instance to one width, then cut.
    martian: set[int] = set()
    with tempfile.TemporaryDirectory() as tmp:
        for src_rel, out in MARTIAN:
            src = vendor / src_rel
            font = TTFont(src)
            pinned = instancer.instantiateVariableFont(font, {"wdth": MARTIAN_WIDTH, "wght": MARTIAN_WEIGHTS})
            staged = pathlib.Path(tmp) / (out + ".ttf")
            pinned.flavor = None
            pinned.save(staged)
            if not subset(staged, OUT / out, WANTED):
                return 1
            total += report(src, OUT / out)
            martian |= set(covered(OUT / out))
            faces.append(face(out, f"{MARTIAN_WEIGHTS[0]} {MARTIAN_WEIGHTS[1]}"))

    # JetBrains Mono: only what Martian Mono left out, scaled to its x-height.
    missing = WANTED - martian
    for src_rel, out, weight in SYMBOLS:
        src = vendor / src_rel
        if not subset(src, OUT / out, missing):
            return 1
        total += report(src, OUT / out)
        faces.append(face(out, weight, f"  size-adjust: {SYMBOL_SIZE_ADJUST};\n"))

    for name in RETIRED:
        old = OUT / name
        if old.exists():
            old.unlink()
            print(f"  removed {name}")

    css = (
        "/*\n"
        " * Generated by scripts/build-fonts.py. Do not edit.\n"
        " *\n"
        " * Martian Mono, with JetBrains Mono for the Greek, arrows and operators it\n"
        " * lacks, both SIL Open Font License 1.1, cut down to the ranges this app can\n"
        " * put on screen. See web/src/fonts/OFL.txt.\n"
        " */\n\n" + "\n\n".join(faces) + "\n"
    )
    (ROOT / "web" / "src" / "fonts.css").write_text(css, encoding="utf-8")
    print(f"  {'total':<26} {total / 1024:>17.1f}KB")
    print(f"  Martian Mono covers {len(martian)} codepoints; JetBrains Mono fills {len(missing)} more")
    print("  wrote web/src/fonts.css")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
