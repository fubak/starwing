// dev-only probe: hide named objects at t and screenshot. node src/pieces/ship/_probe2.mjs <t> <name1,name2,...>
import { chromium } from 'playwright';
import fs from 'node:fs';
const t = Number(process.argv[2] ?? 10);
const names = (process.argv[3] ?? '').split(',').filter(Boolean);
const out = 'shots/ship-probe'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext=()=>({accept(){},dispose(){},on(){},prune(){}});export const injectQuery=(u)=>u;export function updateStyle(){}export function removeStyle(){}' }));
await page.goto('http://localhost:5174/?piece=ship&seed=1&mute&fixed&autoplay', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 120000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
const n = Math.round(t * 60);
for (let d = 0; d < n; d += 60) await page.evaluate((k) => window.__engine.stepFrames(k), Math.min(60, n - d));
console.log(await page.evaluate((names) => {
  const e = window.__engine; const seen = [];
  e.scene.traverse((o) => { if (o.name) seen.push(o.name + ':' + o.type); if (names.includes(o.name)) o.visible = false; });
  e.stepFrames(1);
  return seen.join(' | ');
}, names));
await page.screenshot({ path: `${out}/hide_${names.join('_') || 'none'}.png`, timeout: 180000 });
await browser.close();
