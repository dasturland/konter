// In-game chat: fading message log and an input opened with T.
import { MAX_CHAT_LENGTH } from '@konter/shared';
import { h } from './dom.js';

const LINE_MS = 9000;
const MAX_LINES = 7;

export class Chat {
  /**
   * @param {HTMLElement} parent
   * @param {{send:(text:string)=>void, onOpen:()=>void, onClose:()=>void}} hooks
   */
  constructor(parent, { send, onOpen, onClose }) {
    this.send = send;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.log = h('div', { id: 'chat-log' });
    this.input = h('input', { id: 'chat-input', class: 'hidden', type: 'text', maxlength: String(MAX_CHAT_LENGTH), autocomplete: 'off', 'aria-label': 'Xabar yozing va Enter bosing' });
    parent.append(this.log, this.input);
    this.isOpen = false;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (text) this.send(text);
        this.close();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.value = '';
    this.input.classList.remove('hidden');
    this.onOpen();
    this.input.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.input.classList.add('hidden');
    this.input.blur();
    this.onClose();
  }

  clear() {
    this.log.replaceChildren();
  }

  /** Adds a message. `team` colours the sender name. */
  add(from, team, text) {
    const line = h('div', { class: 'line' }, h('b', { class: team === 'CT' ? 'ct' : team === 'T' ? 't' : '', text: `${from}: ` }), text);
    this.log.append(line);
    while (this.log.children.length > MAX_LINES) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), LINE_MS);
    setTimeout(() => line.remove(), LINE_MS + 900);
  }
}
