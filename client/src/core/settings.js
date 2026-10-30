// Persistent user settings stored in localStorage, with graphics quality presets.
export const QUALITY_LABELS = { past: 'Past', orta: 'O\'rta', yuqori: 'Yuqori' };

export const QUALITY_PRESETS = {
  past: { shadows: false, shadowMapSize: 0, post: false, bloom: false, maxPixelRatio: 1, fog: true },
  orta: { shadows: true, shadowMapSize: 1024, post: true, bloom: true, maxPixelRatio: 1.25, fog: true },
  yuqori: { shadows: true, shadowMapSize: 2048, post: true, bloom: true, maxPixelRatio: 2, fog: true },
};

export const DEFAULT_SETTINGS = {
  quality: 'orta',
  grain: false,
  sensitivity: 1,
  fov: 75,
  volume: 0.7,
};

const STORAGE_KEY = 'konter.settings.v1';

function sanitize(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if (raw.quality in QUALITY_PRESETS) s.quality = raw.quality;
  if (typeof raw.grain === 'boolean') s.grain = raw.grain;
  if (Number.isFinite(raw.sensitivity)) s.sensitivity = Math.min(5, Math.max(0.1, raw.sensitivity));
  if (Number.isFinite(raw.fov)) s.fov = Math.min(110, Math.max(60, raw.fov));
  if (Number.isFinite(raw.volume)) s.volume = Math.min(1, Math.max(0, raw.volume));
  return s;
}

export class SettingsStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.listeners = new Set();
    let raw = null;
    try {
      raw = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      raw = null;
    }
    this.values = sanitize(raw);
  }

  get(key) {
    return this.values[key];
  }

  get preset() {
    return QUALITY_PRESETS[this.values.quality];
  }

  set(patch) {
    this.values = sanitize({ ...this.values, ...patch });
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Storage may be unavailable (private mode); settings then last for the session only.
    }
    for (const fn of this.listeners) fn(this.values);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
