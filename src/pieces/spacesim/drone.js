// Venom attack drone: dark gunmetal hull, red optic, glowing thruster ring, hit-flash.
import * as THREE from 'three';

export function buildDrone(envMap) {
  const matBody = new THREE.MeshPhysicalMaterial({ color: 0x4a5264, metalness: 0.85, roughness: 0.32, envMap, envMapIntensity: 1.2, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const matPanel = new THREE.MeshStandardMaterial({ color: 0x8b2f3a, metalness: 0.5, roughness: 0.45, envMap, envMapIntensity: 0.8 });
  const matEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 0.35, 0.25), toneMapped: false });
  const matGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.5, 0.3), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const matHit = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

  const geoBody = new THREE.OctahedronGeometry(1.6, 1); geoBody.scale(1, 0.6, 1.7);
  const geoRing = new THREE.TorusGeometry(2.2, 0.22, 10, 36);
  const geoEye = new THREE.SphereGeometry(0.45, 14, 10);
  const geoWing = new THREE.BoxGeometry(2.8, 0.14, 1.2);
  const geoFin = new THREE.BoxGeometry(0.12, 1.2, 0.9);
  const geoThr = new THREE.CylinderGeometry(0.5, 0.35, 0.5, 14);
  const geoGlow = new THREE.CircleGeometry(0.42, 16);
  const geoHit = new THREE.OctahedronGeometry(2.0, 1); geoHit.scale(1, 0.7, 1.75);

  function make() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geoBody, matBody);
    const ring = new THREE.Mesh(geoRing, matBody); ring.rotation.x = Math.PI / 2; ring.scale.y = 0.6; ring.name = 'ring';
    const eye = new THREE.Mesh(geoEye, matEye); eye.position.z = -1.9;
    const wingL = new THREE.Mesh(geoWing, matPanel); wingL.position.set(-2.2, 0, 0.7); wingL.rotation.z = 0.4;
    const wingR = new THREE.Mesh(geoWing, matPanel); wingR.position.set(2.2, 0, 0.7); wingR.rotation.z = -0.4;
    const fin = new THREE.Mesh(geoFin, matPanel); fin.position.set(0, 0.9, 1.4);
    const thr = new THREE.Mesh(geoThr, matBody); thr.rotation.x = Math.PI / 2; thr.position.z = 2.2;
    const glow = new THREE.Mesh(geoGlow, matGlow); glow.position.z = 2.47; glow.name = 'glow';
    const hit = new THREE.Mesh(geoHit, matHit.clone()); hit.name = 'hit';
    g.add(body, ring, eye, wingL, wingR, fin, thr, glow, hit);
    g.scale.setScalar(1.5);
    return g;
  }
  function animate(g, t, hitAmt) {
    const ring = g.getObjectByName('ring'); if (ring) ring.rotation.z = t * 1.8;
    const glow = g.getObjectByName('glow'); if (glow) glow.scale.setScalar(1 + 0.15 * Math.sin(t * 21));
    const hit = g.getObjectByName('hit'); if (hit) hit.material.opacity = hitAmt * 0.9;
  }
  function dispose() {
    for (const x of [geoBody, geoRing, geoEye, geoWing, geoFin, geoThr, geoGlow, geoHit, matBody, matPanel, matEye, matGlow, matHit]) x.dispose();
  }
  return { make, animate, dispose };
}
