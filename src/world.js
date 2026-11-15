// Otevřený svět: nekonečný terén a ložiska z deterministického šumu (stejný seed = stejný svět). 1 dlaždice = 1 m.
export const CHUNK = 32;
export const T = { WATER: 0, SAND: 1, GRASS: 2, DRY: 3, ROCK: 4 };
export const LEVELS = 6, LEVEL_M = 50; // pod povrchem je šest pater po 50 m
// Ložiska: skutečné nerosty. scale = velikost skvrn (m), thr = vzácnost, far = od kolika metrů od Centrály se objevují na povrchu,
// deep = ve kterých patrech pod zemí se nerost vyskytuje (uhlí a sůl mělko, cín a zlato hluboko).
// waste = kolik tun hlušiny se vykope na tunu nerostu (skrývkový poměr; odhad bez zdroje).
export const ORES = [
  null,
  { id: 'quartz', name: 'křemen', col: '#e9e4d8', scale: 46, thr: 0.79, far: 0, waste: 0.5 },
  { id: 'coal', name: 'černé uhlí', col: '#23262b', scale: 52, thr: 0.795, far: 0, deep: [1, 4], waste: 3 },
  { id: 'ore_cu', name: 'chalkopyrit (měď)', col: '#c9783b', scale: 40, thr: 0.805, far: 150, deep: [2, 6], waste: 2 },
  { id: 'bauxite', name: 'bauxit (hliník)', col: '#b5533a', scale: 44, thr: 0.81, far: 250, waste: 1 },
  { id: 'halite', name: 'kamenná sůl', col: '#f3c9d2', scale: 38, thr: 0.815, far: 200, deep: [1, 3], waste: 0.2 },
  { id: 'fluorspar', name: 'kazivec (fluorit)', col: '#9a6fd6', scale: 34, thr: 0.82, far: 400, deep: [2, 5], waste: 2 },
  { id: 'ore_sn', name: 'kasiterit (cín)', col: '#8a8f98', scale: 32, thr: 0.825, far: 500, deep: [3, 6], waste: 3 },
  { id: 'ore_au', name: 'zlatonosná ruda', col: '#f0c040', scale: 28, thr: 0.835, far: 700, deep: [4, 6], waste: 4 },
];
// Dvě ložiska poblíž startu, aby šla těžba hned: [index nerostu, x, y, poloměr]
export const STARTERS = [[1, 23, -16, 7], [2, -27, 19, 7]];

const hash = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, s) => noise(x, y, s) * 0.6 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.1;

export function makeWorld(seed) {
  const chunks = new Map();
  // jedna dlaždice: terén v dolních 3 bitech, nerost nad nimi (bez mezipaměti – pro minimapu)
  function sample(x, y) {
    const dist = Math.hypot(x, y);
    let e = fbm(x / 170, y / 170, seed);
    const k = dist < 60 ? 1 : dist < 100 ? (100 - dist) / 40 : 0; // kolem Centrály vždy souš (i pod startovními ložisky)
    if (k && e < 0.42) e += (0.42 - e) * k;
    const m = fbm(x / 130, y / 130, seed + 100);
    const t = e < 0.36 ? T.WATER : e < 0.39 ? T.SAND : e > 0.66 ? T.ROCK : m < 0.36 ? T.SAND : m < 0.52 ? T.DRY : T.GRASS;
    if (t === T.WATER || dist < 14) return t;
    for (const [o, sx, sy, r] of STARTERS) if (Math.hypot(x - sx, y - sy) < r - 2 + 3 * hash(x, y, seed + 5)) return t | (o << 3);
    for (let o = 1; o < ORES.length; o++) {
      const d = ORES[o];
      if (dist >= d.far && fbm(x / d.scale, y / d.scale, seed + 1000 + o * 37) > d.thr) return t | (o << 3);
    }
    return t;
  }
  function gen(cx, cy) {
    const terrain = new Uint8Array(CHUNK * CHUNK), ore = new Uint8Array(CHUNK * CHUNK);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const v = sample(cx * CHUNK + i, cy * CHUNK + j);
      terrain[j * CHUNK + i] = v & 7; ore[j * CHUNK + i] = v >> 3;
    }
    return { terrain, ore };
  }
  function chunk(cx, cy) {
    const k = cx * 65536 + cy;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = gen(cx, cy)));
    return c;
  }
  const at = (x, y, f) => chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK))[f][(((y % CHUNK) + CHUNK) % CHUNK) * CHUNK + (((x % CHUNK) + CHUNK) % CHUNK)];
  // nerost v patře l pod dlaždicí: větší tělesa než na povrchu, v každém patře jinde
  const deep = (x, y, l) => {
    for (let o = 1; o < ORES.length; o++) {
      const d = ORES[o];
      if (d.deep && l >= d.deep[0] && l <= d.deep[1] && fbm(x / (d.scale * 1.5), y / (d.scale * 1.5), seed + 5000 + o * 53 + l * 101) > d.thr - 0.035) return o;
    }
    return 0;
  };
  // výška terénu v metrech (v rohu dlaždice): kolem Skladu je do 90 m rovina, dál se zvedají kopce; voda a břehy jsou v nule, skály nejvýš
  const height = (x, y) => {
    const d = Math.hypot(x, y), k = d < 90 ? 0 : Math.min(1, (d - 90) / 120);
    if (!k) return 0;
    const e = fbm(x / 170, y / 170, seed);
    if (e < 0.39) return 0;
    return k * ((e - 0.39) * 70 + fbm(x / 90, y / 90, seed + 300) * 10 * Math.min(1, (e - 0.39) * 8));
  };
  // odstín dlaždice pro kreslení: plynulé skvrny + trocha zrna
  const tone = (x, y) => noise(x / 7, y / 7, seed + 3) * 0.75 + hash(x, y, seed + 4) * 0.25;
  return { seed, chunk, sample, deep, tone, height, rnd: (x, y, k) => hash(x, y, seed + k), terrain: (x, y) => at(x, y, 'terrain'), ore: (x, y) => at(x, y, 'ore') };
}
