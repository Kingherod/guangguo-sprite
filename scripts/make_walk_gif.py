#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 atlas 里某一行导出成循环 GIF（预览用）。

用法: python make_walk_gif.py <spritesheet.png> <行名> <输出.gif> [缩放倍数] [每帧毫秒]
"""
import sys

from PIL import Image

CELL_W, CELL_H = 192, 208
ROWS = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]


def frames_of(im, row):
    n = 0
    out = []
    for c in range(im.width // CELL_W):
        cell = im.crop((c * CELL_W, row * CELL_H, (c + 1) * CELL_W, (row + 1) * CELL_H))
        if cell.getchannel("A").getbbox() is None:
            break
        n += 1
        out.append(cell)
    return out


def main(atlas, row_name, out, scale=2, ms=267):
    im = Image.open(atlas).convert("RGBA")
    row = ROWS.index(row_name)
    cells = frames_of(im, row)
    assert cells, f"{row_name} 没有非空帧"
    big = []
    for c in cells:
        bg = Image.new("RGBA", c.size, (247, 246, 244, 255))
        bg.alpha_composite(c)
        big.append(bg.resize((c.width * scale, c.height * scale), Image.LANCZOS).convert("P", palette=Image.ADAPTIVE))
    big[0].save(out, save_all=True, append_images=big[1:], duration=ms, loop=0, disposal=2)
    print(f"{row_name}: {len(cells)} 帧 -> {out} ({len(cells)} 帧 / 每帧 {ms}ms / 一圈 {len(cells)*ms}ms)")


if __name__ == "__main__":
    a = sys.argv[1]
    r = sys.argv[2] if len(sys.argv) > 2 else "running-right"
    o = sys.argv[3] if len(sys.argv) > 3 else "walk.gif"
    s = int(sys.argv[4]) if len(sys.argv) > 4 else 2
    m = int(sys.argv[5]) if len(sys.argv) > 5 else 267
    main(a, r, o, s, m)
