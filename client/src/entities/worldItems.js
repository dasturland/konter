// Dynamic non-player objects: thrown grenades, dropped weapons, the dropped and planted bomb.
import * as THREE from 'three';

const grenadeGeo = new THREE.SphereGeometry(0.07, 10, 8);
const dropGeo = new THREE.BoxGeometry(0.25, 0.08, 0.8);
const bombGeo = new THREE.BoxGeometry(0.5, 0.25, 0.35);
const GRENADE_COLORS = { smoke: 0x9aa4ab, flash: 0xf2f2f8, he: 0x4b6b38 };

export class WorldItems {
  constructor(scene) {
    this.scene = scene;
    this.grenades = new Map();
    this.drops = new Map();
    this.bomb = new THREE.Group();
    const body = new THREE.Mesh(bombGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f26, roughness: 0.6, metalness: 0.5 }));
    body.position.y = 0.13;
    body.castShadow = true;
    this.led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.15) }));
    this.led.position.set(0.12, 0.28, 0);
    this.bombLight = new THREE.PointLight(0xff2a20, 0, 6, 2);
    this.bombLight.position.y = 0.4;
    this.bomb.add(body, this.led, this.bombLight);
    this.bomb.visible = false;
    scene.add(this.bomb);
    this.time = 0;
    this.dropMat = new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 0.4, metalness: 0.8 });
  }

  update(snap, dt) {
    this.time += dt;
    const live = new Set();
    for (const g of snap.grenades) {
      live.add(g.id);
      let m = this.grenades.get(g.id);
      if (!m) {
        m = new THREE.Mesh(grenadeGeo, new THREE.MeshStandardMaterial({ color: GRENADE_COLORS[g.type] ?? 0x888888, roughness: 0.5, metalness: 0.4 }));
        m.castShadow = true;
        this.scene.add(m);
        this.grenades.set(g.id, m);
      }
      m.position.set(g.pos[0], g.pos[1], g.pos[2]);
    }
    for (const [id, m] of this.grenades) if (!live.has(id)) { this.scene.remove(m); this.grenades.delete(id); }

    const seenDrops = new Set();
    for (const d of snap.drops) {
      seenDrops.add(d.id);
      let m = this.drops.get(d.id);
      if (!m) {
        m = new THREE.Mesh(dropGeo, this.dropMat);
        m.castShadow = true;
        this.scene.add(m);
        this.drops.set(d.id, m);
      }
      m.position.set(d.x, d.y + 0.06, d.z);
      m.rotation.y = this.time * 0.6;
    }
    for (const [id, m] of this.drops) if (!seenDrops.has(id)) { this.scene.remove(m); this.drops.delete(id); }

    const b = snap.bomb;
    const pos = b.pos ?? b.dropped;
    this.bomb.visible = !!pos;
    if (pos) {
      this.bomb.position.set(pos[0], 0, pos[1]);
      const planted = b.state === 'planted';
      const rate = planted ? Math.max(1.5, 8 - b.timer / 6) : 1;
      const on = planted && (this.time * rate) % 1 < 0.2;
      this.led.visible = planted ? on : true;
      this.bombLight.intensity = on ? 6 : 0;
    }
  }
}
