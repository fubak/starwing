// dev-only probe (not part of the piece): node src/pieces/ship/_probe.mjs [times] [extraQuery]
import { chromium } from 'playwright';
import fs from 'node:fs';
const times = (process.argv[2] ?? '1,3,6,10').split(',').map(Number);
const extra = process.argv[3] ?? '';
const out = 'shots/ship-probe'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext=()=>({accept(){},dispose(){},on(){},prune(){}});export const injectQuery=(u)=>u;export function updateStyle(){}export function removeStyle(){}' })); // other agents' edits trigger full-reloads; don't let HMR connect
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ' ' + m.text().slice(0, 400)); });
await page.goto('http://localhost:5174/?piece=ship&seed=1&mute&fixed&autoplay' + extra, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 120000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
let stepped = 0;
for (const t of times) {
  const n = Math.round(t * 60) - stepped; stepped += Math.max(0, n);
  for (let d = 0; d < n; d += 60) await page.evaluate((k) => window.__engine.stepFrames(k), Math.min(60, n - d));
  const s = Date.now();
  await page.screenshot({ path: `${out}/t${String(t).padStart(3, '0')}${extra.replace(/[^a-z]/g, '')}.png`, timeout: 180000 });
  console.log('t=' + t, 'shot', Date.now() - s, 'ms');
  console.log(await page.evaluate(() => { const e = window.__engine; return JSON.stringify({ lost: e.renderer.getContext().isContextLost(), cam: e.camera.position.toArray().map((v) => +v.toFixed(2)), rot: e.camera.rotation.toArray().slice(0, 3).map((v) => +v.toFixed(2)), time: e.time, docBg: getComputedStyle(document.body).background.slice(0, 40), canvas: [e.renderer.domElement.width, e.renderer.domElement.height] }); }));
}
const info = await page.evaluate(() => { const e = window.__engine; e.composer.passes[0].render(e.renderer, null, e.composer.readBuffer, 0, false); return JSON.stringify(e.renderer.info.render); });
console.log('scene render info', info);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
