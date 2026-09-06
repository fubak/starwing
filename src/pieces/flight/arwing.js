// Local Arwing-class fallback model. Used only when `../ship` does not (yet)
// export buildArwing(). Chunky readable silhouette, clearcoat paint, glowing
// G-diffusers. Nose points -Z, length ~ 6 units.
import * as THREE from 'three';

export function buildFallbackArwing() {
  const g = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xe9eef5, metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18,
  });
  const blue = new THREE.MeshPhysicalMaterial({
    color: 0x2657d8, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3040, metalness: 0.7, roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c1a30, metalness: 0.1, roughness: 0.05, transmission: 0.0, clearcoat: 1,
    envMapIntensity: 2.0, emissive: 0x0a2a55, emissiveIntensity: 0.4,
  });
  const gdiff = new THREE.MeshStandardMaterial({ color: 0x66c8ff, emissive: 0x3fb0ff, emissiveIntensity: 3.5, roughness: 0.3 });
  const engineGlow = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });

  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    g.add(m); return m;
  };

  // fuselage: long wedge
  const fus = new THREE.CylinderGeometry(0.16, 0.62, 5.2, 6, 1);
  fus.rotateX(-Math.PI / 2);
  add(fus, paint, 0, 0, -0.4, 0, 0, 0, 1.0, 0.75, 1);
  // nose cone tip
  const nose = new THREE.ConeGeometry(0.16, 1.4, 6);
  nose.rotateX(-Math.PI / 2);
  add(nose, blue, 0, 0, -3.7);
  // canopy
  const can = new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  add(can, glass, 0, 0.32, -0.9, 0, 0, 0, 0.9, 0.9, 2.0);
  // rear body / engine block
  add(new THREE.BoxGeometry(1.4, 0.7, 1.6), dark, 0, -0.05, 1.6);
  // engine nozzle + glow
  const noz = new THREE.CylinderGeometry(0.42, 0.55, 0.5, 16);
  noz.rotateX(Math.PI / 2);
  add(noz, dark, 0, -0.05, 2.5);
  const glow = add(new THREE.CircleGeometry(0.4, 24), engineGlow, 0, -0.05, 2.77);
  glow.name = 'engineGlow';

  // main wings: swept, thin, blue trailing edges
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -1.2); wingShape.lineTo(4.2, 0.9); wingShape.lineTo(4.6, 1.4); wingShape.lineTo(3.6, 1.5); wingShape.lineTo(0, 1.0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  wingGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const w = add(wingGeo, paint, s * 0.5, -0.1, 0.3, 0, 0, s * 0.12, s, 1, 1);
    w.name = s < 0 ? 'wingL' : 'wingR';
    // wing tip blade
    add(new THREE.BoxGeometry(0.1, 1.1, 1.4), blue, s * 4.55, 0.35, 1.6, 0.2, 0, 0);
    // G-diffuser pods under wings
    const pod = new THREE.CapsuleGeometry(0.28, 1.3, 6, 12);
    pod.rotateX(Math.PI / 2);
    add(pod, dark, s * 2.1, -0.45, 0.9);
    const ring = add(new THREE.TorusGeometry(0.3, 0.07, 10, 24), gdiff, s * 2.1, -0.45, 1.75);
    ring.name = 'gdiff';
    // laser cannon barrels
    const barrel = new THREE.CylinderGeometry(0.07, 0.09, 1.6, 8);
    barrel.rotateX(Math.PI / 2);
    add(barrel, dark, s * 2.1, -0.45, -0.3);
  }
  // upper stabilizer fins (V shape)
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, 1.4, 1.2), blue, s * 0.55, 0.8, 1.9, 0, 0, s * -0.55);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}
