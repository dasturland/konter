// Client bootstrap: settings, game construction and the start overlay (Pointer Lock).
import { SettingsStore } from './core/settings.js';
import { Game } from './core/game.js';

const settings = new SettingsStore();
const container = document.getElementById('app');
const overlay = document.getElementById('start-overlay');
const game = new Game(container, settings);

function begin() {
  if (!game.solo) game.startSolo({ difficulty: 'orta' });
  game.input.lock();
}

overlay.addEventListener('click', begin);
game.input.on('lock', () => overlay.classList.add('hidden'));
game.input.on('unlock', () => {
  overlay.classList.remove('hidden');
  game.solo?.setPaused(true);
});
game.input.on('lock', () => game.solo?.setPaused(false));
window.__konter = game;
