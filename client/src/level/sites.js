// Bomb site markers: yellow-black ring on the floor, pulsing glow and a big letter.
import * as THREE from 'three';

function letterTexture(letter) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.font = 'bold 210px "Arial Black", Impact, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 14;
  x.strokeStyle = '#0b0b0b';
  x.strokeText(letter, 128, 140);
  x.fillStyle = '#ffd21f';
  x.fillText(letter, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hazardRing(inner, outer, segments) {
  const yellow = [];
  const black = [];
  const arc = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const g = new THREE.RingGeometry(inner, outer, 6, 1, i * arc, arc);
    (i % 2 ? black : yellow).push(g.toNonIndexed());
  }
  return { yellow, black };
}

export function createSiteMarkers(map) {
  const group = new THREE.Group();
  const pulses = [];
  const yellowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.2, 0.2), side: THREE.DoubleSide });
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.DoubleSide });
  for (const site of map.sites) {
    const [cx, cz] = site.center;
    const holder = new THREE.Group();
    holder.position.set(cx, 0.045, cz);
    holder.rotation.x = -Math.PI / 2;
    const { yellow, black } = hazardRing(7.2, 8.2, 32);
    const merge = (list, material) => {
      const total = list.reduce((n, g) => n + g.attributes.position.count, 0);
      const pos = new Float32Array(total * 3);
      let o = 0;
      for (const g of list) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      holder.add(new THREE.Mesh(geo, material));
    };
    merge(yellow, yellowMat);
    merge(black, blackMat);

    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.3, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(7.1, 48), glowMat);
    glow.position.z = 0.01;
    holder.add(glow);
    const pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.35, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.6, 0.2), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    pulseRing.position.z = 0.02;
    holder.add(pulseRing);

    const floorLetter = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id), transparent: true, depthWrite: false }),
    );
    floorLetter.position.z = 0.03;
    holder.add(floorLetter);
    group.add(holder);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(site.id), transparent: true, fog: false }));
    sprite.scale.set(4, 4, 1);
    sprite.position.set(cx, 3.6, cz);
    group.add(sprite);
    pulses.push({ glowMat, pulseRing, sprite });
  }
  return {
    group,
    update(time) {
      for (const p of pulses) {
        const s = (Math.sin(time * 3) + 1) / 2;
        p.glowMat.opacity = 0.12 + s * 0.28;
        const k = 0.6 + ((time * 0.8) % 1) * 1.7;
        p.pulseRing.scale.setScalar(k);
        p.pulseRing.material.opacity = 0.9 * (1 - ((time * 0.8) % 1));
        p.sprite.position.y = 3.6 + Math.sin(time * 2) * 0.15;
        p.sprite.scale.setScalar(3.6 + s * 0.8);
      }
    },
  };
}
