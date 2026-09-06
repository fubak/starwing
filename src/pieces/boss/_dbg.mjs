// dev probe: step to a time without rendering (fast) and dump gameplay state
import { chromium } from 'playwright';
const T = Number(process.argv[2] || 7);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
await page.addInitScript(() => { window.WebSocket = class { constructor() {} addEventListener() {} removeEventListener() {} send() {} close() {} }; });
await page.goto(`http://localhost:5173/?piece=boss&seed=1&mute&autoplay&fixed`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); });
const dump = await page.evaluate((T) => {
  const e = window.__engine; const d = e.piece.debug; const log = [];
  // step without rendering (skip composer) to be fast
  const dt = 1 / 60; let bolts = 0, boltHits = 0;
  for (let i = 0; i < T * 60; i++) {
    e.input.update(dt, e.time += dt); e.piece.update(dt, e.time); e.input.endFrame();
    if (i % 120 === 0) {
      const p = d.S.player.pos; const act = d.bolts.pool.filter((b) => b.active);
      const wps = d.boss.weakPoints.filter((w) => w.alive && w.phase === d.S.phase).map((w) => { const v = d.worldPos(w.mesh, d.ship.position.clone()); return `${w.name}@(${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)}) hp${w.hp}`; });
      const b0 = act[0]; const bs = b0 ? `bolt0 (${b0.g.position.x.toFixed(0)},${b0.g.position.y.toFixed(0)},${b0.g.position.z.toFixed(0)}) v(${b0.v.x.toFixed(0)},${b0.v.y.toFixed(0)},${b0.v.z.toFixed(0)})` : 'no bolts';
      log.push(`t=${(i / 60).toFixed(0)} phase=${d.S.phase} intro=${d.S.intro} hits=${d.S.hits} fire=${e.input.isHeld('fire')} axes=(${e.input.axes.x.toFixed(2)},${e.input.axes.y.toFixed(2)}) player=(${p.x.toFixed(1)},${p.y.toFixed(1)}) bolts=${act.length} ${bs} | ${wps.join(' ; ')}`);
    }
  }
  return log.join('\n');
}, T);
console.log(dump);
await browser.close();
