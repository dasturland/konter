// Bot and remote player model: body, head, arms, legs and weapon in team colours with walk and
// death animations. Geometries and materials are shared by every instance.
import * as THREE from 'three';
import { TEAM_COLORS } from '@konter/shared';
import { BOT_WEAPON_SIZE } from '../weapons/models.js';

const geo = {
  torso: new THREE.BoxGeometry(0.46, 0.6, 0.26),
  vest: new THREE.BoxGeometry(0.5, 0.36, 0.3),
  head: new THREE.BoxGeometry(0.24, 0.26, 0.26),
  helmet: new THREE.BoxGeometry(0.28, 0.12, 0.3),
  visor: new THREE.BoxGeometry(0.2, 0.07, 0.04),
  arm: new THREE.BoxGeometry(0.13, 0.5, 0.13),
  hand: new THREE.BoxGeometry(0.12, 0.12, 0.12),
  thigh: new THREE.BoxGeometry(0.17, 0.46, 0.18),
  shin: new THREE.BoxGeometry(0.15, 0.42, 0.16),
  boot: new THREE.BoxGeometry(0.17, 0.1, 0.27),
  gun: new THREE.BoxGeometry(1, 1, 1),
};

const matCache = new Map();
function teamMaterials(team) {
  if (!matCache.has(team)) {
    const color = new THREE.Color(TEAM_COLORS[team].hex);
    matCache.set(team, {
      cloth: new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55), roughness: 0.85, metalness: 0.1 }),
      vest: new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, emissive: color.clone().multiplyScalar(0.12) }),
      pants: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.9, metalness: 0.05 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.8, metalness: 0 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.85, metalness: 0.1 }),
      helmet: new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.4), roughness: 0.5, metalness: 0.4 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x0c1a2c, roughness: 0.1, metalness: 0.9, emissive: 0x0b2038 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.4, metalness: 0.85 }),
    });
  }
  return matCache.get(team);
}

function mesh(g, m, x, y, z, parent) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

/** Pivot group placed at the top of a limb so rotation swings the limb from the joint. */
function pivot(parent, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

export class CharacterModel {
  constructor(team) {
    this.team = team;
    this.root = new THREE.Group();
    const m = teamMaterials(team);
    this.hips = pivot(this.root, 0, 0.9, 0);
    this.torso = pivot(this.hips, 0, 0, 0);
    mesh(geo.torso, m.cloth, 0, 0.3, 0, this.torso);
    mesh(geo.vest, m.vest, 0, 0.33, 0, this.torso);
    this.head = pivot(this.torso, 0, 0.62, 0);
    mesh(geo.head, m.skin, 0, 0.13, 0, this.head);
    mesh(geo.helmet, m.helmet, 0, 0.27, 0, this.head);
    mesh(geo.visor, m.visor, 0, 0.16, -0.14, this.head);

    this.armL = pivot(this.torso, -0.3, 0.56, 0);
    mesh(geo.arm, m.cloth, 0, -0.25, 0, this.armL);
    mesh(geo.hand, m.glove, 0, -0.55, 0, this.armL);
    this.armR = pivot(this.torso, 0.3, 0.56, 0);
    mesh(geo.arm, m.cloth, 0, -0.25, 0, this.armR);
    mesh(geo.hand, m.glove, 0, -0.55, 0, this.armR);

    this.legL = pivot(this.hips, -0.11, 0, 0);
    mesh(geo.thigh, m.pants, 0, -0.23, 0, this.legL);
    this.kneeL = pivot(this.legL, 0, -0.46, 0);
    mesh(geo.shin, m.pants, 0, -0.21, 0, this.kneeL);
    mesh(geo.boot, m.glove, 0, -0.42, -0.04, this.kneeL);
    this.legR = pivot(this.hips, 0.11, 0, 0);
    mesh(geo.thigh, m.pants, 0, -0.23, 0, this.legR);
    this.kneeR = pivot(this.legR, 0, -0.46, 0);
    mesh(geo.shin, m.pants, 0, -0.21, 0, this.kneeR);
    mesh(geo.boot, m.glove, 0, -0.42, -0.04, this.kneeR);

    this.gunMount = pivot(this.armR, 0, -0.55, -0.05);
    this.gun = mesh(geo.gun, m.gun, 0, 0, 0, this.gunMount);
    this.weaponId = null;
    this.phase = Math.random() * 6;
    this.deadT = 0;
    this.dead = false;
    this.shootT = 0;
    this.hurtT = 0;
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    const size = BOT_WEAPON_SIZE[id] ?? [0.4, 0.08];
    this.gun.scale.set(size[1] * 0.7, size[1], size[0]);
    this.gun.position.set(0, 0, -size[0] * 0.35);
    this.gun.visible = !!id;
  }

  /** Triggers a brief muzzle kick on the model. */
  shoot() {
    this.shootT = 0.12;
  }

  /**
   * @param dt seconds
   * @param speed horizontal speed (m/s)
   * @param pitch look pitch in radians
   * @param alive false plays the death animation
   */
  animate(dt, speed, pitch, alive, onGround = true) {
    if (!alive) {
      if (!this.dead) { this.dead = true; this.deadT = 0; }
      this.deadT = Math.min(1, this.deadT + dt / 0.75);
      const t = 1 - (1 - this.deadT) * (1 - this.deadT);
      this.root.rotation.x = -t * (Math.PI / 2) * 0.96;
      this.hips.position.y = 0.9 - t * 0.55;
      this.armL.rotation.x = -t * 1.2;
      this.armR.rotation.x = -t * 0.6;
      this.legL.rotation.x = t * 0.3;
      this.legR.rotation.x = -t * 0.2;
      return;
    }
    if (this.dead) {
      this.dead = false;
      this.deadT = 0;
      this.root.rotation.x = 0;
      this.hips.position.y = 0.9;
    }
    const moving = Math.min(1, speed / 4);
    this.phase += dt * (3 + speed * 1.6);
    const sw = Math.sin(this.phase) * 0.9 * moving;
    this.legL.rotation.x = onGround ? sw : -0.6;
    this.legR.rotation.x = onGround ? -sw : 0.4;
    this.kneeL.rotation.x = onGround ? Math.max(0, -Math.sin(this.phase)) * 0.9 * moving : 0.8;
    this.kneeR.rotation.x = onGround ? Math.max(0, Math.sin(this.phase)) * 0.9 * moving : 0.2;
    this.hips.position.y = 0.9 + Math.abs(Math.cos(this.phase)) * 0.03 * moving;
    this.armL.rotation.x = -1.2 + (sw * 0.15);
    this.armL.rotation.z = 0.3;
    this.shootT = Math.max(0, this.shootT - dt);
    this.armR.rotation.x = -1.35 + pitch * 0.5 + this.shootT * 1.2;
    this.armR.rotation.z = -0.1;
    this.head.rotation.x = pitch * 0.6;
    this.torso.rotation.x = pitch * 0.2;
  }
}
