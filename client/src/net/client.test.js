import { describe, it, expect } from 'vitest';
import { NetClient, reconnectDelay, roomFromUrl, serverUrl, shareLink, MAX_RECONNECT_ATTEMPTS } from './client.js';

class FakeSocket {
  constructor() { this.readyState = 0; this.sent = []; FakeSocket.all.push(this); }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
}
FakeSocket.all = [];

function memory() {
  const d = {};
  return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; } };
}

const welcome = { t: 'welcome', id: 'p1', room: 'ABCDE', token: 'tok', team: 'CT', host: true, state: 'lobby' };

function make() {
  FakeSocket.all = [];
  return new NetClient({ url: 'ws://x/ws', socketFactory: () => new FakeSocket(), storage: memory() });
}

describe('helpers', () => {
  it('builds urls, parses the room query and shares links', () => {
    expect(serverUrl({ protocol: 'https:', host: 'a.b' })).toBe('wss://a.b/ws');
    expect(serverUrl({ protocol: 'http:', host: 'a.b:3000' })).toBe('ws://a.b:3000/ws');
    expect(roomFromUrl('?room=abcde')).toBe('ABCDE');
    expect(roomFromUrl('?room=zz')).toBe('');
    expect(shareLink('ABCDE', { origin: 'http://h', pathname: '/' })).toBe('http://h/?room=ABCDE');
  });

  it('backs off up to five seconds', () => {
    expect(reconnectDelay(1)).toBe(700);
    expect(reconnectDelay(2)).toBe(1400);
    expect(reconnectDelay(10)).toBe(5000);
  });
});

describe('NetClient', () => {
  it('joins and resolves with the welcome message', async () => {
    const net = make();
    const p = net.join('Ali', '');
    const ws = FakeSocket.all[0];
    ws.open();
    expect(ws.sent[0]).toEqual({ t: 'join', name: 'Ali', room: '', token: '' });
    ws.receive(welcome);
    const w = await p;
    expect(w.room).toBe('ABCDE');
    expect(net.id).toBe('p1');
    expect(net.isHost).toBe(true);
    net.leave();
  });

  it('rejects with the server error text', async () => {
    const net = make();
    const p = net.join('Ali', 'ABCDE');
    const ws = FakeSocket.all[0];
    ws.open();
    ws.receive({ t: 'error', code: 'room_not_found', text: 'Xona topilmadi' });
    let message = '';
    try { await p; } catch (e) { message = e.message; }
    expect(message).toBe('Xona topilmadi');
  });

  it('reports failure when the first connection drops', async () => {
    const net = make();
    const p = net.join('Ali', '');
    FakeSocket.all[0].drop();
    let message = '';
    try { await p; } catch (e) { message = e.message; }
    expect(message).toContain('ulanib');
  });

  it('retries with the saved token after an unexpected close', async () => {
    const net = make();
    const events = [];
    net.on('reconnecting', (e) => events.push(e.attempt));
    net.on('reconnected', () => events.push('ok'));
    const p = net.join('Ali', '');
    FakeSocket.all[0].open();
    FakeSocket.all[0].receive(welcome);
    await p;
    FakeSocket.all[0].drop();
    expect(events).toEqual([1]);
    await new Promise((r) => setTimeout(r, reconnectDelay(1) + 50));
    const ws = FakeSocket.all[1];
    ws.open();
    expect(ws.sent[0]).toEqual({ t: 'join', name: 'Ali', room: 'ABCDE', token: 'tok' });
    ws.receive(welcome);
    expect(events).toEqual([1, 'ok']);
    net.leave();
  });

  it('gives up after the maximum number of attempts', () => {
    const net = make();
    net.session = { room: 'ABCDE', token: 'tok', name: 'Ali' };
    net.joined = true;
    let failed = '';
    net.on('failed', (t) => { failed = t; });
    net.attempt = MAX_RECONNECT_ATTEMPTS;
    net.scheduleReconnect();
    expect(failed).toContain('aloqa');
  });

  it('stops retrying after being kicked', () => {
    const net = make();
    net.join('Ali', '').catch(() => {});
    FakeSocket.all[0].open();
    FakeSocket.all[0].receive({ t: 'error', code: 'kicked', text: 'Siz xonadan chiqarildingiz' });
    expect(net.wantClose).toBe(true);
    FakeSocket.all[0].drop();
    expect(FakeSocket.all).toHaveLength(1);
  });
});
