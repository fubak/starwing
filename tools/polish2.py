import asyncio
import json
import os
import time
from datetime import datetime, timezone

REPO = "/home/ubuntu/repos/starwing"
PROGRESS = os.path.join(REPO, "public", "progress.json")

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


COMMON = f"""You are working in the repo at {REPO} (a Three.js browser game, STARWING). Read {REPO}/AGENTS.md and skim {REPO}/shots/perf.md first — it documents four perf passes; do not regress them and do not re-litigate them.
Servers: http://localhost:5173 (HMR) and http://localhost:5174 (no-HMR, used by tools/shoot.mjs + tools/trace.mjs). If down: `cd {REPO} && source ~/.nvm/nvm.sh && (nohup npx vite > /tmp/vite.log 2>&1 &)` and `(NO_HMR=1 nohup npx vite > /tmp/vite-render.log 2>&1 &)`.
Never switch git branches, never run git reset/checkout/stash/clean. `source ~/.nvm/nvm.sh` before node/npx. You are the ONLY agent editing the repo.
VERIFY VISUALLY: render and LOOK at PNGs after every change — never trust a summary. tools/shoot.mjs <name> --times ... --autoplay writes shots/<name>/t*.png; a full `game` capture is very slow under SwiftShader, so use per-stage routes (?stage=<name>) or short windows."""

SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "changes": {"type": "string"}, "remaining": {"type": "string"}},
    "required": ["summary", "changes"],
}

ART_PROMPT = f"""{COMMON}

TASK — SECOND ART / GRAPHICS / VFX / SFX POLISH PASS. A previous art pass already ran; your job is to push further — find the remaining weak spots, don't repeat its work.
1. SURVEY: render every stage (title, intro, rail, boss, space, onfoot, complete — use ?stage= routes plus the earlier shots in shots/game*/t*.png) and the standalone pieces (?piece=ship|enemies|vfx|hud|boss|cinematics|onfoot|spacesim|audio). Look at real pixels. Also read the piece dirs so you know what systems exist.
2. Judge each frame against Nintendo first-party sheen: grading cohesion, silhouette readability, VFX layering (flash->fire->smoke->debris->shockwave), screen shake on big moments, spec/fresnel on hero surfaces, HUD typographic weight, motion juice (anticipation/overshoot), transition polish. Also sanity-check that models still face correctly after the recent facing audit (spot-check frames, don't redo the audit unless something's visibly wrong).
3. FIX the weakest 3-6 things you actually SEE. Prioritize what shows in the main campaign (rail combat readability, boss telegraphs/weakpoint clarity, explosion layering, laser/contrast visibility, star field/nebula depth, water/sky, hangar atmosphere, HUD polish, intro hero shots).
4. SFX: audit the sfx hookup end-to-end (fire, hit, explode variants, lock-on, boost, brake, barrel roll, bomb, UI, comm chirp, alarms, music crossfades per stage, victory sting). Add a trace/console check confirming each named sfx actually exists and triggers; improve the weakest sounds by layering/envelopes/mix. You can't hear output here — verify by instrumentation.
Stay inside perf budgets (<=300 draw calls/frame, <=1.5M tris, no mid-play shader compiles — read perf.md).
Commit (`git -c user.name=polish -c user.email=polish@starwing commit -am "polish: art/vfx/audio round 2"`).
Report: summary, changes (what was weak and what you did), remaining."""

PERF_PROMPT = f"""{COMMON}

TASK — PERFORMANCE PASS following the second art polish.
1. `cd {REPO} && source ~/.nvm/nvm.sh && node tools/trace.mjs` — full real-time campaign trace. Report per-stage median/p95/p99/worst cpu ms, hitch list with mark attribution, programs compiled per frame (must be ~0 mid-play), draw calls (<=300/frame), renderScale changes (must be 0), heap slope.
2. Compare with the Pass 4 numbers in shots/perf.md — the art pass may have changed material/caster counts. Any regression (more mid-play compiles, >300 calls, new hitches) gets fixed. The known residual: rail compiles ~4 programs once ~22s in (first mantis wave + first lock-on draw) — try to eliminate it if you can do it surgically (extend the parked warm or prewarm those materials during the rail stage itself, not a big rework).
3. `npx vite build` must pass; `node tools/shoot.mjs game --times 10,30,60 --video 10 --autoplay` must produce non-black frames and an empty errors.txt.
4. Update shots/perf.md with a 'Pass 5 — post-polish verification' section.
Commit (`git -c user.name=perf -c user.email=perf@starwing commit -am "perf: post-polish verification"`).
Report: summary, changes, remaining (empty if clean)."""


async def main():
    await register_workflow({
        "name": "starwing-polish2",
        "description": "Second art/vfx/audio polish pass followed by a perf verification pass.",
        "product": "STARWING (Three.js browser game)",
        "soft_time_limit_minutes": 60,
        "phases": [
            {"title": "art", "detail": "second graphics/VFX/SFX polish pass"},
            {"title": "perf", "detail": "post-polish perf verification"},
        ],
    })
    state["phase"] = "polish wave 2: art"
    save("=== POLISH WAVE 2: art/vfx/audio, then perf ===")
    for label, p, phase in (("art2", ART_PROMPT, "art"), ("perf2", PERF_PROMPT, "perf")):
        state["phase"] = f"polish wave 2: {label}"
        save(f"{label} agent start")
        try:
            res = await agent(p, phase=phase, schema=SCHEMA, label=label,
                              vm_mode="shared", soft_time_limit_minutes=60)
            save(f"{label} done — {res['summary'][:180]}")
        except WorkflowAgentError as e:
            save(f"{label} FAILED: {e}")
            break
    state["phase"] = "finished"
    save("polish wave 2 done")


asyncio.run(main())
