// Application controller: menus, lobby, HUD, audio and the game session, wired together.
import { SettingsStore } from '../core/settings.js';
import { Game } from '../core/game.js';
import { GameAudio } from '../audio/gameAudio.js';
import { NetClient, roomFromUrl, shareLink } from '../net/client.js';
import { h } from './dom.js';
import { Hud } from './hud.js';
import { Scoreboard } from './scoreboard.js';
import { Chat } from './chat.js';
import { BuyMenu } from './buyMenu.js';
import { Screens } from './screens.js';
import { Lobby } from './lobby.js';

const NAME_KEY = 'konter.name.v1';
const SCOREBOARD_INTERVAL = 0.25;
const WINNER_DELAY_MS = 1800;

const MODE_MENU = 'menu';
const MODE_SOLO = 'solo';
const MODE_LOBBY = 'lobby';
const MODE_ONLINE = 'online';

function loadName() {
  try {
    return globalThis.localStorage?.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name) {
  try {
    globalThis.localStorage?.setItem(NAME_KEY, name);
  } catch {
    // The name simply is not remembered when storage is unavailable.
  }
}

export class App {
  constructor() {
    this.settings = new SettingsStore();
    this.audio = new GameAudio(this.settings);
    this.mode = MODE_MENU;
    this.net = null;
    this.lobby = null;
    this.soloOptions = null;
    this.expectUnlock = false;
    this.matchOver = false;
    this.winnerTimer = 0;
    this.noticeTimer = 0;
    this.lastRound = -1;
    this.lastPhase = '';
    this.lastCtx = null;
    this.boardClock = 0;

    const uiRoot = document.getElementById('ui');
    this.ui = uiRoot;
    this.hud = new Hud(uiRoot, { onPause: () => this.openPause() });
    this.scoreboard = new Scoreboard(uiRoot);
    this.chat = new Chat(uiRoot, {
      send: (text) => this.net?.chat(text),
      onOpen: () => {},
      onClose: () => {},
    });
    this.buy = new BuyMenu(uiRoot, {
      buy: (id) => this.game.session.buy(id),
      onClose: () => this.afterBuyClose(),
      audio: this.audio,
      toast: (text, bad) => this.hud.toast(text, bad),
    });
    this.screens = new Screens(uiRoot, { settings: this.settings, audio: this.audio });
    this.noticeNode = h('div', { class: 'notice hidden' });
    uiRoot.append(this.noticeNode);

    this.game = new Game(document.getElementById('app'), this.settings, {
      events: (events, snap, me) => this.onEvents(events, snap, me),
      frame: (dt, ctx) => this.onFrame(dt, ctx),
    });
    this.bindInput();
  }

  start() {
    this.game.enterMenu();
    const code = roomFromUrl();
    if (code) this.showEntry('join', code);
    else this.openMain();
  }

  // ---- input wiring ----------------------------------------------------------------------

  bindInput() {
    const unlockAudio = () => this.audio.unlock();
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    const input = this.game.input;
    input.on('lock', () => {
      if (this.playing && !this.matchOver) {
        this.screens.hide();
        this.game.session?.setPaused?.(false);
      }
    });
    input.on('unlock', () => {
      if (this.expectUnlock) { this.expectUnlock = false; return; }
      if (!this.playing || this.matchOver) return;
      if (this.chat.isOpen) { this.chat.close(); return; }
      if (this.buy.isOpen) return;
      this.openPause();
    });
    input.on('anykey', (code) => this.onKey(code));
    input.on('keyup', (code) => {
      if (code === 'Tab') this.scoreboard.setVisible(false);
    });
    this.game.gr.renderer.domElement.addEventListener('click', () => {
      if (this.playing && !this.matchOver && !input.locked && !this.screens.isOpen && !this.buy.isOpen) input.lock();
    });
  }

  get playing() {
    return this.mode === MODE_SOLO || this.mode === MODE_ONLINE;
  }

  onKey(code) {
    if (code === 'KeyM') {
      const muted = this.audio.toggleMute();
      this.hud.toast(muted ? 'Ovoz o\'chirildi' : 'Ovoz yoqildi', false);
      return;
    }
    if (!this.playing || this.matchOver) return;
    if (code === 'KeyB' && !this.chat.isOpen && !this.screens.isOpen) this.toggleBuy();
    else if (code === 'Escape' && this.buy.isOpen) this.buy.close();
    else if (code === 'Tab' && !this.screens.isOpen) {
      this.boardClock = SCOREBOARD_INTERVAL;
      this.scoreboard.setVisible(true);
    } else if (code === 'KeyT' && !this.screens.isOpen && !this.buy.isOpen) {
      if (this.mode === MODE_ONLINE) {
        this.game.input.keys.delete('KeyT');
        setTimeout(() => this.chat.open(), 0);
      } else {
        this.hud.toast('Chat faqat onlayn o\'yinda ishlaydi', false);
      }
    }
  }

  // ---- buy menu --------------------------------------------------------------------------

  buyState() {
    const snap = this.game.session?.snap;
    const me = this.game.session?.localView()?.state;
    if (!snap || !me) return null;
    return { me, open: snap.phase === 'freeze' };
  }

  toggleBuy() {
    if (this.buy.isOpen) {
      this.buy.close();
      return;
    }
    const state = this.buyState();
    if (!state) return;
    this.audio.ui('menuClick');
    this.expectUnlock = this.game.input.locked;
    this.game.input.unlock();
    this.buy.open(state);
  }

  afterBuyClose() {
    if (this.playing && !this.matchOver && !this.screens.isOpen) this.game.input.lock();
  }

  // ---- menus -----------------------------------------------------------------------------

  openMain() {
    this.leaveSessions();
    this.mode = MODE_MENU;
    this.matchOver = false;
    this.hud.hide();
    this.scoreboard.setVisible(false);
    this.screens.hideRoundResult();
    this.game.enterMenu();
    this.screens.showMain({
      onSolo: () => this.screens.showSolo({ onStart: (o) => this.startSolo(o), onBack: () => this.openMain() }),
      onCreate: () => this.showEntry('create'),
      onJoin: () => this.showEntry('join'),
      onSettings: () => this.screens.showSettings({ onBack: () => this.openMain() }),
    });
  }

  showEntry(mode, code = '', error = '') {
    this.screens.showEntry({
      mode, name: loadName(), code, error,
      onSubmit: (name, room) => this.connect(name, room),
      onBack: () => this.openMain(),
    });
  }

  openPause() {
    if (!this.playing || this.matchOver) return;
    this.buy.hide();
    this.chat.close();
    this.scoreboard.setVisible(false);
    this.game.session?.setPaused?.(true);
    this.expectUnlock = false;
    this.game.input.unlock();
    this.screens.showPause({
      online: this.mode === MODE_ONLINE,
      onResume: () => this.game.input.lock(),
      onSettings: () => this.screens.showSettings({ onBack: () => this.openPause() }),
      onMenu: () => (this.mode === MODE_ONLINE ? this.leaveOnline() : this.openMain()),
    });
  }

  // ---- solo ------------------------------------------------------------------------------

  startSolo(options) {
    this.audio.unlock();
    this.leaveSessions();
    this.soloOptions = options;
    this.mode = MODE_SOLO;
    this.beginMatchUi();
    this.game.startSolo(options);
    this.audio.reset(this.game.localId);
    this.promptToStart('O\'YIN TAYYOR', 'BOSHLASH');
  }

  beginMatchUi() {
    this.matchOver = false;
    this.lastRound = -1;
    this.lastPhase = '';
    this.lastCtx = null;
    this.hud.reset();
    this.hud.show();
    this.chat.clear();
    this.screens.hideRoundResult();
    this.scoreboard.setVisible(false);
  }

  /** The browser only grants Pointer Lock after a click, so a button starts the round. */
  promptToStart(title, label) {
    this.game.session?.setPaused?.(true);
    this.screens.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel result' },
      h('div', { class: 'head', text: title }),
      h('div', { class: 'row-gap', style: { justifyContent: 'center' } },
        this.screens.button(label, () => this.game.input.lock(), 'primary')),
      h('div', { class: 'hint', style: { marginTop: '14px' }, text: 'W A S D \u2014 harakat, sichqoncha \u2014 nishon, B \u2014 xarid, TAB \u2014 hisob, ESC \u2014 pauza' }))));
  }

  // ---- online ----------------------------------------------------------------------------

  async connect(name, room) {
    saveName(name);
    this.audio.unlock();
    this.leaveSessions();
    const net = new NetClient();
    this.net = net;
    this.bindNet(net);
    this.screens.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
      h('h2', { text: 'ULANISH...' }), h('div', { class: 'hint', text: 'Server bilan aloqa o\'rnatilmoqda' }))));
    try {
      await net.join(name, room);
    } catch (err) {
      net.leave();
      this.net = null;
      this.showEntry(room ? 'join' : 'create', room, err.message);
      return;
    }
    this.mode = MODE_LOBBY;
    this.lobby = new Lobby(this.screens.root, {
      net, shareLink, audio: this.audio, onLeave: () => this.leaveOnline(),
    });
    if (net.lastLobby) this.lobby.update(net.lastLobby);
  }

  bindNet(net) {
    net.on('lobby', (m) => this.onLobby(m));
    net.on('snapshot', () => {
      if (this.mode === MODE_LOBBY) this.startOnlineMatch();
    });
    net.on('chat', (m) => {
      this.audio.ui('chatBlip');
      if (this.mode === MODE_ONLINE) this.chat.add(m.from, m.team, m.text);
      this.lobby?.addChat(m.from, m.team, m.text);
    });
    net.on('error', (m) => {
      if (!this.lobby) return;
      if (m.code === 'kicked' || m.code === 'room_not_found') {
        this.notice(m.text, true, 4000);
        this.openMain();
        return;
      }
      if (this.mode === MODE_LOBBY) this.lobby?.showError(m.text);
      else this.hud.toast(m.text, true);
    });
    net.on('reconnecting', ({ attempt, max }) => this.notice(`Aloqa uzildi. Qayta ulanilmoqda (${attempt}/${max})...`, true, 0));
    net.on('reconnected', () => this.notice('Aloqa tiklandi', false, 2000));
    net.on('failed', () => {
      if (!this.lobby) return;
      this.notice('Server bilan aloqa uzildi', true, 4000);
      this.openMain();
    });
  }

  onLobby(m) {
    if (!this.lobby) return;
    if (m.state === 'lobby' && this.mode === MODE_ONLINE) {
      this.returnToLobby();
    }
    if (this.mode === MODE_LOBBY) this.lobby.update(m);
    else if (this.mode === MODE_ONLINE) this.lobby.data = m;
  }

  startOnlineMatch() {
    this.mode = MODE_ONLINE;
    this.beginMatchUi();
    this.game.startOnline(this.net);
    this.game.session.onBuyResult = (r) => {
      if (!r.ok) {
        this.audio.ui('denied');
        this.hud.toast(r.text || 'Xarid amalga oshmadi', true);
      }
    };
    this.audio.reset(this.game.localId);
    this.screens.hide();
    this.promptToStart('O\'YIN BOSHLANDI', 'DAVOM ETISH');
  }

  returnToLobby() {
    this.mode = MODE_LOBBY;
    this.matchOver = false;
    this.hud.hide();
    this.chat.close();
    this.scoreboard.setVisible(false);
    this.screens.hideRoundResult();
    this.game.enterMenu();
    this.expectUnlock = false;
    this.game.input.unlock();
    this.lobby.root = null;
    this.lobby.clearChat();
  }

  leaveOnline() {
    this.openMain();
  }

  /** Drops the network connection and lobby, if any. */
  leaveSessions() {
    if (this.net) {
      this.net.leave();
      this.net = null;
    }
    this.lobby = null;
    clearTimeout(this.winnerTimer);
    this.chat.close();
    if (this.game.input.locked) {
      this.expectUnlock = true;
      this.game.input.unlock();
    }
  }

  notice(text, bad, ms) {
    this.noticeNode.textContent = text;
    this.noticeNode.classList.toggle('info', !bad);
    this.noticeNode.classList.remove('hidden');
    clearTimeout(this.noticeTimer);
    if (ms > 0) this.noticeTimer = setTimeout(() => this.noticeNode.classList.add('hidden'), ms);
  }

  // ---- game callbacks --------------------------------------------------------------------

  onEvents(events, snap, me) {
    this.audio.handleEvents(events, snap.players);
    const byId = new Map(snap.players.map((p) => [p.id, p]));
    const local = this.game.localId;
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.player !== local) this.hud.radar.noteShot(e.player);
          break;
        case 'hit':
          if (e.attacker === local) this.hud.hitMarker(e.headshot);
          if (e.victim === local) this.showDamage(e, byId.get(e.attacker), e.damage);
          break;
        case 'kill':
          this.hud.killEntry(e, byId, local);
          break;
        case 'planted': this.hud.toast('Bomba o\'rnatildi', false); break;
        case 'defused': this.hud.toast('Bomba zararsizlantirildi', false); break;
        case 'round_end':
          this.screens.showRoundResult({
            winner: e.winner, reason: e.reason, reward: e.rewards?.[me.team] ?? null, score: e.score, myTeam: me.team,
          });
          break;
        default:
          break;
      }
    }
  }

  /** Damage vignette plus a wedge pointing towards the attacker, relative to where we look. */
  showDamage(e, attacker, amount) {
    let angle = null;
    const ctx = this.lastCtx;
    if (attacker && ctx && attacker.id !== this.game.localId) {
      const dx = attacker.x - ctx.view.x;
      const dz = attacker.z - ctx.view.z;
      const fx = -Math.sin(ctx.yaw);
      const fz = -Math.cos(ctx.yaw);
      const rx = Math.cos(ctx.yaw);
      const rz = -Math.sin(ctx.yaw);
      angle = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    }
    this.hud.damage(amount, angle);
  }

  onFrame(dt, ctx) {
    this.lastCtx = ctx;
    const { snap, me } = ctx;
    this.hud.update(dt, ctx);
    this.audio.update(dt, snap, ctx.view, ctx.yaw, me, ctx.firing);

    if (snap.round !== this.lastRound) {
      this.lastRound = snap.round;
      this.screens.hideRoundResult();
      this.hud.showRound(snap.round);
    }
    if (snap.phase !== this.lastPhase) {
      if (snap.phase === 'ended' && this.lastPhase !== 'ended' && snap.result && !this.screens.result.firstChild) {
        this.screens.showRoundResult({ winner: snap.result.winner, reason: snap.result.reason, reward: null, score: snap.score, myTeam: me.team });
      }
      if (snap.phase === 'matchEnd' && !this.matchOver) this.scheduleWinner(snap, me);
      this.lastPhase = snap.phase;
    }

    if (this.buy.isOpen) this.buy.refresh({ me, open: snap.phase === 'freeze' });
    if (this.scoreboard.visible) {
      this.boardClock += dt;
      if (this.boardClock >= SCOREBOARD_INTERVAL) {
        this.boardClock = 0;
        const pings = this.game.session.isOnline ? this.game.session.pings : {};
        this.scoreboard.render(snap, this.game.localId, me.team, pings);
      }
    }
  }

  scheduleWinner(snap, me) {
    this.matchOver = true;
    this.chat.close();
    this.scoreboard.setVisible(false);
    this.winnerTimer = setTimeout(() => this.showWinner(snap.matchWinner, snap.score, me.team), WINNER_DELAY_MS);
  }

  showWinner(winner, score, myTeam) {
    const latest = this.game.session?.snap;
    if (!latest) return;
    this.expectUnlock = this.game.input.locked;
    this.game.input.unlock();
    this.hud.hide();
    this.screens.hideRoundResult();
    this.audio.ui(winner === myTeam ? 'win' : 'lose');
    const online = this.mode === MODE_ONLINE;
    this.screens.showWinner({
      winner, myTeam, score, players: latest.players,
      onReplay: () => (online ? this.waitForLobby() : this.startSolo(this.soloOptions)),
      onMenu: () => this.openMain(),
    });
  }

  waitForLobby() {
    this.screens.mount(h('div', { class: 'screen dim' }, h('div', { class: 'panel' },
      h('h2', { text: 'LOBBIGA QAYTILMOQDA...' }),
      h('div', { class: 'hint', text: 'Server yangi o\'yin uchun xonani tayyorlamoqda' }),
      h('div', { class: 'row-gap' }, this.screens.button('Menyu', () => this.openMain())))));
  }
}
