// Venom attack drone: chunky two-tone hull (gunmetal + saturated Venom red), yellow warning
// stripes, red optic, glowing thruster ring with an engine trail, hit-flash. Sized to read at range.
import * as THREE from 'three';

export function buildDrone(envMap) {
  const matBody = new THREE.MeshPhysicalMaterial({ color: 0x39404f, metalness: 0.8, roughness: 0.35, envMap, envMapIntensity: 1.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const matPanel = new THREE.MeshPhysicalMaterial({ color: 0xd8242e, metalness: 0.35, roughness: 0.38, envMap, envMapIntensity: 1.0, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const matStripe = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0x6a4a00, metalness: 0.2, roughness: 0.5, envMap, envMapIntensity: 0.6 });
  const matEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 0.35, 0.2), toneMapped: false });
  const matGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.6, 0.3), toneMapped: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const matHit = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const trailTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16; const g = cv.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 64, 0); lg.addColorStop(0, 'rgba(255,240,220,1)'); lg.addColorStop(0.25, 'rgba(255,120,60,0.7)'); lg.addColorStop(1, 'rgba(255,60,30,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 16);
    const rg = g.createLinearGradient(0, 0, 0, 16); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.5, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = rg; g.fillRect(0, 0, 64, 16);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const matTrail = new THREE.MeshBasicMaterial({ map: trailTex, color: new THREE.Color(1.4, 0.9, 0.7), toneMapped: false, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  const geoBody = new THREE.OctahedronGeometry(1.6, 1); geoBody.scale(1, 0.6, 1.7);
  const geoRing = new THREE.TorusGeometry(2.3, 0.26, 10, 40);
  const geoEye = new THREE.SphereGeometry(0.5, 14, 10);
  const geoWing = new THREE.BoxGeometry(3.2, 0.18, 1.4);
  const geoStripe = new THREE.BoxGeometry(0.5, 0.2, 1.42);
  const geoFin = new THREE.BoxGeometry(0.14, 1.4, 1.0);
  const geoThr = new THREE.CylinderGeometry(0.6, 0.42, 0.6, 14);
  const geoGlow = new THREE.CircleGeometry(0.5, 16);
  const geoTrail = new THREE.PlaneGeometry(5.5, 0.9); geoTrail.translate(2.75, 0, 0); geoTrail.rotateY(-Math.PI / 2);
  const geoHit = new THREE.OctahedronGeometry(2.0, 1); geoHit.scale(1, 0.7, 1.75);

  function make() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geoBody, matBody);
    const ring = new THREE.Mesh(geoRing, matPanel); ring.rotation.x = Math.PI / 2; ring.scale.y = 0.6; ring.name = 'ring';
    const eye = new THREE.Mesh(geoEye, matEye); eye.position.z = -1.9;
    const wingL = new THREE.Mesh(geoWing, matPanel); wingL.position.set(-2.4, 0, 0.7); wingL.rotation.z = 0.4;
    const wingR = new THREE.Mesh(geoWing, matPanel); wingR.position.set(2.4, 0, 0.7); wingR.rotation.z = -0.4;
    const stL = new THREE.Mesh(geoStripe, matStripe); stL.position.set(-1.1, 0, 0); wingL.add(stL);
    const stR = new THREE.Mesh(geoStripe, matStripe); stR.position.set(1.1, 0, 0); wingR.add(stR);
    const fin = new THREE.Mesh(geoFin, matStripe); fin.position.set(0, 1.0, 1.4);
    const thr = new THREE.Mesh(geoThr, matBody); thr.rotation.x = Math.PI / 2; thr.position.z = 2.2;
    const glow = new THREE.Mesh(geoGlow, matGlow); glow.position.z = 2.52; glow.name = 'glow';
    const trail = new THREE.Mesh(geoTrail, matTrail); trail.position.z = 2.6; trail.name = 'trail';
    const trail2 = new THREE.Mesh(geoTrail, matTrail); trail2.rotation.z = Math.PI / 2; trail.add(trail2);
    const hit = new THREE.Mesh(geoHit, matHit.clone()); hit.name = 'hit';
    g.add(body, ring, eye, wingL, wingR, fin, thr, glow, trail, hit);
    g.scale.setScalar(2.4);
    return g;
  }
  function animate(g, t, hitAmt) {
    const ring = g.getObjectByName('ring'); if (ring) ring.rotation.z = t * 1.8;
    const glow = g.getObjectByName('glow'); if (glow) glow.scale.setScalar(1 + 0.15 * Math.sin(t * 21));
    const trail = g.getObjectByName('trail'); if (trail) trail.scale.set(1, 1, 0.85 + 0.15 * Math.sin(t * 17 + g.id));
    const hit = g.getObjectByName('hit'); if (hit) hit.material.opacity = hitAmt * 0.9;
  }
  function dispose() {
    for (const x of [geoBody, geoRing, geoEye, geoWing, geoStripe, geoFin, geoThr, geoGlow, geoTrail, geoHit, matBody, matPanel, matStripe, matEye, matGlow, matHit, matTrail, trailTex]) x.dispose();
  }
  return { make, animate, dispose };
}
