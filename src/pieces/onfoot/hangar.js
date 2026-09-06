// Great Fox hangar interior: floor, walls, catwalks, pillars, lights + god-rays,
// docked Arwing, holo panels, blast door, bay opening onto space.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeFloorTextures, makeWallTextures, makeHoloTexture, makeGrateTexture, makeWallDecal, makeGlowTexture, makeCrateTextures } from './textures.js';
import { buildDockedArwing } from './arwing.js';

export const HANGAR = { hx: 14, hz: 30, h: 14 };

const godRayShader = {
  vertexShader: /* glsl */`
    varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vNormal;
    void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform float intensity; uniform float time;
    varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vNormal;
    void main(){
      vec3 vd = normalize(cameraPosition - vWorldPos);
      float fres = abs(dot(vd, vNormal));
      float edge = pow(fres, 1.6);              // fade at silhouette so cone reads as volume
      float along = smoothstep(0.0, 0.15, vUv.y) * pow(1.0 - vUv.y, 1.3);
      float flick = 0.92 + 0.08 * sin(time * 2.3 + vUv.x * 12.0);
      float a = edge * along * intensity * flick;
      gl_FragColor = vec4(color * a, a);
    }`,
};

export function makeGodRay(THREE_, { color = 0xbfe4ff, radiusTop = 0.5, radiusBottom = 3.2, height = 12, intensity = 0.35, side = THREE.FrontSide } = {}) {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20, 1, true);
  // uv.y: 1 at top → we want vUv.y = 0 at top (light source) and 1 at bottom.
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  g.translate(0, -height / 2, 0);
  const m = new THREE.ShaderMaterial({
    ...godRayShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, time: { value: 0 } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 5;
  return mesh;
}

export function buildHangar(ctx) {
  const { scene } = ctx;
  const { hx, hz, h } = HANGAR;
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {min:Vector3,max:Vector3}
  const animated = []; // fn(dt,t)
  const dispose = [];

  const addCollider = (cx, cy, cz, sx, sy, sz) => colliders.push({ min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2) });

  // ---------- floor
  const ft = makeFloorTextures();
  ft.map.repeat.set(hx / 2, hz / 2); ft.roughnessMap.repeat.set(hx / 2, hz / 2);
  const floorMat = new THREE.MeshStandardMaterial({ map: ft.map, roughnessMap: ft.roughnessMap, roughness: 0.55, metalness: 0.65, envMapIntensity: 0.9, color: 0xc8d2e0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  // painted landing pad circle
  const padRing = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 64), new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.6, metalness: 0.2, emissive: 0x442a00, emissiveIntensity: 0.6 }));
  padRing.rotation.x = -Math.PI / 2; padRing.position.set(-6, 0.012, -2); padRing.receiveShadow = true; group.add(padRing);
  const padRing2 = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.3, 64), padRing.material);
  padRing2.rotation.x = -Math.PI / 2; padRing2.position.set(-6, 0.012, -2); group.add(padRing2);
  // floor light strips (guide lights) down the walkway
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x63d4ff, emissiveIntensity: 0.45, roughness: 0.3 });
  const stripGeo = new THREE.BoxGeometry(0.14, 0.03, 1.1);
  const strips = new THREE.InstancedMesh(stripGeo, stripMat, 2 * Math.floor(hz * 2 / 3));
  {
    const o = new THREE.Object3D(); let k = 0;
    for (let z = -hz + 2; z < hz - 1; z += 3) for (const x of [4.0, 8.0]) { o.position.set(x, 0.016, z); o.updateMatrix(); strips.setMatrixAt(k++, o.matrix); }
    strips.count = k;
  }
  group.add(strips);

  // ---------- walls
  const wt = makeWallTextures();
  const wallMat = new THREE.MeshStandardMaterial({ map: wt.map, emissiveMap: wt.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.8, color: 0xe0e8f4 });
  const mkWall = (w, hgt, rep) => { const m = wallMat.clone(); m.map = wt.map.clone(); m.emissiveMap = wt.emissiveMap.clone(); m.map.repeat.set(rep, hgt / 7); m.emissiveMap.repeat.set(rep, hgt / 7); m.map.needsUpdate = m.emissiveMap.needsUpdate = true; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), m); mesh.receiveShadow = true; return mesh; };
  // -x wall (full)
  const wallL = mkWall(hz * 2, h, hz / 4); wallL.rotation.y = Math.PI / 2; wallL.position.set(-hx, h / 2, 0); group.add(wallL);
  // +x wall with bay opening between z∈[-12,12], y∈[1.2, 10]
  const wallR_a = mkWall(hz - 12, h, (hz - 12) / 8); wallR_a.rotation.y = -Math.PI / 2; wallR_a.position.set(hx, h / 2, (12 + hz) / 2); group.add(wallR_a);
  const wallR_b = mkWall(hz - 12, h, (hz - 12) / 8); wallR_b.rotation.y = -Math.PI / 2; wallR_b.position.set(hx, h / 2, -(12 + hz) / 2); group.add(wallR_b);
  const wallR_top = mkWall(24, h - 10, 3); wallR_top.rotation.y = -Math.PI / 2; wallR_top.position.set(hx, 10 + (h - 10) / 2, 0); group.add(wallR_top);
  const wallR_bot = mkWall(24, 1.2, 3); wallR_bot.rotation.y = -Math.PI / 2; wallR_bot.position.set(hx, 0.6, 0); group.add(wallR_bot);
  // end walls
  const wallB = mkWall(hx * 2, h, hx / 4); wallB.rotation.y = Math.PI; wallB.position.set(0, h / 2, hz); group.add(wallB);
  const wallF_l = mkWall(hx - 3, h, (hx - 3) / 8); wallF_l.position.set(-(hx + 3) / 2, h / 2, -hz); group.add(wallF_l);
  const wallF_r = mkWall(hx - 3, h, (hx - 3) / 8); wallF_r.position.set((hx + 3) / 2, h / 2, -hz); group.add(wallF_r);
  const wallF_top = mkWall(6, h - 5, 1); wallF_top.position.set(0, 5 + (h - 5) / 2, -hz); group.add(wallF_top);
  // painted emblem + stencil above the blast door
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshStandardMaterial({ map: makeWallDecal(), transparent: true, roughness: 0.7, metalness: 0.1, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
  decal.position.set(0, 9.6, -hz + 0.06); group.add(decal);
  // rear wall (+z, behind the start) gets the same emblem so turning around isn't empty
  const decalB = new THREE.Mesh(decal.geometry, decal.material); decalB.rotation.y = Math.PI; decalB.position.set(0, 8.5, hz - 0.06); group.add(decalB);

  // ---------- ceiling with beams
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.8, metalness: 0.5 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = h; group.add(ceil);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a4658, roughness: 0.5, metalness: 0.8, envMapIntensity: 0.8 });
  const beamGeo = new THREE.BoxGeometry(hx * 2, 0.9, 0.7);
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, Math.floor(hz * 2 / 6) + 1);
  {
    const o = new THREE.Object3D(); let k = 0;
    for (let z = -hz + 3; z < hz; z += 6) { o.position.set(0, h - 0.45, z); o.updateMatrix(); beams.setMatrixAt(k++, o.matrix); }
    beams.count = k;
  }
  beams.castShadow = true; group.add(beams);
  // pillars along walls
  const pillarGeo = new THREE.BoxGeometry(1.2, h, 1.0);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x46546a, roughness: 0.4, metalness: 0.85, envMapIntensity: 1.0 });
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, 2 * Math.floor(hz * 2 / 6) + 2);
  {
    const o = new THREE.Object3D(); let k = 0;
    for (let z = -hz + 3; z < hz; z += 6) {
      o.position.set(-hx + 0.6, h / 2, z); o.updateMatrix(); pillars.setMatrixAt(k++, o.matrix);
      if (Math.abs(z) > 12) { o.position.set(hx - 0.6, h / 2, z); o.updateMatrix(); pillars.setMatrixAt(k++, o.matrix); }
    }
    pillars.count = k;
  }
  pillars.castShadow = true; pillars.receiveShadow = true; group.add(pillars);

  // ---------- catwalks (both long walls, y=5.5, 2.6 wide) + railings
  const grate = makeGrateTexture(); grate.repeat.set(2, hz * 2 / 1.3);
  const walkMat = new THREE.MeshStandardMaterial({ map: grate, alphaMap: grate, transparent: true, alphaTest: 0.4, color: 0x9fb0c8, roughness: 0.4, metalness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffb02e, roughness: 0.4, metalness: 0.5, envMapIntensity: 0.8 });
  for (const s of [-1, 1]) {
    const cw = new THREE.Mesh(new THREE.PlaneGeometry(2.6, hz * 2), walkMat);
    cw.rotation.x = -Math.PI / 2; cw.position.set(s * (hx - 1.3), 5.5, 0); cw.receiveShadow = true; cw.castShadow = true; group.add(cw);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, hz * 2), beamMat); lip.position.set(s * (hx - 2.6), 5.35, 0); group.add(lip);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, hz * 2, 8), railMat); rail.rotation.x = Math.PI / 2; rail.position.set(s * (hx - 2.6), 6.6, 0); group.add(rail);
    const railMid = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, hz * 2, 8), railMat); railMid.rotation.x = Math.PI / 2; railMid.position.set(s * (hx - 2.6), 6.1, 0); group.add(railMid);
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8);
    const posts = new THREE.InstancedMesh(postGeo, railMat, Math.floor(hz * 2 / 3) + 1);
    const o = new THREE.Object3D(); let k = 0;
    for (let z = -hz + 1; z < hz; z += 3) { o.position.set(s * (hx - 2.6), 6.05, z); o.updateMatrix(); posts.setMatrixAt(k++, o.matrix); }
    posts.count = k; group.add(posts);
  }

  // ---------- bay opening (force field + space beyond)
  {
    const field = new THREE.Mesh(new THREE.PlaneGeometry(24, 8.8, 1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float time; varying vec2 vUv; void main(){
        float hex = abs(sin(vUv.x*60.0)) * abs(sin(vUv.y*22.0 + time*0.5));
        float scan = smoothstep(0.98, 1.0, fract(vUv.y*2.0 - time*0.15));
        float edge = pow(1.0 - min(1.0, min(vUv.x, 1.0-vUv.x)*6.0), 2.0) + pow(1.0 - min(1.0, min(vUv.y,1.0-vUv.y)*6.0), 2.0);
        float a = 0.05 + hex*0.05 + scan*0.35 + edge*0.5;
        gl_FragColor = vec4(vec3(0.35,0.8,1.0)*a, a); }`,
    }));
    field.rotation.y = -Math.PI / 2; field.position.set(hx - 0.02, 5.6, 0); group.add(field);
    animated.push((dt, t) => { field.material.uniforms.time.value = t; });
    // frame around opening
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a6a82, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.0 });
    const fTop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 25.6), frameMat); fTop.position.set(hx - 0.2, 10.3, 0); group.add(fTop);
    const fBot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 25.6), frameMat); fBot.position.set(hx - 0.2, 0.9, 0); group.add(fBot);
    for (const z of [-12.4, 12.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.4, 0.8), frameMat); p.position.set(hx - 0.2, 5.6, z); group.add(p); }
    const fieldGlow = new THREE.MeshStandardMaterial({ color: 0x8fe6ff, emissive: 0x63d4ff, emissiveIntensity: 3.0 });
    const gTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 24), fieldGlow); gTop.position.set(hx - 0.6, 9.98, 0); group.add(gTop);
    const gBot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 24), fieldGlow); gBot.position.set(hx - 0.6, 1.22, 0); group.add(gBot);
    addCollider(hx + 0.5, 5, 0, 1, 20, hz * 2); // keep player inside

    // outside: stars + Corneria + a distant nebula glow, seen through the field
    const starGeo = new THREE.BufferGeometry();
    const N = 1800; const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1); const r = 400 + Math.random() * 100;
      pos[i * 3] = hx + Math.abs(r * Math.sin(ph) * Math.cos(th)); pos[i * 3 + 1] = 5 + r * Math.cos(ph) * 0.6; pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.15, 0.4, 0.7 + Math.random() * 0.3); col.set([c.r, c.g, c.b], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
    group.add(stars);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sunDir: { value: new THREE.Vector3(-0.4, 0.5, -0.75).normalize() } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix)*normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform vec3 sunDir; uniform float time; varying vec3 vN; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
        void main(){
          vec3 p = normalize(vP);
          float land = n(p*4.0)*0.6 + n(p*9.0)*0.3 + n(p*20.0)*0.1;
          float cloud = smoothstep(0.55, 0.75, n(p*7.0 + vec3(time*0.01)) * 0.7 + n(p*16.0)*0.3);
          vec3 ocean = vec3(0.05, 0.35, 0.75); vec3 grass = vec3(0.25, 0.6, 0.3); vec3 sand = vec3(0.8,0.7,0.4);
          vec3 surf = mix(ocean, mix(sand, grass, smoothstep(0.52,0.6,land)), smoothstep(0.48,0.52,land));
          surf = mix(surf, vec3(1.0), cloud*0.9);
          float l = max(0.0, dot(vN, sunDir));
          vec3 col = surf * (0.08 + l*1.4);
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    planet.position.set(hx + 120, 4, -250); planet.scale.setScalar(1.35); group.add(planet);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(63, 48, 32), new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp;}',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0) ; gl_FragColor = vec4(vec3(0.4,0.7,1.0)*f*1.6, f); }',
    }));
    atmo.position.copy(planet.position); atmo.scale.copy(planet.scale); group.add(atmo);
    animated.push((dt, t) => { planet.material.uniforms.time.value = t; planet.rotation.y = t * 0.01; });
  }

  // ---------- hanging lights + god rays
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 4.0 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.4, metalness: 0.9 });
  const lampPositions = [];
  for (let z = -21; z <= 21; z += 14) for (const x of [-4.5, 5.5]) lampPositions.push([x, z]);
  lampPositions.push([-6, -2, true]); // hero work light over the docked Arwing
  const rays = [];
  const lampY = h - 2.6;
  {
    // housings + cables + lamp discs merged into instanced meshes (one draw each)
    const housingGeo = new THREE.CylinderGeometry(0.95, 1.35, 0.55, 20, 1, true);
    const housings = new THREE.InstancedMesh(housingGeo, housingMat, lampPositions.length);
    const cableGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6);
    const cables = new THREE.InstancedMesh(cableGeo, housingMat, lampPositions.length);
    const lampGeo = new THREE.CircleGeometry(1.25, 20); lampGeo.rotateX(Math.PI / 2);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPositions.length);
    const rimGeo = new THREE.TorusGeometry(1.3, 0.06, 8, 24); rimGeo.rotateX(Math.PI / 2);
    const rims = new THREE.InstancedMesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff8a20, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.6 }), lampPositions.length);
    const o = new THREE.Object3D();
    lampPositions.forEach(([x, z, hero], i) => {
      o.position.set(x, lampY, z); o.updateMatrix(); housings.setMatrixAt(i, o.matrix);
      o.position.set(x, lampY + 1.5, z); o.updateMatrix(); cables.setMatrixAt(i, o.matrix);
      o.position.set(x, lampY - 0.28, z); o.updateMatrix(); lamps.setMatrixAt(i, o.matrix);
      o.position.set(x, lampY - 0.27, z); o.updateMatrix(); rims.setMatrixAt(i, o.matrix);
      const ray = makeGodRay(THREE, { radiusTop: 1.3, radiusBottom: hero ? 6.5 : 3.6, height: lampY - 0.4, intensity: hero ? 0.28 : 0.55, color: hero ? 0xfff0dc : 0xffd9a8 });
      ray.position.set(x, lampY - 0.3, z); group.add(ray); rays.push(ray);
      // bloom halo sprite on the lamp face
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffe2b8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(3.6); halo.position.set(x, lampY - 0.5, z); group.add(halo);
    });
    group.add(housings, cables, lamps, rims);
  }
  // big cool light shaft pouring in from the bay force-field (volumetric feel)
  {
    const shaft = makeGodRay(THREE, { radiusTop: 4.6, radiusBottom: 9, height: 20, intensity: 0.22, color: 0x5fb8ff });
    shaft.rotation.z = -(Math.PI / 2 - 0.35); shaft.position.set(hx - 0.5, 6.2, 0); shaft.scale.set(1, 1, 2.4); group.add(shaft); rays.push(shaft);
  }
  animated.push((dt, t) => { for (const r of rays) r.material.uniforms.time.value = t; });

  // ---------- docked Arwing on cradle
  const ship = buildDockedArwing(1.55, 1.6);
  ship.position.set(-6, 1.6, -2); ship.rotation.y = -Math.PI * 0.5 + 0.25; group.add(ship);
  animated.push((dt, t) => ship.userData.update(dt, t, ctx.camera));
  {
    const cradleMat = new THREE.MeshStandardMaterial({ color: 0x3e4a5e, roughness: 0.45, metalness: 0.85, envMapIntensity: 0.9 });
    // power umbilical + chocks around the pad
    for (const [dx, dz] of [[-2.4, 3.6], [2.6, 3.4], [-3.2, -4.6]]) {
      const chock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.3), cradleMat); chock.position.set(-6 + dx, 0.125, -2 + dz); chock.castShadow = true; group.add(chock);
    }
    addCollider(-6, 1, -2, 9, 3, 11);
    // service cart + fuel hoses
    const cartMat = new THREE.MeshStandardMaterial({ color: 0xd8a02a, roughness: 0.5, metalness: 0.4 });
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), cartMat); cart.position.set(-1.2, 0.45, 2.5); cart.castShadow = true; cart.receiveShadow = true; group.add(cart);
    addCollider(-1.2, 0.45, 2.5, 1.4, 0.9, 0.9);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5, 0.6, 2.2), new THREE.Vector3(-2.6, 0.2, 1.2), new THREE.Vector3(-4.0, 0.1, 0.4), new THREE.Vector3(-5.0, 1.0, -0.6)]), 24, 0.06, 8), housingMat);
    group.add(hose);
  }

  // ---------- cargo crates (obstacles)
  const crateMats = [0, 1, 2].map((v) => { const t = makeCrateTextures(v); return new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughnessMap, color: 0xffffff, roughness: 0.6, metalness: 0.55, envMapIntensity: 0.9 }); });
  const crateGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.06);
  const crateSpots = [[9, 14, 1.4, 0, 0.2], [10.6, 14, 1.4, 0, -0.1], [9.8, 14, 1.4, 1.4, 0.35], [-9, 16, 1.6, 0, 0.1], [8.5, -18, 1.2, 0, -0.3], [-9.5, -14, 1.5, 0, 0.15], [-10.8, -12.5, 1.1, 0, -0.2], [11.5, 18, 1.3, 0, 0.05]];
  crateSpots.forEach(([x, z, s, y, ry], i) => {
    const c = new THREE.Mesh(crateGeo, crateMats[i % 3]); c.scale.setScalar(s); c.position.set(x, y + s / 2, z); c.rotation.y = ry; c.castShadow = true; c.receiveShadow = true; group.add(c);
    addCollider(x, y + s / 2, z, s * 1.15, s, s * 1.15);
  });

  // ---------- holo panels (floating projected screens)
  const holoMat = (v) => new THREE.MeshBasicMaterial({ map: makeHoloTexture(v), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const holos = [];
  const holoSpots = [[-12.5, 3.2, 8, Math.PI / 2, 0], [-12.5, 3.2, -8, Math.PI / 2, 1], [5, 3.6, -26, 0.25, 2], [-5, 3.6, -26, -0.25, 1]];
  for (const [x, y, z, ry, v] of holoSpots) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), holoMat(v)); p.position.set(x, y, z); p.rotation.y = ry; group.add(p); holos.push(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 12), housingMat); base.position.set(x, 0.5, z); base.castShadow = true; group.add(base);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12), stripMat); emitter.position.set(x, 1.02, z); group.add(emitter);
    const beam = makeGodRay(THREE, { radiusTop: 0.15, radiusBottom: 1.6, height: y - 1.0, intensity: 0.25, color: 0x66d8ff });
    beam.rotation.x = Math.PI; beam.position.set(x, 1.05, z); group.add(beam); rays.push(beam);
    addCollider(x, 0.5, z, 1, 1, 1);
  }
  animated.push((dt, t) => { for (const [i, p] of holos.entries()) { p.position.y = holoSpots[i][1] + Math.sin(t * 1.3 + i) * 0.06; p.material.opacity = 0.75 + Math.sin(t * 17 + i * 3) * 0.05; } });

  // ---------- blast door (end wall, -z), two sliding halves
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6d7a90, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.0 });
  const doorTrimMat = new THREE.MeshStandardMaterial({ color: 0xff8a1e, roughness: 0.5, metalness: 0.3, emissive: 0xff4a00, emissiveIntensity: 0.6 });
  const doorGroup = new THREE.Group(); doorGroup.position.set(0, 0, -hz + 0.35); group.add(doorGroup);
  const halves = [];
  for (const s of [-1, 1]) {
    const half = new THREE.Group(); half.position.x = s * 1.5; doorGroup.add(half);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 5.0, 0.5), doorMat); slab.position.y = 2.5; slab.castShadow = true; slab.receiveShadow = true; half.add(slab);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.6, 0.52), doorTrimMat); stripe.position.set(-s * 1.3, 2.5, 0); half.add(stripe);
    for (let i = 0; i < 3; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 0.56), housingMat); rib.position.set(0, 1.0 + i * 1.5, 0); half.add(rib); }
    halves.push(half);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.5, 1.2), doorMat); frame.position.set(0, 5.25, -hz + 0.35); group.add(frame);
  for (const s of [-1, 1]) { const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.5, 1.2), doorMat); jamb.position.set(s * 3.4, 2.75, -hz + 0.35); group.add(jamb); }
  const doorLamp = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0xff8040, emissive: 0xff5a20, emissiveIntensity: 3 }));
  doorLamp.position.set(0, 5.0, -hz + 0.98); group.add(doorLamp);
  // corridor beyond door (lit, so opening reveals depth)
  const corr = new THREE.Group(); corr.position.set(0, 0, -hz); group.add(corr);
  const corrMat = new THREE.MeshStandardMaterial({ color: 0x2c3444, roughness: 0.6, metalness: 0.6 });
  const cFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 16), corrMat); cFloor.rotation.x = -Math.PI / 2; cFloor.position.set(0, 0.01, -8); corr.add(cFloor);
  const cCeil = new THREE.Mesh(new THREE.PlaneGeometry(6, 16), corrMat); cCeil.rotation.x = Math.PI / 2; cCeil.position.set(0, 5, -8); corr.add(cCeil);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), corrMat); w.rotation.y = s * Math.PI / 2; w.position.set(-s * 3, 2.5, -8); corr.add(w); }
  const cEnd = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe8ff, emissiveIntensity: 2.5 })); cEnd.position.set(0, 2.5, -16); corr.add(cEnd);
  const corrStrip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe0ff, emissiveIntensity: 3 }), 8);
  { const o = new THREE.Object3D(); let k = 0; for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { o.position.set(s * 2.95, 0.5 + i * 1.3, -8); o.updateMatrix(); corrStrip.setMatrixAt(k++, o.matrix); } }
  corr.add(corrStrip);
  const doorCollider = { min: new THREE.Vector3(-3.2, 0, -hz - 1), max: new THREE.Vector3(3.2, 5, -hz + 0.7) };
  colliders.push(doorCollider);

  const door = {
    open: 0, target: 0,
    update(dt) {
      this.open += (this.target - this.open) * Math.min(1, dt * 2.2);
      const e = this.open < 0.5 ? 2 * this.open * this.open : 1 - Math.pow(-2 * this.open + 2, 2) / 2;
      halves[0].position.x = -1.5 - e * 3.1; halves[1].position.x = 1.5 + e * 3.1;
      doorLamp.material.emissive.setHex(this.target ? 0x40ff80 : 0xff5a20);
      doorCollider.max.z = this.open > 0.6 ? -hz - 100 : -hz + 0.7; // remove collider when open
    },
  };

  // ---------- lighting
  // Kept deliberately small (software-GL friendly, and every point light taxes every fragment):
  // hemi ambient, one shadow-casting warm key that follows the player, a cool bay fill from the
  // force-field side, cyan pool under the Arwing, orange spill at the blast door.
  const hemi = new THREE.HemisphereLight(0x5f80bc, 0x2a1e14, 0.6); group.add(hemi);
  const key = new THREE.SpotLight(0xffe2bd, 170, 40, Math.PI / 3.4, 0.6, 1.4);
  key.position.set(3, h - 1.5, 4); key.target.position.set(1, 0, 0); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; key.shadow.camera.near = 3; key.shadow.camera.far = 34; key.shadow.radius = 2;
  group.add(key, key.target);
  const bayLight = new THREE.DirectionalLight(0x5fa8ff, 1.9); bayLight.position.set(hx + 10, 7, 2); bayLight.target.position.set(0, 0, 0); group.add(bayLight, bayLight.target);
  // hero pool: warm-white work light over the docked Arwing (the room's focal point)
  const shipLight = new THREE.PointLight(0xffe9cc, 70, 22, 1.8); shipLight.position.set(-6, lampY - 1.5, -2); group.add(shipLight);
  const doorLight = new THREE.PointLight(0xff7a30, 70, 16, 1.8); doorLight.position.set(0, 4.5, -hz + 2.5); group.add(doorLight);

  scene.fog = new THREE.FogExp2(0x0b1626, 0.013);
  scene.background = new THREE.Color(0x05080f);

  // ---------- dust motes
  const dustN = 320; const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (Math.random() * 2 - 1) * hx; dustPos[i * 3 + 1] = Math.random() * h; dustPos[i * 3 + 2] = (Math.random() * 2 - 1) * hz; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe0b8, size: 0.16, map: makeGlowTexture(), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(dust);
  animated.push((dt, t) => { const a = dustGeo.attributes.position; for (let i = 0; i < dustN; i++) { a.array[i * 3 + 1] += Math.sin(t * 0.7 + i) * dt * 0.08 - dt * 0.05; if (a.array[i * 3 + 1] < 0) a.array[i * 3 + 1] = h; a.array[i * 3] += Math.cos(t * 0.5 + i * 0.3) * dt * 0.05; } a.needsUpdate = true; });

  return {
    group, colliders, door, key,
    update(dt, t) { for (const f of animated) f(dt, t); door.update(dt); },
    dispose() { ship.userData.dispose?.(); group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }); }); scene.remove(group); scene.fog = null; },
  };
}
