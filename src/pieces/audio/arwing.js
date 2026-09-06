/**
 * Hero Arwing for the Audio Lab pedestal — a chunky Star Fox silhouette:
 * stubby wedge fuselage, long bubble canopy, twin laser cannons under the nose,
 * swept-back anhedral wings ending in blade-like G-diffusers with glowing blue
 * tips, twin canted tail fins, single big engine nozzle. Nose points -Z.
 *
 * Built entirely from lofted cross-sections + extruded plates so the silhouette
 * stays clean and blocky rather than "generic jet".
 *
 *   const ship = buildHeroArwing({ THREE });
 *   ship.group / ship.rig / ship.muzzles[2] / ship.setThrust / ship.setBank / ship.flap / ship.update / ship.dispose
 */

/** Loft a closed rounded-rectangle profile through a list of stations. */
function loft(THREE, stations, segs = 24) {
  const pos = [], nor = [], idx = [];
  const ring = (s) => {
    const out = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // superellipse: exponent p controls boxiness (2 = ellipse, 4+ = rounded box)
      const c = Math.cos(a), sn = Math.sin(a);
      const p = s.p ?? 3.2;
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / p) * s.w;
      let y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p) * s.h;
      if (sn < 0) y *= s.bot ?? 1;      // flatter belly
      out.push([x, y + (s.y ?? 0), s.z]);
    }
    return out;
  };
  const rings = stations.map(ring);
  for (let r = 0; r < rings.length; r++) for (let i = 0; i < segs; i++) pos.push(...rings[r][i]);
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < segs; i++) {
    const a = r * segs + i, b = r * segs + (i + 1) % segs, c = (r + 1) * segs + i, d = (r + 1) * segs + (i + 1) % segs;
    idx.push(a, c, b, b, c, d);
  }
  // caps
  const capCenter = (r) => { const s = stations[r]; pos.push(0, s.y ?? 0, s.z); return pos.length / 3 - 1; };
  const c0 = capCenter(0), c1 = capCenter(stations.length - 1);
  for (let i = 0; i < segs; i++) { idx.push(c0, (i + 1) % segs, i); idx.push(c1, (stations.length - 1) * segs + i, (stations.length - 1) * segs + (i + 1) % segs); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Thin bevelled plate from a 2D outline (in the XZ plane, y = thickness). */
function plate(THREE, pts, thick, bevel = 0.02) {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  // shape (x, y) -> (x, z) keeping the sign of the second coordinate (+v = aft, +Z); extrude ends up along -Y
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return g;
}

export function buildHeroArwing({ THREE }) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const disposables = [];
  const D = (o) => (disposables.push(o), o);

  // ---- materials ------------------------------------------------------------------
  const matHull = D(new THREE.MeshPhysicalMaterial({ color: 0xe6ecf3, metalness: 0.28, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.3 }));
  const matBlue = D(new THREE.MeshPhysicalMaterial({ color: 0x2a5fe0, metalness: 0.35, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.3 }));
  const matDark = D(new THREE.MeshStandardMaterial({ color: 0x232a3a, metalness: 0.7, roughness: 0.42 }));
  const matGun = D(new THREE.MeshStandardMaterial({ color: 0x8d97a8, metalness: 0.9, roughness: 0.3 }));
  const matGlass = D(new THREE.MeshPhysicalMaterial({ color: 0x0b2a5c, metalness: 0.1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2.2, transparent: true, opacity: 0.92, emissive: 0x06183a, emissiveIntensity: 0.6 }));
  const matGlow = D(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.3, 3.0) }));          // G-diffuser / engine core (over 1 -> bloom)
  const matGlowDim = D(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.2) }));
  const matRed = D(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3) }));

  // ---- fuselage: stubby wedge, wide shoulders, flat belly ---------------------------
  const body = D(loft(THREE, [
    { z: -2.05, w: 0.05, h: 0.05, y: -0.02, p: 2.2 },
    { z: -1.75, w: 0.22, h: 0.15, y: -0.02, p: 2.6 },
    { z: -1.2, w: 0.42, h: 0.27, y: 0.0, p: 3.0 },
    { z: -0.5, w: 0.55, h: 0.36, y: 0.02, p: 3.4, bot: 0.8 },
    { z: 0.3, w: 0.6, h: 0.4, y: 0.03, p: 3.6, bot: 0.8 },
    { z: 1.1, w: 0.56, h: 0.4, y: 0.02, p: 3.4, bot: 0.85 },
    { z: 1.6, w: 0.46, h: 0.36, y: 0.0, p: 3.0 },
    { z: 1.75, w: 0.4, h: 0.32, y: 0.0, p: 2.6 },
  ], 28));
  rig.add(new THREE.Mesh(body, matHull));
  // nose cap stripe + chin
  const chin = new THREE.Mesh(D(plate(THREE, [[-0.34, -1.55], [0.34, -1.55], [0.46, -0.4], [0.5, 0.9], [-0.5, 0.9], [-0.46, -0.4]], 0.08, 0.015)), matBlue);
  chin.position.y = -0.3; rig.add(chin);
  // dorsal spine
  const spine = new THREE.Mesh(D(plate(THREE, [[-0.12, 0.45], [0.12, 0.45], [0.09, 1.7], [-0.09, 1.7]], 0.09, 0.012)), matBlue);
  spine.position.y = 0.4; rig.add(spine);

  // ---- canopy: long bubble, dark blue glass with a frame ------------------------------
  const canopyGeo = D(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  const canopy = new THREE.Mesh(canopyGeo, matGlass);
  canopy.scale.set(0.34, 0.34, 0.92); canopy.position.set(0, 0.33, -0.55); canopy.renderOrder = 5; rig.add(canopy);
  const frame = new THREE.Mesh(D(new THREE.TorusGeometry(1, 0.035, 6, 40, Math.PI)), matDark);
  frame.scale.set(0.35, 0.35, 1); frame.position.set(0, 0.33, -0.75); frame.rotation.y = 0; rig.add(frame);
  const frame2 = frame.clone(); frame2.position.set(0, 0.33, -0.25); frame2.scale.set(0.34, 0.33, 1); rig.add(frame2);
  // pilot silhouette
  const helmet = new THREE.Mesh(D(new THREE.SphereGeometry(0.11, 12, 10)), matDark); helmet.position.set(0, 0.47, -0.4); rig.add(helmet);
  const visor = new THREE.Mesh(D(new THREE.SphereGeometry(0.075, 10, 8)), matGlowDim); visor.position.set(0, 0.48, -0.5); visor.scale.set(1, 0.6, 0.6); rig.add(visor);
  const dash = new THREE.Mesh(D(new THREE.BoxGeometry(0.36, 0.08, 0.2)), matDark); dash.position.set(0, 0.3, -1.0); rig.add(dash);

  // ---- twin laser cannons under the nose -----------------------------------------
  const muzzles = [];
  const barrelGeo = D(new THREE.CylinderGeometry(0.06, 0.075, 1.5, 12)); barrelGeo.rotateX(Math.PI / 2);
  const barrelTipGeo = D(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 12)); barrelTipGeo.rotateX(Math.PI / 2);
  const mountGeo = D(new THREE.BoxGeometry(0.16, 0.2, 0.7));
  for (const s of [-1, 1]) {
    const x = s * 0.42, y = -0.32;
    const b = new THREE.Mesh(barrelGeo, matGun); b.position.set(x, y, -1.25); rig.add(b);
    const tip = new THREE.Mesh(barrelTipGeo, matDark); tip.position.set(x, y, -1.95); rig.add(tip);
    const core = new THREE.Mesh(D(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8)), matGlow); core.geometry.rotateX(Math.PI / 2); core.position.set(x, y, -2.03); rig.add(core);
    const m = new THREE.Mesh(mountGeo, matDark); m.position.set(x, y + 0.08, -0.7); rig.add(m);
    muzzles.push(new THREE.Vector3(x, y, -2.1));
  }

  // ---- wings: swept, anhedral, thick at the root, G-diffuser blades at the tips ------------
  const flapPivots = [], gdGlows = [];
  const wingOutline = [[0, -0.55], [0.75, -0.15], [1.75, 0.45], [2.3, 0.7], [2.3, 1.55], [1.35, 1.4], [0.35, 1.3], [0, 1.3]];
  const wingGeo = D(plate(THREE, wingOutline, 0.11, 0.03));
  const stripeGeo = D(plate(THREE, [[0.9, 0.05], [1.9, 0.72], [2.05, 1.05], [1.3, 1.02], [0.75, 0.62]], 0.03, 0.006));
  // blade outline in (y, z): plate() puts u on x, v on z, thickness on y; rotateZ(+90deg) maps x->y so u becomes height
  const gdGeo = D(plate(THREE, [[0.06, -0.6], [0.06, 0.62], [-0.62, 0.75], [-0.72, 0.3], [-0.4, -0.5]], 0.14, 0.02));
  gdGeo.rotateZ(Math.PI / 2);
  const gdGlowGeo = D(new THREE.BoxGeometry(0.06, 0.62, 0.16));
  const gdCapGeo = D(new THREE.BoxGeometry(0.2, 0.12, 1.25));
  for (const s of [-1, 1]) {
    const root = new THREE.Group(); root.position.set(s * 0.5, -0.04, 0.35); rig.add(root);
    const pivot = new THREE.Group(); root.add(pivot); flapPivots.push(pivot);
    const wing = new THREE.Mesh(wingGeo, matHull);
    wing.scale.x = s; wing.rotation.z = s * -0.2;        // anhedral: tips droop
    pivot.add(wing);
    const stripe = new THREE.Mesh(stripeGeo, matBlue); stripe.position.y = 0.07; wing.add(stripe);
    // G-diffuser blade at the tip: vertical fin dropping below the wing, glowing trailing edge
    const gd = new THREE.Group(); gd.position.set(2.27, -0.1, 1.05); wing.add(gd);
    const blade = new THREE.Mesh(gdGeo, matHull); blade.position.set(0, 0, 0.1); gd.add(blade);
    const cap = new THREE.Mesh(gdCapGeo, matBlue); cap.position.set(0, 0.05, 0.15); gd.add(cap);
    const glow = new THREE.Mesh(gdGlowGeo, matGlow); glow.position.set(0, -0.3, 0.8); gd.add(glow); gdGlows.push(glow);
    const glow2 = new THREE.Mesh(gdGlowGeo, matGlowDim); glow2.scale.set(0.6, 0.9, 0.5); glow2.position.set(0, -0.3, -0.45); gd.add(glow2);
    // nav light
    const nav = new THREE.Mesh(D(new THREE.SphereGeometry(0.04, 8, 6)), s < 0 ? matRed : matGlow); nav.position.set(0, 0.14, -0.3); gd.add(nav);
  }

  // ---- twin tail fins, canted outward ---------------------------------------------
  const finGeo = D(plate(THREE, [[0, 0.3], [0, 1.6], [0.72, 1.72], [0.85, 1.42], [0.3, 0.5]], 0.07, 0.012));
  finGeo.rotateZ(Math.PI / 2);   // stand plate up: u -> y (height), v -> z
  const finTipGeo = D(plate(THREE, [[0.62, 1.42], [0.62, 1.7], [0.72, 1.72], [0.85, 1.42]], 0.09, 0.01)); finTipGeo.rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) {
    const fin = new THREE.Group(); fin.position.set(s * 0.3, 0.3, 0); fin.rotation.z = s * -0.38; rig.add(fin);
    fin.add(new THREE.Mesh(finGeo, matHull));
    fin.add(new THREE.Mesh(finTipGeo, matBlue));
  }

  // ---- engine: single wide nozzle with glowing core + afterglow disc -----------------------
  const nozzle = new THREE.Mesh(D(new THREE.CylinderGeometry(0.36, 0.3, 0.32, 28, 1, true)), matDark);
  nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0, 1.9); nozzle.material.side = THREE.DoubleSide; rig.add(nozzle);
  const lip = new THREE.Mesh(D(new THREE.TorusGeometry(0.35, 0.04, 8, 32)), matGun); lip.position.set(0, 0, 2.06); rig.add(lip);
  const core = new THREE.Mesh(D(new THREE.CircleGeometry(0.27, 28)), matGlow); core.position.set(0, 0, 1.95); core.rotation.y = Math.PI; rig.add(core);
  const plumeMat = D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 0.5 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uK,uTime;
      void main(){ float y=vUv.y; float flick=0.85+0.15*sin(uTime*47.0+y*20.0);
        float a=pow(1.0-y,1.6)*(0.35+0.65*uK)*flick;
        vec3 c=mix(vec3(0.4,1.6,2.6), vec3(1.4,1.8,2.2), pow(1.0-y,3.0));
        gl_FragColor=vec4(c*a,a*0.8); }`,
  }));
  const plumeGeo = D(new THREE.CylinderGeometry(0.02, 0.3, 1.8, 20, 1, true));
  plumeGeo.rotateX(Math.PI / 2); plumeGeo.translate(0, 0, 0.9);  // narrow end (uv.y=1) points aft (+Z); shader fades toward it
  const plume = new THREE.Mesh(plumeGeo, plumeMat); plume.position.set(0, 0, 2.0); plume.renderOrder = 10; rig.add(plume);
  const glowDiscMat = D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 0.5 }, uCol: { value: new THREE.Color(0.5, 1.6, 2.6) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uK; uniform vec3 uCol; void main(){ float r=length(vUv-0.5)*2.0; float a=exp(-r*r*6.0)*(0.25+0.35*uK); gl_FragColor=vec4(uCol*a,a); }`,
  }));
  const discGeo = D(new THREE.PlaneGeometry(1.3, 1.3));
  const engDisc = new THREE.Mesh(discGeo, glowDiscMat); engDisc.position.set(0, 0, 2.12); engDisc.renderOrder = 11; rig.add(engDisc);
  const gdDiscs = gdGlows.map((g) => { const d = new THREE.Mesh(discGeo, glowDiscMat); d.scale.setScalar(0.55); d.position.set(0, 0, 0.1); g.add(d); d.renderOrder = 11; return d; });

  // ---- animation state ------------------------------------------------------------
  let thrust = 0.5, bank = 0, bankCur = 0, flapT = 0, flapCur = 0;
  const api = {
    group, rig, muzzles,
    setThrust(v) { thrust = Math.max(0, Math.min(1, v)); },
    setBank(v) { bank = Math.max(-1, Math.min(1, v)); },
    flap(v) { flapT = Math.max(-1, Math.min(1, v)); },
    setHover() {},
    update(dt, t) {
      bankCur += (bank - bankCur) * Math.min(1, dt * 6);
      flapCur += (flapT - flapCur) * Math.min(1, dt * 5);
      rig.rotation.z = -bankCur * 0.55;
      rig.rotation.x = Math.sin(t * 1.1) * 0.02;
      for (let i = 0; i < 2; i++) flapPivots[i].rotation.z = (i ? -1 : 1) * (flapCur * 0.28 + Math.sin(t * 2.3 + i) * 0.015);
      plume.scale.set(1, 1, 0.5 + thrust * 1.3); plumeMat.uniforms.uK.value = thrust; plumeMat.uniforms.uTime.value = t;
      glowDiscMat.uniforms.uK.value = thrust;
      const g = 0.7 + thrust * 0.6;
      matGlow.color.setRGB(0.9 * g, 2.2 * g, 2.9 * g);
      engDisc.scale.setScalar(0.8 + thrust * 0.6);
    },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
  return api;
}
