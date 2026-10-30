import { describe, it, expect } from 'vitest';
import { SettingsStore, QUALITY_PRESETS } from './settings.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
}

describe('SettingsStore', () => {
  it('starts with defaults and grain off', () => {
    const s = new SettingsStore(memoryStorage());
    expect(s.get('quality')).toBe('orta');
    expect(s.get('grain')).toBe(false);
  });

  it('persists and sanitizes values', () => {
    const storage = memoryStorage();
    const s = new SettingsStore(storage);
    s.set({ quality: 'yuqori', fov: 500, sensitivity: -3 });
    expect(s.get('quality')).toBe('yuqori');
    expect(s.get('fov')).toBe(110);
    expect(s.get('sensitivity')).toBe(0.1);
    expect(new SettingsStore(storage).get('quality')).toBe('yuqori');
  });

  it('ignores unknown quality ids', () => {
    const s = new SettingsStore(memoryStorage());
    s.set({ quality: 'ultra' });
    expect(s.get('quality')).toBe('orta');
  });

  it('low quality disables shadows and post-processing', () => {
    expect(QUALITY_PRESETS.past.shadows).toBe(false);
    expect(QUALITY_PRESETS.past.post).toBe(false);
  });
});
