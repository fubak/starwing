// dev probe: time fixed steps per config on the HMR-free render server. usage: node _probe.mjs [extraQuery...]
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const configs = process.argv.slice(2).length ? process.argv.slice(2) : [''];
for (const extra of configs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.type(), m.text().slice(0, 300)); });
  let t0 = Date.now();
  await page.goto(`http://localhost:5174/?piece=spacesim&seed=1&mute&autoplay&fixed${extra}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
  await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
  await page.evaluate((k) => window.__engine.stepFrames(k), 2);
  t0 = Date.now(); await page.evaluate((k) => window.__engine.stepFrames(k), 10); console.log(`[${extra}] 10 frames ms`, Date.now() - t0);
  if (extra.includes('shot')) { t0 = Date.now(); await page.screenshot({ path: 'shots/spacesim/_probe.png', timeout: 120000 }); console.log('shot ms', Date.now() - t0); }
  await page.close();
}
await browser.close();
