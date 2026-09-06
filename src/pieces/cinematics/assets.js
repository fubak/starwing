// Procedural assets for the cinematics: sky/nebula, starfield, planet, sun,
// Arwing, Great Fox, hangar set. Everything is built from primitives + shaders.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* GLSL noise (shared)                                                 */
/* ------------------------------------------------------------------ */
export const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i+vec3(0,0,0)),hash13(i+vec3(1,0,0)),f.x),
                 mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),
                 mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; }
  return s;
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.1 + vec3(3.1,1.7,5.2); a *= 0.5; }
  return s;
}
`;

/* ------------------------------------------------------------------ */
/* Sky dome: deep space + nebula + fine dust stars                     */
/* ------------------------------------------------------------------ */
export function makeSkyMaterial(uniformsExtra = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.4, 0.3, -0.8).normalize() }, uBoost: { value: 1 }, ...uniformsExtra },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uTime; uniform vec3 uSun; uniform float uBoost;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        // base space gradient: cold indigo to near-black
        vec3 col = mix(vec3(0.010,0.012,0.035), vec3(0.030,0.045,0.110), smoothstep(-0.6,0.5,d.y));
        // nebula: two colour fields masked by a large-scale band
        float band = smoothstep(0.55, 0.0, abs(d.y*0.9 + 0.25*sin(d.x*2.0) - 0.05));
        float n1 = fbm(d*3.0 + vec3(0.0, 0.0, uTime*0.004));
        float n2 = fbm(d*5.5 + vec3(7.3, 2.1, 0.0));
        float neb = pow(max(n1-0.32, 0.0)*1.9, 1.6) * band;
        vec3 teal = vec3(0.10, 0.55, 0.80);
        vec3 mag  = vec3(0.65, 0.18, 0.62);
        vec3 gold = vec3(0.95, 0.55, 0.25);
        vec3 nebCol = mix(teal, mag, smoothstep(0.35,0.7,n2));
        nebCol = mix(nebCol, gold, smoothstep(0.6,0.85,n1)*0.6);
        col += nebCol * neb * 0.9 * uBoost;
        // dark dust lanes
        float dust = smoothstep(0.55,0.75, fbm3(d*7.0+vec3(2.0)));
        col *= 1.0 - dust*band*0.45;
        // fine star dust
        vec3 sp = d*260.0; vec3 cell = floor(sp);
        float h = hash13(cell);
        vec3 f = fract(sp)-0.5;
        float star = smoothstep(0.12,0.0,length(f)) * step(0.985, h) * (0.6+0.4*sin(uTime*3.0+h*40.0));
        col += vec3(0.8,0.9,1.0) * star * 0.9;
        // sun glow
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0,0.78,0.55) * (pow(s, 40.0)*0.9 + pow(s, 6.0)*0.10);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * Bake the procedural sky into an equirect texture once (cheap per-frame),
 * returns { texture, dispose }.
 */
export function bakeSkyTexture(renderer, w = 2048, h = 1024) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
  const mat = makeSkyMaterial();
  mat.side = THREE.DoubleSide;
  // override vertex shader: fullscreen quad, uv -> direction
  mat.vertexShader = /* glsl */ `
    varying vec3 vDir;
    void main(){
      // three.js SphereGeometry: u = phi/2pi, x = -cos(phi)sin(theta), z = sin(phi)sin(theta); with phi = u*2pi
      float phi = uv.x * 6.2831853, theta = (1.0 - uv.y) * 3.14159265;
      vDir = vec3(-cos(phi)*sin(theta), cos(theta), sin(phi)*sin(theta));
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`;
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prevRT);
  mat.dispose();
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

export function makeSky(radius = 3000, texture = null) {
  const mat = texture
    ? new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false, fog: false })
    : makeSkyMaterial();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Starfield points with twinkle + colour temperature                  */
/* ------------------------------------------------------------------ */
export function makeStars(rng, count = 3500, rMin = 700, rMax = 2400) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rng.next() * 2 - 1, th = rng.next() * Math.PI * 2, r = rMin + (rMax - rMin) * Math.cbrt(rng.next());
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    const temp = rng.next();
    if (temp < 0.15) c.setHSL(0.02, 0.6, 0.75); else if (temp < 0.3) c.setHSL(0.10, 0.5, 0.8); else if (temp < 0.85) c.setHSL(0.6, 0.15, 0.92); else c.setHSL(0.62, 0.7, 0.75);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sz[i] = 1.0 + Math.pow(rng.next(), 6) * 5.0;
    ph[i] = rng.next() * Math.PI * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aPhase; varying vec3 vCol; varying float vTw;
      uniform float uTime; uniform float uScale;
      void main(){ vCol = color; vTw = 0.7 + 0.3*sin(uTime*2.5 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uScale * (1.0 + 0.25*sin(uTime*4.0+aPhase*3.0));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vTw;
      void main(){ vec2 p = gl_PointCoord-0.5; float d = length(p);
        float a = smoothstep(0.5,0.0,d); a = a*a; 
        float core = smoothstep(0.18,0.0,d);
        gl_FragColor = vec4(vCol*(a*0.6+core)*vTw, a); }`,
    vertexColors: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/* ------------------------------------------------------------------ */
/* Planet (Corneria) + atmosphere shell                                */
/* ------------------------------------------------------------------ */
/** Bake albedo(rgb) + mask(a: ocean-spec*0.5 | city>=0.5) into an equirect texture. */
function bakePlanetTexture(renderer, w = 2048, h = 1024) {
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec3 vP;
      void main(){ float phi = uv.x*6.2831853, theta = (1.0-uv.y)*3.14159265;
        vP = vec3(-cos(phi)*sin(theta), cos(theta), sin(phi)*sin(theta)); gl_Position = vec4(position.xy,0.0,1.0); }`,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      varying vec3 vP;
      void main(){
        float land = fbm(vP*2.2 + vec3(4.0));
        float detail = fbm3(vP*9.0);
        land = land*0.8 + detail*0.25;
        float lat = abs(vP.y);
        vec3 ocean = mix(vec3(0.02,0.16,0.45), vec3(0.05,0.35,0.65), smoothstep(0.42,0.5,land));
        vec3 grass = vec3(0.16,0.42,0.15);
        vec3 dry = vec3(0.55,0.45,0.25);
        vec3 snow = vec3(0.92,0.95,1.0);
        vec3 landCol = mix(grass, dry, smoothstep(0.55,0.7,detail));
        landCol = mix(landCol, snow, smoothstep(0.78,0.9,lat + land*0.15));
        float isLand = smoothstep(0.50,0.53,land);
        vec3 alb = mix(ocean, landCol, isLand);
        alb += vec3(0.15,0.25,0.3)*smoothstep(0.03,0.0,abs(land-0.505))*0.6; // coast
        float cl = fbm(vP*3.5 + vec3(0.0, 0.0, 12.0));
        float clouds = smoothstep(0.50,0.68,cl);
        alb = mix(alb, vec3(0.97,0.98,1.0), clouds*0.9);
        float specMask = (1.0-isLand)*(1.0-clouds);
        float city = step(0.994, hash13(floor(vP*180.0))) * isLand * (1.0-clouds);
        gl_FragColor = vec4(alb, city > 0.5 ? 1.0 : specMask*0.49);
      }`,
  });
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev);
  mat.dispose();
  return rt;
}

export function makePlanet(renderer, radius = 400) {
  const group = new THREE.Group();
  const sun = new THREE.Vector3(0.4, 0.3, -0.8).normalize();
  const rt = bakePlanetTexture(renderer);
  const surf = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uMap: { value: rt.texture } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vUv = uv; vW = (modelMatrix*vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform sampler2D uMap;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        vec4 s = texture2D(uMap, vUv);
        vec3 alb = s.rgb;
        float city = step(0.75, s.a); float specMask = city > 0.5 ? 0.0 : s.a/0.49;
        float ndl = dot(n, uSun);
        float diff = smoothstep(-0.15, 0.35, ndl);
        vec3 h = normalize(uSun + v);
        float spec = pow(max(dot(n,h),0.0), 60.0) * specMask * 0.8;
        float fres = pow(1.0 - max(dot(n,v),0.0), 3.0);
        vec3 col = alb * (diff*1.35 + 0.02) + vec3(1.0,0.9,0.75)*spec*diff;
        col += vec3(0.35,0.6,1.0) * fres * (0.25 + 0.9*diff);
        col += vec3(1.0,0.75,0.4) * city * smoothstep(0.1,-0.2,ndl) * 2.0;
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), surf);
  group.add(sphere);
  const atmo = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uSun: { value: sun } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        float rim = pow(clamp(dot(n, v)+1.0, 0.0, 1.0), 6.0); // backside: n points away
        float lit = smoothstep(-0.4, 0.4, dot(-n, uSun));
        vec3 col = mix(vec3(0.15,0.35,0.9), vec3(0.55,0.8,1.0), lit) * rim * (0.35 + lit*1.4);
        gl_FragColor = vec4(col, rim); }`,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 64, 48), atmo);
  group.add(shell);
  group.userData.materials = [surf, atmo];
  group.userData.dispose = () => rt.dispose();
  return group;
}

/* ------------------------------------------------------------------ */
/* Sun sprite                                                          */
/* ------------------------------------------------------------------ */
export function makeSunSprite(size = 600) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,250,1)'); grd.addColorStop(0.08, 'rgba(255,240,210,1)'); grd.addColorStop(0.2, 'rgba(255,190,120,0.55)');
  grd.addColorStop(0.5, 'rgba(255,140,80,0.12)'); grd.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(mat); s.scale.setScalar(size); s.renderOrder = -50;
  return s;
}

/* ------------------------------------------------------------------ */
/* Textures: hull panels                                               */
/* ------------------------------------------------------------------ */
export function makePanelTexture(rng, base = '#dfe6ee', size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // panels
  for (let i = 0; i < 140; i++) {
    const w = 20 + rng.next() * 90, h = 12 + rng.next() * 60;
    const x = rng.next() * size, y = rng.next() * size;
    const v = (rng.next() - 0.5) * 22;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  // fine seams
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 18; i++) { const y = rng.next() * size; g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); }
  for (let i = 0; i < 10; i++) { const x = rng.next() * size; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke(); }
  // rivets / vents
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 60; i++) { const x = rng.next() * size, y = rng.next() * size; for (let k = 0; k < 5; k++) g.fillRect(x, y + k * 4, 12, 1.5); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function makeWindowTexture(rng, size = 256) {
  const c = document.createElement('canvas'); c.width = size; c.height = size / 4;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let x = 6; x < c.width - 6; x += 9) for (let y = 8; y < c.height - 8; y += 12) {
    if (rng.next() < 0.7) { g.fillStyle = rng.next() < 0.8 ? '#ffd9a0' : '#a8d8ff'; g.fillRect(x, y, 4, 6); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
export function makeMaterials(rng, envMap) {
  const panels = makePanelTexture(rng, '#e4eaf0');
  const panelsDark = makePanelTexture(rng, '#3a4250');
  const mats = {
    hull: new THREE.MeshStandardMaterial({ color: 0xe6ecf2, map: panels, metalness: 0.45, roughness: 0.32, envMap, envMapIntensity: 1.2 }),
    hullBlue: new THREE.MeshStandardMaterial({ color: 0x2f66e0, map: panels, metalness: 0.55, roughness: 0.28, envMap, envMapIntensity: 1.3 }),
    hullDark: new THREE.MeshStandardMaterial({ color: 0x505a6a, map: panelsDark, metalness: 0.75, roughness: 0.45, envMap, envMapIntensity: 1.0 }),
    hullRed: new THREE.MeshStandardMaterial({ color: 0xd8323a, metalness: 0.45, roughness: 0.3, envMap, envMapIntensity: 1.2 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x1e222b, metalness: 0.9, roughness: 0.35, envMap, envMapIntensity: 1.3 }),
    canopy: new THREE.MeshPhysicalMaterial({ color: 0x0d2a66, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMap, envMapIntensity: 2.5, emissive: 0x0a1f4a, emissiveIntensity: 0.4 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x8fe4ff, emissive: 0x5fd0ff, emissiveIntensity: 4.0, roughness: 1, metalness: 0 }),
    glowOrange: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9040, emissiveIntensity: 3.0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0x0a0c10, emissive: 0xffffff, emissiveMap: makeWindowTexture(rng), emissiveIntensity: 2.0, metalness: 0.6, roughness: 0.4, envMap }),
    hangarFloor: new THREE.MeshStandardMaterial({ color: 0x3b4250, map: panelsDark, metalness: 0.6, roughness: 0.55, envMap, envMapIntensity: 0.6 }),
  };
  panels.repeat.set(2, 2);
  return mats;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */
/** Box whose XY cross-section is scaled along Z by fn(z01) -> [sx, sy, yOffset]. Nose at -Z. */
export function taperBox(w, h, l, fn, segs = 12) {
  const g = new THREE.BoxGeometry(w, h, l, 1, 1, segs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), u = Math.min(1, Math.max(0, (z + l / 2) / l)); // u = 0 at nose (-Z)
    const [sx, sy, oy = 0] = fn(u);
    p.setX(i, p.getX(i) * sx); p.setY(i, p.getY(i) * sy + oy);
  }
  g.computeVertexNormals();
  return g;
}

export function extrudeShape(points, depth, bevel = 0.02) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Additive exhaust cone + flare sprite. Returns group with .setPower(p). */
export function makeExhaust(len = 4, rad = 0.35, color = 0x66d9ff) {
  const grp = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 16, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPower; varying vec2 vUv;
      void main(){ float t = vUv.y; // 1 at cone base (nozzle) with our rotation
        float flick = 0.85 + 0.15*sin(uTime*40.0 + vUv.x*30.0);
        float a = pow(t, 2.2) * flick * uPower;
        vec3 c = mix(uColor, vec3(1.0), pow(t, 6.0)*0.8);
        gl_FragColor = vec4(c*a*1.6, a); }`,
  }));
  cone.rotation.x = -Math.PI / 2; cone.position.z = len / 2; // points +Z (rearward)
  grp.add(cone);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(160,230,255,0.8)'); grd.addColorStop(1, 'rgba(80,160,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color }));
  flare.scale.setScalar(rad * 5); grp.add(flare);
  grp.userData.setPower = (p) => { cone.material.uniforms.uPower.value = p; cone.scale.set(0.6 + p * 0.5, 0.6 + p * 0.5, 0.35 + p * 0.9); flare.material.opacity = Math.min(1, 0.4 + p * 0.7); flare.scale.setScalar(rad * (3 + p * 3)); };
  grp.userData.tick = (t) => { cone.material.uniforms.uTime.value = t; };
  grp.userData.setPower(1);
  return grp;
}

/* ------------------------------------------------------------------ */
/* Arwing (nose -Z, length ≈ 7)                                       */
/* ------------------------------------------------------------------ */
export function buildArwing(mats) {
  const ship = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; ship.add(m); return m;
  };
  // fuselage: pointed nose, widest at 60%, flat squared tail
  add(taperBox(1.1, 0.9, 6.4, (u) => {
    const nose = Math.pow(Math.min(1, u / 0.55), 0.55);
    const s = 0.12 + 0.88 * nose;
    const tail = u > 0.8 ? 1 - (u - 0.8) * 0.6 : 1;
    return [s * tail, s * (0.85 + 0.15 * u) * tail, -0.1 * (1 - nose)];
  }, 24), mats.hull, 0, 0, 0.2);
  // nose stripe (blue)
  add(taperBox(1.14, 0.3, 3.0, (u) => [Math.pow(Math.min(1, (u + 0.05) / 0.9), 0.55) + 0.02, 1, 0.1]), mats.hullBlue, 0, 0.12, -1.6);
  // canopy
  const can = add(new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.canopy, 0, 0.42, -0.35);
  can.scale.set(1, 0.85, 2.0);
  add(new THREE.BoxGeometry(0.95, 0.12, 1.6), mats.gunmetal, 0, 0.42, -0.35); // canopy frame
  // rear engine housing
  add(new THREE.BoxGeometry(1.5, 0.95, 1.6), mats.hullDark, 0, -0.02, 2.8);
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 24), mats.gunmetal, 0, 0.0, 3.7, Math.PI / 2);
  add(new THREE.CircleGeometry(0.36, 24), mats.glow, 0, 0, 3.96, 0, Math.PI);
  // main wings (swept, angled down slightly) with G-diffuser tips
  const wingShape = [[0, -0.6], [3.4, 0.7], [3.9, 0.9], [4.0, 1.2], [3.6, 1.35], [0.4, 1.3]]; // in (x=span, y=z-chord)
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const wg = extrudeShape(wingShape, 0.1, 0.02);
    wg.rotateX(Math.PI / 2); // put chord along Z
    const wm = new THREE.Mesh(wg, mats.hull); wm.castShadow = true; wm.receiveShadow = true;
    wm.scale.x = side; wing.add(wm);
    // blue leading stripe
    const st = new THREE.Mesh(extrudeShape([[0.3, -0.45], [3.3, 0.75], [3.3, 0.95], [0.3, -0.2]], 0.12, 0.0), mats.hullBlue);
    st.geometry.rotateX(Math.PI / 2); st.scale.x = side; wing.add(st);
    // G-diffuser vertical fin at tip
    const fin = new THREE.Mesh(extrudeShape([[0, -0.4], [0, 1.4], [1.5, 1.3], [1.7, 0.6], [1.2, -0.3]], 0.14, 0.02), mats.hull);
    fin.geometry.rotateY(Math.PI / 2); fin.geometry.rotateZ(Math.PI / 2); // plane YZ
    fin.position.set(side * 3.95, 0.05, 0); fin.castShadow = true; wing.add(fin);
    // G-diffuser glow ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 24), mats.glow);
    ring.position.set(side * 3.95, 0.1, 0.0); ring.rotation.y = Math.PI / 2; wing.add(ring);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 16), mats.gunmetal);
    rod.rotation.x = Math.PI / 2; rod.position.set(side * 3.95, 0.1, 0.35); wing.add(rod);
    // laser cannon
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 12), mats.gunmetal);
    gun.rotation.x = Math.PI / 2; gun.position.set(side * 3.9, -0.05, -1.2); wing.add(gun);
    wing.position.set(side * 0.5, -0.15, 0.9);
    wing.rotation.z = side * -0.12; // anhedral
    wing.userData.side = side;
    ship.add(wing);
    ship.userData[side < 0 ? 'wingL' : 'wingR'] = wing;
    // upper stabiliser fins (small, angled)
    const uf = new THREE.Mesh(extrudeShape([[0, 0], [0.2, 1.1], [0.55, 1.15], [0.9, 0.0]], 0.08, 0.01), mats.hullBlue);
    uf.geometry.rotateY(Math.PI / 2); uf.geometry.rotateZ(Math.PI / 2);
    uf.position.set(side * 0.55, 0.45, 2.6); uf.rotation.z = side * -0.5; ship.add(uf);
  }
  // red accent block on nose sides
  add(new THREE.BoxGeometry(1.2, 0.08, 0.8), mats.hullRed, 0, -0.1, 1.2);
  // exhaust
  const ex = makeExhaust(3.2, 0.34); ex.position.set(0, 0, 3.9); ship.add(ex);
  ship.userData.exhaust = ex;
  ship.userData.setPower = (p) => ex.userData.setPower(p);
  ship.userData.tick = (t) => ex.userData.tick(t);
  return ship;
}

/* ------------------------------------------------------------------ */
/* Great Fox (nose -Z, length ≈ 110)                                  */
/* ------------------------------------------------------------------ */
export function buildGreatFox(mats) {
  const gf = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; gf.add(m); return m;
  };
  // main hull: long wedge, hangar at nose
  add(taperBox(14, 9, 80, (u) => {
    const s = 0.55 + 0.45 * Math.pow(u, 0.7);
    return [s, s * (0.75 + 0.25 * u), 0];
  }, 16), mats.hull, 0, 0, 5);
  // belly keel
  add(taperBox(6, 4, 60, (u) => [0.6 + 0.4 * u, 1, 0], 8), mats.hullDark, 0, -5, 12);
  // dorsal spine + bridge
  add(taperBox(5, 3.5, 40, (u) => [0.7 + 0.3 * u, 1, 0], 8), mats.hull, 0, 5.5, 20);
  add(new THREE.BoxGeometry(7, 3, 8), mats.hullDark, 0, 8, 30);
  const bridge = add(new THREE.BoxGeometry(7.2, 1.1, 4), mats.windows, 0, 8.2, 26.6);
  bridge.material = mats.windows;
  // hangar bay (open nose)
  add(new THREE.BoxGeometry(9, 5.5, 3), mats.gunmetal, 0, -0.5, -34.5);
  const bay = new THREE.Mesh(new THREE.BoxGeometry(7.4, 4.0, 12), new THREE.MeshStandardMaterial({ color: 0x0b0e14, side: THREE.BackSide, roughness: 0.9 }));
  bay.position.set(0, -0.5, -30); gf.add(bay);
  for (let i = 0; i < 6; i++) { add(new THREE.BoxGeometry(6.8, 0.12, 0.12), mats.glowOrange, 0, -2.4, -35 + i * 2); add(new THREE.BoxGeometry(6.8, 0.12, 0.12), mats.glowOrange, 0, 1.4, -35 + i * 2); }
  // wings: broad, swept, with engine pods
  for (const side of [-1, 1]) {
    const wg = extrudeShape([[0, -8], [26, 8], [30, 14], [30, 20], [24, 21], [0, 14]], 1.6, 0.15);
    wg.rotateX(Math.PI / 2);
    const w = new THREE.Mesh(wg, mats.hull); w.scale.x = side; w.position.set(side * 5, -1.5, 18); w.castShadow = true; w.receiveShadow = true; gf.add(w);
    const stripe = new THREE.Mesh(extrudeShape([[6, -4], [24, 9], [24, 11], [6, -1]], 1.8, 0.0), mats.hullBlue);
    stripe.geometry.rotateX(Math.PI / 2); stripe.scale.x = side; stripe.position.set(side * 5, -1.5, 18); gf.add(stripe);
    // wingtip fins
    const fin = new THREE.Mesh(extrudeShape([[0, 0], [0, 9], [6, 8], [10, 0]], 0.8, 0.1), mats.hullBlue);
    fin.geometry.rotateY(Math.PI / 2); fin.geometry.rotateZ(Math.PI / 2);
    fin.position.set(side * 34.5, -1, 32); gf.add(fin);
    // engines (2 per side)
    for (let k = 0; k < 2; k++) {
      const x = side * (11 + k * 8), z = 38 + k * 2;
      add(new THREE.CylinderGeometry(2.6, 3.0, 14, 24), mats.hullDark, x, -1.5, z, Math.PI / 2);
      add(new THREE.CylinderGeometry(2.4, 2.2, 2.5, 24), mats.gunmetal, x, -1.5, z + 8, Math.PI / 2);
      add(new THREE.CircleGeometry(2.0, 24), mats.glow, x, -1.5, z + 9.3, 0, Math.PI);
      const ex = makeExhaust(26, 2.3, 0x6fd6ff); ex.position.set(x, -1.5, z + 9); gf.add(ex);
      (gf.userData.exhausts ??= []).push(ex);
    }
    // twin forward cannons
    add(new THREE.CylinderGeometry(0.9, 1.3, 46, 16), mats.gunmetal, side * 8.5, -3.5, -20, Math.PI / 2);
    add(new THREE.CylinderGeometry(1.5, 1.5, 6, 16), mats.hullBlue, side * 8.5, -3.5, -2, Math.PI / 2);
  }
  // red accents
  add(new THREE.BoxGeometry(14.4, 1.2, 4), mats.hullRed, 0, 1.5, -10);
  // hull windows strips
  add(new THREE.BoxGeometry(0.2, 0.8, 30), mats.windows, 6.6, 1.2, 12);
  add(new THREE.BoxGeometry(0.2, 0.8, 30), mats.windows, -6.6, 1.2, 12);
  gf.userData.tick = (t) => gf.userData.exhausts.forEach((e) => e.userData.tick(t));
  gf.userData.setPower = (p) => gf.userData.exhausts.forEach((e) => e.userData.setPower(p));
  return gf;
}

/* ------------------------------------------------------------------ */
/* Hangar interior set (camera looks out of the bay along -Z)          */
/* ------------------------------------------------------------------ */
export function buildHangar(mats) {
  const h = new THREE.Group();
  const W = 26, H = 12, L = 70;
  const wall = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mats.hangarFloor); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.receiveShadow = true; h.add(m); return m; };
  const floorTex = mats.hangarFloor.map; floorTex.repeat.set(4, 10);
  wall(new THREE.BoxGeometry(W, 1, L), 0, -H / 2, 0);
  wall(new THREE.BoxGeometry(W, 1, L), 0, H / 2, 0);
  wall(new THREE.BoxGeometry(1, H, L), -W / 2, 0, 0);
  wall(new THREE.BoxGeometry(1, H, L), W / 2, 0, 0);
  wall(new THREE.BoxGeometry(W, H, 1), 0, 0, L / 2); // back wall
  // ribs
  for (let i = 0; i < 9; i++) {
    const z = -L / 2 + 6 + i * 7;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.8, 0.8), mats.hullDark); rib.position.set(0, H / 2 - 0.9, z); h.add(rib);
    for (const s of [-1, 1]) { const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, H - 0.5, 0.8), mats.hullDark); r2.position.set(s * (W / 2 - 0.9), 0, z); h.add(r2); }
    // ceiling light bars
    const lt = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.15, 0.3), mats.glow); lt.position.set(0, H / 2 - 0.55, z + 3.5); h.add(lt);
  }
  // floor guide strips + launch rails
  for (const x of [-7, 7]) {
    for (let i = 0; i < 12; i++) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 3), mats.glowOrange); g.position.set(x, -H / 2 + 0.55, -L / 2 + 2 + i * 6); h.add(g); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, L - 4), mats.gunmetal); rail.position.set(x, -H / 2 + 0.75, 0); h.add(rail);
  }
  // point lights
  const l1 = new THREE.PointLight(0x9fd8ff, 60, 60, 1.6); l1.position.set(0, 4, 8); h.add(l1);
  const l2 = new THREE.PointLight(0xffb070, 30, 50, 1.6); l2.position.set(0, -3, -12); h.add(l2);
  return h;
}
