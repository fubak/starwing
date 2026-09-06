#!/usr/bin/env node
// Quick deterministic probe: node tools/probe.mjs "<query>" --times 2,8 --out shots/probe
// Steps the fixed-step engine, screenshots at the given times, dumps console errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const query = args[0] && !args[0].startsWith('--') ? args[0] : '';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const times = opt('times', '2,6').split(',').map(Number);
const out = opt('out', 'shots/probe');
const base = process.env.BASE_URL || 'http://localhost:5174';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(`${base}/?fixed&mute&seed=1${query ? '&' + query : ''}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 30000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
let stepped = 0;
for (const t of times) {
  const target = Math.round(t * 60);
  while (stepped < target) { const k = Math.min(60, target - stepped); await page.evaluate((k) => window.__engine.stepFrames(k), k); stepped += k; await page.waitForTimeout(30); }
  await page.screenshot({ path: path.join(out, `t${String(t).padStart(3, '0')}.png`) });
  const info = await page.evaluate(() => ({ calls: window.__engine.renderer.info.render.calls, tris: window.__engine.renderer.info.render.triangles, children: window.__engine.scene.children.length, ui: document.getElementById('ui')?.children.length }));
  console.log(`t=${t}s`, JSON.stringify(info));
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors');
