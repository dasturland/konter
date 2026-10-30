// Sound recipes. Each recipe receives the engine and an output node and schedules oscillators and noise.
// Everything is synthesized, there are no sample files.

/** Per weapon shot parameters: crack (high noise), body (mid noise) and thump (low sine drop). */
const SHOT_PROFILES = {
  usp_s: { crack: 5200, body: 1800, thump: 150, dur: 0.16, gain: 0.45, tail: 0.18 },
  glock18: { crack: 4800, body: 1600, thump: 170, dur: 0.15, gain: 0.45, tail: 0.15 },
  deagle: { crack: 3800, body: 1100, thump: 90, dur: 0.3, gain: 0.8, tail: 0.35 },
  ak47: { crack: 3600, body: 900, thump: 80, dur: 0.24, gain: 0.75, tail: 0.3 },
  m4a4: { crack: 4400, body: 1300, thump: 100, dur: 0.2, gain: 0.6, tail: 0.25 },
  mp5: { crack: 5000, body: 1700, thump: 130, dur: 0.14, gain: 0.5, tail: 0.15 },
  awp: { crack: 2800, body: 600, thump: 55, dur: 0.55, gain: 1, tail: 0.7 },
};

export function shot(eng, out, weaponId) {
  if (weaponId === 'knife') {
    eng.noise(out, { filter: 'bandpass', freq: 1200, endFreq: 3800, q: 1.2, dur: 0.16, gain: 0.22, attack: 0.03 });
    return;
  }
  const p = SHOT_PROFILES[weaponId] ?? SHOT_PROFILES.m4a4;
  eng.noise(out, { filter: 'highpass', freq: p.crack, q: 0.7, dur: p.dur * 0.6, gain: p.gain * 0.7 });
  eng.noise(out, { filter: 'lowpass', freq: p.body, endFreq: p.body / 4, q: 0.9, dur: p.dur, gain: p.gain });
  eng.tone(out, { type: 'sine', freq: p.thump * 2.2, endFreq: p.thump * 0.5, dur: p.dur * 1.2, gain: p.gain * 0.9 });
  eng.noise(out, { filter: 'lowpass', freq: 500, endFreq: 120, dur: p.tail + 0.2, gain: p.gain * 0.25, start: 0.02 });
  if (weaponId === 'awp') {
    eng.tone(out, { type: 'square', freq: 1400, endFreq: 900, start: 0.45, dur: 0.05, gain: 0.08 });
    eng.tone(out, { type: 'square', freq: 1000, endFreq: 700, start: 0.62, dur: 0.05, gain: 0.08 });
  }
}

export function reload(eng, out) {
  // Magazine out, magazine in, bolt.
  eng.noise(out, { filter: 'bandpass', freq: 1800, q: 4, dur: 0.07, gain: 0.25 });
  eng.tone(out, { type: 'square', freq: 320, endFreq: 180, dur: 0.06, gain: 0.08 });
  eng.noise(out, { filter: 'bandpass', freq: 900, q: 3, start: 0.9, dur: 0.09, gain: 0.3 });
  eng.tone(out, { type: 'triangle', freq: 220, endFreq: 120, start: 0.9, dur: 0.08, gain: 0.15 });
  eng.noise(out, { filter: 'bandpass', freq: 2600, q: 5, start: 1.5, dur: 0.05, gain: 0.3 });
  eng.noise(out, { filter: 'bandpass', freq: 1500, q: 5, start: 1.62, dur: 0.06, gain: 0.3 });
}

export function dryClick(eng, out) {
  eng.noise(out, { filter: 'bandpass', freq: 3200, q: 6, dur: 0.035, gain: 0.3 });
  eng.tone(out, { type: 'square', freq: 900, endFreq: 500, dur: 0.03, gain: 0.07 });
}

/** Footstep. Metal grate steps ring with a short decaying resonance. */
export function footstep(eng, out, surface) {
  if (surface === 'metal') {
    eng.noise(out, { filter: 'bandpass', freq: 1400, q: 2, dur: 0.07, gain: 0.3 });
    for (const [f, g] of [[620, 0.12], [1130, 0.09], [1830, 0.06]]) {
      eng.tone(out, { type: 'sine', freq: f * (0.97 + Math.random() * 0.06), dur: 0.38, gain: g });
    }
  } else {
    eng.noise(out, { filter: 'lowpass', freq: 650 + Math.random() * 150, endFreq: 200, q: 0.9, dur: 0.1, gain: 0.32 });
    eng.tone(out, { type: 'sine', freq: 90, endFreq: 50, dur: 0.09, gain: 0.18 });
  }
}

export function hit(eng, out) {
  eng.noise(out, { filter: 'lowpass', freq: 900, endFreq: 250, dur: 0.12, gain: 0.45 });
  eng.tone(out, { type: 'sine', freq: 180, endFreq: 70, dur: 0.12, gain: 0.35 });
}

export function headshot(eng, out) {
  hit(eng, out);
  eng.tone(out, { type: 'triangle', freq: 2200, endFreq: 1700, dur: 0.18, gain: 0.25 });
  eng.noise(out, { filter: 'highpass', freq: 5000, dur: 0.05, gain: 0.3 });
}

/** Feedback ping for the local player's successful hit. */
export function hitMarker(eng, out, isHeadshot) {
  eng.tone(out, { type: 'square', freq: isHeadshot ? 1900 : 1250, endFreq: isHeadshot ? 1500 : 950, dur: 0.07, gain: 0.1 });
}

export function death(eng, out) {
  eng.noise(out, { filter: 'lowpass', freq: 700, endFreq: 120, dur: 0.5, gain: 0.4 });
  eng.tone(out, { type: 'sawtooth', freq: 260, endFreq: 55, dur: 0.6, gain: 0.2 });
  eng.tone(out, { type: 'sine', freq: 70, endFreq: 38, start: 0.12, dur: 0.5, gain: 0.35 });
}

export function hurt(eng, out) {
  eng.noise(out, { filter: 'lowpass', freq: 500, endFreq: 150, dur: 0.18, gain: 0.35 });
  eng.tone(out, { type: 'sine', freq: 110, endFreq: 60, dur: 0.18, gain: 0.3 });
}

export function jump(eng, out) {
  eng.noise(out, { filter: 'bandpass', freq: 500, endFreq: 900, q: 0.8, dur: 0.12, gain: 0.14 });
}

export function land(eng, out, hard) {
  eng.noise(out, { filter: 'lowpass', freq: 500, endFreq: 150, dur: hard ? 0.2 : 0.12, gain: hard ? 0.45 : 0.28 });
  eng.tone(out, { type: 'sine', freq: 80, endFreq: 40, dur: 0.15, gain: hard ? 0.4 : 0.22 });
}

/** Bomb beep. `urgency` is 0..1 and raises pitch and loudness. */
export function bombBeep(eng, out, urgency) {
  const f = 880 + urgency * 520;
  eng.tone(out, { type: 'square', freq: f, dur: 0.09, gain: 0.16 + urgency * 0.12, attack: 0.002 });
  eng.tone(out, { type: 'sine', freq: f * 2, dur: 0.07, gain: 0.05 });
}

export function plant(eng, out) {
  for (let i = 0; i < 4; i++) {
    eng.tone(out, { type: 'square', freq: 700 + i * 120, dur: 0.06, gain: 0.12, start: i * 0.14 });
    eng.noise(out, { filter: 'bandpass', freq: 2200, q: 5, dur: 0.04, gain: 0.15, start: i * 0.14 });
  }
  eng.tone(out, { type: 'sine', freq: 440, endFreq: 440, start: 0.7, dur: 0.5, gain: 0.2 });
}

export function defuse(eng, out) {
  for (let i = 0; i < 5; i++) {
    eng.noise(out, { filter: 'bandpass', freq: 1800 + i * 150, q: 6, dur: 0.045, gain: 0.2, start: i * 0.12 });
  }
  eng.tone(out, { type: 'sine', freq: 520, endFreq: 1040, start: 0.65, dur: 0.35, gain: 0.22 });
  eng.tone(out, { type: 'sine', freq: 780, endFreq: 1560, start: 0.65, dur: 0.35, gain: 0.12 });
}

export function explosion(eng, out, big) {
  const scale = big ? 1 : 0.6;
  eng.noise(out, { filter: 'lowpass', freq: 2400, endFreq: 80, q: 0.7, dur: 2.2 * scale + 0.4, gain: 1 * scale + 0.1 });
  eng.tone(out, { type: 'sine', freq: 90, endFreq: 24, dur: 1.8 * scale + 0.3, gain: 0.9 });
  eng.noise(out, { filter: 'highpass', freq: 3000, dur: 0.25, gain: 0.5 });
  eng.noise(out, { filter: 'lowpass', freq: 400, endFreq: 60, start: 0.25, dur: 2.5 * scale + 0.5, gain: 0.5 });
}

export function smokePop(eng, out) {
  eng.noise(out, { filter: 'bandpass', freq: 900, endFreq: 300, q: 0.9, dur: 0.5, gain: 0.35 });
  eng.tone(out, { type: 'sine', freq: 140, endFreq: 60, dur: 0.25, gain: 0.3 });
}

export function flashBang(eng, out) {
  eng.noise(out, { filter: 'highpass', freq: 2500, dur: 0.18, gain: 0.7 });
  eng.tone(out, { type: 'sine', freq: 4200, dur: 1.4, gain: 0.08, attack: 0.02 });
}

export function throwGrenade(eng, out) {
  eng.noise(out, { filter: 'bandpass', freq: 800, endFreq: 1700, q: 0.8, dur: 0.18, gain: 0.2, attack: 0.04 });
}

export function pickup(eng, out) {
  eng.tone(out, { type: 'triangle', freq: 500, endFreq: 760, dur: 0.1, gain: 0.18 });
  eng.noise(out, { filter: 'bandpass', freq: 1500, q: 3, dur: 0.05, gain: 0.15 });
}

export function roundSignal(eng, out) {
  eng.tone(out, { type: 'square', freq: 660, dur: 0.18, gain: 0.16 });
  eng.tone(out, { type: 'square', freq: 990, start: 0.22, dur: 0.32, gain: 0.16 });
  eng.tone(out, { type: 'sine', freq: 330, start: 0.22, dur: 0.4, gain: 0.2 });
}

export function roundLive(eng, out) {
  eng.tone(out, { type: 'square', freq: 1100, dur: 0.1, gain: 0.14 });
  eng.tone(out, { type: 'square', freq: 1100, start: 0.14, dur: 0.1, gain: 0.14 });
}

export function win(eng, out) {
  [523, 659, 784, 1047].forEach((f, i) => {
    eng.tone(out, { type: 'triangle', freq: f, start: i * 0.13, dur: 0.4, gain: 0.2 });
    eng.tone(out, { type: 'sine', freq: f / 2, start: i * 0.13, dur: 0.4, gain: 0.12 });
  });
}

export function lose(eng, out) {
  [392, 330, 262, 196].forEach((f, i) => {
    eng.tone(out, { type: 'sawtooth', freq: f, start: i * 0.18, dur: 0.45, gain: 0.1 });
  });
}

/** Cash register: bell ring plus drawer clack. */
export function cash(eng, out) {
  eng.noise(out, { filter: 'bandpass', freq: 1400, q: 4, dur: 0.06, gain: 0.3 });
  eng.tone(out, { type: 'sine', freq: 2093, dur: 0.5, gain: 0.2, start: 0.05 });
  eng.tone(out, { type: 'sine', freq: 3136, dur: 0.45, gain: 0.12, start: 0.05 });
  eng.tone(out, { type: 'sine', freq: 4186, dur: 0.35, gain: 0.07, start: 0.05 });
  eng.noise(out, { filter: 'lowpass', freq: 500, dur: 0.1, gain: 0.3, start: 0.02 });
}

export function denied(eng, out) {
  eng.tone(out, { type: 'square', freq: 220, dur: 0.12, gain: 0.12 });
  eng.tone(out, { type: 'square', freq: 165, start: 0.12, dur: 0.16, gain: 0.12 });
}

export function menuClick(eng, out) {
  eng.tone(out, { type: 'triangle', freq: 640, endFreq: 520, dur: 0.07, gain: 0.14 });
}

export function menuHover(eng, out) {
  eng.tone(out, { type: 'sine', freq: 900, dur: 0.035, gain: 0.05 });
}

export function chatBlip(eng, out) {
  eng.tone(out, { type: 'sine', freq: 1250, dur: 0.06, gain: 0.1 });
  eng.tone(out, { type: 'sine', freq: 1650, start: 0.07, dur: 0.07, gain: 0.1 });
}

export const RECIPES = {
  shot, reload, dryClick, footstep, hit, headshot, hitMarker, death, hurt, jump, land, bombBeep, plant, defuse,
  explosion, smokePop, flashBang, throwGrenade, pickup, roundSignal, roundLive, win, lose, cash, denied,
  menuClick, menuHover, chatBlip,
};
