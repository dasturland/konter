// Geometry helpers: world-space UV boxes, merging and ramps. Everything is merged per material
// so the whole level costs only a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Box between two corners whose UVs are scaled by face size, so a texture keeps a constant
 * physical size on every face. `tile` is the world size of one texture repeat.
 */
export function uvBox(min, max, tile = 4, offset = [0, 0]) {
  const w = max[0] - min[0];
  const h = max[1] - min[1];
  const d = max[2] - min[2];
  const g = new THREE.BoxGeometry(w, h, d);
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (faces[f][0] / tile) + offset[0], uv.getY(i) * (faces[f][1] / tile) + offset[1]);
    }
  }
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}

/** Merges a list of geometries into one non-indexed geometry. Returns null for an empty list. */
export function mergeAll(list) {
  if (list.length === 0) return null;
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
  }
  const merged = mergeGeometries(flat, false);
  for (const g of list) g.dispose();
  return merged;
}

/** Sloped solid for a ramp description from the shared map. */
export function rampGeometry(ramp, tile = 2) {
  const [x0, z0] = ramp.min;
  const [x1, z1] = ramp.max;
  const hAt = (x, z) => {
    const t = ramp.axis === 'x' ? (x - x0) / (x1 - x0) : (z - z0) / (z1 - z0);
    return ramp.y0 + (ramp.y1 - ramp.y0) * t;
  };
  const p = (x, z, y = hAt(x, z)) => [x, y, z];
  const tris = [];
  const quad = (a, b, c, d) => tris.push(a, b, c, a, c, d);
  quad(p(x0, z0), p(x0, z1), p(x1, z1), p(x1, z0));
  quad(p(x0, z0, 0), p(x1, z0, 0), p(x1, z1, 0), p(x0, z1, 0));
  const hi = ramp.axis === 'x' ? 1 : 0;
  // Side walls.
  tris.push(p(x0, z0, 0), p(x0, z0), p(x1, z0), p(x0, z0, 0), p(x1, z0), p(x1, z0, 0));
  tris.push(p(x0, z1, 0), p(x1, z1, 0), p(x1, z1), p(x0, z1, 0), p(x1, z1), p(x0, z1));
  if (hi) {
    tris.push(p(x1, z0, 0), p(x1, z0), p(x1, z1), p(x1, z0, 0), p(x1, z1), p(x1, z1, 0));
  } else {
    tris.push(p(x1, z1, 0), p(x1, z1), p(x0, z1), p(x1, z1, 0), p(x0, z1), p(x0, z1, 0));
  }
  const pos = new Float32Array(tris.length * 3);
  const uvs = new Float32Array(tris.length * 2);
  tris.forEach((v, i) => {
    pos.set(v, i * 3);
    uvs[i * 2] = (v[0] + v[2] * 0.5) / tile;
    uvs[i * 2 + 1] = (v[2] + v[1]) / tile;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Cylinder between two points. */
export function pipeGeometry(from, to, radius) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius, len, 10, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.uv.array.map((v, i) => (i % 2 ? v * len / 3 : v))), 2));
  return g;
}
