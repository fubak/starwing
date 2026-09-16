// Real-keyboard probe: boot ?stage=<s> (realtime), press actual keys,
// screenshot before/after, sample campaign state.
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = 'http://localhost:5174';
const out = 'shots/qa_keys';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const results = {};
const errors = [];

async function session(stage, fn, secs=12) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(`${stage} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type()==='error') errors.push(`${stage} console: ${m.text()}`); });
  await page.goto(`${base}/?stage=${stage}&mute`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engine?.piece && window.__campaign?.stage, null, { timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${stage}-a.png` });
  await fn(page);
  await page.screenshot({ path: `${out}/${stage}-b.png` });
  results[stage] = await page.evaluate(() => ({ stage: window.__campaign?.stage, failed: window.__campaign?.failed, paused: window.__campaign?.paused, calls: window.__engine.renderer.info.render.calls, tris: window.__engine.renderer.info.render.triangles }));
  await page.close();
}

// title: press Enter to confirm
await session('title', async (p) => { await p.waitForTimeout(2500); await p.keyboard.press('Enter'); await p.waitForTimeout(4000); }, 10);
// intro: press Enter to skip
await session('intro', async (p) => { await p.waitForTimeout(2000); await p.keyboard.press('Enter'); await p.waitForTimeout(4000); });
// rail: move + fire
await session('rail', async (p) => {
  await p.keyboard.down('KeyA'); await p.waitForTimeout(1200); await p.keyboard.up('KeyA');
  await p.keyboard.down('Space'); await p.waitForTimeout(2500); await p.keyboard.up('Space');
  await p.keyboard.down('KeyD'); await p.waitForTimeout(800); await p.keyboard.up('KeyD');
  await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/rail-pause.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(800);
}, 15);
// boss: fire + dodge
await session('boss', async (p) => {
  await p.waitForTimeout(4000);
  await p.keyboard.down('Space'); await p.waitForTimeout(3000);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(1000); await p.keyboard.up('KeyW');
  await p.keyboard.up('Space');
});
// space: boost + fire
await session('space', async (p) => {
  await p.keyboard.down('Shift'); await p.waitForTimeout(1500); await p.keyboard.up('Shift');
  await p.keyboard.down('Space'); await p.waitForTimeout(2500); await p.keyboard.up('Space');
  await p.keyboard.down('KeyS'); await p.waitForTimeout(800); await p.keyboard.up('KeyS');
});
// onfoot: run + jump + blaster
await session('onfoot', async (p) => {
  await p.keyboard.down('KeyW'); await p.waitForTimeout(2000);
  await p.keyboard.press('Space'); await p.waitForTimeout(900); await p.keyboard.up('KeyW');
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(600); await p.keyboard.press('KeyJ');
  await p.waitForTimeout(800);
});
// complete: observe
await session('complete', async (p) => { await p.waitForTimeout(5000); });

fs.writeFileSync(`${out}/keys.json`, JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors }, null, 2));
await browser.close();
