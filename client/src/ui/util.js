// Formatting helpers shared by the UI modules.
export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatMoney(value) {
  return `$${Math.max(0, Math.round(value))}`;
}

export const DIFFICULTY_LABELS = { oson: 'Oson', orta: 'O\'rta', qiyin: 'Qiyin' };

export const CATEGORY_TITLES = {
  pistol: 'Pistoletlar',
  automat: 'Avtomatlar',
  sniper: 'Snayper',
  grenade: 'Granatalar',
  equipment: 'Jihozlar',
};

/** Groups the weapon categories of the shared table into buy menu tabs. */
export function menuCategory(weapon) {
  switch (weapon.category) {
    case 'rifle':
    case 'smg':
      return 'automat';
    default:
      return weapon.category;
  }
}

export const REASON_TITLES = {
  eliminated: 'Raqiblar yo\'q qilindi',
  time: 'Vaqt tugadi',
  exploded: 'Bomba portladi',
  defused: 'Bomba zararsizlantirildi',
};

export function reasonText(reason) {
  return REASON_TITLES[reason] ?? '';
}

/** Copies text to the clipboard. Falls back to a hidden textarea when the async API is missing. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
