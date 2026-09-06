/**
 * Every independently-judged piece of the game. Each is a standalone scene
 * bootable via `?piece=<name>` and owned by exactly one builder at a time.
 * Piece module contract: export async function create(ctx) -> { update(dt,t), dispose(), camera? }
 */
export const PIECES = {
  lookdev: () => import('./lookdev/index.js'),
  ship: () => import('./ship/index.js'),
  flight: () => import('./flight/index.js'),
  world: () => import('./world/index.js'),
  enemies: () => import('./enemies/index.js'),
  vfx: () => import('./vfx/index.js'),
  hud: () => import('./hud/index.js'),
  spacesim: () => import('./spacesim/index.js'),
  onfoot: () => import('./onfoot/index.js'),
  boss: () => import('./boss/index.js'),
  cinematics: () => import('./cinematics/index.js'),
  audio: () => import('./audio/index.js'),
};

export const PIECE_INFO = {
  lookdev: 'Global look: lighting rig, tonemapping, bloom/grading, sky & atmosphere. The reference frame every other piece inherits.',
  ship: 'Player ship (Arwing-class): model, materials, G-diffuser glow, wing/flap animation, turntable showcase.',
  flight: 'Rail-flight feel: banking, pitch/yaw, barrel roll, boost/brake, camera lag & FOV, aiming reticle. Uses ship.',
  world: 'Rail level environment: Corneria-style planet surface & city corridor, terrain, water, sky, scrolling geometry.',
  enemies: 'Enemy craft: models, formations, AI paths, lasers, hit reactions, lock-on targets.',
  vfx: 'VFX: laser bolts, explosions, boost trails, hit sparks, smart bomb, screen shake, hit-stop.',
  hud: 'HUD: shield bar, boost gauge, score, hits counter, radar, wingman comm window w/ animated portrait & dialogue.',
  spacesim: 'All-range space flight: free 6DOF flight in an asteroid belt near a planet, nebula, U-turn/somersault, dogfight targets.',
  onfoot: 'Third-person action-adventure: pilot on foot in a hangar/base, third-person camera, run/jump/roll, blaster, interactables.',
  boss: 'Boss encounter: multi-phase capital-ship boss with weak points, telegraphed attacks, and destruction sequence.',
  cinematics: 'Title screen, intro cinematic (launch from Great Fox), level transitions, mission-complete fly-away.',
  audio: 'Procedural music & SFX: orchestral-synth theme, laser/boost/explosion/UI sounds, dynamic mixing.',
};
