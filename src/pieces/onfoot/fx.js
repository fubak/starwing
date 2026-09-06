// Blaster bolts, sparks, explosions, pickups, training drones.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

export function makeFx(scene) {
  const glowTex = makeGlowTexture();
  const group = new THREE.Group(); scene.add(group);

  // ---- bolts (instanced capsules + glow sprites)
  const MAXB = 24;
  const boltGeo = new THREE.CapsuleGeometry(0.06, 0.9, 3, 8); boltGeo.rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0x9dfcff, toneMapped: false });
  const bolts = new THREE.InstancedMesh(boltGeo, boltMat, MAXB); bolts.count = 0; bolts.frustumCulled = false; group.add(bolts);
  const boltCoreGeo = new THREE.CapsuleGeometry(0.16, 0.8, 3, 8); boltCoreGeo.rotateX(Math.PI / 2);
  const boltCoreMat = new THREE.MeshBasicMaterial({ color: 0x2ad0ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const boltCores = new THREE.InstancedMesh(boltCoreGeo, boltCoreMat, MAXB); boltCores.count = 0; boltCores.frustumCulled = false; group.add(boltCores);
  const boltList = [];
  const boltLight = new THREE.PointLight(0x5fe8ff, 0, 8, 2); group.add(boltLight);

  // ---- particles (sprites)
  const MAXP = 400;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pSize = new Float32Array(MAXP), pAlpha = new Float32Array(MAXP);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tex: { value: glowTex }, scaleY: { value: 720 } },
    vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scaleY;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scaleY / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tex; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(vC * t.a * vA, t.a * vA); }`,
    vertexColors: true,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; group.add(points);
  const parts = []; // {p,v,life,maxLife,size,col,grav,drag}
  const spawnParticle = (p, v, life, size, col, grav = 0, drag = 0) => { if (parts.length >= MAXP) parts.shift(); parts.push({ p: p.clone(), v: v.clone(), life, maxLife: life, size, col, grav, drag }); };

  // ---- shockwave rings
  const ringGeo = new THREE.RingGeometry(0.7, 1.0, 40);
  const rings = [];
  const spawnRing = (pos, color, maxR = 3, life = 0.45) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(pos); m.lookAt(pos.clone().add(new THREE.Vector3(0, 1, 0))); group.add(m); rings.push({ m, t: 0, life, maxR });
  };
  const flash = new THREE.PointLight(0xffc080, 0, 14, 2); group.add(flash);

  function explode(pos, color = 0xffa040) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 46; i++) {
      const d = new THREE.Vector3().randomDirection(); const sp = 3 + Math.random() * 7;
      spawnParticle(pos, d.multiplyScalar(sp), 0.5 + Math.random() * 0.6, 0.25 + Math.random() * 0.45, i % 3 === 0 ? new THREE.Color(0xfff2c0) : c, -4, 2.5);
    }
    for (let i = 0; i < 14; i++) spawnParticle(pos, new THREE.Vector3().randomDirection().multiplyScalar(1.2), 0.9, 1.2 + Math.random(), new THREE.Color(0x553322), 0.6, 1.5);
    spawnRing(pos, color, 4.5, 0.5); spawnRing(pos, 0xffffff, 2.2, 0.3);
    flash.position.copy(pos); flash.color.set(color); flash.intensity = 120;
    shake = 0.35;
  }
  function sparks(pos, n, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) spawnParticle(pos, new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 4), 0.25 + Math.random() * 0.3, 0.12 + Math.random() * 0.12, c, -8, 1);
  }
  function dustPuff(pos, n = 10) {
    for (let i = 0; i < n; i++) spawnParticle(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.05, (Math.random() - 0.5) * 0.4)), new THREE.Vector3((Math.random() - 0.5) * 2.5, 0.6 + Math.random(), (Math.random() - 0.5) * 2.5), 0.5, 0.35 + Math.random() * 0.3, new THREE.Color(0x3a4a66), 0, 4);
  }
  function collectBurst(pos, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; spawnParticle(pos, new THREE.Vector3(Math.cos(a) * 3, 2 + Math.random() * 2, Math.sin(a) * 3), 0.6, 0.3, c, -6, 2); }
    spawnRing(pos, color, 2.5, 0.4);
  }

  let shake = 0;

  function fireBolt(origin, dir) {
    if (boltList.length >= MAXB) boltList.shift();
    boltList.push({ p: origin.clone(), d: dir.clone().normalize(), life: 1.2 });
    boltLight.position.copy(origin); boltLight.intensity = 30;
    sparks(origin, 5, 0x9dfcff);
    shake = Math.max(shake, 0.08);
  }

  // ---- pickups (rings) and drones
  const pickups = [];
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd35a, emissive: 0xffa010, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.9, envMapIntensity: 1.5 });
  const pickGeo = new THREE.TorusGeometry(0.42, 0.07, 10, 32);
  function addPickup(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const m = new THREE.Mesh(pickGeo, ringMat); m.castShadow = true; g.add(m);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffe8a0, toneMapped: false })); g.add(inner);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.setScalar(1.6); g.add(spr);
    group.add(g); pickups.push({ g, base: y, alive: true, t: Math.random() * 6 });
  }
  const drones = [];
  const droneBody = new THREE.MeshStandardMaterial({ color: 0x8892a8, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.2 });
  const droneEye = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 3.5 });
  function addDrone(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 1), droneBody); core.castShadow = true; g.add(core);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24), droneBody); band.rotation.x = Math.PI / 2; g.add(band);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), droneEye); eye.position.z = 0.4; g.add(eye);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3030, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.setScalar(1.4); spr.position.z = 0.4; g.add(spr);
    group.add(g); drones.push({ g, home: new THREE.Vector3(x, y, z), alive: true, respawn: 0, t: Math.random() * 6, band });
  }

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), fwd = new THREE.Vector3(0, 0, 1);
  const stats = { drones: 0, rings: 0 };

  function update(dt, t, player, colliders, onEvent) {
    // bolts
    for (let i = boltList.length - 1; i >= 0; i--) {
      const b = boltList[i]; b.life -= dt;
      b.p.addScaledVector(b.d, 38 * dt);
      let dead = b.life <= 0;
      // drones
      for (const d of drones) if (d.alive && d.g.position.distanceTo(b.p) < 0.9) { d.alive = false; d.respawn = 3.5; d.g.visible = false; explode(d.g.position, 0xff8a30); stats.drones++; onEvent?.('drone'); dead = true; }
      // walls / colliders
      if (!dead) for (const c of colliders) if (b.p.x > c.min.x && b.p.x < c.max.x && b.p.y > c.min.y && b.p.y < c.max.y && b.p.z > c.min.z && b.p.z < c.max.z) { sparks(b.p, 12, 0x9dfcff); spawnRing(b.p, 0x5fe8ff, 0.8, 0.25); dead = true; break; }
      if (!dead && (Math.abs(b.p.x) > 13.6 || Math.abs(b.p.z) > 29.5 || b.p.y < 0 || b.p.y > 13.5)) { sparks(b.p, 12, 0x9dfcff); spawnRing(b.p, 0x5fe8ff, 0.8, 0.25); dead = true; }
      if (dead) boltList.splice(i, 1);
    }
    bolts.count = boltCores.count = boltList.length;
    for (let i = 0; i < boltList.length; i++) {
      const b = boltList[i]; tmpQ.setFromUnitVectors(fwd, b.d); tmpM.compose(b.p, tmpQ, tmpS); bolts.setMatrixAt(i, tmpM); boltCores.setMatrixAt(i, tmpM);
    }
    bolts.instanceMatrix.needsUpdate = true; boltCores.instanceMatrix.needsUpdate = true;
    boltLight.intensity *= Math.exp(-dt * 14);
    flash.intensity *= Math.exp(-dt * 9);
    shake *= Math.exp(-dt * 6);

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.v.y += p.grav * dt; p.v.multiplyScalar(Math.exp(-p.drag * dt)); p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.02) { p.p.y = 0.02; p.v.y = Math.abs(p.v.y) * 0.4; }
    }
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (!p) { pAlpha[i] = 0; pSize[i] = 0; continue; }
      const k = p.life / p.maxLife;
      pPos.set([p.p.x, p.p.y, p.p.z], i * 3); pCol.set([p.col.r, p.col.g, p.col.b], i * 3); pSize[i] = p.size * (0.6 + 0.4 * k); pAlpha[i] = Math.min(1, k * 2);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = pGeo.attributes.alpha.needsUpdate = true;
    pGeo.setDrawRange(0, Math.max(1, parts.length));

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; const k = r.t / r.life;
      if (k >= 1) { group.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3); r.m.scale.setScalar(0.2 + e * r.maxR); r.m.material.opacity = (1 - k) * 0.9;
    }

    // pickups
    for (const pk of pickups) {
      if (!pk.alive) continue;
      pk.t += dt; pk.g.rotation.y = pk.t * 2.2; pk.g.position.y = pk.base + Math.sin(pk.t * 2.5) * 0.12;
      const dx = pk.g.position.x - player.x, dz = pk.g.position.z - player.z, dy = pk.g.position.y - (player.y + 0.9);
      if (dx * dx + dz * dz < 1.1 && Math.abs(dy) < 1.4) { pk.alive = false; pk.g.visible = false; collectBurst(pk.g.position, 0xffc040); stats.rings++; onEvent?.('ring'); }
    }
    // drones
    for (const d of drones) {
      d.t += dt;
      if (!d.alive) { d.respawn -= dt; if (d.respawn <= 0) { d.alive = true; d.g.visible = true; d.g.scale.setScalar(0.01); spawnRing(d.home, 0xff6060, 1.5, 0.4); } continue; }
      d.g.scale.setScalar(Math.min(1, d.g.scale.x + dt * 3));
      d.g.position.set(d.home.x + Math.sin(d.t * 0.9) * 0.6, d.home.y + Math.sin(d.t * 1.7) * 0.35, d.home.z + Math.cos(d.t * 0.7) * 0.5);
      d.band.rotation.y = d.t * 3; d.band.rotation.x = Math.PI / 2 + Math.sin(d.t) * 0.3;
      d.g.lookAt(player.x, player.y + 1.2, player.z);
    }
  }

  return {
    group, fireBolt, explode, sparks, dustPuff, addPickup, addDrone, drones, pickups, stats, update,
    get shake() { return shake; },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); scene.remove(group); glowTex.dispose(); },
  };
}
