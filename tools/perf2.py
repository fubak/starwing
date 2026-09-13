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


COMMON = f"""You are working in the repo at {REPO} (a Three.js browser game called STARWING). Read {REPO}/AGENTS.md FIRST.
The Vite dev server should be running at http://localhost:5173 (HMR) and http://localhost:5174 (no-HMR, used by tools/shoot.mjs). If either is down: `cd {REPO} && source ~/.nvm/nvm.sh && (nohup npx vite > /tmp/vite.log 2>&1 &)` and `(NO_HMR=1 nohup npx vite > /tmp/vite-render.log 2>&1 &)`.
Never switch git branches, never run git reset/checkout/stash/clean. Use `source ~/.nvm/nvm.sh` before node/npx. You are the ONLY agent editing the repo right now. Prior work: read shots/perf.md and shots/perf_probe.mjs — they contain the last profile and the probe harness."""

SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "table": {"type": "string"}, "blockers": {"type": "string"}},
    "required": ["summary", "table"],
}

PROMPT = f"""{COMMON}

You are the PERFORMANCE ENGINEER, pass 2. User targets: **60 FPS sustained, never below 30 FPS, on a mid-range GPU at 1080p. Zero scene-to-scene delay on the opening cutscenes (title -> intro -> rail must flow with no hitch, no long fade-to-black, no load stall).**

This box renders via SwiftShader (~50-100x slower than real GPUs): use draw calls, triangles, texture/geometry counts (renderer.info, autoReset=false) and RELATIVE step-ms as your metrics. Budgets: <= 300 draw calls and <= 1.5M tris per full frame (all passes), ideally well under. The mission-complete stage was last seen at ~423 calls — bring it under. Intro was 263 calls; space is fragment-bound; rail has a half-rate planar reflection.

1. Re-profile every stage with shots/perf_probe.mjs (adapt it if needed). Compare vs the "After" table in shots/perf.md.
2. Cutscene continuity: profile what happens between stages — find any synchronous heavy work on the transition frame (big scene construction, shader compilation hitches, texture uploads). Fix by: pre-warming/compiling (renderer.compile / compileAsync the NEXT scene's shaders+textures while the current stage plays), building the next scene lazily during the previous stage or during the letterbox fade, and keeping fades short (<400ms) with the next scene already live underneath. Title -> intro -> rail entry specifically must be seamless.
3. Optimizations to consider where profitable: more instancing, geometry merging, texture atlas reuse, fewer unique materials, reduced shadow-casters, LOD/frustum-friendly scene graphs, culling, lower-poly distant props, fewer particle overdraw layers, smaller/cheaper render targets (water mirror, bloom res), and removing per-frame allocations. Do NOT regress visual quality — this is optimization, not degradation; keep the look the critics approved.
4. Update the FPS overlay (F3 / ?stats) if useful for verification.
5. Update shots/perf.md with a new "Pass 2" section: before -> after per stage, plus transition timings you measured.
6. Verify the game still plays end-to-end: `node tools/shoot.mjs game --times 2,10,30,60,90 --video 20 --autoplay` — look at the PNGs and confirm errors.txt is empty.
Commit (`git -c user.name=perf -c user.email=perf@starwing commit -am "perf: pass 2"` + any untracked perf files).
Report: summary, table (per-stage before/after + transition timings), blockers (empty if none)."""


async def main():
    await register_workflow({
        "name": "starwing-perf2",
        "description": "Second performance pass: 60fps target, seamless title->intro->rail cutscene transitions.",
        "product": "STARWING (Three.js browser game)",
        "soft_time_limit_minutes": 60,
        "phases": [{"title": "perf", "detail": "profile and optimize all stages + transitions"}],
    })
    state["phase"] = "performance pass 2"
    save("=== PERF PASS 2: 60fps target + seamless transitions ===")
    for rnd in (1, 2):
        try:
            res = await agent(PROMPT, phase="perf", schema=SCHEMA,
                              label=f"perf2-{rnd}", vm_mode="shared", soft_time_limit_minutes=60)
            save(f"perf2-{rnd} done — {res['summary'][:160]}")
            if not res.get("blockers", "").strip():
                break
        except WorkflowAgentError as e:
            save(f"perf2-{rnd} FAILED: {e}")
            break
    state["phase"] = "finished"
    save("perf pass 2 workflow done")


asyncio.run(main())
