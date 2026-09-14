/**
 * Unified input: keyboard + gamepad + mouse + scripted "autoplay" for the harness.
 * Axes are in [-1,1]; buttons expose held/pressed/released.
 *
 * Bindings (Star Fox layout):
 *   move:  WASD / arrows / left stick / MOUSE (when a stage enables mouse.steer —
 *          the flight stages: cursor offset from centre = stick deflection;
 *          under pointer lock the deltas drive a virtual stick)
 *   fire:  Space / J / LMB / gamepad A        (LMB also counts as 'confirm' —
 *          a click starts the title / skips cinematics)
 *   bomb:  B / RMB or MMB / gamepad Y
 *   boost: Shift / gamepad R
 *   brake: Ctrl / gamepad L
 *   rollL: Q / gamepad LB, rollR: E / gamepad RB
 *   pause: Escape / start
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// mouse stick shaping: dead zone at the centre, then a mild power curve so fine
// aim near the reticle isn't twitchy and the edges still reach full deflection
const STICK_DZ = 0.07, STICK_POW = 1.35;
const shape = (v) => {
  const a = Math.abs(v);
  if (a < STICK_DZ) return 0;
  return Math.sign(v) * Math.pow((a - STICK_DZ) / (1 - STICK_DZ), STICK_POW);
};

export class Input {
  constructor(autoplay = false) {
    this.autoplay = autoplay;
    this.axes = { x: 0, y: 0, lookX: 0, lookY: 0 };
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.script = null; // function (t) -> { x,y, buttons:Set } for autoplay
    this._keys = new Set();
    this._onDown = (e) => {
      if (e.repeat) return;
      this._keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    this._onUp = (e) => this._keys.delete(e.code);
    addEventListener('keydown', this._onDown);
    addEventListener('keyup', this._onUp);

    this.pointer = { x: 0, y: 0, down: false };
    // --- mouse --------------------------------------------------------------
    // steer:      stages opt in (rail / space / boss) — the cursor's offset from
    //             the screen centre acts as the flight stick; with pointer lock
    //             engaged, deltas move a virtual stick that holds its position
    // lockOnClick: while steering, the first click on the canvas grabs the pointer
    this.mouse = {
      steer: false,
      lockOnClick: true,
      locked: false,
      x: 0, y: 0,       // virtual stick position (pointer-lock mode)
      ax: 0, ay: 0,     // smoothed steering contribution to axes.x/y
      down: new Set(),  // buttons currently held (0 LMB, 1 MMB, 2 RMB)
      edge: new Set(),  // buttons pressed since the last update (down+up inside one frame still registers)
    };
    this.el = null; // pointer-lock surface — the engine sets it to the renderer canvas
    this._onMouseMove = (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
      if (this.mouse.locked) {
        // ~42% of the screen height of travel = full stick deflection
        const g = 1 / (Math.max(200, innerHeight) * 0.42);
        this.mouse.x = clamp(this.mouse.x + e.movementX * g, -1, 1);
        this.mouse.y = clamp(this.mouse.y - e.movementY * g, -1, 1);
      }
    };
    this._onMouseDown = (e) => {
      this.pointer.down = true;
      this.mouse.down.add(e.button);
      this.mouse.edge.add(e.button);
      if (this.mouse.steer && this.mouse.lockOnClick && this.el && !this.mouse.locked && e.target === this.el) {
        try { this.el.requestPointerLock()?.catch?.(() => {}); } catch { /* headless / unsupported */ }
      }
    };
    this._onMouseUp = (e) => {
      this.mouse.down.delete(e.button);
      this.pointer.down = this.mouse.down.size > 0;
    };
    this._onLock = () => { this.mouse.locked = document.pointerLockElement === this.el; };
    this._onMenu = (e) => { if (e.target === this.el || this.mouse.steer) e.preventDefault(); };
    addEventListener('pointermove', this._onMouseMove);
    addEventListener('pointerdown', this._onMouseDown);
    addEventListener('pointerup', this._onMouseUp);
    addEventListener('contextmenu', this._onMenu);
    document.addEventListener('pointerlockchange', this._onLock);
  }

  static KEYMAP = {
    fire: ['Space', 'KeyJ'],
    bomb: ['KeyB', 'KeyK'],
    boost: ['ShiftLeft', 'ShiftRight'],
    brake: ['ControlLeft', 'ControlRight'],
    rollL: ['KeyQ'],
    rollR: ['KeyE'],
    pause: ['Escape'],
    confirm: ['Enter', 'Space'],
    jump: ['Space'],
    interact: ['KeyF'],
  };

  update(dt, t) {
    const prev = this.held;
    const held = this._heldSwap ?? (this._heldSwap = new Set());
    held.clear();
    let x = 0, y = 0;

    if (this.autoplay && this.script) {
      const s = this.script(t);
      x = s.x ?? 0; y = s.y ?? 0;
      for (const b of s.buttons ?? []) held.add(b);
    } else {
      const k = this._keys;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      for (const [name, codes] of Object.entries(Input.KEYMAP)) if (codes.some((c) => k.has(c))) held.add(name);
      const gp = navigator.getGamepads?.()[0];
      if (gp) {
        const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
        x += dz(gp.axes[0]); y -= dz(gp.axes[1]);
        this.axes.lookX = dz(gp.axes[2] ?? 0); this.axes.lookY = -dz(gp.axes[3] ?? 0);
        const b = (i) => gp.buttons[i]?.pressed;
        if (b(0)) held.add('fire').add('confirm').add('jump');
        if (b(3)) held.add('bomb');
        if (b(7) || b(5)) held.add('boost');
        if (b(6) || b(4)) held.add('brake');
        if (b(4)) held.add('rollL');
        if (b(5)) held.add('rollR');
        if (b(9)) held.add('pause');
        if (b(2)) held.add('interact');
      }
      // --- mouse buttons: LMB = fire (and 'confirm', so a click = start/skip), RMB/MMB = bomb
      const md = this.mouse;
      if (md.down.has(0) || md.edge.has(0)) held.add('fire').add('confirm');
      if (md.down.has(1) || md.down.has(2) || md.edge.has(1) || md.edge.has(2)) held.add('bomb');
      // --- pointer steering (opt-in): cursor offset from centre -> stick
      if (md.steer) {
        const tx = md.locked ? shape(md.x) : shape(this.pointer.x);
        const ty = md.locked ? shape(md.y) : shape(this.pointer.y);
        const k = 1 - Math.exp(-18 * Math.min(dt, 0.1));
        md.ax += (tx - md.ax) * k; md.ay += (ty - md.ay) * k;
        x += md.ax; y += md.ay;
      }
      md.edge.clear();
    }
    this.axes.x = clamp(x, -1, 1);
    this.axes.y = clamp(y, -1, 1);
    this.held = held;
    this._heldSwap = prev;
    // pressed/released: diff into the persistent sets (no per-frame allocations)
    this.pressed.clear(); this.released.clear();
    for (const b of held) if (!prev.has(b)) this.pressed.add(b);
    for (const b of prev) if (!held.has(b)) this.released.add(b);
  }

  endFrame() {}

  isHeld(b) { return this.held.has(b); }
  wasPressed(b) { return this.pressed.has(b); }
  wasReleased(b) { return this.released.has(b); }

  dispose() {
    removeEventListener('keydown', this._onDown);
    removeEventListener('keyup', this._onUp);
    removeEventListener('pointermove', this._onMouseMove);
    removeEventListener('pointerdown', this._onMouseDown);
    removeEventListener('pointerup', this._onMouseUp);
    removeEventListener('contextmenu', this._onMenu);
    document.removeEventListener('pointerlockchange', this._onLock);
  }
}
