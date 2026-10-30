// In-game HUD: minimalist white thin text, crosshair, kill feed, bomb timer, damage feedback.
import { MAX_HEALTH, TEAM_SIZE, getWeapon, MAP, siteAt, DEFUSE_RANGE, PLANT_TIME } from '@konter/shared';
import { h, icon, clear, retrigger } from './dom.js';
import { formatTime, formatMoney } from './util.js';
import { Radar } from './radar.js';

const KILL_FEED_MS = 5500;
const MAX_KILLS_SHOWN = 5;
const CROSSHAIR_BASE = 5;

/** Counts a number in a text node and plays a pop animation whenever the value changes. */
class PopNumber {
  constructor(node, format = (v) => String(v)) {
    this.node = node;
    this.format = format;
    this.value = null;
  }

  set(value) {
    if (value === this.value) return false;
    const first = this.value === null;
    this.value = value;
    this.node.textContent = this.format(value);
    if (!first) retrigger(this.node, 'pop');
    return !first;
  }
}

export class Hud {
  /**
   * @param {HTMLElement} parent container for the HUD
   * @param {{onPause:()=>void}} hooks
   */
  constructor(parent, { onPause }) {
    this.root = h('div', { id: 'hud', class: 'hidden' });
    parent.append(this.root);

    // Health and armor, top left.
    this.healthNum = h('span', { class: 'hud-num' });
    this.healthBar = h('i');
    this.armorNum = h('span', { class: 'hud-num', style: { fontSize: '22px' } });
    this.armorBar = h('i');
    this.healthBox = h('div', { id: 'hud-health', class: 'hud-block' },
      h('div', { class: 'row' }, icon('medkit', 26), this.healthNum, h('span', { class: 'hud-sub', text: `/ ${MAX_HEALTH}` })),
      h('div', { class: 'bar' }, this.healthBar),
      this.armorRow = h('div', { id: 'hud-armor', class: 'row hidden' },
        icon('shield', 20), this.armorNum, h('div', { class: 'bar', style: { width: '110px' } }, this.armorBar)));

    // Top centre: enemies, clock, score, bomb timer.
    this.enemies = h('div', { class: 'enemies' });
    this.clock = h('div', { class: 'clock' });
    this.score = h('div', { class: 'score' });
    this.bombTimer = h('span');
    this.bombBox = h('div', { id: 'hud-bomb', class: 'hidden' }, icon('bomb', 24), h('span', { text: 'BOMBA' }), this.bombTimer);
    this.top = h('div', { id: 'hud-top' }, this.enemies, this.clock, this.score, this.bombBox);

    // Ammo and pause, top right.
    this.ammoMag = h('span', { class: 'hud-num' });
    this.ammoReserve = h('span', { class: 'hud-sub' });
    this.ammoBox = h('div', { id: 'hud-ammo', class: 'hud-block' }, icon('bullet', 24), this.ammoMag, this.ammoReserve);
    this.weaponName = h('div', { id: 'hud-weapon' });
    this.pauseBtn = h('div', { id: 'hud-pause', onClick: onPause }, icon('pause', 18), h('span', { text: 'PAUZA' }));

    // Crosshair parts.
    this.cross = h('div', { id: 'crosshair' }, h('i', { class: 'l' }), h('i', { class: 'r' }), h('i', { class: 'u' }), h('i', { class: 'd' }));
    this.hitmarker = h('div', { id: 'hitmarker' }, h('i'), h('i'), h('i'), h('i'));
    this.crossGap = CROSSHAIR_BASE;

    // Bottom: money and bomb icon.
    this.moneyNode = h('span');
    this.moneyBox = h('div', { id: 'hud-money' }, this.moneyNode);
    this.bombIcon = h('div', { id: 'hud-bombicon' }, icon('bomb', 26));
    this.kitIcon = h('div', { id: 'hud-kit', class: 'hidden', style: { color: 'var(--ct)' } }, icon('kit', 24));
    this.bottom = h('div', { id: 'hud-bottom' }, this.moneyBox, this.bombIcon, this.kitIcon);

    this.radar = new Radar();
    this.killfeed = h('div', { id: 'killfeed' });
    this.vignette = h('div', { id: 'vignette' });
    this.damageDir = h('div', { id: 'damage-dir' });
    this.banner = h('div', { id: 'round-banner' }, h('div', { class: 'big' }), h('div', { class: 'small' }));
    this.prompt = h('div', { id: 'hud-prompt', class: 'hidden' });
    this.toastNode = h('div', { id: 'hud-toast' });
    this.spectate = h('div', { id: 'hud-spectate', class: 'hidden' });

    this.root.append(
      this.vignette, this.damageDir, this.healthBox, this.top, this.ammoBox, this.weaponName, this.pauseBtn, this.cross,
      this.hitmarker, this.bottom, this.radar.element, this.killfeed, this.banner, this.prompt, this.toastNode,
      this.spectate,
    );

    this.pHealth = new PopNumber(this.healthNum);
    this.pArmor = new PopNumber(this.armorNum);
    this.pMag = new PopNumber(this.ammoMag);
    this.pMoney = new PopNumber(this.moneyNode, formatMoney);
    this.lastMoney = null;
    this.toastTimer = 0;
    this.hitTimer = 0;
    this.vignetteTimer = 0;
    this.kills = [];
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  /** Resets per match state (kill feed, money tracking). */
  reset() {
    this.lastMoney = null;
    this.pHealth.value = null;
    this.pMoney.value = null;
    this.pMag.value = null;
    this.pArmor.value = null;
    clear(this.killfeed);
    this.kills = [];
    this.radar.reset();
  }

  toast(text, bad = false) {
    this.toastNode.textContent = text;
    this.toastNode.classList.toggle('bad', bad);
    this.toastNode.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastNode.classList.remove('on'), 2200);
  }

  showRound(round, subtitle = 'Xarid vaqti: B') {
    this.banner.firstChild.textContent = `RAUND ${round}`;
    this.banner.lastChild.textContent = subtitle;
    retrigger(this.banner, 'on');
  }

  hitMarker(headshot) {
    this.hitmarker.classList.toggle('head', headshot);
    this.hitmarker.classList.add('on');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.hitmarker.classList.remove('on'), 60);
  }

  /** Shows the red vignette and a wedge pointing to where the damage came from (angle in radians, 0 = ahead). */
  damage(amount, angle = null) {
    this.vignette.classList.add('on');
    this.vignette.style.opacity = String(Math.min(1, 0.35 + amount / 50));
    clearTimeout(this.vignetteTimer);
    this.vignetteTimer = setTimeout(() => { this.vignette.classList.remove('on'); this.vignette.style.opacity = ''; }, 90);
    if (angle === null) return;
    const wedge = h('i', { style: { transform: `rotate(${angle}rad)` } });
    this.damageDir.append(wedge);
    void wedge.offsetWidth;
    wedge.classList.add('on');
    setTimeout(() => wedge.classList.remove('on'), 80);
    setTimeout(() => wedge.remove(), 1000);
  }

  killEntry(e, byId, localId) {
    const killer = e.killer ? byId.get(e.killer) : null;
    const victim = byId.get(e.victim);
    if (!victim) return;
    const weapon = getWeapon(e.weapon);
    const name = (p) => h('span', { class: p.team === 'CT' ? 'ct' : 't', text: p.name });
    const row = h('div', { class: `kill${e.killer === localId || e.victim === localId ? ' me' : ''}` },
      killer ? name(killer) : h('span', { text: 'Bomba' }),
      h('span', { class: 'w', text: weapon ? weapon.name : '' }),
      e.headshot ? h('span', { class: 'hs', text: 'BOSH' }) : null,
      name(victim));
    this.killfeed.append(row);
    this.kills.push({ row, born: performance.now() });
    while (this.kills.length > MAX_KILLS_SHOWN) this.kills.shift().row.remove();
  }

  /** Per frame update. `ctx`: { snap, me, localId, view, yaw, gap, spectating, canPlant } */
  update(dt, ctx) {
    const { snap, me } = ctx;
    if (!snap || !me) return;
    const health = Math.max(0, Math.round(me.health));
    this.pHealth.set(health);
    this.healthBar.style.width = `${Math.min(100, (health / MAX_HEALTH) * 100)}%`;
    this.healthBox.classList.toggle('low', health > 0 && health <= 30);
    this.armorRow.classList.toggle('hidden', me.armor <= 0);
    this.pArmor.set(Math.round(me.armor));
    this.armorBar.style.width = `${Math.min(100, me.armor)}%`;

    const weapon = getWeapon(me.weapon);
    const melee = !weapon || weapon.category === 'knife' || weapon.category === 'grenade';
    this.ammoBox.classList.toggle('hidden', melee);
    this.weaponName.textContent = weapon ? weapon.name : '';
    if (!melee) {
      this.pMag.set(me.mag);
      this.ammoReserve.textContent = `/ ${me.reserve}`;
      this.ammoMag.style.color = me.mag === 0 ? 'var(--danger)' : '';
    }

    const foes = snap.players.filter((p) => p.team !== me.team);
    const alive = foes.filter((p) => p.alive).length;
    this.enemies.textContent = `Dushmanlar: ${alive} / ${Math.max(foes.length, TEAM_SIZE)}`;
    const planted = snap.bomb.state === 'planted';
    this.clock.textContent = snap.phase === 'matchEnd' ? '0:00' : formatTime(planted ? Math.max(0, snap.timer) : snap.timer);
    this.score.replaceChildren(
      h('span', { class: 'ct', text: 'CT' }), ` ${snap.score.CT} \u2014 ${snap.score.T} `, h('span', { class: 't', text: 'T' }));
    this.bombBox.classList.toggle('hidden', !planted);
    if (planted) {
      this.bombTimer.textContent = formatTime(snap.bomb.timer);
      this.bombBox.classList.toggle('urgent', snap.bomb.timer <= 10);
    }

    // Money with a floating +$ / -$ label.
    this.pMoney.set(me.money);
    if (this.lastMoney !== null && me.money !== this.lastMoney) this.floatMoney(me.money - this.lastMoney);
    this.lastMoney = me.money;
    this.bombIcon.classList.toggle('on', !!me.bombCarrier && me.alive);
    this.kitIcon.classList.toggle('hidden', !me.kit);

    // Crosshair: spread in pixels from the game (movement and shooting).
    const target = CROSSHAIR_BASE + ctx.gap;
    this.crossGap += (target - this.crossGap) * Math.min(1, dt * 18);
    const g = this.crossGap;
    const [l, r, u, d] = this.cross.children;
    l.style.transform = `translateX(${-(g + 9)}px)`;
    r.style.transform = `translateX(${g}px)`;
    u.style.transform = `translateY(${-(g + 9)}px)`;
    d.style.transform = `translateY(${g}px)`;
    this.cross.classList.toggle('off', !me.alive || ctx.scoped || !!ctx.spectating);

    this.updatePrompt(snap, me);
    this.spectate.classList.toggle('hidden', !ctx.spectating);
    if (ctx.spectating) this.spectate.textContent = `Kuzatilmoqda: ${ctx.spectating}   (\u2190 \u2192)`;

    this.radar.draw(snap, ctx);
    this.expireKills();
  }

  floatMoney(delta) {
    const label = h('span', { class: `float-money${delta < 0 ? ' neg' : ''}`, text: `${delta > 0 ? '+' : '-'}$${Math.abs(delta)}` });
    this.moneyBox.append(label);
    setTimeout(() => label.remove(), 1400);
  }

  updatePrompt(snap, me) {
    const b = snap.bomb;
    let text = '';
    let progress = -1;
    if (me.alive && me.team === 'T' && me.bombCarrier && snap.phase === 'live' && b.state === 'idle' && siteAt(MAP, me.x, me.z)) {
      text = 'E (ushlab turing) \u2014 bombani o\'rnatish';
    }
    if (b.state === 'planting' && me.bombCarrier && me.alive) {
      text = 'Bomba o\'rnatilmoqda...';
      progress = b.plant / PLANT_TIME;
    }
    if (me.alive && me.team === 'CT' && b.state === 'planted' && b.pos) {
      const near = Math.hypot(me.x - b.pos[0], me.z - b.pos[1]) <= DEFUSE_RANGE;
      if (b.defuse > 0 && near) {
        text = 'Bomba zararsizlantirilmoqda...';
        progress = b.defuse / Math.max(0.01, b.defuseNeeded);
      } else if (near) {
        text = 'E (ushlab turing) \u2014 bombani zararsizlantirish';
      }
    }
    this.prompt.classList.toggle('hidden', !text);
    if (!text) return;
    clear(this.prompt);
    this.prompt.append(text);
    if (progress >= 0) {
      const fill = h('i');
      fill.style.width = `${Math.min(100, progress * 100)}%`;
      this.prompt.append(h('div', { class: 'bar' }, fill));
    }
  }

  expireKills() {
    const now = performance.now();
    while (this.kills.length && now - this.kills[0].born > KILL_FEED_MS) {
      const { row } = this.kills.shift();
      row.classList.add('fade');
      setTimeout(() => row.remove(), 650);
    }
  }
}
