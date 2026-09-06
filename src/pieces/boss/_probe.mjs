// dev probe (not part of the piece): boot the piece headless at a small
// viewport, step deterministically to the given times, screenshot each, and
// report timing + any console errors.  usage: node _probe.mjs 1,3,6,10 [scale]
import { chromium } from 'playwright';
import fs from 'node:fs';
const times = (process.argv[2] || '1,3,6,10').split(',').map(Number);
const scale = Number(process.argv[3] || 0.5);
const W = Math.round(1280 * scale), H = Math.round(720 * scale);
const out = 'shots/boss_probe'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/ReadPixels/.test(m.text()))) console.log('console:', m.text().slice(0, 400)); });
page.on('crash', () => console.log('PAGE CRASHED'));
// other agents saving files makes Vite full-reload the page mid-run: kill HMR
await page.addInitScript(() => { window.WebSocket = class { constructor() {} addEventListener() {} removeEventListener() {} send() {} close() {} }; });
const piece = process.env.PIECE || 'boss';
await page.goto(`http://localhost:5173/?piece=${piece}&seed=1&mute&autoplay&fixed`, { waitUntil: 'networkidle' });
const ok = await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 }).catch(() => false);
console.log('booted', !!ok, W, H);
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); });
let stepped = 0;
for (const t of times) {
  const target = Math.round(t * 60); const n = target - stepped;
  const t0 = Date.now();
  for (let done = 0; done < n; done += 60) { const k = Math.min(60, n - done); await page.evaluate((k) => window.__engine.stepFrames(k), k); }
  stepped = target;
  const info = await page.evaluate(() => { const e = window.__engine; const r = e.renderer.info.render; return { calls: r.calls, tris: r.triangles, pts: r.points, lost: e.renderer.getContext().isContextLost() }; });
  const ms = Date.now() - t0;
  await page.screenshot({ path: `${out}/t${String(t).padStart(3, '0')}.png`, timeout: 120000 });
  console.log(`t=${t}s  ${n} frames in ${ms}ms (${(ms / Math.max(1, n)).toFixed(0)} ms/frame)`, JSON.stringify(info));
}
await browser.close();
