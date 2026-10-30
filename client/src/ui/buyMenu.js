// Buy menu opened with B: categories, animated cards, red when the player cannot afford an item.
import { buyList } from '@konter/shared';
import { h, clear, icon } from './dom.js';
import { CATEGORY_TITLES, menuCategory, formatMoney } from './util.js';

const ORDER = ['pistol', 'automat', 'sniper', 'grenade', 'equipment'];

function statLines(w) {
  if (w.category === 'grenade') return [w.id === 'he' ? `Zarar: ${w.damage}` : `Ta'sir: ${w.effectDuration || 0} s`, `Ko'pi bilan: ${w.maxCarry}`];
  if (w.slot === 'armor') return [`Himoya: ${w.armorValue}`];
  if (w.slot === 'kit') return ['Zararsizlantirish 2 barobar tez'];
  return [`Zarar: ${w.damage}`, `Tezlik: ${w.fireRate} / s`, `O'q: ${w.mag} / ${w.reserve}`];
}

export class BuyMenu {
  /**
   * @param {HTMLElement} parent
   * @param {{buy:(id:string)=>({ok:boolean,reason?:string,pending?:boolean}), onClose:()=>void, audio:object, toast:(t:string,bad:boolean)=>void}} hooks
   */
  constructor(parent, { buy, onClose, audio, toast }) {
    this.buy = buy;
    this.onClose = onClose;
    this.audio = audio;
    this.toast = toast;
    this.cash = h('div', { class: 'cash' });
    this.tabs = h('div', { class: 'tabs' });
    this.grid = h('div', { class: 'grid' });
    this.foot = h('div', { class: 'foot' });
    this.box = h('div', { class: 'box' },
      h('div', { class: 'top' }, h('h2', { text: 'XARID MENYUSI' }), this.cash),
      this.tabs, this.grid, this.foot);
    this.root = h('div', { id: 'buy', class: 'hidden', onClick: (e) => { if (e.target === this.root) this.close(); } }, this.box);
    parent.append(this.root);
    this.isOpen = false;
    this.category = 'automat';
    this.state = null;
  }

  open(state) {
    this.state = state;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.root.classList.toggle('t-side', state.me.team === 'T');
    this.render();
    requestAnimationFrame(() => this.root.classList.add('open'));
  }

  hide() {
    this.isOpen = false;
    this.root.classList.remove('open');
    this.root.classList.add('hidden');
  }

  close() {
    if (!this.isOpen) return;
    this.hide();
    this.onClose();
  }

  /** Called every frame while open so money and ownership stay current. */
  refresh(state) {
    if (!this.isOpen) return;
    const money = state.me.money;
    const owned = this.ownedKey(state.me);
    const prev = this.state;
    this.state = state;
    if (prev && prev.me.money === money && this.lastOwned === owned && prev.open === state.open) return;
    this.render(false);
  }

  ownedKey(me) {
    return `${me.primary}|${me.secondary}|${me.armor}|${me.kit}|${JSON.stringify(me.grenades)}`;
  }

  isOwned(me, w) {
    switch (w.slot) {
      case 'primary': return me.primary === w.id;
      case 'secondary': return me.secondary === w.id;
      case 'grenade': return (me.grenades?.[w.id] ?? 0) >= w.maxCarry;
      case 'armor': return me.armor >= 100;
      case 'kit': return me.kit;
      default: return false;
    }
  }

  render(animate = true) {
    const { me, open } = this.state;
    this.lastOwned = this.ownedKey(me);
    this.cash.textContent = formatMoney(me.money);
    clear(this.tabs);
    for (const c of ORDER) {
      this.tabs.append(h('button', {
        class: `tab${c === this.category ? ' on' : ''}`, text: CATEGORY_TITLES[c],
        onClick: () => { this.category = c; this.audio.ui('menuClick'); this.render(); },
      }));
    }
    clear(this.grid);
    const items = buyList(me.team).filter((w) => menuCategory(w) === this.category);
    items.forEach((w, i) => {
      const poor = me.money < w.price;
      const owned = this.isOwned(me, w);
      const card = h('button', {
        class: `card${poor ? ' poor' : ''}${owned ? ' owned' : ''}`,
        style: animate ? { animationDelay: `${i * 45}ms` } : { animation: 'none' },
        onClick: () => this.tryBuy(w, card),
        onMouseenter: () => this.audio.ui('menuHover'),
      },
      h('div', { class: 'name', text: w.name }),
      h('div', { class: 'price', text: formatMoney(w.price) }),
      h('div', { class: 'stats' }, ...statLines(w).map((t) => h('div', { text: t }))),
      owned ? h('div', { class: 'stats', text: 'Sizda bor' }) : null);
      this.grid.append(card);
    });
    clear(this.foot);
    this.foot.append(
      h('span', { text: 'B yoki ESC \u2014 yopish' }),
      open ? h('span', { text: 'Xarid vaqti ochiq' }) : h('span', { class: 'closed', text: 'Xarid vaqti tugagan' }),
      h('span', {}, icon('crosshair', 14)),
    );
  }

  tryBuy(w, card) {
    const { me, open } = this.state;
    let failure = '';
    if (!open) failure = 'Xarid vaqti tugagan';
    else if (!me.alive) failure = 'O\'lik o\'yinchi xarid qila olmaydi';
    else if (this.isOwned(me, w)) failure = 'Bu buyum allaqachon bor';
    else if (me.money < w.price) failure = 'Pul yetarli emas';
    if (failure) {
      this.deny(card, failure);
      return;
    }
    const res = this.buy(w.id);
    if (res.ok) this.audio.ui('cash');
    else this.deny(card, res.reason || 'Xarid amalga oshmadi');
  }

  /** Shows a refusal: shake the card, play the denied sound. */
  deny(card, text) {
    if (card) {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
    this.audio.ui('denied');
    this.toast(text, true);
  }
}
