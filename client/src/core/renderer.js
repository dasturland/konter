// WebGL renderer, main camera and quality handling.
import * as THREE from 'three';

export class GameRenderer {
  constructor(container, settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 260);
    this.camera.rotation.order = 'YXZ';
    this.baseFov = settings.get('fov');
    this.zoom = 1;
    this.container = container;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get preset() {
    return this.settings.preset;
  }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.baseFov = this.settings.get('fov');
    this.camera.fov = this.baseFov / this.zoom;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h, this.pixelRatio);
  }

  /** Applies a field of view divided by a zoom factor (ADS / scope). */
  setZoom(zoom) {
    if (Math.abs(zoom - this.zoom) < 1e-4) return;
    this.zoom = zoom;
    this.camera.fov = this.settings.get('fov') / zoom;
    this.camera.updateProjectionMatrix();
  }

  /** Re-applies the quality preset to renderer shadow state. */
  applyQuality(scene) {
    const p = this.preset;
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.traverse((o) => {
      if (o.isLight && o.userData.shadowCapable) {
        o.castShadow = p.shadows;
        if (p.shadows && o.shadow) {
          o.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
          if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
        }
      }
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
    this.resize();
  }
}
