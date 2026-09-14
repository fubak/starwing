import asyncio
import json
import os
import time
from datetime import datetime, timezone

REPO = "/home/ubuntu/repos/starwing"
PROGRESS = os.path.join(REPO, "public", "progress.json")
ROUNDS = 3

with open(PROGRESS) as f:
    state = json.load(f)


def save(msg=None):
    if msg:
        state["log"].append(f"{datetime.now(timezone.utc).strftime('%H:%M:%S')} {msg}")
        state["log"] = state["log"][-200:]
        log(msg)
    state["updated"] = int(time.time())
    tmp = PROGRESS + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, PROGRESS)


COMMON = f"""You are working in the repo at {REPO} (a Three.js browser game, STARWING). Read {REPO}/AGENTS.md and {REPO}/shots/perf.md FIRST (perf.md documents two previous perf passes — do not redo that work, build on it).
Servers: http://localhost:5173 (HMR) and http://localhost:5174 (no-HMR, used by tools/shoot.mjs). If down: `cd {REPO} && source ~/.nvm/nvm.sh && (nohup npx vite > /tmp/vite.log 2>&1 &)` and `(NO_HMR=1 nohup npx vite > /tmp/vite-render.log 2>&1 &)`.
Never switch git branches, never run git reset/checkout/stash/clean. `source ~/.nvm/nvm.sh` before node/npx. You are the only agent editing the repo."""

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "trace": {"type": "string"},
        "fixed": {"type": "string"},
        "remaining": {"type": "string"},
    },
    "required": ["summary", "trace", "fixed"],
}


def prompt(rnd, prev):
    prior = f"\nPREVIOUS ROUND FOUND THESE STILL-OPEN ITEMS — attack them first:\n{prev}\n" if prev else ""
    return f"""{COMMON}

THE USER'S REPORT (authoritative): "There is still major stutters and performance issues." The user plays in a normal Chrome on real GPU hardware. Target: **60 FPS sustained, never below 30, and NO stutter/hitching anywhere** — including the opening cutscenes and during combat. Previous passes optimized draw calls and stage transitions but nobody ever measured an actual frame-time trace of a full playthrough. That is your job this round ({rnd}).
{prior}
This box has software GL (SwiftShader), so absolute FPS is meaningless — but STUTTER IS STILL VISIBLE IN A TRACE: a hitch is a frame whose cost is many times the rolling median. Shader compilation, texture uploads/decodes, mid-play object/pool construction, GC from per-frame allocations, PMREM bakes, and shadow-map rebuilds all produce those spikes and they show up on any GPU.

STEP 1 — INSTRUMENT AND TRACE (do this before changing anything):
* Add a frame-time tracer to the engine (e.g. `src/core/trace.js`, enabled with `?trace`): record per-frame `dt`, the rolling median, the current stage, `renderer.info.programs.length`, draw calls, and JS heap (`performance.memory.usedJSHeapSize` when available). Keep the last N thousand frames and expose `window.__trace.dump()` returning JSON.
* Write a Playwright script (`tools/trace.mjs`) that plays the ENTIRE campaign against the no-HMR server with `--autoplay`, in real time (not `&fixed`), from title through mission-complete, then dumps the trace to `shots/trace.json` and prints a per-stage report: median frame ms, p95, p99, worst, and a LIST OF EVERY HITCH (frame > 3x rolling median) with its stage, timestamp, program count delta, draw-call delta, and heap delta at that frame. Correlate each hitch with what the game did on that frame (add lightweight named markers in the code where scenes/pools/effects are created, e.g. `trace.mark('vfx:explosion-pool-grow')`).
* Also use Chrome tracing where useful: Playwright can capture `page.context().tracing` or a CDP `Profiler`/`Performance` trace to attribute a hitch to compile vs GC vs raster.

STEP 2 — DIAGNOSE, then FIX the actual causes. Likely suspects, verify each with the trace before and after:
* **Shader compilation during play.** `src/game/game.js` currently races `renderer.compileAsync` against a 120 ms timeout, so compilation can silently spill into gameplay. Replace this with real preloading: at boot (behind the title screen / a short "LOADING" state), build and compile EVERY stage's materials — or at minimum warm every material/light-configuration permutation actually used — so `renderer.info.programs.length` stops growing once play begins. Verify from the trace that program count is flat during gameplay.
* **First-use texture/canvas upload.** Procedural canvas textures decode/upload on first draw. Force uploads at load time (`renderer.initTexture`) for every texture, including HUD/portrait canvases and particle sprites.
* **Mid-play allocation.** Pre-allocate and pre-warm every pool (lasers, explosions, debris, particles, enemies, trails) to its worst-case size at stage start, and make sure nothing does `new THREE.*`, array growth, or string building per frame in the hot loop. Grep for `new THREE.` inside update paths across `src/` and fix all of them, not just the previously-noted two.
* **GC pressure**: watch the heap slope in the trace; a sawtooth that coincides with hitches means garbage per frame.
* **Shadow map / reflection / PMREM rebuilds** landing on gameplay frames — stagger or cache them.
* **Adaptive resolution thrash**: if `renderScale` oscillates it looks like stutter; add hysteresis and confirm from the trace it settles.
Do not degrade the visuals — this is an optimization pass.

STEP 3 — VERIFY: re-run `node tools/trace.mjs`, and report the before/after per-stage table (median/p95/p99/worst + hitch count). Success = zero hitches above 3x median during gameplay stages and a flat program count. Also confirm the game still plays through: `node tools/shoot.mjs game --times 2,10,30,60,90 --video 20 --autoplay`, look at the PNGs, and check `shots/game/errors.txt` is empty.
Write your findings into `shots/perf.md` as a "Pass 3 — stutter hunt" section, including the hitch table and what each hitch turned out to be.
Commit everything (`git add -A src tools shots/perf.md shots/trace.json && git -c user.name=perf -c user.email=perf@starwing commit -m "perf: stutter pass {rnd}"`).
Report: summary, trace (the before/after per-stage table + hitch list), fixed (each root cause and its fix), remaining (anything still hitching — empty if none)."""


async def main():
    await register_workflow({
        "name": "starwing-stutter-hunt",
        "description": "Trace-driven stutter elimination and real asset/shader preloading; 60fps target, 30fps floor.",
        "product": "STARWING (Three.js browser game)",
        "soft_time_limit_minutes": 60,
        "phases": [{"title": "perf", "detail": "trace a full playthrough, find hitches, fix root causes"}],
    })
    state["phase"] = "stutter hunt: tracing full playthrough"
    save("=== PERF PASS 3: trace-driven stutter hunt ===")
    prev = ""
    for rnd in range(1, ROUNDS + 1):
        state["phase"] = f"stutter hunt round {rnd}"
        save(f"stutter round {rnd} start")
        try:
            res = await agent(prompt(rnd, prev), phase="perf", schema=SCHEMA,
                              label=f"stutter-{rnd}", vm_mode="shared", soft_time_limit_minutes=60)
        except WorkflowAgentError as e:
            save(f"stutter round {rnd} FAILED: {e}")
            break
        save(f"stutter round {rnd} done — {res['summary'][:200]}")
        prev = res.get("remaining", "") or ""
        if not prev.strip():
            save("NO REMAINING HITCHES REPORTED.")
            break
    state["phase"] = "finished"
    save("stutter hunt done")


asyncio.run(main())
