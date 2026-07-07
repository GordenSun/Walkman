// WALKMAN '26 —— 3D 模型与机械动画
// 设计语言：铝合金侧环 + 石墨哑光面板 + 琥珀点阵屏 + 透明舱门，2026 极简科技风
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tweenAsync, Ease, lerp, damp, clamp } from './tween.js';

const C = {
  alu: 0xc7cbd2,
  aluDark: 0x8f939b,
  graphite: 0x1a1b1f,
  cavity: 0x0b0b0d,
  cap: 0x24262b,
  capHover: 0x3a3d45,
  amber: 0xff9e3d,
  ivory: 0xece7db,
  ink: 0x25201b,
  icon: 0xe9e5dc,
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

function roundedRectPath(w, h, r, cx = 0, cy = 0) {
  const p = new THREE.Path();
  const x = cx - w / 2, y = cy - h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x + w, y + h - r);
  p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  p.lineTo(x + r, y + h);
  p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x, y + r);
  p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
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
  const px = 96;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * px); cv.height = Math.round(h * px);
  const c = cv.getContext('2d');
  c.fillStyle = opts.bg || 'rgba(0,0,0,0)';
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = opts.color || '#70747d';
  c.font = `${opts.weight || 500} ${Math.round((opts.size || 0.3) * px)}px ${opts.font || '"Space Grotesk", "Helvetica Neue", sans-serif'}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (opts.spacing) c.letterSpacing = opts.spacing;
  c.fillText(text, cv.width / 2, cv.height / 2 + (opts.dy || 0));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opts.opacity ?? 1 })
  );
  return m;
}

// ---------- 磁带标签贴纸 ----------
function drawCassetteLabel(cv, name) {
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  // 纸底
  c.fillStyle = '#f4f0e6';
  c.fillRect(0, 0, W, H);
  // 顶部琥珀条
  const grd = c.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#ff9e3d');
  grd.addColorStop(1, '#ff7a3d');
  c.fillStyle = grd;
  c.fillRect(0, 0, W, H * 0.30);
  c.fillStyle = '#141313';
  c.font = `700 ${H * 0.17}px "Space Grotesk", "Helvetica Neue", sans-serif`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('SIDE A', W * 0.035, H * 0.155);
  c.textAlign = 'right';
  c.font = `500 ${H * 0.13}px "Space Grotesk", sans-serif`;
  c.fillText('STEREO · CrO₂ · 90', W * 0.965, H * 0.16);
  // 手写风格曲名区
  c.textAlign = 'left';
  c.fillStyle = '#232019';
  c.font = `600 ${H * 0.30}px "Space Grotesk", "Helvetica Neue", sans-serif`;
  c.fillText(name, W * 0.045, H * 0.56);
  // 横线
  c.strokeStyle = 'rgba(35,32,25,0.35)';
  c.lineWidth = Math.max(1, H * 0.012);
  c.beginPath(); c.moveTo(W * 0.04, H * 0.78); c.lineTo(W * 0.96, H * 0.78); c.stroke();
  c.fillStyle = 'rgba(35,32,25,0.55)';
  c.font = `500 ${H * 0.115}px "SF Mono", Menlo, monospace`;
  c.fillText('W-26 · POSITION · NORMAL BIAS', W * 0.045, H * 0.885);
}

export class Walkman {
  constructor(displayTexture) {
    this.group = new THREE.Group();
    this.tapeIn = false;      // 初始为出仓状态，等待开场"入仓"动画
    this.busy = false;
    this.t = 0;
    this.hover = null;
    this.hitTargets = [];
    this._buttons = {};
    this._reelAngle = 0;
    this._reelSpeed = 0;

    this._mats();
    this._body();
    this._display(displayTexture);
    this._buttonsBuild();
    this._knob();
    this._cassette();
    this._door();
    this._detail();

    // 初始姿态：舱门开、磁带悬浮在外
    this.door.rotation.x = 1.32;
    this.cassette.position.copy(this.cassetteOutPos);
    this.cassette.rotation.x = -0.16;

    this.group.scale.setScalar(0.7);
  }

  _mats() {
    this.matAlu = new THREE.MeshStandardMaterial({ color: C.alu, metalness: 0.92, roughness: 0.32 });
    this.matGraphite = new THREE.MeshStandardMaterial({ color: C.graphite, metalness: 0.55, roughness: 0.42 });
    this.matCavity = new THREE.MeshStandardMaterial({ color: C.cavity, metalness: 0.1, roughness: 0.92, side: THREE.BackSide });
    // 烟熏亚克力：透出磁带又不显奶白
    this.matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x2b2d33, metalness: 0, roughness: 0.05,
      transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.06,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.matFrame = new THREE.MeshStandardMaterial({ color: C.aluDark, metalness: 0.9, roughness: 0.3 });
    this.matShell = new THREE.MeshStandardMaterial({ color: 0xd6d1c4, metalness: 0.02, roughness: 0.6 });
    this.matSpool = new THREE.MeshStandardMaterial({ color: C.ink, metalness: 0.15, roughness: 0.32 });
    this.matHub = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, metalness: 0.1, roughness: 0.4 });
    this.matAmber = new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.4 });
  }

  _body() {
    const W = 7, H = 11, D = 2.1;
    const shape = roundedRectShape(W, H, 1.05);
    // 磁带舱开孔
    this.bayW = 6.5; this.bayH = 4.35; this.bayY = 2.35;
    shape.holes.push(roundedRectPath(this.bayW, this.bayH, 0.4, 0, this.bayY));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D, curveSegments: 28,
      bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.15, bevelSegments: 5,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const halfD = (bb.max.z - bb.min.z) / 2;
    geo.translate(0, 0, -(bb.min.z + bb.max.z) / 2);
    this.frontZ = halfD;   // 前表面 z
    this.backZ = -halfD;

    const body = new THREE.Mesh(geo, [this.matGraphite, this.matAlu]);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // 舱体内腔（开口盒，BackSide 只渲染内壁）
    const cavity = new THREE.Mesh(
      new THREE.BoxGeometry(this.bayW + 0.1, this.bayH + 0.1, 1.5),
      this.matCavity
    );
    cavity.position.set(0, this.bayY, this.frontZ - 0.76);
    this.group.add(cavity);
    this.bayBottomY = this.bayY - this.bayH / 2;
  }

  _display(texture) {
    const w = 5.4, h = 1.12, y = -0.72;
    const back = new THREE.Mesh(
      new RoundedBoxGeometry(w + 0.24, h + 0.24, 0.1, 2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0.3, roughness: 0.5 })
    );
    back.position.set(0, y, this.frontZ + 0.02);
    this.group.add(back);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xffffff, emissiveMap: texture,
        emissiveIntensity: 1.15, roughness: 0.35, metalness: 0,
      })
    );
    screen.position.set(0, y, this.frontZ + 0.105);
    this.group.add(screen);
  }

  _buttonsBuild() {
    const defs = [
      { action: 'rew', x: -1.85, y: -2.5, r: 0.6, icon: 'rew' },
      { action: 'play', x: 0, y: -2.5, r: 0.72, icon: 'play', ring: true },
      { action: 'ff', x: 1.85, y: -2.5, r: 0.6, icon: 'ff' },
      { action: 'stop', x: -0.9, y: -4.2, r: 0.42, icon: 'stop' },
      { action: 'eject', x: 0.9, y: -4.2, r: 0.42, icon: 'eject' },
    ];
    for (const d of defs) {
      const g = new THREE.Group();
      g.position.set(d.x, d.y, this.frontZ);
      g.userData.action = d.action;

      const capMat = new THREE.MeshStandardMaterial({ color: C.cap, metalness: 0.62, roughness: 0.4, emissive: 0x000000 });
      const capH = 0.3;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r + 0.04, capH, 48).rotateX(Math.PI / 2), capMat);
      cap.position.z = capH / 2;
      cap.castShadow = true;

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(d.r + 0.06, 0.045, 12, 48),
        d.ring ? this.matAmber : this.matFrame
      );
      rim.position.z = 0.06;

      const pressGroup = new THREE.Group();
      pressGroup.add(cap);
      const iconSize = d.r * 0.62;
      if (d.action === 'play') {
        const ic1 = iconMesh('play', iconSize, C.amber);
        const ic2 = iconMesh('pause', iconSize, C.amber);
        ic1.position.z = capH + 0.011;
        ic2.position.z = capH + 0.011;
        ic2.visible = false;
        pressGroup.add(ic1, ic2);
        this._playIcon = ic1; this._pauseIcon = ic2;
      } else {
        const ic = iconMesh(d.icon, iconSize, C.icon);
        ic.position.z = capH + 0.011;
        pressGroup.add(ic);
      }
      // 放大的隐形点击区
      const hit = new THREE.Mesh(
        new THREE.CircleGeometry(d.r + 0.32, 24),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
      );
      hit.position.z = capH + 0.02;
      pressGroup.add(hit);

      g.add(rim, pressGroup);
      g.userData.pressGroup = pressGroup;
      g.userData.capMat = capMat;
      g.userData.ring = d.ring ? rim : null;
      this.group.add(g);
      this._buttons[d.action] = g;
      this.hitTargets.push(g);
    }
  }

  _knob() {
    const g = new THREE.Group();
    g.position.set(3.66, 2.35, 0);
    g.userData.action = 'knob';
    const spin = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.55, 40).rotateZ(Math.PI / 2),
      this.matFrame
    );
    barrel.castShadow = true;
    spin.add(barrel);
    for (let i = 0; i < 22; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.07), this.matGraphite);
      const a = (i / 22) * Math.PI * 2;
      k.position.set(0, Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      k.rotation.x = -a;
      spin.add(k);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 36).rotateY(Math.PI / 2), this.matAmber);
    ring.position.x = 0.285;
    spin.add(ring);
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.7, 16).rotateZ(Math.PI / 2),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    g.add(spin, hit);
    this.knobSpin = spin;
    this.group.add(g);
    this.hitTargets.push(g);
    const label = textPlane('VOL', 0.7, 0.3, { size: 0.2, color: '#63666e' });
    label.position.set(3.665, 1.55, 0);
    label.rotation.y = Math.PI / 2;
    this.group.add(label);
  }

  _cassette() {
    const g = new THREE.Group();
    const W = 6.0, H = 3.85, D = 0.82;

    // 带窗口开孔的外壳
    const shape = roundedRectShape(W, H, 0.14);
    shape.holes.push(roundedRectPath(3.5, 1.55, 0.18, 0, -0.32));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D, curveSegments: 16,
      bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(0, 0, -(bb.min.z + bb.max.z) / 2);
    const shellHalfD = (bb.max.z - bb.min.z) / 2;
    const shell = new THREE.Mesh(geo, this.matShell);
    shell.castShadow = true;
    g.add(shell);
    const shellFrontZ = shellHalfD;

    // 内部背板
    const backplate = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.3, H - 0.3),
      new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.9 })
    );
    backplate.position.z = -shellFrontZ + 0.06;
    g.add(backplate);

    // 卷带轮（左供带、右收带）
    this.reels = [];
    for (const side of [-1, 1]) {
      const reel = new THREE.Group();
      reel.position.set(side * 1.13, -0.32, 0);
      const spool = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 0.34, 48).rotateX(Math.PI / 2),
        this.matSpool
      );
      const hub = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.075, 10, 28),
        this.matHub
      );
      hub.position.z = 0.2;
      for (let i = 0; i < 6; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.1), this.matHub);
        const a = (i / 6) * Math.PI * 2;
        tooth.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.2);
        tooth.rotation.z = a;
        hub.add(tooth);
      }
      reel.add(spool, hub);
      reel.userData.spool = spool;
      reel.userData.side = side;
      g.add(reel);
      this.reels.push(reel);
    }

    // 窗口玻璃（轻微反光的透明片）
    const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.55), new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.04, metalness: 0,
      transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
    }));
    winGlass.position.set(0, -0.32, shellFrontZ - 0.02);
    winGlass.renderOrder = 9;
    g.add(winGlass);

    // 标签
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 1024; this.labelCanvas.height = 240;
    drawCassetteLabel(this.labelCanvas, "MIXTAPE '26");
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.labelTex.anisotropy = 8;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 1.29),
      new THREE.MeshStandardMaterial({ map: this.labelTex, roughness: 0.9, metalness: 0 })
    );
    label.position.set(0, 1.05, shellFrontZ + 0.012);
    g.add(label);

    // 底部两个定位孔装饰
    for (const side of [-1, 1]) {
      const holeRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), this.matShell);
      holeRing.position.set(side * 2.2, -1.45, shellFrontZ - 0.01);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      hole.position.set(side * 2.2, -1.45, shellFrontZ - 0.005);
      g.add(holeRing, hole);
    }

    g.userData.action = 'cassette';
    this.cassette = g;
    this.cassetteInPos = new THREE.Vector3(0, this.bayY, this.frontZ - 0.62);
    this.cassetteOutPos = new THREE.Vector3(0, this.bayY + 0.62, this.frontZ + 2.35);
    g.position.copy(this.cassetteInPos);
    this.group.add(g);
    this.hitTargets.push(g);
  }

  _door() {
    const pivot = new THREE.Group();
    pivot.position.set(0, this.bayBottomY - 0.02, this.frontZ + 0.03);
    pivot.userData.action = 'door';

    const fw = 6.78, fh = 4.55;
    const frameShape = roundedRectShape(fw, fh, 0.42);
    frameShape.holes.push(roundedRectPath(fw - 0.42, fh - 0.42, 0.3));
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.09, curveSegments: 20, bevelEnabled: true,
      bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2,
    });
    const frame = new THREE.Mesh(frameGeo, this.matFrame);
    frame.castShadow = true;
    frame.position.y = fh / 2;

    const glass = new THREE.Mesh(new RoundedBoxGeometry(fw - 0.38, fh - 0.38, 0.09, 3, 0.12), this.matGlass);
    glass.position.set(0, fh / 2, 0.065);
    glass.renderOrder = 10;

    // 顶部把手
    const tab = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.14, 0.2, 2, 0.05), this.matFrame);
    tab.position.set(0, fh - 0.08, 0.12);

    pivot.add(frame, glass, tab);
    this.door = pivot;
    this.group.add(pivot);
    this.hitTargets.push(pivot);
  }

  _detail() {
    // 顶部 LED
    const led = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.09, 16),
      new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.3 })
    );
    led.position.set(2.7, 5.66, 0);
    this.led = led;
    this.group.add(led);

    // 耳机孔
    const jackRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 24).rotateX(Math.PI / 2), this.matFrame);
    jackRing.position.set(-2.55, 5.66, 0);
    const jackHole = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    jackHole.position.set(-2.55, 5.665, 0);
    const jackLabel = textPlane('PHONES', 1.2, 0.26, { size: 0.16, color: '#5c6068' });
    jackLabel.position.set(-1.55, 5.665, 0);
    jackLabel.rotation.x = -Math.PI / 2;
    this.group.add(jackRing, jackHole, jackLabel);

    // 前面板品牌铭牌
    const brand = textPlane('W – 2 6  ·  T A P E  D E C K', 3.4, 0.34, { size: 0.19, color: '#8a8d95', weight: 600 });
    brand.position.set(0, -5.06, this.frontZ + 0.012);
    this.group.add(brand);

    const sub = textPlane('PERSONAL STEREO · EST. 2026', 2.6, 0.22, { size: 0.125, color: '#53565e' });
    sub.position.set(0, -1.52, this.frontZ + 0.012);
    this.group.add(sub);

    // 背面铭牌
    const back = textPlane('WALKMAN  TPS-2026', 3.2, 0.4, { size: 0.2, color: '#5f636b', weight: 600 });
    back.position.set(0, 0.6, this.backZ - 0.012);
    back.rotation.y = Math.PI;
    const back2 = textPlane('DC 3V ⎓ · MADE FOR THE FUTURE', 2.8, 0.24, { size: 0.13, color: '#43464d' });
    back2.position.set(0, 0.1, this.backZ - 0.012);
    back2.rotation.y = Math.PI;
    this.group.add(back, back2);
  }

  setTapeName(name) {
    drawCassetteLabel(this.labelCanvas, name);
    this.labelTex.needsUpdate = true;
  }

  // ---------- 交互动画 ----------
  pressVisual(action) {
    const b = this._buttons[action];
    if (!b) return;
    const pg = b.userData.pressGroup;
    pg.position.z = -0.13;
  }

  releaseVisual(action) {
    const b = this._buttons[action];
    if (!b) return;
    b.userData.pressGroup.position.z = 0;
  }

  async eject() {
    if (this.busy || !this.tapeIn) return;
    this.busy = true;
    this.tapeIn = false;
    // 开门
    await tweenAsync({
      from: this.door.rotation.x, to: 1.32, dur: 0.55, ease: Ease.outBack,
      onUpdate: (v) => (this.door.rotation.x = v),
    });
    // 磁带滑出
    const p0 = this.cassette.position.clone();
    await tweenAsync({
      dur: 0.72, ease: Ease.outCubic,
      onUpdate: (k) => {
        this.cassette.position.lerpVectors(p0, this.cassetteOutPos, k);
        this.cassette.rotation.x = -0.16 * k;
      },
    });
    this.busy = false;
  }

  async insert() {
    if (this.busy || this.tapeIn) return;
    this.busy = true;
    const p0 = this.cassette.position.clone();
    const r0 = this.cassette.rotation.x;
    // 磁带滑入
    await tweenAsync({
      dur: 0.62, ease: Ease.inOutCubic,
      onUpdate: (k) => {
        this.cassette.position.lerpVectors(p0, this.cassetteInPos, k);
        this.cassette.rotation.x = r0 * (1 - k);
      },
    });
    // 关门（带一点回弹）
    await tweenAsync({
      from: this.door.rotation.x, to: 0, dur: 0.5, ease: Ease.outBack,
      onUpdate: (v) => (this.door.rotation.x = Math.max(0, v)),
    });
    this.tapeIn = true;
    this.busy = false;
  }

  setKnob(v) {
    this.knobSpin.rotation.x = 1.4 - v * 2.8;
  }

  setHover(action) { this.hover = action; }

  // ---------- 每帧更新 ----------
  update(dt, s, reduced) {
    this.t += dt;

    // 悬浮呼吸
    if (!reduced) {
      this.group.position.y = Math.sin(this.t * 0.85) * 0.05;
      this.group.rotation.y = Math.sin(this.t * 0.21) * 0.028;
      this.group.rotation.x = Math.sin(this.t * 0.30) * 0.011;
    }

    // 出仓时磁带悬浮
    if (!this.tapeIn && !this.busy) {
      this.cassette.position.y = this.cassetteOutPos.y + Math.sin(this.t * 1.25) * 0.06;
      this.cassette.rotation.z = Math.sin(this.t * 0.6) * 0.012;
    }

    // 卷带轮转速：播放 1x，快进/快退 7x（反向）
    let target = 0;
    if (this.tapeIn) {
      if (s.seekDir !== 0) target = 7.5 * s.seekDir;
      else if (s.playing) target = 1.7;
    }
    this._reelSpeed = damp(this._reelSpeed, target, 9, dt);
    const p = s.progress || 0;
    const rMin = 0.42, rMax = 1.28;
    for (const reel of this.reels) {
      const supply = reel.userData.side < 0;
      const r = supply ? lerp(rMax, rMin, p) : lerp(rMin, rMax, p);
      reel.userData.spool.scale.set(r, r, 1);
      // 恒定线速度 → 角速度与半径成反比
      reel.rotation.z -= (this._reelSpeed / r) * dt * 2.2;
    }

    // 播放/暂停图标切换
    if (this._playIcon) {
      this._playIcon.visible = !s.playing;
      this._pauseIcon.visible = s.playing;
    }

    // 播放环与 LED 呼吸
    const ringT = s.seekDir !== 0 ? 1.25 : s.playing ? 0.95 : 0.5;
    this.matAmber.emissiveIntensity = damp(this.matAmber.emissiveIntensity, ringT, 6, dt);
    const vuAvg = s.vu ? (s.vu[0] + s.vu[1] + s.vu[2]) / 3 : 0;
    const ledT = this.tapeIn ? (s.playing ? 0.9 + vuAvg * 1.6 : 0.35) : 0.12;
    this.led.material.emissiveIntensity = damp(this.led.material.emissiveIntensity, ledT, 8, dt);

    // 按钮 hover 高亮
    for (const [action, b] of Object.entries(this._buttons)) {
      const m = b.userData.capMat;
      const on = this.hover === action;
      const cur = m.emissive.getHex();
      m.emissive.setHex(on ? 0x23252b : 0x000000);
      if (on !== (cur !== 0)) m.needsUpdate = false;
    }
  }
}
