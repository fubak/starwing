// HUD stylesheet, injected once. All classes prefixed `sw-`.
// NOTE: all motion is driven from JS (deterministic under the fixed-step
// harness); CSS only declares layout & static looks. Blur-heavy shadows are
// avoided on animated elements to keep software rasterisation cheap.
export const FONT = `"Liberation Sans Narrow","Arial Narrow","Roboto Condensed","Segoe UI",system-ui,sans-serif`;

export const CSS = `
.sw-hud{position:absolute;left:50%;top:50%;width:1280px;height:720px;margin:-360px 0 0 -640px;
  transform:scale(var(--s,1));transform-origin:center;pointer-events:none;overflow:hidden;
  font-family:${FONT};color:#dff6ff;text-transform:uppercase;user-select:none}
.sw-hud *{box-sizing:border-box}
.sw-hud canvas{display:block;width:auto;height:auto}
.sw-vig{position:absolute;inset:0;background:
  radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 55%, rgba(4,8,20,.5) 100%)}
.sw-mod{position:absolute;will-change:transform,opacity}
.sw-label{font-weight:700;font-style:italic;font-size:15px;letter-spacing:.32em;color:#9fdcff;
  text-shadow:0 0 6px rgba(80,200,255,.6),0 1px 0 rgba(0,20,40,.9)}
.sw-shield{left:44px;top:34px}
.sw-shield .sw-row{display:flex;align-items:center;gap:12px}
.sw-shield .sw-label{margin-bottom:4px}
.sw-lives{display:flex;gap:6px;margin-top:8px;align-items:center}
.sw-lives .sw-label{font-size:12px;margin:0 6px 0 0}
.sw-right{right:44px;top:30px;text-align:right}
.sw-hits{display:flex;align-items:baseline;justify-content:flex-end;gap:14px}
.sw-hits .sw-label{font-size:15px}
.sw-num{font-weight:700;font-style:italic;font-size:54px;line-height:1;letter-spacing:.04em;color:#fff;
  text-shadow:0 0 2px rgba(255,255,255,.8),0 3px 0 rgba(0,40,80,.9),0 0 10px rgba(120,220,255,.5);
  font-variant-numeric:tabular-nums;transform-origin:right center;display:inline-block;will-change:transform}
.sw-score{margin-top:2px;font-weight:700;font-style:italic;font-size:22px;letter-spacing:.12em;color:#ffd75e;
  text-shadow:0 2px 0 rgba(60,30,0,.9),0 0 8px rgba(255,180,60,.45);font-variant-numeric:tabular-nums}
.sw-score span{color:#9fdcff;font-size:14px;letter-spacing:.3em;margin-right:10px}
.sw-boost{left:490px;bottom:74px;width:300px}
.sw-boost .sw-label{text-align:center;margin-top:3px;font-size:13px;letter-spacing:.42em}
.sw-boost .sw-label.hot{color:#bfe8ff;text-shadow:0 0 8px rgba(80,180,255,.95)}
.sw-boost .sw-label.brake{color:#ff9c8a;text-shadow:0 0 8px rgba(255,90,60,.95)}
.sw-radar{right:44px;bottom:34px}
.sw-radar .sw-label{position:absolute;right:0;top:-20px;font-size:11px;letter-spacing:.4em}
.sw-comm{position:absolute;left:40px;bottom:34px;display:flex;align-items:flex-end;will-change:transform,opacity}
.sw-port{position:relative;width:172px;height:172px;border-radius:6px;overflow:hidden;border:2px solid rgba(150,220,255,.85);
  outline:4px solid rgba(8,24,52,.9);outline-offset:0}
.sw-port canvas{position:absolute;inset:0;width:168px;height:168px}
.sw-port .sw-frame{position:absolute;inset:0;border-radius:4px;
  background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 30%,rgba(0,0,0,0) 70%,rgba(0,0,0,.35))}
.sw-port .sw-corner{position:absolute;width:16px;height:16px;border:3px solid #dff6ff}
.sw-port .c1{left:-1px;top:-1px;border-right:0;border-bottom:0}.sw-port .c2{right:-1px;top:-1px;border-left:0;border-bottom:0}
.sw-port .c3{left:-1px;bottom:-1px;border-right:0;border-top:0}.sw-port .c4{right:-1px;bottom:-1px;border-left:0;border-top:0}
.sw-bubble{position:relative;margin-left:18px;margin-bottom:6px;width:470px;min-height:100px;padding:12px 18px 14px 22px;
  background:linear-gradient(180deg,rgba(14,40,86,.88),rgba(5,16,42,.9));border:1.5px solid rgba(130,215,255,.8);
  border-radius:4px 14px 14px 4px;
  clip-path:polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%)}
.sw-bubble .sw-tab{position:absolute;left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,#9fdcff,#2f7dff)}
.sw-bubble:before{content:"";position:absolute;left:-13px;top:22px;border:8px solid transparent;border-right:12px solid rgba(130,215,255,.9);border-left:0}
.sw-name{font-weight:700;font-style:italic;font-size:14px;letter-spacing:.36em;color:#ffd75e;text-shadow:0 1px 0 rgba(60,30,0,.9);margin-bottom:6px}
.sw-name:after{content:"";display:block;height:1px;margin-top:5px;background:linear-gradient(90deg,rgba(255,215,94,.8),rgba(255,215,94,0))}
.sw-text{font-size:22px;line-height:1.3;letter-spacing:.02em;text-transform:none;color:#f2fbff;font-weight:400;
  text-shadow:0 1px 0 rgba(0,0,0,.9);min-height:58px}
.sw-text .sw-cur{display:inline-block;width:9px;height:18px;background:#9fdcff;vertical-align:-3px;margin-left:3px}
.sw-banner{position:absolute;left:0;right:0;top:50%;height:0;pointer-events:none;will-change:opacity}
.sw-banner .sw-bg{position:absolute;left:50%;top:0;width:1400px;height:150px;transform:translate(-50%,-50%) scaleY(0);
  background:linear-gradient(90deg,rgba(0,40,110,0),rgba(0,44,120,.7) 22%,rgba(0,44,120,.7) 78%,rgba(0,40,110,0))}
.sw-banner .sw-bl{position:absolute;left:0;right:0;top:0;height:2px;margin-top:-1px;transform:scaleX(0);
  background:linear-gradient(90deg,rgba(120,210,255,0),rgba(120,210,255,.9) 30%,#fff 50%,rgba(120,210,255,.9) 70%,rgba(120,210,255,0))}
.sw-banner .sw-bt{position:absolute;left:0;right:0;top:-58px;text-align:center;font-weight:700;font-style:italic;font-size:92px;letter-spacing:.18em;line-height:1;
  padding-left:.18em;color:#fff;white-space:nowrap;
  text-shadow:3px 0 0 rgba(255,70,60,.6),-3px 0 0 rgba(60,200,255,.65),0 6px 0 rgba(0,30,70,.95)}
.sw-banner .sw-bt span{display:inline-block;will-change:transform,opacity}
.sw-banner .sw-sub{position:absolute;left:0;right:0;top:52px;text-align:center;font-weight:700;font-style:italic;font-size:18px;letter-spacing:.5em;color:#ffd75e;
  text-shadow:0 2px 0 rgba(60,30,0,.9)}
.sw-dmg{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,60,40,0) 40%,rgba(255,60,40,.55) 100%);opacity:0;will-change:opacity}
.sw-warn{position:absolute;left:0;right:0;top:150px;text-align:center;font-weight:700;font-style:italic;font-size:26px;letter-spacing:.5em;color:#ff6e5e;
  text-shadow:0 2px 0 rgba(80,0,0,.9);opacity:0}
`;

export function injectStyles() {
  if (document.getElementById('sw-hud-css')) return;
  const s = document.createElement('style');
  s.id = 'sw-hud-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
