import asyncio
import json
import os
import time
from datetime import datetime, timezone

REPO = "/home/ubuntu/repos/starwing"
PROGRESS = os.path.join(REPO, "public", "progress.json")
MAX_FIX_ROUNDS = 3

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


COMMON = f"""You are working in the repo at {REPO} (a Three.js browser game called STARWING). Read {REPO}/AGENTS.md FIRST.
The Vite dev server should be running at http://localhost:5173 (HMR) and http://localhost:5174 (no-HMR, used by tools/shoot.mjs). If either is down: `cd {REPO} && source ~/.nvm/nvm.sh && (nohup npx vite > /tmp/vite.log 2>&1 &)` and `(NO_HMR=1 nohup npx vite > /tmp/vite-render.log 2>&1 &)`.
Never switch git branches, never run git reset/checkout/stash/clean. Use `source ~/.nvm/nvm.sh` before any node/npx command. You are the ONLY agent editing the repo right now, so you may edit any file."""

REPORT_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "blockers": {"type": "string"}, "fps": {"type": "string"}},
    "required": ["summary", "blockers"],
}

PLAYTEST_SCHEMA = {
    "type": "object",
    "properties": {
        "fully_playable": {"type": "boolean"},
        "blockers": {"type": "string"},
        "summary": {"type": "string"},
        "min_fps": {"type": "number"},
    },
    "required": ["fully_playable", "blockers", "summary"],
}


def integrator_prompt(rnd, blockers):
    fix = f"\nA fresh playtester found these BLOCKERS in the last build — fix every one of them first:\n{blockers}\n" if blockers else ""
    return f"""{COMMON}

You are the FINAL INTEGRATOR (pass {rnd}). The build/critic waves are over; all 12 pieces in src/pieces/ are at their final state. Your job is to make the FULL GAME at http://localhost:5173/ completely playable end to end, coherent, and polished — a player must be able to go from title screen to mission-complete with only the keyboard.
{fix}
Required flow (src/game/game.js + src/game/*.js): title (Enter to start) -> intro cinematic (skippable) -> rail mission over Corneria (world + flight + enemies + vfx + hud + audio, with shield damage, score, and a real fail/retry state) -> boss fight (win condition) -> all-range space battle (spacesim, clear N targets to proceed) -> on-foot hangar segment (onfoot, reach the door/objective) -> mission complete with score tally -> back to title. Pause on Esc. Every transition must fade/letterbox cleanly, dispose the previous scene, and carry the shared HUD/audio.
Rules: prefer wiring pieces through their exported APIs; you MAY edit files inside src/pieces/<name>/ when needed to make the game work (keep those edits surgical). Zero console errors or warnings spam. No NaNs, no black frames, no stuck states (add timeouts/fallbacks so the game can never soft-lock).

Verify by ACTUALLY PLAYING: open http://localhost:5173/ in the browser, play through the entire game with the keyboard (AGENTS.md bindings), taking screenshots at each stage. Also run `node tools/shoot.mjs game --times 2,10,30,60,90 --video 30 --autoplay` and look at the frames + shots/game/errors.txt. Iterate until the whole thing plays through cleanly at least twice.
Commit everything when done (`git add -A src index.html AGENTS.md && git -c user.name=integrator -c user.email=integrator@starwing commit -m "integrate: final pass {rnd}"`).
Report: summary, blockers (anything still broken you could not fix, or empty), fps (rough observed)."""


def perf_prompt(rnd):
    return f"""{COMMON}

You are the PERFORMANCE ENGINEER (pass {rnd}). Goal: the full game at http://localhost:5173/ must hold >= 30 FPS (target 60) on a mid-range GPU at 1080p, in EVERY stage (title, intro, rail mission with enemies+vfx, boss, space battle, on-foot hangar).
Note this machine renders through SwiftShader (software GL), so absolute FPS here is low; use RELATIVE measurements and draw-call / triangle / shader counts (renderer.info) as your primary metrics, plus per-stage frame-time deltas measured with `window.__engine` in the browser console. Rule of thumb for real hardware: <= 300 draw calls, <= 1.5M triangles, bloom at half resolution, no per-frame geometry/material allocations, no per-frame `new THREE.*` in hot loops, no shadow maps > 2048, no more than 1 shadow-casting light, instancing for repeated meshes, frustum culling on, disposal on scene transitions (check for leaks: renderer.info.memory should not grow across a full playthrough).
Do this:
1. Add a small FPS/draw-call overlay to the engine (toggle with F3, and on by default when `?stats` is in the URL) in src/core/.
2. Add adaptive resolution scaling in src/core/engine.js: if frame time exceeds ~30 ms for a second, lower renderer pixel ratio in steps down to 0.6; raise it back up when comfortably fast. Also cap devicePixelRatio at 1.5.
3. Profile each stage (title, intro, rail, boss, space, onfoot) using `window.__engine.renderer.info` and frame-time samples from the console (Playwright via tools/shoot.mjs or the browser). Write the numbers into shots/perf.md.
4. Fix the heaviest offenders in any file (src/core, src/game, src/pieces/*): instancing, merged geometry, lower particle counts where invisible, cheaper shaders, smaller shadow maps, half-res bloom, cull distant objects, reuse vectors. Preserve the visual quality as much as possible — this is a polish pass, not a downgrade.
5. Re-profile and confirm improvement; also confirm the game still plays through end-to-end with no console errors (`node tools/shoot.mjs game --times 2,10,30,60 --video 20 --autoplay` and look at frames + errors.txt).
Commit (`git add -A src shots/perf.md && git -c user.name=perf -c user.email=perf@starwing commit -m "perf: pass {rnd}"`).
Report: summary, blockers (anything you could not fix), fps (per-stage draw calls / tris / estimated fps table)."""


def playtest_prompt(rnd):
    return f"""{COMMON}

You are a FRESH PLAYTESTER / QA lead with no prior context (pass {rnd}). Do NOT edit any source files. Judge only what you can see and play.
1. Open http://localhost:5173/ in the browser. Play the entire game with the keyboard (bindings in AGENTS.md): title -> intro -> rail mission -> boss -> space battle -> on-foot -> mission complete -> back to title. Take a screenshot at every stage. Note anything that soft-locks, crashes, shows a black/empty frame, has HUD overlap, unreadable text, missing audio hooks, controls that don't respond, or an objective that cannot be completed. Check the browser console for errors.
2. Also run `cd {REPO} && source ~/.nvm/nvm.sh && node tools/shoot.mjs game --times 2,10,30,60,90 --video 30 --autoplay` and look at shots/game/*.png and shots/game/errors.txt.
3. Open http://localhost:5173/?stats and note the draw-call count and frame time in each stage (SwiftShader is slow — flag anything > 400 draw calls or > 1.5M triangles as a perf blocker; do not judge absolute fps).
Report: fully_playable (true ONLY if you completed the whole game from title to mission-complete with zero console errors and no soft-locks), blockers (numbered, concrete, reproducible — empty if none), summary (3-6 sentences on coherence and polish), min_fps (lowest frame rate you observed, if measurable)."""


async def main():
    await register_workflow({
        "name": "starwing-finish",
        "description": "Final integration, performance pass and fresh playtest loop until the full game is playable end to end.",
        "product": "STARWING (Three.js browser game)",
        "soft_time_limit_minutes": 60,
        "phases": [
            {"title": "integrate", "detail": "final integrator makes the whole game playable end to end"},
            {"title": "perf", "detail": "performance pass targeting >= 30 FPS"},
            {"title": "playtest", "detail": "fresh QA plays the whole game and lists blockers", "soft_time_limit_minutes": 30},
        ],
    })
    state["phase"] = "finishing: final integration"
    save("=== FINISH: final integration ===")
    blockers = ""
    for rnd in range(1, MAX_FIX_ROUNDS + 1):
        state["phase"] = f"finishing: integration pass {rnd}"
        save(f"final integrator pass {rnd} start")
        try:
            res = await agent(integrator_prompt(rnd, blockers), phase="integrate", schema=REPORT_SCHEMA,
                              label=f"final-integrate-{rnd}", vm_mode="shared", soft_time_limit_minutes=60)
            save(f"final integrator pass {rnd} done — {res['summary'][:160]}")
        except WorkflowAgentError as e:
            save(f"final integrator pass {rnd} FAILED: {e}")

        if rnd == 1:
            state["phase"] = "finishing: performance pass"
            save("perf pass start")
            try:
                res = await agent(perf_prompt(rnd), phase="perf", schema=REPORT_SCHEMA,
                                  label=f"perf-{rnd}", vm_mode="shared", soft_time_limit_minutes=60)
                save(f"perf pass done — {res.get('fps', '')[:200]}")
            except WorkflowAgentError as e:
                save(f"perf pass FAILED: {e}")

        state["phase"] = f"finishing: playtest {rnd}"
        save(f"playtest {rnd} start")
        try:
            pt = await agent(playtest_prompt(rnd), phase="playtest", schema=PLAYTEST_SCHEMA,
                             label=f"playtest-{rnd}", vm_mode="shared", soft_time_limit_minutes=30)
        except WorkflowAgentError as e:
            save(f"playtest {rnd} FAILED: {e}")
            break
        state["playtest"] = {"round": rnd, "fully_playable": pt["fully_playable"], "blockers": pt["blockers"], "summary": pt["summary"], "min_fps": pt.get("min_fps")}
        save(f"playtest {rnd}: fully_playable={pt['fully_playable']} — {pt['summary'][:160]}")
        if pt["fully_playable"] and not pt["blockers"].strip():
            save("GAME FULLY PLAYABLE.")
            break
        blockers = pt["blockers"]
        save(f"playtest {rnd} blockers: {blockers[:300]}")
    state["phase"] = "finished"
    save("finish workflow done")


asyncio.run(main())
