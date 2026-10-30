// Online lobby: room code and share link, player list, team pick, ready, host controls and chat.
import { DIFFICULTY_IDS, MAX_CHAT_LENGTH, TEAM_SIZE } from '@konter/shared';
import { h, clear } from './dom.js';
import { DIFFICULTY_LABELS, copyText } from './util.js';

export class Lobby {
  /**
   * @param {HTMLElement} parent screens root
   * @param {{net:object, shareLink:(code:string)=>string, audio:object, onLeave:()=>void}} deps
   */
  constructor(parent, { net, shareLink, audio, onLeave }) {
    this.parent = parent;
    this.net = net;
    this.shareLink = shareLink;
    this.audio = audio;
    this.onLeave = onLeave;
    this.data = null;
    this.error = h('div', { class: 'err' });
    this.list = h('div');
    this.controls = h('div', { class: 'row-gap' });
    this.chatLines = h('div', { class: 'lines' });
    this.root = null;
    this.chatHistory = [];
  }

  get mounted() {
    return this.root !== null && this.root.isConnected;
  }

  mount() {
    const code = h('div', { class: 'code' });
    this.codeNode = code;
    this.linkInput = h('input', { class: 'text', type: 'text', readonly: true });
    this.copyCode = h('button', { class: 'btn small', text: 'KODNI NUSXALASH', onClick: () => this.copy(this.data?.room ?? '', this.copyCode, 'KODNI NUSXALASH') });
    this.copyLink = h('button', { class: 'btn small', text: 'HAVOLANI NUSXALASH', onClick: () => this.copy(this.linkInput.value, this.copyLink, 'HAVOLANI NUSXALASH') });
    const chatInput = h('input', { class: 'text', type: 'text', maxlength: String(MAX_CHAT_LENGTH), 'aria-label': 'Xabar yozing' });
    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && chatInput.value.trim()) {
        this.net.chat(chatInput.value.trim());
        chatInput.value = '';
      }
    });
    this.root = h('div', { class: 'screen dim' }, h('div', { class: 'panel', style: { width: 'min(1000px, 96vw)' } },
      h('h2', { text: 'XONA' }),
      h('div', { class: 'lobby' },
        h('div', { class: 'col' },
          h('div', { class: 'code-box' }, code, h('span', { class: 'hint', text: 'Maksimal 10 o\'yinchi' })),
          h('div', { class: 'share' }, this.linkInput, this.copyLink, this.copyCode),
          this.list),
        h('div', { class: 'col' },
          this.controls,
          h('div', { class: 'chat-box' }, this.chatLines, chatInput),
          this.error)),
      h('div', { class: 'row-gap' }, h('button', { class: 'btn danger', text: 'XONADAN CHIQISH', onClick: () => this.onLeave() }))));
    this.parent.replaceChildren(this.root);
    this.chatLines.replaceChildren(...this.chatHistory.map((n) => n.cloneNode(true)));
  }

  async copy(text, button, label) {
    const ok = await copyText(text);
    button.textContent = ok ? 'NUSXALANDI' : 'NUSXALANMADI';
    this.audio.ui('menuClick');
    setTimeout(() => { button.textContent = label; }, 1500);
  }

  showError(text) {
    this.error.textContent = text;
    setTimeout(() => { if (this.error.textContent === text) this.error.textContent = ''; }, 4000);
  }

  addChat(from, team, text) {
    const line = h('div', {}, h('b', { class: team === 'CT' ? 'ct' : team === 'T' ? 't' : '', text: `${from}: ` }), text);
    this.chatHistory.push(line);
    if (this.chatHistory.length > 60) this.chatHistory.shift();
    if (this.mounted) {
      this.chatLines.append(line.cloneNode(true));
      this.chatLines.scrollTop = this.chatLines.scrollHeight;
    }
  }

  clearChat() {
    this.chatHistory = [];
  }

  /** Renders the lobby state sent by the server. */
  update(data) {
    this.data = data;
    if (!this.mounted) this.mount();
    const me = data.players.find((p) => p.id === this.net.id);
    const host = data.host === this.net.id;
    this.codeNode.textContent = data.room;
    this.linkInput.value = this.shareLink(data.room);

    clear(this.list);
    const head = h('tr', {}, ...['Ism', 'Jamoa', 'Tayyor', 'Ping', ''].map((t) => h('th', { text: t })));
    const rows = data.players.map((p) => h('tr', { class: p.id === this.net.id ? 'me' : '' },
      h('td', { text: `${p.name}${p.host ? ' \u2605' : ''}${p.bot ? ' (bot)' : ''}${p.connected ? '' : ' (uzilgan)'}` }),
      h('td', {}, h('span', { class: `badge ${p.team === 'CT' ? 'ct' : 't'}`, text: p.team })),
      h('td', { class: p.ready ? 'ready-yes' : 'ready-no', text: p.ready ? 'Tayyor' : 'Kutmoqda' }),
      h('td', { text: p.bot ? '\u2014' : `${p.ping ?? 0} ms` }),
      h('td', {}, host && p.id !== this.net.id
        ? h('button', {
          class: 'btn small danger', text: p.bot ? 'O\'CHIRISH' : 'HAYDASH',
          onClick: () => (p.bot ? this.net.host('removeBot', { id: p.id }) : this.net.host('kick', { id: p.id })),
        })
        : null)));
    this.list.append(h('table', { class: 'plist' }, h('thead', {}, head), h('tbody', {}, ...rows)));
    this.list.append(h('div', { class: 'hint', style: { marginTop: '8px' }, text: `O'yinchilar: ${data.players.filter((p) => !p.bot).length}. Bo'sh joylar botlar bilan to'ldiriladi (jamoada ${TEAM_SIZE} tadan).` }));

    clear(this.controls);
    const readyBtn = h('button', {
      class: `btn ${me?.ready ? 'on' : 'primary'}`, text: 'TAYYORMAN',
      onClick: () => { this.audio.ui('menuClick'); this.net.ready(!me?.ready); },
    });
    this.controls.append(
      h('div', { class: 'seg' },
        this.small('CT', () => this.net.team('CT'), me?.team === 'CT'),
        this.small('T', () => this.net.team('T'), me?.team === 'T'),
        this.small('AVTO-BALANS', () => this.net.team('auto'), false)));
    if (!host) this.controls.append(readyBtn);
    if (host) {
      const diff = h('div', { class: 'seg' }, ...DIFFICULTY_IDS.map((id) =>
        this.small(DIFFICULTY_LABELS[id], () => this.net.host('difficulty', { value: id }), data.difficulty === id)));
      this.controls.append(
        h('div', { style: { width: '100%' }, class: 'hint', text: 'Bot qo\'shish / olib tashlash' }),
        h('div', { class: 'seg' },
          this.small('+ BOT (CT)', () => this.net.host('addBot', { team: 'CT' }), false),
          this.small('+ BOT (T)', () => this.net.host('addBot', { team: 'T' }), false),
          this.small('\u2212 BOT', () => this.net.host('removeBot'), false)),
        h('div', { style: { width: '100%' }, class: 'hint', text: 'Qiyinlik' }),
        diff,
        h('button', { class: 'btn primary', style: { width: '100%' }, text: 'O\'YINNI BOSHLASH', onClick: () => { this.audio.ui('menuClick'); this.net.host('start'); } }));
    }
  }

  small(label, onClick, on) {
    return h('button', { class: `btn small${on ? ' on' : ''}`, text: label, onClick: () => { this.audio.ui('menuClick'); onClick(); } });
  }
}
