// 本地验证脚本：无头浏览器打开页面，从 WebGL 画布直接导出画面
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:8123/';
const out = process.argv[3] || '/Users/gorden/Documents/Cursor/3D播放器/shots/shot.png';
const extraWait = Number(process.argv[4] || 3500);

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
try {
  await page.waitForFunction('window.__APP_READY === true', { timeout: 30000 });
  console.log('APP_READY ✓');
} catch {
  console.log('APP_READY 超时!');
}
// 无头环境 rAF 不推进，手动步进模拟时间流逝
const simulate = async (sec) => {
  const steps = Math.round(sec / (1 / 30));
  for (let i = 0; i < steps; i += 6) {
    await page.evaluate('window.__tick(1/30, 6)');
    await new Promise((r) => setTimeout(r, 10));
  }
};
await simulate(extraWait / 1000);

// 可选：执行页面内脚本再截图
if (process.env.EVAL) {
  const r = await page.evaluate(process.env.EVAL);
  console.log('EVAL 结果:', JSON.stringify(r).slice(0, 300));
  await simulate(Number(process.env.EVAL_WAIT || 1200) / 1000);
}

const dataUrl = await page.evaluate('window.__snap()');
writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('截图已保存:', out);

if (errors.length) {
  console.log('--- 控制台错误 ---');
  for (const e of errors.slice(0, 12)) console.log(e);
} else {
  console.log('无控制台错误');
}
await browser.close();
process.exit(0);
