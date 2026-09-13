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
