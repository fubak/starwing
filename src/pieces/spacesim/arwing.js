// Fallback procedural Arwing (used only if the `ship` piece doesn't export buildArwing yet).
// Forward is -Z, up is +Y. Length ~ 7 units.
import * as THREE from 'three';

export function buildFallbackArwing({ envMap = null } = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9eef5, metalness: 0.25, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, envMap, envMapIntensity: 1.2 });
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x2b63d9, metalness: 0.35, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, envMap, envMapIntensity: 1.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.7, roughness: 0.45, envMap, envMapIntensity: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1a3a, metalness: 0.1, roughness: 0.05, clearcoat: 1, transmission: 0, envMap, envMapIntensity: 2.0, emissive: 0x08234a, emissiveIntensity: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x66c8ff, toneMapped: false });
  glow.color.multiplyScalar(2.2);

  // fuselage via lathe profile (radius along -Z)
  const prof = [];
  const pts = [[0, -3.6], [0.16, -3.3], [0.34, -2.6], [0.46, -1.6], [0.5, -0.4], [0.48, 0.9], [0.42, 1.9], [0.36, 2.6], [0.30, 3.0], [0.0, 3.0]];
  for (const [r, z] of pts) prof.push(new THREE.Vector2(r, z));
  const hullGeo = new THREE.LatheGeometry(prof, 24);
  hullGeo.rotateX(-Math.PI / 2); // lathe axis Y -> Z
  hullGeo.scale(1.15, 0.85, 1);
  const hull = new THREE.Mesh(hullGeo, paint);
  g.add(hull);
  // belly keel (dark), gives the silhouette a chunky underside
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 3.4), dark);
  keel.position.set(0, -0.38, 0.4);
  g.add(keel);

  // canopy
  const canGeo = new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  canGeo.scale(0.9, 1.0, 2.2);
  const canopy = new THREE.Mesh(canGeo, glass);
  canopy.position.set(0, 0.32, -0.7);
  g.add(canopy);
  const canFrame = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 24), dark);
  canFrame.rotation.x = Math.PI / 2; canFrame.scale.set(0.9, 2.2, 1); canFrame.position.set(0, 0.33, -0.7);
  g.add(canFrame);

  // main wings: broad swept shape, angled downward (classic Arwing), extruded thin
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -1.4); wingShape.lineTo(3.4, 0.9); wingShape.lineTo(3.7, 1.15); wingShape.lineTo(3.7, 1.55); wingShape.lineTo(1.2, 1.7); wingShape.lineTo(0, 1.2);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  wingGeo.rotateX(Math.PI / 2); // shape in XY -> lie in XZ plane; y-> -z
  wingGeo.translate(0, -0.07, 0);
  const stripeShape = new THREE.Shape();
  stripeShape.moveTo(0.2, -1.05); stripeShape.lineTo(3.3, 1.05); stripeShape.lineTo(3.3, 1.3); stripeShape.lineTo(0.2, -0.75);
  const stripeGeo = new THREE.ExtrudeGeometry(stripeShape, { depth: 0.03, bevelEnabled: false });
  stripeGeo.rotateX(Math.PI / 2); stripeGeo.translate(0, 0.09, 0);
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    const wm = new THREE.Mesh(wingGeo, paint);
    const st = new THREE.Mesh(stripeGeo, blue);
    w.add(wm, st);
    // G-diffuser at the wing tip
    const gd = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 1.6), dark);
    gd.position.set(3.7, 0.0, 1.3);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 1.2), glow);
    slot.position.set(3.7, 0.0, 1.3);
    slot.name = 'diffuser';
    const gdCap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 12), paint);
    gdCap.rotation.x = -Math.PI / 2; gdCap.position.set(3.7, 0, 0.15);
    w.add(gd, slot, gdCap);
    w.scale.x = side;
    w.position.set(side * 0.35, -0.12, 0.2);
    w.rotation.z = side * -0.30; // droop downward
    g.add(w);
  }
  // upper stabiliser fins (small, angled up/out)
  const finShape = new THREE.Shape();
  finShape.moveTo(0, -0.4); finShape.lineTo(1.5, 0.6); finShape.lineTo(1.5, 0.95); finShape.lineTo(0, 0.9);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  finGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(finGeo, blue);
    f.scale.x = side;
    f.position.set(side * 0.3, 0.32, 1.5);
    f.rotation.z = side * 0.75;
    g.add(f);
  }
  // engine nozzle + glow
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.6, 20), dark);
  nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.0, 3.1);
  g.add(nozzle);
  const engMat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  engMat.color.multiplyScalar(2.5);
  const eng = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), engMat);
  eng.position.set(0, 0, 3.42);
  eng.name = 'engineGlow';
  g.add(eng);
  const flameGeo = new THREE.ConeGeometry(0.3, 2.4, 16, 1, true);
  flameGeo.translate(0, -1.2, 0); flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uPower;
      void main(){ float t = vUv.y; float flick = 0.85 + 0.15*sin(uTime*40.0 + vUv.x*20.0);
        float a = pow(1.0 - t, 2.2) * flick * uPower; vec3 c = mix(vec3(0.3,0.7,1.0), vec3(1.0,1.0,1.0), pow(1.0-t, 4.0));
        gl_FragColor = vec4(c * a * 2.0, a); }`,
  });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(0, 0, 3.4);
  flame.name = 'flame';
  g.add(flame);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.userData.flame = flame;
  g.userData.engineGlow = eng;
  return g;
}
