import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

import { Walkman } from './walkman.js';
import { AudioEngine } from './audio.js';
import { DotDisplay } from './display.js';
import { updateTweens, clamp, wait } from './tween.js';

const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
const staticMode = params.has('static');
const reduced = staticMode || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 渲染器 / 场景 ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c10);
scene.fog = new THREE.Fog(0x0b0c10, 15, 32);

const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
camera.position.set(5.6, 2.0, 12.6);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
scene.environmentIntensity = 0.55;

// 灯光
const key = new THREE.DirectionalLight(0xfff2e2, 1.45);
key.position.set(6, 9, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
key.shadow.bias = -0.0004;
key.shadow.radius = 6;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb7ff, 1.1);
rim.position.set(-7, 4, -6);
scene.add(rim);
const fill = new THREE.AmbientLight(0x30323a, 0.7);
scene.add(fill);

// 地面（径向渐变 + 阴影接收）
function groundTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(256, 256, 30, 256, 256, 250);
  g.addColorStop(0, '#16171d');
  g.addColorStop(0.7, '#0d0e12');
  g.addColorStop(1, '#0b0c10');
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 56),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -4.15;
ground.receiveShadow = true;
scene.add(ground);
const shadowCatcher = new THREE.Mesh(
  new THREE.CircleGeometry(40, 56),
  new THREE.ShadowMaterial({ opacity: 0.42 })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = -4.14;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// 背景光柱（2026 展厅氛围）
const lightBars = new THREE.Group();
lightBars.name = 'lightbars';
for (const [x, z, h, i] of [[-14, -16, 10, 1.3], [11, -18, 13, 0.9], [18, -10, 7, 0.6], [-19, -8, 6, 0.5]]) {
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, h, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xffb46a, emissive: 0xff9e3d, emissiveIntensity: i, fog: false })
  );
  bar.position.set(x, h / 2 - 4.15, z);
  lightBars.add(bar);
}
scene.add(lightBars);

// ---------- 控制器 ----------
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 22;
controls.maxPolarAngle = 1.52;
controls.minPolarAngle = 0.35;
controls.autoRotate = !reduced;
controls.autoRotateSpeed = 0.55;

// ---------- 组件 ----------
const display = new DotDisplay();
const walkman = new Walkman(display.texture);
scene.add(walkman.group);

const audio = new AudioEngine();
audio.onTrackChange = (t) => display.flash(`▶ ${String(t.title).toUpperCase().slice(0, 20)}`, 1200);

// 字体就绪后重绘磁带标签，避免回退字体
if (document.fonts?.ready) {
  document.fonts.ready.then(() => walkman.setTapeName(audio.state.tapeName));
}

// ---------- 后期 ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader);
composer.addPass(fxaa);

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  fxaa.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 播放列表加载 ----------
async function loadPlaylist() {
  try {
    const res = await fetch('music/playlist.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    if (data.tracks?.length) {
      audio.setPlaylist(data.tracks, 'music/', data.name || "MIXTAPE '26");
      walkman.setTapeName(data.name || "MIXTAPE '26");
      return;
    }
    throw new Error('empty');
  } catch {
    display.flash('NO PLAYLIST · DROP MP3', 3000);
  }
}
loadPlaylist();

// 拖入 MP3 即换带
let dragDepth = 0;
const dropHint = document.getElementById('drop-hint');
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropHint.classList.add('show'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropHint.classList.remove('show'); } });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropHint.classList.remove('show');
  const files = [...(e.dataTransfer?.files || [])].filter((f) => /audio|mp3|m4a|wav|ogg|flac/i.test(f.type + f.name));
  if (!files.length) return;
  const tracks = files.map((f) => ({ title: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) }));
  audio.setPlaylist(tracks, '', 'CUSTOM MIX');
  walkman.setTapeName('CUSTOM MIX');
  display.flash('TAPE LOADED', 1400);
  audio.ensureCtx();
  audio.sfx('thunk');
  if (!walkman.tapeIn) await walkman.insert();
  audio.toggle();
});

// ---------- 交互 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let holdInfo = null;   // { action, timer, seeking }
let knobDrag = null;
let pressedAction = null;

function pickAction(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(walkman.hitTargets, true);
  for (const h of hits) {
    let o = h.object;
    while (o) {
      if (o.userData.action) return o.userData.action;
      o = o.parent;
    }
  }
  return null;
}

function beginHoldSeek(dir) {
  const action = dir > 0 ? 'ff' : 'rew';
  holdInfo = { action, seeking: false };
  holdInfo.timer = setTimeout(() => {
    if (!holdInfo) return;
    holdInfo.seeking = true;
    audio.startSeek(dir);
  }, 260);
}

function endHoldSeek() {
  if (!holdInfo) return;
  clearTimeout(holdInfo.timer);
  const dir = holdInfo.action === 'ff' ? 1 : -1;
  if (holdInfo.seeking) audio.stopSeek();
  else if (walkman.tapeIn) audio.skip(dir);
  holdInfo = null;
}

function doAction(action, e) {
  audio.ensureCtx();
  switch (action) {
    case 'play':
      if (!walkman.tapeIn) { display.flash('INSERT TAPE'); audio.sfx('deny'); break; }
      audio.sfx('click');
      audio.toggle();
      break;
    case 'stop':
      audio.sfx('thunk');
      audio.stop();
      break;
    case 'ff':
    case 'rew':
      if (!walkman.tapeIn) { display.flash('INSERT TAPE'); audio.sfx('deny'); break; }
      audio.sfx('click');
      beginHoldSeek(action === 'ff' ? 1 : -1);
      break;
    case 'eject':
    case 'door':
      toggleTape();
      break;
    case 'cassette':
      if (!walkman.tapeIn) toggleTape();
      break;
    case 'knob':
      knobDrag = { y: e.clientY, v: audio.volume };
      controls.enabled = false;
      break;
  }
}

async function toggleTape() {
  if (walkman.busy) return;
  if (walkman.tapeIn) {
    audio.stop();
    audio.sfx('eject');
    display.flash('EJECT', 900);
    await walkman.eject();
  } else {
    await walkman.insert();
    audio.sfx('thunk');
    display.flash('TAPE IN', 900);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  controls.autoRotate = false;
  const action = pickAction(e);
  if (!action) return;
  pressedAction = action;
  walkman.pressVisual(action);
  doAction(action, e);
});

window.addEventListener('pointermove', (e) => {
  if (knobDrag) {
    const v = clamp(knobDrag.v + (knobDrag.y - e.clientY) * 0.005, 0, 1);
    audio.setVolume(v);
    walkman.setKnob(v);
    display.flash(volText(v), 700);
    return;
  }
  if (e.target !== canvas) return;
  const action = pickAction(e);
  walkman.setHover(action);
  canvas.style.cursor = action ? 'pointer' : 'grab';
});

window.addEventListener('pointerup', () => {
  if (pressedAction) walkman.releaseVisual(pressedAction);
  pressedAction = null;
  endHoldSeek();
  if (knobDrag) { knobDrag = null; controls.enabled = true; }
});
window.addEventListener('blur', () => { endHoldSeek(); });

canvas.addEventListener('wheel', (e) => {
  const action = pickAction(e);
  if (action === 'knob') {
    e.preventDefault();
    const v = clamp(audio.volume - Math.sign(e.deltaY) * 0.05, 0, 1);
    audio.setVolume(v);
    walkman.setKnob(v);
    display.flash(volText(v), 700);
  }
}, { passive: false });

function volText(v) {
  const n = Math.round(v * 10);
  return 'VOL [' + '='.repeat(n) + '-'.repeat(10 - n) + ']';
}

// 键盘
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  audio.ensureCtx();
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      doAction('play', e);
      walkman.pressVisual('play');
      setTimeout(() => walkman.releaseVisual('play'), 130);
      break;
    case 'ArrowRight':
      if (!walkman.tapeIn) break;
      walkman.pressVisual('ff');
      beginHoldSeek(1);
      break;
    case 'ArrowLeft':
      if (!walkman.tapeIn) break;
      walkman.pressVisual('rew');
      beginHoldSeek(-1);
      break;
    case 'ArrowUp':
    case 'ArrowDown': {
      e.preventDefault();
      const v = clamp(audio.volume + (e.code === 'ArrowUp' ? 0.08 : -0.08), 0, 1);
      audio.setVolume(v);
      walkman.setKnob(v);
      display.flash(volText(v), 700);
      break;
    }
    case 'KeyE':
      toggleTape();
      break;
    case 'KeyS':
      doAction('stop', e);
      break;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowRight') { walkman.releaseVisual('ff'); endHoldSeek(); }
  if (e.code === 'ArrowLeft') { walkman.releaseVisual('rew'); endHoldSeek(); }
});

// ---------- 主循环 ----------
walkman.setKnob(audio.volume);
const clock = new THREE.Clock();
let firstFrame = true;

function step(dt) {
  window.__frames = (window.__frames || 0) + 1;
  updateTweens(dt);
  controls.update();

  const s = audio.state;
  s.vu = audio.vuLevels();
  s.tapeIn = walkman.tapeIn || walkman.busy;
  walkman.update(dt, s, reduced);
  display.update(dt, s);

  composer.render();

  if (firstFrame) {
    firstFrame = false;
    window.__APP_READY = true;
    onReady();
  }
}

function loop() {
  requestAnimationFrame(loop);
  step(Math.min(clock.getDelta(), 0.05));
}
loop();

// 开场：装载磁带动画
async function onReady() {
  const loader = document.getElementById('loader');
  loader.classList.add('hide');
  setTimeout(() => loader.remove(), 700);
  await wait(0.9);
  await walkman.insert();
  display.flash('HELLO · 2026', 1500);
}

window.addEventListener('error', (e) => { window.__APP_ERROR = String(e.message || e.error); });

// 调试辅助：手动步进 + 导出画面（供自动化截图使用；真实浏览器由 rAF 驱动）
window.__tick = (dt = 1 / 30, n = 1) => { for (let i = 0; i < n; i++) step(dt); };
window.__snap = () => {
  composer.render();
  return renderer.domElement.toDataURL('image/png');
};
window.__walkman = walkman;
window.__audio = audio;
window.__camera = camera;
window.__controls = controls;
window.__worldPos = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v.toArray().map((n) => +n.toFixed(2)); };
