import * as THREE from 'three';

/**
 * Hero "material chart" — a floating sky-dock with a handful of primitives
 * in the STARWING material language: clear-coated white hull, cobalt anodised
 * metal, mirror chrome, brushed gold, and a hot red G-diffuser emitter.
 * Everything is procedural (canvas textures), instanced where it repeats.
 */

function panelTexture(size = 512, base = '#eef1f6', line = '#b9c2d2', accent = '#2457d6') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // panel seams
  g.strokeStyle = line; g.lineWidth = 3;
  const cells = 4;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * size;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  // accent stripe + hazard ticks
  g.fillStyle = accent; g.fillRect(0, size * 0.44, size, size * 0.06);
  g.fillStyle = line;
  for (let i = 0; i < 12; i++) g.fillRect(size * 0.08 + i * size * 0.07, size * 0.72, size * 0.03, size * 0.06);
  // rivets
  g.fillStyle = '#9aa4b6';
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = (i + 0.5) / cells * size, y = (j + 0.5) / cells * size;
    for (const [dx, dy] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
      g.beginPath(); g.arc(x + dx * size / cells, y + dy * size / cells, 4, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function roughnessTexture(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#707070'; g.fillRect(0, 0, size, size);
  // subtle smudges / wear
  for (let i = 0; i < 260; i++) {
    const r = 10 + Math.random() * 60;
    const x = Math.random() * size, y = Math.random() * size;
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 90 + Math.floor(Math.random() * 80);
    gg.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

function gridTexture(size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2028'; g.fillRect(0, 0, size, size);
  g.strokeStyle = '#2a323f'; g.lineWidth = 2;
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * size;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  g.strokeStyle = '#3a4657'; g.lineWidth = 6;
  for (let i = 0; i <= 3; i++) {
    const p = (i / 3) * size;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  // yellow landing chevrons
  g.fillStyle = '#e0b43a';
  g.save(); g.translate(size / 2, size / 2);
  for (let k = 0; k < 3; k++) {
    const r = size * (0.12 + k * 0.05);
    g.beginPath(); g.moveTo(-r, r * 0.35); g.lineTo(0, -r * 0.35); g.lineTo(r, r * 0.35); g.lineTo(r - 18, r * 0.35); g.lineTo(0, -r * 0.35 + 22); g.lineTo(-r + 18, r * 0.35); g.closePath(); g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function makeHeroMaterials() {
  const hullMap = panelTexture();
  const rough = roughnessTexture();
  return {
    hull: new THREE.MeshPhysicalMaterial({
      map: hullMap, roughnessMap: rough, color: 0xffffff, roughness: 0.42, metalness: 0.08,
      clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.0,
    }),
    cobalt: new THREE.MeshPhysicalMaterial({
      color: 0x1e4fd8, roughness: 0.28, metalness: 0.9, roughnessMap: rough, clearcoat: 0.4, clearcoatRoughness: 0.2,
    }),
    cobaltDS: new THREE.MeshPhysicalMaterial({
      color: 0x1e4fd8, roughness: 0.28, metalness: 0.9, roughnessMap: rough, clearcoat: 0.4, clearcoatRoughness: 0.2, side: THREE.DoubleSide,
    }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 1.0 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xd9a543, roughness: 0.34, metalness: 1.0, roughnessMap: rough }),
    graphite: new THREE.MeshPhysicalMaterial({ map: gridTexture(), color: 0xffffff, roughness: 0.72, metalness: 0.15, roughnessMap: rough }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x1a1f28, roughness: 0.55, metalness: 0.6 }),
    emitRed: new THREE.MeshPhysicalMaterial({ color: 0x400808, emissive: 0xff2a1a, emissiveIntensity: 2.6, roughness: 0.3 }),
    emitBlue: new THREE.MeshPhysicalMaterial({ color: 0x082040, emissive: 0x48a8ff, emissiveIntensity: 1.8, roughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x8fd3ff, roughness: 0.05, metalness: 0.0, transmission: 0.0, transparent: true, opacity: 0.55,
      clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.45, thickness: 0.6,
    }),
  };
}

/**
 * makeHero() -> Group with .update(dt, t), .pop() (anticipation+overshoot
 * bounce on preset change), .items (array of animated meshes).
 */
export function makeHero() {
  const M = makeHeroMaterials();
  const root = new THREE.Group();
  root.name = 'lookdev-hero';
  const items = [];
  const add = (mesh, { x = 0, y = 0, z = 0, spin = 0.3, bob = 0.12, phase = 0 } = {}) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.anim = { base: y, spin, bob, phase };
    root.add(mesh); items.push(mesh);
    return mesh;
  };

  // ---- sky dock: hexagonal deck, rim, under-glow
  const deck = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.6, 0.5, 6, 1), M.graphite);
  top.receiveShadow = true; top.castShadow = true;
  top.position.y = -0.25;
  deck.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.35, 0.09, 8, 6), M.emitBlue);
  rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.y = -0.02;
  deck.add(rim);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 2.6, 2.2, 6, 1), M.dark);
  under.position.y = -1.55; under.castShadow = true;
  deck.add(under);
  const thr = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.5, 24), M.emitBlue);
  thr.position.y = -2.85; deck.add(thr);
  // stanchion posts at hex corners (instanced)
  const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.2, 8);
  const posts = new THREE.InstancedMesh(postGeo, M.dark, 6);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    tmp.position.set(Math.cos(a) * 5.7, 0.6, Math.sin(a) * 5.7); tmp.updateMatrix();
    posts.setMatrixAt(i, tmp.matrix);
  }
  posts.castShadow = true; deck.add(posts);
  const lampGeo = new THREE.SphereGeometry(0.13, 12, 8);
  const lamps = new THREE.InstancedMesh(lampGeo, M.emitRed, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    tmp.position.set(Math.cos(a) * 5.7, 1.28, Math.sin(a) * 5.7); tmp.updateMatrix();
    lamps.setMatrixAt(i, tmp.matrix);
  }
  deck.add(lamps);
  root.add(deck);

  // ---- hero primitives
  // centre: chrome sphere on a cobalt pedestal
  const ped = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 6), M.cobalt), { y: 0.3, spin: 0, bob: 0 });
  ped.receiveShadow = true;
  add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 64, 48), M.chrome), { y: 1.95, spin: 0, bob: 0.08, phase: 0 });
  // left: white hull cube with panel lines (bevelled via rounded box-ish)
  const cube = add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7, 1, 1, 1), M.hull), { x: -3.2, y: 1.5, z: 0.6, spin: 0.35, bob: 0.1, phase: 1.3 });
  // blue emitter bar set into the cube
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 0.16), M.emitBlue);
  bar.position.set(0, -0.55, 0.86); cube.add(bar);
  // right: gold torus, tilted
  const torus = add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.36, 32, 96), M.gold), { x: 3.2, y: 1.6, z: 0.4, spin: 0.5, bob: 0.12, phase: 2.6 });
  torus.rotation.x = 0.7;
  // back: G-diffuser emitter (capsule in a cobalt cowl)
  const gd = new THREE.Group();
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.6, 24, 1, true), M.cobaltDS);
  cowl.rotation.x = Math.PI / 2; cowl.castShadow = true;
  const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 8, 24), M.emitRed);
  core.rotation.x = Math.PI / 2;
  gd.add(cowl, core);
  add(gd, { x: -1.4, y: 1.1, z: -3.0, spin: 0.25, bob: 0.1, phase: 4.0 });
  gd.rotation.y = 0.8;
  // back-right: white hull wedge (fighter silhouette stand-in)
  const wedge = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 4, 1), M.hull);
  wedge.scale.set(1.6, 1, 0.55); wedge.rotation.z = -Math.PI / 2; wedge.rotation.x = Math.PI / 4;
  const wedgeGrp = new THREE.Group(); wedgeGrp.add(wedge);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.08), M.cobalt);
  fin.position.set(-0.8, 0.5, 0); fin.castShadow = true; wedgeGrp.add(fin);
  add(wedgeGrp, { x: 2.1, y: 1.3, z: -3.0, spin: 0.2, bob: 0.1, phase: 5.2 });
  wedgeGrp.rotation.y = -0.6;
  // front: glass dome over a blue emitter
  const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), M.glass), { x: 0.4, y: 0.02, z: 3.4, spin: 0, bob: 0 });
  dome.castShadow = false;
  const domeCore = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), M.emitBlue);
  domeCore.position.y = 0.3; dome.add(domeCore);

  root.traverse((o) => { if (o.isMesh && o !== rim && o !== thr && o !== dome && o !== lamps) { o.castShadow = true; o.receiveShadow = true; } });

  let popT = 10;
  const popCurve = (t) => {
    if (t < 0.11) return 1 - 0.09 * Math.sin((Math.PI * t) / 0.11); // anticipation squash
    const u = t - 0.11;
    return 1 + 0.2 * Math.exp(-u * 5.5) * Math.sin(u * 17); // overshoot & settle
  };

  root.update = (dt, t) => {
    popT += dt;
    const s = popCurve(popT);
    for (const m of items) {
      const a = m.userData.anim;
      m.rotation.y += dt * a.spin;
      m.position.y = a.base + Math.sin(t * 1.3 + a.phase) * a.bob;
      const ss = 1 + (s - 1) * (m === ped ? 0.3 : 1);
      m.scale.setScalar(ss);
      if (a.bob > 0) m.scale.y = 1 + (1 / ss - 1) * 0.6 + (ss - 1); // squash-stretch
    }
    const pulse = 0.85 + 0.15 * Math.sin(t * 4.0);
    M.emitRed.emissiveIntensity = 2.6 * pulse * (1 + (s - 1) * 4);
    M.emitBlue.emissiveIntensity = 1.8 * (0.9 + 0.1 * Math.sin(t * 2.3 + 1)) * (1 + (s - 1) * 3);
    root.position.y = Math.sin(t * 0.7) * 0.08;
    root.rotation.z = Math.sin(t * 0.5) * 0.008;
  };
  root.pop = () => { popT = 0; };
  root.materials = M;
  root.items = items;
  root.disposeHero = () => {
    root.traverse((o) => { o.geometry?.dispose?.(); });
    for (const m of Object.values(M)) { m.map?.dispose(); m.roughnessMap?.dispose(); m.dispose(); }
  };
  return root;
}
