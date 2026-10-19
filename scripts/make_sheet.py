#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「桌宠全动作设计图」：9 行状态各摊开、带帧序号/帧数/每帧时长/动作要点。

用法: python make_sheet.py <spritesheet.png> <pet.json> <输出.png> [scale]
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

CELL_W, CELL_H = 192, 208
COLS = 8
ROWS = [
    ("idle",          "待机",     "呼吸起伏 + 每圈眨眼一次"),
    ("running-right", "走路·向右", "接触 → 经过 → 反向接触 → 经过"),
    ("running-left",  "走路·向左", "同一套帧水平镜像，朝向本身已朝左"),
    ("waving",        "挥手",     "手放肩高 → 举过头顶 → 回落"),
    ("jumping",       "跳跃",     "蓄力 → 腾空收腿 → 落地缓冲"),
    ("failed",        "失败",     "垂头 → 抱头，整行压暗"),
    ("waiting",       "坐等",     "坐直 → 上身与头左右摇，下盘不动"),
    ("running",       "原地跑",   "与走路同一套关键帧，不叠位移"),
    ("review",        "审阅",     "托腮 → 竖指 → 抱胸"),
]

FONT_CANDIDATES = [
    r"C:/Windows/Fonts/msyh.ttc",
    r"C:/Windows/Fonts/msyhbd.ttc",
    r"C:/Windows/Fonts/simhei.ttf",
    r"C:/Windows/Fonts/simsun.ttc",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def row_frames(im, r):
    cells = []
    for c in range(COLS):
        cell = im.crop((c * CELL_W, r * CELL_H, (c + 1) * CELL_W, (r + 1) * CELL_H))
        if cell.getchannel("A").getbbox() is None:
            break
        cells.append(cell)
    return cells


def main(sheet_path, pet_path, out, scale=1.3):
    im = Image.open(sheet_path).convert("RGBA")
    meta = json.loads(open(pet_path, encoding="utf-8-sig").read())
    loop_ms = meta.get("loopMs", 1100)

    CW, CH = int(CELL_W * scale), int(CELL_H * scale)
    PAD = 34
    LABEL_W = int(300 * scale / 1.3 * 1.15)
    HEADER = int(126 * scale)
    FOOTER = int(52 * scale)
    W = PAD * 2 + LABEL_W + CW * COLS
    H = HEADER + CH * len(ROWS) + FOOTER

    bg = (247, 246, 243, 255)
    ink = (38, 36, 34, 255)
    dim = (128, 122, 116, 255)
    accent = (176, 122, 40, 255)
    rule = (226, 221, 214, 255)
    band = (252, 251, 249, 255)

    canvas = Image.new("RGBA", (W, H), bg)
    d = ImageDraw.Draw(canvas)

    f_title = load_font(int(30 * scale))
    f_sub = load_font(int(14 * scale))
    f_state = load_font(int(17 * scale))
    f_cn = load_font(int(15 * scale))
    f_small = load_font(int(12 * scale))
    f_num = load_font(int(11 * scale))

    # 页眉
    d.text((PAD, PAD - 4), "光国 · 桌宠动作设计图", font=f_title, fill=ink)
    d.text((PAD, PAD + int(44 * scale)),
           f"Hermes pet  atlas {im.width}×{im.height}   单帧 {CELL_W}×{CELL_H}   "
           f"8 列 × 9 行   loopMs {loop_ms}（一行走完一圈的时长）",
           font=f_sub, fill=dim)
    d.line([(PAD, HEADER - int(18 * scale)), (W - PAD, HEADER - int(18 * scale))], fill=rule, width=1)

    for r, (key, cn, note) in enumerate(ROWS):
        top = HEADER + r * CH
        if r % 2 == 1:
            d.rectangle([0, top, W, top + CH], fill=band)
        cells = row_frames(im, r)
        n = len(cells)
        per = round(loop_ms / n) if n else loop_ms

        # 标签列
        d.text((PAD, top + int(26 * scale)), key, font=f_state, fill=ink)
        d.text((PAD, top + int(50 * scale)), cn, font=f_cn, fill=accent)
        d.text((PAD, top + int(74 * scale)), f"{n} 帧 · 每帧 ≈{per}ms", font=f_small, fill=dim)
        # 自动折行的要点
        line, words = "", []
        for ch in note:
            if d.textlength(line + ch, font=f_small) > LABEL_W - 22:
                words.append(line)
                line = ch
            else:
                line += ch
        words.append(line)
        for i, ln in enumerate(words[:3]):
            d.text((PAD, top + int(96 * scale) + i * int(15 * scale)), ln, font=f_small, fill=dim)

        # 帧
        x0 = PAD + LABEL_W
        for c, cell in enumerate(cells):
            cx = x0 + c * CW
            # 地面基准线
            d.line([(cx + 6, top + CH - int(9 * scale)), (cx + CW - 6, top + CH - int(9 * scale))],
                   fill=rule, width=1)
            big = cell.resize((CW, CH), Image.LANCZOS)
            canvas.alpha_composite(big, (cx, top))
            d.text((cx + 7, top + 5), str(c + 1), font=f_num, fill=(168, 160, 152, 255))
        # 行分隔
        d.line([(PAD, top + CH), (W - PAD, top + CH)], fill=(236, 232, 226, 255), width=1)

    d.text((PAD, H - FOOTER + int(10 * scale)),
           "动作要点：走路用 3 张图组 4 个关键帧，不抬膝；交替感靠摆臂方向与经过帧的起伏，不靠腿形。",
           font=f_small, fill=dim)
    d.text((PAD, H - FOOTER + int(27 * scale)),
           "桌宠端映射：干活 → 坐等；跑完你没看窗口 → 坐等；点一下 → 挥手；游走 → 走路左右两行。"
           "「原地跑」现在基本不出现。",
           font=f_small, fill=dim)
    canvas.convert("RGB").save(out, quality=95)
    print("sheet ->", out, canvas.size)


if __name__ == "__main__":
    s = float(sys.argv[4]) if len(sys.argv) > 4 else 1.3
    main(sys.argv[1], sys.argv[2], sys.argv[3], s)
