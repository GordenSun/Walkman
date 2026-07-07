// 交互回归测试：模拟真实鼠标点击按钮，验证播放/快进/出仓/入仓全链路
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const url = 'http://localhost:8123/';
const outDir = '/Users/gorden/Documents/Cursor/3D播放器/shots';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1120, height: 700, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGE_ERROR: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__APP_READY === true', { timeout: 30000 });

const sim = async (sec) => {
  const bursts = Math.ceil(sec * 5);
  for (let i = 0; i < bursts; i++) {
    await page.evaluate('window.__tick(1/30, 6)');
    await new Promise((r) => setTimeout(r, 8));
  }
};
const snap = async (name) => {
  const dataUrl = await page.evaluate('window.__snap()');
  writeFileSync(`${outDir}/${name}`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('  📸', name);
};
const screenPosOf = (expr) => page.evaluate(`
  (() => {
    const v = ${expr};
    const p = v.clone ? v.clone() : new (window.__camera.position.constructor)(...v);
    p.project(window.__camera);
    const c = document.getElementById('scene').getBoundingClientRect();
    return { x: c.left + (p.x * 0.5 + 0.5) * c.width, y: c.top + (-p.y * 0.5 + 0.5) * c.height };
  })()
`);
const clickAction = async (action, holdMs = 0) => {
  const pos = await screenPosOf(`(() => { const o = window.__walkman._buttons['${action}'] || window.__walkman.${action}; const v = new o.position.constructor(); o.getWorldPosition(v); return v; })()`);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  if (holdMs) { await sim(holdMs / 1000); }
  await page.mouse.up();
  console.log(`点击 ${action} @ ${pos.x | 0},${pos.y | 0}${holdMs ? ` (按住${holdMs}ms)` : ''}`);
};
const state = () => page.evaluate('(() => ({ playing: window.__audio.playing, seek: window.__audio.seekDir, t: +window.__audio.time.toFixed(2), trk: window.__audio.index, tapeIn: window.__walkman.tapeIn, busy: window.__walkman.busy }))()');

// 等开场入仓动画完成（wait() 走真实时间，tween 靠手动步进）
for (let i = 0; i < 20; i++) {
  await sim(1);
  const s = await state();
  if (s.tapeIn && !s.busy) break;
}
console.log('入仓后状态:', await state());
await snap('t1-ready.png');

// 1. 点播放
await clickAction('play');
await sim(2.5);
console.log('播放中:', await state());
await snap('t2-playing.png');

// 2. 长按快进（真实按住 → hold>260ms 实时判定）
{
  const pos = await screenPosOf(`(() => { const o = window.__walkman._buttons['ff']; const v = new o.position.constructor(); o.getWorldPosition(v); return v; })()`);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 420));   // 真实时间超过 260ms 触发 seek
  await sim(2);
  console.log('快进中:', await state());
  await snap('t3-ff.png');
  await page.mouse.up();
}
await sim(0.6);
console.log('松开后:', await state());

// 3. 短按 ff → 切歌
await clickAction('ff');
await sim(1);
console.log('切歌后:', await state());

// 4. 停止
await clickAction('stop');
await sim(0.5);
console.log('停止后:', await state());

// 5. 出仓
await clickAction('eject');
await sim(3);
console.log('出仓后:', await state());
await snap('t4-ejected.png');

// 6. 再入仓
await clickAction('eject');
await sim(3);
console.log('再入仓:', await state());
await snap('t5-reinserted.png');

if (errors.length) {
  console.log('--- 控制台错误 ---');
  for (const e of errors.slice(0, 10)) console.log(e);
} else console.log('✓ 无控制台错误');
await browser.close();
process.exit(0);
