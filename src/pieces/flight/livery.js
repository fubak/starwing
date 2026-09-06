// Hero-ship material dressing for outdoor flight. The ship piece ships a
// museum-white paint tuned for a dark hangar; under a golden-hour sky with a
// strong key it bleaches to paper. Here we cool the whites toward blue-grey,
// deepen the blue, punch the red, and give the paint a real clearcoat so the
// hull picks up a specular streak and fresnel rim instead of flat fill.
export function dressArwing(api) {
  const M = api?.materials;
  if (!M) return;
  // painted hull: cool off-white; the livery texture supplies blue nose/spine + red rings
  if (M.matHull) {
    M.matHull.color.set(0xa6b6ca);
    M.matHull.roughness = 0.34; M.matHull.metalness = 0.08;
    M.matHull.clearcoat = 1.0; M.matHull.clearcoatRoughness = 0.12;
    M.matHull.envMapIntensity = 1.35;
    M.matHull.specularIntensity = 1.0;
  }
  if (M.matWing) {
    M.matWing.color.set(0xa2b2c6);
    M.matWing.roughness = 0.38; M.matWing.metalness = 0.08;
    M.matWing.clearcoat = 1.0; M.matWing.clearcoatRoughness = 0.14;
    M.matWing.envMapIntensity = 1.3;
  }
  // deep saturated Cornerian blue with a metallic flake response
  if (M.matBlue) { M.matBlue.color.set(0x1233c8); M.matBlue.metalness = 0.55; M.matBlue.roughness = 0.28; M.matBlue.envMapIntensity = 1.6; }
  // gunmetal grey (keel, nozzle lip, cannons) darker so it separates from the white
  if (M.matGrey) { M.matGrey.color.set(0x5c6878); M.matGrey.metalness = 0.75; M.matGrey.roughness = 0.35; }
  if (M.matDark) { M.matDark.color.set(0x161b26); M.matDark.roughness = 0.5; }
  // signal red accents
  if (M.matRed) { M.matRed.color.set(0xe8281e); M.matRed.metalness = 0.2; M.matRed.roughness = 0.32; M.matRed.emissive?.set?.(0x3a0500); }
  for (const k in M) if (M[k]) M[k].needsUpdate = true;
}
