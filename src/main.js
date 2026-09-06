// Entry point. `?piece=<name>` boots one piece standalone in the harness
// (used by builders/critics); no query boots the full game.
import { Engine } from './core/engine.js';
import { PIECES } from './pieces/registry.js';

const params = new URLSearchParams(location.search);
const pieceName = params.get('piece');
const fixedStep = params.has('fixed') ? 1 / 60 : 0; // deterministic stepping for screenshots
const seed = Number(params.get('seed') ?? 1);
const autoplay = params.has('autoplay');

const engine = new Engine({
  container: document.getElementById('app'),
  ui: document.getElementById('ui'),
  fixedStep,
  seed,
  autoplay,
});

async function boot() {
  if (pieceName) {
    const loader = PIECES[pieceName];
    if (!loader) {
      document.body.innerHTML = `<pre style="color:#f66;padding:2em">Unknown piece "${pieceName}".\nKnown: ${Object.keys(PIECES).join(', ')}</pre>`;
      return;
    }
    const mod = await loader();
    await engine.run(mod.create);
  } else {
    const mod = await import('./game/game.js');
    await engine.run(mod.create);
  }
  window.__engine = engine; // harness hook (tools/shoot.mjs)
}

boot();
