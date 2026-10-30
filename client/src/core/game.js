// Game orchestrator: wires renderer, level, weapons, entities, effects and the solo session.
import * as THREE from 'three';
import { MAP, SPAWNS, getWeapon, raycast, directionFromAngles, PLAYER_EYE_HEIGHT } from '@konter/shared';
import { GameRenderer } from './renderer.js';
import { GameLoop } from './loop.js';
import { Input } from './input.js';
import { Level } from '../level/builder.js';
import { ViewModel } from '../weapons/viewmodel.js';
import { PlayerEntities } from '../entities/players.js';
import { WorldItems } from '../entities/worldItems.js';
import { Effects } from '../fx/effects.js';
import { PostProcessing } from '../fx/post.js';
import { SoloSession } from '../ai/solo.js';
import { OnlineSession } from '../net/onlineSession.js';

const SCOPE_ID = 'scope';

const SPREAD_MAX = 26;
const FIRE_KICK = 5;

export class Game {
  /**
   * @param {HTMLElement} container canvas parent
   * @param {object} settings SettingsStore
   * @param {{events:(events:object[],snap:object,me:object)=>void, frame:(dt:number,ctx:object)=>void}} hooks UI and audio callbacks
   */
  constructor(container, settings, hooks) {
    this.settings = settings;
    this.hooks = hooks;
    this.gr = new GameRenderer(container, settings);
    this.level = new Level(MAP, settings);
    this.scene = this.level.scene;
    this.scene.add(this.gr.camera);
    this.viewmodel = new ViewModel();
    this.effects = new Effects(this.scene);
    this.players = new PlayerEntities(this.scene);
    this.items = new WorldItems(this.scene);
    this.post = new PostProcessing(this.gr, this.scene, this.viewmodel, settings);
    this.input = new Input(this.gr.renderer.domElement, settings);
    this.session = null;
    this.localId = null;
    this.menuMode = true;
    this.menuTime = 0;
    this.running = false;
    this.firePulse = 0;
    this.spectateIndex = 0;
    this.spectateCam = null;
    this.lookPrev = { yaw: 0, pitch: 0 };
    this.reload = { active: false, t: 0, duration: 1 };
    this.lastHealth = 100;
    this.prevVy = 0;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.scopeEl = document.getElementById(SCOPE_ID);
    this.loop = new GameLoop((dt) => this.update(dt), (dt) => this.post.render(dt));

    this.applyQuality();
    settings.onChange(() => this.applyQuality());
  }

  applyQuality() {
    this.level.setQuality(this.settings.preset);
    this.gr.applyQuality(this.scene);
    this.gr.resize();
  }

  ensureRunning() {
    if (this.running) return;
    this.running = true;
    this.loop.start();
  }

  resetScene() {
    this.effects.clearAll();
    this.players.clear();
    this.viewmodel.setWeapon(null);
    this.spectateCam = null;
    this.spectateIndex = 0;
    this.reload.active = false;
    this.post.hurt = 0;
    this.post.flash = 0;
    this.scopeEl?.classList.remove('on');
  }

  /** Shows the bunker with a slowly rotating camera behind the main menu. */
  enterMenu() {
    this.session?.dispose?.();
    this.session = null;
    this.localId = null;
    this.menuMode = true;
    this.resetScene();
    this.viewmodel.visible = false;
    this.gr.setZoom(1);
    this.ensureRunning();
  }

  /** Starts a local game using the shared simulation. */
  startSolo(options = {}) {
    this.session?.dispose?.();
    this.resetScene();
    this.session = new SoloSession(options);
    this.localId = this.session.localId;
    const p = this.session.localPlayer;
    this.input.yaw = p.yaw;
    this.input.pitch = 0;
    this.lastHealth = p.health;
    this.menuMode = false;
    this.viewmodel.visible = true;
    this.ensureRunning();
  }

  /** Starts an online match driven by snapshots from the server. */
  startOnline(net) {
    this.session?.dispose?.();
    this.resetScene();
    this.session = new OnlineSession(net);
    this.localId = this.session.localId;
    this.input.pitch = 0;
    this.lastHealth = 100;
    this.firstOnlineFrame = true;
    this.menuMode = false;
    this.viewmodel.visible = true;
    this.ensureRunning();
  }

  updateMenuCamera(dt) {
    this.menuTime += dt;
    const base = SPAWNS.CT[2];
    const t = this.menuTime;
    const cam = this.gr.camera;
    cam.position.set(base.x + Math.sin(t * 0.21) * 2.5, 1.9 + Math.sin(t * 0.37) * 0.15, base.z - 3 + Math.cos(t * 0.21) * 2);
    cam.rotation.set(-0.06 + Math.sin(t * 0.3) * 0.04, t * 0.13, 0);
    this.level.update(dt, cam);
    this.effects.update(dt);
    this.gr.setZoom(1);
  }

  update(dt) {
    const session = this.session;
    if (this.menuMode || !session) {
      this.updateMenuCamera(dt);
      return;
    }
    const input = this.input;
    const events = session.update(dt, () => input.buildCommand());
    const snap = session.snap;
    const view = snap ? session.localView() : null;
    if (!snap || !view) {
      input.endFrame();
      return;
    }
    const me = view.state;
    if (session.isOnline && this.firstOnlineFrame) {
      this.firstOnlineFrame = false;
      input.yaw = me.yaw;
      this.lastHealth = me.health;
    }
    const weapon = getWeapon(me.weapon ?? 'knife');

    this.handleEvents(events, snap);
    this.hooks.events(events, snap, me);
    const spectating = me.alive ? null : this.spectateTarget(snap, me, dt);
    this.updateLocal(dt, view, weapon, me, spectating);
    this.players.update(snap.players, this.localId, dt);
    if (spectating) {
      const entry = this.players.entries.get(spectating.id);
      if (entry) entry.model.root.visible = false;
    }
    this.items.update(snap, dt);
    this.effects.syncSmokes(snap.smokes, dt);
    this.effects.update(dt);
    this.level.update(dt, this.gr.camera);

    const cam = this.gr.camera;
    const speed = this.speed ?? 0;
    this.firePulse = Math.max(0, this.firePulse - dt * 40);
    let gap = speed * 1.1 + this.firePulse + (me.ground ? 0 : 8);
    if (input.aiming) gap *= 0.5;
    this.hooks.frame(dt, {
      snap, me, localId: this.localId, view: spectating ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : view,
      yaw: cam.rotation.y, gap: Math.min(SPREAD_MAX, gap), scoped: this.scopeEl?.classList.contains('on') ?? false,
      spectating: spectating ? spectating.name : null, firing: input.firing,
    });
    input.endFrame();
  }

  /** Picks the teammate to watch while dead. Left and right arrows cycle through the living ones. */
  spectateTarget(snap, me, dt) {
    const mates = snap.players.filter((p) => p.alive && p.team === me.team && p.id !== this.localId);
    const pool = mates.length ? mates : snap.players.filter((p) => p.alive && p.id !== this.localId);
    if (!pool.length) return null;
    if (this.input.consume('ArrowRight')) this.spectateIndex += 1;
    if (this.input.consume('ArrowLeft')) this.spectateIndex -= 1;
    const target = pool[((this.spectateIndex % pool.length) + pool.length) % pool.length];
    const entry = this.players.entries.get(target.id);
    const k = 1 - Math.exp(-18 * dt);
    const goal = entry ? entry.pos : { x: target.x, y: target.y, z: target.z };
    if (!this.spectateCam || this.spectateCam.id !== target.id) {
      this.spectateCam = { id: target.id, x: goal.x, y: goal.y, z: goal.z, yaw: target.yaw, pitch: target.pitch };
    }
    const c = this.spectateCam;
    c.x += (goal.x - c.x) * k;
    c.y += (goal.y - c.y) * k;
    c.z += (goal.z - c.z) * k;
    const dy = Math.atan2(Math.sin(target.yaw - c.yaw), Math.cos(target.yaw - c.yaw));
    c.yaw += dy * k;
    c.pitch += (target.pitch - c.pitch) * k;
    return { id: target.id, name: target.name, cam: c };
  }

  updateLocal(dt, view, weapon, me, spectating) {
    const input = this.input;
    const cam = this.gr.camera;
    const vm = this.viewmodel;

    if (vm.weaponId !== me.weapon && me.weapon) vm.setWeapon(me.weapon, weapon.drawTime);

    // Reload progress is tracked on the client from the weapon reload time.
    if (me.reloading && !this.reload.active) this.reload = { active: true, t: 0, duration: Math.max(0.5, weapon.reload) };
    if (!me.reloading) this.reload.active = false;
    if (this.reload.active) this.reload.t += dt;
    const reloadProgress = this.reload.active ? Math.min(1, this.reload.t / this.reload.duration) : -1;

    const aiming = input.aiming && me.alive && !me.reloading;
    const scoped = !!(weapon.zoom && aiming);
    this.input.sensitivityScale = scoped ? 0.4 : aiming ? 0.8 : 1;
    const baseFov = this.settings.get('fov');
    const targetZoom = scoped ? baseFov / weapon.zoom.fov[0] : aiming ? 1.18 : 1;
    this.gr.setZoom(this.gr.zoom + (targetZoom - this.gr.zoom) * Math.min(1, dt * 16));
    this.scopeEl?.classList.toggle('on', scoped && vm.aimAmount > 0.9);

    const speed = Math.hypot(view.x - (this.lastX ?? view.x), view.z - (this.lastZ ?? view.z)) / Math.max(dt, 1e-4);
    this.speed = (this.speed ?? 0) + (speed - (this.speed ?? 0)) * Math.min(1, dt * 12);
    this.lastX = view.x;
    this.lastZ = view.z;

    vm.update(dt, {
      speed: this.speed, onGround: me.ground, aiming, scoped, reload: reloadProgress,
      lookDx: input.yaw - this.lookPrev.yaw, lookDy: input.pitch - this.lookPrev.pitch,
      alive: me.alive, prevVy: this.prevVy,
    });
    this.prevVy = me.vy;
    this.lookPrev.yaw = input.yaw;
    this.lookPrev.pitch = input.pitch;

    // Camera follows the interpolated body; punch from the sim keeps shots where the eye looks.
    if (spectating) {
      const c = spectating.cam;
      cam.position.set(c.x, c.y + PLAYER_EYE_HEIGHT, c.z);
      cam.rotation.set(c.pitch, c.yaw, 0);
    } else {
      const shake = this.effects.shake;
      cam.position.set(
        view.x + (Math.random() - 0.5) * shake * 0.12,
        view.y + PLAYER_EYE_HEIGHT + vm.cameraShake.y + (Math.random() - 0.5) * shake * 0.12,
        view.z + (Math.random() - 0.5) * shake * 0.12,
      );
      cam.rotation.set(
        input.pitch + (view.punch?.[0] ?? 0) + vm.cameraShake.pitch,
        input.yaw + (view.punch?.[1] ?? 0),
        me.alive ? 0 : 0.6,
      );
    }

    if (me.health < this.lastHealth) {
      this.post.hurt = Math.min(1, this.post.hurt + (this.lastHealth - me.health) / 60);
      this.effects.shake = Math.max(this.effects.shake, 0.3);
    }
    this.lastHealth = me.health;
    this.post.flash = Math.max(this.post.flash, Math.min(1, me.flash / 2));
  }

  handleEvents(events, snap) {
    const byId = new Map(snap.players.map((p) => [p.id, p]));
    for (const e of events) {
      if (e.type === 'shot') this.onShot(e, byId.get(e.player));
      else if (e.type === 'hit') {
        const v = byId.get(e.victim);
        if (v) this.effects.blood(this.tmp.set(v.x, v.y + (e.headshot ? 1.65 : 1.2), v.z));
      } else if (e.type === 'grenade') {
        const pos = this.tmp.set(e.x, e.y, e.z);
        if (e.kind === 'he') this.effects.explosion(pos);
        else if (e.kind === 'flash') this.effects.flashBang(pos);
      }
    }
  }

  onShot(e, shooter) {
    if (!shooter) return;
    const weapon = getWeapon(e.weapon);
    const isLocal = e.player === this.localId;
    if (isLocal) {
      this.viewmodel.fire(weapon.category === 'knife');
      this.firePulse = Math.min(SPREAD_MAX, this.firePulse + FIRE_KICK);
    }
    else this.players.shot(e.player);
    if (weapon.category === 'knife') return;
    const punch = this.session.punchOf(e.player);
    const dir = directionFromAngles(shooter.yaw + punch[1], shooter.pitch + punch[0]);
    const origin = [e.x, e.y, e.z];
    const hit = raycast(MAP, origin, dir, 200);
    const end = hit ? hit.point : [origin[0] + dir[0] * 120, origin[1] + dir[1] * 120, origin[2] + dir[2] * 120];
    const from = this.tmp2.set(origin[0], origin[1], origin[2]);
    if (isLocal) {
      this.gr.camera.localToWorld(from.set(0.18, -0.14, -0.7));
    } else {
      from.set(origin[0] + dir[0] * 0.6, origin[1] - 0.2 + dir[1] * 0.6, origin[2] + dir[2] * 0.6);
      this.effects.muzzleFlash(from);
    }
    this.effects.tracer(from, new THREE.Vector3(end[0], end[1], end[2]));
    if (hit) {
      this.effects.impact(new THREE.Vector3(...hit.point), new THREE.Vector3(-dir[0], -dir[1], -dir[2]).normalize());
    }
  }
}
