import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { Rng } from './rng.js';
import { AudioBus } from './audio.js';
import { Events } from './events.js';
import { Stats } from './stats.js';
import { trace } from './trace.js';

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
    this.basePixelRatio = Math.min(devicePixelRatio || 1, 1.5); // cap DPR: 2x+ is pure fill cost
    this.renderScale = 1;                                     // adaptive resolution scaler [0.6, 1]
    this.renderer.setPixelRatio(this.basePixelRatio);
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

    this.trace = trace;
    this.input = new Input(autoplay);
    this.audio = new AudioBus();
    this.size = new THREE.Vector2();
    this.stats = new Stats(this);

    // adaptive resolution scaling state
    this._slowAcc = 0;   // seconds spent above the slow threshold
    this._fastAcc = 0;   // seconds spent comfortably fast
    this._scaleCooldown = 0;

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

  /** Apply basePixelRatio * renderScale to renderer + composer buffers. */
  _applyPixelRatio() {
    const pr = this.basePixelRatio * this.renderScale;
    this.renderer.setPixelRatio(pr);
    if (this.composer.setPixelRatio) this.composer.setPixelRatio(pr);
    const w = this.size.x || this.container.clientWidth || innerWidth;
    const h = this.size.y || this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /**
   * Adaptive resolution: sustained frame time > ~30 ms steps the render scale
   * down (to a 0.6 floor); sustained comfort (< ~18 ms) steps it back up.
   */
  /** Test/probe hook: freeze the adaptive scaler at a fixed scale (or null to re-enable). */
  pinScale(v) {
    this._scalePinned = v != null;
    if (v != null) { this.renderScale = v; this._applyPixelRatio(); }
  }

  _adaptiveScale(dt, frameMs) {
    if (this._scalePinned) return;
    this._scaleCooldown = Math.max(0, this._scaleCooldown - dt);
    // Hysteresis: "fast" means real headroom (<15 ms, i.e. a full ~90 fps frame),
    // must hold for 4 s, and every step enforces a multi-second cooldown — the
    // old 18 ms / 2 s / 1 s constants let the scale oscillate (down on a wave
    // spike, back up while the spike still ran) which reads as pulsing blur.
    if (frameMs > 30) { this._slowAcc += dt; this._fastAcc = 0; }
    else if (frameMs < 15) { this._fastAcc += dt; this._slowAcc = 0; }
    else { this._slowAcc = Math.max(0, this._slowAcc - dt); this._fastAcc = 0; }
    if (this._scaleCooldown > 0) return;
    if (this._slowAcc >= 1 && this.renderScale > 0.6) {
      this.renderScale = Math.max(0.6, +(this.renderScale - 0.1).toFixed(2));
      this._applyPixelRatio();
      trace.mark('scale:down', this.renderScale);
      this._slowAcc = 0; this._scaleCooldown = 2.5;
    } else if (this._fastAcc >= 4 && this.renderScale < 1) {
      this.renderScale = Math.min(1, +(this.renderScale + 0.1).toFixed(2));
      this._applyPixelRatio();
      trace.mark('scale:up', this.renderScale);
      this._fastAcc = 0; this._scaleCooldown = 4;
    }
  }

  resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.size.set(w, h);
    this._applyPixelRatio();
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
    const f0 = performance.now();
    const wall = this._wall ? f0 - this._wall : dt * 1000;
    this._wall = f0;
    trace.begin(this);
    this.input.update(dt, this.time);
    this.piece?.update(dt, this.time);
    this.audio.update(dt);
    const r0 = performance.now();
    this.composer.render(dt);
    const r1 = performance.now();
    // CPU cost of the whole frame (update + render submissions), no GPU wait —
    // hardware-independent signal for throttling background work (warm builds).
    this.lastCpu = (r0 - f0) + (r1 - r0);
    trace.frame(this, wall, r0 - f0, r1 - r0);
    this.stats.update();
    this._adaptiveScale(dt, this.fixedStep ? r1 - r0 : (this.stats._ms || 16));
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

  dispose() {
    this.stop();
    removeEventListener('resize', this._resize);
    this.stats.dispose();
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}
