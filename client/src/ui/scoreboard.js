// TAB scoreboard: both teams with kills, deaths, money and ping.
import { h, clear } from './dom.js';
import { formatMoney } from './util.js';

function teamTable(title, cls, score, rows, localId, myTeam, pings) {
  const head = h('tr', {}, ...['O\'yinchi', 'O\'ldirish', 'O\'lim', 'Pul', 'Ping'].map((t) => h('th', { text: t })));
  const body = rows.map((p) => h('tr', { class: `${p.id === localId ? 'me' : ''}${p.alive ? '' : ' dead'}` },
    h('td', { text: p.bot ? `${p.name} (bot)` : p.name }),
    h('td', { text: String(p.kills) }),
    h('td', { text: String(p.deaths) }),
    h('td', { text: p.team === myTeam ? formatMoney(p.money) : '\u2014' }),
    h('td', { text: p.bot ? '\u2014' : `${pings?.[p.id] ?? 0} ms` })));
  return [
    h('h3', { class: cls }, h('span', { text: title }), h('span', { text: String(score) })),
    h('table', {}, h('thead', {}, head), h('tbody', {}, ...body)),
  ];
}

export class Scoreboard {
  constructor(parent) {
    this.root = h('div', { id: 'scoreboard', class: 'hidden' });
    parent.append(this.root);
    this.visible = false;
  }

  setVisible(value) {
    this.visible = value;
    this.root.classList.toggle('hidden', !value);
  }

  /** Rebuilds the table. Only called while visible, a few times per second. */
  render(snap, localId, myTeam, pings) {
    const sorted = (team) => snap.players.filter((p) => p.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    clear(this.root);
    this.root.append(
      ...teamTable('HIMOYACHILAR (CT)', 'ct', snap.score.CT, sorted('CT'), localId, myTeam, pings),
      ...teamTable('HUJUMCHILAR (T)', 't', snap.score.T, sorted('T'), localId, myTeam, pings),
    );
  }
}
