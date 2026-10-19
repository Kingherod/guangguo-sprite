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

## Ready-to-run pet plugin (optional)

`plugin/` is a standalone desktop pet that plays this spritesheet — the same behaviour as the
original Hermes build (idle / walking / waving on click / sitting while an agent is busy / failure
state), without depending on any host app.

```bash
cd plugin
node src/launch.js          # run it
node src/selftest.js out/   # regenerate the five state screenshots + frame strip
```

- **Size**: right-click → 尺寸 → 75% / 100% / 150% / 200% / 250% (default 100% = 192×208, saved to
  `%APPDATA%\guangguo-pet\settings.json`)
- **Dragging**: hold the left button and move; a click under 6 px is a wave, not a drag
- **Busy detection**: only `mtime` of the session directories is read — never their contents
- **No network**: the plugin makes no requests and ships no billing/auth code
- **Requires** Node 20+ and an Electron binary (the launcher finds one; nothing is downloaded)

It is also usable as a Codex / DeepSeek Harness plugin through `.codex-plugin/plugin.json` and
`.mcp.json` (read-only tools `guangguo_status` and `guangguo_show`).

## Compatibility

| Host | Works? | How |
|---|---|---|
| **Hermes** desktop | ✅ native | drop `pet/` into `pets/guangguo/`. State-driven: sits while the agent is busy, waves on click |
| **Codex** desktop | ✅ via a pet plugin | export a state as APNG, import it as role media (below) |
| **DeepSeek Harness** | ✅ via the **same** pet plugin | identical path — it reads the same `.agents/plugins/marketplace.json` |
| anything else | ✅ manual | `demo/index.html` is ~40 lines of player logic |

Codex and DeepSeek Harness give the same answer because **the pet is a plugin feature, not a host
feature**: both hosts load `.codex-plugin/plugin.json` + `.mcp.json` + `.agents/plugins/marketplace.json`,
and the pet window is an Electron window the plugin opens for itself.

Those plugins accept `png / apng / gif` only (≤4096 px, ≤600 frames), so an 8 × 9 atlas cannot be dropped
in — export one state instead:

```bash
python scripts/export_apng.py pet/spritesheet.png waiting out/waiting.png --scale 2
# → 384×416, 8 frames @200 ms, RGBA preserved
```

APNG rather than GIF because the hair tips and sleeves are ~17.5 % semi-transparent pixels, and GIF's
1-bit alpha would halo them white.

**What the plugin cannot do**: it plays one looping image, so it will not react to the host being busy.
Only Hermes has state-driven behaviour. Full matrix and evidence: [docs/compatibility.md](docs/compatibility.md).

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
