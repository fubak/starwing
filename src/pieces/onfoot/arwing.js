// Stylised docked Arwing (static prop for the hangar). Nose points +z.
import * as THREE from 'three';

export function buildDockedArwing() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe6ebf2, roughness: 0.28, metalness: 0.35, envMapIntensity: 1.2 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2456c8, roughness: 0.3, metalness: 0.4, envMapIntensity: 1.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.35, metalness: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c2a48, roughness: 0.05, metalness: 0.3, clearcoat: 1, transmission: 0.2, envMapIntensity: 2.0, emissive: 0x0e3a66, emissiveIntensity: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x4fd4ff, emissiveIntensity: 3.0 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.4 });
  const add = (mesh, p, r, s) => { if (p) mesh.position.set(...p); if (r) mesh.rotation.set(...r); if (s) mesh.scale.set(...s); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };

  // fuselage: tapered body
  const body = new THREE.CylinderGeometry(0.28, 0.75, 5.2, 10, 1); body.rotateX(Math.PI / 2);
  add(new THREE.Mesh(body, white), [0, 0, 0.6], null, [1.1, 0.75, 1]);
  const nose = new THREE.ConeGeometry(0.28, 2.4, 10); nose.rotateX(Math.PI / 2);
  add(new THREE.Mesh(nose, white), [0, 0, 4.4], null, [1.1, 0.75, 1]);
  const noseTip = new THREE.ConeGeometry(0.1, 1.0, 8); noseTip.rotateX(Math.PI / 2);
  add(new THREE.Mesh(noseTip, dark), [0, 0, 5.6]);
  // canopy
  const canopy = new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  add(new THREE.Mesh(canopy, glass), [0, 0.35, 1.6], null, [0.8, 0.8, 1.9]);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.0), dark), [0, 0.32, 1.6]);
  // wings (main, swept down slightly)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(3.4, -0.9); wingShape.lineTo(3.6, -0.5); wingShape.lineTo(1.2, 1.2); wingShape.lineTo(0, 1.4); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, blue);
    w.rotation.set(Math.PI / 2, 0, 0); w.scale.set(s, 1, 1); w.position.set(s * 0.5, -0.05, -1.0); w.rotation.z = s * 0.12; w.castShadow = true; w.receiveShadow = true; g.add(w);
    // wing tip fin + laser
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.2), white), [s * 3.7, 0.3, -0.5], [0, 0, -s * 0.15]);
    const laser = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8); laser.rotateX(Math.PI / 2);
    add(new THREE.Mesh(laser, dark), [s * 3.7, 0.05, 0.6]);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glow), [s * 3.7, 0.05, 1.4]);
    // upper fins (G-diffuser fins)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 1.4), white), [s * 0.9, 0.7, -1.6], [0, 0, s * 0.6]);
  }
  // engine block + G-diffuser ring
  const eng = new THREE.CylinderGeometry(0.62, 0.7, 1.2, 14); eng.rotateX(Math.PI / 2);
  add(new THREE.Mesh(eng, dark), [0, 0, -2.4]);
  const ring = new THREE.TorusGeometry(0.62, 0.09, 8, 24);
  add(new THREE.Mesh(ring, glow), [0, 0, -3.0]);
  add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x1a5aa0, emissiveIntensity: 0.8 })), [0, 0, -3.01], [Math.PI, 0, 0]);
  // stripes
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 2.4), red), [0, 0.5, -0.4]);
  // landing gear
  for (const [x, z] of [[-0.9, -1.2], [0.9, -1.2], [0, 2.6]]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), dark), [x, -0.75, z]);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.5), dark), [x, -1.25, z]);
  }
  return g;
}
