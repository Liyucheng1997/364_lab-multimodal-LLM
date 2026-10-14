// 章节基类：每一章 = 一个 3D 场景 + 若干"步骤"。
// 约定：go(step) 必须是"状态式"的——无论从哪一步跳过来，都把场景动画到该步骤应有的样子。
import * as THREE from 'three';
import gsap from 'gsap';
import { disposeTree } from './kit.js';

export class Chapter {
  /** 子类覆盖：{ id, title, subtitle } */
  static meta = {};
  /** 子类覆盖：[{ title, html, cam:[px,py,pz,tx,ty,tz] }] */
  static steps = [];

  constructor(engine, app) {
    this.engine = engine;
    this.app = app;
    this.root = new THREE.Group();
    engine.scene.add(this.root);
    this.step = -1;
    this.tl = gsap.timeline();
    this.stepTweens = [];
    this.loops = [];
    this.offs = [];
    this.offs.push(engine.onFrame((dt, t) => this.update(dt, t)));
  }

  /** 异步资源加载（如分词器） */
  async init() {}
  /** 构建场景（只调用一次） */
  build() {}
  /** 切换到某一步 */
  go(_step, _prev) {}
  /** 每帧调用 */
  update(_dt, _t) {}
  /** 渲染该步骤的交互控件，返回清理函数（可选） */
  widget(_step, _el) {
    return null;
  }

  /** 新建本步骤时间轴：杀掉上一步尚未完成的动画 */
  newTimeline() {
    this.tl.kill();
    for (const t of this.stepTweens) t.kill();
    this.stepTweens = [];
    this.tl = gsap.timeline();
    return this.tl;
  }

  /** 本步骤内的零散补间（换步时自动终止） */
  tw(target, vars) {
    const t = gsap.to(target, vars);
    this.stepTweens.push(t);
    return t;
  }
  /** 本步骤内的延时调用 */
  later(sec, fn) {
    const t = gsap.delayedCall(sec, fn);
    this.stepTweens.push(t);
    return t;
  }
  /** 贯穿整章的循环动画 */
  loop(tween) {
    this.loops.push(tween);
    return tween;
  }

  add(...objs) {
    this.root.add(...objs);
    return objs[0];
  }

  pick(obj, handlers) {
    this.offs.push(this.engine.addPickable(obj, handlers));
  }

  /** 快捷：在时间轴 at 时刻把对象淡到 a */
  fade(obj, a, at = 0, duration = 0.6) {
    if (!obj) return;
    const cur = obj.opacity;
    if (Math.abs(cur - a) < 0.002) return;
    this.tl.to(obj, { opacity: a, duration, ease: 'power2.out' }, at);
  }
  /** 快捷：移动 */
  move(obj, p, at = 0, duration = 1, ease = 'power2.inOut') {
    this.tl.to(obj.position, { x: p.x, y: p.y, z: p.z, duration, ease }, at);
  }
  /** 快捷：缩放 */
  scaleTo(obj, s, at = 0, duration = 0.6, ease = 'power2.out') {
    const v = typeof s === 'number' ? { x: s, y: s, z: s } : s;
    this.tl.to(obj.scale, { ...v, duration, ease }, at);
  }

  dispose() {
    this.tl.kill();
    for (const t of this.stepTweens) t.kill();
    for (const t of this.loops) t.kill();
    for (const off of this.offs) off();
    this.root.traverse((o) => {
      gsap.killTweensOf(o);
      gsap.killTweensOf(o.position);
      gsap.killTweensOf(o.scale);
      gsap.killTweensOf(o.rotation);
      if (o.material) gsap.killTweensOf(o.material);
    });
    this.engine.scene.remove(this.root);
    disposeTree(this.root);
    this.onDispose?.();
  }
}
