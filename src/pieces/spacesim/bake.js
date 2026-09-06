// One-off GPU bakes: fullscreen-quad shader -> texture, and a shader sky -> cube map.
import * as THREE from 'three';

export function bakeTexture(renderer, fragmentShader, w, h, { uniforms = {}, type = THREE.UnsignedByteType } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false, stencilBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(quad);
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevRT);
  quad.geometry.dispose(); mat.dispose();
  return rt;
}

/** Render a sky object (e.g. a BackSide shader sphere) into a cube map once. */
export function bakeCube(renderer, skyObject, size = 512) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const scene = new THREE.Scene();
  scene.add(skyObject);
  const cam = new THREE.CubeCamera(1, 10000, rt);
  cam.update(renderer, scene);
  return rt;
}
