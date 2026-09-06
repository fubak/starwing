import * as THREE from 'three';

export function makePlaceholder(ctx, name) {
  const { scene, camera, ui } = ctx;
  scene.background = new THREE.Color(0x0b0f1e);
  scene.add(new THREE.HemisphereLight(0x99bbff, 0x223344, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(5, 8, 4); scene.add(sun);
  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.35, 128, 24), new THREE.MeshStandardMaterial({ color: 0x6aa5ff, metalness: 0.6, roughness: 0.3 }));
  scene.add(mesh);
  camera.position.set(0, 1.5, 6); camera.lookAt(0, 0, 0);
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;left:24px;top:24px;font:600 20px system-ui;letter-spacing:.2em;opacity:.7';
  label.textContent = `PLACEHOLDER: ${name.toUpperCase()}`;
  ui.appendChild(label);
  return {
    update(dt, t) { mesh.rotation.y = t * 0.6; mesh.rotation.x = t * 0.25; },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
  };
}
