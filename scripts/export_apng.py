#!/usr/bin/env python3
"""把图集里某个状态导出成一张 APNG（透明、逐帧时长），给只吃动图的环境用。

    python export_apng.py ../pet/spritesheet.png waiting ../out/waiting.png --loopms 1600 --scale 2

为什么要 APNG 不要 GIF：
  GIF 只有 1 位透明，角色半透明的发梢和袖口会变成一圈白边/黑边；
  这个角色头发极薄，GIF 会明显难看出锯齿。APNG 保真 RGBA。
"""
import argparse
import json
import os
import sys

from PIL import Image

FRAME_W, FRAME_H = 192, 208
COLS = 8
ROWS = ["idle", "running-right", "running-left", "waving", "jumping",
        "failed", "waiting", "running", "review"]


def count_frames(atlas, row):
    """末格留空是图集唯一的帧数信号：从左边数，遇到全透明就停。"""
    for col in range(COLS):
        alpha = atlas.crop((col * FRAME_W, row * FRAME_H,
                            (col + 1) * FRAME_W, (row + 1) * FRAME_H)).getchannel("A")
        if not alpha.getbbox():          # 整格透明
            return col
    return COLS


def load_states(atlas_path):
    """优先读同目录的 pet.json 拿 loopMs；没有就用默认值。"""
    loop_ms = 1600
    sidecar = os.path.join(os.path.dirname(os.path.abspath(atlas_path)), "pet.json")
    if os.path.exists(sidecar):
        try:
            with open(sidecar, encoding="utf-8-sig") as fh:
                loop_ms = int(json.load(fh).get("loopMs", loop_ms))
        except (ValueError, KeyError, OSError):
            pass
    return loop_ms


def export_row(atlas, row, out_path, loop_ms=1600, scale=1, durations=None):
    n = count_frames(atlas, row)
    if n == 0:
        raise SystemExit(f"{ROWS[row]}: 这一行是空的，没什么可导出")
    step = durations if durations else round(loop_ms / n)

    frames = []
    for col in range(n):
        frame = atlas.crop((col * FRAME_W, row * FRAME_H,
                            (col + 1) * FRAME_W, (row + 1) * FRAME_H))
        if scale != 1:
            frame = frame.resize((FRAME_W * scale, FRAME_H * scale), Image.Resampling.LANCZOS)
        frames.append(frame)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    frames[0].save(out_path, format="PNG", save_all=True, append_images=frames[1:],
                   duration=step, loop=0, disposal=0, blend=0)
    return n, step, frames[0].size


def main():
    ap = argparse.ArgumentParser(description="图集的一行 → APNG")
    ap.add_argument("atlas", help="spritesheet.png 路径")
    ap.add_argument("state", choices=ROWS, help="要导出的状态（行名）")
    ap.add_argument("out", help="输出 .png 路径")
    ap.add_argument("--loopms", type=int, default=None,
                    help="整圈时长，默认读同目录 pet.json 的 loopMs（再不行 1600）")
    ap.add_argument("--scale", type=int, default=1, help="整数放大倍数（192→384 用 2）")
    args = ap.parse_args()

    atlas = Image.open(args.atlas).convert("RGBA")
    expected = (FRAME_W * COLS, FRAME_H * len(ROWS))
    if atlas.size != expected:
        raise SystemExit(f"图集尺寸 {atlas.size}，不是 {expected}——不是这套格式")

    loop_ms = args.loopms if args.loopms is not None else load_states(args.atlas)
    row = ROWS.index(args.state)
    n, step, size = export_row(atlas, row, args.out, loop_ms, args.scale)
    print(f"{args.state}: {n} 帧 × {step}ms → {size[0]}×{size[1]}  {args.out}")


if __name__ == "__main__":
    sys.exit(main())
