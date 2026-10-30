// Transient world effects: tracers, impacts, muzzle lights, smoke clouds, flash and explosions.
// Everything is pooled so no objects are allocated while playing.
import * as THREE from 'three';

function softTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.time = 0;

    const soft = softTexture();
    this.glowMat = new THREE.SpriteMaterial({ map: soft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

    // Tracers: thin stretched boxes.
    this.tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
    this.tracerGeo.translate(0, 0, -0.5);
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1), transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    // Particles (sparks, dust, fire) are billboards.
    this.particles = [];
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      scene.add(s);
      this.particles.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, grow: 0, gravity: 0, fade: 1 });
    }
    this.nextParticle = 0;

    // Short-lived point lights for muzzle flashes of other players and for explosions.
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 14, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0, peak: 0 });
    }
    this.nextLight = 0;

    this.smokeTexture = softTexture('rgba(190,198,204,0.95)', 'rgba(190,198,204,0)');
    this.smokeGroups = new Map();
    this.impactMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.decalGeo = new THREE.CircleGeometry(0.06, 8);
    this.decals = [];
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Mesh(this.decalGeo, this.impactMat);
      d.visible = false;
      scene.add(d);
      this.decals.push(d);
    }
    this.nextDecal = 0;
  }

  spawnParticle(pos, vel, { color = 0xffc070, size = 0.1, life = 0.4, grow = 0, gravity = 0, additive = true, opacity = 1 } = {}) {
    const p = this.particles[this.nextParticle];
    this.nextParticle = (this.nextParticle + 1) % this.particles.length;
    p.sprite.position.copy(pos);
    p.vel.copy(vel);
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = grow;
    p.gravity = gravity;
    p.fade = opacity;
    p.sprite.material.color.set(color);
    p.sprite.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.material.opacity = opacity;
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
  }

  pulseLight(pos, color, intensity, life) {
    const l = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.peak = intensity;
    l.life = life;
    l.max = life;
    l.light.intensity = intensity;
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
    const len = from.distanceTo(to);
    if (len < 1) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.07;
  }

  /** Sparks and a bullet hole at a wall hit. */
  impact(pos, normal) {
    const v = new THREE.Vector3();
    for (let i = 0; i < 5; i++) {
      v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3).addScaledVector(normal, 2);
      this.spawnParticle(pos, v, { color: 0xffd080, size: 0.05, life: 0.25 + Math.random() * 0.2, gravity: 9 });
    }
    v.set(0, 0.4, 0);
    this.spawnParticle(pos, v, { color: 0x6c7076, size: 0.18, life: 0.6, grow: 0.5, additive: false, opacity: 0.5 });
    const d = this.decals[this.nextDecal];
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.position.copy(pos).addScaledVector(normal, 0.012);
    d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    d.visible = true;
  }

  blood(pos) {
    const v = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2);
      this.spawnParticle(pos, v, { color: 0xb0161a, size: 0.07, life: 0.4, gravity: 8, additive: false });
    }
  }

  muzzleFlash(pos) {
    this.pulseLight(pos, 0xffb060, 6, 0.06);
  }

  explosion(pos) {
    const v = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 7);
      this.spawnParticle(pos, v, { color: i % 3 ? 0xff7a1a : 0xffd070, size: 0.8 + Math.random() * 0.8, life: 0.5 + Math.random() * 0.4, grow: 2.5 });
    }
    for (let i = 0; i < 12; i++) {
      v.set(Math.random() - 0.5, 0.3 + Math.random(), Math.random() - 0.5).multiplyScalar(2.5);
      this.spawnParticle(pos, v, { color: 0x30343a, size: 1.2, life: 1.6, grow: 1.5, additive: false, opacity: 0.6 });
    }
    this.pulseLight(pos, 0xff8a30, 70, 0.5);
    this.shake = Math.max(this.shake, 1);
  }

  flashBang(pos) {
    this.pulseLight(pos, 0xffffff, 120, 0.25);
    const v = new THREE.Vector3();
    this.spawnParticle(pos, v, { color: 0xffffff, size: 4, life: 0.25, grow: 12 });
  }

  /** Creates, updates and removes volumetric-looking smoke clouds from snapshot data. */
  syncSmokes(list, dt) {
    const seen = new Set();
    for (const s of list) {
      const key = `${s.x.toFixed(1)}|${s.z.toFixed(1)}`;
      seen.add(key);
      let g = this.smokeGroups.get(key);
      if (!g) {
        g = { group: new THREE.Group(), puffs: [], age: 0 };
        g.group.position.set(s.x, s.y, s.z);
        for (let i = 0; i < 22; i++) {
          const mat = new THREE.SpriteMaterial({ map: this.smokeTexture, transparent: true, depthWrite: false, opacity: 0, fog: false });
          const sp = new THREE.Sprite(mat);
          const r = s.radius * 0.7 * Math.cbrt(Math.random());
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          sp.position.set(r * Math.sin(ph) * Math.cos(th), Math.abs(r * Math.cos(ph)) * 0.9 + 0.5, r * Math.sin(ph) * Math.sin(th));
          sp.userData = { base: s.radius * (0.7 + Math.random() * 0.5), spin: (Math.random() - 0.5) * 0.4 };
          g.puffs.push(sp);
          g.group.add(sp);
        }
        this.scene.add(g.group);
        this.smokeGroups.set(key, g);
      }
      g.age += dt;
      const grow = Math.min(1, g.age / 1.2);
      const fade = Math.min(1, s.time / 3);
      for (const p of g.puffs) {
        p.scale.setScalar(p.userData.base * (0.3 + 0.7 * grow));
        p.material.opacity = 0.88 * grow * fade;
        p.material.rotation += p.userData.spin * dt;
      }
    }
    for (const [key, g] of this.smokeGroups) {
      if (!seen.has(key)) {
        this.scene.remove(g.group);
        for (const p of g.puffs) p.material.dispose();
        this.smokeGroups.delete(key);
      }
    }
  }

  clearAll() {
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const p of this.particles) { p.life = 0; p.sprite.visible = false; }
    for (const d of this.decals) d.visible = false;
    this.syncSmokes([], 0);
  }

  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-1.5 * dt));
      p.size += p.grow * dt;
      p.sprite.scale.setScalar(p.size);
      p.sprite.material.opacity = p.fade * (p.life / p.max);
    }
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.light.intensity = Math.max(0, (l.life / l.max)) * l.peak;
    }
  }
}

