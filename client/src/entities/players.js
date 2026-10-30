// Renders every non-local player of a GameSim snapshot with interpolated motion.
import * as THREE from 'three';
import { CharacterModel } from './characterModel.js';

export class PlayerEntities {
  constructor(scene) {
    this.scene = scene;
    this.entries = new Map();
  }

  /** Marks a player as shooting so the model kicks. */
  shot(id) {
    this.entries.get(id)?.model.shoot();
  }

  /** Position of the head of a player, or null. Used by tracers. */
  update(players, localId, dt) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === localId) continue;
      seen.add(p.id);
      let e = this.entries.get(p.id);
      if (!e || e.team !== p.team) {
        if (e) this.scene.remove(e.model.root);
        e = { model: new CharacterModel(p.team), team: p.team, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, speed: 0 };
        this.scene.add(e.model.root);
        this.entries.set(p.id, e);
      }
      const target = new THREE.Vector3(p.x, p.y, p.z);
      const jump = e.pos.distanceTo(target);
      if (jump > 4) e.pos.copy(target);
      const before = e.pos.clone();
      e.pos.lerp(target, 1 - Math.exp(-18 * dt));
      const moved = Math.hypot(e.pos.x - before.x, e.pos.z - before.z) / Math.max(dt, 1e-4);
      e.speed += (moved - e.speed) * Math.min(1, dt * 10);
      let dy = p.yaw - e.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * (1 - Math.exp(-20 * dt));
      const m = e.model;
      m.root.position.copy(e.pos);
      m.root.rotation.y = e.yaw;
      m.setWeapon(p.weapon);
      m.animate(dt, e.speed, p.pitch, p.alive, p.ground);
      m.root.visible = true;
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        this.scene.remove(e.model.root);
        this.entries.delete(id);
      }
    }
  }

  clear() {
    for (const e of this.entries.values()) this.scene.remove(e.model.root);
    this.entries.clear();
  }
}
