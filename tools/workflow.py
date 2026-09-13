import asyncio
import json
import os
import time
from datetime import datetime, timezone

REPO = "/home/ubuntu/repos/starwing"
PROGRESS = os.path.join(REPO, "public", "progress.json")
DEADLINE = 1788719580  # 2026-09-06 18:33 UTC — hard stop for new builder/critic rounds
ROUNDS_PER_WAVE = 2
MAX_WAVES = 6

PIECES = {
    "lookdev": "Global look: lighting rig, ACES tonemapping/exposure, bloom & color grading, procedural sky/atmosphere/starfield/nebula. This is the reference frame every other piece inherits, so export `applyLook(ctx, preset)` and `makeSky(preset)` helpers other pieces can call. Showcase: a hero scene with a few primitives + a planet horizon + sun that demonstrates the look.",
    "ship": "Player ship (Arwing-class fighter): procedural hull built from tapered/extruded/lathe geometry with panel lines, white/blue/grey livery, red/orange G-diffuser glow, canopy with fresnel reflection, animated wing flaps, engine glow + heat shimmer, subtle idle hover. Export `buildArwing() -> { group, setThrust(v), setBank(v), flap(v) }`. Showcase: turntable + camera orbit on a starfield.",
    "flight": "Rail-flight feel: import buildArwing from ../ship. Corridor-style movement inside a soft box, pitch/yaw with bank, barrel roll (double-tap or Q/E) with i-frames & sparkle, boost/brake with FOV kick + camera lag + speed lines, reticle (near+far crosshair projected ahead), laser fire with recoil, U-turn is NOT needed here. Camera: smooth chase that leads on turns like Star Fox 64/Zero. Ground plane + gates so motion reads. Autoplay script shows barrel rolls, boost, brake, weaving.",
    "world": "Rail level environment: Corneria-style planet — endless scrolling terrain (heightfield chunks), rivers/ocean with reflective shader, a city zone with stylised towers/arches, rock spires, procedural clouds & distant mountains, sky gradient with sun, dust/atmosphere fog, mesh instancing. Export `createWorld(ctx) -> { group, update(dt, speed), spawnZone(name) }`. Camera flies forward through it in the showcase.",
    "enemies": "Enemy craft: 3+ distinct procedural fighter designs (Venomian style: dark green/purple, insectoid) with glowing bits, formations (V, snake, circle), spline flight paths crossing the player's path, laser fire, damage flash, death spin, lock-on target markers. Export `createEnemyManager(ctx, playerRef) -> { update(dt), spawnWave(kind), list }`. Showcase: continuous waves at a stationary camera.",
    "vfx": "VFX library: twin laser bolts (capsule core + additive glow + trail), charge shot with lock-on beam, layered explosions (flash, fireball sprites w/ animated procedural texture, ring shockwave, debris, smoke), boost afterburner trails, hit sparks, smart bomb expanding sphere, hit-stop & screen shake, muzzle flash. Export `createVfx(ctx) -> { laser(pos,dir), explode(pos,size), shake(strength), ... }`. Showcase: timed demo firing everything.",
    "hud": "Star Fox HUD in DOM/CSS + canvas: shield bar with segment glints, boost/brake gauge, score & hits, radar, a comm window bottom-left with an ANIMATED procedural portrait (canvas-drawn character, mouth flaps, blinking) and typed dialogue lines, lock-on reticle overlay, 'GOOD LUCK' style mission-start banner. Export `createHud(ctx) -> { setShield, setBoost, addScore, say(name, text), banner(text) }`. Showcase: cycles through all elements.",
    "spacesim": "All-range space flight: 6DOF free flight with an Arwing (import from ../ship), asteroid belt (instanced, varied), large planet with atmosphere rim + moon, nebula backdrop, U-turn and somersault maneuvers, target markers on distant drones, radar dots, speed lines on boost. Camera with smooth lag and roll. Autoplay demo flies through the belt.",
    "onfoot": "Third-person action-adventure: pilot character (procedural stylised humanoid with helmet, articulated limbs, procedural run/idle/jump/roll animation), third-person orbit camera with collision-free lag, run/jump/roll/blaster fire, a hangar interior level (Great Fox hangar: metal floor, catwalks, docked ship, holo-panels, hanging lights with god-rays), pickups and a door interaction. Autoplay demo runs through the hangar.",
    "boss": "Boss encounter: a huge Venomian capital ship / mech with 3 phases, glowing weak points that shatter, telegraphed attacks (laser sweeps, missile volleys), shield hex FX, escalating damage smoke/fires, final chain-reaction destruction with slow-mo. Import ship from ../ship for scale. Autoplay demo shows the whole fight in ~40s.",
    "cinematics": "Cinematic layer: title screen with animated logo & starfield (press start pulse), intro cinematic (Great Fox mothership fly-by, Arwings launching from hangar bay), level-start letterboxed pan, mission-complete fly-away with score tally. Camera rigs with easing, letterbox bars, typography. Export `playTitle(ctx)`, `playIntro(ctx)`, `playComplete(ctx, stats)` returning promises. Showcase autoplays title -> intro -> complete.",
    "audio": "Procedural audio: WebAudio synth engine — heroic orchestral-ish main theme (brass-like saw stacks, strings pads, timpani, arpeggios), battle loop, sfx bank (twin laser, charge, lock-on, boost, brake, barrel roll, explosion sizes, hit, alarm, UI select/confirm, comm chirp), ducking/mix. Export `createAudio(ctx) -> { playMusic(name), stop(), sfx(name) }`. Showcase: an on-screen soundboard + spectrum visualiser so the critic can SEE it working; also the visualiser must look beautiful.",
}

PIECE_ORDER = list(PIECES.keys())

BUILD_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "committed": {"type": "boolean"},
        "needs_from_others": {"type": "string"},
    },
    "required": ["summary", "committed"],
}

CRITIC_SCHEMA = {
    "type": "object",
    "properties": {
        "winner": {"type": "string", "enum": ["ours", "starfox"]},
        "score": {"type": "number"},
        "biggest_gap": {"type": "string"},
        "verdict": {"type": "string"},
        "best_shot": {"type": "string"},
    },
    "required": ["winner", "score", "biggest_gap", "verdict"],
}

INTEGRATE_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "issues_for_pieces": {"type": "string"}},
    "required": ["summary"],
}

state = {
    "started": datetime.now(timezone.utc).isoformat(),
    "updated": 0,
    "wave": 0,
    "phase": "starting",
    "pieces": {p: {"status": "pending", "round": 0, "wins": 0} for p in PIECE_ORDER},
    "log": [],
}


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


def time_left():
    return DEADLINE - time.time()


COMMON = f"""You are working in the repo at {REPO} (a Three.js browser game called STARWING). Read {REPO}/AGENTS.md FIRST and follow it exactly.
The Vite dev server is ALREADY running at http://localhost:5173 — never restart or kill it, never switch git branches, never run git reset/checkout/stash/clean, never touch files outside the folders named below. Other agents are editing other folders on this same machine concurrently.
Use `source ~/.nvm/nvm.sh` before any node/npx command."""


def builder_prompt(piece, rnd, gap, verdict):
    prior = ""
    if rnd > 1:
        prior = f"""
This is ROUND {rnd}. A harsh critic compared the current render of this piece side by side with Star Fox on Nintendo Switch 2 and OURS LOST.
Critic verdict: {verdict}
THE SINGLE BIGGEST GAP TO CLOSE THIS ROUND: {gap}
Fix that gap first and decisively; then polish anything else you notice. Do not regress what already works. Read the existing code in your folder before changing it."""
    else:
        prior = "\nThis is ROUND 1. The folder may contain a placeholder OR partial, uncommitted-quality work from an interrupted earlier attempt (read every file there first and check it actually renders). Continue from whatever is usable and deliver a complete, polished implementation."
    return f"""{COMMON}

YOUR PIECE: `{piece}` — you own ONLY `{REPO}/src/pieces/{piece}/` (create as many files there as you like).
BRIEF: {PIECES[piece]}
{prior}

TARGET: Nintendo first-party quality — it must look like a frame from Star Fox on Switch 2, not a tech demo. Strong art direction, materials with real specular/fresnel response, atmosphere, colour grading, motion with anticipation and overshoot. Zero console errors. Also set `ctx.input.script` so `--autoplay` demos the piece.
If the piece `lookdev` exists and exports helpers (check src/pieces/lookdev/index.js), use them for consistent lighting/sky unless your piece IS lookdev.

WORKFLOW:
1. Implement / improve the piece.
2. `cd {REPO} && source ~/.nvm/nvm.sh && node tools/shoot.mjs {piece} --times 1,3,6,10 --video 8 --autoplay && bash tools/frames.sh shots/{piece}/video.webm`
3. OPEN AND LOOK at shots/{piece}/t*.png and sheet.png with your image-reading tool. Check shots/{piece}/errors.txt is empty. Iterate until it genuinely looks stunning — you should expect 3+ iterations. Be your own harshest critic; a placeholder-looking, flat, grey, or broken frame is a failure.
4. Commit only your folder: `git add src/pieces/{piece} && git -c user.name=builder -c user.email=builder@starwing commit -m "{piece}: round {rnd}"`.
5. Report: summary (what you built/changed and what still bothers you), committed=true/false, needs_from_others (anything you need from another piece/core, or empty)."""


def critic_prompt(piece, rnd):
    return f"""{COMMON}

You are a brutally harsh, world-class art director and game critic with FRESH eyes. You will judge ONLY the rendered output of the piece `{piece}` ({PIECES[piece]}). Never read or trust any builder's summary; judge pixels and motion only.

STEPS:
1. Render it fresh: `cd {REPO} && source ~/.nvm/nvm.sh && node tools/shoot.mjs {piece} --times 1,3,6,10 --video 8 --autoplay && bash tools/frames.sh shots/{piece}/video.webm`
2. LOOK at every PNG in shots/{piece}/ (t*.png, sheet.png, several f*.png) with your image-reading tool. Read shots/{piece}/errors.txt — any error is an automatic loss.
3. Also open http://localhost:5173/?piece={piece} in your browser, play with the keyboard bindings from AGENTS.md for ~30 seconds and take 2-3 screenshots to judge feel/interaction (headless video may stutter — judge design, not swiftshader fps).
4. Reference: recall or (if the web is reachable) fetch 2-3 screenshots of Star Fox on Nintendo Switch 2 / Star Fox Zero / Star Fox 64 3D for the equivalent moment (ship, flight over Corneria, HUD, boss, etc.). Place them mentally side by side with ours as a BLIND comparison: which frame would a Nintendo art director ship?
5. Decide the winner. Be ruthless: default-grey materials, flat lighting, empty compositions, tiny objects in a void, placeholder text, jitter, popping, bad typography, muddy bloom, or anything reading 'tech demo' means Star Fox wins. `ours` may win only if you are genuinely WOWED and would believe it is a first-party screenshot.
6. Name the SINGLE biggest gap (one specific, actionable sentence — the thing that would most change the verdict), a 0-10 score (10 = indistinguishable from Nintendo first-party; be stingy, 5 is 'competent indie'), and a 2-4 sentence verdict. best_shot = filename of the strongest frame (e.g. t006.png).
This is round {rnd}. Do NOT edit any source files."""


def integrator_prompt(wave, piece_reports):
    return f"""{COMMON}

You are the INTEGRATOR for wave {wave}. Your job: play the WHOLE game and smooth everything into one coherent, thrilling Nintendo-quality experience. You own `{REPO}/src/game/`, `{REPO}/src/pieces/_shared/`, `{REPO}/src/core/`, `index.html` and `AGENTS.md`. Do NOT edit `src/pieces/<name>/` folders except for trivial import/export fixes needed to wire them (keep such edits minimal and commit them separately with message "integrate: fix <piece> export").

Current per-piece state (critic scores, for context only — judge for yourself):
{json.dumps(piece_reports, sort_keys=True, indent=1)}

Build/extend `src/game/game.js` into the full game flow: title screen -> intro cinematic -> rail mission over Corneria (world + flight + enemies + vfx + hud + audio) -> boss -> all-range space battle (spacesim) -> on-foot hangar segment (onfoot) -> mission complete (cinematics). Use each piece's exported API (read their index.js files). Where a piece is still a placeholder, skip it gracefully. Ensure: consistent look (lookdev), no console errors, transitions with fades/letterbox, shared HUD, audio hooks, pause, and that it runs at a steady frame-rate (merge/instancing, dispose on transitions).
Then PLAY it: open http://localhost:5173/ in your browser, play through with the keyboard for several minutes, screenshot key moments; also `node tools/shoot.mjs game --times 2,8,20,40 --video 20` and look at the frames. Fix everything that feels incoherent, janky, or ugly at the seams (scale mismatches, lighting mismatches, HUD overlap, timing).
Commit your work (`git add src/game src/pieces/_shared src/core index.html AGENTS.md` + any fix commits). If the dev server died, restart it with `cd {REPO} && source ~/.nvm/nvm.sh && (nohup npx vite > /tmp/vite.log 2>&1 &)`.
Report: summary, and issues_for_pieces — a list of concrete problems each piece's builder should fix next (format 'piece: problem')."""


async def build_round(piece, rnd, gap, verdict):
    st = state["pieces"][piece]
    st.update(status="building", round=rnd)
    save(f"{piece}: builder round {rnd} start" + (f" (gap: {gap[:80]})" if gap else ""))
    try:
        res = await agent(builder_prompt(piece, rnd, gap, verdict), phase="build", schema=BUILD_SCHEMA,
                          label=f"build-{piece}-r{rnd}", vm_mode="shared", soft_time_limit_minutes=45)
    except WorkflowAgentError as e:
        save(f"{piece}: builder round {rnd} FAILED: {e}")
        return None
    save(f"{piece}: builder round {rnd} done — {res['summary'][:120]}")
    return res


async def critic_round(piece, rnd):
    st = state["pieces"][piece]
    st.update(status="judging")
    save(f"{piece}: critic round {rnd} start")
    try:
        res = await agent(critic_prompt(piece, rnd), phase="judge", schema=CRITIC_SCHEMA,
                          label=f"judge-{piece}-r{rnd}", vm_mode="shared", soft_time_limit_minutes=20)
    except WorkflowAgentError as e:
        save(f"{piece}: critic round {rnd} FAILED: {e}")
        return None
    win = res["winner"] == "ours"
    st.update(status="win" if win else "lose", score=res["score"], gap=res["biggest_gap"],
              verdict=res["verdict"], shot=res.get("best_shot") or "t006.png", wins=st.get("wins", 0) + (1 if win else 0))
    save(f"{piece}: critic r{rnd} -> {res['winner']} {res['score']}/10 — gap: {res['biggest_gap'][:100]}")
    return res


async def piece_wave(piece, wave):
    """Run up to ROUNDS_PER_WAVE build+judge loops for one piece until the critic is wowed."""
    st = state["pieces"][piece]
    for _ in range(ROUNDS_PER_WAVE):
        if st.get("done"):
            return st
        if time_left() < 30 * 60:
            save(f"{piece}: deadline near, skipping further rounds")
            return st
        rnd = st.get("round", 0) + 1
        await build_round(piece, rnd, st.get("gap", ""), st.get("verdict", ""))
        res = await critic_round(piece, rnd)
        if res and res["winner"] == "ours" and res["score"] >= 9:
            st["done"] = True
            save(f"{piece}: CRITIC WOWED at round {rnd}. Locked.")
            return st
    return st


async def integrate(wave):
    state["phase"] = f"integrating wave {wave}"
    save(f"integrator wave {wave} start")
    reports = {p: {k: v for k, v in st.items() if k in ("score", "gap", "verdict", "round")} for p, st in state["pieces"].items()}
    try:
        res = await agent(integrator_prompt(wave, reports), phase="integrate", schema=INTEGRATE_SCHEMA,
                          label=f"integrate-w{wave}", vm_mode="shared", soft_time_limit_minutes=60)
    except WorkflowAgentError as e:
        save(f"integrator wave {wave} FAILED: {e}")
        return None
    save(f"integrator wave {wave} done — {res['summary'][:160]}")
    issues = res.get("issues_for_pieces") or ""
    for line in issues.splitlines():
        if ":" in line:
            p, prob = line.split(":", 1)
            p = p.strip().strip("-* ").lower()
            if p in state["pieces"] and not state["pieces"][p].get("done"):
                st = state["pieces"][p]
                st["gap"] = (st.get("gap", "") + " | Integrator: " + prob.strip()).strip(" |")
    return res


async def main():
    await register_workflow({
        "name": "starwing-build-critic-loop",
        "description": "Builder/critic loops per game piece vs Star Fox on Switch 2, with an integrator between waves; hard stop at deadline.",
        "product": "STARWING (Three.js browser game)",
        "soft_time_limit_minutes": 45,
        "phases": [
            {"title": "build", "detail": "builder improves one piece, renders and self-checks"},
            {"title": "judge", "detail": "fresh-context harsh critic renders and compares blind vs Star Fox Switch 2", "soft_time_limit_minutes": 20},
            {"title": "integrate", "detail": "one agent plays the whole game and smooths it into one coherent thing", "soft_time_limit_minutes": 60},
        ],
    })
    save("workflow started")
    for wave in range(1, MAX_WAVES + 1):
        if time_left() < 30 * 60:
            break
        state["wave"] = wave
        state["phase"] = f"wave {wave}: build/judge loops"
        save(f"=== WAVE {wave} ===")
        await asyncio.gather(*[piece_wave(p, wave) for p in PIECE_ORDER])
        if time_left() < 20 * 60:
            break
        await integrate(wave)
        if all(st.get("done") for st in state["pieces"].values()):
            save("ALL PIECES LOCKED — every critic wowed.")
            break
    state["phase"] = "finished"
    save("workflow finished: " + json.dumps({p: (st.get("score"), st.get("status")) for p, st in state["pieces"].items()}, sort_keys=True))


asyncio.run(main())
