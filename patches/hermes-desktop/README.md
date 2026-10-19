# Hermes desktop patch — click to wave, and sit while busy

This is **not** part of the art pack. It is a small patch against the
[Hermes](https://github.com/NousResearch/hermes) desktop app (MIT) that makes the
pet behave the way the atlas was designed to be used:

| behaviour | before | after |
|---|---|---|
| click the pet | nothing | plays `waving` for one full loop |
| agent is working | loops `running` in place (looks like a treadmill) | sits in `waiting`, upper body swaying |
| a turn finished while you were away | jumps once | keeps sitting until you come back |

Two independent changes, both in `apps/desktop/src`:

1. **`floating-pet.tsx`** — `pointerup` with less than 6 px of travel counts as a
   click and calls `flashPetActivity({ justCompleted: true })`; anything more
   still drags. The 6 px slop is what keeps a click from eating a tiny drag.
2. **`store/pet.ts`** — a new `$petPose` derived atom folds the *pose* of a busy
   `run` into `waiting`, **without touching `$petState`**. The speech bubble keeps
   reading the semantic state (it should still say "heads down" while working);
   only the sprite reads the pose. `deriveLivePetState` also maps
   `idle + unread` to `waiting`.

## Apply

```bash
cd path/to/hermes            # the repo root, with apps/desktop present
git apply --check patches/hermes-desktop/pet-click-wave-and-busy-sit.patch
git apply          patches/hermes-desktop/pet-click-wave-and-busy-sit.patch
```

Then rebuild the renderer and drop it into the **unpacked** app directory
(this is how the shipped desktop app loads UI code — `app.asar` contains no `dist/`):

```bash
cd apps/desktop
npm install
npx tsc -p . --noEmit                       # expect zero errors
npx vitest run --project ui src/store/pet.test.ts src/components/pet
npm run build

# back up first, then copy the fresh renderer over the shipped one
U="../release/win-unpacked/resources/app.asar.unpacked"
cp -r "$U/dist" "$U/dist.bak-$(date +%Y%m%d_%H%M)"
cp -r dist/. "$U/dist/"
```

Restart Hermes. The renderer is not hot-reloaded: **if the app process started
before you copied the files, nothing changes** — check the process start time
before concluding the patch is broken.

## Unapply

`git checkout -- apps/desktop/src` (or apply the patch with `-R`), rebuild, copy
`dist.bak-*` back. `hermes update` also overwrites both the source and the
unpacked renderer, so after any update you have to reapply and rebuild.

## Notes

- The animation only changes if the atlas has the rows it asks for
  (`waving` for the click, `waiting` for the sit) — which is what this repo ships.
- `$petPose` needed a matching stub in `pet-sprite.test.tsx`; the patch includes
  the test changes, 37 tests pass.
