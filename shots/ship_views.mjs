import { chromium } from 'playwright';
const views = process.argv.slice(2).length ? process.argv.slice(2) : ['side', 'top', 'front', 'iso', 'under', 'back'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const v of views) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:5173/?piece=ship&seed=1&mute&fixed&view=${v}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
  await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); window.__engine.stepFrames(30); });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 500))));
  await page.screenshot({ path: `shots/ship_view_${v}.png`, timeout: 120000 });
  console.log('view', v);
  await page.close();
}
await browser.close();
