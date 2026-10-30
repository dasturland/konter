import { describe, it, expect } from 'vitest';
import { buildImpulse } from './engine.js';
import { RECIPES } from './sounds.js';
import { WEAPON_IDS } from '@konter/shared';

function fakeContext() {
  const buffers = [];
  return {
    sampleRate: 8000,
    buffers,
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const b = { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (i) => data[i] };
      buffers.push(b);
      return b;
    },
  };
}

describe('buildImpulse', () => {
  it('creates a stereo noise tail that decays to silence', () => {
    const ctx = fakeContext();
    const buf = buildImpulse(ctx, 1);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(8000);
    const d = buf.getChannelData(0);
    const energy = (from, to) => { let e = 0; for (let i = from; i < to; i++) e += d[i] * d[i]; return e; };
    expect(energy(0, 1000)).toBeGreaterThan(energy(7000, 8000) * 10);
    expect(Math.abs(d[d.length - 1])).toBeLessThan(0.01);
  });
});

describe('sound recipes', () => {
  function recorder() {
    const calls = [];
    const eng = {
      tone: (_out, o) => calls.push(['tone', o]),
      noise: (_out, o) => calls.push(['noise', o]),
    };
    return { eng, calls };
  }

  it('synthesizes a shot for every weapon', () => {
    for (const id of WEAPON_IDS) {
      const { eng, calls } = recorder();
      RECIPES.shot(eng, null, id);
      expect(calls.length).toBeGreaterThan(0);
    }
  });

  it('rings longer on a metal grate than on concrete', () => {
    const metal = recorder();
    const concrete = recorder();
    RECIPES.footstep(metal.eng, null, 'metal');
    RECIPES.footstep(concrete.eng, null, 'concrete');
    const longest = (calls) => Math.max(...calls.map(([, o]) => o.dur));
    expect(longest(metal.calls)).toBeGreaterThan(longest(concrete.calls) * 2);
  });

  it('raises the bomb beep pitch with urgency', () => {
    const calm = recorder();
    const urgent = recorder();
    RECIPES.bombBeep(calm.eng, null, 0);
    RECIPES.bombBeep(urgent.eng, null, 1);
    expect(urgent.calls[0][1].freq).toBeGreaterThan(calm.calls[0][1].freq);
  });

  it('provides every sound the game asks for', () => {
    const needed = ['shot', 'reload', 'dryClick', 'footstep', 'hit', 'headshot', 'death', 'jump', 'land', 'bombBeep', 'plant', 'defuse',
      'explosion', 'roundSignal', 'win', 'cash', 'menuClick', 'denied', 'hurt', 'hitMarker', 'chatBlip'];
    for (const n of needed) expect(typeof RECIPES[n]).toBe('function');
  });
});
