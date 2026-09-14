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


COMMON = f"""You are working in the repo at {REPO} (a Three.js browser game, STARWING). Read {REPO}/AGENTS.md and {REPO}/shots/perf.md first (perf.md documents three perf passes — do not regress them).
Servers: http://localhost:5173 (HMR) and http://localhost:5174 (no-HMR, used by tools/shoot.mjs + tools/trace.mjs). If down: `cd {REPO} && source ~/.nvm/nvm.sh && (nohup npx vite > /tmp/vite.log 2>&1 &)` and `(NO_HMR=1 nohup npx vite > /tmp/vite-render.log 2>&1 &)`.
Never switch git branches, never run git reset/checkout/stash/clean. `source ~/.nvm/nvm.sh` before node/npx. You are the ONLY agent editing the repo right now — coordinate nothing, own everything.
VERIFY EVERYTHING VISUALLY: after every change, render with `node tools/shoot.mjs <piece-or-game> --times 1,3,6,10 --video 8 --autoplay && bash tools/frames.sh shots/<name>/video.webm` and LOOK at the PNGs. A facing fix you only believe is right is not done — look at the frame."""

SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "changes": {"type": "string"}, "remaining": {"type": "string"}},
    "required": ["summary", "changes"],
}

MODELS_PROMPT = f"""{COMMON}

TASK — MODEL FACING + TITLE LAYOUT + MOUSE CONTROL + POLY COUNTS.

1. MODEL FACING AUDIT (user report: "many models face the wrong direction").
   Convention check first: decide the canonical forward axis per stage and make it consistent. Audit EVERYTHING that moves or is hero-visible:
   * Arwing (src/pieces/ship/arwing.js + everywhere it's mounted: title flyby, intro launch, rail, boss, space, onfoot docked, complete fly-away).
   * Every enemy craft (src/pieces/enemies/craft.js + formations in the rail stage and space stage) — they must nose toward their flight direction / the player, not fly backwards or sideways.
   * The on-foot pilot (src/pieces/onfoot/…) — face movement direction.
   * The Gorgon boss (src/pieces/boss/) — guns/face toward the player.
   * Great Fox + parked ships in cinematics/hangar — nose direction consistent with their motion.
   Method: render each piece standalone (tools/shoot.mjs <piece>) and in-game (`node tools/shoot.mjs game --times ...`), look at the PNGs, fix `rotation.y` / model axis / `lookAt` usage wherever the nose points wrong. Keep the deterministic harness passing (errors.txt empty).

2. TITLE LOGO: on the title screen the STARWING wordmark/logo is partially clipped or off-frame at common aspect ratios. Reframe it (camera FOV/offset or logo scale/position) so the ENTIRE logo sits inside the safe frame at 16:9 and 4:3 and when the window is narrow — render at 1920x1080 and 1024x768 and check both.

3. MOUSE CONTROL: add mouse steering as a first-class input. In flight stages (rail + space), moving the mouse aims/steers the ship (mouse delta or offset-from-center mapped onto input.axes — pick whichever feels better and make it smooth, with a small dead zone and optional pointer-lock on click). Mouse buttons: left = fire, right or middle = bomb if unclaimed. Keep keyboard fully working. Also make the title screen respond to a click as 'start'. Document bindings in AGENTS.md and update `input.script` autoplay so captures still work.

4. POLY COUNT: raise the silhouette/detail resolution of the hero models — Arwing (smoother hull/wing surfaces, more segments on fuselage/nozzle/canopy curves), the on-foot pilot (rounder head/limbs, articulated hands/fingers if cheap), enemy craft, Gorgon boss. Use more segments, bevels, lathe/tube/extrude refinements — keep it stylized, just less faceted. Stay under the perf budgets in shots/perf.md (~1.5M tris/frame worst stage): subdivide the HERO meshes, not distant instanced props. Re-run shots/perf_probe.mjs after to confirm budgets still hold.

Commit with `git -c user.name=polish -c user.email=polish@starwing commit -am "polish: model facing, title logo, mouse control, hero poly"`.
Report: summary, changes (per model, what was wrong and how you fixed the facing), remaining."""

ART_PROMPT = f"""{COMMON}

TASK — FINAL ART / GRAPHICS / VFX / AUDIO POLISH PASS.
Play and look at every stage end-to-end (`node tools/shoot.mjs game --times 2,10,30,60,90,120 --video 20 --autoplay`, plus open http://localhost:5173/ and play with keyboard/mouse). Compare each frame against your memory of Nintendo first-party polish (Star Fox Zero/Starlink, Pikmin, Metroid levels of sheen): cohesive color grading, strong silhouettes, layered VFX, screen shake on big moments, bloom that never clips, clean HUD.
Then improve the weakest 3-5 things you actually SEE in the renders — do not shot in the dark. Examples of what to look for (only if actually weak): laser visibility, explosion layering and lingering smoke, boost FOV kick + speedlines, hit flash on enemies, boss telegraph readability, water/sky gradients, cloud variety, ship specular response, HUD typography weight, comm portrait animation quality, letterbox bar polish, transition fades, score-tally juice.
Audio: with ?mute off, listen-check nothing's missing in the sfx hookup (fire, hit, explode, lock-on, boost, barrel roll, UI, comm chirp, boss alarms, music transitions between stages, a victory sting on mission complete). Improve the weakest sounds (layering, envelopes, mix levels) — you can't hear it here, so instrument: add a tiny visual check or assert each named sfx exists and triggers (wire into the trace marks).
Stay inside the perf budgets in shots/perf.md.
Commit (`git -c user.name=polish -c user.email=polish@starwing commit -am "polish: art/vfx/audio pass"`).
Report: summary, changes, remaining."""

PERF_PROMPT = f"""{COMMON}

TASK — FINAL PERFORMANCE VERIFICATION (do not start optimizing before tracing).
1. `cd {REPO} && source ~/.nvm/nvm.sh && node tools/trace.mjs` — full real-time campaign trace. Report per-stage median/p99/worst cpu ms, hitch list (each hitch must carry its `warm:step`/mark attribution), program-count flatness during play, renderScale changes, heap slope.
2. `node tools/shoot.mjs game --times 2,10,30,60,90 --video 15 --autoplay` — confirm zero errors and no visual regressions (look at the PNGs).
3. `npx vite build` must pass.
4. Fix whatever still produces unexplained hitches or budget violations (draw calls <= 300/frame all passes, tris <= ~1.5M, zero programs compiled mid-play, renderScale steady). Keep changes surgical — this is verification, not a rewrite.
Update `shots/perf.md` with a 'Pass 4 — final verification' section including the numbers.
Commit (`git -c user.name=perf -c user.email=perf@starwing commit -am "perf: final verification"`).
Report: summary, changes, remaining (empty if clean)."""


async def main():
    await register_workflow({
        "name": "starwing-polish",
        "description": "Model facing/logo/mouse/poly pass, then art/vfx/audio polish, then final perf verification.",
        "product": "STARWING (Three.js browser game)",
        "soft_time_limit_minutes": 60,
        "phases": [
            {"title": "models", "detail": "facing audit, title logo, mouse control, hero poly counts"},
            {"title": "art", "detail": "final graphics/VFX/audio polish pass"},
            {"title": "perf", "detail": "final trace + verification, 60fps target"},
        ],
    })
    state["phase"] = "polish: models/menu/mouse"
    save("=== POLISH WAVE: models, menu, mouse, poly; then art; then perf verify ===")
    for label, p, phase in (
        ("models", MODELS_PROMPT, "models"),
        ("art", ART_PROMPT, "art"),
        ("perf-verify", PERF_PROMPT, "perf"),
    ):
        state["phase"] = f"polish: {label}"
        save(f"{label} agent start")
        try:
            res = await agent(p, phase=phase, schema=SCHEMA, label=label,
                              vm_mode="shared", soft_time_limit_minutes=60)
            save(f"{label} done — {res['summary'][:180]}")
        except WorkflowAgentError as e:
            save(f"{label} FAILED: {e}")
            break
    state["phase"] = "finished"
    save("polish wave done")


asyncio.run(main())
