/**
 * Unified input: keyboard + gamepad + scripted "autoplay" for the harness.
 * Axes are in [-1,1]; buttons expose held/pressed/released.
 *
 * Bindings (Star Fox layout):
 *   move:  WASD / arrows / left stick
 *   fire:  Space / J / gamepad A
 *   bomb:  B / gamepad Y
 *   boost: Shift / gamepad R
 *   brake: Ctrl / gamepad L
 *   rollL: Q / gamepad LB, rollR: E / gamepad RB
 *   pause: Escape / start
 */
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
    addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    });
    addEventListener('pointerdown', () => (this.pointer.down = true));
    addEventListener('pointerup', () => (this.pointer.down = false));
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
    }
    this.axes.x = Math.max(-1, Math.min(1, x));
    this.axes.y = Math.max(-1, Math.min(1, y));
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
  }
}
