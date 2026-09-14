/**
 * Frame-time tracer for stutter hunting. Enabled with `?trace` (or
 * `window.__trace.enable()`); costs nothing when disabled.
 *
 * Per frame it records: wall-clock dt, the CPU cost of update vs render, the
 * rolling median, the live stage name, `renderer.info.programs.length`, draw
 * calls, and `performance.memory.usedJSHeapSize` when Chrome exposes it.
 * Named markers (`trace.mark('vfx:pool-grow')`) are attached to the frame they
 * happen on, so a hitch can be attributed to the thing the game just did.
 *
 * `window.__trace.dump()` -> JSON { frames:[...], marks:[...], hitches:[...] }.
 */

const CAP = 12000; // ~3.5 min at 60 fps

class Trace {
  constructor() {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    this.enabled = q.has('trace');
    this.cap = CAP;
    this.n = 0;
    // parallel typed arrays: no per-frame object allocation (the tracer must not
    // itself create the garbage it is hunting)
    this.t = new Float64Array(CAP);       // ms since boot
    this.dt = new Float32Array(CAP);      // ms, wall clock between frame starts
    this.upd = new Float32Array(CAP);     // ms, piece update
    this.ren = new Float32Array(CAP);     // ms, composer.render
    this.med = new Float32Array(CAP);     // rolling median dt (window of 31)
    this.prog = new Int32Array(CAP);      // renderer.info.programs.length
    this.calls = new Int32Array(CAP);     // renderer.info.render.calls
    this.tris = new Float64Array(CAP);
    this.heap = new Float64Array(CAP);    // bytes
    this.scale = new Float32Array(CAP);
    this.stageId = new Int32Array(CAP);
    this.stages = [''];                   // stageId -> name
    this._stage = '';
    this._stageId = 0;
    this.progSeen = new Set();            // WebGLProgram ids already accounted for
    this.progLog = [];                    // { frame, name, shadow } for every program created
    this.marks = [];                      // { frame, t, name, info? }
    this._pendingMarks = 0;
    this.markFrame = new Int32Array(CAP); // count of marks on this frame
    // rolling median window
    this._win = new Float32Array(31);
    this._winN = 0;
    this._sorted = new Float32Array(31);
    this._t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (typeof window !== 'undefined') window.__trace = this;
  }

  enable() { this.enabled = true; }

  /**
   * Frame start. With the tracer on we take over `renderer.info` resetting so
   * the recorded draw-call count covers EVERY pass of the frame (shadow maps,
   * planar reflection, bloom mips, grade, output) rather than only the last.
   */
  begin(e) {
    if (!this.enabled) return;
    const info = e.renderer.info;
    if (info.autoReset) info.autoReset = false;
    info.reset();
  }

  setStage(name) {
    if (name === this._stage) return;
    this._stage = name;
    let i = this.stages.indexOf(name);
    if (i < 0) { this.stages.push(name); i = this.stages.length - 1; }
    this._stageId = i;
    if (this.enabled) this.mark(`stage:${name}`);
  }

  /** Attach a named event to the frame currently being recorded. */
  mark(name, info) {
    if (!this.enabled) return;
    this.marks.push({ frame: this.n, t: performance.now() - this._t0, name, info });
    this._pendingMarks++;
  }

  /** Rolling median of the last <=31 dt samples. */
  _median() {
    const k = Math.min(this._winN, 31);
    if (k === 0) return 16.7;
    const s = this._sorted;
    for (let i = 0; i < k; i++) s[i] = this._win[i];
    // insertion sort (k <= 31)
    for (let i = 1; i < k; i++) { const v = s[i]; let j = i - 1; while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; } s[j + 1] = v; }
    return k & 1 ? s[(k - 1) >> 1] : 0.5 * (s[k / 2 - 1] + s[k / 2]);
  }

  /**
   * Record one frame. Called from Engine.step().
   * @param {object} e engine
   * @param {number} dtMs wall-clock ms since the previous frame start
   * @param {number} updMs piece update cost
   * @param {number} renMs composer.render cost
   */
  frame(e, dtMs, updMs, renMs) {
    if (!this.enabled) return;
    const i = this.n;
    if (i >= this.cap) return; // stop recording rather than wrap (dump stays contiguous)
    this._win[this._winN % 31] = dtMs; this._winN++;
    const info = e.renderer.info;
    this.t[i] = this._t0 === 0 ? dtMs : performance.now() - this._t0;
    this.dt[i] = dtMs;
    this.upd[i] = updMs;
    this.ren[i] = renMs;
    this.med[i] = this._median();
    this.prog[i] = info.programs ? info.programs.length : 0;
    // attribute new shader programs to the frame they compiled on: this is what
    // turns "a 300 ms spike" into "MeshStandardMaterial depth variant compiled".
    if (info.programs && info.programs.length !== this._progN) {
      this._progN = info.programs.length;
      for (const p of info.programs) {
        if (this.progSeen.has(p.id)) continue;
        this.progSeen.add(p.id);
        const type = p.type || p.name || '?';   // material/shader type, e.g. MeshStandardMaterial
        this.progLog.push({ frame: i, name: type, shadow: /depth|distance/i.test(type), key: p.cacheKey || '' });
      }
    }
    this.calls[i] = info.render.calls;
    this.tris[i] = info.render.triangles;
    this.heap[i] = (typeof performance !== 'undefined' && performance.memory) ? performance.memory.usedJSHeapSize : 0;
    this.scale[i] = e.renderScale ?? 1;
    this.stageId[i] = this._stageId;
    this.markFrame[i] = this._pendingMarks;
    this._pendingMarks = 0;
    this.n = i + 1;
  }

  dump() {
    const n = this.n;
    const a = (arr) => Array.prototype.slice.call(arr.subarray(0, n));
    return {
      n,
      stages: this.stages,
      frames: {
        t: a(this.t), dt: a(this.dt), upd: a(this.upd), ren: a(this.ren), med: a(this.med),
        prog: a(this.prog), calls: a(this.calls), tris: a(this.tris), heap: a(this.heap),
        scale: a(this.scale), stage: a(this.stageId), marks: a(this.markFrame),
      },
      marks: this.marks,
      progLog: this.progLog,
    };
  }

  reset() { this.n = 0; this._winN = 0; this.marks.length = 0; this._pendingMarks = 0; }
}

export const trace = new Trace();
