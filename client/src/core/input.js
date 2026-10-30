// Keyboard and mouse input with Pointer Lock. Produces sim input commands.
const SLOT_KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'knife', Digit4: 'smoke', Digit5: 'flash', Digit6: 'he' };
const EMPTY_SET = new Set();
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyR', 'KeyE', 'KeyG', 'KeyB', 'Tab',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyC', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function isTyping(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export class Input {
  constructor(element, settings) {
    this.element = element;
    this.settings = settings;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.seq = 0;
    this.slotRequest = null;
    this.throwRequest = null;
    this.listeners = new Map();

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
      this.emit(this.locked ? 'lock' : 'unlock');
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = 0.0022 * this.settings.get('sensitivity') * (this.sensitivityScale ?? 1);
      this.yaw -= e.movementX * s;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * s));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      e.preventDefault();
    });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if (e.code === 'Tab' || (GAME_KEYS.has(e.code) && this.locked)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.emit('anykey', e.code);
      if (!this.locked) return;
      if (SLOT_KEYS[e.code]) {
        const slot = SLOT_KEYS[e.code];
        if (slot === 'smoke' || slot === 'flash' || slot === 'he') this.throwRequest = slot;
        else this.slotRequest = slot;
      }
      if (e.code === 'KeyG') this.throwRequest = 'he';
      this.emit('key', e.code);
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.emit('keyup', e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.slotRequest = e.deltaY > 0 ? 'secondary' : 'primary';
    }, { passive: true });
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }

  emit(name, arg) {
    const set = this.listeners.get(name);
    if (set) for (const fn of set) fn(arg);
  }

  lock() {
    if (this.locked) return;
    const p = this.element.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** True when the key was pressed since the last endFrame call. */
  consume(code) {
    return this.pressed.delete(code);
  }

  endFrame() {
    this.pressed.clear();
  }

  get aiming() {
    return this.locked && this.buttons.has(2);
  }

  get firing() {
    return this.locked && this.buttons.has(0);
  }

  /** Builds a command in the format the shared GameSim expects. */
  buildCommand() {
    // Menus and dialogs release the pointer: they must not move or shoot the player.
    const k = this.locked ? this.keys : EMPTY_SET;
    const buttons = this.locked ? this.buttons : EMPTY_SET;
    const mz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    this.seq += 1;
    const cmd = {
      seq: this.seq, mx, mz, yaw: Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)), pitch: this.pitch,
      jump: k.has('Space'), fire: buttons.has(0), reload: k.has('KeyR'), walk: k.has('ShiftLeft'),
      use: k.has('KeyE'), scope: buttons.has(2), slot: this.slotRequest, throw: this.throwRequest,
    };
    this.slotRequest = null;
    this.throwRequest = null;
    return cmd;
  }
}
