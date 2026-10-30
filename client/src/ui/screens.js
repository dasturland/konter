// Full screen menus: main menu, solo setup, settings, room entry, pause, round result and winner.
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH, DIFFICULTY_IDS, normalizeRoomCode } from '@konter/shared';
import { QUALITY_LABELS } from '../core/settings.js';
import { h } from './dom.js';
import { DIFFICULTY_LABELS, formatMoney, reasonText } from './util.js';

export class Screens {
  /**
   * @param {HTMLElement} parent
   * @param {{settings:object, audio:object}} deps
   */
  constructor(parent, { settings, audio }) {
    this.settings = settings;
    this.audio = audio;
    this.root = h('div', { id: 'screens' });
    parent.append(this.root);
    this.result = h('div', { id: 'round-result', class: 'hidden' });
    parent.append(this.result);
    this.current = null;
  }

  clickSound() {
    this.audio.ui('menuClick');
  }

  /** Builds a button that plays the menu sound. */
  button(label, onClick, cls = '') {
    return h('button', {
      class: `btn ${cls}`.trim(), text: label,
      onClick: () => { this.clickSound(); onClick(); },
      onMouseenter: () => this.audio.ui('menuHover'),
    });
  }

  mount(node) {
    this.root.replaceChildren(node);
    this.root.classList.remove('hidden');
    this.current = node;
  }

  hide() {
    this.root.replaceChildren();
    this.current = null;
  }

  get isOpen() {
    return this.current !== null;
  }

  showMain({ onSolo, onCreate, onJoin, onSettings }) {
    this.mount(h('div', { class: 'screen menu' },
      h('h1', { class: 'title', text: 'KONTR-STRAYK 3D' }),
      h('div', { class: 'subtitle', text: 'BUNKERDA TAKTIK JANG' }),
      h('div', { class: 'btns' },
        this.button('YAKKAXON', onSolo, 'primary'),
        this.button('XONA YARATISH', onCreate),
        this.button('XONAGA QO\'SHILISH', onJoin),
        this.button('SOZLAMALAR', onSettings)),
      h('div', { class: 'menu-bg-note', text: 'M \u2014 ovozni o\'chirish   B \u2014 xarid   TAB \u2014 hisob   T \u2014 chat' })));
  }

  showSolo({ onStart, onBack }) {
    let difficulty = 'orta';
    let team = 'CT';
    const diffBtns = new Map();
    const teamBtns = new Map();
    const refresh = () => {
      for (const [id, b] of diffBtns) b.classList.toggle('on', id === difficulty);
      for (const [id, b] of teamBtns) b.classList.toggle('on', id === team);
    };
    const seg = (map, ids, labels, set) => h('div', { class: 'seg' }, ...ids.map((id) => {
      const b = this.button(labels[id], () => { set(id); refresh(); }, 'small');
      map.set(id, b);
      return b;
    }));
    const diffSeg = seg(diffBtns, DIFFICULTY_IDS, DIFFICULTY_LABELS, (v) => { difficulty = v; });
    const teamSeg = seg(teamBtns, ['CT', 'T'], { CT: 'CT (Himoyachi)', T: 'T (Hujumchi)' }, (v) => { team = v; });
    refresh();
    this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
      h('h2', { text: 'YAKKAXON' }),
      h('div', { class: 'field' }, h('span', { text: 'Qiyinlik' }), diffSeg),
      h('div', { class: 'field' }, h('span', { text: 'Jamoa' }), teamSeg),
      h('div', { class: 'row-gap' },
        this.button('BOSHLASH', () => onStart({ difficulty, team }), 'primary'),
        this.button('ORQAGA', onBack)))));
  }

  showSettings({ onBack }) {
    const s = this.settings;
    const slider = (label, key, min, max, step, fmt) => {
      const val = h('span', { class: 'val', text: fmt(s.get(key)) });
      const input = h('input', { type: 'range', min, max, step, value: s.get(key) });
      input.addEventListener('input', () => {
        s.set({ [key]: Number(input.value) });
        val.textContent = fmt(s.get(key));
      });
      return h('div', { class: 'field' }, h('span', { text: label }), h('div', { class: 'row-gap', style: { margin: 0 } }, input, val));
    };
    const qualityButtons = new Map();
    const markQuality = () => qualityButtons.forEach((b, id) => b.classList.toggle('on', s.get('quality') === id));
    const quality = h('div', { class: 'seg' }, ...Object.keys(QUALITY_LABELS).map((id) => {
      const b = this.button(QUALITY_LABELS[id], () => { s.set({ quality: id }); markQuality(); }, 'small');
      qualityButtons.set(id, b);
      return b;
    }));
    markQuality();
    const toggle = (key) => {
      const b = this.button('', () => { s.set({ [key]: !s.get(key) }); paint(); }, 'small');
      const paint = () => { b.textContent = s.get(key) ? 'YOQILGAN' : 'O\'CHIRILGAN'; b.classList.toggle('on', s.get(key)); };
      paint();
      return b;
    };
    this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
      h('h2', { text: 'SOZLAMALAR' }),
      slider('Sichqoncha sezgirligi', 'sensitivity', 0.1, 5, 0.1, (v) => v.toFixed(1)),
      slider('Ko\'rish burchagi (FOV)', 'fov', 60, 110, 1, (v) => String(Math.round(v))),
      slider('Ovoz balandligi', 'volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
      h('div', { class: 'field' }, h('span', { text: 'Grafika sifati' }), quality),
      h('div', { class: 'field' }, h('span', { text: 'Post-ishlov (yorug\'lik, vinyetka)' }), toggle('post')),
      h('div', { class: 'field' }, h('span', { text: 'Kino shovqini' }), toggle('grain')),
      h('div', { class: 'row-gap' }, this.button('ORQAGA', onBack)))));
  }

  /**
   * Name (and room code) entry shown before creating or joining a room.
   * @param {{mode:'create'|'join', name:string, code?:string, error?:string, onSubmit:(name:string, code:string)=>void, onBack:()=>void}} opts
   */
  showEntry({ mode, name, code = '', error = '', onSubmit, onBack }) {
    const nameInput = h('input', { class: 'text', type: 'text', maxlength: String(MAX_NAME_LENGTH), value: name, 'aria-label': 'Ismingiz' });
    const codeInput = h('input', {
      class: 'text', type: 'text', maxlength: String(ROOM_CODE_LENGTH), value: code, 'aria-label': 'Xona kodi',
      style: { textTransform: 'uppercase', letterSpacing: '8px', fontSize: '24px', textAlign: 'center' },
    });
    const err = h('div', { class: 'err', text: error });
    const submit = () => {
      const n = nameInput.value.trim();
      const c = normalizeRoomCode(codeInput.value);
      if (!n) { err.textContent = 'Ismingizni kiriting'; return; }
      if (mode === 'join' && c.length !== ROOM_CODE_LENGTH) { err.textContent = `Xona kodi ${ROOM_CODE_LENGTH} belgidan iborat`; return; }
      onSubmit(n, mode === 'join' ? c : '');
    };
    for (const el of [nameInput, codeInput]) {
      el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); });
    }
    this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
      h('h2', { text: mode === 'create' ? 'XONA YARATISH' : 'XONAGA QO\'SHILISH' }),
      h('div', { class: 'hint', text: 'Ismingiz' }),
      h('div', { class: 'field' }, nameInput),
      mode === 'join' ? h('div', { class: 'hint', text: `Xona kodi (${ROOM_CODE_LENGTH} belgi)` }) : null,
      mode === 'join' ? h('div', { class: 'field' }, codeInput) : h('div', { class: 'hint', text: 'Xona uchun 5 belgili kod yaratiladi. Maksimal 10 o\'yinchi.' }),
      err,
      h('div', { class: 'row-gap' },
        this.button(mode === 'create' ? 'YARATISH' : 'QO\'SHILISH', submit, 'primary'),
        this.button('ORQAGA', onBack)))));
    (mode === 'join' && name ? codeInput : nameInput).focus();
  }

  showPause({ online, onResume, onSettings, onMenu }) {
    this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
      h('h2', { text: 'PAUZA' }),
      h('div', { class: 'btns', style: { width: '100%' } },
        this.button('DAVOM ETISH', onResume, 'primary'),
        this.button('SOZLAMALAR', onSettings),
        this.button(online ? 'XONADAN CHIQISH' : 'MENYUGA CHIQISH', onMenu, 'danger')),
      online ? h('div', { class: 'hint', style: { marginTop: '14px' }, text: 'Onlayn o\'yin pauza qilinmaydi.' }) : null)));
  }

  /** Banner shown during the pause between rounds. */
  showRoundResult({ winner, reason, reward, score, myTeam }) {
    const won = winner === myTeam;
    this.result.replaceChildren(h('div', { class: 'result' },
      h('div', { class: 'head', style: { color: won ? 'var(--accent)' : 'var(--danger)' }, text: won ? 'RAUND YUTILDI' : 'RAUND YUTQAZILDI' }),
      h('div', { class: 'reason', text: `${winner === 'CT' ? 'CT' : 'T'} g'alaba qozondi \u2014 ${reasonText(reason)}` }),
      reward === null ? null : h('div', { class: 'reward', text: `Mukofot: +${formatMoney(reward)}` }),
      h('div', { class: 'score' },
        h('span', { class: 'ct', text: 'CT' }), ` ${score.CT} \u2014 ${score.T} `, h('span', { class: 't', text: 'T' }))));
    this.result.classList.remove('hidden');
  }

  hideRoundResult() {
    this.result.replaceChildren();
    this.result.classList.add('hidden');
  }

  /** Match winner screen with the final table. */
  showWinner({ winner, myTeam, score, players, onReplay, onMenu }) {
    const draw = winner === null;
    const won = winner === myTeam;
    const rows = [...players].sort((a, b) => b.kills - a.kills).map((p) => h('tr', {},
      h('td', { class: p.team === 'CT' ? 'ct' : 't', text: p.name }),
      h('td', { text: p.team }), h('td', { text: String(p.kills) }), h('td', { text: String(p.deaths) })));
    this.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel winner', style: { width: 'min(720px, 94vw)' } },
      h('h1', { style: { color: draw ? '#fff' : won ? 'var(--accent)' : 'var(--danger)' }, text: draw ? 'DURANG' : won ? 'G\'ALABA' : 'MAGLUBIYAT' }),
      h('div', { class: 'result' }, h('div', { class: 'reason', text: draw ? 'Hisob teng' : `${winner === 'CT' ? 'Himoyachilar (CT)' : 'Hujumchilar (T)'} yutdi` }),
        h('div', { class: 'score' }, h('span', { class: 'ct', text: 'CT' }), ` ${score.CT} \u2014 ${score.T} `, h('span', { class: 't', text: 'T' }))),
      h('table', {}, h('thead', {}, h('tr', {}, ...['O\'yinchi', 'Jamoa', 'O\'ldirish', 'O\'lim'].map((t) => h('th', { text: t })))), h('tbody', {}, ...rows)),
      h('div', { class: 'row-gap', style: { justifyContent: 'center' } },
        this.button('Qayta o\'ynash', onReplay, 'primary'),
        this.button('Menyu', onMenu)))));
  }
}
