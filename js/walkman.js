// WALKMAN '26 —— 3D 模型与机械动画
// 设计语言参考 Teenage Engineering TP-7：扁平铝合金一体机身、
// 中央马达卷带盘（可弹出的"磁带盘"）、侧边实体传输键、琥珀色细节
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tweenAsync, Ease, lerp, damp } from './tween.js';

const C = {
  alu: 0xc9cdd3,
  aluDeep: 0x9a9ea6,
  ink: 0x17181a,
  disc: 0x141517,
  tape: 0x1f1b16,
  cavity: 0x0b0c0e,
  amber: 0xff8a3d,
};

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function circlePath(cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return p;
}

function iconMesh(kind, size, color) {
  const shapes = [];
  const tri = (dx = 0, dir = 1) => {
    const s = new THREE.Shape();
    s.moveTo(dx - 0.5 * size * dir, -0.58 * size);
    s.lineTo(dx - 0.5 * size * dir, 0.58 * size);
    s.lineTo(dx + 0.62 * size * dir, 0);
    s.closePath();
    return s;
  };
  const rect = (cx, cy, w, h) => {
    const s = new THREE.Shape();
    s.moveTo(cx - w / 2, cy - h / 2);
    s.lineTo(cx + w / 2, cy - h / 2);
    s.lineTo(cx + w / 2, cy + h / 2);
    s.lineTo(cx - w / 2, cy + h / 2);
    s.closePath();
    return s;
  };
  if (kind === 'play') shapes.push(tri(0.06 * size, 1));
  else if (kind === 'pause') { shapes.push(rect(-0.3 * size, 0, 0.32 * size, 1.1 * size)); shapes.push(rect(0.3 * size, 0, 0.32 * size, 1.1 * size)); }
  else if (kind === 'stop') shapes.push(rect(0, 0, 0.95 * size, 0.95 * size));
  else if (kind === 'ff') { shapes.push(tri(-0.42 * size, 1)); shapes.push(tri(0.52 * size, 1)); }
  else if (kind === 'rew') { shapes.push(tri(0.42 * size, -1)); shapes.push(tri(-0.52 * size, -1)); }
  else if (kind === 'eject') {
    const t = new THREE.Shape();
    t.moveTo(-0.55 * size, 0.02 * size);
    t.lineTo(0.55 * size, 0.02 * size);
    t.lineTo(0, 0.75 * size);
    t.closePath();
    shapes.push(t);
    shapes.push(rect(0, -0.38 * size, 1.1 * size, 0.24 * size));
  }
  const geo = new THREE.ShapeGeometry(shapes);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

function textPlane(text, w, h, opts = {}) {
  const px = 110;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * px); cv.height = Math.round(h * px);
  const c = cv.getContext('2d');
  c.fillStyle = opts.bg || 'rgba(0,0,0,0)';
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = opts.color || '#70747d';
  c.font = `${opts.weight || 500} ${Math.round((opts.size || 0.3) * px)}px ${opts.font || '"Space Grotesk", "Helvetica Neue", sans-serif'}`;
  c.textAlign = opts.align || 'center';
  c.textBaseline = 'middle';
  const tx = opts.align === 'left' ? 0 : cv.width / 2;
  c.fillText(text, tx, cv.height / 2 + (opts.dy || 0));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opts.opacity ?? 1 })
  );
}

export class Walkman {
  constructor(displayTexture) {
    this.group = new THREE.Group();
    this.tapeIn = false;      // 初始出仓，等待开场"上盘"动画
    this.busy = false;
    this.t = 0;
    this.hover = null;
    this.hitTargets = [];
    this._buttons = {};
    this._reelSpeed = 0;
    this._haloP = -1;
    this._haloSeek = 0;

    this.diskC = new THREE.Vector2(0, 0.35);   // 转盘中心（机身坐标）
    this.recessR = 3.35;

    this._mats();
    this._body();
    this._display(displayTexture);
    this._keys();
    this._roller();
    this._puck();
    this._halo();
    this._detail();

    // 初始姿态：磁带盘悬浮在机身前方
    this.cassette.position.copy(this.cassetteOutPos);
    this.cassette.rotation.x = -0.15;

    this.group.scale.setScalar(0.72);
  }

  _mats() {
    this.matAlu = new THREE.MeshStandardMaterial({ color: C.alu, metalness: 0.9, roughness: 0.36 });
    this.matAluDeep = new THREE.MeshStandardMaterial({ color: C.aluDeep, metalness: 0.9, roughness: 0.32 });
    this.matCavity = new THREE.MeshStandardMaterial({ color: C.cavity, metalness: 0.2, roughness: 0.85, side: THREE.BackSide, envMapIntensity: 0.3 });
    this.matDisc = new THREE.MeshStandardMaterial({ color: C.disc, metalness: 0.35, roughness: 0.5 });
    this.matTape = new THREE.MeshStandardMaterial({ color: C.tape, metalness: 0.1, roughness: 0.72 });
    this.matAmber = new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.4 });
    this.matOrange = new THREE.MeshStandardMaterial({ color: C.amber, metalness: 0.65, roughness: 0.34 });
  }

  _body() {
    const W = 7.9, H = 11.8, D = 1.5, BV = 0.13;
    this.bodyW = W; this.bodyH = H;
    const shape = roundedRectShape(W, H, 1.15);
    shape.holes.push(circlePath(this.diskC.x, this.diskC.y, this.recessR));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D, curveSegments: 56,
      bevelEnabled: true, bevelThickness: BV, bevelSize: BV, bevelSegments: 4,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const halfD = (bb.max.z - bb.min.z) / 2;
    geo.translate(0, 0, -(bb.min.z + bb.max.z) / 2);
    this.frontZ = halfD;
    this.backZ = -halfD;
    this.sideX = W / 2 + BV;   // 侧面 x

    const body = new THREE.Mesh(geo, this.matAlu);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // 转盘凹槽内壁 + 底板 + 主轴
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(this.recessR, this.recessR, halfD * 2 - 0.2, 56, 1, true).rotateX(Math.PI / 2),
      this.matCavity
    );
    cup.position.set(this.diskC.x, this.diskC.y, 0);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(this.recessR, 56),
      new THREE.MeshStandardMaterial({ color: C.cavity, metalness: 0.2, roughness: 0.9, envMapIntensity: 0.3 })
    );
    floor.position.set(this.diskC.x, this.diskC.y, this.backZ + 0.12);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24).rotateX(Math.PI / 2), this.matAluDeep);
    spindle.position.set(this.diskC.x, this.diskC.y, this.backZ + 0.3);
    for (let i = 0; i < 3; i++) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10).rotateX(Math.PI / 2), this.matAluDeep);
      const a = (i / 3) * Math.PI * 2;
      pin.position.set(this.diskC.x + Math.cos(a) * 0.19, this.diskC.y + Math.sin(a) * 0.19, this.backZ + 0.33);
      this.group.add(pin);
    }
    this.group.add(cup, floor, spindle);
  }

  _display(texture) {
    const w = 2.75, h = 0.575;
    const cx = -1.35, cy = 4.5;
    const back = new THREE.Mesh(
      new RoundedBoxGeometry(w + 0.2, h + 0.2, 0.08, 2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0.3, roughness: 0.45 })
    );
    back.position.set(cx, cy, this.frontZ + 0.01);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffffff, emissiveMap: texture,
        emissiveIntensity: 1.15, roughness: 0.35, metalness: 0,
      })
    );
    screen.position.set(cx, cy, this.frontZ + 0.056);
    this.group.add(back, screen);
  }

  // 侧边实体键：右侧 REW/PLAY/FF，左侧 STOP/EJECT
  _keys() {
    const defs = [
      { action: 'rew', side: 1, y: 2.55, h: 1.2, icon: 'rew' },
      { action: 'play', side: 1, y: 0.95, h: 1.66, icon: 'play', accent: true },
      { action: 'ff', side: 1, y: -0.65, h: 1.2, icon: 'ff' },
      { action: 'stop', side: -1, y: 2.55, h: 1.2, icon: 'stop' },
      { action: 'eject', side: -1, y: 0.95, h: 1.2, icon: 'eject' },
    ];
    for (const d of defs) {
      const g = new THREE.Group();
      g.position.set(d.side * this.sideX, d.y, 0);
      g.userData.action = d.action;
      g.userData.pressAxis = -d.side;

      const pressGroup = new THREE.Group();
      const capMat = new THREE.MeshStandardMaterial({
        color: C.alu, metalness: 0.88, roughness: 0.3, emissive: 0x000000,
      });
      const key = new THREE.Mesh(new RoundedBoxGeometry(0.62, d.h, 0.92, 2, 0.1), capMat);
      key.position.x = d.side * 0.1;
      key.castShadow = true;
      pressGroup.add(key);

      // 放大点击区
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, d.h + 0.5, 1.6),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
      );
      hit.position.x = d.side * 0.3;
      pressGroup.add(hit);

      g.add(pressGroup);
      g.userData.pressGroup = pressGroup;
      g.userData.capMat = capMat;
      this.group.add(g);
      this._buttons[d.action] = g;
      this.hitTargets.push(g);

      // TE 式前面板丝印图标（对应侧键位置）
      const ic = iconMesh(d.icon, 0.155, d.accent ? C.amber : C.ink);
      ic.position.set(d.side * (this.bodyW / 2 - 0.42), d.y, this.frontZ + 0.011);
      this.group.add(ic);
    }
  }

  // 右侧下方琥珀色音量滚轮（TE 式橙色细节）
  _roller() {
    const g = new THREE.Group();
    g.position.set(this.sideX - 0.1, -2.5, 0);
    g.userData.action = 'knob';
    const spin = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 36).rotateX(Math.PI / 2), this.matOrange);
    wheel.castShadow = true;
    spin.add(wheel);
    for (let i = 0; i < 16; i++) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.4), this.matAluDeep);
      const a = (i / 16) * Math.PI * 2;
      groove.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
      groove.rotation.z = a;
      spin.add(groove);
    }
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.9, 16).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    g.add(spin, hit);
    this.knobSpin = spin;
    this.group.add(g);
    this.hitTargets.push(g);

    const label = textPlane('vol', 0.8, 0.24, { size: 0.14, color: '#54575e' });
    label.position.set(this.bodyW / 2 - 0.42, -2.5, this.frontZ + 0.011);
    this.group.add(label);
  }

  // "磁带盘"——可弹出的马达卷带盘
  _puck() {
    const g = new THREE.Group();

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.08, 3.08, 0.56, 72).rotateX(Math.PI / 2),
      this.matDisc
    );
    disc.castShadow = true;
    g.add(disc);

    // 盘面卷带层：半径随播放进度增长（收带）
    this.tapeLayer = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.05, 64).rotateX(Math.PI / 2),
      this.matTape
    );
    this.tapeLayer.position.z = 0.29;
    g.add(this.tapeLayer);

    // 中心轴盖（哑光金属 + 微缩刻槽）
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.09, 32).rotateX(Math.PI / 2), this.matAluDeep);
    cap.position.z = 0.31;
    g.add(cap);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x7e828a, metalness: 0.85, roughness: 0.42 });
    for (const rz of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.032, 0.012), capMat);
      slot.rotation.z = rz;
      slot.position.z = 0.356;
      g.add(slot);
    }

    // 指拨凹坑（转动时的视觉锚点）
    const dimple = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.1, 28).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.3, roughness: 0.6 })
    );
    dimple.position.set(2.18, 0, 0.28);
    const dimpleRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 10, 32), this.matAluDeep);
    dimpleRing.position.set(2.18, 0, 0.325);
    g.add(dimple, dimpleRing);

    // 琥珀标记点
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), this.matAmber);
    dot.position.set(2.86, 0, 0.286);
    g.add(dot);

    g.userData.action = 'cassette';
    this.cassette = g;
    this.cassetteInPos = new THREE.Vector3(this.diskC.x, this.diskC.y, this.frontZ - 0.24);
    this.cassetteOutPos = new THREE.Vector3(this.diskC.x, this.diskC.y - 1.5, this.frontZ + 2.6);
    g.position.copy(this.cassetteInPos);
    this.group.add(g);
    this.hitTargets.push(g);
  }

  // 转盘外圈进度光环
  _halo() {
    this.haloCanvas = document.createElement('canvas');
    this.haloCanvas.width = this.haloCanvas.height = 256;
    this.haloTex = new THREE.CanvasTexture(this.haloCanvas);
    this.haloTex.colorSpace = THREE.SRGBColorSpace;
    const size = 7.6;
    this.haloWorldSize = size;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: this.haloTex, transparent: true, depthWrite: false })
    );
    m.position.set(this.diskC.x, this.diskC.y, this.frontZ + 0.012);
    m.renderOrder = 5;
    this.group.add(m);
    this._drawHalo(0, 0, false);
  }

  _drawHalo(p, seekDir, tapeIn) {
    const c = this.haloCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 256);
    if (!tapeIn) { this.haloTex.needsUpdate = true; return; }
    const r = (3.52 / this.haloWorldSize) * 256;
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.beginPath();
    c.arc(128, 128, r, 0, Math.PI * 2);
    c.stroke();
    if (p > 0.001) {
      c.lineWidth = 4.5;
      c.lineCap = 'round';
      c.strokeStyle = seekDir !== 0 ? 'rgba(255,178,90,1)' : 'rgba(255,138,61,0.95)';
      c.shadowColor = 'rgba(255,138,61,0.9)';
      c.shadowBlur = 7;
      c.beginPath();
      c.arc(128, 128, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      c.stroke();
    }
    this.haloTex.needsUpdate = true;
  }

  _detail() {
    // 前面板丝印
    const brand = textPlane('walkman w–26', 2.4, 0.3, { size: 0.21, color: '#54575e', align: 'left', weight: 600 });
    brand.position.set(-1.55, 3.98, this.frontZ + 0.011);
    const model = textPlane('field player · 3 head stereo', 3.2, 0.22, { size: 0.13, color: '#4a4d54' });
    model.position.set(0, -4.62, this.frontZ + 0.011);
    const serial = textPlane('est. 2026 · made for the future', 3.0, 0.2, { size: 0.115, color: '#41444b' });
    serial.position.set(0, -5.0, this.frontZ + 0.011);
    this.group.add(brand, model, serial);

    // 状态 LED（显示屏右侧对称位置）
    const led = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.3 })
    );
    led.position.set(2.95, 4.5, this.frontZ + 0.02);
    this.led = led;
    const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 10, 24), this.matAluDeep);
    ledRing.position.set(2.95, 4.5, this.frontZ + 0.02);
    this.group.add(led, ledRing);

    // 四角螺丝（TE 式外露结构件）
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x76797f, metalness: 0.95, roughness: 0.35 });
    for (const [sx, sy] of [[-3.3, 5.32], [3.3, 5.32], [-3.3, -5.32], [3.3, -5.32]]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 18).rotateX(Math.PI / 2), screwMat);
      s.position.set(sx, sy, this.frontZ + 0.012);
      const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.028, 0.02), this.matCavityFront || (this.matCavityFront = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 })));
      g1.rotation.z = 0.6 + sx * 0.2;
      g1.position.set(sx, sy, this.frontZ + 0.04);
      this.group.add(s, g1);
    }

    // 顶部：耳机孔 + 三个麦克风孔
    const jackRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 24).rotateX(Math.PI / 2), this.matAluDeep);
    jackRing.position.set(-2.75, this.bodyH / 2 + 0.13, 0);
    const jackHole = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    jackHole.position.set(-2.75, this.bodyH / 2 + 0.131, 0);
    this.group.add(jackRing, jackHole);
    for (let i = 0; i < 3; i++) {
      const mic = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      mic.position.set(-0.35 + i * 0.35, this.bodyH / 2 + 0.131, 0);
      this.group.add(mic);
    }
    const topLabel = textPlane('phones          mic', 2.6, 0.22, { size: 0.13, color: '#53565d' });
    topLabel.position.set(-1.3, this.bodyH / 2 + 0.131, 0.32);
    topLabel.rotation.x = -Math.PI / 2;
    this.group.add(topLabel);

    // 底边 USB-C 装饰
    const usb = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.06, 0.32, 2, 0.028), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    usb.position.set(0, -this.bodyH / 2 - 0.131, 0);
    this.group.add(usb);

    // 背面铭牌
    const back = textPlane('walkman w–26 · field player', 3.6, 0.34, { size: 0.19, color: '#5f636b', weight: 600 });
    back.position.set(0, 0.7, this.backZ - 0.011);
    back.rotation.y = Math.PI;
    const back2 = textPlane('dc 3v ⎓ · 128gb · teenage spirit inside', 3.4, 0.24, { size: 0.13, color: '#464950' });
    back2.position.set(0, 0.2, this.backZ - 0.011);
    back2.rotation.y = Math.PI;
    this.group.add(back, back2);
  }

  setTapeName(name) { this.tapeName = name; }

  // ---------- 交互动画 ----------
  pressVisual(action) {
    const b = this._buttons[action];
    if (!b) return;
    b.userData.pressGroup.position.x = (b.userData.pressAxis ?? 0) * 0.12;
  }

  releaseVisual(action) {
    const b = this._buttons[action];
    if (!b) return;
    b.userData.pressGroup.position.set(0, 0, 0);
  }

  async eject() {
    if (this.busy || !this.tapeIn) return;
    this.busy = true;
    this.tapeIn = false;
    const p0 = this.cassette.position.clone();
    // 先旋出一点再弹出，像磁吸脱开
    await tweenAsync({
      dur: 0.66, ease: Ease.outCubic,
      onUpdate: (k) => {
        this.cassette.position.lerpVectors(p0, this.cassetteOutPos, k);
        this.cassette.rotation.x = -0.15 * k;
        this.cassette.rotation.z += 0.9 * (1 - k) * 0.016;
      },
    });
    this.busy = false;
  }

  async insert() {
    if (this.busy || this.tapeIn) return;
    this.busy = true;
    const p0 = this.cassette.position.clone();
    const r0 = this.cassette.rotation.x;
    await tweenAsync({
      dur: 0.55, ease: Ease.inOutCubic,
      onUpdate: (k) => {
        this.cassette.position.lerpVectors(p0, this.cassetteInPos, k);
        this.cassette.rotation.x = r0 * (1 - k);
      },
    });
    // 落座回弹
    await tweenAsync({
      from: 1, to: 0, dur: 0.18, ease: Ease.outCubic,
      onUpdate: (v) => { this.cassette.position.z = this.cassetteInPos.z + v * 0.06; },
    });
    this.tapeIn = true;
    this.busy = false;
  }

  setKnob(v) {
    this.knobSpin.rotation.z = 1.5 - v * 3;
  }

  setHover(action) { this.hover = action; }

  // ---------- 每帧更新 ----------
  update(dt, s, reduced) {
    this.t += dt;

    if (!reduced) {
      this.group.position.y = Math.sin(this.t * 0.85) * 0.05;
      this.group.rotation.y = Math.sin(this.t * 0.21) * 0.028;
      this.group.rotation.x = Math.sin(this.t * 0.30) * 0.011;
    }

    // 出仓时磁带盘悬浮
    if (!this.tapeIn && !this.busy) {
      this.cassette.position.y = this.cassetteOutPos.y + Math.sin(this.t * 1.25) * 0.05;
      this.cassette.rotation.z += dt * 0.25;   // 缓慢空转展示
    }

    // 转盘速度：播放恒速，快进/快退高速（反向）
    let target = 0;
    if (this.tapeIn) {
      if (s.seekDir !== 0) target = 9 * s.seekDir;
      else if (s.playing) target = 2.2;
    }
    this._reelSpeed = damp(this._reelSpeed, target, 9, dt);
    this.cassette.rotation.z -= this._reelSpeed * dt;

    // 卷带层半径随进度增长
    const p = s.progress || 0;
    const r = lerp(1.15, 2.92, p);
    this.tapeLayer.scale.set(r, r, 1);

    // 进度光环（变化时才重绘）
    if (Math.abs(p - this._haloP) > 0.0025 || s.seekDir !== this._haloSeek || this.tapeIn !== this._haloIn) {
      this._haloP = p; this._haloSeek = s.seekDir; this._haloIn = this.tapeIn;
      this._drawHalo(p, s.seekDir, this.tapeIn);
    }

    // 播放键强调色 & LED 呼吸
    const ringT = s.seekDir !== 0 ? 1.1 : s.playing ? 0.85 : 0.45;
    this.matAmber.emissiveIntensity = damp(this.matAmber.emissiveIntensity, ringT, 6, dt);
    const vuAvg = s.vu ? (s.vu[0] + s.vu[1] + s.vu[2]) / 3 : 0;
    const ledT = this.tapeIn ? (s.playing ? 0.9 + vuAvg * 1.6 : 0.35) : 0.12;
    this.led.material.emissiveIntensity = damp(this.led.material.emissiveIntensity, ledT, 8, dt);

    // 侧键 hover 高亮
    for (const [action, b] of Object.entries(this._buttons)) {
      b.userData.capMat.emissive.setHex(this.hover === action ? 0x1d1f24 : 0x000000);
    }
  }
}
