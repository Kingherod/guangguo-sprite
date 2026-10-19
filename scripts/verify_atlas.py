#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 atlas：尺寸、每行非空帧数、导出走路行放大预览。"""
import sys

from PIL import Image

CELL_W, CELL_H = 192, 208
ROWS = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]


def main(atlas_path, out_prefix=None):
    im = Image.open(atlas_path).convert("RGBA")
    print("size", im.size, "expected", (CELL_W * 8, CELL_H * 9))
    assert im.size == (CELL_W * 8, CELL_H * 9), "尺寸不对"
    cols = im.width // CELL_W
    for r, name in enumerate(ROWS):
        counts = []
        for c in range(cols):
            cell = im.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H))
            counts.append(cell.getchannel("A").getbbox() is not None)
        n = counts.index(False) if False in counts else cols
        print(f"  {name:14s} frames={n}  {''.join('#' if x else '.' for x in counts)}")
        if out_prefix and name in ("running-right", "running-left"):
            strip = Image.new("RGBA", (CELL_W * n, CELL_H), (0, 0, 0, 0))
            for c in range(n):
                strip.alpha_composite(
                    im.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H)), (c * CELL_W, 0))
            big = strip.resize((strip.width * 2, strip.height * 2), Image.LANCZOS)
            bg = Image.new("RGBA", big.size, (250, 250, 250, 255))
            bg.alpha_composite(big)
            p = f"{out_prefix}_{name}.png"
            bg.save(p)
            print("  ->", p)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
