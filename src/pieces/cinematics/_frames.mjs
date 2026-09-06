// dev-only: boot the piece at a sequence (?cin=intro|complete|title) and grab frames at times.
//   node src/pieces/cinematics/_frames.mjs intro 0.6,1.6,2.6,3.4 /tmp/gf
import { chromium } from 'playwright';
const [cin = 'intro', timesArg = '1,2,3', out = '/tmp/cin'] = process.argv.slice(2);
const times = timesArg.split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { errors.push(m.text()); console.log('[console]', m.type(), m.text().slice(0, 300)); } });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
let base = 'http://localhost:5174';
try { const r = await fetch(base + '/'); if (!r.ok) throw 0; } catch { base = 'http://localhost:5173'; }
await page.goto(`${base}/?piece=cinematics&seed=1&mute&autoplay&fixed&cin=${cin}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 60000 });
await page.evaluate(() => cancelAnimationFrame(window.__engine._raf));
let stepped = 0;
for (const t of times) {
  const target = Math.round(t * 60);
  for (let done = stepped; done < target; done += 60) await page.evaluate((k) => window.__engine.stepFrames(k), Math.min(60, target - done));
  stepped = Math.max(stepped, target);
  await page.screenshot({ path: `${out}_${t}.png`, timeout: 120000 });
  console.log('shot', t);
}
console.log(errors.length ? `ERRORS: ${errors.length}` : 'no errors');
await browser.close();
