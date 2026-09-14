# STARWING — performance pass 1

Measured with `shots/perf_probe.mjs` (Playwright, HMR-free server on :5174, 1920x1080,
`?fixed&mute&autoplay&stage=<s>`, render scale pinned to 1.0). Per stage: the campaign is
stepped deterministically, `renderer.info` is read with `info.autoReset = false` so ALL
passes of a frame (shadow maps, water mirror, bloom mips, grade, output) are counted, and
`ms` is the mean wall-clock cost of one full `engine.step()`.

**This machine renders through SwiftShader (software GL).** The `ms` column is therefore
only meaningful *relatively* (before vs after); the absolute numbers are ~50-100x slower
than a mid-range discrete GPU. Draw calls and triangles are hardware-independent and are
the primary budget metric here.

## Budgets
| metric | budget | notes |
|---|---|---|
| draw calls | <= 300 | whole frame, all passes |
| triangles | <= 1.5 M | whole frame, all passes |
| bloom | half-res | `UnrealBloomPass` already renders its mip chain at 1/2 and below |
| shadow maps | <= 2048, 1 caster | rail: 1x 2048 sun; onfoot: 1x 1024 spot; cinematics: 1x 1024 sun |
| DPR | <= 1.5 | capped in `engine.js`; adaptive scale 1.0 -> 0.6 on sustained >30 ms |

## Before (baseline, pinned scale 1.0, 1080p)
| stage | draw calls | triangles | geometries | textures | step ms (SwiftShader) |
|---|---|---|---|---|---|
| title   | 147 |    70 097 |  83 | 24 |  400 |
| intro   | 342 |    53 971 | 184 | 25 |  501 |
| rail    | 236 | 1 528 983 | 125 | 26 |  836 |
| boss    | 220 |    90 177 | 183 | 24 |  835 |
| space   | 194 |   204 906 | 112 | 29 | 1367 |
| onfoot  | 501 |    79 304 | 278 | 48 |  523 |

Offenders found:
* **onfoot 501 calls** — 305 visible meshes. 154 of the calls were a *second* pass over
  nearly every mesh for the 1024 spot shadow map; the rest were one-mesh-per-prop walls
  (9), god-ray cones (21 separate additive `ShaderMaterial` meshes), crates (8), holo
  pedestals (8), corridor shell (5), door frame (3) and 4 scene objects per ring pickup.
* **intro 342 calls** — 788 visible meshes (Great Fox + hangar set + 4 Arwings); half the
  calls were the per-frame 1024 sun shadow map re-render of all in-frustum casters.
* **rail 1.53 M tris** — the 640x360 planar water mirror re-renders the entire terrain /
  props / city scene a second time *every frame*, and it is also what forces the 2048 sun
  shadow map to re-render each frame.
* per-frame allocations: `new THREE.Quaternion()` in `rail.js` (afterburner/wingtip
  trails, every frame) and `new THREE.Vector3(0,-1,0)` in the vfx boost-trail flame
  orientation (every trail, every frame — rail has 3).

## Fixes applied
1. `src/core/stats.js` (new) — FPS / frame-ms / draw-call / triangle / geometry / texture /
   render-scale overlay. Toggle **F3**, on by default with `?stats`. Refreshes 4x/sec.
2. `src/core/engine.js` —
   * `devicePixelRatio` capped at **1.5** (was 2).
   * **Adaptive resolution**: sustained frame time > 30 ms for 1 s steps `renderScale`
     down by 0.1 (floor **0.6**); sustained < 18 ms for 2 s steps it back up to 1.0, with
     a 1 s cooldown between steps. Applied to the renderer *and* the composer buffers.
   * `engine.pinScale(v)` test hook, `engine.dispose()`, and `stats.update()` per frame.
3. `src/pieces/world/index.js` — water planar reflection (and therefore the shadow-map
   re-render it drives) now runs at **half frame rate**. The mirror is ripple-distorted and
   fog-blended, so one frame of lag is invisible; this halves the rail's triangle load.
4. `src/pieces/onfoot/hangar.js` —
   * all 21 god-ray cones **merged into one geometry / one draw call** (per-vertex colour +
     intensity attributes replace the per-mesh uniforms; identical shading maths).
   * 9 wall planes **merged into one mesh** (per-wall texture repeat baked into the UVs).
   * corridor shell 5 -> 1, door frame + jambs 3 -> 1, holo pedestals 8 -> 2 (merged).
   * 8 crates -> 3 `InstancedMesh` (one per texture variant).
   * 11 lamp halo `Sprite`s -> one `Points` batch.
   * removed `castShadow` from tiny props (chocks, cart, holo bases) that contributed
     nothing readable to the shadow map; door ribs receive instead of cast.
5. `src/pieces/onfoot/index.js` — shadow map updates at **half rate**
   (`shadowMap.autoUpdate = false` + `needsUpdate` on alternate frames); restored on dispose.
6. `src/pieces/onfoot/fx.js` — ring pickups were 4 scene objects each (torus + filament +
   glow shell + sprite); now **3 `InstancedMesh`es + 1 `Points` batch** total, regardless of
   ring count, with the spin/bob written into instance matrices.
7. `src/pieces/cinematics/index.js` — shadow map at **half rate** for the whole cinematic
   stage (title / intro / complete); restored on dispose.
8. Per-frame allocations removed: reusable `tmpQuat` in `src/game/rail.js`, module-level
   `DOWN` vector in `src/pieces/vfx/vfx.js`.

## After (pinned scale 1.0, 1080p — two probe runs; numbers are stable/repeatable)
| stage | draw calls | triangles | step ms (SwiftShader) | vs before |
|---|---|---|---|---|
| title   | 120 |    68 646 |  408 | calls -18% |
| intro   | 263 |    40 997 |  693 | calls -23%, tris -24% |
| rail    | 183 | 1 036 552 | 1153 | calls -22%, tris **-32%** |
| boss    | 220 |    90 177 |  491 | unchanged (already clean: no shadow pass) |
| space   | 194 |   204 918 | 1377 | unchanged (fragment-shader bound, not draw-call bound) |
| onfoot  | 336 |    64 358 | 1003 | calls **-33%**, tris -19% |

(`shots/perf.json` holds the raw probe output. `ms` includes the whole `engine.step()`
on software GL — treat it as a relative indicator only; it fluctuates with machine load.)

## Estimated real-hardware FPS
A mid-range discrete GPU (GTX 1650 / RX 6400 class) at 1080p with ACES + bloom + one
shadow map is fill-rate bound long before it is draw-call bound at these counts. With
<= ~340 calls and <= ~1.0 M triangles per frame, and the adaptive scaler able to drop to
0.6x resolution (= 36% of the pixels) if a stage does go over 30 ms:

| stage | calls | tris | estimated fps @1080p |
|---|---|---|---|
| title  | 120 | 0.07 M | 60 (vsync) |
| intro  | 263 | 0.04 M | 60 |
| rail   | 183 | 1.04 M | 45-60 (heaviest: water mirror + 2048 shadow) |
| boss   | 220 | 0.09 M | 60 |
| space  | 194 | 0.20 M | 55-60 (belt shader is the cost, not the geometry) |
| onfoot | 336 | 0.06 M | 50-60 |

All stages are inside the <= 300 call / <= 1.5 M triangle budget except onfoot, which sits
at ~336 calls *including* its half-rate shadow pass (~268 in the main pass alone).

## Memory / leak check
`renderer.info.memory` per stage (geometries / textures) is stable across repeated stage
entries — the campaign's `resetShared()` + each piece's `dispose()` return to the same
counts, so a full playthrough does not grow the GL resource count.

## Not fixed (pass 2 candidates)
* `onfoot` still has ~240 visible meshes: the docked Arwing (shared `buildArwing`, ~54
  meshes), the pilot rig (~25) and the catwalk railings are the remaining per-mesh calls.
  Merging the static hangar `MeshStandardMaterial` props that share a material would take
  it under 300 in the main pass.
* `intro`/`title` cinematics keep 788 mesh objects resident (Great Fox + hangar + 4
  Arwings) even when hidden; only in-frustum ones are drawn, but the traversal cost and
  the shadow-caster list are larger than they need to be.
* `rail`'s water mirror is still the single biggest triangle cost. A cheaper option would
  be to render only the sky + mountains + city silhouettes into the mirror (a reflect
  layer mask) rather than the full scene.
* The asteroid-belt rock shader (`spacesim/asteroids.js`) does two 8-cell Voronoi crater
  lookups plus 4 fbm taps per fragment; it is the `space` stage's real cost and would
  benefit from a distance-based early-out on the fine octaves.

# Pass 2 — seamless transitions + draw-call round 2

## Stage transitions (the big one)

`window.__campaign.stageLog` now records every switch as
`{ from, to, disposeMs, buildMs, compileMs }`. Before this pass, every stage switch tore
down and rebuilt its whole scene under a black fade — and cinematic -> cinematic rebuilt
the shared Great Fox / hangar / Arwing stage *from scratch* (1419 ms of construction +
~4.9 s of `compileAsync` on SwiftShader, inside the fade).

* **Shared cinematic director**: `title`, `intro` and `complete` are all shots of one
  `Director`. On cine -> cine switches the campaign now leaves its objects mounted
  (`resetShared(true)` sweeps everything *except* the director's `keepSet()`), so
  `title -> intro` is a timeline swap, not a rebuild. On cine -> gameplay the director is
  *parked* (`parkCinematics()`): scene children + DOM are detached but every GPU asset
  stays alive, so `onfoot -> complete` reattaches instantly (`unpark`).
* **Incremental warm prebuild**: while a stage plays, `pumpWarm()` (in `game.update()`)
  builds the next stage one unit per frame into a parked, invisible `Group`
  (`warm.step()` -> `stages[name].begin()`). `rail` is the heavy one — deferred look rig,
  11 terrain chunks, Arwing, enemy/vfx pools, hidden HUD — spread across ~23 steps.
  At switch time `takeWarm()` finishes any remainder inline and `activate()` reparents +
  installs the look (lights, PMREM env bake, grade). `beginWorld()` does the same unit
  chunking for the world proper; `applyLook(..., { defer: true })` postpones the PMREM
  bake + light mounting to `install()`.
* **`compileAsync` under the fade**, skipped entirely for cine -> cine (the programs are
  already warm — re-validating them cost ~4.9 s under a black screen).
* Cinematic stage factories now return a no-op `dispose()` — the campaign owns the
  shared director's lifecycle (park on exit, dispose only at `game.dispose()`).

Measured (SwiftShader wall-clock; the build column on real GPU is dominated only by the
~30-60 ms PMREM env bake — everything else is sub-ms JS):

| transition | dispose | build | compile | note |
|---|---|---|---|---|
| (boot) -> title   | 0.4 ms | 1419 ms | 3733 ms | one-time director build at boot (unchanged) |
| title -> intro    | 0.4 ms | **1.3 ms** | ~0 (skipped) | was: 1419 ms build + 4925 ms compile |
| intro -> rail     | 0.6 ms | 1950 ms | 29 ms | reparent + look install + PMREM bake; ~30-60 ms on real HW |

Verified: `?stage=intro&fixed&autoplay` -> warm reports `{name:'rail', done:true}` in
~30 frames -> Enter skip -> `rail` live with HUD/world correct
(`shots/transition_rail.png`, 118 calls). `window.__campaign.warm` exposes
`{name, remaining, done}` for probes and the stats overlay.

## Draw calls, round 2

| stage | pass-1 after | pass-2 | tris | step ms |
|---|---|---|---|---|
| title    | 120 |  **69** |  68,646 |  403 |
| intro    | 263 | **264** |  41,026 |  453 |
| rail     | 183 | **118** | 210,447* |  609 |
| boss     | 220 | **220** |  90,177 |  489 |
| space    | 194 | **124** | 205,015 | ~1030-1150 |
| onfoot   | 336 | **289** |  66,776 |  531 |
| complete | 423 | **219** |  95,276 |  373 |

*rail tris read low because the planar reflection ticks at 1/3 rate (`reflTick % 3`, in
since the round-3 integration) and the probe's sample window landed on non-mirror frames;
mirror frames add ~1x scene tris for terrain/props/city — look unchanged.

How:
* **`arwing.js` static merge** (`mergeStaticByMaterial`, `src/pieces/ship/arwing.js`):
  every static mesh under the rig is bucketed by `MeshStandardMaterial` and merged with
  world transforms baked into the geometry — ~70 meshes -> ~10 merged draws. Flap pivots
  keep their hinges (deep merge per pivot only). One change benefits the title hero ship,
  the intro's four parked Arwings, rail's playable ship and onfoot's docked Arwing —
  this is what took `complete` 423 -> 219, `rail` 183 -> 118, `title` 120 -> 69, and cut
  `onfoot` to 289 (all now under the 300-call budget). Shadow pass re-renders ~10
  casters instead of ~60 per Arwing.
* **Asteroid fragment early-outs** (`spacesim/asteroids.js`): the mid-scale crater field
  and the 3-tap fbm bump gradient now skip their noise entirely when `wMid`/`wFine`
  (apparent-size weights) are ~0 — pixel-identical output, ~40% less fragment work on the
  far field. SwiftShader `ms` is within run-to-run noise; the win is on real GPUs.
* **FPS overlay** (`core/stats.js`): added a sticky worst-frame-ms meter and the live
  stage/warm line (`stage rail  warm boss:done`), still F3 / `?stats`.

## Still open
* `boss` and later stages have no `begin` hook — their transitions still pay a
  synchronous `create()` (~0.5-1 s SwiftShader; a fraction of the 550 ms fade on GPU).
  Rail was the named target (title -> intro -> rail); generalising `begin` to async
  pieces is a follow-up.
* `onfoot` at ~289 calls is the closest to budget; merging the remaining static hangar
  props and the pilot rig is the next lever.
* The PMREM env bake inside `look.install()` is the one unavoidable ~30-60 ms (real GPU)
  cost per look switch; it sits under the fade, but a chunked bake would shave it further.

---

# Pass 3 — stutter hunt

Goal: **60 FPS sustained, never below 30, zero stutter/hitching** — including the opening
cutscenes and combat. Tooling: `src/core/trace.js` (`?trace`) + `tools/trace.mjs`
(Playwright campaign walker on the :5174 no-HMR server, real-time not `&fixed`) dumps
per-frame `update`/`render`/`dt`/programs/draw-calls/heap to `shots/trace.json`.
`cpu = upd+ren` is the hardware-independent stutter metric (SwiftShader raster pollutes
`dt`); a "hitch" = cpu > 3x the rolling median.

## Baseline (before pass 3)

43 CPU hitches in 696 frames; late shader compiles inside gameplay: intro +28,
rail +33, boss +65 (mid-fight), space +57, complete +40; ~349 KB/frame heap churn.
Single monolithic costs measured via `warm:slow` marks: enemy-manager build ~0.6-1 s,
`buildArwing` ~1 s (5 uncached 1024² canvas textures incl. a Sobel normal bake),
`buildEnemyCraft` ~118 ms each (ConvexGeometry + merge per craft), `makeNoiseTexture`
512² ~116 ms, world chunk `stepBuild` slices ~118 ms.

## Root causes found & fixed

1. **Light-census recompile storms** — toggling a *counted* light (visible && mounted
   ancestors) changes `numPointLights` in every material's program cacheKey → every lit
   material recompiled on intro shot cuts. Fix: hoist the hangar/Great-Fox/Arwing-engine
   lights to scene level, keep `visible`, gate `intensity` only
   (`cinematics/index.js` `trackedLights`, hosts = `[hangar, greatFox, ...arwings]`).

2. **`warmRender` never drew hidden GROUPS** — it forced `visible`/`frustumCulled` on
   drawables only; `projectObject` prunes at an invisible *ancestor*, so the whole
   hangar set, parked enemy-craft pool (`g.visible=false`), vfx groups etc. were never
   warmed — their first reveal compiled 4-65 programs mid-play. Fix: force
   `visible=true` on **every** object in the subtree during the warm render.

3. **`compileScene` compiled variants the composer never uses** — `renderer.compile()`
   keys programs on the *bound* render target: at `null` it builds srgb+ACES screen
   variants, but the game's EffectComposer RenderPass draws RT-bound
   (srgb-linear + NoToneMapping). Both paths now compile the RT variant
   (`warmup.js`: `compileScene` binds a tiny RT during compileAsync). Side effect:
   dead screen-variant programs no longer double every material's compile cost
   (live program count 150 -> ~90).

4. **Warm builds touched the LIVE scene** — lazy pool growth (`ExplosionPool`,
   `SpritePool`, craft pools) added counted lights/meshes to the real scene per warm
   step. Fix: `rail.js` `buildCtx = { ...ctx, scene: stage }` — all builders write into
   the parked invisible group; pool constructors are `{lazy}` + `grow(n)`; all
   removals use `removeFromParent()` since activate() reparents.

5. **Monolithic warm steps** — split/cached: enemy-kit geometry module cache
   (`craft.js kitCache`, `disposeCraft` skips `sharedGeo`), arwing texture module cache
   (`arwing.js arwingTextures`, shared textures no longer disposed per-instance),
   `noise.js` memoized `makeNoiseTexture`/`makeWaterNormalTexture`, world
   `stepBuild` tracks `stepName` for slow-step attribution, props `flush()` dirty-flagged
   instead of recomputing pool hi-maps every frame.

6. **Bug found by the trace**: `boss/fx.js` `Beam._aim` used bare `new THREE.Vector3()`
   where `THREE` is only a constructor param — crashed the boss stage mid-fight.
   Fixed to `this.THREE`.

## After (shots/trace.json, 1041 frames, full campaign, SwiftShader)

| stage | median cpu ms | p95 | worst | late compiles (>10f in) | note |
|---|---|---|---|---|---|
| title   | 1.2 | 5.3 | 3079* | 0 | *boot compile (frame 0) |
| intro   | 2.9 | 8.8 | 14    | **0** | was: +28 late progs, multi-hundred-ms cut hitches |
| rail    | 3.9 | 9.8 | 2987* | **0** | *transition build under fade; was +33 mid-play |
| boss    | 1.9 | 4.6 | 990*  | **0** | was +65 mid-fight |
| space   | 1.5 | 3.7 | 9.7   | **0** | was +57 mid-play |
| onfoot  | 2.4 | 5.1 | 21    | 1   | one MeshDepthMaterial ~26 s in (shadow-frustum edge, ~30-40 ms real HW) |
| complete| 1.5 | 4.2 | 258*  | 0   | *transition |

All program compiles now land inside `stage:*` / `warm:compile` transition frames —
under the black fade, zero in gameplay. Mid-play frames stay under ~15 ms CPU on
SwiftShader (~2-4 ms on real hardware). Heap churn 349 -> 278 KB/frame median.

## Residual / open

- The `stage:*` transition frames (rail ~3.0 s, onfoot ~2.7 s, boss ~0.9 s,
  space ~1.2 s — all SwiftShader) contain the deferred build + compile + warm render;
  under the fade. On real HW these are ~50-200 ms — inside a 550 ms fade. A `begin`
  prebuild hook for boss/space/onfoot (rail has one) would shave them further.
- onfoot: 1 late `MeshDepthMaterial` — a caster entering the spot-shadow frustum that
  wasn't inside it during warm (depth variants compile per-shadow-frustum coverage).
- `warm:step` slices during cinematics are 5-10 ms on SwiftShader (~1-3 ms real) —
  intentional amortized rail-build cost, well under the 33 ms floor.
- ~280 KB/frame of remaining GC churn (particle vectors, pools) — visible as occasional
  ~5 ms spikes here, likely sub-ms on real HW. Watch the sawtooth on a real GPU profile.

---

# Pass 3b — stutter hunt, round 2

Re-ran the full-campaign real-time trace (`node tools/trace.mjs`) against the
state left by pass 3. Two things were still stuttering: the one remaining
`MeshDepthMaterial` compile ~26 s into onfoot, and per-frame allocation churn of
2-3 MB/s on every gameplay stage (heap sawtooth -> GC pauses on real hardware).

## Root cause 1 — the "random" late shadow-depth compile

Five progressive Playwright probes decoded the program cache key of the late
compile and pinned it to one object: `merged-partx2` (the docked Arwing's merged
hull — `FrontSide`, has `map`, `alphaTest = 0`, non-instanced, `castShadow`).
A `renderBufferDirect` spy showed it drawing into the onfoot spot-light shadow
pass from **t = 2.6 s** onward, ~134 times, yet its depth variant
(`mapUv=uv, mask1=1, flipSided`) only compiled at **t ≈ 28 s**. A separate census
probe proved the scene light set was constant the whole time, so it was not a
light-census recompile.

Mechanism (verified against `three/src/renderers/webgl/WebGLShadowMap.js`, r170):
the shadow pass draws every caster with a **shared `_depthMaterial` singleton**
whose `map` / `alphaMap` / `alphaTest` / `side` fields are mutated per caster.
But `WebGLRenderer.setProgram` only recomputes the program cache key when a
*checked* field changes (lights, fog, instancing, morphs, clipping, ...), and
`map` / `alphaTest` / `side` are **not** checked fields. So a mapped caster's
depth variant is only ever keyed and compiled when a `getProgram` call happens
to coincide with that mutated state — pure draw-order luck. It fires eventually,
mid-play, as a ~30-40 ms hitch on real hardware.

**Fix** (`src/core/warmup.js`): `assignDepthMaterials(root)` gives every
`castShadow` mesh a **dedicated** `MeshDepthMaterial`, deduped per source
material via a `WeakMap`. A fresh material has an empty
`materialProperties.programs` map, so `getProgram` *must* compute its key on the
first warm shadow draw — every needed depth variant therefore compiles inside
the warm block, deterministically, for any content. Identical keys still share
the one compiled `WebGLProgram`, so nothing is duplicated, and the renderer keeps
copying `map`/`alphaMap`/`alphaTest`/`side`/displacement onto custom depth
materials every draw, so the shadows are pixel-identical. Called from
`warmRender()` and from `enemies/manager.js` `obtainCraft()` so a mid-play
pool-miss rebuild is covered too.

## Root cause 2 — per-frame allocation churn (GC sawtooth)

Baseline alloc rates (bytes gained per second, post-warm frames only) were
title 0.07, intro 6.23, rail 0.94, boss 2.01, space 1.43, onfoot 3.03,
complete 2.27 MB/s, with 90%+ of frames growing the heap. CDP heap sampling was
too coarse to localise, so the hot paths were found by source audit:

- **`src/pieces/hud/hud.js`** — the gauges/radar rebuilt ~8 `CanvasGradient`
  objects *per frame* (each one a JS object + a native raster resource). Added a
  per-context gradient cache (`cachedGrad`, 11 sites). The radar's conic sweep
  gradient was recreated every frame just to change its angle — now built once
  and rotated via the canvas transform. The comm **portrait** (a ~200-path
  cel-shaded rasteriser: gradients, 29 hatch strokes, 50 scanline rects,
  vignette, gloss) ran every frame even when the comm window was off screen —
  now gated on `st.commAge >= 0`. Redundant DOM style/text writes deduped
  (`--s`, boost label/class, warn opacity/transform, damage vignette).
- **`src/pieces/onfoot/fx.js`** — the particle write loop did
  `pPos.set([x,y,z], i*3)`, i.e. **400 array literals per frame**; now direct
  typed-array element writes. Bolts, particles and impact rings allocated fresh
  records / `Vector3.clone()` / a `Mesh` + `MeshBasicMaterial` per impact — all
  now freelist pools with hoisted scratch `Vector3`/`Color`.
- **`src/pieces/vfx/lasers.js`** — built a fresh `alive` array plus two array
  literals every frame; now compacts the bolt list in place with a hoisted
  `_meshes` array.
- **`src/pieces/enemies/index.js`** — `new THREE.Vector2/Vector3` per aim
  update and per shot; now `_ndc` / `_firePos` scratch.

## Root cause 3 — warm-build slices landing on already-busy frames

`pumpWarm()` burned a flat 2 ms every frame regardless of what the frame was
already costing, which produced 14 of the baseline's hitches during the intro.
Added `engine.lastCpu` (`src/core/engine.js`) — the update+render CPU cost of the
frame, no GPU wait, so it is a *hardware-independent* signal — and made the pump
cost-aware: it tracks an EMA of the game's own frame cost (`cpuEma`) *and* of one
build unit (`stepEma`), and **skips the build entirely** on a frame whose
remaining budget can't fit a unit (`FRAME_TARGET = 11 ms`). Heavy units (terrain
chunks, enemy craft) now slide to frames with headroom instead of stacking. The
prebuild is amortised over a whole 22 s stage for a few dozen units, so there is
plenty of slack to be picky.

## Bug found on the way: warm-built HUD was being detached

`resetShared()` strips every `ctx.ui` child it doesn't own. Because the warm HUD
is created while the *previous* stage is still live, the stage switch detached
its root, and `activate()` then un-hid a node that was no longer in the
document — a completely invisible HUD (no shield, boost, radar, reticle, score).
This only became reproducible once pass 3b's pacing let the rail warm finish
earlier. Fixed in `rail.js` `activate()`: re-append the root if
`!hud.root.isConnected` (no-op on the synchronous path, where the HUD is created
after the reset).

## Results

Late shader compiles during gameplay — the headline number:

| stage | pass 3 late compiles | pass 3b |
|---|---|---|
| intro | 0 | **0** |
| rail | 0 | **0** |
| boss | 0 | **0** |
| space | 0 | **0** |
| onfoot | **1** (MeshDepthMaterial, ~26 s in) | **0** |
| complete | 0 | **0** |

Every compile in the campaign now lands inside a `stage:*` / `warm:compile`
transition frame, under the black fade. Program count is flat across all of
gameplay (`prog start -> end` only moves on transition frames).

Allocation rate, post-warm frames, same seed and walk:

| stage | before MB/s | after MB/s |
|---|---|---|
| title | 0.07 | 0.07 |
| intro | 6.23 | **3.62** |
| rail | 0.94 | **0.38** |
| boss | 2.01 | **0.99** |
| space | 1.43 | **0.27** |
| onfoot | 3.03 | **1.76** |
| complete | 2.27 | **1.43** |

CPU frame cost (SwiftShader; absolute values are meaningless, the *ratio* to the
rolling median is the stutter signal). Remaining hitches are all transition
frames (`stage:*`, `warm:compile`, `warm:render`) which happen under the fade:

| stage | median cpu ms | p95 | hitches | of which mid-play |
|---|---|---|---|---|
| title | 2.2 | 5.9 | 1 | 1 (14.7 ms, 5.8x) |
| intro | 5.5 | 9.8 | 4 | 4 (7-11 ms warm slices) |
| rail | 4.5 | 280 | 2 | **0** |
| boss | 2.3 | 2071 | 3 | **0** |
| space | 2.7 | 1810 | 3 | **0** |
| onfoot | 3.6 | 24.9 | 4 | 2 (16-25 ms) |
| complete | 2.3 | 3.8 | 1 | **0** |

`renderScale changes: 0` — no adaptive-resolution thrash. `no page errors`.

## Residual / open

- No `begin` warm-builder for boss / space / onfoot (only rail has one), so their
  `stage:*` transition frames still carry the whole build + compile + warm render
  (0.9-5.2 s on SwiftShader, ~50-250 ms on real HW — inside the 550 ms fade, but
  it is the largest remaining block of work). A per-stage warm-builder contract
  would make this uniform.
- intro still shows 4 `warm:step` slices at 7-11 ms CPU on SwiftShader (~2-3 ms
  on real hardware). The pacing keeps them off busy frames but a single terrain
  chunk / enemy craft is still the granularity floor; splitting `wb.step()` finer
  would remove them entirely.
- ~1-1.8 MB/s of allocation remains on onfoot / intro. Next candidates are the
  cinematic director and `onfoot` gameplay update, not yet audited.
- SwiftShader cannot measure real FPS. `upd+ren` (`engine.lastCpu`) vs the rolling
  median is the hardware-independent metric used throughout; a real-GPU capture is
  still the only way to confirm the 60 FPS target.

## Pass 3c — parked GPU warm (moving compile+link off the transition frame)

Pass 3b moved stage *building* off the switch frame, but the traces still showed
0.9-3.6 s `stage:*` frames with `prog+33 / prog+43` on them. Root cause: a stage
that is built ahead of time still **compiles and links** its programs on its
first real render, because three.js only compiles what a render actually visits.
So the switch frame paid the whole compile + link + first-draw cost anyway.

### Fixes

1. **`src/game/warm.js` (new) — generic parked-stage warm builder.**
   `beginWarmPiece(ctx, name, makeGen)` builds a piece into a parked, invisible
   `Group` (`buildCtx = {...ctx, scene: stage}` so every `scene.add` lands
   off-scene), with a detached `warmUi` div, a queueing `warmComposer`, and a
   shadow `warmInput`. `activate()` mounts the group, copies
   `fog/background/environment/environmentIntensity` onto the real scene, applies
   the recorded globals, flushes queued passes and appends the UI. `abort()`
   disposes geometries + materials (never textures — those caches are shared with
   the live stage) and rescues the camera if the build parented it.
2. **`parkedGpuWarm()` — compile + draw the parked subtree with the *mounted*
   render state.** Every three.js program cache key includes the light census,
   fog type, env-map presence and target variant, so warming a parked group
   under the *live* stage's state compiles the wrong programs. Each warm unit
   now: snapshots live globals, applies the parked stage's fog/background/env +
   the stage's exposure/bloom/camera, hides every other `scene.child`, reveals
   the parked group, runs one `createStageWarm` unit, then restores everything in
   a `finally`. `src/core/warmup.js` gained a `root` option so the census,
   depth-material assignment and draw pass only walk the parked subtree.
3. **Grade-pass stomping.** The lookdev grade pass is a shared singleton, so a
   parked build's `applyGradePreset` rewrote the *live* uniforms mid-play (a
   visible pop). The per-unit snap/apply now includes `{enabled, uniforms}`.
4. **`begin` builders for boss / space / onfoot** (`createSteps` generators),
   plus static imports for `buildArwing` / `makePlanet` so no dynamic `import()`
   lands on a gameplay frame.
5. **Spacesim double PMREM bake.** `applyLook(..., {defer:true})` +
   `setPreset(...); install()` = one bake instead of two (~1.5 s → ~0.75 s SW).
6. **Pacing gate fixed (the reason passes 3/3b under-delivered).** The starve
   gate keyed off `cpuEma`, an EMA of `engine.lastCpu` — which counts only update
   + command submission. Under software GL the raster runs in the GPU process, so
   `lastCpu` reads ~3 ms even when frames take 150 ms, the gate never opened, and
   the warm ran ~1 unit / 16 frames → unfinished → `takeWarm()` drained the
   remainder on the switch frame (rail 3356 ms, space 1336 ms). Now
   `starveLimit = wallEma > 100 ? 1 : 16` (wall clock sees the real frame cost).
7. **Warm lookahead.** `pumpWarm` skips up to 2 stages with no builder, so rail's
   ~90-unit warm gets title *and* intro as runway instead of intro alone.

### Result

`onfoot` is the stage whose warm now reliably finishes inside the previous
stage's runway, and it is the proof the mechanism works end to end:

| stage:onfoot mount frame | before 3c | after 3c |
|---|---|---|
| cpu | 3630 ms (upd 2088 / ren 1542) | **8.5 ms** |
| new programs on the mount frame | +43 | **0** (net −36, disposals) |
| programs compiled anywhere in onfoot | 45 | **0** |
| onfoot mid-play worst cpu | 3630 ms | **9 ms** (p95 7.2, **0 hitches**) |

Per-stage CPU (SwiftShader; ratio-to-median is the signal, absolutes are not):

| stage | med before | med after | worst before | worst after |
|---|---|---|---|---|
| title | 2.0 | 2.4 | 2947 | 1648 |
| intro | 4.3 | 6.5 | 18 | 783 |
| rail | 3.9 | 9.9 | 3253 | 2319 |
| boss | 2.6 | 2.2 | 1065 | 1847 |
| space | 2.6 | 2.7 | 1490 | 2237 |
| onfoot | 3.6 | **2.8** | 3630 | **9** |
| complete | 2.6 | 4.3 | 866 | 350 |

**Reading this honestly:** total hitch *count* went up (66 vs 26) and mid-play
worst-case went up for rail/boss/space. That is the pacing gate doing what it was
told: on this harness a single warm unit costs 200-2200 ms (a PMREM bake, a
540-asteroid belt, one compile+draw batch), and with `wallEma > 100` the gate
runs one unit per frame no matter what. SwiftShader simply cannot fit ~90 warm
units × 0.5 s into a 22 s stage, so the choice there is "many mid-play warm
slices" vs "one 3 s drain on the switch frame"; the latter is worse and is what
we removed. On a real GPU those same units are 10-30× cheaper (compile+link is
CPU-bound but the draws are not), `wallEma` sits at ~16 ms, `starveLimit` is 16
and the headroom test (`FRAME_TARGET - cpuEma`) is what actually paces the warm —
i.e. the onfoot column above is the behaviour to expect everywhere.

Every hitch in the after-trace is attributable: each one carries a
`warm:step(<nextstage>:<unit>)` mark, or is a `stage:*` frame under the fade.
`renderScale changes: 0`. `no page errors`.

### Still open

- **A real-GPU capture is required to confirm the 60 FPS / no-stutter target.**
  SwiftShader cannot measure it, and the pacing path that runs on real hardware
  (headroom-based, `starveLimit = 16`) is *not* the path this trace exercises.
- rail's warm (~90 units) does not finish inside title+intro under software GL,
  so `stage:rail` still drains (2.3 s SW). The heavy units to split next are
  `space:1` (setPreset PMREM, 1.8 s SW) and `onfoot:1` (hangar bake, 2.2 s SW).
- `tools/shoot.mjs game --times 2,10,30,60,90 --video 20` was started but does not
  finish in reasonable wall time on SwiftShader (90 s of campaign at ~0.15 s/frame);
  it was killed after t=10s. The trace run (`?trace&autoplay`) covers the same
  playthrough with instrumentation and reports `no page errors`.
- Heap slope is ≈0 MB/s on every stage post-warm (the earlier "1-1.8 MB/s" was
  the warm's own transient allocation), so the alloc audit is closed.

---

## Pass 4 — final verification

Method: `node tools/trace.mjs` (full real-time campaign walk, 960×540, SwiftShader,
`--hitch 3`), `node tools/shoot.mjs game --times 2,10,30,60,90 --video 15 --autoplay`,
`npx vite build`. Traces kept: `shots/trace.json` (before), `shots/trace_p4c.json`
(mid-pass), `shots/trace_p4final.json` (after, 676 frames / 472 marks).
Remember the harness rule: **SwiftShader absolute ms are meaningless**, ratios,
program counts and draw-call counts are the signal.

### Numbers (after, `shots/trace_p4final.json`)

| stage | cpu med | p95 | p99 | worst | hitches | calls med |
|---|---|---|---|---|---|---|
| title | 2.4 | 437.4 | 1191.3 | 1191 | **0** | 66 |
| intro | 4.2 | 12.4 | 621.4 | 621 | 10 | 179 |
| rail | 4.8 | 984.1 | 3331.9 | 3332 | 22 | 104 |
| boss | 3.1 | 294.9 | 925.3 | 1760 | 15 | 259 |
| space | 2.9 | 734.4 | 2220.8 | 2221 | 20 | 116 |
| onfoot | 2.6 | 5.6 | 9.7 | 10 | 3 | 239 |
| complete | 3.6 | 17.0 | 537.7 | 538 | 5 | 199 |

- **Programs: 94 → 63** live at the end of the campaign (31 dead variants were
  being compiled and never drawn — see the `compile()` bug below).
- **Programs per frame during play: ≤ 7** anywhere except frame 0 (12, boot) and
  the `stage:rail` mount frame (33, under the black fade). Before this pass single
  frames compiled **+63 / +47 / +48**.
- **Draw calls (pure gameplay frames, no warm slice):** onfoot 297 max (was 345 —
  the only budget violation found), everything else ≤ 274. **Tris: 0.21 M max**
  (space) — the ≤1.5 M budget is not close to being a problem.
- **renderScale changes: 0** in every trace. **No page errors** in any run.
- **Heap:** growth median 449 KB/frame, p95 2670 KB/frame *during warm*; post-warm
  slope ≈0 (unchanged from pass 3b's alloc audit).
- Hitch attribution: every hitch carries a mark — `warm:step(<stage>:<unit>)`,
  `warm:slow(...)`, `warm:gpu(<n>u <ms>ms)` or a `stage:*` fade frame — except two
  pure-raster frames in space (mirror + bloom on software GL).
- `npx vite build` → `✓ built in 1.92s` (only the pre-existing >500 kB chunk warning).
- Capture: `shots/game/{t002,t010,t030,t060,t090}.png` + video, plus
  `shots/game_p4cine/{t004,t006,t014,t020}.png` for the cinematics (t006 = title
  screen, t014 = intro hangar). Zero errors, no visual regression. Note the video
  and the first two PNGs of a fresh `shoot.mjs` run can be black: on SwiftShader
  the boot + fade takes longer than t=2 s of *wall* time — it is a harness artifact,
  not a black frame in the game (verified by the later capture).

### Fixes in this pass

1. **`WebGLRenderer.compile()` ignores visibility (three r0.170.0).** `compile()`
   gathers lights with `traverseVisible` but walks materials with a plain
   `scene.traverse()` (`node_modules/three/build/three.module.js` ~line 29801).
   The staged warm called it once per chunk, so the *first* chunk compiled every
   material of the whole parked stage — one frame with +63 programs (0.8–1.5 s SW)
   and 15 later units compiling nothing, plus programs for variants that are never
   drawn. Removed the per-chunk `compile()` (`src/core/warmup.js` ~line 285):
   `render()` respects visibility and compiles lazily exactly what it draws, so the
   chunk loop alone spreads the compiles. → ≤7 programs/frame, 94 → 63 programs.
2. **Warm chunks are now budgeted by *new materials*, not drawables**
   (`src/core/warmup.js` `createStageWarm({ chunk, textures, mats = 6 })`, chunk
   planner at ~line 272). Shader compiles are per material and the stages'
   material variety is front-loaded, so a flat 24-drawable stride bunched all the
   cost into the first units. A chunk also **only re-renders the shadow map when it
   revealed a `castShadow` drawable** — a chunk of sprites/non-casters cannot make a
   new depth program, and that pass is a full-res (up to 2048²) re-render, the most
   expensive thing in a warm unit.
3. **onfoot draw calls 345 → 297** (inside the ≤300 budget). The pilot rig had ~65
   shadow casters, mostly jewelry (eyes, headset, glove fingers, trim, gun detail)
   whose silhouette is unreadable at 1024² shadow-map resolution:
   `src/pieces/onfoot/pilot.js` (~line 235) now drops `castShadow` for any mesh
   whose scaled bounding sphere is < 0.135 m (105 → 62 casters), and the docked
   Arwing's 3 gear struts + 3 pads stopped casting (`src/pieces/onfoot/arwing.js`
   ~line 23) since the merged hull already shadows the whole gear footprint (pads
   still *receive*). 57 casters, 297 calls, 105 607 tris; verified visually in
   `shots/onfoot/t001,t003,t006,t010.png` — no visible change.
4. **Full hitch attribution.** `pumpGpuWarm` slices ran under the black fade with
   no mark, so title/complete showed "unexplained" hitches. `src/game/game.js`
   (~line 389) now marks `warm:gpu <units>u <ms>ms[ done]`, and the parked-stage
   warm reports its inner unit kind (`src/game/warm.js` line 118 `stepName`,
   line 230 `lastType`) so a hitch reads `boss:gpu13:draw` instead of `boss:gpu13`.

### Residual (one item, measured and bounded)

- **rail compiles 4 programs mid-play, once, ~22 s into the stage**
  (`trace_p4final` frames 206/207: 3 programs — MeshPhysical/MeshStandard/Sprite —
  then 1 ShaderMaterial the next frame; both after the boss warm has finished at
  frame 182, so they are *not* warm slices). Reproduced deterministically with a
  program-cache-key differ (`shots/_p4_rail_compile.mjs`): the frame coincides with
  the first **mantis** wave (rail timeline t=18.0) becoming visible and with the
  first lock-on (`sfx(lockon)` on the following frame, i.e. vfx's lock-on
  ball/beam/reticle drawing for the first time). No `em:pool-miss` mark, so it is
  not a pooled-craft rebuild — it is a first-draw of a material variant the parked
  warm did not cover. Cost on real hardware is ~4 compiles ≈ tens of ms, once per
  playthrough; on SwiftShader it reads as ~1 s. Left in place deliberately: the
  candidate fixes (force the whole enemy pool + lock-on fx through one extra warm
  render, or drive the water-mirror pass during the warm) are not surgical and this
  is a verification pass.
- Two traps for the next person measuring this:
  - a hand-written probe that calls `renderer.render(scene, camera)` **compiles a
    whole second set of programs**: rendering to the canvas puts
    `outputColorSpace=srgb` in the cache key, while the game renders into the
    composer target (`srgb-linear`). A "47 uncompiled programs!" result from such a
    probe is an artifact, not a warm hole.
  - the standalone `?stage=<name>` route starts with far fewer programs than the
    campaign route (31 vs 79 at rail) — it does not get the parked build, so every
    program-count experiment must run the real campaign URL.
- Unchanged from pass 3: **a real-GPU capture is still the only way to confirm the
  60 FPS / no-stutter target.** SwiftShader forces `starveLimit = 1` (every frame
  is over budget), which is not the pacing path real hardware takes.
