#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v5 组装器：走路只用 4 个关键帧（接触 → 经过 → 反向接触 → 经过），每帧停 2 拍。

为什么减帧：6 帧里那两张「通过帧」（抬膝、脚尖朝下）是穿帮的主要来源——膝盖抬太高、
脚跑到身体前面、小腿偶发变形。压成 3 张图（经过帧复用两次）就没有这些姿势可用，
穿帮的机会也随之消失；代价是步态朴素，但在 192px 下反而更稳。

走路关键帧（目录 `动作源图/walk_摆臂_4格/`）：
    contact_a.png  右腿前伸、左腿后蹬（近侧手向后、远侧手向前）
    neutral.png    双腿并拢、双脚贴地、手臂接近垂直（身体略高）
    contact_b.png  左腿前伸、右腿后蹬（近侧手向前、远侧手向后）
序列 = [contact_a, neutral, contact_b, neutral] × hold 2 = 8 格全填。

用法：
    python build_v5.py <素材根目录> <输出目录> [--loopms 1600] [--walk-dir walk_摆臂_4格]
"""
import glob
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

CELL_W, CELL_H = 192, 208
ROWS = [
    ("idle", 6), ("running-right", 8), ("running-left", 8), ("waving", 4), ("jumping", 5),
    ("failed", 8), ("waiting", 8), ("running", 6), ("review", 6),
]
COLS = max(n for _, n in ROWS)
WALK_KEYS = ["contact_a.png", "neutral.png", "contact_b.png", "neutral.png"]
WALK_HOLD = 2
WALK_DIR = "walk"
LOOP_MS = 1600
# idle 三格关键帧 = [睁眼] [闭眼] [睁眼略高]。铺 6 格时的取帧顺序：
# 老的做法是 0,1,2 ×2 → 一圈眨两次眼，太快。这里只眨一次，其余保持睁眼。
IDLE_SEQ = [0, 0, 1, 0, 2, 0]
# 坐等：4 张关键帧（坐直 → 略前倾 → 前倾撑地 → 收回），在 `动作源图/wait_4格/`。
# 老版本只有 2 张、来回跳，看着生硬；补两张中间帧后循环才连贯。
# 优先用「左右摇」那套（8 帧、脚本生成、腰部以下完全不动）；没有就退回 4 帧版本。
WAIT_SWAY_DIR = "wait_sway"
WAIT_SWAY_KEYS = [f"f{i}.png" for i in range(1, 9)]
WAIT_DIR = "wait_4f"
WAIT_KEYS = ["sit.png", "mid.png", "lean.png", "ret.png"]


def cut_white(path):
    im = Image.open(path).convert("RGBA")
    for xy in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
        try:
            ImageDraw.floodfill(im, xy, (0, 0, 0, 0), thresh=32)
        except Exception:
            pass
    return im


def slice_sheet(path, expect):
    im = cut_white(path)
    w = im.width / expect
    even = []
    for i in range(expect):
        part = im.crop((int(i * w), 0, int((i + 1) * w), im.height))
        bbox = part.getbbox()
        even.append(part.crop(bbox) if bbox else part)
    if all(c.width > im.width * 0.02 and c.height > im.height * 0.2 for c in even):
        return even
    a = np.array(im)[:, :, 3]
    colsum = (a > 16).sum(axis=0)
    segs, in_seg, start = [], False, 0
    for x, v in enumerate(colsum):
        if v > 2 and not in_seg:
            start, in_seg = x, True
        elif v <= 2 and in_seg:
            segs.append((start, x))
            in_seg = False
    if in_seg:
        segs.append((start, len(colsum)))
    segs = [s for s in segs if s[1] - s[0] > im.width * 0.03]
    if len(segs) != expect:
        return even
    out = []
    for x0, x1 in segs[:expect]:
        part = im.crop((x0, 0, x1, im.height))
        bbox = part.getbbox()
        out.append(part.crop(bbox) if bbox else part)
    return out


def normalize(cells, target_h):
    hs = sorted(c.height for c in cells)
    h = hs[len(hs) // 2] if hs else target_h
    out = []
    for c in cells:
        r = target_h / h
        w, hh = max(1, int(c.width * r)), max(1, int(c.height * r))
        if w > CELL_W - 4:
            s = (CELL_W - 4) / w
            w, hh = CELL_W - 4, max(1, int(hh * s))
        out.append(c.resize((w, hh), Image.LANCZOS))
    return out


def load_walk(paths, target_h):
    """四张图同一画布：共用一个 scale，只按 bbox 高度中位数定。**

    底边对齐，所以「经过帧」腿站直、比接触帧高一点，那点起伏就是走路的重心变化。
    不要逐帧各自缩到同一高度——否则起伏被抹平，走起来像贴图平移。
    """
    ims = []
    for p in paths:
        im = cut_white(p)
        bbox = im.getbbox()
        ims.append(im.crop(bbox) if bbox else im)
    hs = sorted(i.height for i in ims)
    ref = hs[len(hs) // 2]
    s = target_h / ref
    widest = max(i.width for i in ims) * s
    if widest > CELL_W - 4:
        s *= (CELL_W - 4) / widest
    return [i.resize((max(1, int(i.width * s)), max(1, int(i.height * s))), Image.LANCZOS) for i in ims]


def resample(cells, n, hold=1, loop=True):
    if not cells:
        return []
    seq = []
    if loop:
        while len(seq) < n:
            for c in cells:
                seq.extend([c] * hold)
    else:
        for c in cells:
            seq.extend([c] * hold)
    return seq[:n]


def place(img, dx=0, dy=0, rot=0.0, squash=1.0, dim=1.0):
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    im = img
    if squash != 1.0:
        im = im.resize((im.width, max(1, int(im.height * squash))), Image.LANCZOS)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if dim < 1.0:
        im = ImageEnhance.Brightness(im).enhance(dim)
    x = (CELL_W - im.width) // 2 + int(dx)
    y = CELL_H - im.height - 6 + int(dy)
    cell.alpha_composite(im, (max(0, min(x, CELL_W - im.width)),
                              max(0, min(y, CELL_H - im.height))))
    return cell


def bob(state, i, n):
    ph = 2 * math.pi * i / n
    if state == "idle":
        return (0, round(-1.2 * math.sin(ph), 1), 0, 1 + 0.005 * math.sin(ph), 1)
    if state in ("running-right", "running-left", "running"):
        return (0, 0, 0, 1, 1)
    if state == "waving":
        return (0, round(-1.5 * abs(math.sin(ph)), 1), 0, 1, 1)
    if state == "jumping":
        return (0, 0, 0, 1, 1)
    if state == "failed":
        return ((-1 if i % 2 else 1), (1 if i % 2 else 0), 0, 1, 0.85)
    if state == "waiting":
        return (0, round(-0.8 * math.sin(ph), 1), 0, 1, 1)
    return (0, round(1.2 * math.cos(ph), 1), 0, 1 - 0.01 * max(0, math.sin(ph)), 1)


def build(src_dir, out_dir, loop_ms=LOOP_MS, walk_dir=WALK_DIR):
    dirs = [src_dir, os.path.join(src_dir, "states")]
    files = {}
    for d in dirs:
        if os.path.isdir(d):
            for p in glob.glob(os.path.join(d, "*.png")):
                files.setdefault(os.path.basename(p), p)

    def find(name):
        if not name:
            return None
        for fn, p in files.items():
            if fn.lower() == name or name in fn:
                return p
        return None

    wd = os.path.join(src_dir, walk_dir)
    walk_paths = [os.path.join(wd, k) for k in WALK_KEYS]
    missing = [os.path.basename(p) for p in walk_paths if not os.path.isfile(p)]
    if missing:
        raise FileNotFoundError(f"{wd} 缺关键帧：{missing}")

    plan = {
        "idle":          ("idle.png", 3, 196, "idle.png", None),
        "running-right": ("@walk", 0, 190, None, None),
        "running-left":  ("@walk", 0, 190, None, None),
        "waving":        ("wave.png", 3, 194, "wave.png", None),
        "jumping":       (None, 1, 190, "jump.png", None),
        "failed":        ("fail.png", 2, 184, "fail.png", None),
        "waiting":       ("wait.png", 2, 160, "idle.png", None),
        "running":       ("@walk", 0, 188, None, None),
        "review":        ("think.png", 3, 194, "idle.png", None),
    }

    atlas = Image.new("RGBA", (COLS * CELL_W, len(ROWS) * CELL_H), (0, 0, 0, 0))
    cache, used = {}, []
    for r, (state, n) in enumerate(ROWS):
        sheet, expect, th, fallback, take = plan[state]
        key = (sheet, expect, th)
        if key not in cache:
            if sheet == "@walk":
                keys = load_walk(walk_paths, th)
                cache[key] = resample(keys, n, WALK_HOLD)
                used.append(f"{state}<-{os.path.basename(wd)}(4关键帧×停{WALK_HOLD})")
            elif state == "idle":
                p = find("idle.png")
                keys = normalize(slice_sheet(p, 3), th)
                seq = (IDLE_SEQ * 2)[:n] if len(IDLE_SEQ) < n else IDLE_SEQ[:n]
                cache[key] = [keys[i] for i in seq]
                used.append(f"idle<-{os.path.basename(p)}(3格 → 序列 {seq}：每圈眨眼一次)")
            else:
                sway_paths = [os.path.join(src, WAIT_SWAY_DIR, k) for k in WAIT_SWAY_KEYS]
                wait_paths = [os.path.join(src, WAIT_DIR, k) for k in WAIT_KEYS]
                if state == "waiting" and all(os.path.isfile(x) for x in sway_paths):
                    cache[key] = load_walk(sway_paths, th)[:n]
                    used.append(f"waiting<-{WAIT_SWAY_DIR}({len(cache[key])}帧左右摇, 只动腰部以上)")
                elif state == "waiting" and all(os.path.isfile(x) for x in wait_paths):
                    # 4 张关键帧（坐直 / 略前倾 / 前倾撑地 / 收回），共用同一尺度、底边对齐，
                    # 只占前 4 格 → 每张 400ms，一圈 1.6 秒，循环闭合。
                    cache[key] = load_walk(wait_paths, th)[:n]
                    used.append(f"waiting<-{WAIT_DIR}({len(cache[key])}张关键帧同尺度)")
                else:
                    p = find(sheet) if sheet else None
                    if p:
                        cells_ = normalize(slice_sheet(p, expect), th)
                        if take:
                            cells_ = cells_[:take]
                        used.append(f"{state}<-{os.path.basename(p)}({expect}格取{len(cells_)})")
                    else:
                        fb = find(fallback)
                        if not fb:
                            raise FileNotFoundError(f"{state}: 既没有 {sheet} 也没有 {fallback}")
                        im = cut_white(fb)
                        bbox = im.getbbox()
                        im = im.crop(bbox) if bbox else im
                        r2 = th / im.height
                        im = im.resize((max(1, int(im.width * r2)), th), Image.LANCZOS)
                        cells_ = [im]
                        used.append(f"{state}<-{os.path.basename(fb)}(单张)")
                    # 每张关键帧占等长的格子：2 张关键帧铺 6 格就是 3+3，铺 8 格就是 4+4。
                    # 之前一律 hold=1，2 张关键帧的 waiting / failed 就变成 A B A B A B，
                    # 每 267ms 换一次姿势 —— 看着像鬼畜抖动，不是呼吸。
                    hold = max(1, n // len(cells_))
                    cache[key] = resample(cells_, n, hold)

        cells = cache[key]
        if state == "running-left":
            cells = [c.transpose(Image.FLIP_LEFT_RIGHT) for c in cells]

        for c_idx, cimg in enumerate(cells):
            dx, dy, rot, sq, dim = bob(state, c_idx, n)
            atlas.alpha_composite(place(cimg, dx=dx, dy=dy, rot=rot, squash=sq, dim=dim),
                                  (c_idx * CELL_W, r * CELL_H))

    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, "spritesheet.png"))
    with open(os.path.join(out_dir, "pet.json"), "w", encoding="utf-8") as f:
        json.dump({"id": "guangguo", "displayName": "光国",
                   "description": "白发红瞳、黄色羽织的 Q 版女仆长",
                   "createdBy": "Hermes + GPT", "spritesheetPath": "spritesheet.png",
                   "loopMs": loop_ms}, f, ensure_ascii=False, indent=2)

    print("素材:")
    for u in used:
        print("  ", u)
    print("每行非空帧数:")
    for r, (state, n) in enumerate(ROWS):
        blank = [c for c in range(COLS)
                 if atlas.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H))
                 .getchannel("A").getbbox() is None]
        print(f"   {state:14s} {min(blank) if blank else n}")
    return atlas


if __name__ == "__main__":
    args = list(sys.argv[1:])
    if "--loopms" in args:
        i = args.index("--loopms")
        LOOP_MS = int(args[i + 1])
        del args[i:i + 2]
    if "--walk-dir" in args:
        i = args.index("--walk-dir")
        WALK_DIR = args[i + 1]
        del args[i:i + 2]
    src = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sources")
    dst = args[1] if len(args) > 1 else "atlas_v5"
    a = build(src, dst, loop_ms=LOOP_MS, walk_dir=WALK_DIR)
    print("atlas", a.size, "->", dst)
