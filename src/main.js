// Start hry: hlavní menu, načtení uložené pozice, hlavní smyčka (simulace + 3D pohled), automatické ukládání.
import { G, CAM0 } from './g.js';
import * as sim from './sim.js';
import { drawMinimap } from './render.js';
import { init3d, frame3d, toScreen } from './world3d.js';
import { initUI, resetUI, tickUI, openModal, showTitle, toast } from './ui.js';

const SAVE = 'myc_save_v4', MAX_DT = 1 / 12; // delší krok by položky na dopravnících přeskakoval
const mini = document.getElementById('minimap').getContext('2d');

function save() {
  if (!G.live) return; // svět, který jen běží za hlavním menu, se neukládá
  try { localStorage.setItem(SAVE, sim.serialize(G.s)); } catch (e) { toast('Hru se nepodařilo uložit: ' + e.message, 'err'); }
}
function newGame(o = {}) { // o = { level, sandbox }; pro zkoušky i jen true/false = pískoviště
  G.s = sim.newGame(typeof o === 'boolean' ? { sandbox: o } : o);
  Object.assign(G, { cam: { ...CAM0 }, moved: false, fly: null, under: false, hot: null, live: true });
  resetUI(); save();
}
try {
  const raw = localStorage.getItem(SAVE);
  if (raw) { G.s = sim.deserialize(raw); G.live = true; }
} catch (e) { console.error(e); }
G.s ??= sim.newGame({ level: 'l1' }); // kulisa za hlavním menu, dokud hráč nic nezačne

init3d(document.getElementById('view'));
initUI({ save, newGame, minimap: () => drawMinimap(mini, 184, innerWidth, innerHeight) });
showTitle();
addEventListener('beforeunload', save);
setInterval(save, 30000);

let last = performance.now();
function frame(now) {
  const real = Math.min(0.25, (now - last) / 1000);
  last = now; G.time += real;
  if (G.speed > 0 && !G.title) { // za hlavním menu čas stojí
    const total = real * G.speed, n = Math.max(1, Math.ceil(total / MAX_DT));
    for (let i = 0; i < n; i++) sim.tick(G.s, total / n);
  }
  frame3d();
  tickUI(now, real);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__G = G; window.__sim = sim; window.__ui = { newGame, openModal, showTitle, draw: frame3d, screen: toScreen }; // pro ladění a snímky (tools/shot.cjs)
