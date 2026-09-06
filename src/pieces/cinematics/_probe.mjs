// dev-only probe: boot piece, step N frames, run JS in page, screenshot.
//   CIN=intro node src/pieces/cinematics/_probe.mjs "<js>" [frames] [shots]
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('crash', () => console.log('[crash]'));
const cin = process.env.CIN ? `&cin=${process.env.CIN}` : '';
await page.goto(`http://localhost:5173/?piece=${process.env.PIECE ?? 'cinematics'}&seed=1&mute&autoplay&fixed${cin}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
const frames = Number(process.argv[3] ?? 30);
if (process.env.PRE) await page.evaluate(`(() => { ${process.env.PRE} })()`);
const tS = Date.now();
for (let done = 0; done < frames; done += 30) await page.evaluate((k) => window.__engine.stepFrames(k), Math.min(30, frames - done));
console.log('steps ms', Date.now() - tS);
const fin = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const t = performance.now(); gl.finish(); return performance.now() - t; });
console.log('gl.finish ms', fin);
const js = process.argv[2] ?? 'null';
const r = await page.evaluate(`(async () => { ${js} })()`);
console.log('result', JSON.stringify(r));
const shots = Number(process.argv[4] ?? 1);
for (let i = 0; i < shots; i++) {
  const t0 = Date.now();
  await page.screenshot({ path: `${process.env.OUT ?? '/tmp/probe'}${i ? i : ''}.png`, timeout: 120000 });
  const info = await page.evaluate(() => ({ lost: window.__engine.renderer.getContext().isContextLost(), frame: window.__engine.frame, logo: window.__cine?.overlay.logoWrap.style.opacity, fade: window.__cine?.overlay.fade.style.opacity }));
  console.log(`shot ${i} ms`, Date.now() - t0, JSON.stringify(info));
}
await browser.close();
