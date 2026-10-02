#!/usr/bin/env python3
"""Fonts for the Node renderer (mg/render_worker.mjs).

The browser player uses the web fonts from node_modules directly (CSS unicode-range subsets).
Skia in Node needs whole font files, so this merges the LXGW WenKai subsets into one TTF per
weight and converts the Fraunces woff2 files.

  pip install fonttools brotli
  python3 mg/tools/build_fonts.py
"""
import glob
import os

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
NM = os.path.join(ROOT, "node_modules")
OUT = os.path.join(ROOT, "mg", "build", "fonts")


def main():
    os.makedirs(os.path.join(OUT, "tmp"), exist_ok=True)
    for weight in ("bold", "regular"):
        parts = []
        for f in sorted(glob.glob(os.path.join(NM, "lxgw-wenkai-webfont", "files", f"lxgwwenkai-{weight}-subset-*.woff2"))):
            font = TTFont(f)
            font.flavor = None
            dst = os.path.join(OUT, "tmp", os.path.basename(f) + ".ttf")
            font.save(dst)
            parts.append(dst)
        Merger().merge(parts).save(os.path.join(OUT, f"LXGWWenKai-{weight}.ttf"))
        print("LXGW WenKai", weight, len(parts), "subsets")
    for name in ("latin-400-normal", "latin-600-normal", "latin-400-italic", "latin-500-italic", "latin-600-italic"):
        font = TTFont(os.path.join(NM, "@fontsource", "fraunces", "files", f"fraunces-{name}.woff2"))
        font.flavor = None
        font.save(os.path.join(OUT, f"Fraunces-{name}.ttf"))
    for f in glob.glob(os.path.join(OUT, "tmp", "*")):
        os.remove(f)
    os.rmdir(os.path.join(OUT, "tmp"))
    print("fonts ->", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
