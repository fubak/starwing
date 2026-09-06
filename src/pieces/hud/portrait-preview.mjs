// dev: source ~/.nvm/nvm.sh && node src/pieces/hud/portrait-preview.mjs  -> shots/hud/portraits.png
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 330 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5174/src/pieces/hud/portrait-preview.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
await page.screenshot({ path: 'shots/hud/portraits.png' });
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
