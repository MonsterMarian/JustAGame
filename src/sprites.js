// Kreslené ikony: stroje při pohledu shora (podle typu stroje) a položky na dopravnících. Vše se kreslí jednou do mezipaměti.
import { MODELS, KINDS, ITEMS } from '../data/catalog.js';

export const S = 32; // pixelů na metr v mezipaměti
const cache = new Map();
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const rect = (g, x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h); };
const circ = (g, x, y, r, f) => { g.fillStyle = f; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, 6.2832); g.fill(); };
const line = (g, x1, y1, x2, y2, c, lw = 2) => { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
const row = (n, f) => { for (let i = 0; i < n; i++) f((i + 0.5) / n, i, n); };
const glow = (g, x, y, r, inner, outer) => {
  const rad = Math.max(1, r), gr = g.createRadialGradient(x, y, rad * 0.1, x, y, rad);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  circ(g, x, y, rad, gr);
};
const lens = (g, x, y, r, col) => {
  circ(g, x, y, r, DARK);
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.08, x, y, Math.max(1, r * 0.72));
  gr.addColorStop(0, '#ffffffcc'); gr.addColorStop(0.35, col); gr.addColorStop(1, '#102033');
  circ(g, x, y, r * 0.65, gr);
  g.strokeStyle = '#ffffff88'; g.lineWidth = Math.max(1, r * 0.12);
  g.beginPath(); g.arc(x, y, Math.max(0.5, r * 0.44), -2.4, -0.9); g.stroke();
};

const TIER = { hobby: ['#5a4c39', '#2b241b', '#ffb52e'], used: ['#77828f', '#39414b', '#b9c7d6'], new: ['#d8dde3', '#7d8794', '#3d78c2'] };
export const CAT_COL = { Doprava: '#c9b58a', Logistika: '#8b93a1', Osazování: '#3fb37f', DPS: '#2f9a63', Pasivní: '#d9a23a', Pouzdření: '#d07a45', Fab: '#6f9be0', Wafery: '#aebfd2', Suroviny: '#a8855a' };
const DARK = '#15181d', HOT = '#ff8a1e', LIQ = '#5fb8d6';

// Tvary strojů shora. W, H = rozměr v pixelech, c = [tělo, tmavá, akcent], m = model.
const LOOK = {
  scanner(g, W, H, c, m) {
    const euv = m.kind === 'm_euv', r = Math.min(W, H);
    rect(g, W * 0.08, H * 0.24, W * 0.2, H * 0.52, euv ? '#eef1f4' : c[2]); // zdroj světla
    if (euv) glow(g, W * 0.18, H * 0.5, r * 0.14, '#fff4b8', HOT);
    rect(g, W * 0.3, H * 0.16, W * 0.5, H * 0.68, c[1]);
    lens(g, W * 0.55, H * 0.5, r * 0.24, euv ? '#c8ced6' : '#6aa0e6'); // projekční optika s odleskem
    rect(g, W * 0.84, H * 0.3, W * 0.09, H * 0.4, c[1]);
  },
  cluster(g, W, H, c) {
    const R = Math.min(W, H) * 0.15, cx = W / 2, cy = H * 0.46;
    row(5, (f) => { const a = Math.PI * (1 + f), x = cx + Math.cos(a) * R * 2.2, y = cy + Math.sin(a) * R * 1.9; circ(g, x, y, R * 0.85, c[1]); circ(g, x, y, R * 0.5, c[2]); circ(g, x - R * 0.15, y - R * 0.15, R * 0.16, '#ffffff55'); });
    g.fillStyle = '#2c323b'; g.beginPath(); for (let i = 0; i < 6; i++) g.lineTo(cx + Math.cos(i * 1.047) * R, cy + Math.sin(i * 1.047) * R); g.fill();
    circ(g, cx, cy, R * 0.3, '#586475');
    rect(g, W * 0.2, H * 0.78, W * 0.6, H * 0.15, c[1]);
    row(3, (f) => { rect(g, W * (0.2 + f * 0.6) - W * 0.05, H * 0.81, W * 0.1, H * 0.09, DARK); rect(g, W * (0.2 + f * 0.6) - W * 0.03, H * 0.82, W * 0.06, H * 0.025, '#8ab4e8'); }); // FOUPy na EFEM
  },
  furnace(g, W, H, c) { row(Math.max(2, Math.round(W / S)), (f) => { circ(g, W * f, H * 0.4, H * 0.21, c[1]); glow(g, W * f, H * 0.4, H * 0.13, '#ffe794', HOT); }); rect(g, W * 0.15, H * 0.76, W * 0.7, H * 0.14, c[1]); },
  wet(g, W, H, c) {
    row(Math.max(2, Math.round(W / S)), (f) => {
      const lx = W * f - H * 0.17, ly = H * 0.3, lw = H * 0.34, lh = H * 0.4;
      rect(g, W * f - H * 0.24, H * 0.22, H * 0.48, H * 0.56, c[1]);
      rect(g, lx, ly, lw, lh, LIQ);
      line(g, lx + 2, ly + lh * 0.3, lx + lw - 2, ly + lh * 0.3, '#b8f0ff88', 1.2);
      line(g, lx + 3, ly + lh * 0.68, lx + lw - 3, ly + lh * 0.68, '#b8f0ff66', 1);
    });
  },
  track(g, W, H, c) { row(Math.max(2, Math.round(W / S)), (f) => { circ(g, W * f, H * 0.32, H * 0.14, DARK); circ(g, W * f, H * 0.32, H * 0.07, '#4c6582'); rect(g, W * f - H * 0.14, H * 0.58, H * 0.28, H * 0.22, c[1]); }); },
  implanter(g, W, H, c) {
    rect(g, W * 0.07, H * 0.5, W * 0.2, H * 0.36, DARK); rect(g, W * 0.2, H * 0.6, W * 0.5, H * 0.12, c[1]);
    g.strokeStyle = c[2]; g.lineWidth = H * 0.14; g.beginPath(); g.arc(W * 0.7, H * 0.38, H * 0.26, 0.2, 1.7); g.stroke();
    circ(g, W * 0.82, H * 0.34, H * 0.2, c[1]); circ(g, W * 0.82, H * 0.34, H * 0.12, '#c9d2de');
  },
  cmp(g, W, H, c) { row(3, (f) => { const x = W * (0.12 + f * 0.76); circ(g, x, H * 0.45, Math.min(W / 7, H * 0.28), c[1]); circ(g, x, H * 0.45, Math.min(W / 13, H * 0.14), '#c9d2de'); circ(g, x + 2, H * 0.45 - 2, Math.min(W / 24, H * 0.06), DARK); }); rect(g, W * 0.2, H * 0.82, W * 0.6, H * 0.1, c[1]); },
  power(g, W, H, c) { const r = Math.min(W, H); circ(g, W * 0.3, H * 0.35, r * 0.22, '#d9d4c8'); circ(g, W * 0.3, H * 0.35, r * 0.13, DARK); rect(g, W * 0.55, H * 0.2, W * 0.32, H * 0.45, c[1]); circ(g, W * 0.75, H * 0.78, r * 0.1, '#c8402f'); rect(g, W * 0.12, H * 0.72, W * 0.4, H * 0.14, '#24272c'); }, // chladicí věž, kotelna, komín, uhlí
  metro(g, W, H, c) { rect(g, W * 0.2, H * 0.2, W * 0.6, H * 0.6, c[1]); lens(g, W / 2, H / 2, Math.min(W, H) * 0.18, c[2]); },
  ate(g, W, H, c) { rect(g, W * 0.12, H * 0.18, W * 0.5, H * 0.64, DARK); rect(g, W * 0.68, H * 0.22, W * 0.2, H * 0.56, c[1]); row(3, (f) => rect(g, W * 0.71, H * (0.26 + f * 0.48), W * 0.14, H * 0.06, c[2])); },
  prober(g, W, H, c) { circ(g, W * 0.42, H / 2, Math.min(W, H) * 0.3, c[1]); circ(g, W * 0.42, H / 2, Math.min(W, H) * 0.2, '#c9d2de'); rect(g, W * 0.76, H * 0.28, W * 0.14, H * 0.44, DARK); },
  puller(g, W, H, c) { const r = Math.min(W, H); circ(g, W * 0.42, H / 2, r * 0.4, c[1]); glow(g, W * 0.42, H / 2, r * 0.27, '#fff2b2', HOT); circ(g, W * 0.42, H / 2, r * 0.12, '#dfe6ee'); rect(g, W * 0.8, H * 0.2, W * 0.13, H * 0.6, DARK); },
  saw(g, W, H, c) { rect(g, W * 0.15, H * 0.16, W * 0.12, H * 0.68, c[1]); rect(g, W * 0.73, H * 0.16, W * 0.12, H * 0.68, c[1]); row(6, (f) => line(g, W * 0.27, H * (0.2 + f * 0.6), W * 0.73, H * (0.2 + f * 0.6), '#dfe6ee', 1)); rect(g, W * 0.42, H * 0.3, W * 0.16, H * 0.4, '#8794a5'); },
  dicer(g, W, H, c) { circ(g, W * 0.45, H * 0.52, Math.min(W, H) * 0.28, c[1]); circ(g, W * 0.45, H * 0.52, Math.min(W, H) * 0.19, '#c9d2de'); line(g, W * 0.2, H * 0.3, W * 0.8, H * 0.3, c[2], 3); },
  bonder(g, W, H, c) { rect(g, W * 0.1, H * 0.55, W * 0.8, H * 0.2, c[1]); rect(g, W * 0.4, H * 0.22, W * 0.2, H * 0.4, DARK); circ(g, W * 0.78, H * 0.3, Math.min(W, H) * 0.12, c[2]); },
  mold(g, W, H, c) { rect(g, W * 0.12, H * 0.2, W * 0.34, H * 0.6, c[1]); rect(g, W * 0.54, H * 0.2, W * 0.34, H * 0.6, c[1]); row(3, (f) => circ(g, W * 0.29, H * (0.25 + f * 0.5), H * 0.06, DARK)); row(3, (f) => circ(g, W * 0.71, H * (0.25 + f * 0.5), H * 0.06, DARK)); },
  oven(g, W, H, c) {
    rect(g, W * 0.05, H * 0.3, W * 0.9, H * 0.4, c[1]);
    row(Math.max(2, Math.round((W / S) * 1.3)), (f, i) => {
      const gx = W * (0.07 + f * 0.86);
      glow(g, gx, H * 0.5, Math.max(4, H * 0.16), '#ffe082', i % 2 ? '#ff8a1e88' : '#c9541a88');
      rect(g, gx - 2, H * 0.34, 4, H * 0.32, i % 2 ? HOT : '#c9541a');
    });
    line(g, W * 0.03, H / 2, W * 0.97, H / 2, DARK, 2);
  },
  printer(g, W, H, c) {
    g.strokeStyle = c[1]; g.lineWidth = 3; g.strokeRect(W * 0.18, H * 0.2, W * 0.64, H * 0.6);
    rect(g, W * 0.28, H * 0.32, W * 0.44, H * 0.36, '#1f7a4d');
    line(g, W * 0.31, H * 0.4, W * 0.68, H * 0.4, '#d9b24a88', 1);
    line(g, W * 0.31, H * 0.58, W * 0.68, H * 0.58, '#d9b24a88', 1);
    line(g, W * 0.24, H * 0.45, W * 0.76, H * 0.45, c[2], 3);
  },
  pnp(g, W, H, c) {
    rect(g, W * 0.3, H * 0.34, W * 0.4, H * 0.32, '#1f7a4d');
    line(g, W * 0.33, H * 0.42, W * 0.67, H * 0.58, '#d9b24a88', 1);
    rect(g, W * 0.43, H * 0.46, W * 0.14, H * 0.1, DARK);
    row(Math.max(3, Math.round(W / 7)), (f) => { rect(g, W * f - 1.5, H * 0.08, 3, H * 0.16, DARK); rect(g, W * f - 1.5, H * 0.76, 3, H * 0.16, DARK); });
    rect(g, W * 0.1, H * 0.44, W * 0.8, H * 0.08, c[1]); rect(g, W * 0.52, H * 0.38, W * 0.1, H * 0.2, c[2]);
  },
  press(g, W, H, c) { for (let i = 0; i < 3; i++) rect(g, W * (0.14 + i * 0.07), H * (0.14 + i * 0.07), W * (0.72 - i * 0.14), H * (0.72 - i * 0.14), i % 2 ? c[2] : c[1]); },
  ldi(g, W, H, c) { rect(g, W * 0.14, H * 0.24, W * 0.72, H * 0.52, c[1]); rect(g, W * 0.1, H * 0.42, W * 0.8, H * 0.12, DARK); glow(g, W * 0.5, H * 0.48, Math.min(W, H) * 0.11, '#ff9aa2', '#ff3b4e'); },
  plating(g, W, H, c) {
    row(Math.max(3, Math.round(W / S / 1.5)), (f, i) => {
      const rx = W * f - Math.min(W / 12, H * 0.22), rw = Math.min(W / 6, H * 0.44);
      rect(g, rx, H * 0.24, rw, H * 0.52, [LIQ, '#3fa37a', '#c9783b'][i % 3]);
      line(g, rx + 2, H * 0.42, rx + rw - 2, H * 0.42, '#ffffff66', 1.2);
    });
    line(g, W * 0.03, H * 0.14, W * 0.97, H * 0.14, c[1], 3);
  },
  line(g, W, H, c) { rect(g, W * 0.03, H * 0.3, W * 0.94, H * 0.4, c[1]); row(Math.max(4, Math.round(W / 9)), (f) => line(g, W * f, H * 0.33, W * f, H * 0.67, DARK, 2)); rect(g, W * 0.03, H * 0.46, W * 0.94, H * 0.08, c[2]); },
  stamp(g, W, H, c) { rect(g, W * 0.3, H * 0.18, W * 0.4, H * 0.64, c[1]); circ(g, W * 0.5, H * 0.34, Math.min(W, H) * 0.15, DARK); line(g, W * 0.04, H * 0.66, W * 0.96, H * 0.66, c[2], 3); },
  winder(g, W, H, c) { circ(g, W * 0.3, H / 2, Math.min(W, H) * 0.24, c[1]); circ(g, W * 0.3, H / 2, Math.min(W, H) * 0.08, DARK); circ(g, W * 0.7, H / 2, Math.min(W, H) * 0.18, c[2]); line(g, W * 0.3, H * 0.28, W * 0.7, H * 0.34, DARK, 1.5); },
  bench(g, W, H) { rect(g, W * 0.06, H * 0.14, W * 0.88, H * 0.72, '#8a6a45'); rect(g, W * 0.14, H * 0.24, W * 0.5, H * 0.52, '#2f6fb5'); rect(g, W * 0.7, H * 0.26, W * 0.16, H * 0.14, DARK); rect(g, W * 0.7, H * 0.52, W * 0.16, H * 0.2, '#c9d2de'); },
  excavator(g, W, H) {
    rect(g, W * 0.14, H * 0.5, W * 0.5, H * 0.14, DARK); rect(g, W * 0.14, H * 0.74, W * 0.5, H * 0.14, DARK);
    rect(g, W * 0.2, H * 0.46, W * 0.38, H * 0.44, '#f2b632'); rect(g, W * 0.26, H * 0.52, W * 0.14, H * 0.18, '#22303d');
    line(g, W * 0.5, H * 0.6, W * 0.8, H * 0.26, '#f2b632', Math.max(2, H * 0.09)); rect(g, W * 0.74, H * 0.12, W * 0.16, H * 0.16, DARK);
  },
  drill(g, W, H, c, m) {
    if (m.kind === 'm_pcb_drill') {
      rect(g, W * 0.12, H * 0.3, W * 0.76, H * 0.5, c[1]);
      row(6, (f) => circ(g, W * (0.15 + f * 0.7), H * 0.24, Math.min(W, H) * 0.045, DARK));
      rect(g, W * 0.2, H * 0.4, W * 0.6, H * 0.3, '#1f7a4d');
      row(4, (f) => circ(g, W * (0.28 + f * 0.44), H * 0.55, Math.min(W, H) * 0.03, '#d9b24a'));
      return;
    }
    rect(g, W * 0.18, H * 0.55, W * 0.64, H * 0.3, '#2f6fb5'); rect(g, W * 0.46, H * 0.1, W * 0.08, H * 0.6, '#b8bcc2'); rect(g, W * 0.4, H * 0.08, W * 0.2, H * 0.08, '#c0392b');
  },
  shaft(g, W, H, c) { rect(g, W * 0.12, H * 0.42, W * 0.45, H * 0.46, c[1]); line(g, W * 0.76, H * 0.9, W * 0.76, H * 0.14, '#59616d', 3); circ(g, W * 0.76, H * 0.18, Math.min(W, H) * 0.1, '#c0392b'); line(g, W * 0.57, H * 0.6, W * 0.76, H * 0.18, DARK, 1.5); },
  arc(g, W, H) { const r = Math.min(W, H); circ(g, W * 0.45, H / 2, r * 0.4, '#3a3f47'); glow(g, W * 0.45, H / 2, r * 0.3, '#ffe08a', '#ff7a1a'); for (let i = 0; i < 3; i++) circ(g, W * 0.45 + Math.cos(i * 2.094) * r * 0.13, H / 2 + Math.sin(i * 2.094) * r * 0.13, r * 0.05, DARK); rect(g, W * 0.86, H * 0.2, W * 0.1, H * 0.6, '#59616d'); },
  reactor(g, W, H, c) { for (let j = 0; j < 3; j++) row(5, (f) => { circ(g, W * (0.06 + f * 0.62), H * (0.22 + j * 0.28), Math.min(W / 13, H / 8), c[0]); glow(g, W * (0.06 + f * 0.62), H * (0.22 + j * 0.28), Math.min(W / 24, H / 14), '#ffe299', HOT); }); row(3, (f) => circ(g, W * 0.86, H * (0.15 + f * 0.7), Math.min(W, H) * 0.07, '#59616d')); },
};

export function machineSprite(id) {
  let c = cache.get(id);
  if (c) return c;
  const m = MODELS[id], kd = KINDS[m.kind], W = m.w * S, H = m.h * S, col = m.kind === 'm_miner' ? ['#3b3327', '#211c15', '#f2b632'] : TIER[m.tier];
  c = mk(W, H);
  const g = c.getContext('2d');
  rect(g, 1, 1, W - 2, H - 2, '#0b0d10');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1]);
  rect(g, 2.5, 2.5, W - 5, H - 5, grad);
  // vnitřní zkosený rámeček
  line(g, 3, 3, W - 3, 3, '#ffffff38', 1.2); line(g, 3, 3, 3, H - 3, '#ffffff28', 1.2);
  line(g, 3, H - 3, W - 3, H - 3, '#00000070', 1.4); line(g, W - 3, 3, W - 3, H - 3, '#00000060', 1.4);
  rect(g, 2.5, 2.5, W - 5, Math.max(2.5, H * 0.07), CAT_COL[kd.cat]); // pruh v barvě oboru
  g.save(); g.beginPath(); g.rect(3, 3, W - 6, H - 6); g.clip();
  (LOOK[kd.look] ?? LOOK.metro)(g, W, H, col, m);
  // větrací mřížky v pravém dolním rohu
  for (let i = 0; i < 3; i++) line(g, W - 10 + i * 2.5, H - 7, W - 10 + i * 2.5, H - 4, '#00000066', 1);
  // stavová dioda se září
  glow(g, W - 6, 7, 3.5, '#a8ffd0', '#3fe08a00');
  circ(g, W - 6, 7, 1.6, '#3fe08a');
  g.restore();
  cache.set(id, c);
  return c;
}

const SHAPE = {
  ore(g, c) {
    circ(g, 12, 19, 7, c); circ(g, 20, 17, 6, c); circ(g, 16, 11, 6, c);
    circ(g, 18, 18, 5, '#00000024');
    circ(g, 14, 10, 2.5, '#ffffff70'); circ(g, 21, 15, 1.5, '#ffffff60');
  },
  ingot(g, c) {
    const gr = g.createLinearGradient(5, 10, 5, 22);
    gr.addColorStop(0, '#ffffff66'); gr.addColorStop(0.35, c); gr.addColorStop(1, '#00000045');
    rect(g, 5, 10, 22, 12, c); rect(g, 5, 10, 22, 12, gr);
    circ(g, 5, 16, 6, c); circ(g, 27, 16, 6, '#e8edf3'); circ(g, 27, 16, 3, '#9fb0c4');
  },
  foup(g, c) {
    rect(g, 12, 4, 8, 3, '#7b8798'); // OHT příruba
    rect(g, 6, 7, 20, 20, '#39424f'); rect(g, 8, 9, 16, 4, c);
    rect(g, 8, 14, 16, 11, '#1d2530');
    for (let i = 0; i < 4; i++) rect(g, 9, 15 + i * 2.6, 14, 1.4, '#b8cde0');
    line(g, 9, 14, 22, 24, '#ffffff28', 1.2);
  },
  tray(g, c) {
    rect(g, 4, 8, 24, 16, '#0f1114');
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const x = 6.5 + i * 5.3, y = 10.5 + j * 6;
      rect(g, x, y, 4, 4.5, c);
      rect(g, x + 0.8, y + 0.8, 2.4, 2.8, '#1a2029');
      rect(g, x + 1.3, y + 1.3, 1.4, 1.6, '#d9b24a');
    }
  },
  reel(g, c) {
    circ(g, 16, 16, 11.5, c); circ(g, 16, 16, 8.5, '#1d222b'); circ(g, 16, 16, 7.5, '#e9edf2');
    for (let i = 0; i < 4; i++) line(g, 16, 16, 16 + Math.cos(i * 1.57 + 0.4) * 7, 16 + Math.sin(i * 1.57 + 0.4) * 7, '#677485', 1.5);
    circ(g, 16, 16, 3, '#20242b');
  },
  pcb(g, c) {
    rect(g, 5, 8, 22, 16, c); rect(g, 5, 22, 22, 2, '#d9b24a');
    line(g, 8, 12, 22, 12, '#ffffff38', 1); line(g, 8, 17, 19, 17, '#ffffff30', 1);
    for (let i = 0; i < 4; i++) circ(g, 9 + i * 5, 13, 1.1, '#d9b24a');
  },
  board(g, c) {
    rect(g, 4, 8, 24, 16, c);
    line(g, 6, 15, 25, 15, '#ffffff28', 1);
    rect(g, 8, 11, 7, 7, '#15181d'); rect(g, 9.5, 12.5, 4, 4, '#2c333f');
    rect(g, 18, 11, 5, 4, '#15181d'); rect(g, 18, 17, 6, 3, '#c9d2de');
    rect(g, 4, 22, 24, 2, '#d9b24a');
  },
  box(g, c) {
    rect(g, 6, 9, 20, 16, c); rect(g, 6, 9, 20, 4, '#00000040');
    rect(g, 14, 9, 4, 16, '#ffffff35'); rect(g, 8, 17, 5, 4, '#f3f5f7bb');
  },
  pc(g, c) {
    rect(g, 9, 4, 14, 24, '#20242b'); rect(g, 10.5, 7, 11, 18, '#131820');
    rect(g, 11, 5.5, 10, 2.5, c);
    glow(g, 16, 14, 4.5, '#ffffff99', c);
    circ(g, 16, 20, 3.8, '#3a424d'); circ(g, 16, 20, 1.4, c);
  },
};
export function itemSprite(id) {
  let c = cache.get('i:' + id);
  if (c) return c;
  const it = ITEMS[id];
  c = mk(48, 48);
  const g = c.getContext('2d');
  g.save();
  g.scale(1.5, 1.5);
  circ(g, 16, 24, 10, '#00000055');
  if (it.wip) { circ(g, 16, 16, 15, '#0b0d10'); g.strokeStyle = it.col; g.lineWidth = 2.5; g.beginPath(); g.arc(16, 16, 13.5, 0, 6.2832); g.stroke(); } // rozpracovaná dávka má kroužek v barvě trasy
  (SHAPE[it.shape] ?? SHAPE.box)(g, it.wip ? '#c9d2de' : it.col);
  g.restore();
  cache.set('i:' + id, c);
  return c;
}
// kopie ikony jako prvek do panelů
export function icon(id, px = 28) {
  const src = MODELS[id] ? machineSprite(id) : itemSprite(id), k = px / Math.max(src.width, src.height);
  const c = mk(src.width * k, src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  c.className = 'ico';
  return c;
}
