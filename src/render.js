// 2D kreslení: textura terénu pro 3D pohled (po blocích 32 × 32 m) a minimapa.
import { CHUNK, ORES } from './world.js';
import { left, key, SURF_T } from './sim.js';
import { G } from './g.js';

const TP = 8; // pixelů na metr v textuře terénu
const TER = [[26, 74, 112], [208, 190, 142], [86, 138, 72], [146, 148, 88], [122, 124, 128]]; // voda, písek, tráva, suchá tráva, skála
const SHORE = [52, 118, 146]; // mělčina u břehu
const DETAIL = [null, [188, 168, 120], [62, 112, 56], [120, 124, 70], [92, 94, 100]]; // drobná kresba: vlnky v písku, trsy trávy, praskliny ve skále

/** Nakreslí blok terénu do plátna (nového, nebo do stávajícího po vytěžení dlaždice). */
export function drawChunk(s, cx, cy, c = document.createElement('canvas')) {
  c.width = c.height = CHUNK * TP;
  const g = c.getContext('2d'), world = s._world, ch = world.chunk(cx, cy);
  const rgb = (col, k) => `rgb(${Math.min(255, col[0] * k) | 0},${Math.min(255, col[1] * k) | 0},${Math.min(255, col[2] * k) | 0})`;
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const x = cx * CHUNK + i, y = cy * CHUNK + j, t = ch.terrain[j * CHUNK + i], o = ch.ore[j * CHUNK + i], k = 0.88 + 0.24 * world.tone(x, y), X = i * TP, Y = j * TP;
    const near = [world.terrain(x + 1, y), world.terrain(x, y + 1), world.terrain(x - 1, y), world.terrain(x, y - 1)];
    g.fillStyle = rgb(t === 0 && near.some((n) => n !== 0) ? SHORE : TER[t], k); g.fillRect(X, Y, TP, TP);
    near.forEach((n, d) => { // měkký přechod: na hraně dlaždice proužek barvy souseda
      if (n === t || (t === 0 && n !== 0)) return;
      g.fillStyle = rgb(n === 0 ? SHORE : TER[n], k) ; g.globalAlpha = 0.45;
      g.fillRect(X + (d === 0 ? TP - 2 : 0), Y + (d === 1 ? TP - 2 : 0), d & 1 ? TP : 2, d & 1 ? 2 : TP); g.globalAlpha = 1;
    });
    if (DETAIL[t]) { g.fillStyle = rgb(DETAIL[t], k); for (let n = 0; n < 2; n++) g.fillRect(X + (world.rnd(x, y, 40 + n) * 7 | 0), Y + (world.rnd(x, y, 50 + n) * 7 | 0), t === 4 ? 3 : 1, 1); }
    const dug = s.dug[key(x, y) * 8];
    if (dug) { g.fillStyle = `rgba(74,58,44,${0.35 + 0.6 * Math.min(1, dug / SURF_T)})`; g.fillRect(X, Y, TP, TP); g.fillStyle = 'rgba(40,30,22,0.35)'; g.fillRect(X, Y + 3, TP, 1); g.fillRect(X, Y + 6, TP, 1); } // odkrytá hornina s vrstvami
    if (!o || left(s, x, y) <= 0) continue;
    g.fillStyle = ORES[o].col; g.globalAlpha = 0.3; g.fillRect(X, Y, TP, TP); g.globalAlpha = 1; // ložisko: půda obarvená nerostem (kusy nerostu jsou ve 3D)
  }
  return c;
}

// Minimapa: terén a ložiska vzorkované přímo ze šumu, budovy jako body, rámeček pohledu.
export function drawMinimap(g, size, W, H) {
  const { s, cam } = G, step = 8, n = size / 2, half = (n * step) / 2;
  const img = g.createImageData(size, size), px = img.data;
  const oc = ORES.map((o) => o && [parseInt(o.col.slice(1, 3), 16), parseInt(o.col.slice(3, 5), 16), parseInt(o.col.slice(5, 7), 16)]);
  const bx = Math.round(cam.x / step) * step, by = Math.round(cam.y / step) * step;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = s._world.sample(bx - half + i * step, by - half + j * step), c = v >> 3 ? oc[v >> 3] : TER[v & 7];
    for (const o of [0, 1, size, size + 1]) { const p = ((j * 2) * size + i * 2 + o) * 4; px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  const mx = (x) => ((x - bx + half) / step) * 2, k = 2 / step;
  const my = (y) => ((y - by + half) / step) * 2;
  g.fillStyle = '#d8d2c4'; // silnice
  for (const kk of s._road.keys()) g.fillRect(mx(Math.floor(kk / 65536) - 32768), my((kk % 65536) - 32768), 1, 1);
  for (const b of s.list) { // budovy jantarově, odběratelé surovin jako tyrkysové čtverce
    const x = mx(b.x), y = my(b.y), npc = b.k === 'npc';
    if (x < 0 || y < 0 || x > size || y > size) continue;
    g.fillStyle = npc ? '#35e0d0' : '#ffb52e';
    if (npc) { g.fillRect(x - 2, y - 2, 6, 6); g.strokeStyle = '#07080a'; g.lineWidth = 1; g.strokeRect(x - 2, y - 2, 6, 6); } else g.fillRect(x, y, Math.max(1.5, (b.w ?? 1) * k), Math.max(1.5, (b.h ?? 1) * k));
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 1;
  g.strokeRect(mx(cam.x - W / 2 / cam.z), ((cam.y - H / 2 / cam.z - by + half) / step) * 2, (W / cam.z) * k, (H / cam.z) * k);
  G.mini = { bx, by, half, step };
}
