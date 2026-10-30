// Post-processing pipeline: world pass, weapon pass (depth cleared so the gun never clips
// into walls), bloom, vignette with film grain and screen flash/damage tints.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.55 },
    grain: { value: 0 },
    flash: { value: 0 },
    hurt: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float grain;
    uniform float flash;
    uniform float hurt;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.82, 0.18, length(d) * (1.0 + vignette));
      c.rgb *= mix(1.0 - vignette * 0.75, 1.0, v);
      c.rgb += (hash(vUv * 900.0) - 0.5) * 0.09 * grain;
      float edge = smoothstep(0.25, 0.8, length(d) * 1.6);
      c.rgb = mix(c.rgb, vec3(0.8, 0.02, 0.02), hurt * (0.25 + edge * 0.6));
      c.rgb = mix(c.rgb, vec3(1.0), flash);
      gl_FragColor = c;
    }
  `,
};

export class PostProcessing {
  constructor(gameRenderer, scene, viewmodel, settings) {
    this.gr = gameRenderer;
    this.scene = scene;
    this.viewmodel = viewmodel;
    this.settings = settings;
    this.composer = null;
    this.flash = 0;
    this.hurt = 0;
    this.build();
    settings.onChange(() => this.build());
    gameRenderer.onResize = (w, h, pr) => {
      this.composer?.setPixelRatio(pr);
      this.composer?.setSize(w, h);
      this.bloom?.setSize(w, h);
      viewmodel.resize(w / h);
    };
    viewmodel.resize(gameRenderer.camera.aspect);
  }

  get enabled() {
    return this.settings.preset.post;
  }

  build() {
    const r = this.gr.renderer;
    this.composer?.dispose?.();
    this.composer = null;
    this.bloom = null;
    if (!this.enabled) return;
    const size = r.getSize(new THREE.Vector2());
    const composer = new EffectComposer(r);
    composer.setPixelRatio(this.gr.pixelRatio);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.gr.camera));
    const gun = new RenderPass(this.viewmodel.scene, this.viewmodel.camera);
    gun.clear = false;
    gun.clearDepth = true;
    composer.addPass(gun);
    if (this.settings.preset.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.6, 0.92);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    composer.addPass(this.final);
    this.composer = composer;
  }

  render(dt) {
    const r = this.gr.renderer;
    this.flash = Math.max(0, this.flash - dt * 0.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    if (this.composer) {
      const u = this.final.uniforms;
      u.time.value = (u.time.value + dt) % 100;
      u.grain.value = this.settings.get('grain') ? 1 : 0;
      u.flash.value = Math.min(1, this.flash);
      u.hurt.value = this.hurt;
      this.composer.render(dt);
    } else {
      r.autoClear = false;
      r.clear();
      r.render(this.scene, this.gr.camera);
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }
}
