import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { Rng } from './rng.js';
import { AudioBus } from './audio.js';
import { Events } from './events.js';

/**
 * Engine: owns renderer, post-processing chain, input, audio, fixed/variable
 * stepping, and the currently running "piece" (a scene module).
 *
 * A piece is `create(ctx) -> { update(dt, t), dispose(), camera? }`.
 * ctx = { THREE, scene, camera, renderer, composer, bloom, input, ui, audio,
 *         rng, events, size, engine }
 */
export class Engine {
  constructor({ container, ui, fixedStep = 0, seed = 1, autoplay = false }) {
    this.container = container;
    this.ui = ui;
    this.fixedStep = fixedStep;
    this.autoplay = autoplay;
    this.rng = new Rng(seed);
    this.events = new Events();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    this.camera.position.set(0, 2, 8);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 0.85);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.outputPass);

    this.input = new Input(autoplay);
    this.audio = new AudioBus();
    this.size = new THREE.Vector2();

    this.time = 0;
    this.frame = 0;
    this.piece = null;
    this._raf = 0;
    this._last = 0;
    this._resize = () => this.resize();
    addEventListener('resize', this._resize);
    this.resize();
  }

  get ctx() {
    return {
      THREE,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      composer: this.composer,
      bloom: this.bloom,
      input: this.input,
      ui: this.ui,
      audio: this.audio,
      rng: this.rng,
      events: this.events,
      size: this.size,
      engine: this,
    };
  }

  resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.size.set(w, h);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const cam = this.piece?.camera ?? this.camera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  async run(create) {
    this.stop();
    this.scene.clear();
    this.ui.innerHTML = '';
    this.piece = await create(this.ctx);
    if (this.piece?.camera) {
      this.renderPass.camera = this.piece.camera;
      this.resize();
    }
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      let dt = this.fixedStep || Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.step(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** Advance one frame. Public so the harness can step deterministically. */
  step(dt) {
    this.time += dt;
    this.frame++;
    this.input.update(dt, this.time);
    this.piece?.update(dt, this.time);
    this.audio.update(dt);
    this.composer.render(dt);
    this.input.endFrame();
  }

  /** Harness: step N frames synchronously (fixedStep mode). */
  stepFrames(n) {
    const dt = this.fixedStep || 1 / 60;
    for (let i = 0; i < n; i++) this.step(dt);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this.piece?.dispose?.();
    this.piece = null;
    this.renderPass.camera = this.camera;
  }
}
