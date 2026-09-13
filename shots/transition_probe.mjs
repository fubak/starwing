#!/usr/bin/env node
// Transition probe: intro -> rail with warm prebuild + stageLog marks.
// ?stage=intro boots straight into the intro; the warm pump builds rail one unit
// per stepped frame; Enter skips the intro; stageLog records per-switch ms.
import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', e => console.log('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type(), m.text().slice(0, 300)); });
await page.goto(`${base}/?fixed&mute&autoplay&seed=1&stage=${process.argv[2] || 'intro'}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 30000 });
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); });
const poll = () => page.evaluate(() => ({ stage: window.__campaign?.stage, t: +(window.__campaign?.stageT ?? 0).toFixed(2), warm: window.__campaign?.warm }));
const step = (n) => page.evaluate((k) => window.__engine.stepFrames(k), n);

await step(30);
for (let i = 0; i < 30; i++) {                       // let warm finish (rail: ~23 units)
  const s = await poll(); if (s.warm?.done) { console.log('warm done at poll', i, JSON.stringify(s.warm)); break; }
  await step(4);
}
console.log('pre-skip:', JSON.stringify(await poll()));
await page.keyboard.press('Enter');
for (let i = 0; i < 80; i++) { await step(8); const s = await poll(); if (s.stage === 'rail' && s.t > 0.5) break; }
console.log('post:', JSON.stringify(await poll()));
const log = await page.evaluate(() => window.__campaign?.stageLog ?? []);
for (const m of log) console.log(`${m.from} -> ${m.to}: dispose ${m.disposeMs?.toFixed(1)}ms  build ${m.buildMs?.toFixed(1)}ms  compile ${m.compileMs?.toFixed(1)}ms  total ${(m.tReady - m.t0).toFixed(1)}ms`);
await page.screenshot({ path: 'shots/transition_rail.png' });
await browser.close();
