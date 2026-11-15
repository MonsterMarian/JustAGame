// 3D pohled na svět (three.js): terén s jámami po těžbě, haly s okny a střechou, která se při přiblížení otevře,
// stroje podle modelů ze Silicon Logic Studia (data/hw/machineModels.js), dopravníky s položkami, pohled pod zem.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMachine, MACHINE_MODELS } from '../data/hw/machineModels.js';
import { CHUNK, ORES, LEVEL_M, STARTERS, WORLD_DEPOSITS } from './world.js';
import { drawChunk } from './render.js';
import { MODELS, ITEMS, CARS, KINDS } from '../data/catalog.js';
import { ROUTES } from '../data/routes.js';
import { DX, DY, key, at, isHall, sizeOf, canPlace, centerOf, oreAt, left, survey, capOf, baseOf, PILE, SURF_T, DEEP_T, GRID_MWH, MODS, hasMod, modCost, pileOf, reachOf, upgradeCost, evolutions, upgradeModelErr } from './sim.js';
import { G } from './g.js';

const WALL = 6, INSIDE = 80; // výška haly v metrech; blíž než INSIDE metrů se střechy otevřou
const PIT_M = 10; // hloubka jámy po vytěžení povrchové vrstvy
const UG = 0.25; // pod zemí je svislé měřítko čtvrtinové, aby se šest pater po 50 m vešlo do pohledu
const SUB = { m_fct: 'm_ate', m_pcb_etch: 'm_wet_bench' }; // stroje bez vlastního modelu si půjčí tvarově nejbližší
const LED = { run: 0x3fe08a, idle: 0x59616d, cap: 0x59616d, done: 0x59616d, miss: 0xffb52e, sink: 0xffb52e, money: 0xff4d5e, tape: 0xff4d5e, full: 0xff4d5e, empty: 0xff4d5e, staff: 0xff4d5e, broken: 0xff4d5e };
let infoAt = 0, padPrev = new Set(), sky = null, smokeAt = 0, plumeEmitAt = 0;
const plumes = [];
const SKY_LOW = 0xe4f1fb, UNDER_BG = new THREE.Color(0x241d17), DECO = {};
const Q4 = new THREE.Quaternion(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), V3 = new THREE.Vector3();
const HH = (x, y) => G.s._world.height(x, y); // výška terénu v metrech
let renderer, scene, camera, sun, cur = null, rev = -1, grev = -1, W = 0, H = 0, belts = [], pitAt = 0, ugAt = 0, ty = 0, wasUnder = false;
const terrain = new THREE.Group(), things = new THREE.Group(), fx = new THREE.Group(), under = new THREE.Group(), cars = new THREE.Group(), signs = new THREE.Group(), depositPins = new THREE.Group();
const chunks = new Map(), objs = new Map(), protos = new Map(), cols = new Map(), pits = new Set(), carObjs = new Map(), carGeo = new Map();
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), M4 = new THREE.Matrix4();

function makeNoiseTex() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), img = g.createImageData(64, 64), d = img.data;
  let seed = 1337;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 112 + ((seed >>> 24) & 31);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return t;
}
const NOISE_TEX = makeNoiseTex();
const lam = (o) => new THREE.MeshLambertMaterial(o), basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.12, bumpMap: NOISE_TEX, bumpScale: 0.015 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.36, roughness: 0.15, metalness: 0.25, depthWrite: false }),
  led: Object.fromEntries(Object.entries(LED).map(([k, c]) => [k, basic(c)])),
  scafLine: new THREE.LineBasicMaterial({ color: 0xf4b62c, transparent: true, opacity: 0.72 }),
  crane: basic(0xf4b62c),
};
const GEO = { chunk: new THREE.PlaneGeometry(CHUNK, CHUNK).rotateX(-Math.PI / 2), led: new THREE.SphereGeometry(0.14, 10, 8), box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  arrow: new THREE.ConeGeometry(0.22, 0.5, 3).rotateZ(-Math.PI / 2), belt: new THREE.BoxGeometry(1, 0.1, 1).translate(0, 0.05, 0), item: new THREE.BoxGeometry(0.55, 0.38, 0.55),
  smoke: new THREE.DodecahedronGeometry(0.45, 1) };
GEO.edgeBox = new THREE.EdgesGeometry(GEO.box);
let base, floorMesh, roofMesh, beltMesh, arrowMesh, itemMesh, oreMesh, planMesh, smokeMesh, ghost, ghostArrow, selBox, hotBox, rectBox, mark, reach;
const wallMesh = [];

// ---------------------------------------------------------------- tvary strojů a budov
// Jedna paleta pro všechno, co stojí na mapě: světlé stěny, břidlicové střechy, oranžová jako barva hráče.
const C = { wall: 0xe8e3d6, wall2: 0xc9c2b1, roof: 0x3a434f, trim: 0x262c34, steel: 0x9aa4ae, dark: 0x1b1f24, wood: 0x9c744a, wood2: 0x6c4c30, brick: 0xa8553b, win: 0x7cc4e0, glass: 0x22384a, accent: 0xff9a2e,
  pad: 0xa9aba8, lot: 0x8b8e92, dirt: 0x8a7458, yellow: 0xf4b62c, red: 0xc8402f, tyre: 0x16181b, fire: 0xff8a1e, skin: 0xe0b48c, coal: 0x24272c, stone: 0x8f949a, lamp: 0xfff3c4, tank: 0xeef0f1 };
const part = (root, geo, color, x, y, z, glass) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: !!glass })); m.position.set(x, y, z); root.add(m); return m; };
const bx = (root, w, h, d, color, x = 0, y0 = 0, z = 0, glass) => part(root, new THREE.BoxGeometry(w, h, d), color, x, y0 + h / 2, z, glass);
const cyl = (root, r, h, color, x = 0, y0 = 0, z = 0, top = r, seg = 16) => { // válec nebo komolý kužel; s málo stěnami má ostré hrany
  let g = new THREE.CylinderGeometry(top, r, h, seg);
  if (seg < 9) { g = g.toNonIndexed(); g.computeVertexNormals(); }
  return part(root, g, color, x, y0 + h / 2, z);
};
const prism = (root, pts, len, color, x = 0, y0 = 0, z = 0, alongX) => { // hranol: průřez pts (napříč, výška) tažený podél osy z, nebo x
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2);
  return part(root, alongX ? g.rotateY(Math.PI / 2) : g, color, x, y0, z);
};
const gable = (root, w, h, d, color, x, y0, z, lean = 0.5) => prism(root, [[-d / 2, 0], [d / 2, 0], [d * (0.5 - lean), h]], w, color, x, y0, z, true); // střecha s hřebenem podél x; lean 0 = pultová, vyšší vzadu
const rock = (root, k, color, x, z, sy = 0.7) => { const m = part(root, new THREE.DodecahedronGeometry(k, 0), color, x, k * sy * 0.8, z); m.scale.y = sy; m.rotation.y = x * 5 + z * 3; return m; };
const sub = (root, x, z, turn = 0, k = 1) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = turn; g.scale.setScalar(k); root.add(g); return g; }; // část modelu posunutá, otočená a zmenšená
const wheel = (root, R, t, x, z) => { for (const [rr, tt, c] of [[R, t, C.tyre], [R * 0.5, t + 0.04, C.steel]]) cyl(root, rr, tt, c, x, R - tt / 2, z).rotation.x = Math.PI / 2; };
const gate = (r, w, h, x, y0, z, col = C.accent) => { bx(r, w + 0.24, h + 0.12, 0.06, col, x, y0, z); bx(r, w, h, 0.1, C.trim, x, y0, z); for (let y = 0.22; y < h - 0.1; y += 0.3) bx(r, w - 0.08, 0.05, 0.13, 0x4a535f, x, y0 + y, z); }; // rolovací vrata v barevném rámu na čelní stěně
const win = (r, w, h, x, y0, z, side) => { bx(r, side ? 0.06 : w + 0.14, h + 0.14, side ? w + 0.14 : 0.06, 0xf6f2e8, x, y0 - 0.07, z); bx(r, side ? 0.1 : w, h, side ? w : 0.1, C.win, x, y0, z); }; // okno v rámu (side = na boční stěně)
const pallet = (r, x, z, n = 0) => { bx(r, 0.85, 0.1, 0.85, C.wood2, x, 0.06, z); bx(r, 0.72, 0.42 + (n % 3) * 0.16, 0.72, [C.wood, 0xc9a66b, 0xe7e1cf][n % 3], x, 0.16, z); if (n % 3 === 1) bx(r, 0.46, 0.3, 0.46, 0xe7e1cf, x - 0.08, 0.74, z + 0.06); };
const heap = (r, R, hgt, color, x, z) => cyl(r, R, hgt, color, x, 0.05, z, R * 0.12, 7); // sypaná hromada
const addVent = (r, x, y, z, kind = 'smoke') => { (r.userData.vents ??= []).push({ x, y, z, kind }); };
const stack = (r, x, z, H, R = 0.5) => { cyl(r, R, H, 0xd9d4c8, x, 0, z, R * 0.7); for (const k of [0.74, 0.9]) cyl(r, R * (1 - 0.3 * k) + 0.02, H * 0.07, C.red, x, H * k, z, R * (1 - 0.3 * (k + 0.07)) + 0.02); addVent(r, x, H + 0.1, z, 'smoke'); }; // komín s červenými pruhy
function worker(r, x, z, turn = 0) { // dělník v reflexní vestě a přilbě, 1,75 m; dívá se k +x
  const g = sub(r, x, z, turn, 1.75);
  for (const dz of [-0.07, 0.07]) bx(g, 0.1, 0.44, 0.1, 0x2a3644, 0, 0, dz);
  bx(g, 0.15, 0.34, 0.28, C.accent, 0, 0.44); bx(g, 0.16, 0.05, 0.29, 0xf6f2e8, 0, 0.56);
  for (const dz of [-0.18, 0.18]) bx(g, 0.08, 0.3, 0.08, 0x3d6ea5, 0, 0.46, dz);
  bx(g, 0.14, 0.15, 0.15, C.skin, 0, 0.79); bx(g, 0.19, 0.07, 0.19, C.yellow, 0, 0.92); bx(g, 0.1, 0.025, 0.14, C.yellow, 0.12, 0.92);
}
function digger(r, x = 0, z = 0, k = 1, turn = 0) { // pásové rypadlo; výložník míří k +x
  const g = sub(r, x, z, turn, k);
  for (const dz of [-0.5, 0.5]) { bx(g, 1.7, 0.3, 0.32, C.dark, 0, 0, dz); bx(g, 1.5, 0.12, 0.34, 0x343a42, 0, 0.09, dz); } // pásy
  cyl(g, 0.4, 0.1, C.trim, 0, 0.3); // točna
  bx(g, 1.35, 0.5, 1.0, C.yellow, -0.12, 0.4); bx(g, 0.4, 0.42, 1.02, 0x2b3038, -0.72, 0.42); // nástavba a protizávaží
  bx(g, 0.55, 0.62, 0.48, C.yellow, 0.2, 0.9, -0.24); bx(g, 0.57, 0.36, 0.5, C.glass, 0.2, 1.08, -0.24); bx(g, 0.6, 0.05, 0.52, C.trim, 0.2, 1.52, -0.24); // kabina se skly
  bx(g, 0.5, 0.25, 0.4, 0xd99c1f, -0.3, 0.9, 0.2); cyl(g, 0.04, 0.4, C.dark, -0.5, 1.15, 0.3); // kapota motoru a výfuk
  const arm = sub(g, 0.35, 0.22); arm.position.y = 0.72;
  arm.userData.anim = { kind: 'arm', axis: [0, 0, 1] };
  bx(arm, 1.4, 0.2, 0.2, C.yellow, 0.55, 0.48, 0).rotation.z = 0.7;
  bx(arm, 1.3, 0.15, 0.16, C.yellow, 1.38, 0.38, 0).rotation.z = -1.1;
  bx(arm, 0.34, 0.3, 0.36, C.dark, 1.68, -0.45, 0).rotation.z = 0.4; // lžíce
}
// Stroje, které v rešerši model nemají (těžba, hutě, montáž): jednoduché tvary v měřítku půdorysu.
const OWN = {
  m_glass(r) { // sklářská dílna: cihlová pec s komínem, přístřešek s pracovním stolem a chladicí pecí, uhlí a bedny se sklem
    bx(r, 3, 0.05, 3, C.pad);
    bx(r, 1.3, 1.1, 1.2, C.brick, -0.75, 0, -0.7); bx(r, 1.4, 0.1, 1.3, 0x8c4631, -0.75, 1.1, -0.7); bx(r, 1.0, 0.35, 0.9, C.brick, -0.75, 1.2, -0.7); // pec s římsou a klenbou
    bx(r, 0.56, 0.46, 0.06, C.dark, -0.75, 0.3, -0.1); bx(r, 0.4, 0.32, 0.08, C.fire, -0.75, 0.35, -0.1); // žhavý otvor
    bx(r, 0.38, 3.0, 0.38, 0x96493a, -1.15, 0, -1.1); bx(r, 0.48, 0.1, 0.48, C.trim, -1.15, 3.0, -1.1); // komín
    addVent(r, -1.15, 3.15, -1.1, 'smoke');
    for (const [x, z] of [[0.2, -1.3], [1.35, -1.3], [0.2, 0.05], [1.35, 0.05]]) bx(r, 0.09, 1.85, 0.09, C.wood2, x, 0, z);
    gable(r, 1.45, 0.45, 1.7, C.roof, 0.78, 1.85, -0.62, 0); // přístřešek s pultovou střechou
    bx(r, 0.95, 0.72, 0.45, C.wood, 0.78, 0, -1.05); bx(r, 1.05, 0.06, 0.55, C.wood2, 0.78, 0.72, -1.05); // pracovní stůl
    part(r, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), C.steel, 0.78, 0.84, -1.05).rotation.z = Math.PI / 2; part(r, new THREE.SphereGeometry(0.09, 8, 6), C.fire, 1.28, 0.84, -1.05); // píšťala se žhavou baňkou
    bx(r, 0.55, 0.75, 0.5, C.steel, 1.05, 0, -0.3); bx(r, 0.36, 0.3, 0.04, C.trim, 1.05, 0.25, -0.04); // chladicí pec
    for (const [x, z, k] of [[-1.05, 0.75, 0.3], [-0.6, 0.95, 0.22], [-1.1, 1.2, 0.18], [-0.7, 0.6, 0.2]]) rock(r, k, C.coal, x, z); // uhlí
    for (let i = 0; i < 3; i++) { bx(r, 0.44, 0.34, 0.44, C.wood, 0.3 + i * 0.5, 0.05, 1.0); bx(r, 0.36, 0.06, 0.36, C.win, 0.3 + i * 0.5, 0.39, 1.0); } // bedny se sklem
    worker(r, -0.75, 0.35, Math.PI / 2); worker(r, 0.5, -0.5, Math.PI / 2);
  },
  glass_tank(r) { // sklárna s vanovou pecí: tavicí hala s pilovou střechou a komínem, sila na písek, sodu a vápenec, palety a střepy
    bx(r, 6, 0.06, 10, C.lot);
    bx(r, 5.2, 4.2, 5.4, C.wall, 0, 0, -1.6); bx(r, 5.24, 0.6, 5.44, C.wall2, 0, 0, -1.6); bx(r, 5.26, 0.5, 5.46, C.accent, 0, 3.6, -1.6);
    for (let i = 0; i < 4; i++) { const x = -1.95 + i * 1.3; prism(r, [[-0.65, 0], [0.65, 0], [-0.65, 0.9]], 5.4, C.roof, x, 4.2, -1.6); bx(r, 0.06, 0.6, 5.0, C.win, x - 0.65, 4.3, -1.6); }
    stack(r, -1.9, -3.4, 13, 0.55); gate(r, 1.5, 2.4, 1.75, 0, 1.1);
    bx(r, 4.2, 0.8, 1.3, C.trim, -0.55, 0, 2.2);
    for (let i = 0; i < 3; i++) { cyl(r, 0.6, 4.4, C.steel, -1.9 + i * 1.35, 0.8, 2.2); cyl(r, 0.6, 0.6, C.roof, -1.9 + i * 1.35, 5.2, 2.2, 0.1); }
    for (let i = 0; i < 5; i++) pallet(r, -2.3 + i, 4.2, i);
    heap(r, 0.8, 0.8, 0xa9d8e4, 2.2, 2.9);
  },
  quarry_hand(r) { // ruční lom: udusaný plac, prkenná bouda na nářadí, hromada kamene, kolečko, krumpáč a dva dělníci
    bx(r, 2, 0.05, 2, C.dirt);
    bx(r, 0.9, 1.8, 0.75, C.wood, -0.5, 0, -0.55); for (const x of [-0.8, -0.5, -0.2]) bx(r, 0.04, 1.8, 0.77, C.wood2, x, 0, -0.55);
    gable(r, 1.06, 0.42, 0.95, C.roof, -0.5, 1.8, -0.55); bx(r, 0.36, 1.4, 0.04, C.dark, -0.5, 0, -0.165);
    for (const [x, z, k] of [[0.5, 0.5, 0.3], [0.2, 0.68, 0.2], [0.72, 0.2, 0.19], [0.38, 0.25, 0.24], [0.66, 0.74, 0.15]]) rock(r, k, C.stone, x, z);
    bx(r, 0.5, 0.2, 0.34, C.red, -0.45, 0.22, 0.55); for (const z of [0.42, 0.68]) { bx(r, 0.5, 0.04, 0.04, C.wood2, -0.05, 0.3, z); bx(r, 0.04, 0.22, 0.04, C.dark, -0.3, 0, z); } wheel(r, 0.13, 0.07, -0.75, 0.55); // kolečko
    bx(r, 0.04, 0.9, 0.04, C.wood2, 0.1, 0, -0.3).rotation.z = 0.25; bx(r, 0.36, 0.05, 0.05, C.steel, 0, 0.85, -0.3); // krumpáč opřený o boudu
    worker(r, 0.62, -0.5, 2.4); worker(r, -0.05, 0.1, 0.6);
  },
  m_miner(r) { digger(r); },
  miner_cat320(r) { // rypadlo krmí čelisťový drtič; z něj jede pás na hromadu drti
    digger(r, -0.95, -1.0, 1, -0.6);
    bx(r, 1.9, 0.22, 1.0, C.trim, 0.85, 0, 0.35); for (const dz of [-0.45, 0.45]) bx(r, 1.9, 0.3, 0.22, C.dark, 0.85, 0, 0.35 + dz); // podvozek drtiče
    bx(r, 1.1, 0.95, 0.85, C.wall, 0.75, 0.3, 0.35); bx(r, 1.12, 0.2, 0.87, C.accent, 0.75, 0.95, 0.35); bx(r, 0.5, 0.5, 0.6, C.roof, 1.55, 0.3, 0.35); // tělo drtiče a motor
    cyl(r, 0.42, 0.55, C.steel, 0.75, 1.25, 0.35, 0.85, 4).rotation.y = Math.PI / 4; // násypka
    bx(r, 0.5, 0.3, 0.5, C.trim, 0.75, 0.3, 1.0); bx(r, 2.0, 0.09, 0.42, C.dark, -0.25, 0.75, 1.35).rotation.z = -0.32; // přesyp a pás
    bx(r, 0.06, 0.95, 0.3, C.steel, -0.9, 0, 1.35); bx(r, 0.06, 0.7, 0.3, C.steel, -0.2, 0, 1.35);
    heap(r, 0.75, 0.85, C.stone, -1.35, 1.35);
  },
  m_drill(r, m) { // vrtná souprava: saně, motor s výfukem, příhradový stožár s vrtnou hlavou a tyčí
    const t = m.maxLv > 2 ? 5.5 : 3.4, d = m.h * 0.7;
    bx(r, 1.9, 0.16, d, C.trim); bx(r, 0.8, 0.6, d * 0.8, 0x3d6ea5, -0.45, 0.16); bx(r, 0.5, 0.25, d * 0.5, C.dark, -0.45, 0.76); cyl(r, 0.04, 0.5, C.dark, -0.7, 0.76);
    for (const dz of [-0.14, 0.14]) bx(r, 0.07, t, 0.07, C.yellow, 0.5, 0.16, dz);
    for (let y = 0.6; y < t; y += 0.7) bx(r, 0.07, 0.05, 0.3, C.yellow, 0.5, y);
    const head = sub(r, 0.5, 0); head.position.y = t * 0.62;
    head.userData.anim = { kind: 'drillHead', axis: [0, 1, 0], span: t * 0.25 };
    bx(head, 0.3, 0.3, 0.36, C.red, 0, 0);
    const rod = sub(r, 0.5, 0); rod.position.y = 0.05;
    rod.userData.anim = { kind: 'drillRod', axis: [0, 1, 0] };
    cyl(rod, 0.035, t, C.steel, 0, 0, 0, 0.035, 6);
    bx(rod, 0.14, 0.08, 0.05, C.trim, 0, t * 0.45);
    bx(r, 0.4, 0.1, 0.4, C.trim, 0.5, t + 0.16);
  },
  m_shaft(r) { // důl: těžní věž s lanovnicemi a lany do strojovny, zásobník rudy, vozík na kolejích, halda
    bx(r, 5, 0.06, 5, C.dirt);
    bx(r, 1.9, 2.2, 1.8, C.wall, -1.45, 0, -0.9); bx(r, 1.94, 0.5, 1.84, C.wall2, -1.45, 0, -0.9); gable(r, 2.2, 0.8, 2.1, C.roof, -1.45, 2.2, -0.9); // strojovna
    gate(r, 0.9, 1.4, -1.45, 0, 0); win(r, 0.5, 0.5, -0.5, 1.1, -0.9, true);
    const tx = 1.2, tz = -0.9;
    bx(r, 1.5, 0.3, 1.5, C.trim, tx, 0, tz); bx(r, 1.0, 0.32, 1.0, C.dark, tx, 0.02, tz); // ohlubeň jámy
    for (const dx of [-0.6, 0.6]) for (const dz of [-0.6, 0.6]) bx(r, 0.14, 5.2, 0.14, C.steel, tx + dx, 0, tz + dz);
    for (const y of [1.6, 3.2, 4.8]) { for (const dz of [-0.6, 0.6]) bx(r, 1.34, 0.1, 0.1, C.steel, tx, y, tz + dz); for (const dx of [-0.6, 0.6]) bx(r, 0.1, 0.1, 1.34, C.steel, tx + dx, y, tz); }
    bx(r, 1.6, 0.14, 1.6, C.roof, tx, 5.2, tz);
    for (const [idx, dz] of [-0.25, 0.25].entries()) {
      const sh = sub(r, tx, tz + dz); sh.position.y = 5.89;
      sh.userData.anim = { kind: idx ? 'sheave1' : 'sheave0', axis: [0, 0, 1] };
      cyl(sh, 0.55, 0.1, C.red, 0, -0.05, 0).rotation.x = Math.PI / 2;
      bx(sh, 0.96, 0.07, 0.12, C.trim, 0, -0.035, 0); bx(sh, 0.07, 0.96, 0.12, C.trim, 0, -0.48, 0);
      bx(r, 0.03, 4.02, 0.03, C.dark, -0.15, 2.24, tz + dz).rotation.z = -0.609; bx(r, 0.14, 5.09, 0.14, C.steel, 0.125, -0.045, tz + dz * 2.4).rotation.z = -0.188;
    } // lanovnice, lana a vzpěry
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.4, 0.4]) bx(r, 0.1, 1.2, 0.1, C.trim, 1.4 + dx, 0, 1.5 + dz);
    bx(r, 1.3, 0.9, 1.1, C.wall2, 1.4, 1.2, 1.5); bx(r, 1.34, 0.18, 1.14, C.accent, 1.4, 1.75, 1.5); // zásobník rudy
    for (const z of [1.4, 1.8]) bx(r, 2.6, 0.05, 0.05, C.steel, -0.9, 0.06, z); bx(r, 0.7, 0.4, 0.5, C.red, -0.5, 0.2, 1.6); bx(r, 0.6, 0.1, 0.4, C.coal, -0.5, 0.56, 1.6); // koleje a vozík
    heap(r, 0.8, 0.7, C.stone, -1.7, 1.6); worker(r, 0.3, 0.6, 1.2);
  },
  m_arc_furnace(r) { // huť s obloukovou pecí: vysoká hala s nástavbou a elektrodami, komín, trafa, hromady křemene a uhlí, ingoty
    bx(r, 12, 0.06, 12, C.lot);
    bx(r, 9, 6, 6.5, C.wall, -0.8, 0, -2.2); bx(r, 9.04, 0.8, 6.54, C.wall2, -0.8, 0, -2.2); bx(r, 9.06, 0.6, 6.56, C.accent, -0.8, 5.2, -2.2); bx(r, 9.3, 0.2, 6.8, C.roof, -0.8, 6, -2.2);
    bx(r, 4, 1.8, 4, C.wall2, -0.8, 6.2, -2.2); bx(r, 4.3, 0.2, 4.3, C.roof, -0.8, 8, -2.2);
    for (let i = 0; i < 3; i++) cyl(r, 0.22, 2.2, C.dark, -0.8 + Math.cos(i * 2.094) * 0.8, 8.2, -2.2 + Math.sin(i * 2.094) * 0.8);
    stack(r, 2.8, -4.2, 14, 0.7); gate(r, 3, 3.6, -2.6, 0, 1.05); bx(r, 2.0, 1.7, 0.1, C.dark, 1.6, 0.6, 1.05); bx(r, 1.7, 1.4, 0.14, C.fire, 1.6, 0.75, 1.05); // vrata a žhavý odpich
    for (let i = 0; i < 2; i++) { bx(r, 1.2, 1.6, 1.0, C.steel, 4.8, 0.06, -3.6 + i * 1.8); bx(r, 0.08, 2.6, 0.08, C.trim, 4.8, 0.06, -2.7 + i * 1.8); }
    heap(r, 1.5, 1.4, 0xd9d6cc, -3.9, 3.6); heap(r, 1.3, 1.2, C.coal, -1.1, 3.9);
    for (let n = 0; n < 3; n++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) bx(r, 0.95, 0.2, 0.32, 0xb9c0c8, 1.8 + n * 1.3, 0.06 + i * 0.21, 3.6 + (j - (2 - i) / 2) * 0.36);
  },
  m_siemens(r) { // polykřemík: hala reaktorů, destilační kolony s plošinami, zásobníky s vrchlíkem a potrubní most
    bx(r, 14, 0.06, 10, C.lot);
    bx(r, 8, 4.5, 5, C.wall, -2.4, 0, -1.8); bx(r, 8.04, 0.7, 5.04, C.wall2, -2.4, 0, -1.8); bx(r, 8.06, 0.5, 5.06, C.accent, -2.4, 3.8, -1.8); bx(r, 8.3, 0.2, 5.3, C.roof, -2.4, 4.5, -1.8);
    for (let i = 0; i < 4; i++) { bx(r, 0.8, 0.5, 0.8, C.steel, -5.2 + i * 1.9, 4.7, -1.8); win(r, 0.9, 0.8, -5.4 + i * 1.3, 1.9, 0.7); }
    gate(r, 2.2, 3, 0.2, 0, 0.7);
    for (let i = 0; i < 3; i++) { const x = 3.2 + i * 1.3, H = 11 - i * 2; cyl(r, 0.45, H, C.tank, x, 0.06, -2.6); for (let y = 3; y < H; y += 3) cyl(r, 0.75, 0.08, C.trim, x, y, -2.6); cyl(r, 0.45, 0.4, C.steel, x, H + 0.06, -2.6, 0.15); }
    for (let i = 0; i < 4; i++) { cyl(r, 0.7, 2.4, C.tank, -5 + i * 1.7, 0.06, 3.2); part(r, new THREE.SphereGeometry(0.7, 12, 8), C.tank, -5 + i * 1.7, 2.46, 3.2); }
    part(r, new THREE.CylinderGeometry(0.09, 0.09, 9, 8), C.accent, 0.5, 2.0, 1.6).rotation.z = Math.PI / 2; for (const x of [-3.5, 0.5, 4.5]) bx(r, 0.1, 2.0, 0.1, C.trim, x, 0.06, 1.6);
  },
  m_assembly(r, m) { // montážní stůl: deska s modrou ESD podložkou, police se světlem, krabičky se součástkami, pájecí stanice
    const w = m.w * 0.95, d = m.h * 0.85;
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) bx(r, 0.07, 0.75, 0.07, C.steel, x, 0, z);
    bx(r, w, 0.06, d, C.wood, 0, 0.75); bx(r, w * 0.6, 0.02, d * 0.6, 0x3d6ea5, -w * 0.1, 0.81, d * 0.1);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) bx(r, 0.05, 0.6, 0.05, C.steel, x, 0.81, -d / 2 + 0.06);
    bx(r, w, 0.04, 0.25, C.wall2, 0, 1.38, -d / 2 + 0.14); bx(r, w * 0.8, 0.04, 0.1, C.lamp, 0, 1.33, -d / 2 + 0.2);
    for (let i = 0; i < 4; i++) bx(r, 0.16, 0.12, 0.2, [C.red, C.yellow, 0x3d6ea5, C.accent][i], -w * 0.3 + i * 0.2, 1.42, -d / 2 + 0.14);
    bx(r, 0.2, 0.16, 0.16, C.dark, w * 0.33, 0.81, 0);
  },
};
OWN.m_glass_studio = OWN.m_glass;
OWN.m_power = (r) => { // uhelná elektrárna na půdorysu 6 × 6 (větší se zvětší): kotelna se strojovnou, komín, chladicí věž, hromada uhlí s pásem, trafo a vedení
  bx(r, 6, 0.06, 6, C.lot);
  bx(r, 3.2, 3.4, 2.4, C.wall, -1.2, 0, -1.5); bx(r, 3.24, 0.5, 2.44, C.wall2, -1.2, 0, -1.5); bx(r, 3.26, 0.35, 2.46, C.accent, -1.2, 2.9, -1.5); bx(r, 3.4, 0.14, 2.6, C.roof, -1.2, 3.4, -1.5); // strojovna s turbínou
  bx(r, 1.6, 4.6, 1.8, C.wall2, -2.0, 0, -1.6); bx(r, 1.7, 0.14, 1.9, C.roof, -2.0, 4.6, -1.6); // vyšší kotelna
  for (let i = 0; i < 3; i++) win(r, 0.5, 0.6, -2.3 + i * 0.75, 1.6, -0.29);
  gate(r, 1.0, 1.5, -0.4, 0, -0.29);
  stack(r, -2.4, -2.5, 7.5, 0.35); // komín
  cyl(r, 1.25, 3.4, 0xd9d4c8, 1.6, 0.06, -1.4, 0.8, 18); cyl(r, 0.8, 0.7, 0xd9d4c8, 1.6, 3.46, -1.4, 0.95, 18); cyl(r, 0.97, 0.03, C.trim, 1.6, 4.16, -1.4, 0.97, 18); addVent(r, 1.6, 4.2, -1.4, 'steam'); // chladicí věž
  heap(r, 1.0, 0.9, C.coal, -1.6, 1.6); bx(r, 2.2, 0.08, 0.3, C.dark, -1.1, 1.1, 0.35).rotation.z = 0.55; bx(r, 0.06, 1.1, 0.25, C.steel, -0.3, 0, 0.35); // uhlí a pás do kotelny
  for (let i = 0; i < 2; i++) { bx(r, 0.6, 0.8, 0.5, C.steel, 1.2 + i * 0.9, 0.06, 1.3); bx(r, 0.06, 2.0, 0.06, C.trim, 1.2 + i * 0.9, 0.06, 2.2); } bx(r, 1.2, 0.05, 0.05, C.trim, 1.65, 1.95, 2.2); // trafa a vedení
  worker(r, 0.2, 1.8, 2.2);
};
// Auto: rám, kabina se skly, korba a kola. Kabina míří k +x; vrací polohu korby [střed x, délka, výška dna], kam se kreslí náklad.
const CAR_LOOK = { car_pickup: [3.1, 1.25, 0xd9573c], car_truck: [4.2, 1.55, 0x3f7fc4], car_dump: [5.8, 2.0, 0xf4b62c] }; // délka, šířka, barva; menší než ve skutečnosti, aby se vešla na metrovou dlaždici
function carShape(r, id) {
  const [L, Wd, col] = CAR_LOOK[id], R = Wd * 0.26;
  const cab = (x, len, hgt, wd = 0.94) => { bx(r, len, hgt, Wd * wd, col, x, R); bx(r, len + 0.02, hgt * 0.36, Wd * wd + 0.02, C.glass, x, R + hgt * 0.5); bx(r, len + 0.04, 0.05, Wd * wd + 0.04, col, x, R + hgt); };
  const lights = (x) => { bx(r, 0.1, Wd * 0.13, Wd * 0.98, C.trim, x, R * 0.75); for (const z of [-Wd * 0.33, Wd * 0.33]) bx(r, 0.05, Wd * 0.1, Wd * 0.17, C.lamp, x + 0.04, R + Wd * 0.12, z); };
  const bed = (x, len, y, hgt, c = col) => { bx(r, len, 0.08, Wd * 0.96, C.trim, x, y); for (const z of [-Wd / 2 + 0.05, Wd / 2 - 0.05]) bx(r, len, hgt, 0.07, c, x, y + 0.08, z); for (const dx of [-len / 2 + 0.035, len / 2 - 0.035]) bx(r, 0.07, hgt, Wd * 0.96, c, x + dx, y + 0.08); return [x, len, y + 0.08]; };
  const axles = (...xs) => { for (const x of xs) for (const z of [-Wd / 2 + 0.06, Wd / 2 - 0.06]) wheel(r, R, 0.22, x, z); };
  bx(r, L * 0.94, R * 0.5, Wd * 0.6, C.trim, 0, R * 0.7); // rám
  if (id === 'car_pickup') { bx(r, L * 0.2, Wd * 0.34, Wd * 0.92, col, L * 0.37, R); cab(L * 0.14, L * 0.26, Wd * 0.74); lights(L * 0.47); axles(L * 0.32, -L * 0.3); return bed(-L * 0.23, L * 0.46, R + Wd * 0.04, Wd * 0.3); } // kapota, kabina, krátká korba
  if (id === 'car_truck') { cab(L * 0.36, L * 0.22, Wd * 0.95); bx(r, L * 0.1, 0.1, Wd * 0.8, C.steel, L * 0.36, R + Wd * 0.95 + 0.05); lights(L * 0.47); axles(L * 0.34, -L * 0.2, -L * 0.36); return bed(-L * 0.13, L * 0.7, R + Wd * 0.1, Wd * 0.26, C.steel); } // trambus s valníkem
  bx(r, L * 0.15, Wd * 0.42, Wd * 0.78, col, L * 0.405, R * 1.1); cab(L * 0.26, L * 0.15, Wd * 0.95, 0.62); lights(L * 0.48); cyl(r, 0.05, 0.7, C.dark, L * 0.36, R * 1.1 + Wd * 0.42, Wd * 0.3); // kloubový dampr: kapota, úzká kabina, výfuk
  axles(L * 0.4, -L * 0.14, -L * 0.36);
  const b = bed(-L * 0.16, L * 0.58, R * 1.7, Wd * 0.42); bx(r, L * 0.13, 0.07, Wd * 0.9, col, L * 0.19, b[2] + Wd * 0.42); // korba se štítem nad kabinou
  return b;
}
// Sklad: paletové regály s krabicemi. Depo: garáž s rampou a nákladním autem.
const HUB = {
  yard(r, w, h) { // Sklad, dokud kolem něj nestojí hala: budova se sedlovou střechou, rampa se dvojími vraty, palety, vysokozdvižný vozík a lampa
    const D = h * 0.46, z0 = -h / 2 + D / 2 + 0.3, f = z0 + D / 2, B = w * 0.88, sl = Math.hypot(D / 2 + 0.3, 0.95), a = Math.atan2(0.95, D / 2 + 0.3);
    bx(r, w, 0.06, h, C.pad); // betonový plac
    bx(r, B, 2.7, D, C.wall, 0, 0, z0); bx(r, B + 0.04, 0.5, D + 0.04, C.wall2, 0, 0, z0); bx(r, B + 0.06, 0.32, D + 0.06, C.accent, 0, 2.3, z0); // stěny, sokl a oranžový pás
    gable(r, B - 0.02, 0.79, D, C.wall, 0, 2.7, z0); for (const s of [-1, 1]) bx(r, B + 0.5, 0.1, sl, C.roof, 0, 3.045, z0 + s * (D / 4 + 0.15)).rotation.x = s * a; // štíty a střecha s přesahem
    bx(r, B * 0.5, 0.12, 0.4, C.trim, 0, 3.52, z0); // hřebenový větrák
    for (const x of [-w * 0.27, w * 0.02]) gate(r, 1.35, 1.7, x, 0.5, f);
    bx(r, w * 0.56, 0.5, 0.9, C.steel, -w * 0.125, 0, f + 0.45); bx(r, w * 0.56, 0.07, 0.07, C.yellow, -w * 0.125, 0.44, f + 0.9); // rampa se žlutou hranou
    bx(r, w * 0.6, 0.07, 1.0, C.trim, -w * 0.125, 2.24, f + 0.5); // stříška nad rampou
    bx(r, 0.62, 1.3, 0.08, C.trim, w * 0.33, 0, f); win(r, 0.5, 0.45, w * 0.33, 1.55, f); // dveře do kanceláře a okno nad nimi
    for (const dz of [-D * 0.25, D * 0.25]) win(r, 0.8, 0.6, B / 2, 1.35, z0 + dz, true);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) pallet(r, -w * 0.38 + i * 0.95, h / 2 - 1.5 + j * 0.95, i * 2 + j);
    const k = sub(r, w * 0.31, h / 2 - 1.1, -0.5); // vysokozdvižný vozík
    bx(k, 0.95, 0.42, 0.6, C.accent, 0, 0.13); bx(k, 0.3, 0.3, 0.5, C.trim, -0.2, 0.55); bx(k, 0.7, 0.04, 0.6, C.trim, -0.11, 1.4);
    for (const [x, z] of [[-0.42, -0.26], [-0.42, 0.26], [0.2, -0.26], [0.2, 0.26]]) bx(k, 0.04, 0.85, 0.04, C.trim, x, 0.55, z);
    for (const z of [-0.2, 0.2]) { bx(k, 0.06, 1.5, 0.06, C.dark, 0.52, 0.1, z); bx(k, 0.6, 0.04, 0.09, C.steel, 0.85, 0.12, z); }
    for (const x of [-0.3, 0.3]) for (const z of [-0.31, 0.31]) wheel(k, 0.15, 0.1, x, z);
    bx(r, 0.08, 3.4, 0.08, C.trim, w / 2 - 0.35, 0, h / 2 - 0.35); bx(r, 0.6, 0.06, 0.08, C.trim, w / 2 - 0.6, 3.4, h / 2 - 0.35); bx(r, 0.3, 0.07, 0.16, C.lamp, w / 2 - 0.8, 3.33, h / 2 - 0.35); // lampa
  },
  hq(r, w, h) {
    const L = w - 0.8, gap = (h - 0.4) / 3;
    for (let j = 0; j < 3; j++) {
      const z = -h / 2 + 0.2 + gap * (j + 0.5);
      for (let i = 0; i <= 3; i++) for (const dz of [-0.45, 0.45]) bx(r, 0.09, 3.5, 0.09, 0x3d6ea5, -L / 2 + (L * i) / 3, 0, z + dz);
      for (const [n, y] of [0.15, 1.25, 2.35].entries()) {
        for (const dz of [-0.45, 0.45]) bx(r, L, 0.1, 0.07, C.accent, 0, y, z + dz);
        for (let i = 0; i < 5; i++) if ((i * 7 + j * 3 + n * 5) % 4) bx(r, L / 5 - 0.25, 0.65 + ((i + j + n) % 3) * 0.12, 0.78, [C.wood, 0xc9a66b, 0xe7e1cf][(i + j + n) % 3], -L / 2 + (L * (i + 0.5)) / 5, y + 0.1, z);
      }
    }
  },
  depot(r, w, h) {
    bx(r, w, 0.06, h, C.pad);
    bx(r, 3.6, 2.5, 1.7, C.wall, 0, 0, -1.05); bx(r, 3.64, 0.5, 1.74, C.wall2, 0, 0, -1.05); bx(r, 3.66, 0.3, 1.76, C.accent, 0, 2.2, -1.05); bx(r, 3.9, 0.14, 2.0, C.roof, 0, 2.5, -1.0);
    gate(r, 1.5, 1.8, -0.8, 0, -0.2); win(r, 0.8, 0.6, 0.95, 1.2, -0.2);
    carShape(sub(r, 0, 1.2, 0, 0.82), 'car_truck');
  },
  dump(r, w, h) { // polní sklad 2×2 u dolu: zpevněná plocha, opěrná stěna, přístřešek a sypaná hromada hlušiny
    bx(r, w, 0.08, h, C.pad);
    bx(r, 1.78, 0.07, 0.09, C.yellow, 0, 0.08, 0.88);
    for (const [x, z] of [[-0.84, -0.84], [0.84, -0.84], [-0.84, 0.16], [0.84, 0.16]]) bx(r, 0.09, 1.35, 0.09, C.trim, x, 0.08, z);
    bx(r, 1.72, 0.56, 0.08, C.wood2, 0, 0.08, -0.82); bx(r, 0.08, 0.56, 0.96, C.wood2, -0.82, 0.08, -0.35);
    gable(r, 1.88, 0.24, 1.18, C.roof, 0, 1.42, -0.34, 0);
    bx(r, 1.9, 0.11, 0.08, C.accent, 0, 1.32, 0.22);
    heap(r, 0.54, 0.72, C.stone, -0.32, -0.32);
    heap(r, 0.36, 0.44, C.dirt, 0.34, -0.4);
    pallet(r, 0.4, 0.46, 0);
  },
};
// Odběratel surovin: výrobní hala s pilovou střechou a pásem ve své barvě, správní přístavek, komíny a dvůr, na kterém leží to, co bere.
const NPC_COL = { build: 0x4f8fb8, power: 0x8a6a4c, cu: 0xc0703c, chem: 0x5fa873, al: 0xa3adb8, sn: 0x7b828c, au: 0xd4a93a };
const YARD = {
  build(r, x, z) { // stavebniny: hromady kameniva, palety cihel, stojan s tabulemi skla
    heap(r, 1.1, 1.2, 0xb9b2a2, x, z + 0.5); heap(r, 0.9, 0.95, C.stone, x + 2.1, z + 0.9);
    for (let i = 0; i < 3; i++) { bx(r, 0.85, 0.1, 0.85, C.wood2, x + 3.9 + i, 0.06, z + 1.3); bx(r, 0.75, 0.5, 0.75, C.brick, x + 3.9 + i, 0.16, z + 1.3); }
    bx(r, 0.9, 0.08, 1.6, C.wood2, x + 4.8, 0.06, z); for (let i = 0; i < 4; i++) bx(r, 0.05, 1.2, 1.5, C.win, x + 4.6 + i * 0.12, 0.14, z).rotation.z = -0.14;
  },
  power(r, x, z) { // elektrárna: chladicí věž, hromada uhlí, trafa
    cyl(r, 1.7, 4.6, 0xd9d4c8, x + 0.4, 0.06, z + 0.6, 1.05, 18); cyl(r, 1.05, 0.9, 0xd9d4c8, x + 0.4, 4.66, z + 0.6, 1.25, 18); cyl(r, 1.12, 0.03, C.trim, x + 0.4, 5.56, z + 0.6, 1.12, 18); addVent(r, x + 0.4, 5.6, z + 0.6, 'steam');
    heap(r, 1.2, 1.1, C.coal, x + 3.6, z + 0.9);
    for (let i = 0; i < 2; i++) { bx(r, 0.7, 0.9, 0.6, C.steel, x + 5.6 + i, 0.06, z + 0.2); bx(r, 0.06, 2.2, 0.06, C.trim, x + 5.6 + i, 0.06, z + 1.2); } bx(r, 1.4, 0.05, 0.05, C.trim, x + 6.1, 2.1, z + 1.2);
  },
  chem(r, x, z, col) { // chemička: stojaté nádrže, potrubní most, kulový zásobník
    for (let i = 0; i < 3; i++) { cyl(r, 0.75, 2.6, C.tank, x + i * 1.8, 0.06, z + 0.6); cyl(r, 0.75, 0.3, C.steel, x + i * 1.8, 2.66, z + 0.6, 0.3); bx(r, 0.08, 1.3, 0.08, C.trim, x + i * 1.8, 0.06, z - 0.45); }
    part(r, new THREE.CylinderGeometry(0.07, 0.07, 5.6, 8), col, x + 1.8, 1.4, z - 0.45).rotation.z = Math.PI / 2;
    part(r, new THREE.SphereGeometry(0.95, 14, 10), C.tank, x + 6.2, 1.5, z + 0.7); for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) bx(r, 0.08, 1.1, 0.08, C.trim, x + 6.2 + dx, 0.06, z + 0.7 + dz);
  },
  metal(r, x, z, col) { // huť: srovnané ingoty v barvě kovu a licí pánev
    for (let n = 0; n < 4; n++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) bx(r, 0.95, 0.2, 0.32, col, x + n * 1.45, 0.06 + i * 0.21, z + 0.5 + (n % 2) * 0.6 + (j - (2 - i) / 2) * 0.36);
    cyl(r, 0.5, 0.9, C.trim, x + 6.3, 0.06, z + 0.6, 0.68, 12); cyl(r, 0.6, 0.05, C.fire, x + 6.3, 0.94, z + 0.6, 0.6, 12);
  },
};
function npcShape(r, w, h, t) {
  const col = NPC_COL[t] ?? 0x8d96a2, D = h * 0.5, z0 = -h / 2 + D / 2 + 0.3, f = z0 + D / 2, W2 = w * 0.62, x0 = -w / 2 + W2 / 2 + 0.3, sw = W2 / 4;
  bx(r, w, 0.06, h, C.lot); // dvůr
  bx(r, W2, 3.6, D, C.wall, x0, 0, z0); bx(r, W2 + 0.04, 0.6, D + 0.04, C.wall2, x0, 0, z0); bx(r, W2 + 0.06, 0.55, D + 0.06, col, x0, 3.05, z0); // hala: sokl a pás v barvě odběratele
  for (let i = 0; i < 4; i++) { const x = x0 - W2 / 2 + sw * (i + 0.5); prism(r, [[-sw / 2, 0], [sw / 2, 0], [-sw / 2, 0.95]], D, C.roof, x, 3.6, z0); bx(r, 0.06, 0.6, D * 0.92, C.win, x - sw / 2, 3.72, z0); } // pilová střecha se světlíky
  for (let i = 0; i < 3; i++) win(r, 0.8, 0.7, x0 - W2 * 0.4 + i * 1.15, 1.75, f);
  gate(r, 2.2, 2.4, x0 + W2 * 0.28, 0, f, col);
  const ax = x0 + W2 / 2 + w * 0.14, az = f - h * 0.15; // správní přístavek s plochou střechou
  bx(r, w * 0.28, 2.7, h * 0.3, C.wall, ax, 0, az); bx(r, w * 0.28 + 0.3, 0.14, h * 0.3 + 0.3, C.roof, ax, 2.7, az); bx(r, 0.7, 0.4, 0.7, C.steel, ax + 0.5, 2.84, az - 0.3);
  for (const y of [0.55, 1.65]) for (let i = 0; i < 3; i++) if (y > 1 || i) win(r, 0.55, 0.6, ax + (i - 1) * w * 0.09, y, az + h * 0.15);
  bx(r, 0.6, 1.25, 0.08, C.trim, ax - w * 0.09, 0, az + h * 0.15); // dveře
  for (let i = 0; i < ({ power: 2, cu: 2, al: 1, sn: 1, au: 1, chem: 1 }[t] ?? 0); i++) stack(r, x0 - W2 * 0.38 + i * 1.5, z0 - D * 0.22, t === 'power' ? 12 : 9.5);
  (YARD[t] ?? YARD.metal)(r, -w / 2 + 1.5, f + 1.3, col);
}
function makeCar(c) {
  const Wd = CAR_LOOK[c.m][1];
  let p = carGeo.get(c.m);
  if (!p) { const r = new THREE.Group(), bed = carShape(r, c.m); carGeo.set(c.m, (p = { g: mergeGeometries(collect(r).solid), bed })); }
  const o = new THREE.Group(), body = new THREE.Mesh(p.g, MAT.solid), load = new THREE.Mesh(GEO.box, lam({ color: 0xffffff }));
  o.rotation.order = 'YXZ';
  body.castShadow = true; load.position.set(p.bed[0], p.bed[2], 0); o.userData = { load, m: c.m, size: [p.bed[1] - 0.2, Wd * 0.5, Wd * 0.8] }; o.add(body, load);
  cars.add(o); carObjs.set(c, o);
  return o;
}
// Auta: jedou po cestě svého dolu; bez silnice parkují vedle něj. Náklad má barvu suroviny a výšku podle naložení.
function syncCars(s) {
  const live = new Set();
  for (const b of s.list) if (b.cars?.length) {
    let off = 0; // stojící auta parkují v řadě vedle silnice; rozestup podle šířky auta, aby nestála přes sebe
    for (const c of b.cars) {
      live.add(c);
      let o = carObjs.get(c);
      if (o && o.userData.m !== c.m) { cars.remove(o); o.userData.load.material.dispose(); carObjs.delete(c); o = null; } // auto se vyměnilo za větší
      o ??= makeCar(c);
      const p = c._path ?? b._sinks?.find((x) => x.path)?.path, Wd = CAR_LOOK[c.m][1];
      if (!p) {
        o.position.set(b.x + b.w + 0.5 + off + Wd / 2, baseOf(s, b) + 0.02, b.y + b.h - 0.6); off += Wd + 0.35;
        o.rotation.y = Math.PI / 2; o.rotation.x *= 0.8; o.rotation.z *= 0.8;
      } else {
        const end = p.length - 1, i0 = Math.max(0, Math.min(end, Math.floor(c.p))), i1 = Math.min(end, i0 + 1), f = Math.min(1, c.p - i0), a = i1 > i0 ? p[i0] : p[Math.max(0, i0 - 1)], z = p[i1], sg = c.dir < 0 ? -1 : 1;
        const hx = (z[0] - a[0]) * sg, hz = (z[1] - a[1]) * sg, stand = c.dir === 0 || (c.dir > 0 && c.p >= end), k = stand ? 0.3 + (off += Wd + 0.3) - Wd / 2 : 0.32; // jedoucí drží pravý pruh, protisměr jede po druhé straně
        const px = p[i0][0] + (p[i1][0] - p[i0][0]) * f + 0.5, pz = p[i0][1] + (p[i1][1] - p[i0][1]) * f + 0.5, side = stand && at(s, Math.floor(px - hz * k), Math.floor(pz + hx * k)) ? -1 : 1; // parkuje se na té straně silnice, kde nestojí budova
        const rx = px - hz * k * side, rz = pz + hx * k * side, len = Math.hypot(hx, hz);
        const moving = !stand && len > 1e-4;
        const bounce = moving ? Math.abs(Math.sin(G.time * 18 + o.id * 1.7)) * 0.028 : 0;
        o.position.set(rx, HH(rx, rz) + 0.08 + bounce, rz);
        let pitch = 0, roll = 0;
        if (len > 1e-4) {
          const fx = hx / len, fz = hz / len;
          pitch = Math.atan2(HH(rx + fx * 0.8, rz + fz * 0.8) - HH(rx - fx * 0.8, rz - fz * 0.8), 1.6);
          const d = Math.atan2(-hz, hx) - o.rotation.y, turn = Math.atan2(Math.sin(d), Math.cos(d));
          o.rotation.y += turn * 0.3;
          if (moving) roll = Math.max(-0.08, Math.min(0.08, turn * 0.14));
        }
        o.rotation.z += (pitch - o.rotation.z) * 0.25;
        o.rotation.x += (roll - o.rotation.x) * 0.25;
      }
      const { load, size } = o.userData;
      load.visible = c.n > 0;
      if (c.n) { load.scale.set(size[0], size[1] * (0.3 + 0.7 * c.n / CARS[c.m].cap), size[2]); load.material.color.set(ITEMS[c.it].col); }
    }
  }
  for (const [c, o] of carObjs) if (!live.has(c)) { cars.remove(o); o.userData.load.material.dispose(); carObjs.delete(c); }
}
// Popisek nad dolem nebo pecí: co má u sebe a jaký je limit. U dolu zásoba ložiska v dosahu a hromada, u pece vstupy a hotové zboží.
const nm = (it) => ITEMS[it].name.split(' (')[0].toLowerCase();
const upTag = (b) => {
  const s = ((b.lv ?? 0) > 0 ? `★${b.lv + 1}` : '') + (b.mods ?? []).map((id) => MODS[id]?.icon ?? '').join('');
  return s ? `[${s}] ` : '';
};
function infoOf(s, b) {
  const m = MODELS[b.model], pre = upTag(b);
  if (b.k === 'miner') {
    if (m.kind === 'm_drill' || !b.oi) return pre.trim();
    const [cx, cy] = centerOf(b);
    return `${pre}${ORES[b.oi].name}: zbývá ${Math.round(survey(s, cx, cy, reachOf(b), m.kind === 'm_shaft' ? b.goal : 0)[b.oi] ?? 0)} t · hromada ${b.out.length}/${pileOf(b)}`;
  }
  const cap = KINDS[m.kind].cat === 'Suroviny' && ROUTES[b.prod] ? capOf(b) : null;
  if (cap && ROUTES[b.prod].power) return `${pre}${Object.keys(cap).map((it) => `${nm(it)} ${Math.floor(b.buf[it] ?? 0)}/${cap[it]}`).join(' · ')} → proud, zásobník ${Math.floor(s.mwh)}/${GRID_MWH} MWh`;
  if (!cap || !ROUTES[b.prod].out) return pre.trim();
  return pre + Object.keys(cap).map((it) => `${nm(it)} ${Math.floor(b.buf[it] ?? 0)}/${cap[it]}`).join(' · ') + ` → ${Object.keys(ROUTES[b.prod].out).map(nm).join(', ')} ${b.out.length}/${pileOf(b)}`;
}
const sizeLabel = (sp, k) => sp.scale.set(sp.userData.base[0] * k, sp.userData.base[1] * k, 1);
function setLabel(o, slot, txt, col) { // cedulka se překreslí, jen když se změní text
  const u = o.userData;
  if (txt === (u[slot + 'Text'] ?? '')) return;
  if (u[slot]) { o.remove(u[slot]); u[slot].material.map.dispose(); u[slot].material.dispose(); }
  u[slot + 'Text'] = txt; u[slot] = txt ? label(txt, col) : null;
  if (u[slot]) o.add(u[slot]);
}
const findAnim = (o, stop) => { while (o && o !== stop) { if (o.userData.anim) return o; o = o.parent; } return null; };
// Sloučí skupinu těles do jedné geometrie s barvami ve vrcholech, baked AO, UV a oddělí pohyblivé části.
function collect(root, fit = null) {
  const solid = [], glass = [], anims = new Map();
  const scaleK = fit ? Math.hypot(fit.elements[4], fit.elements[5], fit.elements[6]) : 1;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), c = o.material.color;
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
    g.applyMatrix4(o.matrixWorld);
    if (fit) g.applyMatrix4(fit);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, norm = g.attributes.normal, n = pos.count, col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i), nx = norm.getX(i), ny = norm.getY(i), nz = norm.getZ(i);
      const ao = py < 0.25 ? 0.78 + 0.22 * Math.max(0, py / 0.25) : 1;
      const shade = (0.92 + 0.08 * ny + 0.04 * nx - 0.04 * nz) * ao * (0.96 + 0.08 * (Math.sin(px * 7.3 + pz * 5.7) * 0.5 + 0.5));
      col[i * 3] = Math.min(1, c.r * shade); col[i * 3 + 1] = Math.min(1, c.g * shade); col[i * 3 + 2] = Math.min(1, c.b * shade);
    }
    for (let i = 0; i + 2 < n; i += 3) {
      const ax = Math.abs(norm.getX(i)), ay = Math.abs(norm.getY(i)), az = Math.abs(norm.getZ(i));
      for (let j = i; j < i + 3; j++) {
        const px = pos.getX(j), py = pos.getY(j), pz = pos.getZ(j);
        if (ay >= ax && ay >= az) { uv[j * 2] = px * 0.5; uv[j * 2 + 1] = pz * 0.5; }
        else if (ax >= az) { uv[j * 2] = pz * 0.5; uv[j * 2 + 1] = py * 0.5; }
        else { uv[j * 2] = px * 0.5; uv[j * 2 + 1] = py * 0.5; }
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const ag = findAnim(o, root);
    if (ag) {
      let entry = anims.get(ag);
      if (!entry) {
        const mat = fit ? new THREE.Matrix4().multiplyMatrices(fit, ag.matrixWorld) : ag.matrixWorld;
        const pivot = new THREE.Vector3().setFromMatrixPosition(mat);
        const axis = new THREE.Vector3(...ag.userData.anim.axis).transformDirection(mat);
        anims.set(ag, (entry = { parts: [], kind: ag.userData.anim.kind, pivot, axis, span: (ag.userData.anim.span ?? 0) * scaleK }));
      }
      g.translate(-entry.pivot.x, -entry.pivot.y, -entry.pivot.z);
      entry.parts.push(g);
    } else (o.material.transparent ? glass : solid).push(g);
  });
  const anim = [...anims.values()].map((a) => ({ geo: mergeGeometries(a.parts), kind: a.kind, pivot: a.pivot, axis: a.axis, span: a.span }));
  return { solid, glass, anim, box: new THREE.Box3().setFromObject(root) };
}
// Tvar stroje nebo budovy z mezipaměti. Model stroje se otočí a zmenší na půdorys; stolní stroje stojí na stole.
function proto(id, b) {
  let p = protos.get(id);
  if (p) return p;
  const m = MODELS[id], root = new THREE.Group(), table = new THREE.Group();
  let fit = new THREE.Matrix4(), top;
  if (!m) { if (id.startsWith('npc_')) npcShape(root, b.w, b.h, id.slice(4)); else HUB[id](root, b.w, b.h); top = 3.5; } else {
    const kind = SUB[m.kind] ?? m.kind, own = OWN[id] ?? OWN[m.kind], desk = m.tier === 'hobby' && !own ? 0.78 : 0;
    if (own) own(root, m); else if (kind in MACHINE_MODELS) for (const mod of buildMachine(kind)) root.add(mod.obj); else bx(root, m.w, 1.2, m.h, 0x8d96a2);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const turn = (size.x >= size.z) !== (m.w >= m.h), k = Math.min(m.w / (turn ? size.z : size.x), m.h / (turn ? size.x : size.z)) * (desk ? 0.8 : 0.94);
    fit = new THREE.Matrix4().makeTranslation(0, desk, 0).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeRotationY(turn ? Math.PI / 2 : 0)).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -box.min.y, -mid.z));
    if (desk) { bx(table, m.w * 0.94, 0.07, m.h * 0.94, C.wood, 0, desk - 0.07); for (const x of [-1, 1]) for (const z of [-1, 1]) bx(table, 0.07, desk - 0.07, 0.07, C.steel, x * (m.w * 0.47 - 0.06), 0, z * (m.h * 0.47 - 0.06)); }
    top = size.y * k + desk;
  }
  const c = collect(root, fit), tb = collect(table), bake = (list, extra = []) => (list.length + extra.length ? mergeGeometries([...list, ...extra]) : null);
  const vents = (root.userData.vents ?? []).map((v) => { const vp = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(fit); return { x: vp.x, y: vp.y, z: vp.z, kind: v.kind }; });
  p = { solid: bake(c.solid, tb.solid), glass: bake(c.glass), anim: c.anim, vents, h: top };
  protos.set(id, p);
  return p;
}
function label(text, col = '#ff9a2e') { // plovoucí odznak nad budovou s barevným okrajem a šipkou dolů
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '700 33px Bahnschrift, "Segoe UI", sans-serif';
  g.font = font; const w = Math.max(210, Math.ceil(g.measureText(text).width) + 72);
  c.width = w; c.height = 76;
  const grad = g.createLinearGradient(0, 2, 0, 60);
  grad.addColorStop(0, 'rgba(22,34,48,0.95)'); grad.addColorStop(1, 'rgba(12,19,28,0.95)');
  g.save();
  g.beginPath(); g.roundRect(2, 2, w - 4, 58, 18); g.fillStyle = grad; g.fill();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, 28);
  g.fillStyle = col; g.fillRect(2, 0, 14, 62);
  g.restore();
  g.save();
  g.globalAlpha = 0.85; g.strokeStyle = col; g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(2, 2, w - 4, 58, 18); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 9, 59); g.lineTo(w / 2, 72); g.lineTo(w / 2 + 9, 59); g.closePath();
  g.fillStyle = 'rgba(12,19,28,0.95)'; g.fill(); g.stroke();
  g.restore();
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 4; g.fillStyle = '#f3f5f7';
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2 + 6, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set((3 * w) / 256, 0.85, 1); sp.userData.base = [(3 * w) / 256, 0.85];
  return sp;
}

function makeDepositBadge(d) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = 380; c.height = 118;
  const isAct = d.status === 'active';
  const tagCol = isAct ? '#ffb834' : '#00f0aa';
  const tagBg = isAct ? 'rgba(255,184,52,0.2)' : 'rgba(0,240,170,0.2)';
  const borderCol = isAct ? 'rgba(255,184,52,0.85)' : 'rgba(0,240,170,0.85)';

  // Podklad rámečku
  g.save();
  g.fillStyle = 'rgba(10, 16, 24, 0.94)';
  g.strokeStyle = borderCol;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(4, 4, c.width - 8, c.height - 20, 14);
  g.fill();
  g.stroke();

  // Šipka dolů
  g.beginPath();
  g.moveTo(c.width / 2 - 12, c.height - 18);
  g.lineTo(c.width / 2, c.height - 4);
  g.lineTo(c.width / 2 + 12, c.height - 18);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();

  // Stavový odznak
  g.save();
  g.fillStyle = tagBg;
  g.beginPath();
  g.roundRect(14, 12, 145, 24, 6);
  g.fill();
  g.fillStyle = tagCol;
  g.font = '700 13px Bahnschrift, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(isAct ? '● AKTIVNÍ DŮL' : '✦ VOLNÉ LOŽISKO', 86, 24);

  // Region badge vpravo
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.roundRect(c.width - 150, 12, 136, 24, 6);
  g.fill();
  g.fillStyle = '#94a3b8';
  g.fillText(d.region || 'Svět', c.width - 82, 24);

  // Název dolu / ložiska
  g.fillStyle = '#ffffff';
  g.font = 'bold 20px Bahnschrift, "Segoe UI", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const name = d.name.length > 28 ? d.name.slice(0, 26) + '…' : d.name;
  g.fillText(name, 18, 66);

  // Odhad zásob a surovina
  const oreCol = ORES[d.ore_index]?.col || '#cbd5e1';
  g.fillStyle = oreCol;
  g.font = '600 15px Bahnschrift, "Segoe UI", sans-serif';
  const oreName = ORES[d.ore_index]?.name || d.ore;
  g.fillText(`${oreName.toUpperCase()} · Odhad: ${d.reserves_est || (d.reserves_t ? (d.reserves_t / 1e6).toFixed(1) + ' Mt' : '?')}`, 18, 92);
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set((4.2 * c.width) / 256, (4.2 * c.height) / 256, 1);
  sp.userData.base = [(4.2 * c.width) / 256, (4.2 * c.height) / 256];
  return sp;
}

function makeDepositPin(d) {
  const g = new THREE.Group();
  const oreCol = colorOf(ORES[d.ore_index]?.col || '#ffffff');
  const isAct = d.status === 'active';

  // Svislý světelný maják / sloup
  const poleGeo = new THREE.CylinderGeometry(0.35, 0.12, 24, 8);
  const poleMat = lam({
    color: oreCol,
    emissive: oreCol,
    emissiveIntensity: isAct ? 0.4 : 0.65,
    transparent: true,
    opacity: 0.85
  });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 12;

  // Diamantový maják nahoře
  const gemGeo = new THREE.OctahedronGeometry(2.0, 0);
  const gemMat = lam({
    color: isAct ? 0xffc030 : 0x00f0aa,
    emissive: oreCol,
    emissiveIntensity: 0.75
  });
  const gem = new THREE.Mesh(gemGeo, gemMat);
  gem.position.y = 24;

  // Billboard odznak
  const badge = makeDepositBadge(d);
  badge.position.y = 30;

  g.add(pole, gem, badge);
  g.position.set(d.x, 0, d.y);
  g.userData = { dep: d, x: d.x, y: d.y, gem, badge };
  return g;
}

function syncDepositPins(s) {
  if (depositPins.children.length === 0 && Array.isArray(WORLD_DEPOSITS)) {
    for (const d of WORLD_DEPOSITS) {
      const pin = makeDepositPin(d);
      depositPins.add(pin);
    }
  }
  if (s) {
    for (const pin of depositPins.children) {
      const d = pin.userData.dep;
      pin.position.y = s._world.height(d.x, d.y);
    }
  }
}
// ---------------------------------------------------------------- příroda a ložiska: stromy, balvany a kusy nerostu stojí na dlaždicích jako instance v každém bloku terénu
function decoGeo() {
  const tree = new THREE.Group();
  bx(tree, 0.2, 0.9, 0.2, 0x6e492d);
  part(tree, new THREE.ConeGeometry(1.0, 1.6, 7), 0x367a37, 0, 1.55, 0);
  part(tree, new THREE.ConeGeometry(0.78, 1.4, 7), 0x469443, 0, 2.4, 0);
  part(tree, new THREE.ConeGeometry(0.52, 1.1, 7), 0x5ab052, 0, 3.15, 0);
  DECO.tree = mergeGeometries(collect(tree).solid);
  const tree2 = new THREE.Group();
  bx(tree2, 0.22, 1.0, 0.22, 0x755034);
  part(tree2, new THREE.DodecahedronGeometry(0.65, 1), 0x52a649, 0, 1.85, 0);
  part(tree2, new THREE.DodecahedronGeometry(0.55, 1), 0x428f3b, 0.32, 1.55, 0.2);
  part(tree2, new THREE.DodecahedronGeometry(0.52, 1), 0x64ba56, -0.28, 1.6, -0.22);
  DECO.tree2 = mergeGeometries(collect(tree2).solid);
  DECO.rock = new THREE.DodecahedronGeometry(0.5, 0); DECO.ore = new THREE.IcosahedronGeometry(0.3, 0);
  DECO.rockMat = lam({ color: 0x8b9097, flatShading: true }); DECO.oreMat = lam({ color: 0xffffff, flatShading: true });
}
function decorate(s, m) { // podle dlaždic bloku: na ložisku kusy nerostu (ubývají s těžbou), v trávě dva druhy stromů, na skále balvany
  for (const d of [...m.children]) { m.remove(d); d.dispose(); }
  const { cx, cy } = m.userData, ch = s._world.chunk(cx, cy), H = s._world.height, rnd = s._world.rnd, trees1 = [], trees2 = [], rocks = [], ores = [];
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const x = cx * CHUNK + i, y = cy * CHUNK + j, t = ch.terrain[j * CHUNK + i], o = ch.ore[j * CHUNK + i], r = rnd(x, y, 61);
    const free = () => !at(s, x, y) && !s._road.has(key(x, y)) && !isHall(s, x, y);
    if (o) { if (r < 0.5 && left(s, x, y) > 0 && free()) ores.push([x, y, o]); }
    else if (((t === 2 && r < 0.045) || (t === 3 && r < 0.012)) && Math.hypot(x, y) > 14 && free() && !s.dug[key(x, y) * 8] && !DX.some((dx, d) => at(s, x + dx, y + DY[d]))) ((x + y) & 1 ? trees1 : trees2).push([x, y]);
    else if (t === 4 && r < 0.03 && free()) rocks.push([x, y]);
  }
  const put = (geo, mat, list, f) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, o], n) => { const a = rnd(x, y, 62), b = rnd(x, y, 63), px = x + 0.25 + a * 0.5, pz = y + 0.25 + b * 0.5; f(a, b, o, x, y); im.setMatrixAt(n, M4.compose(P3.set(px, H(px, pz) + S3.y * (geo === DECO.tree || geo === DECO.tree2 ? 0 : 0.3), pz), Q4.setFromAxisAngle(UP, a * 6.28), S3)); if (o) im.setColorAt(n, colorOf(ORES[o].col)); });
    im.position.set(-(cx + 0.5) * CHUNK, 0, -(cy + 0.5) * CHUNK); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.visible = !G.under;
    m.add(im);
  };
  put(DECO.tree, MAT.solid, trees1, (a, b) => S3.setScalar(0.75 + b * 0.8));
  put(DECO.tree2, MAT.solid, trees2, (a, b) => S3.setScalar(0.75 + a * 0.75));
  put(DECO.rock, DECO.rockMat, rocks, (a, b) => S3.set(0.7 + a * 0.9, 0.5 + b * 0.6, 0.7 + b * 0.8));
  put(DECO.ore, DECO.oreMat, ores, (a, b, o, x, y) => { const k = 0.5 + 0.6 * (left(s, x, y) / SURF_T); S3.set(k * (0.8 + a * 0.5), k * (ORES[o].id === 'quartz' ? 1.7 : 0.9) * (0.7 + b * 0.6), k * (0.8 + b * 0.5)); });
}
const shapeKey = (b) => `${b.model ?? (b.k === 'hub' ? (b.hq ? 'hq' : b.dump ? 'dump' : 'depot') : b.k)}:${b.x},${b.y},${b.w ?? 1},${b.h ?? 1}`;
const hubTitle = (b) => (b.hq ? 'SKLAD' : b.dump ? 'SKLAD U DOLU' : 'DEPO') + ((b.lv ?? 0) > 0 || b.mods?.length ? ' ' + upTag(b).trim() : '');
function makeObj(b) {
  const o = new THREE.Group(), w = b.w ?? 1, h = b.h ?? 1;
  if (b.model || b.k === 'hub' || b.k === 'npc') {
    const inHall = isHall(G.s, b.x, b.y), p = proto(b.model ?? (b.k === 'npc' ? 'npc_' + b.t : b.hq ? (inHall ? 'hq' : 'yard') : b.dump ? 'dump' : 'depot'), b);
    o.userData.inHall = inHall;
    if (p.solid) { const m = new THREE.Mesh(p.solid, MAT.solid); m.castShadow = m.receiveShadow = true; o.add(m); o.userData.body = m; }
    if (p.glass) { const m = new THREE.Mesh(p.glass, MAT.glass); o.add(m); o.userData.glass = m; }
    if (p.anim?.length) o.userData.anim = p.anim.map((a) => {
      const mesh = new THREE.Mesh(a.geo, MAT.solid); mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.copy(a.pivot); mesh.visible = !(b.build > 0); o.add(mesh);
      return { mesh, kind: a.kind, pivot: a.pivot, axis: a.axis, span: a.span };
    });
    if (b.model) { o.userData.led = new THREE.Mesh(GEO.led, MAT.led.idle); o.userData.led.position.y = p.h + 0.4; o.add(o.userData.led); o.rotation.y = (-(b.d ?? 0) * Math.PI) / 2; }
    else if (b.k === 'npc') { const sign = label(b.name.toUpperCase()); sign.position.y = 13; sign.scale.multiplyScalar(2.4); o.add(sign); } // cedule odběratele je vidět i z dálky
    else { setLabel(o, 'sign', hubTitle(b)); if (o.userData.sign) o.userData.sign.position.y = b.dump ? 2.7 : 4.2; }
  } else { // křížení, rozdělovač, třídič, výdejník
    const body = new THREE.Mesh(GEO.box, lam({ color: { junction: 0x59616d, splitter: 0x4a6a8a, sorter: 0x3d78c2, unloader: 0xffb52e }[b.k] })); body.scale.set(0.9, 0.45, 0.9); o.add(body);
    if (b.k === 'unloader') { const a = new THREE.Mesh(GEO.arrow, basic(0x15171a)); a.position.set(0, 0.6, 0); o.add(a); o.rotation.y = (-b.d * Math.PI) / 2; }
  }
  o.position.set(b.x + w / 2, baseOf(G.s, b), b.y + h / 2); o.userData.b = b; o.userData.model = b.model; o.userData.shape = shapeKey(b);
  things.add(o); objs.set(b, o);
}
const instanced = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
function syncThings(s) {
  const live = new Set();
  belts = [];
  for (const b of s.list) {
    if (b.k === 'belt') { belts.push(b); continue; }
    live.add(b);
    const o = objs.get(b);
    if (o && o.userData.shape !== shapeKey(b)) { things.remove(o); objs.delete(b); } // vyměněný nebo povýšený stroj/depo dostane nový tvar i rozměr
    if (!objs.has(b)) makeObj(b);
  }
  for (const [b, o] of objs) if (!live.has(b)) { things.remove(o); objs.delete(b); }
  if (!beltMesh || belts.length > beltMesh.instanceMatrix.count) { // dopravníky a položky jsou instance jedné geometrie; kapacita roste po mocninách dvou
    for (const m of [beltMesh, arrowMesh, itemMesh]) if (m) { scene.remove(m); m.dispose(); }
    const cap = Math.max(1024, 2 ** Math.ceil(Math.log2(belts.length + 1)));
    beltMesh = instanced(GEO.belt, lam({ color: 0x1c2129 }), cap); arrowMesh = instanced(GEO.arrow, lam({ color: 0x566273 }), cap); itemMesh = instanced(GEO.item, lam({ color: 0xffffff }), cap);
    beltMesh.receiveShadow = true;
  }
  belts.forEach((b, i) => {
    b._h = HH(b.x + 0.5, b.y + 0.5);
    beltMesh.setMatrixAt(i, M4.makeTranslation(b.x + 0.5, b._h + 0.05, b.y + 0.5));
    arrowMesh.setMatrixAt(i, M4.makeRotationY((-b.d * Math.PI) / 2).setPosition(b.x + 0.5, b._h + 0.16, b.y + 0.5));
  });
  beltMesh.count = arrowMesh.count = belts.length; beltMesh.instanceMatrix.needsUpdate = arrowMesh.instanceMatrix.needsUpdate = true;
  for (const k of pits) s._pit.add(k); // nová budova u jámy srovná terén pod sebou
  const pads = new Set(); // bloky terénu s budovami: terén se pod budovou srovná (a po zbourání vrátí)
  for (const b of s.list) if (b.w) for (const [x, y] of [[b.x - 1, b.y - 1], [b.x + b.w, b.y - 1], [b.x - 1, b.y + b.h], [b.x + b.w, b.y + b.h]]) pads.add(Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK));
  for (const k of new Set([...pads, ...padPrev])) s._pit.add(k);
  padPrev = pads;
}

// ---------------------------------------------------------------- haly: betonová podlaha, stěny se soklem a pásem oken, plochá střecha se světlíky
const ROAD = [null, [[0.47, 0.38, 0.26], 0.25], [[0.6, 0.58, 0.54], 0.55], [[0.19, 0.2, 0.22], 0.85]]; // barva silnice a přesah přes dlaždici v metrech
const BANDS = [[0, 0.9, [0.24, 0.27, 0.31]], [0.9, 3.3, [0.8, 0.82, 0.84]], [3.3, 4.6, [0.36, 0.56, 0.74]], [4.6, WALL, [0.8, 0.82, 0.84]]];
function syncGround(s) {
  const fp = [], fc = [], rp = [], rc = [], wp = [[], [], [], []], wc = [[], [], [], []];
  const quad = (P, C, col, a, b, c, d) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) C.push(...col); };
  const hall = (x, y) => s._hall.has(key(x, y));
  for (const k of s._hall) {
    const x = Math.floor(k / 65536) - 32768, y = (k % 65536) - 32768;
    const v = ((x * 7 + y * 13) & 3) * 0.01, clean = s._floor.has(k);
    const fCol = clean ? ((x + y) & 1 ? [0.74, 0.80, 0.88] : [0.70, 0.76, 0.85]) : x % 6 && y % 6 ? [0.49 + v, 0.50 + v, 0.52 + v] : [0.41, 0.42, 0.44];
    quad(fp, fc, fCol, [x, 0.04, y], [x, 0.04, y + 1], [x + 1, 0.04, y + 1], [x + 1, 0.04, y]); // betonové desky se spárami po 6 m
    if (clean) { // jemný půlmetrový rastr čistého provozu
      quad(fp, fc, [0.58, 0.66, 0.76], [x + 0.48, 0.046, y], [x + 0.48, 0.046, y + 1], [x + 0.52, 0.046, y + 1], [x + 0.52, 0.046, y]);
      quad(fp, fc, [0.58, 0.66, 0.76], [x, 0.046, y + 0.48], [x, 0.046, y + 0.52], [x + 1, 0.046, y + 0.52], [x + 1, 0.046, y + 0.48]);
    }
    const skyLit = ((x % 8) + 8) % 8 > 5 && y % 5;
    quad(rp, rc, skyLit ? [0.42, 0.60, 0.76] : x & 1 ? [0.56, 0.58, 0.60] : [0.60, 0.62, 0.64], [x, WALL - 0.5, y], [x, WALL - 0.5, y + 1], [x + 1, WALL - 0.5, y + 1], [x + 1, WALL - 0.5, y]);
    if (skyLit) {
      quad(rp, rc, [0.30, 0.34, 0.39], [x, WALL - 0.47, y], [x, WALL - 0.47, y + 0.08], [x + 1, WALL - 0.47, y + 0.08], [x + 1, WALL - 0.47, y]);
      quad(rp, rc, [0.30, 0.34, 0.39], [x + 0.46, WALL - 0.47, y], [x + 0.46, WALL - 0.47, y + 1], [x + 0.54, WALL - 0.47, y + 1], [x + 0.54, WALL - 0.47, y]);
    }
    if (((x % 10) + 10) % 10 === 2 && ((y % 8) + 8) % 8 === 2 && hall(x + 1, y) && hall(x, y + 1) && hall(x + 1, y + 1)) { // vzduchotechnika na střeše s větráky
      const y0 = WALL - 0.5, y1 = WALL + 0.6, c = [0.47, 0.5, 0.54], a = x + 0.2, b = x + 1.8, e = y + 0.2, f = y + 1.8;
      quad(rp, rc, c, [a, y1, e], [a, y1, f], [b, y1, f], [b, y1, e]);
      for (const fx0 of [a + 0.16, a + 0.88]) quad(rp, rc, [0.16, 0.18, 0.21], [fx0, y1 + 0.02, e + 0.24], [fx0, y1 + 0.02, f - 0.24], [fx0 + 0.56, y1 + 0.02, f - 0.24], [fx0 + 0.56, y1 + 0.02, e + 0.24]);
      for (const [p, q] of [[[a, e], [b, e]], [[b, e], [b, f]], [[b, f], [a, f]], [[a, f], [a, e]]]) quad(rp, rc, [0.38, 0.41, 0.45], [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]);
    }
    for (let d = 0; d < 4; d++) if (!hall(x + DX[d], y + DY[d]) && !(s._road.has(k) && s._road.has(key(x + DX[d], y + DY[d])))) { // stěna + žlutý bezpečnostní pruh podél stěny
      const x0 = x + (d === 0 ? 1 : 0), y0 = y + (d === 1 ? 1 : 0), x1 = x + (d === 2 ? 0 : 1), y1 = y + (d === 3 ? 0 : 1);
      for (const o of [0.12, -0.12]) for (const [lo, hi, col] of BANDS) quad(wp[d], wc[d], col, [x0 + DX[d] * o, lo, y0 + DY[d] * o], [x1 + DX[d] * o, lo, y1 + DY[d] * o], [x1 + DX[d] * o, hi, y1 + DY[d] * o], [x0 + DX[d] * o, hi, y0 + DY[d] * o]);
      quad(wp[d], wc[d], [0.24, 0.27, 0.31], [x0 + DX[d] * 0.12, WALL, y0 + DY[d] * 0.12], [x1 + DX[d] * 0.12, WALL, y1 + DY[d] * 0.12], [x1 - DX[d] * 0.12, WALL, y1 - DY[d] * 0.12], [x0 - DX[d] * 0.12, WALL, y0 - DY[d] * 0.12]);
      const px = (x1 - x0) * 0.06, py = (y1 - y0) * 0.06, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      for (const o of [0.136, -0.136]) { // okenní sloupky + nosné sloupy po 4 m
        quad(wp[d], wc[d], [0.24, 0.27, 0.31], [mx - px + DX[d] * o, 3.3, my - py + DY[d] * o], [mx + px + DX[d] * o, 3.3, my + py + DY[d] * o], [mx + px + DX[d] * o, 4.6, my + py + DY[d] * o], [mx - px + DX[d] * o, 4.6, my - py + DY[d] * o]);
        if ((d & 1 ? x : y) % 4 === 0) quad(wp[d], wc[d], [0.20, 0.23, 0.27], [x0 + DX[d] * o, 0, y0 + DY[d] * o], [x0 + px * 2.2 + DX[d] * o, 0, y0 + py * 2.2 + DY[d] * o], [x0 + px * 2.2 + DX[d] * o, WALL, y0 + py * 2.2 + DY[d] * o], [x0 + DX[d] * o, WALL, y0 + DY[d] * o]);
      }
      const ax0 = d === 0 ? x + 0.74 : d === 2 ? x + 0.16 : x + 0.05, ax1 = d === 0 ? x + 0.84 : d === 2 ? x + 0.26 : x + 0.95;
      const az0 = d === 1 ? y + 0.74 : d === 3 ? y + 0.16 : y + 0.05, az1 = d === 1 ? y + 0.84 : d === 3 ? y + 0.26 : y + 0.95;
      quad(fp, fc, [0.92, 0.72, 0.16], [ax0, 0.052, az0], [ax0, 0.052, az1], [ax1, 0.052, az1], [ax1, 0.052, az0]);
    }
  }
  for (const [k, t] of s._road) { // silnice: lepší třída je širší, má vyjeté koleje / krajnice / přerušovanou čáru
    const x = Math.floor(k / 65536) - 32768, y = (k % 65536) - 32768, [col, m] = ROAD[t], h = 0.03 + t * 0.012;
    const c = (px, py, e = 0) => [px, h + e + s._world.height(px, py), py];
    const roadRect = (x0, y0, x1, y1, rcol, e) => quad(fp, fc, rcol, c(x0, y0, e), c(x0, y1, e), c(x1, y1, e), c(x1, y0, e));
    roadRect(x - m, y - m, x + 1 + m, y + 1 + m, col, 0);
    const e0 = s._road.has(key(x + 1, y)), w0 = s._road.has(key(x - 1, y)), n0 = s._road.has(key(x, y - 1)), s0 = s._road.has(key(x, y + 1));
    const ew = e0 || w0, ns = n0 || s0;
    if (t === 1 && (ew !== ns || (!ew && !ns))) {
      for (const off of [-0.22, 0.22]) if (ew) roadRect(x - 0.2, y + 0.5 + off - 0.09, x + 1.2, y + 0.5 + off + 0.09, [0.36, 0.28, 0.19], 0.008);
      else roadRect(x + 0.5 + off - 0.09, y - 0.2, x + 0.5 + off + 0.09, y + 1.2, [0.36, 0.28, 0.19], 0.008);
    }
    if (t >= 2) {
      const shCol = t === 3 ? [0.30, 0.31, 0.34] : [0.46, 0.44, 0.40], bw = 0.14;
      if (!w0) roadRect(x - m, y - m, x - m + bw, y + 1 + m, shCol, 0.006);
      if (!e0) roadRect(x + 1 + m - bw, y - m, x + 1 + m, y + 1 + m, shCol, 0.006);
      if (!n0) roadRect(x - m, y - m, x + 1 + m, y - m + bw, shCol, 0.006);
      if (!s0) roadRect(x - m, y + 1 + m - bw, x + 1 + m, y + 1 + m, shCol, 0.006);
    }
    if (t === 3 && ((+e0 + +w0 + +n0 + +s0) <= 2) && (ew !== ns)) {
      const a = ew ? 0.3 : 0.06, c2 = ew ? 0.06 : 0.3;
      roadRect(x + 0.5 - a, y + 0.5 - c2, x + 0.5 + a, y + 0.5 + c2, [0.9, 0.9, 0.86], 0.014);
    }
  }
  const set = (mesh, pos, col) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); mesh.geometry.dispose(); mesh.geometry = g; };
  set(floorMesh, fp, fc); set(roofMesh, rp, rc); wallMesh.forEach((m, d) => set(m, wp[d], wc[d]));
}

// ---------------------------------------------------------------- terén: bloky s texturou; kde se kopalo, klesne povrch do jámy
const pitDepth = (s, x, y) => PIT_M * Math.min(1, (s.dug[key(x, y) * 8] ?? 0) / SURF_T);
function pitGeometry(s, cx, cy) { // tvar bloku terénu: kopce, jámy po těžbě a rovné plochy pod budovami; null = úplně rovný blok
  const g = new THREE.PlaneGeometry(CHUNK, CHUNK, CHUNK, CHUNK).rotateX(-Math.PI / 2), pos = g.attributes.position, H = s._world.height;
  let any = false;
  for (let j = 0; j <= CHUNK; j++) for (let i = 0; i <= CHUNK; i++) { // roh sdílejí čtyři dlaždice; klesne, jen když se kopalo na všech čtyřech (stěna jámy je celá z odkryté horniny)
    const x = cx * CHUNK + i, y = cy * CHUNK + j;
    let sum = 0, flat = false, pad = null;
    for (const [a, b] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
      const d = pitDepth(s, a, b), o = at(s, a, b);
      if (o?.w && pad === null) pad = baseOf(s, o); // budova si terén srovná na výšku svého středu
      if (!d || o || isHall(s, a, b) || s._road.has(key(a, b))) flat = true;
      sum += d;
    }
    const h = (pad ?? H(x, y)) - (flat ? 0 : sum / 4);
    if (h) { pos.setY(j * (CHUNK + 1) + i, h); any = true; }
  }
  if (!any) { g.dispose(); return null; }
  g.computeVertexNormals();
  return g;
}
function refreshChunk(s, m) { // po těžbě: nová textura a nový tvar povrchu
  drawChunk(s, m.userData.cx, m.userData.cy, m.material.map.image); m.material.map.needsUpdate = true;
  if (m.geometry !== GEO.chunk) m.geometry.dispose();
  m.geometry = pitGeometry(s, m.userData.cx, m.userData.cy) ?? GEO.chunk;
  m.castShadow = m.geometry !== GEO.chunk; // stěna jámy stíní dno
  decorate(s, m);
}
function syncChunks(s) {
  const c = G.cam, R = Math.min(560, (900 / c.z) * 1.5 + 48), x0 = Math.floor((c.x - R) / CHUNK), x1 = Math.floor((c.x + R) / CHUNK), y0 = Math.floor((c.y - R) / CHUNK), y1 = Math.floor((c.y + R) / CHUNK);
  const miss = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (!chunks.has(cx + ',' + cy)) miss.push([((cx + 0.5) * CHUNK - c.x) ** 2 + ((cy + 0.5) * CHUNK - c.y) ** 2, cx, cy]);
  for (const [, cx, cy] of miss.sort((a, b) => a[0] - b[0]).slice(0, 6)) { // jen pár nových bloků za snímek a nejdřív ty u středu pohledu
    const k = cx + ',' + cy;
    const tex = new THREE.CanvasTexture(drawChunk(s, cx, cy)); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(pitGeometry(s, cx, cy) ?? GEO.chunk, lam({ map: tex })); m.position.set((cx + 0.5) * CHUNK, 0, (cy + 0.5) * CHUNK); m.receiveShadow = true; m.castShadow = m.geometry !== GEO.chunk; m.userData = { cx, cy };
    terrain.add(m); chunks.set(k, m); decorate(s, m);
  }
  const cullDistSq = (R + CHUNK * 1.2) ** 2;
  for (const [, m] of chunks) {
    const cd2 = (m.position.x - c.x) ** 2 + (m.position.z - c.y) ** 2;
    m.visible = cd2 <= cullDistSq;
  }
  if (chunks.size > 700) for (const [k, m] of chunks) if (m.userData.cx < x0 - 2 || m.userData.cx > x1 + 2 || m.userData.cy < y0 - 2 || m.userData.cy > y1 + 2) { terrain.remove(m); for (const d of m.children) d.dispose(); m.material.map.dispose(); m.material.dispose(); if (m.geometry !== GEO.chunk) m.geometry.dispose(); chunks.delete(k); }
  if (s._pit.size && G.time - pitAt > 0.4) { // jámy se prohlubují průběžně, ale geometrie se přepočítá nejvýš dvakrát za sekundu
    pitAt = G.time;
    for (const k of s._pit) { pits.add(k); const m = chunks.get(k); if (m) refreshChunk(s, m); }
    s._pit.clear();
  }
}

// ---------------------------------------------------------------- pohled pod zem: co odkryl vrt nebo důl, patro po patru
function syncUnder(s) {
  for (const o of [...under.children]) { under.remove(o); if (o.isMesh) o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }
  const seen = new Set();
  let n = 0;
  for (const b of s.list) {
    const m = b.model && MODELS[b.model];
    if (!m?.maxLv || b.dep <= 0) continue;
    const [cx, cy] = centerOf(b), lv = Math.min(m.maxLv, Math.floor(b.dep / LEVEL_M)), shaft = m.kind === 'm_shaft', d = b.dep * UG, r = reachOf(b);
    const col = new THREE.Mesh(shaft ? new THREE.BoxGeometry(2.2, d, 2.2) : new THREE.CylinderGeometry(0.25, 0.25, d, 8), basic(shaft ? 0x2b2e33 : 0xc0392b)); col.position.set(cx + 0.5, -d / 2, cy + 0.5); under.add(col); // šachta nebo vrt
    for (let l = 1; l <= lv; l++) {
      const y = -l * LEVEL_M * UG, disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), basic(0xffffff, 0.1)); disc.material.side = THREE.DoubleSide; disc.position.set(cx + 0.5, y - 2, cy + 0.5);
      const tag = label(`${l * LEVEL_M} m`); tag.position.set(cx + 0.5 + r, y, cy + 0.5); tag.scale.set(6, 1.5, 1);
      under.add(disc, tag);
      for (let ty2 = cy - r; ty2 <= cy + r; ty2++) for (let tx = cx - r; tx <= cx + r; tx++) {
        const o = (tx - cx) ** 2 + (ty2 - cy) ** 2 <= r ** 2 && oreAt(s, tx, ty2, l), id = key(tx, ty2) * 8 + l;
        if (!o || seen.has(id) || n >= oreMesh.instanceMatrix.count) continue;
        seen.add(id);
        const hgt = 0.6 + 3.4 * (left(s, tx, ty2, l) / DEEP_T); // čím víc je vytěženo, tím nižší kvádr
        oreMesh.setMatrixAt(n, M4.makeScale(0.92, hgt, 0.92).setPosition(tx + 0.5, y - 2, ty2 + 0.5)); oreMesh.setColorAt(n++, colorOf(ORES[o].col));
      }
    }
  }
  oreMesh.count = n; oreMesh.instanceMatrix.needsUpdate = true; if (oreMesh.instanceColor) oreMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- scéna
export function init3d(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; // filmové mapování tónů: sytější barvy, měkčí světla
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(SKY_LOW, 100, 600);
  const sc = document.createElement('canvas'); sc.width = 4; sc.height = 256; // obloha: přechod od modré k světlému obzoru
  const sg = sc.getContext('2d'), grad = sg.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, '#2f7fe6'); grad.addColorStop(0.55, '#8cc6f5'); grad.addColorStop(1, '#e4f1fb'); sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  sky = new THREE.CanvasTexture(sc); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
  decoGeo();
  camera = new THREE.PerspectiveCamera(35, 1, 0.5, 4000);
  sun = new THREE.DirectionalLight(0xfff4dc, 3.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  base = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), basic(0x588448)); base.position.y = -PIT_M - 0.5; // pod ještě nenačteným terénem je jednobarevná zem; leží pod dnem jam, aby je nezakryla
  floorMesh = new THREE.Mesh(new THREE.BufferGeometry(), lam({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); floorMesh.receiveShadow = true; // podlahy hal a silnice leží těsně nad terénem
  roofMesh = new THREE.Mesh(new THREE.BufferGeometry(), lam({ vertexColors: true })); roofMesh.castShadow = true;
  for (let d = 0; d < 4; d++) { wallMesh[d] = new THREE.Mesh(new THREE.BufferGeometry(), lam({ vertexColors: true, side: THREE.DoubleSide })); wallMesh[d].castShadow = true; }
  oreMesh = instanced(GEO.box, lam({ color: 0xffffff }), 65536); // kvádry nerostů v pohledu pod zem
  planMesh = instanced(GEO.belt, basic(0xffb52e, 0.6), 4096); // náhled navržené silnice
  smokeMesh = instanced(GEO.smoke, lam({ color: 0xffffff, transparent: true, opacity: 0.68, depthWrite: false }), 1024); smokeMesh.setColorAt(0, new THREE.Color(0xffffff)); // kouř a pára z komínů, věží a poruch
  ghost = new THREE.Mesh(GEO.box, basic(0xffb52e, 0.35)); ghostArrow = new THREE.Mesh(GEO.arrow, basic(0xffb52e)); ghostArrow.scale.setScalar(1.6);
  rectBox = new THREE.Mesh(GEO.box, basic(0xffb52e, 0.3));
  selBox = new THREE.LineSegments(new THREE.EdgesGeometry(GEO.box), new THREE.LineBasicMaterial({ color: 0xffb52e }));
  hotBox = new THREE.LineSegments(new THREE.EdgesGeometry(GEO.box), new THREE.LineBasicMaterial({ color: 0xffffff })); // na co ukazuje kurzor
  mark = new THREE.Group(); mark.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffb52e, depthTest: false })), new THREE.LineSegments(new THREE.EdgesGeometry(GEO.box), new THREE.LineBasicMaterial({ color: 0xffb52e, depthTest: false })));
  mark.children[0].renderOrder = mark.children[1].renderOrder = 9;
  reach = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([...Array(64)].map((_, i) => new THREE.Vector3(Math.cos(i * 0.0982), 0.15, Math.sin(i * 0.0982)))), new THREE.LineBasicMaterial({ color: 0xffb52e }));
  fx.add(ghost, ghostArrow, rectBox, selBox, hotBox, mark, reach);
  scene.add(new THREE.HemisphereLight(0xd8ecff, 0x5c4d38, 1.35), sun, sun.target, base, terrain, floorMesh, ...wallMesh, roofMesh, things, cars, signs, fx, under, depositPins);
}
function reset(s) { // nová nebo načtená hra: zahodit vše, co patřilo té minulé
  for (const m of chunks.values()) { terrain.remove(m); for (const d of m.children) d.dispose(); m.material.map.dispose(); m.material.dispose(); if (m.geometry !== GEO.chunk) m.geometry.dispose(); }
  chunks.clear(); for (const o of objs.values()) things.remove(o); objs.clear(); rev = grev = -1; ugAt = 0;
  for (const o of carObjs.values()) cars.remove(o); carObjs.clear();
  signs.clear(); // popisky dvou ložisek u startu: co se tu dá těžit
  for (const [o, x, y] of STARTERS) { const t = label('ložisko: ' + ORES[o].name, '#e8e6e1'); t.position.set(x + 0.5, 4 + s._world.height(x, y), y + 0.5); signs.add(t); }
  pits.clear(); for (const k of s._pit) pits.add(k);
  syncDepositPins(s);
  plumes.length = 0; smokeAt = plumeEmitAt = 0; if (smokeMesh) smokeMesh.count = 0;
}
function updateCamera() {
  const c = G.cam;
  if (G.fly) { // plynulý přelet: poloha, přiblížení i natočení
    let far = 0;
    for (const k in G.fly) { let d = G.fly[k] - c[k]; if (k === 'yaw') d = Math.atan2(Math.sin(d), Math.cos(d)); c[k] += d * 0.14; far += Math.abs(d); }
    if (far < 0.05) G.fly = null;
  }
  ty += ((G.under ? -32 : 0) + HH(c.x, c.y) - ty) * 0.12; // pohled míří na povrch terénu, pod zemí do hloubky
  const dist = 900 / c.z, cp = Math.cos(c.pitch);
  camera.position.set(c.x + dist * cp * Math.sin(c.yaw), ty + dist * Math.sin(c.pitch), c.y + dist * cp * Math.cos(c.yaw));
  if (!G.under) camera.position.y = Math.max(camera.position.y, HH(camera.position.x, camera.position.z) + 3); // kamera nezajede do kopce
  camera.lookAt(c.x, ty, c.y);
  base.position.x = c.x; base.position.z = c.y;
  camera.near = Math.max(0.3, dist / 80); camera.far = dist * 8 + 600; camera.updateProjectionMatrix();
  scene.fog.near = dist * 2.5; scene.fog.far = dist * 7 + 400;
  sun.position.set(c.x + dist * 0.45 + 25, dist * 0.9 + 50, c.y + dist * 0.25 + 15); sun.target.position.set(c.x, 0, c.y);
  const sh = sun.shadow.camera, r = Math.max(30, dist * 0.9);
  sh.left = sh.bottom = -r; sh.right = sh.top = r; sh.near = 1; sh.far = dist * 3 + 300; sh.updateProjectionMatrix();
  G.inside = dist < INSIDE || (!!G.tool && G.tool !== 'hall') || !!G.under; // při stavění uvnitř a pod zemí jsou střechy otevřené
}
const TAG = { miss: (b) => (ITEMS[b.miss] ? 'chybí: ' + ITEMS[b.miss].name.split(' (')[0].toLowerCase() : ''), money: () => 'došly peníze', empty: () => 'vytěženo', staff: () => 'nikdo tu nepracuje',
  broken: (b) => `porucha: oprava ${Math.ceil(b.fix)} h`,
  full: (b) => (!b._sinks ? 'plno: chybí odvoz' : b._sinks.some((x) => x.path) ? 'plno: odběr má dost, veď cestu i do Skladu' : 'plno: chybí cesta, není kam vozit') };
const tagOf = (b) => TAG[b.st]?.(b) ?? (!b._adj?.hub && b.out?.length >= 5 && b._sinks && !b._sinks.some((x) => x.path) ? 'chybí cesta: není kam vozit' : '');
const colorOf = (c) => cols.get(c) ?? (cols.set(c, new THREE.Color(c)), cols.get(c));
const tall = (b) => (b.model ? Math.max(1, proto(b.model).h) : b.k === 'npc' ? 5 : b.k === 'hub' ? (b.dump ? 2.1 : 3.5) : 0.6); // výška rámečku kolem budovy
const fit = (o, x, y, w, h, hgt) => { o.visible = true; o.position.set(x + w / 2, HH(x + w / 2, y + h / 2) + 0.02, y + h / 2); o.scale.set(w + 0.04, hgt, h + 0.04); };
function updateFx(s) {
  const hv = G.hover, t = G.tool;
  for (const o of fx.children) o.visible = false;
  if (G.rect) { const { a, b } = G.rect; fit(rectBox, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x) + 1, Math.abs(a.y - b.y) + 1, t === 'hall' ? WALL : 0.3); }
  else if (hv && t === 'demolish') { const o = at(s, hv.x, hv.y), b = o && !o.hq && o.k !== 'npc' ? o : null; ghost.material.color.set(0xff4d5e); fit(ghost, b ? b.x : hv.x, b ? b.y : hv.y, b ? b.w ?? 1 : 1, b ? b.h ?? 1 : 1, 2); }
  else if (hv && t === 'upgrade') {
    const o = at(s, hv.x, hv.y);
    const up = o && upgradeCost(o), evoOk = o && evolutions(s, o).some((f) => !upgradeModelErr(s, o, f.id));
    const modOk = o && (o.k === 'hub' || o.model) && Object.keys(MODS).some((id) => !hasMod(o, id) && (s.sandbox || s.money >= modCost(o, id)));
    const ok = (up && (s.sandbox || s.money >= up)) || evoOk || modOk;
    ghost.material.color.set(ok ? 0x3fe08a : 0xff4d5e);
    fit(ghost, o ? o.x : hv.x, o ? o.y : hv.y, o ? o.w ?? 1 : 1, o ? o.h ?? 1 : 1, o ? tall(o) : 1.5);
  }
  else if (hv && t) {
    const [w, h] = sizeOf(t, G.rot), x = hv.x - ((w - 1) >> 1), y = hv.y - ((h - 1) >> 1), bad = canPlace(s, t, x, y, G.rot);
    ghost.material.color.set(bad ? 0xff4d5e : 0xffb52e); fit(ghost, x, y, w, h, MODELS[t] ? Math.max(1, proto(t).h) : 0.5);
    if (t === 'belt' || t === 'unloader') { ghostArrow.visible = true; ghostArrow.position.set(x + 0.5, HH(x + 0.5, y + 0.5) + 0.9, y + 0.5); ghostArrow.rotation.y = (-G.rot * Math.PI) / 2; }
    if (MODELS[t]?.reach) { reach.visible = true; reach.position.set(x + (w >> 1) + 0.5, HH(x + (w >> 1) + 0.5, y + (h >> 1) + 0.5), y + (h >> 1) + 0.5); reach.scale.setScalar(MODELS[t].reach); }
  }
  const b = G.sel;
  if ((b && objs.has(b)) || b?.k === 'belt') {
    fit(selBox, b.x, b.y, b.w ?? 1, b.h ?? 1, tall(b));
    selBox.material.color.setHSL(0.1, 1, 0.54 + 0.1 * Math.sin(G.time * 5));
    if (b.model && MODELS[b.model].reach) { const [cx, cy] = centerOf(b); reach.visible = true; reach.position.set(cx + 0.5, HH(cx + 0.5, cy + 0.5), cy + 0.5); reach.scale.setScalar(reachOf(b)); reach.rotation.y = G.time * 0.25; }
  }
  const pl = G.plan; // navržená silnice: začátek v rámečku, trasa jantarově (červeně, když na ni nejsou peníze)
  planMesh.count = 0;
  if (pl) {
    const o = at(s, pl.a.x, pl.a.y);
    fit(rectBox, o ? o.x : pl.a.x, o ? o.y : pl.a.y, o ? o.w ?? 1 : 1, o ? o.h ?? 1 : 1, 0.5);
    (pl.tiles ?? []).slice(0, 4096).forEach(([x, y], i) => planMesh.setMatrixAt(i, M4.makeTranslation(x + 0.5, HH(x + 0.5, y + 0.5) + 0.1, y + 0.5)));
    planMesh.count = Math.min(4096, pl.tiles?.length ?? 0); planMesh.material.color.set(pl.ok ? 0xffb52e : 0xff4d5e); planMesh.instanceMatrix.needsUpdate = true;
  }
  const hb = G.hot;
  if (!t && hb && hb !== b && objs.has(hb)) fit(hotBox, hb.x, hb.y, hb.w ?? 1, hb.h ?? 1, tall(hb)); // bílý rámeček: na tohle klikneš
  if (G.mark) { // značka průvodce: rotující šipka a pulzující rámeček nad místem
    const m = G.mark, p = 1 + Math.sin(G.time * 6) * 0.03; mark.visible = true; mark.position.set(m.x + m.w / 2, HH(m.x + m.w / 2, m.y + m.h / 2), m.y + m.h / 2);
    mark.children[0].position.y = (m.top ?? 2) + 2 + Math.sin(G.time * 5) * 0.5; mark.children[0].rotation.y = G.time * 2.4; mark.children[1].scale.set(m.w * p, m.top ?? 2, m.h * p); mark.children[1].position.set(0, 0.02, 0);
  }
}
function makeScaffold(w, h, top) {
  const g = new THREE.Group();
  const cage = new THREE.LineSegments(GEO.edgeBox, MAT.scafLine);
  cage.scale.set(w + 0.15, top + 0.3, h + 0.15);
  g.add(cage);
  const mast = new THREE.Mesh(GEO.box, MAT.crane);
  mast.scale.set(0.22, top + 1.4, 0.22);
  mast.position.set(w * 0.42, 0, h * 0.42);
  g.add(mast);
  const jib = new THREE.Group();
  jib.position.set(w * 0.42, top + 1.3, h * 0.42);
  const armLen = Math.max(2, Math.min(w, h) * 0.7);
  const arm = new THREE.Mesh(GEO.box, MAT.crane);
  arm.scale.set(armLen, 0.18, 0.18);
  arm.position.set(-armLen * 0.35, -0.09, 0);
  const drop = new THREE.Mesh(GEO.box, MAT.crane);
  drop.scale.set(0.06, 0.9, 0.06);
  drop.position.set(-armLen * 0.7, -0.9, 0);
  jib.add(arm, drop);
  g.add(jib);
  g.userData.crane = jib;
  return g;
}
function emitPlume(x, y, z, col, r0, rise, life) {
  if (plumes.length >= 960) return;
  const a = Math.random() * Math.PI * 2;
  plumes.push({ x, y, z, vx: Math.cos(a) * 0.35 + 0.45, vy: rise, vz: Math.sin(a) * 0.35 - 0.15, col, r0, life, age: 0, rot: a });
}
export function frame3d() {
  const s = G.s, c = G.cam;
  if (s !== cur) { reset(s); cur = s; }
  if (innerWidth !== W || innerHeight !== H) { W = innerWidth; H = innerHeight; renderer.setSize(W, H); camera.aspect = W / H; }
  const dt = Math.min(0.05, Math.max(0.001, G.time - (smokeAt || G.time)));
  smokeAt = G.time;
  const emit = G.time - plumeEmitAt > 0.14;
  if (emit) plumeEmitAt = G.time;
  updateCamera(); syncChunks(s);
  if (s._grev !== grev) { // silnice přes jámu ji zasype; když kolem Skladu vyroste hala, Sklad se změní v regály
    syncGround(s); grev = s._grev; for (const k of pits) s._pit.add(k);
    for (const rk of s._road.keys()) s._pit.add(Math.floor((Math.floor(rk / 65536) - 32768) / CHUNK) + ',' + Math.floor(((rk % 65536) - 32768) / CHUNK)); // pod novou silnicí zmizí stromy a kusy nerostu
    const hq = s.list.find((b) => b.hq), o = hq && objs.get(hq);
    if (o && o.userData.inHall !== isHall(s, hq.x, hq.y)) { things.remove(o); objs.delete(hq); makeObj(hq); }
  }
  if (s._rev !== rev) { syncThings(s); rev = s._rev; }
  // průřez halou: střecha pryč, stěny blíž ke kameře nízké, vzdálené zůstávají celé (i s okny)
  roofMesh.visible = !G.inside;
  wallMesh.forEach((m, d) => { const far = DX[d] * -Math.sin(c.yaw) + DY[d] * -Math.cos(c.yaw) > 0.25; m.scale.y += ((G.under ? 0.02 : !G.inside || far ? 1 : 0.2) - m.scale.y) * 0.25; });
  // pod zemí: povrch zprůhlední a ukážou se patra, která odkryl vrt nebo důl (obnovuje se po 1,5 s)
  const ug = !!G.under;
  if (ug !== wasUnder || (ug && G.time - ugAt > 1.5)) {
    wasUnder = ug; ugAt = G.time; base.visible = !ug;
    scene.background = ug ? UNDER_BG : sky; scene.fog.color.set(ug ? 0x241d17 : SKY_LOW);
    for (const m of chunks.values()) for (const d of m.children) d.visible = !ug; // stromy a balvany pod průhlednou zemí nedávají smysl
    for (const m of [...chunks.values(), floorMesh]) if (m.material.transparent !== ug) { m.material.transparent = ug; m.material.opacity = ug ? 0.28 : 1; m.material.depthWrite = !ug; m.material.needsUpdate = true; }
    if (ug) syncUnder(s);
  }
  under.visible = oreMesh.visible = ug;
  const dist = 900 / c.z;
  const isFar = dist > 140; // z velkého oddálení: zahodit mikroprvky, zobrazit globální značky ložisek
  const isClose = dist < 75; // při velkém přiblížení: skrýt značky ložisek, plné detaily továrny
  const maxViewDist = dist * 1.6 + 55;
  const maxViewDistSq = maxViewDist * maxViewDist;

  // 3D Značky dolů a ložisek (aktivní i volná s odhadem zásob) napříč světem
  if (depositPins.children.length === 0) syncDepositPins(s);
  if (isClose) {
    depositPins.visible = false;
  } else {
    depositPins.visible = true;
    const pinScale = Math.max(0.75, Math.min(3.6, dist * 0.014));
    const maxPinDist = dist * 3.6 + 450;
    for (const pin of depositPins.children) {
      const pd = Math.hypot(pin.userData.x - c.x, pin.userData.y - c.y);
      if (pd > maxPinDist) {
        pin.visible = false;
      } else {
        pin.visible = true;
        pin.scale.setScalar(pinScale);
        if (pin.userData.gem) pin.userData.gem.rotation.y = G.time * 2.2;
      }
    }
  }

  // Dopravníky a položky: při velkém oddálení se mikroprvky zahodí, při přiblížení se ořezávají vzdálené
  if (!ug && arrowMesh) {
    if (isFar || !belts.length) {
      arrowMesh.count = 0;
      arrowMesh.instanceMatrix.needsUpdate = true;
    } else {
      const shift = ((G.time * 1.2) % 0.44) - 0.22;
      let an = 0;
      for (let i = 0; i < belts.length; i++) {
        const b = belts[i];
        if ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 > maxViewDistSq) continue;
        arrowMesh.setMatrixAt(an++, M4.makeRotationY((-b.d * Math.PI) / 2).setPosition(b.x + 0.5 + DX[b.d] * shift, b._h + 0.16, b.y + 0.5 + DY[b.d] * shift));
      }
      arrowMesh.count = an;
      arrowMesh.instanceMatrix.needsUpdate = true;
    }
  }
  let n = 0;
  if (!isFar) {
    for (const b of belts) if (b.it) {
      if ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 > maxViewDistSq) continue;
      const hop = Math.sin(b.p * Math.PI) * 0.04;
      itemMesh.setMatrixAt(n, M4.makeRotationY((-b.d * Math.PI) / 2).setPosition(b.x + 0.5 + DX[b.d] * (b.p - 0.5), 0.3 + (b._h ?? 0) + hop, b.y + 0.5 + DY[b.d] * (b.p - 0.5)));
      itemMesh.setColorAt(n++, colorOf(ITEMS[b.it].col));
    }
  }
  itemMesh.count = n; itemMesh.instanceMatrix.needsUpdate = true; if (itemMesh.instanceColor) itemMesh.instanceColor.needsUpdate = true;
  const info = G.time - infoAt > 1, LS = Math.max(0.3, Math.min(3.2, dist * 0.022)); // LS: popisky mají na obrazovce pořád stejnou výšku
  if (info) infoAt = G.time;
  for (const sp of signs.children) sizeLabel(sp, LS * 1.15);
  for (const [b, o] of objs) {
    const d2 = (o.position.x - c.x) ** 2 + (o.position.z - c.y) ** 2;
    if (d2 > maxViewDistSq) {
      o.visible = false;
      continue;
    }
    o.visible = true;
    const u = o.userData;
    if (isFar) {
      if (u.info) u.info.visible = false;
      if (u.tag) u.tag.visible = false;
      continue;
    }
    if (u.led) {
      u.led.material = MAT.led[b.st] ?? MAT.led.idle;
      const ph = G.time * 4 + o.id * 0.7;
      u.led.scale.setScalar(b.st === 'run' || b.st === 'sink' ? 1 + 0.18 * Math.sin(ph) : (b.st === 'broken' || b.st === 'money' || b.st === 'tape') ? (Math.sin(ph * 2) > 0 ? 1.25 : 0.65) : 1);
    }
    if (b.model) { // nad strojem: růžově, proč stojí; pod tím světle, co má u sebe a jaký je limit (jednou za vteřinu)
      const p = proto(b.model), top = p.h, hh = 0.75 * LS, building = b.build > 0;
      if (building) {
        const prog = Math.max(0.15, 1 - b.build / ((MODELS[b.model].buildDays ?? 1) * 24));
        if (u.body) u.body.scale.y = prog;
        if (u.glass) u.glass.scale.y = prog;
        if (!u.scaf) o.add((u.scaf = makeScaffold(MODELS[b.model].w, MODELS[b.model].h, top)));
        if (u.scaf.userData.crane) u.scaf.userData.crane.rotation.y = G.time * 0.6;
      } else {
        if (u.scaf) { o.remove(u.scaf); u.scaf = null; }
        const vib = b.st === 'run' && b.k === 'machine' ? 1 + Math.sin(G.time * 24 + o.id) * 0.004 : 1;
        if (u.body) u.body.scale.y = vib;
        if (u.glass) u.glass.scale.y = vib;
      }
      if (u.anim) {
        const active = !building && (b.st === 'run' || b.st === 'sink'), t = G.time + (o.id % 17) * 0.4;
        for (const a of u.anim) {
          a.mesh.visible = !building;
          if (!active) continue;
          if (a.kind === 'arm') a.mesh.quaternion.setFromAxisAngle(a.axis, Math.sin(t * 2.2) * 0.16);
          else if (a.kind === 'drillHead') a.mesh.position.copy(a.pivot).addScaledVector(a.axis, Math.sin(t * (b.rc ? 4.4 : 2.2)) * a.span * 0.35);
          else if (a.kind === 'drillRod') a.mesh.quaternion.setFromAxisAngle(a.axis, t * (b.rc ? 14 : 7));
          else if (a.kind === 'sheave0') a.mesh.quaternion.setFromAxisAngle(a.axis, t * 4.5);
          else if (a.kind === 'sheave1') a.mesh.quaternion.setFromAxisAngle(a.axis, -t * 4.5);
        }
      }
      if (emit && !building && !ug && (o.position.x - c.x) ** 2 + (o.position.z - c.y) ** 2 < 160000) {
        if ((b.st === 'run' || b.st === 'sink') && p.vents?.length) {
          for (const v of p.vents) {
            V3.set(v.x, v.y, v.z).applyAxisAngle(UP, o.rotation.y).add(o.position);
            if (v.kind === 'steam') emitPlume(V3.x, V3.y, V3.z, 0xf2f6fa, 1.35, 3.2, 1.8);
            else emitPlume(V3.x, V3.y, V3.z, 0x7c828a, 0.85, 2.5, 2.4);
          }
        } else if (b.st === 'broken') emitPlume(o.position.x, o.position.y + top * 0.75, o.position.z, 0x36393e, 0.95, 2.2, 1.8);
      }
      setLabel(o, 'tag', tagOf(b), '#ff8d98');
      if (info) setLabel(o, 'info', infoOf(s, b), '#e8e6e1');
      if (u.info) { sizeLabel(u.info, LS); u.info.position.y = top + 0.8 + hh * 0.6; u.info.visible = dist < 170; } // z velké dálky by se popisky slily
      if (u.tag) { sizeLabel(u.tag, LS); u.tag.position.y = top + 0.8 + hh * (u.info?.visible ? 1.8 : 0.6); }
    } else if (info && b.k === 'hub') {
      setLabel(o, 'sign', hubTitle(b));
      if (u.sign) u.sign.position.y = b.dump ? 2.7 : 4.2;
    }
    if (b.cur && MODELS[b.model].kind === 'm_miner' && b.model !== 'quarry_hand') { const [cx, cy] = centerOf(b), a = -Math.atan2(b.cur[1] - cy, b.cur[0] - cx) - o.rotation.y; o.rotation.y += Math.atan2(Math.sin(a), Math.cos(a)) * 0.08; } // rypadlo se otáčí tam, kde zrovna kope
  }
  cars.visible = !isFar;
  if (!isFar) syncCars(s);
  smokeMesh.visible = !ug && !isFar;
  if (!ug && !isFar && plumes.length) {
    let sn = 0;
    for (let i = plumes.length - 1; i >= 0; i--) {
      const p = plumes[i];
      p.age += dt;
      if (p.age >= p.life) { plumes[i] = plumes[plumes.length - 1]; plumes.pop(); continue; }
      const f = p.age / p.life, sc = p.r0 * (0.7 + f * 1.8) * (1 - f * f * 0.85);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 0.99;
      M4.makeRotationY(p.rot + p.age * 0.6).scale(S3.setScalar(sc)).setPosition(p.x, p.y, p.z);
      smokeMesh.setMatrixAt(sn, M4); smokeMesh.setColorAt(sn++, colorOf(p.col));
    }
    smokeMesh.count = sn; smokeMesh.instanceMatrix.needsUpdate = true; if (smokeMesh.instanceColor) smokeMesh.instanceColor.needsUpdate = true;
  } else if (smokeMesh.count) smokeMesh.count = 0;
  updateFx(s);
  renderer.render(scene, camera);
}

export function pickDeposit(cx, cy) {
  if (!depositPins.visible) return null;
  aim(cx, cy);
  const hits = ray.intersectObjects(depositPins.children, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData?.dep) o = o.parent;
  return o ? o.userData.dep : null;
}

// ---------------------------------------------------------------- co je pod kurzorem
const aim = (cx, cy) => { ndc.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1); ray.setFromCamera(ndc, camera); };
/** Bod světa na obrazovce (pro zkoušky a značky). */
export function toScreen(x, y, h = 0.5) { const v = new THREE.Vector3(x, h + HH(x, y), y).project(camera); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]; }
/** Dlaždice na zemi pod kurzorem (fx, fy = přesný bod v metrech). */
export function pick(cx, cy) {
  aim(cx, cy);
  const o = ray.ray.origin, d = ray.ray.direction;
  if (d.y >= -1e-4) return null;
  const up = (t) => o.y + d.y * t - HH(o.x + d.x * t, o.z + d.z * t); // jak vysoko nad terénem je paprsek ve vzdálenosti t
  let a = Math.max(0, (o.y - 80) / -d.y), b = a; // nad 80 m žádný kopec není: tam se začíná
  const far = (o.y + 12) / -d.y;
  while (b < far && up(b) > 0) { a = b; b += 2; }
  if (up(b) > 0) return null;
  for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (up(m) > 0) a = m; else b = m; }
  const x = o.x + d.x * b, z = o.z + d.z * b;
  return { x: Math.floor(x), y: Math.floor(z), fx: x, fy: z };
}
/** Budova pod kurzorem: { b } nebo { roof: true }, když kurzor míří na zavřenou střechu haly. */
export function pickThing(cx, cy) {
  aim(cx, cy);
  const h = ray.intersectObjects(roofMesh.visible ? [roofMesh, things] : [things], true).find((i) => !i.object.isSprite);
  if (!h) return null;
  if (h.object === roofMesh) return { roof: true };
  let o = h.object;
  while (o && !o.userData.b) o = o.parent;
  return o ? { b: o.userData.b } : null;
}
