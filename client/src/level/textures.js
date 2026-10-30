// Procedural canvas textures (color + bump). No external assets are used.
import * as THREE from 'three';

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(canvas, srgb, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, size, rnd, amount, count, light = 255, dark = 0) {
  for (let i = 0; i < count; i++) {
    const v = rnd() > 0.5 ? light : dark;
    ctx.fillStyle = `rgba(${v},${v},${v},${rnd() * amount})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

function rivet(color, bump, x, y, r) {
  color.fillStyle = '#6a6e72';
  color.beginPath(); color.arc(x, y, r, 0, Math.PI * 2); color.fill();
  color.fillStyle = '#a9aeb2';
  color.beginPath(); color.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); color.fill();
  bump.fillStyle = '#fff';
  bump.beginPath(); bump.arc(x, y, r, 0, Math.PI * 2); bump.fill();
}

function stains(color, size, rnd, rust, damp) {
  for (let i = 0; i < rust; i++) {
    const x = rnd() * size;
    const y = rnd() * size * 0.6;
    const w = 3 + rnd() * 9;
    const h = 30 + rnd() * size * 0.4;
    const g = color.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(122,62,28,0.55)');
    g.addColorStop(1, 'rgba(122,62,28,0)');
    color.fillStyle = g;
    color.fillRect(x, y, w, h);
  }
  for (let i = 0; i < damp; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 20 + rnd() * 70;
    const g = color.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,28,32,0.35)');
    g.addColorStop(1, 'rgba(20,28,32,0)');
    color.fillStyle = g;
    color.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Wall panels split 2x2 with corner rivets, rust streaks and damp stains. */
function wallPanel(size = 512) {
  const rnd = rngFrom(11);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#6b7178'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#9a9a9a'; bx.fillRect(0, 0, size, size);
  const half = size / 2;
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x = px * half; const y = py * half;
      const tone = 92 + Math.floor(rnd() * 26);
      cx.fillStyle = `rgb(${tone - 6},${tone},${tone + 6})`;
      cx.fillRect(x + 4, y + 4, half - 8, half - 8);
      bx.fillStyle = '#b4b4b4';
      bx.fillRect(x + 4, y + 4, half - 8, half - 8);
      cx.strokeStyle = '#2a2e33'; cx.lineWidth = 4; cx.strokeRect(x + 2, y + 2, half - 4, half - 4);
      bx.strokeStyle = '#000'; bx.lineWidth = 6; bx.strokeRect(x + 2, y + 2, half - 4, half - 4);
      for (const [rx, ry] of [[14, 14], [half - 14, 14], [14, half - 14], [half - 14, half - 14]]) {
        rivet(cx, bx, x + rx, y + ry, 4.5);
      }
    }
  }
  stains(cx, size, rnd, 14, 7);
  noise(cx, size, rnd, 0.22, 5000);
  noise(bx, size, rnd, 0.2, 4000);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Black-holed metal grate floor. */
function grateFloor(size = 256) {
  const rnd = rngFrom(23);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#4b5056'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#d0d0d0'; bx.fillRect(0, 0, size, size);
  const cell = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cxp = x * cell + cell / 2; const cyp = y * cell + cell / 2;
      cx.fillStyle = '#050607';
      cx.beginPath(); cx.arc(cxp, cyp, cell * 0.32, 0, Math.PI * 2); cx.fill();
      bx.fillStyle = '#000';
      bx.beginPath(); bx.arc(cxp, cyp, cell * 0.34, 0, Math.PI * 2); bx.fill();
    }
  }
  cx.strokeStyle = 'rgba(0,0,0,0.5)'; cx.lineWidth = 2; cx.strokeRect(1, 1, size - 2, size - 2);
  noise(cx, size, rnd, 0.25, 2500);
  stains(cx, size, rnd, 4, 3);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** White acoustic ceiling tiles with tiny pits. */
function ceilingTile(size = 256) {
  const rnd = rngFrom(31);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#d9dee2'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#aaa'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size; const y = rnd() * size;
    cx.fillStyle = 'rgba(70,76,82,0.55)'; cx.fillRect(x, y, 2, 2);
    bx.fillStyle = '#000'; bx.fillRect(x, y, 2, 2);
  }
  cx.strokeStyle = '#8c949b'; cx.lineWidth = 4; cx.strokeRect(0, 0, size, size);
  bx.strokeStyle = '#000'; bx.lineWidth = 6; bx.strokeRect(0, 0, size, size);
  stains(cx, size, rnd, 0, 3);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Rusty corrugated beam. */
function corrugated(size = 256) {
  const rnd = rngFrom(41);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  const stripes = 16;
  for (let i = 0; i < stripes; i++) {
    const y = (i * size) / stripes; const h = size / stripes;
    const g = cx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#6a3a22'); g.addColorStop(0.5, '#a65a30'); g.addColorStop(1, '#4a2616');
    cx.fillStyle = g; cx.fillRect(0, y, size, h);
    const gb = bx.createLinearGradient(0, y, 0, y + h);
    gb.addColorStop(0, '#000'); gb.addColorStop(0.5, '#fff'); gb.addColorStop(1, '#000');
    bx.fillStyle = gb; bx.fillRect(0, y, size, h);
  }
  noise(cx, size, rnd, 0.4, 6000, 190, 20);
  noise(cx, size, rnd, 0.4, 600, 255, 40);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Yellow-black diagonal safety stripes. */
function hazard(size = 256) {
  const rnd = rngFrom(53);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#e7b81a'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#999'; bx.fillRect(0, 0, size, size);
  cx.fillStyle = '#16171a';
  const step = size / 4;
  for (let i = -size; i < size * 2; i += step * 2) {
    cx.beginPath();
    cx.moveTo(i, 0); cx.lineTo(i + step, 0); cx.lineTo(i + step - size, size); cx.lineTo(i - size, size);
    cx.closePath(); cx.fill();
  }
  noise(cx, size, rnd, 0.35, 3500);
  noise(bx, size, rnd, 0.3, 2500);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Worn blue metal crate with edge frame and scratches. */
function crateBlue(size = 256) {
  const rnd = rngFrom(61);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#2f5d9c'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#aaa'; bx.fillRect(0, 0, size, size);
  cx.strokeStyle = '#1c3a66'; cx.lineWidth = 16; cx.strokeRect(8, 8, size - 16, size - 16);
  bx.strokeStyle = '#fff'; bx.lineWidth = 14; bx.strokeRect(8, 8, size - 16, size - 16);
  cx.strokeStyle = '#1c3a66'; cx.lineWidth = 8;
  cx.beginPath(); cx.moveTo(16, 16); cx.lineTo(size - 16, size - 16); cx.moveTo(size - 16, 16); cx.lineTo(16, size - 16); cx.stroke();
  for (const [x, y] of [[22, 22], [size - 22, 22], [22, size - 22], [size - 22, size - 22]]) rivet(cx, bx, x, y, 5);
  for (let i = 0; i < 40; i++) {
    cx.strokeStyle = `rgba(200,210,220,${0.1 + rnd() * 0.3})`; cx.lineWidth = 1;
    const x = rnd() * size; const y = rnd() * size;
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + rnd() * 30 - 15, y + rnd() * 30 - 15); cx.stroke();
  }
  stains(cx, size, rnd, 5, 3);
  noise(cx, size, rnd, 0.3, 4000);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Red oil barrel with ribs. */
function barrelRed(size = 256) {
  const rnd = rngFrom(71);
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#a3241c'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#999'; bx.fillRect(0, 0, size, size);
  for (const y of [size * 0.12, size * 0.5, size * 0.88]) {
    cx.fillStyle = '#6e1712'; cx.fillRect(0, y - 8, size, 16);
    bx.fillStyle = '#fff'; bx.fillRect(0, y - 8, size, 16);
  }
  stains(cx, size, rnd, 8, 4);
  noise(cx, size, rnd, 0.35, 4500);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Terminal screen: blue glow with scanlines, a green and a red button strip. */
function terminalScreen(size = 256) {
  const rnd = rngFrom(83);
  const c = makeCanvas(size);
  const cx = c.getContext('2d');
  const g = cx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#3da0ff'); g.addColorStop(1, '#0c4a9a');
  cx.fillStyle = g; cx.fillRect(0, 0, size, size);
  cx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 9; i++) cx.fillRect(18, 24 + i * 22, 40 + rnd() * (size - 90), 5);
  cx.fillStyle = 'rgba(0,20,60,0.25)';
  for (let y = 0; y < size; y += 4) cx.fillRect(0, y, size, 2);
  return { color: toTexture(c, true) };
}

/** Vent grille with horizontal slats. */
function ventGrille(size = 128) {
  const c = makeCanvas(size); const b = makeCanvas(size);
  const cx = c.getContext('2d'); const bx = b.getContext('2d');
  cx.fillStyle = '#0a0b0d'; cx.fillRect(0, 0, size, size);
  bx.fillStyle = '#000'; bx.fillRect(0, 0, size, size);
  for (let y = 6; y < size - 6; y += 14) {
    cx.fillStyle = '#7b8189'; cx.fillRect(4, y, size - 8, 8);
    bx.fillStyle = '#fff'; bx.fillRect(4, y, size - 8, 8);
  }
  cx.strokeStyle = '#4a4f55'; cx.lineWidth = 6; cx.strokeRect(3, 3, size - 6, size - 6);
  return { color: toTexture(c, true), bump: toTexture(b, false) };
}

/** Creates every texture set used by the level once. */
export function createTextures() {
  return {
    wall: wallPanel(),
    floor: grateFloor(),
    ceiling: ceilingTile(),
    beam: corrugated(),
    hazard: hazard(),
    crate: crateBlue(),
    barrel: barrelRed(),
    screen: terminalScreen(),
    vent: ventGrille(),
  };
}

/** Returns a copy of a texture with a different repeat so one canvas serves many surfaces. */
export function withRepeat(texture, rx, ry) {
  const t = texture.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
