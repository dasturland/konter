// Cold white-blue lighting: hemisphere fill, one soft shadow sun that follows the player and a
// small pool of point lights that hop to the lamps nearest to the camera.
import * as THREE from 'three';

const POOL = 5;

export class LightRig {
  constructor(scene, lamps) {
    this.lamps = lamps;
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1d22, 0.55);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xcfe2ff, 0.9);
    this.sun.userData.shadowCapable = true;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 4;
    scene.add(this.sun, this.sun.target);
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xdbe8ff, 18, 24, 1.6);
      l.userData.base = 18;
      scene.add(l);
      this.pool.push(l);
    }
    this.refresh = 0;
    this.assigned = [];
    this.maxPool = POOL;
  }

  setQuality(preset) {
    this.maxPool = preset.shadows ? POOL : 3;
    this.sun.castShadow = preset.shadows;
    if (preset.shadows) {
      this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.pool.forEach((l, i) => { l.visible = i < this.maxPool; });
  }

  update(dt, camPos, time) {
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 0.25;
      const sorted = this.lamps
        .map((l) => ({ l, d: l.pos.distanceToSquared(camPos) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.maxPool);
      this.assigned = sorted.map((s) => s.l);
      this.assigned.forEach((lamp, i) => this.pool[i].position.copy(lamp.pos));
    }
    this.assigned.forEach((lamp, i) => {
      let k = 1;
      if (lamp.flicker) {
        const s = Math.sin(time * 23 + lamp.phase) * Math.sin(time * 7.3 + lamp.phase * 1.7);
        k = s > -0.55 ? 1 : 0.08;
      }
      this.pool[i].intensity = this.pool[i].userData.base * k;
    });
    this.sun.position.set(camPos.x + 8, camPos.y + 24, camPos.z + 10);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();
  }
}
