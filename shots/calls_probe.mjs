#!/usr/bin/env node
// Breakdown of what's drawn in a stage: node shots/calls_probe.mjs <stage>
import { chromium } from 'playwright';
const stage = process.argv[2] || 'onfoot';
const base = process.env.BASE_URL || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${base}/?fixed&mute&autoplay&seed=1&stage=${stage}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 30000 });
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); window.__engine.stepFrames(180); });
const r = await page.evaluate(() => {
  const e = window.__engine;
  const counts = {};
  let visMeshes = 0, visSprites = 0, visPoints = 0;
  e.scene.traverse(o => {
    if (!o.visible) return;
    const k = o.type + (o.material ? ':' + o.material.type : '');
    counts[k] = (counts[k] || 0) + 1;
    if (o.isMesh) visMeshes++; if (o.isSprite) visSprites++; if (o.isPoints) visPoints++;
  });
  // measure calls with shadows off vs on
  const i = e.renderer.info;
  i.autoReset = false;
  const measure = () => { i.reset(); e.stepFrames(4); return { calls: i.render.calls / 4, tris: Math.round(i.render.triangles / 4) }; };
  const withShadow = measure();
  const prevAuto = e.renderer.shadowMap.autoUpdate;
  e.renderer.shadowMap.enabled = false;
  const noShadow = measure();
  e.renderer.shadowMap.enabled = true; e.renderer.shadowMap.autoUpdate = prevAuto; e.renderer.shadowMap.needsUpdate = true;
  i.autoReset = true;
  return { counts, visMeshes, visSprites, visPoints, withShadow, noShadow, stage: window.__campaign?.stage };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
