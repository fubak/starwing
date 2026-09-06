// Player ship: prefer the `ship` piece's exported builder; fall back to a
// compact stylised Arwing so the boss piece never depends on another's state.

export async function loadArwing(THREE) {
  let obj = null;
  try {
    const mod = await import('../ship/index.js');
    const fn = mod.buildArwing || mod.createArwing || mod.buildShip;
    if (typeof fn === 'function') {
      const r = await fn(THREE);
      obj = r?.isObject3D ? r : r?.group?.isObject3D ? r.group : r?.mesh?.isObject3D ? r.mesh : r?.object?.isObject3D ? r.object : null;
    }
  } catch (e) { obj = null; }
  const group = new THREE.Group();
  const ship = obj || fallbackArwing(THREE);
  // Normalise to ~7 units long, nose toward -Z.
  const box = new THREE.Box3().setFromObject(ship);
  const size = box.getSize(new THREE.Vector3());
  const len = Math.max(size.z, 1e-3);
  const s = 7 / len;
  ship.scale.multiplyScalar(s);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  ship.position.sub(c);
  group.add(ship);
  return group;
}

export function fallbackArwing(THREE) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.35, roughness: 0.32 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x2a5bd8, metalness: 0.4, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d2230, metalness: 0.6, roughness: 0.45 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x2a86ff, metalness: 0.1, roughness: 0.05, transmission: 0, emissive: 0x0b2a66, emissiveIntensity: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x66c8ff });

  // fuselage: tapered box via cylinder with 4 sides
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 5.5, 6, 1), hullMat);
  fus.rotation.x = -Math.PI / 2; fus.rotation.y = Math.PI / 6; fus.scale.set(1, 1, 0.65); g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 6), hullMat);
  nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 6; nose.position.z = -3.9; nose.scale.set(1, 1, 0.65); g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glassMat);
  canopy.scale.set(0.8, 0.6, 1.6); canopy.position.set(0, 0.55, -0.6); g.add(canopy);
  // wings (swept, blue tips)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(4.6, -1.3); wingShape.lineTo(4.9, -0.8); wingShape.lineTo(1.2, 1.9); wingShape.lineTo(0, 1.9); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  for (const sgn of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, hullMat);
    w.rotation.y = sgn > 0 ? 0 : Math.PI; w.rotation.x = Math.PI / 2 - 0.2 * sgn * sgn; w.position.set(0, -0.1, 1.2);
    w.rotation.set(Math.PI / 2, sgn > 0 ? 0 : Math.PI, 0);
    w.rotation.z = sgn * 0.12; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 1.6), blueMat); tip.position.set(sgn * 4.6, -0.55, 1.6); g.add(tip);
    // G-diffuser
    const gd = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.8, 12), darkMat);
    gd.rotation.x = Math.PI / 2; gd.position.set(sgn * 1.55, -0.35, 1.4); g.add(gd);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 12), glowMat); gl.rotation.x = Math.PI / 2; gl.position.set(sgn * 1.55, -0.35, 2.32); g.add(gl);
    // laser cannons
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 8), darkMat); can.rotation.x = Math.PI / 2; can.position.set(sgn * 2.6, -0.3, -1.0); g.add(can);
  }
  // main engine
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.7, 16), darkMat); eng.rotation.x = Math.PI / 2; eng.position.set(0, 0, 2.9); g.add(eng);
  const engGlow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 16), glowMat); engGlow.position.set(0, 0, 3.26); g.add(engGlow);
  // tail fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.4), blueMat); fin.position.set(0, 0.9, 1.9); fin.rotation.x = 0.35; g.add(fin);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
