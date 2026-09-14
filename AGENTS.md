# STARWING — agent guide

Browser rail shooter / space sim / third-person action game in Three.js, aiming
at Nintendo first-party (Star Fox) visual and feel quality.

## Layout
- `src/core/` engine (renderer, ACES tonemapping, bloom composer, input, audio bus, rng, events). Do not edit unless you own "core".
- `src/pieces/<name>/index.js` one independently judged piece. Contract: `export async function create(ctx) -> { update(dt,t), dispose(), camera? }`.
  `ctx = { THREE, scene, camera, renderer, composer, bloom, input, ui, audio, rng, events, size, engine }`.
  Put a piece's helpers in its own folder; export reusable things (e.g. `ship` exports `buildArwing()`) so other pieces can import them.
- `src/pieces/_shared/` shared helpers (only the integrator edits this).
- `src/game/game.js` the full stitched game (integrator only).
- `tools/shoot.mjs` headless render harness. `tools/frames.sh` video -> stills.

## Running
- Dev server is already running at http://localhost:5173 (Vite HMR). Do NOT restart it. If it's down: `source ~/.nvm/nvm.sh && npx vite`.
- Standalone piece: http://localhost:5173/?piece=<name>  (`&fixed` deterministic step, `&seed=N`, `&autoplay` uses `input.script`, `&mute`).
- Render it (tools/shoot.mjs auto-uses the HMR-free render server on :5174 so other agents’ edits can’t reload your page mid-capture; if you write your own playwright probes, ALSO use http://localhost:5174): `source ~/.nvm/nvm.sh && node tools/shoot.mjs <name> --times 1,3,6,10 --video 8` → `shots/<name>/t*.png`, `video.webm`, `errors.txt`.
  Then `bash tools/frames.sh shots/<name>/video.webm` for a motion contact sheet. LOOK at the PNGs (read the image files) — never trust a summary.
- Headless rendering uses SwiftShader (software GL): slow FPS is expected there; judge visuals, not fps. Keep real-GPU perf sane anyway (instancing, merged geometry, <= ~300 draw calls).

## Input bindings
move WASD/arrows, fire Space/J, bomb B, boost Shift, brake Ctrl, roll Q/E, pause Esc, confirm Enter. `input.axes.x/y`, `input.isHeld('fire')`, `input.wasPressed('bomb')`.
Mouse: in flight stages (rail, boss, space, flight) moving the mouse steers the ship — cursor offset from centre = stick deflection (`input.mouse.steer`, opt-in per stage, small dead zone + response curve). LMB = fire and also 'confirm' (a click = start/skip), RMB/MMB = bomb; the first click on the canvas grabs pointer lock (deltas then drive a virtual stick), Esc releases it. Right-click context menu is suppressed on the canvas.
Every piece MUST set `ctx.input.script = (t) => ({x, y, buttons:[...]})` with a scripted demo so `--autoplay` shows the piece off (and so critics see motion). The script path bypasses physical input entirely, so captures stay deterministic.

## Quality bar (what the critic compares against)
Star Fox on Switch 2 (Nintendo first-party): clean stylised-realistic shading, strong art direction, saturated but controlled palette, chunky readable silhouettes, glowing G-diffusers, crisp laser bolts, volumetric-feeling atmosphere/sky, confident camera, snappy animation with anticipation/overshoot, screen-filling explosions, cinematic framing, beautiful HUD typography. No default-grey materials, no untextured flat planes, no z-fighting, no visible seams, no NaNs, no console errors.

## Rules for builders
- Only edit files inside your piece folder (`src/pieces/<name>/`). You may import from other pieces read-only.
- Never switch git branches, never run `git reset/checkout/stash`, never kill the dev server, never delete files outside your folder. Commit your own folder when done: `git add src/pieces/<name> && git commit -m "<name>: ..."`.
- No external asset downloads: build geometry procedurally / with Three.js primitives, shaders, canvas textures, procedural noise. Three.js addons are available (`three/addons/...`).
- Verify with `tools/shoot.mjs` and actually view the images before you report.
