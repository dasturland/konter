// Builds the bunker scene from the shared map description. Static geometry is merged per
// material; repeated objects (lamps, barrels) use InstancedMesh.
import * as THREE from 'three';
import { WALL_HEIGHT } from '@konter/shared';
import { createTextures } from './textures.js';
import { mergeAll, pipeGeometry, rampGeometry, uvBox } from './geometry.js';
import { createSiteMarkers } from './sites.js';
import { LightRig } from './lighting.js';

const FOG_COLOR = 0x0b1118;

function mat(tex, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex.color,
    bumpMap: tex.bump ?? null,
    bumpScale: opts.bump ?? 1.2,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.25,
    color: opts.color ?? 0xffffff,
    side: opts.side ?? THREE.FrontSide,
  });
}

function hash2(i) {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export class Level {
  constructor(map, settings) {
    this.map = map;
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.011);
    this.textures = createTextures();
    this.flickerLamps = [];
    this.lamps = [];
    this.time = 0;
    this.build();
    this.rig = new LightRig(this.scene, this.lamps);
  }

  build() {
    const t = this.textures;
    const m = {
      wall: mat(t.wall, { bump: 1.5 }),
      floor: mat(t.floor, { roughness: 0.6, metalness: 0.6, bump: 1.0 }),
      deck: mat(t.floor, { roughness: 0.6, metalness: 0.6, bump: 1.0, side: THREE.DoubleSide }),
      ceiling: mat(t.ceiling, { roughness: 0.95, metalness: 0, bump: 0.8 }),
      beam: mat(t.beam, { roughness: 0.8, metalness: 0.5, bump: 2 }),
      hazard: mat(t.hazard, { roughness: 0.7, metalness: 0.2, bump: 0.8 }),
      crate: mat(t.crate, { roughness: 0.65, metalness: 0.55, bump: 1.4 }),
      barrel: mat(t.barrel, { roughness: 0.55, metalness: 0.6, bump: 1.2 }),
      vent: mat(t.vent, { roughness: 0.7, metalness: 0.6 }),
      pipe: new THREE.MeshStandardMaterial({ color: 0x59626a, roughness: 0.5, metalness: 0.8 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.8 }),
      lampHousing: new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.6, metalness: 0.7 }),
    };
    this.materials = m;
    const [bx0, bz0] = this.map.bounds.min;
    const [bx1, bz1] = this.map.bounds.max;
    const buckets = { wall: [], deck: [], crate: [], hazard: [], beam: [], floor: [], ceiling: [], vent: [], pipe: [], metal: [], housing: [] };
    const barrels = [];

    buckets.floor.push(uvBox([bx0 - 2, -0.6, bz0 - 2], [bx1 + 2, 0, bz1 + 2], 2));
    buckets.ceiling.push(uvBox([bx0 - 2, WALL_HEIGHT, bz0 - 2], [bx1 + 2, WALL_HEIGHT + 0.5, bz1 + 2], 4));

    this.map.boxes.forEach((b, i) => {
      const off = [hash2(i), hash2(i + 91)];
      switch (b.kind) {
        case 'wall':
          buckets.wall.push(uvBox(b.min, b.max, 4, off));
          this.addWallBase(buckets.hazard, b);
          break;
        case 'pillar':
          buckets.wall.push(uvBox(b.min, b.max, 4, off));
          break;
        case 'crate':
          buckets.crate.push(uvBox(b.min, b.max, Math.max(1.5, Math.min(b.max[0] - b.min[0], 3)), off));
          break;
        case 'barrel':
          barrels.push(b);
          break;
        case 'stairs':
        case 'platform':
          buckets.deck.push(uvBox(b.min, b.max, 2, off));
          break;
        default:
          buckets.wall.push(uvBox(b.min, b.max, 4, off));
      }
    });
    for (const r of this.map.ramps) buckets.deck.push(rampGeometry(r));

    // Corrugated rusty beams crossing under the ceiling.
    for (let z = bz0 + 6; z < bz1; z += 14) {
      buckets.beam.push(uvBox([bx0, WALL_HEIGHT - 0.55, z - 0.35], [bx1, WALL_HEIGHT, z + 0.35], 2));
    }
    for (const x of [-40, -20, 0, 20, 40]) {
      buckets.beam.push(uvBox([x - 0.3, WALL_HEIGHT - 0.9, bz0], [x + 0.3, WALL_HEIGHT - 0.5, bz1], 2));
    }

    const lampSteady = [];
    const lampFlicker = [];
    let pipeIndex = 0;
    for (const p of this.map.props) {
      if (p.type === 'lamp') {
        const flick = hash2(p.pos[0] * 3 + p.pos[2]) > 0.82;
        (flick ? lampFlicker : lampSteady).push(p);
        this.lamps.push({ pos: new THREE.Vector3(p.pos[0], p.pos[1] - 0.2, p.pos[2]), flicker: flick, phase: hash2(p.pos[0] * 7 + p.pos[2]) * 100 });
        buckets.housing.push(uvBox([p.pos[0] - 1.15, p.pos[1] + 0.05, p.pos[2] - 0.4], [p.pos[0] + 1.15, p.pos[1] + 0.4, p.pos[2] + 0.4], 2));
      } else if (p.type === 'vent') {
        const sx = p.size[0];
        const sy = p.size[1];
        const east = p.facing === 'east';
        buckets.vent.push(uvBox([p.pos[0] - 0.06, p.pos[1] - sy / 2, p.pos[2] - sx / 2], [p.pos[0] + 0.06, p.pos[1] + sy / 2, p.pos[2] + sx / 2], 1.2, [east ? 0 : 0.5, 0]));
      } else if (p.type === 'pipe') {
        buckets.pipe.push(pipeGeometry(p.from, p.to, p.radius));
        pipeIndex++;
      } else if (p.type === 'hazard_stripe') {
        const w = p.size[0];
        const d = p.size[1];
        buckets.hazard.push(uvBox([p.pos[0] - w / 2, 0, p.pos[2] - d / 2], [p.pos[0] + w / 2, 0.03, p.pos[2] + d / 2], 1.2));
      } else if (p.type === 'terminal') {
        this.addTerminal(p);
      }
    }
    this.pipeCount = pipeIndex;

    const add = (key, material, cast = true, receive = true) => {
      const g = mergeAll(buckets[key]);
      if (!g) return;
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
    };
    add('wall', m.wall);
    add('deck', m.deck);
    add('crate', m.crate);
    add('hazard', m.hazard, false);
    add('floor', m.floor, false);
    add('ceiling', m.ceiling, false, false);
    add('beam', m.beam, false, false);
    add('vent', m.vent, false);
    add('pipe', m.pipe, false);
    add('metal', m.metal, true);
    add('housing', m.lampHousing, false, false);

    this.addBarrels(barrels, m.barrel);
    this.addLamps(lampSteady, lampFlicker);
    this.sites = createSiteMarkers(this.map);
    this.scene.add(this.sites.group);
  }

  /** Yellow-black stripes along both sides of a wall base. */
  addWallBase(list, b) {
    const t = 0.04;
    const h = 0.35;
    const longX = (b.max[0] - b.min[0]) > (b.max[2] - b.min[2]);
    if (longX) {
      list.push(uvBox([b.min[0], 0, b.min[2] - t], [b.max[0], h, b.min[2]], 1.2));
      list.push(uvBox([b.min[0], 0, b.max[2]], [b.max[0], h, b.max[2] + t], 1.2));
    } else {
      list.push(uvBox([b.min[0] - t, 0, b.min[2]], [b.min[0], h, b.max[2]], 1.2));
      list.push(uvBox([b.max[0], 0, b.min[2]], [b.max[0] + t, h, b.max[2]], 1.2));
    }
  }

  addTerminal(p) {
    const [x, , z] = p.pos;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = p.rotation;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.5), this.materials.metal);
    body.position.set(0, 0.75, 0);
    body.castShadow = true;
    g.add(body);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.textures.screen.color, color: new THREE.Color(1.6, 1.8, 2.4) });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), screenMat);
    screen.position.set(0, 1.0, 0.26);
    g.add(screen);
    const green = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.5) }));
    green.position.set(-0.2, 0.45, 0.27);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.25) }));
    red.position.set(0.2, 0.45, 0.27);
    g.add(green, red);
    const glow = new THREE.PointLight(0x4aa3ff, 0.6, 5, 2);
    glow.position.set(0, 1.0, 0.9);
    g.add(glow);
    this.scene.add(g);
    this.terminalScreens = this.terminalScreens ?? [];
    this.terminalScreens.push(screenMat);
  }

  addBarrels(list, material) {
    if (list.length === 0) return;
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 14, 1);
    geo.translate(0, 0.6, 0);
    const inst = new THREE.InstancedMesh(geo, material, list.length);
    const mtx = new THREE.Matrix4();
    list.forEach((b, i) => {
      mtx.makeTranslation((b.min[0] + b.max[0]) / 2, 0, (b.min[2] + b.max[2]) / 2);
      inst.setMatrixAt(i, mtx);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  addLamps(steady, flicker) {
    const geo = new THREE.BoxGeometry(2.0, 0.06, 0.6);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const make = (list) => {
      const inst = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
      inst.count = list.length;
      const mtx = new THREE.Matrix4();
      const c = new THREE.Color(2.6, 2.9, 3.3);
      list.forEach((p, i) => {
        mtx.makeTranslation(p.pos[0], p.pos[1], p.pos[2]);
        inst.setMatrixAt(i, mtx);
        inst.setColorAt(i, c);
      });
      this.scene.add(inst);
      return inst;
    };
    this.steadyLamps = make(steady);
    this.flickerMesh = make(flicker);
    this.flickerLamps = flicker.map((p, i) => ({ index: i, phase: hash2(p.pos[0] * 7 + p.pos[2]) * 100 }));
    this.tmpColor = new THREE.Color();
  }

  /** Flicker lamps and pulse site markers. */
  update(dt, camera) {
    this.time += dt;
    const tm = this.time;
    for (const l of this.flickerLamps) {
      const s = Math.sin(tm * 23 + l.phase) * Math.sin(tm * 7.3 + l.phase * 1.7);
      const on = s > -0.55 ? 1 : 0.08;
      l.level = on;
      this.tmpColor.setRGB(2.6 * on, 2.9 * on, 3.3 * on);
      this.flickerMesh.setColorAt(l.index, this.tmpColor);
    }
    if (this.flickerLamps.length) this.flickerMesh.instanceColor.needsUpdate = true;
    this.sites.update(tm);
    this.rig.update(dt, camera.position, this.time);
  }

  setQuality(preset) {
    this.rig.setQuality(preset);
    this.scene.fog.density = preset.fog ? 0.011 : 0;
  }
}
