# 光国 · Guāngguó — a 9-state chibi desktop-pet spritesheet

**English** · [简体中文](README.zh-CN.md)

A hand-tuned **9-row sprite atlas** of a chibi maid (Q 版女仆长), the Python toolchain that
builds / verifies / previews it, and a **self-contained desktop-pet plugin** that plays it —
on Hermes natively, or on Codex / DeepSeek Harness through their plugin system.

![walk](previews/walk.gif) ![idle](previews/idle.gif) ![sit sway](previews/sit-sway.gif)

| | |
|---|---|
| **Atlas** | 1536 × 1872 px, 8 columns × 9 rows, 192 × 208 px per frame |
| **Rows** | `idle` `running-right` `running-left` `waving` `jumping` `failed` `waiting` `running` `review` |
| **Loop** | 1600 ms per row cycle (`pet.json` → `loopMs`) |
| **md5** | `b3efed19621d44a0cf0b70946505f7b0` — reproducible from `sources/` |
| **Format** | [docs/format.md](docs/format.md) |
| **Design sheet** | [docs/design-sheet.png](docs/design-sheet.png) |
| **Compatibility** | [docs/compatibility.md](docs/compatibility.md) |
| **License** | code MIT · art CC BY-NC 4.0 ([details](#license)) |

## What's inside

```
pet/            spritesheet.png + pet.json          ← drop-in atlas
plugin/         standalone desktop pet (Electron, no deps) + MCP tools
demo/index.html                                      ← play it in a browser, ~40 lines of player
docs/           format.md · making-of.md · design-sheet.png
previews/        walking / idle / sitting GIFs, walk before-after
scripts/        build_atlas.py · verify_atlas.py · export_apng.py · make_gif.py · make_sheet.py
sources/        the original single frames (3 walk keys, 8 sit frames, 5 other states)
patches/        optional Hermes desktop patches
```

## Quick start

**Play it**

```bash
python -m http.server 8899
# open http://127.0.0.1:8899/demo/index.html
```

Click her and she waves. The page needs a local server only because it reads pixel data
to count the frames in each row (`file://` taints the canvas).

**Use the atlas anywhere**

Cells are 192 × 208, rows are in the fixed order above, and unused cells at the end of a
row are fully transparent. Play a row by stepping `x = frame * 192` across `frames` cells,
where `frames` is the number of non-transparent cells in that row. Reference player and
edge cases: [docs/format.md](docs/format.md).

**Rebuild from the source frames**

```bash
pip install -r scripts/requirements.txt
python scripts/build_atlas.py sources out --loopms 1600
python scripts/verify_atlas.py out/spritesheet.png out/row
```

`build_atlas.py` is deterministic: from `sources/` it reproduces `pet/spritesheet.png`
**byte for byte** (md5 `b3efed19621d44a0cf0b70946505f7b0`). Touching any source frame or any
target height means re-running this check.

## The desktop-pet plugin

`plugin/` is a standalone Electron pet that plays this atlas. It does **not** need Hermes:
it watches agent session **mtime** to know whether an agent is busy, and it opens its own
transparent, always-on-top window.

```bash
cd plugin
node src/launch.js            # run the pet
node test/run.js              # state-machine tests
node test/roam.js             # roaming / physics / speed tests
```

| Behaviour | What happens |
|---|---|
| **Idle** | `idle` row loops; after 2.5–6 s she may wander or hop on the spot |
| **Walking** | platform-style state machine: `pause → walk → hop → fall`, gravity 5200 px/s², 0.8 body-widths per atlas loop so her feet don't skate |
| **Walking speed** | right-click / tray → **Roaming** → `Stay put` · `Slow 0.65×` · `Normal 1.0×` · `Fast 1.5×`. Measured 62 / 97 / 150 px/s on a 192 px sprite. The multiplier drives **both** the window motion and the walk frames (`frameMs ÷ multiplier`) — otherwise fast walking would look like sliding |
| **Stay put** | removes roaming entirely; she still blinks, still waves on click, still sits when the agent is busy |
| **Dragging** | drag her anywhere; released above the floor she drops **21 % of her own height** (44 px at 100 %) and that point becomes her new "shelf". The work-area bottom is a hard floor, never crossed |
| **Clicking** | a press-and-release under 6 px is a **wave**, not a drag — and it never triggers the drop. Waving outranks roaming, so clicking mid-walk makes her stop and wave instead of being overwritten by the walk pose |
| **Busy agent** | sits (`waiting` row) while a session file keeps changing; back to idle 8 s after it stops. Only `mtime` is read, never file contents |
| **Failure** | `failed` row for a few seconds when a session looks broken |
| **Size** | right-click or tray → `75 / 100 / 150 / 200 / 250 %` (100 % = 192 × 208), saved to `%APPDATA%\guangguo-pet\settings.json` |
| **Getting her back** | click the tray icon to toggle; right-click → *Hide to tray* keeps the process alive; launching the app again re-shows her through the single-instance lock; `guangguo_show` starts her from scratch |
| **No network** | zero requests, zero billing/auth code, no telemetry |

It also registers as a Codex / DeepSeek Harness plugin (`.codex-plugin/plugin.json`,
`.mcp.json`, read-only tools `guangguo_status` and `guangguo_show`). Commands can be sent
through a JSON command file, so anything that can write a file can drive the pet.

## Hermes integration

Drop `pet/` into `pets/guangguo/` and Hermes owns the state machine: she sits while the
agent works, waves when you click her, roams when idle.

**The shadow is measured, not guessed.** The original pet drew one fixed ellipse
(55 % of the frame width, centred) under every pose. That reads as "floating" the moment
the pose is not a wide stand — a sitting character has a much narrower, off-centre contact
patch:

| row | contact width | contact centre (in a 192 px cell) | old shadow |
|---|---|---|---|
| `idle` | 24 px | 92.6 (≈ centred) | 106 px wide, centred |
| `waiting` (sitting) | 23 px | **127.5 (31 px right of centre)** | same → visibly detached |
| `running-right` | 46 px | 123.8 | same |

The fix walks the alpha channel once per atlas, records the contact band of every row, and
drives the ellipse from it: width `3.0 × contact width` clamped to `[0.34, 0.55] × frame
width`, centre on the contact centre (mirrored for left-facing rows), vertical centre on
the contact edge. The same routine keeps standing and walking grounded, so it is a general
fix rather than a special case for the sitting pose.

Two knobs are deliberately separate: **pose scale** and **shadow geometry**. The sitting row
used to be 136 px tall against a 194 px stand, which made the same fixed shadow look even
further away; it is now **160 px** (rebuilt from the 714 × 825 source frames, not resampled
from the atlas), so the size difference reads as "she is sitting", not "she is smaller".

## Compatibility

| Host | Works? | How |
|---|---|---|
| **Hermes** desktop | ✅ native | drop `pet/` into `pets/guangguo/`; state-driven (sits while busy, waves on click, roams) |
| **Codex** desktop | ✅ full pet | `plugin/` registers as a Codex plugin; it opens its own window and watches session files |
| **DeepSeek Harness** | ✅ full pet | identical path — the same plugin manifest and marketplace entry |
| anything else | ✅ manual | `demo/index.html` is the whole player |

Pets that expect **one looping image** (png / apng / gif, ≤4096 px, ≤600 frames) cannot take
an 8 × 9 atlas; export a single state instead:

```bash
python scripts/export_apng.py pet/spritesheet.png waiting out/waiting.png --scale 2
# → 384×416, 8 frames @200 ms, RGBA preserved
```

APNG rather than GIF because the hair tips and sleeves are ~17.5 % semi-transparent pixels,
and GIF's 1-bit alpha would halo them white.

## How it was made

Character design, frame direction and every "why" is in [docs/making-of.md](docs/making-of.md).
Short version: frames were edited one at a time with an image model, chain-editing each frame
from the previous one rather than redrawing from scratch, then assembled by the tooling here.
The walk cycle was deliberately cut from 6 keys to 4 because the extra "passing" frames were
where every deformation showed up.

## Known limitations

- `jumping` is a **single static frame** repeated 5× — the jump has no motion yet, which is
  why hopping reads as "popping up" rather than pushing off the ground.
- `running` (in-place run) is unused by the reference clients; a busy agent shows `waiting`,
  and roaming uses `running-left/right`.
- The atlas favours clean silhouettes at 192 px over animation fanciness. Expect small steps,
  not a swagger.
- In the Codex plugin the tray icon may live in the Windows "hidden icons" overflow — that is
  OS behaviour, not a bug.

## License

- **Code** (`scripts/`, `demo/`, `plugin/`, `patches/`) — MIT, see [LICENSE](LICENSE).
- **Art** (`pet/`, `sources/`, `previews/`, `docs/design-sheet.png`) — CC BY-NC 4.0, see
  [LICENSE-ART](LICENSE-ART). Remix it, put it in your own pet, put it in a stream overlay —
  just credit **"光国 / Guāngguó by 尼乾外道"** and don't sell it.

Character © 尼乾外道. Not affiliated with any existing franchise; the character is an
original design. 商用（付费产品、广告、游戏内购素材）请先联系作者。

`patches/` patches [Hermes](https://github.com/NousResearch/hermes) (MIT); it is optional and
can be ignored by anyone who only wants the sprite atlas.
