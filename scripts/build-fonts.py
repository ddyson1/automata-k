#!/usr/bin/env python3
"""
Build the bundled web faces and the @font-face block that declares them.

The app ships three families and no network calls, so the faces live in the
repository. Shipping the vendor's files whole would be about 900KB for what the
app actually draws, and the vendor's own pre-subset "latin" files are worse than
that: they drop Greek, which means every δ, ε and Σ in the formal layer falls
back to a system font. Measuring that is what sent us here.

So each face is cut from the complete original down to the ranges the app can
put on screen, which is wider than the app's own copy because a player may
rename a state to anything they can type.

The unicode-range in the emitted CSS is read back out of the cut file's cmap,
so the declaration cannot drift from the bytes.

    python3 scripts/build-fonts.py [--vendor DIR]

DIR defaults to node_modules, and needs jetbrains-mono, @fontsource-variable/inter
and @fontsource-variable/literata.
"""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "src" / "fonts"

# Latin, Latin-1, Latin Extended-A, the combining marks the formal layer uses,
# Greek, punctuation, super/subscripts, letterlike, arrows, mathematical
# operators, misc technical, control pictures, geometric shapes, check marks.
RANGES = ",".join(
    [
        "U+0000-00FF",
        "U+0100-017F",
        "U+0300-0304",
        "U+0308",
        "U+0370-03FF",
        "U+2010-2027",
        "U+2030-205E",
        "U+2070-209F",
        "U+20A0-20BF",
        "U+2100-214F",
        "U+2190-21FF",
        "U+2200-22FF",
        "U+2300-23FF",
        "U+2400-2426",
        "U+25A0-25FF",
        "U+2713-2718",
    ]
)


class Job:
    def __init__(self, src: str, out: str, family: str, weight: str, variable: bool):
        self.src = src
        self.out = out
        self.family = family
        self.weight = weight
        self.variable = variable


# Latin Extended is deliberately absent from the sans and the serif. Every
# string they draw is authored copy, which is ASCII plus the notation symbols;
# anything a player types appears in the mono, which carries the wider cut.
JOBS = [
    Job("jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2", "mono-400.woff2", "Automata Mono", "400", False),
    Job("jetbrains-mono/fonts/webfonts/JetBrainsMono-Medium.woff2", "mono-500.woff2", "Automata Mono", "500", False),
    Job("jetbrains-mono/fonts/webfonts/JetBrainsMono-Bold.woff2", "mono-700.woff2", "Automata Mono", "700", False),
    Job("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "sans-latin.woff2", "Automata Sans", "100 900", True),
    Job("@fontsource-variable/inter/files/inter-greek-wght-normal.woff2", "sans-greek.woff2", "Automata Sans", "100 900", True),
    Job("@fontsource-variable/literata/files/literata-latin-wght-normal.woff2", "serif-latin.woff2", "Automata Serif", "200 900", True),
]


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vendor", default=str(ROOT / "node_modules"))
    args = parser.parse_args()
    vendor = pathlib.Path(args.vendor)

    OUT.mkdir(parents=True, exist_ok=True)
    faces: list[str] = []
    total = 0

    for job in JOBS:
        src = vendor / job.src
        if not src.exists():
            print(f"missing {src}", file=sys.stderr)
            return 1
        dst = OUT / job.out
        cmd = [
            "pyftsubset",
            str(src),
            f"--output-file={dst}",
            "--flavor=woff2",
            f"--unicodes={RANGES}",
            "--layout-features=kern,liga,calt",
            "--no-hinting",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            return 1

        size = dst.stat().st_size
        total += size
        print(f"  {job.out:<24} {src.stat().st_size / 1024:7.1f}KB -> {size / 1024:6.1f}KB")

        faces.append(
            "@font-face {\n"
            f"  font-family: '{job.family}';\n"
            "  font-style: normal;\n"
            f"  font-weight: {job.weight};\n"
            "  font-display: block;\n"
            f"  src: url('./fonts/{job.out}') format('woff2');\n"
            f"  unicode-range: {to_range(covered(dst))};\n"
            "}"
        )

    css = (
        "/*\n"
        " * Generated by scripts/build-fonts.py. Do not edit.\n"
        " *\n"
        " * JetBrains Mono, Inter and Literata, all SIL Open Font License 1.1,\n"
        " * cut down to the ranges this app can put on screen. See web/src/fonts/OFL.txt.\n"
        " */\n\n" + "\n\n".join(faces) + "\n"
    )
    (ROOT / "web" / "src" / "fonts.css").write_text(css, encoding="utf-8")
    print(f"  {'total':<24} {total / 1024:>17.1f}KB")
    print("  wrote web/src/fonts.css")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
