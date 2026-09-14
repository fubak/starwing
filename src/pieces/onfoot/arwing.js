// Docked Arwing prop for the hangar: wraps the hero Arwing from the `ship` piece
// (read-only import) so the parked fighter matches the flight model exactly.
// Engines cold: plumes hidden, local point lights removed (keeps light count low),
// gentle idle shimmer only. Nose points -z in ship space; we expose a group.
import * as THREE from 'three';
import { buildArwing } from '../ship/arwing.js';

export function buildDockedArwing(scale = 1.55, groundY = 1.6) {
  const rig = buildArwing({ THREE });
  const g = new THREE.Group();
  g.add(rig.group);
  rig.group.scale.setScalar(scale);
  rig.setThrust(0); rig.setHover(0);
  rig.state.thrust = 0;
  // cold engines: hide plumes, drop the ship's own point lights
  const toRemove = [], discs = [];
  rig.group.traverse((o) => {
    if (o.isPointLight) toRemove.push(o);
    if (o.material?.uniforms?.uCore) o.visible = false; // plume lathes
    if (o.material?.uniforms?.uIntensity) discs.push(o.material.uniforms.uIntensity); // engine/G-diffuser discs
  });
  for (const l of toRemove) l.parent.remove(l);
  // landing gear (the flight model has none): nose strut + two mains, with pads and hydraulic detail.
  // None of it casts: the merged hull above already drops a shadow over the whole
  // gear footprint, so 6 extra draws in the 1024^2 spot shadow pass buy nothing
  // (pads still RECEIVE, which is what reads).
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x3a4454, roughness: 0.4, metalness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, roughness: 0.2, metalness: 1.0 });
  const hullBottom = -0.34 * scale;
  const len = hullBottom + groundY; // strut length from hull bottom to floor
  for (const [x, z] of [[0, -2.6 * scale], [-0.85 * scale, 1.1 * scale], [0.85 * scale, 1.1 * scale]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, len, 10), strutMat); strut.position.set(x, hullBottom - len / 2, z); g.add(strut);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len * 0.5, 8), chrome); piston.position.set(x + 0.09, hullBottom - len * 0.55, z); g.add(piston);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 14), strutMat); pad.position.set(x, -groundY + 0.07, z); pad.receiveShadow = true; g.add(pad);
    const well = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.8), strutMat); well.position.set(x, hullBottom + 0.02, z); g.add(well);
  }
  g.userData.rig = rig;
  // rig.update() re-drives the disc intensities every frame, so dim them *after* it runs:
  // cold engines read as a faint standby glow, never a flare that eats the hull outline.
  g.userData.update = (dt, t, camera) => { rig.update(dt, t, camera); for (const u of discs) u.value *= 0.3; };
  g.userData.dispose = () => rig.dispose();
  return g;
}
