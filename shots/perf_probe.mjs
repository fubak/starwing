#!/usr/bin/env node
// Per-stage perf probe: node shots/perf_probe.mjs [stage ...]
// Boots the full game at ?stage=<s>&fixed&mute&autoplay, steps deterministically,
// samples renderer.info + mean step ms (SwiftShader; RELATIVE only).
import { chromium } from 'playwright';
const stages = process.argv.slice(2).filter(a => !a.startsWith('--'));
const LIST = stages.length ? stages : ['title', 'intro', 'rail', 'boss', 'space', 'onfoot'];
const base = process.env.BASE_URL || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const out = [];
for (const stage of LIST) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await page.goto(`${base}/?fixed&mute&autoplay&seed=1&stage=${stage}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 30000 });
    await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); window.__engine.pinScale(1); });
    // wait for stage to be current
    await page.waitForFunction((s) => window.__campaign?.stage === s && !window.__campaign.failed, stage, { timeout: 20000 }).catch(() => {});
    // warm up 2s sim, then sample 3 windows of 2s each
    const samples = [];
    let geo0 = null;
    for (let w = 0; w < 3; w++) {
      const r = await page.evaluate(() => {
        const e = window.__engine;
        const i = e.renderer.info;
        i.autoReset = false; i.reset();
        const t0 = performance.now(); const n = 40;
        e.stepFrames(n);
        const ms = (performance.now() - t0) / n;
        const calls = i.render.calls / n, tris = i.render.triangles / n;
        i.autoReset = true;
        return { ms, calls, tris, geo: i.memory.geometries, tex: i.memory.textures, stage: window.__campaign?.stage, scale: e.renderScale };
      });
      if (w > 0) samples.push(r); else geo0 = r;
    }
    const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
    const row = { stage: samples[0].stage, ms: +avg('ms').toFixed(1), calls: Math.round(avg('calls')), tris: Math.round(avg('tris')), geo: Math.round(avg('geo')), tex: Math.round(avg('tex')), scale: samples[0].scale, errs: errs.length };
    out.push(row);
    console.log(JSON.stringify(row));
    if (errs.length) console.log('  errors:', errs.slice(0, 5).join(' | '));
  } catch (e) {
    console.log(JSON.stringify({ stage, error: e.message }));
  }
  await page.close();
}
await browser.close();
import fs from 'node:fs';
fs.writeFileSync('shots/perf.json', JSON.stringify(out, null, 2));
