// 渲染引擎：负责 Three.js 场景、相机、控制器、后期辉光、CSS2D 标签层、拾取与主循环。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';

/** 所有自定义着色器共享的时间 uniform（每帧更新一次） */
export const globalUniforms = { uTime: { value: 0 } };

const BG = 0x060912;

export class Engine {
  constructor(host) {
    this.host = host;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    host.appendChild(this.labelRenderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 55, 150);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.camera.position.set(0, 7, 24);

    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 160;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.zoomSpeed = 0.9;

    // 灯光
    scene.add(new THREE.HemisphereLight(0x9ec5ff, 0x0b0f1c, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(10, 18, 14);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8b5cf6, 0.9);
    rim.position.set(-14, 6, -12);
    scene.add(rim);

    this.ground = makeGround();
    scene.add(this.ground);
    this.dust = makeDust();
    scene.add(this.dust);

    // 后期：MSAA 渲染目标 + 辉光 + 输出（色调映射/色彩空间）
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.inset = { right: 0, bottom: 0 };
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.updaters = new Set();
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();

    // 拾取（hover / click）
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickables = new Set();
    this.hovered = null;
    this._down = null;
    const el = renderer.domElement;
    el.addEventListener('pointermove', (e) => this._onMove(e));
    el.addEventListener('pointerdown', (e) => (this._down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => this._onUp(e));

    window.addEventListener('resize', () => this.resize());
    this.resize();
    renderer.setAnimationLoop(() => this._frame());
  }

  /** 讲解面板遮住的区域（像素），用于把场景中心挪到可见区域中央 */
  setInset(right, bottom) {
    this.inset = { right, bottom };
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    const cam = this.camera;
    const { right, bottom } = this.inset;
    // 以"未被面板遮挡的区域"作为相机的完整视口（光轴在其中心、像素保持正方形），
    // 实际画布比它更大，多出来的部分延伸到面板底下。
    const fw = Math.max(1, w - right);
    const fh = Math.max(1, h - bottom);
    cam.aspect = fw / fh;
    if (right > 0 || bottom > 0) cam.setViewOffset(fw, fh, 0, 0, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  /** 可见区域宽高比 —— 窄屏时相机自动拉远 */
  fitFactor() {
    const w = (this.host.clientWidth || window.innerWidth) - this.inset.right;
    const h = (this.host.clientHeight || window.innerHeight) - this.inset.bottom;
    const aspect = w / Math.max(h, 1);
    if (aspect >= 1.45) return 1;
    return Math.min(2.4, 1.45 / aspect);
  }

  /** 相机飞行到 [px,py,pz, tx,ty,tz] */
  flyTo(cam, duration = 1.6) {
    if (!cam) return;
    const [px, py, pz, tx, ty, tz] = cam;
    const target = new THREE.Vector3(tx, ty, tz);
    const pos = new THREE.Vector3(px, py, pz).sub(target).multiplyScalar(this.fitFactor()).add(target);
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    if (duration <= 0) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power2.inOut' });
    gsap.to(this.controls.target, { x: tx, y: ty, z: tz, duration, ease: 'power2.inOut' });
  }

  setBloom(on) {
    this.bloom.enabled = on;
  }

  /** 注册一个每帧回调，返回取消函数 */
  onFrame(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  // ───── 拾取 ─────
  addPickable(obj, handlers) {
    obj.userData.pick = handlers;
    this.pickables.add(obj);
    return () => this.pickables.delete(obj);
  }
  clearPickables() {
    this.pickables.clear();
    this.hovered = null;
    this.renderer.domElement.style.cursor = '';
  }
  _hit(e) {
    if (!this.pickables.size) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const list = [...this.pickables].filter((o) => o.visible && isShown(o));
    const hits = this.raycaster.intersectObjects(list, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return { obj: o, hit: h };
    }
    return null;
  }
  _onMove(e) {
    const r = this._hit(e);
    const obj = r ? r.obj : null;
    if (obj !== this.hovered) {
      this.hovered?.userData.pick?.onHover?.(false, this.hovered);
      this.hovered = obj;
      obj?.userData.pick?.onHover?.(true, obj, r.hit);
      this.renderer.domElement.style.cursor = obj?.userData.pick?.onClick ? 'pointer' : '';
    }
  }
  _onUp(e) {
    if (!this._down) return;
    const moved = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
    this._down = null;
    if (moved > 5) return;
    const r = this._hit(e);
    r?.obj.userData.pick?.onClick?.(r.obj, r.hit);
  }

  _frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    globalUniforms.uTime.value = t;
    this.controls.update();
    this.dust.rotation.y = t * 0.01;
    this.dust.material.uniforms.uTime.value = t;
    for (const fn of this.updaters) fn(dt, t);
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}

function isShown(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

/** 无限网格地面（距离渐隐） */
function makeGround() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x3b5bdb) }, uOpacity: { value: 0.55 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vWorld;
      float grid(vec2 p, float s) {
        vec2 c = p / s;
        vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float d = length(vWorld.xz);
        float fade = 1.0 - smoothstep(14.0, 70.0, d);
        float a = max(grid(vWorld.xz, 1.0) * 0.25, grid(vWorld.xz, 5.0) * 0.7) * fade * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.02;
  mesh.renderOrder = -1;
  return mesh;
}

/** 漂浮的微光粒子，营造氛围 */
function makeDust() {
  const N = 700;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 140;
    pos[i * 3 + 1] = Math.random() * 40 - 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uTime; varying float vA;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.2 + seed * 40.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.5 + seed * 2.5) * (60.0 / -mv.z);
        vA = 0.25 + 0.5 * seed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(0.55, 0.7, 1.0, a * 0.6);
      }`,
  });
  return new THREE.Points(g, mat);
}
