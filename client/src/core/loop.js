// Frame loop with delta time. Updates run with a clamped dt, rendering happens once per frame.
export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.last = 0;
    this.fps = 60;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
  }

  tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0.0001, (now - this.last) / 1000));
    this.last = now;
    this.fps += (1 / dt - this.fps) * 0.05;
    this.update(dt);
    this.render(dt);
  }
}
