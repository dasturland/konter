// First-person weapon rig: bottom-right placement, walk bob and sway, recoil, muzzle flash with
// light, reload (rotation and magazine swap), weapon switch, jump/land shake and aim down sights.
import * as THREE from 'three';
import { buildWeaponModel } from './models.js';

const HIP = new THREE.Vector3(0.2, -0.2, -0.5);
const SMOOTH = (t) => t * t * (3 - 2 * t);
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,240,180,0.9)';
  for (let i = 0; i < 6; i++) {
    x.save();
    x.translate(64, 64);
    x.rotate((i * Math.PI) / 3);
    x.beginPath(); x.moveTo(0, -4); x.lineTo(62, 0); x.lineTo(0, 4); x.fill();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.02, 10);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30343a, 1.3));
    const key = new THREE.DirectionalLight(0xeaf2ff, 2.2);
    key.position.set(-0.6, 1, 0.8);
    this.scene.add(key);

    this.root = new THREE.Group();
    this.sway = new THREE.Group();
    this.root.add(this.sway);
    this.scene.add(this.root);

    this.models = new Map();
    this.current = null;
    this.weaponId = null;

    this.flashMat = new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffb050, 0, 3, 2);
    this.flash.add(this.flashLight);
    this.scene.add(this.flash);
    this.flashTime = 0;

    this.bobPhase = 0;
    this.bobAmp = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.recoil = 0;
    this.recoilVel = 0;
    this.kickRot = 0;
    this.aim = 0;
    this.drawT = 1;
    this.drawDuration = 0.6;
    this.landDip = 0;
    this.landVel = 0;
    this.wasGround = true;
    this.knifeSwing = 0;
    this.cameraShake = { y: 0, pitch: 0 };
    this.visible = true;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  modelFor(id) {
    if (!this.models.has(id)) {
      const m = buildWeaponModel(id);
      m.group.visible = false;
      this.sway.add(m.group);
      this.models.set(id, m);
    }
    return this.models.get(id);
  }

  /** Equips a weapon and starts the draw animation. */
  setWeapon(id, drawTime = 0.6) {
    if (id === this.weaponId) return;
    if (this.current) this.current.group.visible = false;
    this.weaponId = id;
    this.current = id ? this.modelFor(id) : null;
    if (this.current) {
      this.current.group.visible = true;
      this.current.group.add(this.flash);
    }
    this.drawT = 0;
    this.drawDuration = Math.max(0.25, drawTime);
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    if (this.current?.mag) { this.current.mag.visible = true; this.current.mag.position.copy(this.current.magHome); }
  }

  /** Call when the local player fires. */
  fire(isKnife = false) {
    if (!this.current) return;
    if (isKnife) {
      this.knifeSwing = 1;
      return;
    }
    this.recoilVel += 0.9;
    this.kickRot += 0.05;
    this.flashTime = 0.055;
    this.flash.visible = true;
    this.flash.position.copy(this.current.muzzle.position);
    this.flash.scale.setScalar(0.16 + Math.random() * 0.1);
    this.flashMat.rotation = Math.random() * Math.PI * 2;
    this.flashLight.intensity = 3.5;
  }

  /** World position of the muzzle for world-space flash lights and tracers. */
  muzzleWorld(target) {
    if (!this.current) return target.set(0, 0, 0);
    this.current.muzzle.getWorldPosition(target);
    return target;
  }

  /** Smoothed aim state, 0 (hip) to 1 (aimed). */
  get aimAmount() {
    return this.aim;
  }

  /**
   * @param dt seconds
   * @param s { speed, onGround, vy, aiming, scoped, reload (0..1 or -1), lookDx, lookDy, alive }
   */
  update(dt, s) {
    const m = this.current;
    this.root.visible = this.visible && !!m && s.alive !== false;
    if (!m) return;

    // Aim down sights.
    this.aim = damp(this.aim, s.aiming ? 1 : 0, 14, dt);
    const aimK = SMOOTH(this.aim);

    // Walk bob: figure eight scaled by speed, mostly muted while aiming.
    const moving = s.onGround ? Math.min(1, s.speed / 6) : 0;
    this.bobAmp = damp(this.bobAmp, moving, 10, dt);
    this.bobPhase += dt * (4 + s.speed * 1.35);
    const bobScale = 1 - aimK * 0.85;
    const bobX = Math.cos(this.bobPhase) * 0.012 * this.bobAmp * bobScale;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.016 * this.bobAmp * bobScale;
    const idle = Math.sin(performance.now() / 1000 * 1.3) * 0.0016 * bobScale;

    // Sway lags behind the mouse.
    const lx = Math.max(-1, Math.min(1, (s.lookDx ?? 0) * 0.0009 / Math.max(dt, 0.004)));
    const ly = Math.max(-1, Math.min(1, (s.lookDy ?? 0) * 0.0009 / Math.max(dt, 0.004)));
    this.swayX = damp(this.swayX, lx * 0.035 * (1 - aimK * 0.7), 9, dt);
    this.swayY = damp(this.swayY, ly * 0.03 * (1 - aimK * 0.7), 9, dt);

    // Recoil spring.
    this.recoilVel += (-300 * this.recoil - 25 * this.recoilVel) * dt;
    this.recoil += this.recoilVel * dt;
    this.kickRot = damp(this.kickRot, 0, 12, dt);

    // Jump and land shake.
    if (this.wasGround && !s.onGround) this.landVel += 0.5;
    if (!this.wasGround && s.onGround) this.landVel -= Math.min(2.4, 0.35 + Math.abs(s.prevVy ?? 0) * 0.14);
    this.wasGround = s.onGround;
    this.landVel += (-90 * this.landDip - 11 * this.landVel) * dt;
    this.landDip += this.landVel * dt;

    // Draw (weapon switch).
    this.drawT = Math.min(1, this.drawT + dt / this.drawDuration);
    const draw = 1 - SMOOTH(this.drawT);

    // Reload: weapon rolls and tilts while the magazine drops out and a new one slides in.
    let tilt = 0;
    let roll = 0;
    if (s.reload >= 0 && s.reload <= 1 && m.mag) {
      const p = s.reload;
      const env = Math.sin(Math.PI * Math.min(1, p * 1.05));
      tilt = env * 0.5;
      roll = env * 0.55;
      if (p < 0.3) {
        m.mag.visible = true;
        m.mag.position.copy(m.magHome).y -= (p / 0.3) * 0.22;
      } else if (p < 0.5) {
        m.mag.visible = false;
      } else {
        m.mag.visible = true;
        const t = (p - 0.5) / 0.35;
        m.mag.position.copy(m.magHome).y -= (1 - SMOOTH(Math.min(1, t))) * 0.22;
      }
    } else if (m.mag) {
      m.mag.visible = true;
      m.mag.position.copy(m.magHome);
    }

    // Knife swing.
    this.knifeSwing = Math.max(0, this.knifeSwing - dt * 3.2);
    const swing = Math.sin(this.knifeSwing * Math.PI);

    // Compose the transform.
    const adsX = HIP.x * (1 - aimK);
    const adsY = HIP.y + (-(m.adsY ?? 0.06) - HIP.y) * aimK;
    const adsZ = HIP.z + (-0.34 - HIP.z) * aimK * (s.scoped ? 0.2 : 1);
    this.root.position.set(
      adsX + this.swayX * -1 + bobX,
      adsY + this.swayY + bobY + idle - draw * 0.35 + this.landDip * 0.06 - swing * 0.05,
      adsZ + this.recoil + draw * 0.1,
    );
    this.root.rotation.set(
      this.swayY * 0.8 + this.kickRot + this.recoil * 2 - draw * 0.9 + tilt - swing * 0.9,
      -this.swayX * 1.4 + swing * 0.6 + bobX * 1.5,
      roll - this.swayX * 0.7,
    );
    this.root.visible = this.root.visible && !(s.scoped && this.aim > 0.92);

    // Muzzle flash fades quickly.
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }

    // Camera feedback for jump/land and recoil.
    this.cameraShake.y = this.landDip * 0.08;
    this.cameraShake.pitch = this.landDip * -0.012;
  }
}
