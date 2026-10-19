#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""坐等「左右摇」：从一张坐直图生成 8 帧软变形。

原理：绕腰部支点做旋转变形，但**旋转强度随高度渐变**——
地平线（脚/裙摆底边）处强度 0（完全不动），越往上越大。
这样下盘纹丝不动、上身和头左右摇，长发也能平滑过渡，不会出现「腰部切断」的接缝。

和「前后倾」比：左右摇是对称周期运动，不需要一个「前倾到位」的姿势，
腿和裙摆的透视也不变，192px 下不会穿帮。

用法：
    python make_wait_sway.py <源图> <输出目录> [--peak 6] [--frames 8]
"""
import numpy as np
import os
import sys
from PIL import Image


def cut_white(im):
    """把接近纯白的像素变透明（外部白底图统一处理）。"""
    a = np.array(im.convert("RGB")).astype(np.int16)
    near_white = (a[:, :, 0] > 246) & (a[:, :, 1] > 246) & (a[:, :, 2] > 246)
    out = np.array(im.convert("RGBA"))
    out[near_white, 3] = 0
    return Image.fromarray(out)


def sample_bilinear(src, xs, ys):
    """对 src(RGBA float) 按浮点坐标双线性采样，越界返回透明。"""
    h, w = src.shape[:2]
    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    x1, y1 = x0 + 1, y0 + 1
    fx = (xs - x0)[..., None]
    fy = (ys - y0)[..., None]

    out = np.zeros(xs.shape + (4,), dtype=np.float64)
    valid = (x0 >= 0) & (y0 >= 0) & (x1 < w) & (y1 < h)
    if not valid.any():
        return out

    def px(xx, yy):
        return src[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)]

    top = px(x0, y0) * (1 - fx) + px(x1, y0) * fx
    bot = px(x0, y1) * (1 - fx) + px(x1, y1) * fx
    val = top * (1 - fy) + bot * fy
    out[valid] = val[valid]
    return out


def sway_frame(base, pivot, waist_y, floor_y, angle_deg, band):
    """按高度渐变旋转生成一帧。

    旋转强度：腰部以上 = 1（整段刚性跟头摇），腰部以下 = 0（下盘完全不动），
    中间只有 `band` 像素的过渡带 —— 过渡带落在腰/臀交界，由头发和裙摆盖住，
    不会像「地平线渐变」那样把膝盖和小腿一起带得晃。
    """
    h, w = base.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)

    # t: 腰部以上 1 → 腰部以下 0，中间 s 曲线过渡
    t = np.clip((waist_y + band / 2.0 - yy) / max(1.0, band), 0.0, 1.0)
    t = t * t * (3 - 2 * t)

    rad = np.deg2rad(angle_deg) * t
    cos, sin = np.cos(rad), np.sin(rad)
    px0, py0 = pivot
    dx, dy = xx - px0, yy - py0
    # 反向旋转采样
    sx = px0 + dx * cos + dy * sin
    sy = py0 - dx * sin + dy * cos

    fr = sample_bilinear(base, sx, sy)
    alpha = fr[:, :, 3]
    rgb = np.where(alpha[:, :, None] > 0, fr[:, :, :3] / np.maximum(alpha[:, :, None], 1e-6) * 255, 255.0)
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 255)]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main(src, outdir, peak=5.0, frames=8, band_frac=0.08):
    os.makedirs(outdir, exist_ok=True)
    im = cut_white(Image.open(src))
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit("源图是全透明的？")
    # 支点用「头部中心 x」，不要用整图 bbox 中心 —— 长发把 bbox 拉向一侧，
    # 用 bbox 中心会让左右摆的幅度不对称（实测 +19 / -29px）。
    arr0 = np.array(im)
    ys0, xs0 = np.nonzero(arr0[:, :, 3] > 40)
    head = ys0 < ys0.min() + (bbox[3] - bbox[1]) * 0.18
    cx = float(xs0[head].mean())
    floor_y = float(bbox[3] - 1)          # 脚/裙摆底边
    waist_y = floor_y - (bbox[3] - bbox[1]) * 0.42   # 腰部约在身高 42% 处

    band = max(24.0, (bbox[3] - bbox[1]) * band_frac)

    arr = np.array(im).astype(np.float64)
    premul = arr.copy()
    premul[:, :, :3] *= arr[:, :, 3:4] / 255.0   # 预乘 alpha，双线性才不出黑边

    frames_out = []
    for i in range(frames):
        ang = peak * np.sin(2 * np.pi * i / frames)
        fr = sway_frame(premul, (cx, waist_y), waist_y, floor_y, ang, band)
        frames_out.append(fr)
        print(f"  f{i + 1}.png  角度 {ang:+.2f}°")

    # 关键：八帧统一裁到「并集 bbox」再存盘。
    # 组装器是逐帧按 bbox 宽度居中的，各帧宽度不一样的话，摇摆会被居中抵消掉。
    boxes = [f.getbbox() for f in frames_out]
    ux0 = min(b[0] for b in boxes); uy0 = min(b[1] for b in boxes)
    ux1 = max(b[2] for b in boxes); uy1 = max(b[3] for b in boxes)
    print(f"  统一裁框 {ux1 - ux0}x{uy1 - uy0}")
    for i, fr in enumerate(frames_out):
        fr.crop((ux0, uy0, ux1, uy1)).save(os.path.join(outdir, f"f{i + 1}.png"))
    print(f"-> {outdir}  {frames} 帧，峰值 {peak}°（腰部以上按高度渐变旋转，腰部以下不动）")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    peak = 5.0
    frames = 8
    for a in sys.argv[1:]:
        if a.startswith("--peak"):
            peak = float(a.split("=")[1]) if "=" in a else peak
        if a.startswith("--frames"):
            frames = int(a.split("=")[1]) if "=" in a else frames
    main(args[0], args[1], peak, frames)
