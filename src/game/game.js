// FULL GAME: owned by the integrator. Stitches pieces into one coherent
// experience: title -> intro cinematic -> rail mission (world+enemies+boss)
// -> all-range space battle -> on-foot segment -> mission complete.
// Until integration begins this simply boots the lookdev piece.
import { PIECES } from '../pieces/registry.js';

export async function create(ctx) {
  const mod = await PIECES.lookdev();
  return mod.create(ctx);
}
