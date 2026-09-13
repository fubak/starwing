/**
 * Tiny perf overlay: FPS, frame ms, draw calls, triangles, geometries,
 * textures, and current render scale. Toggle with F3; forced on by `?stats`.
 * Zero deps besides DOM; updated ~4x/sec so it costs ~nothing.
 */
export class Stats {
  constructor(engine) {
    this.engine = engine;
    this.visible = new URLSearchParams(location.search).has('stats');
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:9999;padding:6px 9px;' +
      'font:600 11px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#9fd8ff;' +
      'background:rgba(4,10,20,.72);border:1px solid rgba(110,180,255,.25);' +
      'border-radius:4px;pointer-events:none;white-space:pre;text-shadow:0 1px 2px #000';
    this.el.style.display = this.visible ? 'block' : 'none';
    document.body.appendChild(this.el);

    this._frames = 0;
    this._acc = 0;      // accumulated frame ms
    this._max = 0;      // worst frame in the current 250ms window
    this._maxSeen = 0;  // worst frame of the last ~10 windows (sticky hitch meter)
    this._maxSeenN = 0;
    this._last = performance.now();
    this._fps = 0;
    this._ms = 0;

    this._onKey = (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.toggle(); }
    };
    addEventListener('keydown', this._onKey);
  }

  toggle() { this.setVisible(!this.visible); }
  setVisible(v) { this.visible = v; this.el.style.display = v ? 'block' : 'none'; }

  /** Call once per rendered frame. */
  update() {
    const now = performance.now();
    const ms = now - this._last;
    this._last = now;
    this._frames++;
    this._acc += ms;
    if (ms > this._max) this._max = ms;
    if (this._acc >= 250) { // refresh ~4x/sec
      this._fps = 1000 * this._frames / this._acc;
      this._ms = this._acc / this._frames;
      this._maxSeen = Math.max(this._max, this._maxSeen * 0.8); // sticky, decays ~4s
      this._frames = 0; this._acc = 0;
      if (this.visible) this._draw();
      this._max = 0;
    }
  }

  _draw() {
    const info = this.engine.renderer.info;
    const scale = this.engine.renderScale ?? 1;
    const camp = typeof window !== 'undefined' ? window.__campaign : null;
    const warm = camp?.warm;
    this.el.textContent =
      `${this._fps.toFixed(0).padStart(3)} fps  ${this._ms.toFixed(1)} ms  worst ${this._maxSeen.toFixed(0)}\n` +
      `calls ${info.render.calls}  tris ${(info.render.triangles / 1e3).toFixed(0)}k\n` +
      `geo ${info.memory.geometries}  tex ${info.memory.textures}\n` +
      `scale ${(scale * 100).toFixed(0)}%` +
      (camp ? `\nstage ${camp.stage}${warm ? `  warm ${warm.name}:${warm.done ? 'done' : warm.remaining}` : ''}` : '');
  }

  dispose() {
    removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}
