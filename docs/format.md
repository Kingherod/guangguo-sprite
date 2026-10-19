# Atlas format

One PNG, a fixed grid, no metadata beyond `pet.json`. Everything a player needs
is derivable from the pixels.

## Geometry

```
image       1536 × 1872 px
cell        192 × 208 px
grid        8 columns × 9 rows   (8 * 192 = 1536, 9 * 208 = 1872)
origin      cell (col, row) starts at (col * 192, row * 208)
```

Frames are placed **from the left**, and **unused cells at the right end of a row
are fully transparent**. That is the only signal for "this row has N frames" —
there is no manifest file. A player should count leading non-transparent cells.

## Rows (order is fixed)

| row | state | frames | per frame @ `loopMs` 1600 | notes |
|---:|---|---:|---:|---|
| 0 | `idle` | 6 | 267 ms | breathing; blinks **once** per loop |
| 1 | `running-right` | 8 | 200 ms | contact → pass → contact → pass, ×2 hold |
| 2 | `running-left` | 8 | 200 ms | pixel mirror of row 1 (character drawn facing right → flipped) |
| 3 | `waving` | 4 | 400 ms | hand: shoulder → overhead → down |
| 4 | `jumping` | 5 | 320 ms | ⚠️ currently the same static pose 5× |
| 5 | `failed` | 8 | 200 ms | head down → arms up, row darkened |
| 6 | `waiting` | 8 | 200 ms | sitting; upper body + head sway, lower body still |
| 7 | `running` | 6 | 267 ms | in-place run (unused by the reference client) |
| 8 | `review` | 6 | 267 ms | thinking: hand to cheek → finger up → arms crossed |

`loopMs` is **one full cycle of a row**, not one frame. Per-frame duration is
`loopMs / frames`. With `loopMs = 1600`, `running-right` (8 frames) steps every
200 ms, `waving` (4 frames) every 400 ms — that difference is why the same
`loopMs` reads as "fast walk, calm wave".

## Reference player (JavaScript)

```js
const FRAME_W = 192, FRAME_H = 208, COLS = 8;
const ROWS = ['idle','running-right','running-left','waving','jumping',
              'failed','waiting','running','review'];
const LOOP_MS = 1600;

function countFrames(img, row) {          // leading non-transparent cells
  const c = document.createElement('canvas');
  c.width = FRAME_W; c.height = FRAME_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < COLS; i++) {
    g.clearRect(0, 0, FRAME_W, FRAME_H);
    g.drawImage(img, i * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
    const a = g.getImageData(0, 0, FRAME_W, FRAME_H).data;
    let filled = false;
    for (let p = 3; p < a.length; p += 4) if (a[p] > 8) { filled = true; break; }
    if (!filled) return i;
  }
  return COLS;
}

// per frame:
// ctx.drawImage(img, frame * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
// advance when now - last >= LOOP_MS / frames
```

A complete, styled version of this is `demo/index.html` — it also demonstrates
frame-count detection, a click-to-wave override and a state switcher.

## pet.json

```json
{
  "id": "guangguo",
  "displayName": "光国",
  "description": "白发红瞳、黄色羽织的 Q 版女仆长",
  "createdBy": "Hermes + GPT",
  "spritesheetPath": "spritesheet.png",
  "loopMs": 1600
}
```

`spritesheetPath` is relative to the JSON file. `loopMs` is optional in general
client implementations; if your player has no notion of it, 1100–1600 ms per row
is a safe range.

## Conventions worth keeping if you add frames

- **Sit every pose on the same baseline.** The bottom of the feet/skirt is the
  anchor; the character's height may breathe by a few px, its floor must not move.
- **One scale for the whole action.** Normalise a group of keyframes by a single
  scale factor (median height), never per-frame — per-frame scaling flattens the
  bounce and turns a walk into a slide.
- **Give each keyframe an equal number of cells.** 2 keys into 6 cells = 3+3, not
  `A B A B A B` (which reads as a twitch, not a breath).
- **Don't centre each frame independently** if the action contains horizontal
  travel: centring cancels the displacement.
