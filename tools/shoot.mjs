#!/usr/bin/env node
/**
 * Render a piece (or the full game) headlessly and capture PNG frames + a video.
 *
 *   node tools/shoot.mjs <piece|game> [--times 1,3,6,10] [--video 8] [--autoplay] [--seed 1] [--out shots/<name>]
 *
 * Frames are captured deterministically: the page boots with `?fixed` so each
 * engine.step() advances exactly 1/60s, and we step to each requested time.
 * The video is a real-time recording (autoplay input script if the piece
 * supports it) so motion/feel can be judged.
 *
 * Uses the HMR-free render server on port 5174 (`NO_HMR=1 npx vite`), falling
 * back to 5173 — or set BASE_URL. (HMR reloads from other agents' edits would
 * otherwise wipe window.__engine mid-capture.)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const name = args[0] && !args[0].startsWith('--') ? args[0] : 'game';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);
const times = opt('times', '1,3,6,10').split(',').map(Number);
const videoSecs = Number(opt('video', '8'));
const seed = opt('seed', '1');
const out = opt('out', path.join('shots', name));
async function pickBase() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  try { const r = await fetch('http://localhost:5174/'); if (r.ok) return 'http://localhost:5174'; } catch {}
  return 'http://localhost:5173';
}
const base = await pickBase();
const W = 1280, H = 720;

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true, force: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const q = (extra) => `${base}/?${name === 'game' ? '' : `piece=${name}&`}seed=${seed}&mute${has('autoplay') ? '&autoplay' : ''}${extra}`;
const errors = [];

// ---- deterministic frames
{
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(q('&fixed'), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 30000 }).catch(() => errors.push('engine never booted'));
  // Stop the RAF loop so we own stepping.
  await page.evaluate(() => { cancelAnimationFrame(window.__engine._raf); });
  let stepped = 0;
  for (const t of times) {
    const target = Math.round(t * 60);
    const n = target - stepped;
    if (n > 0) {
      // step in chunks to avoid long evaluate calls
      for (let done = 0; done < n; done += 120) {
        const k = Math.min(120, n - done);
        await page.evaluate((k) => window.__engine.stepFrames(k), k);
      }
      stepped = target;
    }
    await page.screenshot({ path: path.join(out, `t${String(t).padStart(3, '0')}.png`) });
    console.log(`frame t=${t}s`);
  }
  await page.close();
}

// ---- realtime video
if (videoSecs > 0) {
  const vctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
  const page = await vctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror(video): ${e.message}`));
  await page.goto(q(''), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engine?.piece, null, { timeout: 30000 }).catch(() => {});
  // Simulate a user gesture then a scripted keyboard session if not autoplay.
  await page.mouse.click(W / 2, H / 2);
  if (!has('autoplay')) {
    const t0 = Date.now();
    const seq = [['Enter', 400], ['ArrowLeft', 700], ['ArrowUp', 500], ['Space', 300], ['ArrowRight', 800], ['ShiftLeft', 900], ['KeyQ', 300], ['Space', 300], ['ArrowDown', 600], ['KeyE', 300], ['Space', 300], ['ControlLeft', 700]];
    for (const [key, ms] of seq) {
      if (Date.now() - t0 > videoSecs * 1000) break;
      await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
      await page.waitForTimeout(150);
    }
    const left = videoSecs * 1000 - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
  } else {
    await page.waitForTimeout(videoSecs * 1000);
  }
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
  console.log(`realtime fps (swiftshader, not representative of GPU): ${fps}`);
  await page.close();
  await vctx.close();
  const vids = fs.readdirSync(out).filter((f) => f.endsWith('.webm'));
  if (vids[0]) fs.renameSync(path.join(out, vids[0]), path.join(out, 'video.webm'));
}

await browser.close();
fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.join('\n')}` : 'no page errors');
console.log(`wrote ${out}`);
