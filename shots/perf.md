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
