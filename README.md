# 光国 · Guāngguó — a 9-state chibi desktop-pet spritesheet

**English** · [简体中文](README.zh-CN.md)

A hand-tuned, **9-row sprite atlas** of a chibi maid (Q 版女仆长), plus the Python
toolchain that builds, verifies and previews it. Drop-in compatible with the
[Hermes](https://github.com/NousResearch/hermes) desktop pet format; the atlas is
plain PNG so any engine can use it.

![walk](previews/walk.gif) ![idle](previews/idle.gif) ![sit sway](previews/sit-sway.gif)

| | |
|---|---|
| **Atlas** | 1536 × 1872 px, 8 columns × 9 rows, 192 × 208 px per frame |
| **Rows** | `idle` `running-right` `running-left` `waving` `jumping` `failed` `waiting` `running` `review` |
| **Loop** | 1600 ms per row cycle (`pet.json` → `loopMs`) |
| **Format** | [docs/format.md](docs/format.md) |
| **Design sheet** | [docs/design-sheet.png](docs/design-sheet.png) |
| **Compatibility** | [docs/compatibility.md](docs/compatibility.md) — Hermes native; Codex & DeepSeek Harness via the same `.agents` plugin system (APNG export) |
| **License** | code MIT · art CC BY-NC 4.0 ([details](#license)) |

## What's inside

```
pet/            spritesheet.png + pet.json          ← 拿来即用
demo/index.html                                      ← 浏览器里直接播（无依赖）
docs/           format.md · making-of.md · design-sheet.png
previews/       走路 / 待机 / 坐等 GIF，新旧对比图
scripts/        build_atlas.py · verify_atlas.py · export_apng.py · make_gif.py · make_sheet.py · make_wait_sway.py
sources/        原始单帧（走路 3 张、坐等 8 张、其它状态 5 张）
patches/        Hermes 桌面端补丁（点一下挥手 / 干活时坐等）— 可选，见其中 README
```

## Quick start

**Play it**

```bash
cd guangguo-sprite
python -m http.server 8899
# open http://127.0.0.1:8899/demo/index.html
```

Click the pet to make her wave. The page needs a local server only because it
reads pixel data to count frames per row (`file://` taints the canvas).

**Use the atlas in your own app**

The only rules that matter: cells are 192 × 208, rows are in the fixed order
above, and unused cells at the end of a row are fully transparent. Play a row by
stepping `x = frame * 192` for `frames` cells, where `frames` is the count of
non-transparent cells in that row. Details and a reference player in
[docs/format.md](docs/format.md).

**Rebuild the atlas from the source frames**

```bash
pip install -r scripts/requirements.txt
cd scripts
python build_atlas.py ../sources ../out --loopms 1600
python verify_atlas.py ../out/spritesheet.png ../out/row
```

`build_atlas.py` is deterministic: from `sources/` it reproduces
`pet/spritesheet.png` **byte for byte** (md5 `bb63c2b4d639c3a48289a822e02c9b42`).
That's the check to run after you touch anything.

## How it was made

Character design, frame direction and all the "why" behind the choices are in
[docs/making-of.md](docs/making-of.md). Short version: frames were edited one at
a time with an image model (chain-editing, never redrawn from scratch), then
assembled by the Python tooling here — and the walking cycle was deliberately cut
from 6 keyframes down to 4 because the extra "passing" frames were where every
deformation showed up.

## Known limitations

- `jumping` is a **single static frame** repeated 5× — the jump has no motion yet.
- `running` (in-place run) is unused by the reference client: a busy agent shows
  the `waiting` sit instead, and roaming uses `running-left/right`.
- The atlas favours clean silhouettes at 192 px over animation fanciness. Expect
  small steps, not a swagger.

## License

- **Code** (`scripts/`, `demo/`, `patches/`) — MIT, see [LICENSE](LICENSE).
- **Art** (`pet/`, `sources/`, `previews/`, `docs/design-sheet.png`) — CC BY-NC 4.0,
  see [LICENSE-ART](LICENSE-ART). Remix it, put it in your own desktop pet, put it in
  a stream overlay — just credit "光国 / Guāngguó by 尼乾外道" and don't sell it.

Character © 尼乾外道. Not affiliated with any existing franchise; the character is an
original design. 商用（付费产品、广告、游戏内购素材）请先联系作者。

The `patches/` directory patches [Hermes](https://github.com/NousResearch/hermes),
which is MIT-licensed; it is optional and can be ignored by anyone who just wants
the sprite atlas.
