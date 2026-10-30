// Game orchestrator: wires renderer, level, weapons, entities, effects and the solo session.
import * as THREE from 'three';
import { MAP, getWeapon, raycast, directionFromAngles, PLAYER_EYE_HEIGHT } from '@konter/shared';
import { GameRenderer } from './renderer.js';
import { GameLoop } from './loop.js';
import { Input } from './input.js';
import { Level } from '../level/builder.js';
import { ViewModel } from '../weapons/viewmodel.js';
import { PlayerEntities } from '../entities/players.js';
import { WorldItems } from '../entities/worldItems.js';
import { Effects } from '../fx/effects.js';
import { PostProcessing } from '../fx/post.js';
import { SoloSession, LOCAL_ID } from '../ai/solo.js';

const SCOPE_ID = 'scope';

export class Game {
  constructor(container, settings) {
    this.settings = settings;
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
    this.solo = null;
    this.running = false;
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

  /** Starts a local game using the shared simulation. */
  startSolo(options = {}) {
    this.effects.clearAll();
    this.players.clear();
    this.solo = new SoloSession(options);
    const p = this.solo.localPlayer;
    this.input.yaw = p.yaw;
    this.input.pitch = 0;
    this.lastHealth = p.health;
    this.viewmodel.setWeapon(null);
    if (!this.running) {
      this.running = true;
      this.loop.start();
    }
  }

  update(dt) {
    const solo = this.solo;
    if (!solo) return;
    const input = this.input;
    const events = solo.update(dt, () => input.buildCommand());
    const snap = solo.snap;
    const view = solo.localView();
    const me = view.state;
    const weapon = getWeapon(me.weapon ?? 'knife');

    this.handleEvents(events, snap);
    this.updateLocal(dt, view, weapon, me);
    this.players.update(snap.players, LOCAL_ID, dt);
    this.items.update(snap, dt);
    this.effects.syncSmokes(snap.smokes, dt);
    this.effects.update(dt);
    this.level.update(dt, this.gr.camera);
    input.endFrame();
  }

  updateLocal(dt, view, weapon, me) {
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
    const eyeY = me.alive ? PLAYER_EYE_HEIGHT : 0.35;
    const shake = this.effects.shake;
    cam.position.set(
      view.x + (Math.random() - 0.5) * shake * 0.12,
      view.y + eyeY + vm.cameraShake.y + (Math.random() - 0.5) * shake * 0.12,
      view.z + (Math.random() - 0.5) * shake * 0.12,
    );
    cam.rotation.set(
      input.pitch + (view.punch?.[0] ?? 0) + vm.cameraShake.pitch,
      input.yaw + (view.punch?.[1] ?? 0),
      me.alive ? 0 : 0.6,
    );

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
    const isLocal = e.player === LOCAL_ID;
    if (isLocal) this.viewmodel.fire(weapon.category === 'knife');
    else this.players.shot(e.player);
    if (weapon.category === 'knife') return;
    const sp = isLocal ? this.solo.localPlayer : this.solo.sim.players.get(e.player);
    const dir = directionFromAngles(shooter.yaw + (sp?.punch?.[1] ?? 0), shooter.pitch + (sp?.punch?.[0] ?? 0));
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
