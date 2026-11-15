// 2D kreslení: textura terénu pro 3D pohled (po blocích 32 × 32 m) a minimapa.
import { CHUNK, ORES } from './world.js';
import { left, key, SURF_T } from './sim.js';
import { G } from './g.js';

const TP = 16; // pixelů na metr v textuře terénu
const TER = [[22, 86, 148], [232, 206, 148], [88, 158, 72], [162, 160, 86], [128, 134, 142]]; // voda, písek, tráva, suchá tráva, skála
const SHORE = [58, 152, 186]; // mělčina u břehu
const DETAIL = [null, [202, 174, 118], [62, 124, 52], [132, 132, 66], [108, 114, 122]];
const LIGHT = [null, [246, 226, 176], [116, 184, 92], [188, 184, 112], [148, 154, 164]];
const rgb = (col, k = 1) => `rgb(${Math.min(255, col[0] * k) | 0},${Math.min(255, col[1] * k) | 0},${Math.min(255, col[2] * k) | 0})`;

function drawWater(g, world, x, y, X, Y, k, near) {
  const shore = near.some((n) => n !== 0);
  const deep = !shore && [world.terrain(x + 2, y), world.terrain(x - 2, y), world.terrain(x, y + 2), world.terrain(x, y - 2)].every((n) => n === 0);
  g.fillStyle = rgb(shore ? SHORE : TER[0], deep ? k * 0.88 : k);
  g.fillRect(X, Y, TP, TP);
  // jemné vlnky a světlé odlesky na hladině
  if (world.rnd(x, y, 11) > 0.35) {
    const wy = Y + 2 + ((world.rnd(x, y, 12) * 11) | 0);
    const wx = X + 1 + ((world.rnd(x, y, 13) * 8) | 0);
    g.fillStyle = shore ? 'rgba(180,230,245,0.28)' : 'rgba(130,195,235,0.2)';
    g.fillRect(wx, wy, 5 + ((world.rnd(x, y, 14) * 5) | 0), 1);
  }
  if (shore) { // pobřežní pěna na hraně se souší
    g.fillStyle = 'rgba(232,246,252,0.45)';
    if (near[0] !== 0) g.fillRect(X + TP - 2, Y + 1, 2, TP - 2);
    if (near[1] !== 0) g.fillRect(X + 1, Y + TP - 2, TP - 2, 2);
    if (near[2] !== 0) g.fillRect(X, Y + 1, 2, TP - 2);
    if (near[3] !== 0) g.fillRect(X + 1, Y, TP - 2, 2);
  }
}

function drawTransition(g, world, t, x, y, X, Y, k, near) {
  near.forEach((n, d) => { // měkký proužek a tečkované prolínání okrajů se sousedem
    if (n === t || (t === 0 && n !== 0)) return;
    g.fillStyle = rgb(n === 0 ? SHORE : TER[n], k);
    g.globalAlpha = 0.42;
    const ox = d === 0 ? TP - 3 : 0, oy = d === 1 ? TP - 3 : 0;
    g.fillRect(X + ox, Y + oy, d & 1 ? TP : 3, d & 1 ? 3 : TP);
    g.globalAlpha = 0.24;
    for (let s = 0; s < 4; s++) {
      const p = (world.rnd(x, y, 20 + d * 4 + s) * (TP - 3)) | 0;
      g.fillRect(X + (d & 1 ? p : d === 0 ? TP - 6 : 3), Y + (d & 1 ? (d === 1 ? TP - 6 : 3) : p), 2, 2);
    }
    g.globalAlpha = 1;
  });
  // rohový měkký přechod pro potlačení mřížky
  for (const [dx, dy, cx, cy] of [[1, 1, TP - 3, TP - 3], [-1, 1, 0, TP - 3], [1, -1, TP - 3, 0], [-1, -1, 0, 0]]) {
    const c = world.terrain(x + dx, y + dy);
    if (c !== t && !(t === 0 && c !== 0)) {
      g.fillStyle = rgb(c === 0 ? SHORE : TER[c], k);
      g.globalAlpha = 0.28;
      g.fillRect(X + cx, Y + cy, 3, 3);
      g.globalAlpha = 1;
    }
  }
}

function drawSurfaceDetail(g, world, t, x, y, X, Y, k) {
  if (!DETAIL[t]) return;
  const r1 = world.rnd(x, y, 40), r2 = world.rnd(x, y, 41);
  if (t === 1) { // písek: větrné vlnky a zrnka
    g.fillStyle = rgb(DETAIL[1], k);
    g.fillRect(X + ((r1 * 8) | 0), Y + 3 + ((r2 * 4) | 0), 7, 1);
    g.fillStyle = rgb(LIGHT[1], k);
    g.fillRect(X + 2 + ((r2 * 7) | 0), Y + 10 + ((r1 * 4) | 0), 6, 1);
    g.fillRect(X + ((r1 * 13) | 0), Y + ((r2 * 13) | 0), 1, 1);
  } else if (t === 2) { // tráva: trsy a občasné kvítky
    g.fillStyle = rgb(DETAIL[2], k);
    for (let n = 0; n < 3; n++) {
      const gx = X + 1 + ((world.rnd(x, y, 42 + n) * 13) | 0), gy = Y + 1 + ((world.rnd(x, y, 46 + n) * 13) | 0);
      g.fillRect(gx, gy, 1, 3); g.fillRect(gx + 1, gy + 1, 1, 2);
    }
    g.fillStyle = rgb(LIGHT[2], k);
    g.fillRect(X + 2 + ((r1 * 11) | 0), Y + 2 + ((r2 * 11) | 0), 2, 2);
    if (r1 > 0.87) { g.fillStyle = r2 > 0.5 ? '#ece39a' : '#e8eef5'; g.fillRect(X + ((r2 * 12) | 0), Y + ((r1 * 12) | 0), 2, 2); }
  } else if (t === 3) { // suchá tráva: drny a stébla
    g.fillStyle = rgb(DETAIL[3], k);
    for (let n = 0; n < 3; n++) g.fillRect(X + ((world.rnd(x, y, 50 + n) * 12) | 0), Y + ((world.rnd(x, y, 54 + n) * 13) | 0), 3, 1);
    g.fillStyle = rgb(LIGHT[3], k);
    g.fillRect(X + ((r2 * 12) | 0), Y + ((r1 * 12) | 0), 2, 2);
  } else if (t === 4) { // skála: jemné kamenité plošky a zrna bez opakující se mřížky
    if (r1 > 0.35) {
      g.fillStyle = rgb(DETAIL[4], k);
      g.fillRect(X + ((r2 * 10) | 0), Y + ((r1 * 12) | 0), 3 + ((world.rnd(x, y, 61) * 4) | 0), 2);
      g.fillRect(X + ((world.rnd(x, y, 62) * 12) | 0), Y + ((world.rnd(x, y, 63) * 12) | 0), 2, 2);
    }
    if (r2 > 0.5) {
      g.fillStyle = rgb(LIGHT[4], k);
      g.fillRect(X + ((world.rnd(x, y, 64) * 11) | 0), Y + ((world.rnd(x, y, 65) * 11) | 0), 3, 2);
    }
  }
}

function drawDug(g, world, x, y, X, Y, dug) {
  const f = Math.min(1, dug / SURF_T);
  g.fillStyle = `rgba(68,52,38,${0.38 + 0.56 * f})`;
  g.fillRect(X, Y, TP, TP);
  // terasovité etáže a kamenitá suť
  g.fillStyle = 'rgba(34,25,18,0.42)';
  g.fillRect(X, Y + 4, TP, 1); g.fillRect(X, Y + 9, TP, 1); g.fillRect(X, Y + 14, TP, 1);
  g.fillStyle = 'rgba(116,96,76,0.38)';
  g.fillRect(X, Y + 3, TP, 1); g.fillRect(X, Y + 8, TP, 1);
  for (let n = 0; n < 3; n++) {
    g.fillStyle = n ? 'rgba(42,32,24,0.45)' : 'rgba(130,112,92,0.35)';
    g.fillRect(X + ((world.rnd(x, y, 70 + n) * 13) | 0), Y + ((world.rnd(x, y, 74 + n) * 13) | 0), 2, 2);
  }
}

function drawOre(g, world, o, x, y, X, Y, rest) {
  const f = 0.35 + 0.65 * Math.min(1, rest / SURF_T);
  const matte = o === 2 || o === 4; // uhlí a bauxit jsou matné vrstvy, ostatní mají žíly a odlesky
  g.fillStyle = ORES[o].col;
  g.globalAlpha = (matte ? 0.34 : 0.24) * f;
  g.fillRect(X + 1, Y + 1, TP - 2, TP - 2);
  // rudné žíly / zrna
  g.globalAlpha = (matte ? 0.68 : 0.55) * f;
  for (let n = 0; n < 4; n++) {
    const ox = X + 1 + ((world.rnd(x, y, 80 + n) * 11) | 0), oy = Y + 1 + ((world.rnd(x, y, 85 + n) * 11) | 0);
    g.fillRect(ox, oy, n & 1 ? 4 : 3, n & 1 ? 2 : 3);
  }
  if (!matte) {
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.45 * f;
    for (let n = 0; n < 2; n++) g.fillRect(X + 2 + ((world.rnd(x, y, 90 + n) * 11) | 0), Y + 2 + ((world.rnd(x, y, 93 + n) * 11) | 0), 2, 1);
  }
  g.globalAlpha = 1;
}

/** Nakreslí blok terénu do plátna (nového, nebo do stávajícího po vytěžení dlaždice). */
export function drawChunk(s, cx, cy, c = document.createElement('canvas')) {
  c.width = c.height = CHUNK * TP;
  const g = c.getContext('2d'), world = s._world, ch = world.chunk(cx, cy);
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const x = cx * CHUNK + i, y = cy * CHUNK + j, t = ch.terrain[j * CHUNK + i], o = ch.ore[j * CHUNK + i];
    const k = 0.88 + 0.24 * world.tone(x, y), X = i * TP, Y = j * TP;
    const near = [world.terrain(x + 1, y), world.terrain(x, y + 1), world.terrain(x - 1, y), world.terrain(x, y - 1)];
    if (t === 0) drawWater(g, world, x, y, X, Y, k, near);
    else { g.fillStyle = rgb(TER[t], k); g.fillRect(X, Y, TP, TP); }
    drawTransition(g, world, t, x, y, X, Y, k, near);
    if (t > 0) drawSurfaceDetail(g, world, t, x, y, X, Y, k);
    const dug = s.dug[key(x, y) * 8];
    if (dug) drawDug(g, world, x, y, X, Y, dug);
    const rest = o ? left(s, x, y) : 0;
    if (o && rest > 0) drawOre(g, world, o, x, y, X, Y, rest);
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
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  for (let p = size / 4; p < size; p += size / 4) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  const mx = (x) => ((x - bx + half) / step) * 2, k = 2 / step;
  const my = (y) => ((y - by + half) / step) * 2;
  g.fillStyle = '#ece4d0'; // silnice
  for (const kk of s._road.keys()) g.fillRect(mx(Math.floor(kk / 65536) - 32768), my((kk % 65536) - 32768), 1.5, 1.5);
  for (const b of s.list) { // budovy jantarově, Sklad zlatě, odběratelé surovin tyrkysově
    const x = mx(b.x), y = my(b.y), npc = b.k === 'npc';
    if (x < 0 || y < 0 || x > size || y > size) continue;
    if (npc) {
      g.fillStyle = '#2ce6d8'; g.fillRect(x - 3, y - 3, 7, 7);
      g.strokeStyle = '#071018'; g.lineWidth = 1.5; g.strokeRect(x - 3, y - 3, 7, 7);
    } else {
      const bw = Math.max(b.hq ? 4 : 2, (b.w ?? 1) * k), bh = Math.max(b.hq ? 4 : 2, (b.h ?? 1) * k);
      g.fillStyle = b.hq ? '#ffdf4d' : '#ff9a2e';
      g.fillRect(x, y, bw, bh);
      if (b.hq || (b.w ?? 1) >= 3) { g.strokeStyle = b.hq ? '#071018' : 'rgba(7,16,24,0.65)'; g.lineWidth = 1; g.strokeRect(x, y, bw, bh); }
    }
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.25;
  g.strokeRect(mx(cam.x - W / 2 / cam.z), ((cam.y - H / 2 / cam.z - by + half) / step) * 2, (W / cam.z) * k, (H / cam.z) * k);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
  g.strokeRect(1, 1, size - 2, size - 2);
  G.mini = { bx, by, half, step };
}
