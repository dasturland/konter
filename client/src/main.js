// Client bootstrap: styles, then the application controller (menus, HUD, audio, game).
import './ui/ui.css';
import { App } from './ui/app.js';

const app = new App();
app.start();
window.__konter = app;
