// Simulace hry: stav, stavění, dopravníky, stroje, těžba, sklad a trh. Bez DOM – běží i v testech (node --test).
import { makeWorld, ORES, T, LEVELS, LEVEL_M } from './world.js';
import { MODELS, LOGI, ITEMS, CHIPS, KINDS, HOUR, KWH_USD, SELL, CARS, BUYERS, SPOTS, WAGE as PRICES_WAGE, yieldOf } from '../data/catalog.js';
import { ROUTES, RESEARCH, QUESTS, MISSIONS, FAB, USERS, STARTS, canDo } from '../data/routes.js';

export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // směr d: 0 východ, 1 jih, 2 západ, 3 sever
export const key = (x, y) => (x + 32768) * 65536 + (y + 32768);
export const BELT_SPEED = 6; // dlaždic (metrů) za sekundu
export const DAY = 24 * HOUR;
export const DEPOT_FEE = 2;
export const WIP_CAP = 8; // kolik rozpracovaných dávek jednoho výrobku pustí první stroj trasy do oběhu (jde změnit u stroje)
export const SURF_T = 30, DEEP_T = 150; // zásoba nerostu na 1 m²: povrchová vrstva 10 m, patro pod zemí 50 m (asi 3 t/m³)
const SINK_MH = 1; // hloubení dolu v metrech za hodinu (herní zrychlení; cenu za metr má model stroje)
// Lidé a vylepšení (těžba, pece, hutě). Výkon stroje je za hodinu práce; směna pracuje 8 hodin denně, tři směny jedou nepřetržitě.
// Průměrný výkon za herní hodinu = výkon × (odpracované hodiny / 24) × úroveň. Jedna směna = crew lidí.
export const WAGE_DAY = PRICES_WAGE; // mzda jednoho člověka za osmihodinovou směnu v USD; platí se jen za dny, kdy budova opravdu pracuje
export const UPG = [1.5, 3, 6]; // cena další úrovně v násobcích ceny budovy (herní hodnota); každá úroveň přidá polovinu základního výkonu
export const staffed = (b) => b.staff ?? MODELS[b.model].crew ?? 0;
export const SHIFT_H = 8;
export const hoursOf = (b) => { const c = MODELS[b.model].crew; return c ? Math.min(24, (SHIFT_H * staffed(b)) / c) : 24; }; // kolik hodin denně budova pracuje
export const boost = (b) => (hoursOf(b) / 24) * (1 + 0.5 * (b.lv ?? 0));
export const upgradeCost = (b) => (MODELS[b.model].crew && (b.lv ?? 0) < UPG.length ? Math.round(MODELS[b.model].usd * UPG[b.lv ?? 0]) : null);
const paidUp = (b) => UPG.slice(0, b.lv ?? 0).reduce((a, k) => a + Math.round(MODELS[b.model].usd * k), 0);
export function setStaff(s, b, n) {
  const c = MODELS[b.model]?.crew;
  if (!c) return false;
  b.staff = Math.max(0, Math.min(3 * c, Math.round(n)));
  return true;
}
export function upgrade(s, b) {
  const usd = upgradeCost(b);
  if (!usd || !pay(s, usd, true)) return false;
  b.lv = (b.lv ?? 0) + 1;
  return true;
}
const wage = (s, b, h) => { const w = (WAGE_DAY / 24) * staffed(b) * h; s.money -= w; s._out += w; }; // WAGE_DAY je mzda za jednu osmihodinovou směnu; rozpočítá se do celého dne // jako elektřina: strhává se průběžně, výrobu nezastaví
// Výměna za lepší stroj téhož druhu a stejného půdorysu: platí se rozdíl, hromada, auta i cíl zůstávají. Vrací null, nebo důvod, proč to nejde.
export function swapErr(s, b, id) {
  const f = MODELS[id], m = MODELS[b?.model];
  if (!f || !m || f.kind !== m.kind || f.w !== m.w || f.h !== m.h || f.usd <= m.usd) return 'Vyměnit jde jen za lepší stroj téhož druhu a stejné velikosti';
  if (!unlocked(s, f.req)) return 'Nejdřív odemkni ve Stromu rozvoje';
  return s.sandbox || s.money >= swapCost(b, id) ? null : 'Nedostatek peněz';
}
/** Doplatek za výměnu: rozdíl cen, od kterého se odečte, co stálo vylepšení starého stroje. */
export const swapCost = (b, id) => MODELS[id].usd - MODELS[b.model].usd - paidUp(b);
export const swaps = (s, b) => Object.values(MODELS).filter((f) => { const e = swapErr(s, b, f.id); return e === null || e === 'Nedostatek peněz'; }).sort((x, y) => x.usd - y.usd);
function swap(s, b, id) {
  pay(s, swapCost(b, id), true);
  Object.assign(b, { model: id, lv: 0, staff: undefined, cur: null, _need: null });
  s._rev++; s._dirty = true;
}
export const RESERVE = 20; // kolik tun suroviny si Sklad nechává, když ji spotřebovává nějaká tvoje pec; zbytek prodává
export const PILE = 40; // kolik tun se vejde na hromadu u dolu, než se těžba zastaví
export const needOf = (lvl) => Math.round(1000 * 1.2 ** lvl); // tržba v USD na další bod rozvoje (herní hodnota): každý další bod je o pětinu dražší
const LINE = ['stencil_vxb', 'pnp_lumen', 'reflow_t962a', 'aoi_scope', 'fct_jig']; // linka, kterou do dílny přinese Dílna elektroniky
const START = { pcb_uno: 2, atmega328p: 2, atmega16u2: 2, misc_ic: 8, crystal: 1, mlcc: 1, resistor: 1, conn_small: 12 };

export const defOf = (id) => LOGI[id] ?? MODELS[id];
export const sizeOf = (id, d = 0) => { const f = defOf(id); return d & 1 ? [f.h, f.w] : [f.w, f.h]; };
export const unlocked = (s, req) => !req || s.sandbox || (Array.isArray(req) ? req.some((r) => s.research.includes(r)) : s.research.includes(req));
export const taped = (s, chip) => s.sandbox || !!s.tape[chip];

// ---------------------------------------------------------------- stav
export const levelOf = (s) => MISSIONS.find((l) => l.id === s.level) ?? MISSIONS.at(-1);
export function newGame({ seed = (Math.random() * 1e9) | 0, sandbox = false, level = 'free' } = {}) {
  const L = MISSIONS.find((l) => l.id === level) ?? MISSIONS.at(-1); // úroveň určuje, s čím se začíná
  // Začíná se od mála: Sklad, pár tisíc dolarů, ruční lom, polní cesta, pick-up a malá sklárna. Zbytek odemyká strom rozvoje.
  const s = { v: 3, seed, sandbox, level: L.id, won: false, t: 0, money: sandbox ? 1e12 : L.money, list: [], floor: [], hall: [], road: [], dug: {}, guide: L.guide === 1 ? 0 : null, inv: {}, autoSell: {}, autoBuy: {}, sold: {},
    research: [...L.research], pts: L.pts ?? 0, fix: 1, lvl: 0, xp: 0, out: {}, tape: {}, learn: {}, yieldAvg: {}, made: {}, got: {}, quest: 0, rateIn: 0, rateOut: 0 };
  init(s);
  const hq = { k: 'hub', hq: true, x: -3, y: -3, w: 6, h: 6 };
  s.list.push(hq); occupy(s, hq);
  for (const [t, x, y, mul, name] of SPOTS) { // odběratelé surovin; když je na místě voda, posunou se na nejbližší souš
    const p = spot(s, x, y, 10, 8);
    if (p) { const b = { k: 'npc', t, x: p[0], y: p[1], w: 10, h: 8, mul, name: name ?? BUYERS[t].name }; s.list.push(b); occupy(s, b); }
  }
  if (s.research.includes('smt1')) workshop(s); // úroveň, která začíná už s dílnou
  return s;
}
function spot(s, x0, y0, w, h) { // volné místo na souši i s metrem okolo, aby k budově šla přivést silnice
  const free = (x, y) => { for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if (s._world.terrain(x + i, y + j) === T.WATER || at(s, x + i, y + j) || s._hall.has(key(x + i, y + j))) return false; return true; };
  for (let r = 0; r <= 48; r += 4) for (let dy = -r; dy <= r; dy += 4) for (let dx = -r; dx <= r; dx += 4) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(x0 + dx, y0 + dy)) return [x0 + dx, y0 + dy];
  return null;
}
function workshop(s) { // Dílna elektroniky: hala kolem Skladu, u něj linka na Arduino (zdarma) a díly na první dvě balení
  for (let y = -8; y <= 8; y++) for (let x = -12; x <= 13; x++) if (s._world.terrain(x, y) !== T.WATER) s._hall.add(key(x, y));
  s._grev++;
  for (const it in START) add(s, it, START[it]);
  // pět volných dlaždic v řadě těsně u Skladu: západní strana, jinak východní, severní, jižní; silnice tam ustoupí
  s.line = [[-4, -3, 0, 1], [3, -3, 0, 1], [-3, -4, 1, 0], [-3, 3, 1, 0]].find(([x, y, dx, dy]) => LINE.every((_, i) => !at(s, x + dx * i, y + dy * i))) ?? null;
  if (!s.line) return;
  const [x, y, dx, dy] = s.line;
  LINE.forEach((_, i) => s._road.has(key(x + dx * i, y + dy * i)) && removeGround(s, x + dx * i, y + dy * i));
  const money = s.money;
  s.money = Infinity;
  LINE.forEach((id, i) => place(s, id, x + dx * i, y + dy * i));
  s.money = money;
}
function init(s) {
  s._world = makeWorld(s.seed); s._grid = new Map(); s._floor = new Set(s.floor); s._hall = new Set(s.hall ?? []); s._road = new Map(s.road ?? []); s.dug ??= {}; s._rev = 0;
  s._pit = new Set(); // bloky terénu, kde se od posledního snímku kopalo (3D pohled podle nich prohlubuje jámy)
  for (const k in s.dug) if (k % 8 === 0) pitMark(s, Math.floor(k / 8 / 65536) - 32768, (Math.floor(k / 8) % 65536) - 32768);
  s._grev = 0; s._dirty = true; s._belts = []; s._act = [];
  s._fx = []; s._mt = 0; s._in = 0; s._out = 0; s.tick = 0;
  s.wip = {}; // rozpracované dávky v oběhu podle trasy; počítá se z toho, co ve světě opravdu je
  const cnt = (it) => { const f = it && ITEMS[it]; if (f?.wip) s.wip[f.route] = (s.wip[f.route] ?? 0) + 1; };
  for (const b of s.list) { occupy(s, b); cnt(b.it); for (const it of [...(b.q ?? []), ...(b.out ?? [])]) cnt(it); if (b.job) s.wip[b.job.r] = (s.wip[b.job.r] ?? 0) + 1; }
}
const pitMark = (s, x, y) => { for (const dx of [-1, 1]) for (const dy of [-1, 1]) s._pit.add(Math.floor((x + dx) / 32) + ',' + Math.floor((y + dy) / 32)); }; // i sousední blok, když je dlaždice na kraji
const occupy = (s, b) => { for (let j = 0; j < (b.h ?? 1); j++) for (let i = 0; i < (b.w ?? 1); i++) s._grid.set(key(b.x + i, b.y + j), b); };
export const at = (s, x, y) => s._grid.get(key(x, y));
export const isFloor = (s, x, y) => s._floor.has(key(x, y));
export const serialize = (s) => JSON.stringify({ ...s, floor: [...s._floor], hall: [...s._hall], road: [...s._road] }, (k, v) => (k[0] === '_' ? undefined : v));
export function deserialize(json) {
  const s = JSON.parse(json);
  if (s.v !== 3) throw new Error('Neznámá verze uložené hry');
  s.list = s.list.filter((b) => b.k !== 'npc' || BUYERS[b.t]); // odběratel, kterého katalog už nezná
  if (!s.research.includes('glass0')) s.research.push('glass0');
  if (!s.fix) { s.fix = 1; for (const it in s.autoSell) if (s.autoSell[it] === false && (USERS[it] ?? []).length) s.autoSell[it] = RESERVE; } // starší hra držela suroviny ve Skladu celé; teď si nechává zásobu a zbytek prodává
  s.list = s.list.filter((b) => b.k !== 'machine' && b.k !== 'miner' ? true : !!MODELS[b.model]); // stroj, který už v katalogu není
  // Starší uložená hra může znát položky a trasy, které katalog už nemá: zahodit je, jinak by hra při načtení spadla.
  const known = (o) => { for (const it in o ?? {}) if (!ITEMS[it]) delete o[it]; };
  for (const o of [s.inv, s.autoBuy, s.autoSell, s.sold]) known(o);
  for (const b of s.list) {
    if (b.it && !ITEMS[b.it]) b.it = null;
    if (b.q) b.q = b.q.filter((it) => ITEMS[it]);
    if (b.out) b.out = b.out.filter((it) => ITEMS[it]);
    if (b.job && !ROUTES[b.job.r]?.ops[b.job.i]) b.job = null;
    if (b.prod && !ROUTES[b.prod]) b.prod = null;
    if (b.f && b.f[0] !== '*' && !ITEMS[b.f]) b.f = null;
    if (b.cars) b.cars = b.cars.filter((c) => CARS[c.m] && (!c.it || ITEMS[c.it]));
    known(b.buf);
  }
  init(s);
  return s;
}

// ---------------------------------------------------------------- peníze a sklad
function pay(s, usd, capex = false) {
  if (usd <= 0) return true;
  if (!s.sandbox && s.money < usd) return false;
  s.money -= usd;
  if (!capex) s._out += usd; // investice se do provozních výdajů za den nepočítají
  return true;
}
function earn(s, usd) { // tržby plní i ukazatel k dalšímu bodu rozvoje
  s.money += usd; s._in += usd; s.xp += usd;
  while (s.xp >= needOf(s.lvl)) { s.xp -= needOf(s.lvl); s.lvl++; s.pts++; s._fx.push({ lvl: s.lvl }); }
}
function add(s, it, n = 1) { s.inv[it] = (s.inv[it] ?? 0) + n; }
function deliver(s, hub, it) {
  if (!hub.hq) pay(s, DEPOT_FEE);
  add(s, it); s.got[it] = (s.got[it] ?? 0) + 1;
  // Co nejde použít v žádné odemčené výrobě, je hotový výrobek: prodává se samo, dokud to hráč v Trhu nevypne.
  if (s.autoSell[it] === undefined) s.autoSell[it] = ITEMS[it].sell && (ITEMS[it].cat === 'Suroviny' || !(USERS[it] ?? []).some((r) => unlocked(s, r.req))); // suroviny se prodávají vždy (až na zásobu pro vlastní pec), díly pro odemčenou výrobu zůstávají
}
export const canBuy = (s, it) => ITEMS[it].buy && (!it.startsWith('wl_') || taped(s, it.slice(3)));
export function buy(s, it, q) {
  if (!canBuy(s, it) || q <= 0 || !pay(s, ITEMS[it].usd * q)) return false;
  add(s, it, q);
  if (it.startsWith('wl_')) blendYield(s, CHIPS[it.slice(3)], CHIPS[it.slice(3)].yield0, q); // foundry dodává zralou výtěžnost
  return true;
}
// Tržba za q balení: plná cena do hloubky trhu (balení za den), nad ní cena klesá nepřímo úměrně prodanému množství.
// k = podíl z ceny: Trh platí 85 %, odběratel na mapě svůj násobek (hloubka trhu je společná).
export function revenue(s, it, q, k = SELL) {
  const d = ITEMS[it].depth, a = s.sold[it] ?? 0, b = a + q;
  return ITEMS[it].usd * k * (Math.max(0, Math.min(b, d) - a) + (b > d ? d * Math.log(b / Math.max(a, d)) : 0));
}
export const priceNow = (s, it, k = SELL) => ITEMS[it].usd * k * Math.min(1, ITEMS[it].depth / Math.max(s.sold[it] ?? 0, 1e-9));
function sellTo(s, npc, it, n) { // prodej odběrateli na mapě
  const r = revenue(s, it, n, npc.mul);
  s.sold[it] = (s.sold[it] ?? 0) + n; s.out[it] = (s.out[it] ?? 0) + n; earn(s, r);
  if (s._fx.length < 40) s._fx.push({ it, usd: r });
}
export function sell(s, it, q) {
  q = Math.min(q, Math.floor(s.inv[it] ?? 0));
  if (q <= 0 || !ITEMS[it].sell) return 0;
  const r = revenue(s, it, q);
  s.inv[it] -= q; s.sold[it] = (s.sold[it] ?? 0) + q; earn(s, r);
  if (s._fx.length < 40) s._fx.push({ it, usd: r });
  return r;
}
function market(s, dt) {
  const k = Math.exp(-dt / DAY);
  for (const it in s.sold) s.sold[it] *= k;
  for (const it in s.autoBuy) { const want = s.autoBuy[it] - (s.inv[it] ?? 0); if (want > 0) buy(s, it, Math.min(want, s.sandbox ? want : Math.floor(s.money / ITEMS[it].usd))); }
  for (const it in s.autoSell) if (s.autoSell[it] && !s.autoBuy[it]) sell(s, it, (s.inv[it] ?? 0) - (ITEMS[it].cat === 'Suroviny' && s._act.some((b) => b.k === 'machine' && ROUTES[b.prod]?.ops.some((op) => op.in?.[it])) ? RESERVE : 0)); // surovinu, kterou spotřebovává stojící pec, si Sklad nechává v zásobě
  const a = Math.min(1, dt / (DAY / 4)); // klouzavý průměr příjmů a výdajů v USD za den
  s.rateIn += ((s._in / dt) * DAY - s.rateIn) * a; s.rateOut += ((s._out / dt) * DAY - s.rateOut) * a; s._in = s._out = 0;
  const L = levelOf(s); // úroveň se plní cíli, volnou hru vedou úkoly
  if (L.goals.length) { if (!s.won && L.goals.every((g) => g[1](s))) { s.won = true; s._fx.push({ win: L.id }); } }
  else while (s.quest < QUESTS.length && QUESTS[s.quest][1](s)) { const [, , usd, pts] = QUESTS[s.quest]; s.money += usd; s.pts += pts; s._fx.push({ quest: s.quest, usd, pts }); s.quest++; }
}
// Odemknutí ve stromu rozvoje stojí body, ne peníze.
export function research(s, id) {
  const r = RESEARCH.find((x) => x.id === id);
  if (!r || s.research.includes(id) || !r.req.every((q) => s.research.includes(q)) || (!s.sandbox && s.pts < r.pts)) return false;
  if (!s.sandbox) s.pts -= r.pts;
  s.research.push(id);
  if (id === 'smt1') workshop(s);
  return true;
}
export function tapeout(s, chip) {
  const c = CHIPS[chip];
  if (!c || s.tape[chip] || !unlocked(s, c.req) || !pay(s, c.mask, true)) return false;
  s.tape[chip] = true; s.yieldAvg[chip] ??= c.yield0;
  return true;
}
// Výtěžnost: hustota defektů klesá s počtem zpracovaných waferů (křivka učení), nový proces začíná na šestinásobku.
export const d0Of = (s, process) => FAB[process].d0 * (1 + 5 * Math.exp(-(s.learn[process] ?? 0) / (60 * (FAB[process].lot ?? 25))));
function blendYield(s, c, y, lots = 1) { const p = s.yieldAvg[c.id], w = Math.min(1, 0.3 * lots); s.yieldAvg[c.id] = p == null ? y : p + (y - p) * w; }

// ---------------------------------------------------------------- stavění
const indoor = (f) => !!f.kind && KINDS[f.kind].cat !== 'Suroviny'; // výrobní stroje patří do haly, těžba a hutě stojí venku
export const isHall = (s, x, y) => s._hall.has(key(x, y));
/** Výška, ve které budova stojí: terén se pod ní srovná na výšku jejího středu. */
export const baseOf = (s, b) => s._world.height(b.x + (b.w ?? 1) / 2, b.y + (b.h ?? 1) / 2);
export function canPlace(s, id, x, y, d = 0) {
  const f = defOf(id), [w, h] = sizeOf(id, d), over = at(s, x, y);
  if (over?.model && MODELS[id] && over.model !== id && over.x === x && over.y === y && KINDS[f.kind] === KINDS[MODELS[over.model].kind]) return swapErr(s, over, id); // lepší stroj přes horší = výměna
  if (!unlocked(s, f.req)) return 'Nejdřív odemkni ve Stromu rozvoje';
  if (!s.sandbox && s.money < roadCost(s, f, x, y)) return 'Nedostatek peněz';
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i, Y = y + j, o = at(s, X, Y), k = key(X, Y);
    if (s._world.terrain(X, Y) === T.WATER && !f.road) return 'Na vodě stavět nejde';
    if (s.dug[k * 8] > 0 && !f.road) return 'V jámě po těžbě stavět nejde'; // silnice jámu zasype: lom si jinak odkope místo, kudy má vést cesta
    if (f.road) { if (o) return 'Obsazeno'; if ((s._road.get(k) ?? 0) >= f.road) return 'Taková silnice tu už je'; continue; }
    if (s._road.has(k) && id !== 'hall') return 'Na silnici stavět nejde'; // hala může stát nad silnicí: auta do ní vjíždějí vraty
    if (id === 'hall') { if (s._hall.has(k)) return 'Hala tu už stojí'; if (Math.max(s._world.height(X, Y), s._world.height(X + 1, Y + 1), s._world.height(X + 1, Y), s._world.height(X, Y + 1)) > 0.05) return 'Halu jde postavit jen na rovině'; continue; }
    if (id === 'floor') { if (!s._hall.has(k)) return 'Čistý prostor jde postavit jen v hale'; if (s._floor.has(k)) return 'Čistý prostor tu už je'; continue; }
    if (o && !(id === 'belt' && o.k === 'belt')) return 'Obsazeno';
    if (indoor(f) && !s._hall.has(k)) return 'Výrobní stroj musí stát v hale';
    if (f.clean && !s._floor.has(k)) return 'Stroj musí stát celý v čistém prostoru';
  }
  if (f.kind === 'm_miner' && !findOre(s, x + (w >> 1), y + (h >> 1), f.reach, 0, 0)) return 'V dosahu rypadla není žádné ložisko';
  return null;
}
// Pec a hutě umějí jedinou věc: rovnou ji vyrábějí, nemusí se nic volit.
const soleRoute = (s, f) => { const l = KINDS[f.kind].cat === 'Suroviny' ? (STARTS[f.kind] ?? []).filter((r) => unlocked(s, ROUTES[r].req)) : []; return l.length === 1 ? l[0] : null; };
export function place(s, id, x, y, d = 0) {
  const err = canPlace(s, id, x, y, d);
  if (err) return { err };
  const over = at(s, x, y);
  if (over?.model && MODELS[id] && over.model !== id) { swap(s, over, id); return { b: over }; }
  const f = defOf(id), [w, h] = sizeOf(id, d);
  if (f.road) { pay(s, roadCost(s, f, x, y), true); s._road.set(key(x, y), f.road); s._grev++; return {}; }
  if (id === 'floor' || id === 'hall') { pay(s, f.usd, true); (id === 'floor' ? s._floor : s._hall).add(key(x, y)); s._grev++; return {}; }
  const old = at(s, x, y);
  if (old) { old.d = d; s._dirty = true; s._rev++; return { b: old }; } // dopravník přes dopravník = jen otočení
  pay(s, f.usd, true);
  const b = id === 'belt' ? { k: 'belt', x, y, d, it: null, p: 0 }
    : id === 'junction' || id === 'splitter' ? { k: id, x, y, rr: 0 }
    : id === 'sorter' ? { k: 'sorter', x, y, f: null, rr: 0 }
    : id === 'unloader' ? { k: 'unloader', x, y, d, f: null }
    : id === 'depot' ? { k: 'hub', hq: false, x, y, w, h }
    : f.reach ? { k: 'miner', model: id, x, y, w, h, d, acc: 0, out: [], rr: 0, oi: 0, cur: null, dep: 0, goal: 1, st: 'run', cars: [], to: null } // lom, rypadlo, vrt, hlubinný důl; cars = auta, to = kam vozí
    : { k: 'machine', model: id, x, y, w, h, d, prod: soleRoute(s, f), cars: [], to: null, q: [], buf: {}, acc: {}, job: null, out: [], busy: 0, st: 'idle', rr: 0 };
  s.list.push(b); occupy(s, b); s._dirty = true; s._rev++;
  return { b };
}
// Zbourání vrací plnou cenu a díly ze stroje do skladu Centrály; rozpracované dávky propadají.
export function remove(s, b) {
  if (!b || b.hq || b.k === 'npc') return false;
  const id = b.k === 'machine' || b.k === 'miner' ? b.model : b.k === 'hub' ? 'depot' : b.k;
  s.money += defOf(id).usd + (b.model ? paidUp(b) : 0); // i vylepšení se vrací v plné ceně
  for (const c of b.cars ?? []) if (c.n) add(s, c.it, c.n); // náklad aut se vrátí do skladu
  for (const it of [b.it, ...(b.q ?? []), ...(b.out ?? [])]) if (it) { if (ITEMS[it].wip) s.wip[ITEMS[it].route]--; else add(s, it); }
  if (b.job) s.wip[b.job.r]--;
  for (const it in b.buf ?? {}) if (b.buf[it] >= 1) add(s, it, Math.floor(b.buf[it]));
  s.list.splice(s.list.indexOf(b), 1);
  for (let j = 0; j < (b.h ?? 1); j++) for (let i = 0; i < (b.w ?? 1); i++) s._grid.delete(key(b.x + i, b.y + j));
  s._dirty = true; s._rev++;
  return true;
}
// Zbourání podlahy pod prázdnou dlaždicí: silnice, jinak nejdřív čistý prostor, pak hala. Vrací plnou cenu.
export function removeGround(s, x, y) {
  const k = key(x, y), id = s._road.has(k) ? 'road' + s._road.get(k) : s._floor.has(k) ? 'floor' : s._hall.has(k) ? 'hall' : null;
  if (!id || at(s, x, y)) return false;
  (LOGI[id].road ? s._road : id === 'floor' ? s._floor : s._hall).delete(k); s.money += LOGI[id].usd * (LOGI[id].road ? wet(s, x, y) : 1); s._grev++;
  return true;
}
// Cena stavby. Silnice přes horší silnici stojí jen rozdíl; přes vodu vede jako násep za desetinásobek (herní hodnota).
const wet = (s, x, y) => (s._world.terrain(x, y) === T.WATER ? 10 : 1);
const roadCost = (s, f, x, y) => (f.road ? (f.usd - (s._road.has(key(x, y)) ? LOGI['road' + s._road.get(key(x, y))].usd : 0)) * wet(s, x, y) : f.usd);
// Sousedé strojů: dopravníky podél stroje (inB), z nich ty, které nemíří do stroje (outB), sousední stroje a sklad.
function rebuild(s) {
  s._dirty = false;
  s._belts = s.list.filter((b) => b.k === 'belt');
  s._act = s.list.filter((b) => b.k === 'machine' || b.k === 'miner' || b.k === 'unloader');
  for (const b of s._act) {
    const A = { inB: [], outB: [], mach: [], hub: null, npc: null }, seen = new Set(), w = b.w ?? 1, h = b.h ?? 1;
    const visit = (x, y, d) => {
      const n = at(s, x, y);
      if (!n || seen.has(n)) return;
      seen.add(n);
      if (n.k === 'belt') { A.inB.push(n); if (n.d !== ((d + 2) & 3)) A.outB.push(n); } else if (n.k === 'machine') A.mach.push(n); else if (n.k === 'hub') A.hub = n; else if (n.k === 'npc') A.npc = n;
    };
    for (let i = 0; i < w; i++) { visit(b.x + i, b.y - 1, 3); visit(b.x + i, b.y + h, 1); }
    for (let j = 0; j < h; j++) { visit(b.x - 1, b.y + j, 2); visit(b.x + w, b.y + j, 0); }
    b._adj = A; b._need = null;
  }
}

// ---------------------------------------------------------------- dopravníky
// Vložení položky do budovy ve směru pohybu dir. Křížení, třídič a rozdělovač položku nedrží, jen ji pošlou dál.
function insert(s, t, it, dir, depth = 0) {
  const fwd = (d2) => { const n = at(s, t.x + DX[d2], t.y + DY[d2]); return !!n && depth < 8 && insert(s, n, it, d2, depth + 1); };
  switch (t.k) {
    case 'belt': if (t.it || t.d === ((dir + 2) & 3)) return false; t.it = it; t.p = 0; return true;
    case 'junction': return fwd(dir);
    case 'sorter': {
      const hit = t.f && (it === t.f || (t.f === '*wip' && ITEMS[it].wip) || (t.f === '*done' && !ITEMS[it].wip));
      if (hit) return fwd(dir);
      t.rr ^= 1;
      return fwd((dir + (t.rr ? 1 : 3)) & 3) || fwd((dir + (t.rr ? 3 : 1)) & 3);
    }
    case 'splitter': {
      const ds = [dir, (dir + 1) & 3, (dir + 3) & 3];
      for (let i = 0; i < 3; i++) if (fwd(ds[(t.rr + i) % 3])) { t.rr = (t.rr + i + 1) % 3; return true; }
      return false;
    }
    case 'hub': if (ITEMS[it].wip) return false; deliver(s, t, it); return true; // rozpracované dávky sklad nebere, musí dojet ke stroji
    case 'npc': if (!takes(t, it)) return false; sellTo(s, t, it, 1); return true;
    case 'machine': return feed(s, t, it);
    default: return false;
  }
}
function stepBelts(s, dt) {
  const adv = BELT_SPEED * dt, tk = s.tick, belts = s._belts;
  for (let i = 0; i < belts.length; i++) { const b = belts[i]; if (b.it && b.p < 1) b.p = Math.min(1, b.p + adv); }
  for (let i = 0; i < belts.length; i++) { const b = belts[i]; if (b.it && b.p >= 1 && b._mk !== tk) resolve(s, b, tk); }
}
// Kolona položek stojících na konci dlaždic: když může odjet první, posune se celá; uzavřená smyčka se pootočí.
function resolve(s, b0, tk) {
  const stack = [];
  let b = b0, moved = false;
  for (;;) {
    b._mk = tk; stack.push(b);
    const t = at(s, b.x + DX[b.d], b.y + DY[b.d]);
    if (!t) break;
    if (t.k !== 'belt') { moved = insert(s, t, b.it, b.d); break; }
    if (t.d === ((b.d + 2) & 3)) break;
    if (!t.it) { t.it = b.it; t.p = 0; moved = true; break; }
    if (t.p < 1) break;
    if (t._mk === tk) {
      const ci = stack.indexOf(t);
      if (ci >= 0) {
        const last = stack[stack.length - 1].it;
        for (let j = stack.length - 1; j > ci; j--) { stack[j].it = stack[j - 1].it; stack[j].p = 0; }
        stack[ci].it = last; stack[ci].p = 0;
      }
      break;
    }
    b = t;
  }
  if (!moved) return;
  let i = stack.length - 1;
  stack[i].it = null;
  for (i--; i >= 0; i--) { const q = stack[i], n = stack[i + 1]; n.it = q.it; n.p = 0; q.it = null; }
}

// ---------------------------------------------------------------- stroje
// Co stroj potřebuje mít u sebe: fyzické vstupy kroků, které má ve frontě, které zahajuje, nebo které dělal naposled.
const bulk = (m) => KINDS[MODELS[m.model].kind].u === 't'; // stroje na sypké suroviny: větší zásoba vstupů i hromada výrobků
function needs(m) {
  if (m._need) return m._need;
  const need = {};
  const k = bulk(m) ? 24 : 2; // pece a hutě mají u sebe zásobu na den, ostatní stroje na dvě dávky
  const addOp = (op) => { for (const it in op?.in ?? {}) need[it] = Math.max(need[it] ?? 0, Math.ceil(op.in[it] * k)); };
  for (const w of m.q) addOp(ROUTES[ITEMS[w].route].ops[ITEMS[w].step]);
  if (m.prod) addOp(ROUTES[m.prod]?.ops[0]);
  if (m.last) addOp(ROUTES[m.last[0]]?.ops[m.last[1]]);
  return (m._need = need);
}
function wants(m, it) {
  const f = ITEMS[it];
  if (f.wip) { const r = ROUTES[f.route]; return m.q.length < 2 && canDo(MODELS[m.model], r, r.ops[f.step]); }
  const n = needs(m)[it];
  return n !== undefined && (m.buf[it] ?? 0) < n;
}
function feed(s, m, it) {
  if (!wants(m, it)) return false;
  if (ITEMS[it].wip) { m.q.push(it); m._need = null; } else m.buf[it] = (m.buf[it] ?? 0) + 1;
  return true;
}
function pull(s, m) {
  const A = m._adj;
  for (const t of A.inB) if (t.it && feed(s, m, t.it)) t.it = null;
  if (!A.hub) return;
  const need = needs(m), fee = A.hub.hq ? 0 : DEPOT_FEE;
  for (const it in need) while ((m.buf[it] ?? 0) < need[it] && (s.inv[it] ?? 0) >= 1 && pay(s, fee)) { s.inv[it] -= 1; m.buf[it] = (m.buf[it] ?? 0) + 1; }
}
// Výstup: rozpracovaná dávka jde do sousedního stroje nebo na dopravník; hotová položka nejdřív do sousedního skladu.
function emit(s, b) {
  const it = b.out[0], A = b._adj;
  const toM = () => A.mach.some((n) => feed(s, n, it));
  const toB = () => {
    for (let j = 0; j < A.outB.length; j++) { const t = A.outB[(b.rr + j) % A.outB.length]; if (!t.it) { t.it = it; t.p = 0.5; b.rr = (b.rr + j + 1) % A.outB.length; return true; } }
    return false;
  };
  const toH = () => (!!A.hub && (deliver(s, A.hub, it), true)) || (!!A.npc && takes(A.npc, it) && (sellTo(s, A.npc, it, 1), true)); // sklad, nebo odběratel hned vedle
  if (ITEMS[it].wip ? toM() || toB() : toH() || toM() || toB()) b.out.shift();
}
const lacking = (m, op) => { for (const it in op.in ?? {}) if ((m.buf[it] ?? 0) < op.in[it] - 1e-9) return it; return null; };
function begin(s, m, r, i) {
  const op = r.ops[i], md = MODELS[m.model];
  if (!pay(s, op.opex)) { m.st = 'money'; return false; }
  for (const it in op.in ?? {}) m.buf[it] -= op.in[it];
  if (i === 0) s.wip[r.id] = (s.wip[r.id] ?? 0) + 1;
  m.job = { r: r.id, i, t: 0, T: (op.h / ((md.rate * boost(m)) / KINDS[md.kind].ref)) * HOUR };
  m.last = [r.id, i]; m._need = null; m.st = 'run';
  return true;
}
function start(s, m) {
  let miss = null;
  for (let qi = 0; qi < m.q.length; qi++) {
    const f = ITEMS[m.q[qi]], r = ROUTES[f.route], lack = lacking(m, r.ops[f.step]);
    if (lack) { miss ??= lack; continue; }
    if (begin(s, m, r, f.step)) m.q.splice(qi, 1);
    return;
  }
  const r = ROUTES[m.prod];
  if (r) {
    if (r.tape && !taped(s, r.tape)) { m.st = 'tape'; return; }
    if ((s.wip[r.id] ?? 0) >= (m.cap ?? WIP_CAP)) { m.st = miss ? 'miss' : 'cap'; m.miss = miss; return; } // dost dávek v oběhu: smyčka se nesmí ucpat
    const lack = lacking(m, r.ops[0]);
    if (!lack) { begin(s, m, r, 0); return; }
    miss ??= lack;
  }
  m.st = miss ? 'miss' : 'idle'; m.miss = miss;
}
function produce(s, m, it, q) {
  m.acc[it] = (m.acc[it] ?? 0) + q;
  const n = Math.floor(m.acc[it] + 1e-9);
  m.acc[it] -= n; s.made[it] = (s.made[it] ?? 0) + n;
  for (let j = 0; j < n; j++) m.out.push(it);
}
function finish(s, m) {
  const r = ROUTES[m.job.r], i = m.job.i;
  m.job = null;
  if (i + 1 < r.ops.length) { m.out.push(`w:${r.id}:${i + 1}`); return; }
  s.wip[r.id] = Math.max(0, (s.wip[r.id] ?? 1) - 1);
  const c = CHIPS[r.chip];
  if (r.cat === 'fab') { // test na waferu: výtěžnost lotu podle hustoty defektů a plochy čipu
    blendYield(s, c, Math.min(1, yieldOf(c.die, d0Of(s, c.process)) * (0.92 + 0.16 * Math.random())));
    s.learn[c.process] = (s.learn[c.process] ?? 0) + c.lot;
    produce(s, m, 'wl_' + c.id, 1);
  } else if (r.cat === 'pkg') produce(s, m, c.id, (c.gross * (s.yieldAvg[c.id] ?? c.yield0)) / 100);
  else for (const it in r.out) produce(s, m, it, r.out[it]);
}
function stepMachine(s, m, dt) {
  if (m.out.length) emit(s, m);
  pull(s, m);
  if (m.job) {
    m.job.t += dt; m.st = 'run';
    const kwh = (MODELS[m.model].kw * dt) / HOUR * KWH_USD;
    s.money -= kwh; s._out += kwh;
    if (MODELS[m.model].crew) wage(s, m, dt / HOUR);
    if (m.job.t >= m.job.T) finish(s, m);
  } else if (MODELS[m.model].crew && !staffed(m)) m.st = 'staff';
  else if (m.out.length < (bulk(m) ? PILE : 4)) start(s, m);
  else m.st = 'full';
  m.busy += ((m.job ? 1 : 0) - m.busy) * Math.min(1, dt / (6 * HOUR));
  if (bulk(m)) stepCars(s, m, dt);
}
// ---------------------------------------------------------------- těžba: zásoby jsou konečné, hlouběji je víc a dráž
export const left = (s, x, y, l = 0) => (l ? DEEP_T : SURF_T) - (s.dug[key(x, y) * 8 + l] ?? 0);
export const oreAt = (s, x, y, l = 0) => { const o = l ? s._world.deep(x, y, l) : s._world.ore(x, y); return o && left(s, x, y, l) > 0 ? o : 0; };
export const centerOf = (b) => [b.x + (b.w >> 1), b.y + (b.h >> 1)];
// Nejbližší dlaždice s nevytěženým nerostem v okruhu R v patře l (oi = jen tento nerost, 0 = jakýkoli).
function findOre(s, cx, cy, R, l, oi) {
  let best = null, bd = R * R + 1;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d >= bd) continue;
    const o = oreAt(s, x, y, l);
    if (o && (!oi || o === oi) && (l || !(at(s, x, y) || s._hall.has(key(x, y)) || s._road.has(key(x, y))))) { best = [x, y, o]; bd = d; } // pod budovami, halami a silnicemi se na povrchu nekope
  }
  return best;
}
// Zásoby v okruhu R v patře l: { index nerostu: tuny }.
export function survey(s, cx, cy, R, l) {
  const sum = {};
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    const o = (x - cx) ** 2 + (y - cy) ** 2 <= R * R && oreAt(s, x, y, l);
    if (o) sum[o] = (sum[o] ?? 0) + left(s, x, y, l);
  }
  return sum;
}
function stepMiner(s, b, dt) {
  const md = MODELS[b.model], [cx, cy] = centerOf(b), h = dt / HOUR;
  if (b.out.length) emit(s, b);
  if (md.kind === 'm_drill') { // vrt jde dolů a odkrývá patro po patru
    if (b.dep >= md.maxLv * LEVEL_M) { b.st = 'done'; return; }
    if (pay(s, KINDS.m_drill.opex * md.rate * h)) { b.dep += md.rate * h; b.st = 'run'; } else b.st = 'money';
    return;
  }
  let l = 0, opex = KINDS.m_miner.opex;
  if (md.kind === 'm_shaft') {
    if (b.dep < b.goal * LEVEL_M) { if (pay(s, md.sink * SINK_MH * h)) { b.dep += SINK_MH * h; b.st = 'sink'; } else b.st = 'money'; return; }
    l = b.goal; opex = KINDS.m_shaft.opex * (1 + l / 2); // hlouběji je těžba dražší: doprava nahoru, větrání, čerpání vody
  }
  if (b.out.length >= PILE) { b.st = 'full'; return; }
  if (!b.cur || left(s, b.cur[0], b.cur[1], l) <= 0) { // dlaždice je vytěžená: další nejbližší, nejdřív stejný nerost
    const t = (b.oi && findOre(s, cx, cy, md.reach, l, b.oi)) || findOre(s, cx, cy, md.reach, l, 0);
    if (!t) { b.cur = null; b.st = 'empty'; return; }
    b.cur = [t[0], t[1]]; b.oi = t[2];
  }
  if (md.crew && !staffed(b)) { b.st = 'staff'; return; }
  b.st = 'run'; b.acc += md.rate * boost(b) * h; wage(s, b, h);
  if (b.acc < 1) return;
  if (!pay(s, opex)) { b.acc = 1; b.st = 'money'; return; }
  const k = key(b.cur[0], b.cur[1]) * 8 + l, it = ORES[b.oi].id;
  b.acc -= 1; s.dug[k] = (s.dug[k] ?? 0) + 1; b.out.push(it); s.made[it] = (s.made[it] ?? 0) + 1;
  b.wacc = (b.wacc ?? 0) + (ORES[b.oi].waste ?? 0); // s nerostem se vykope i hlušina; musí se odvézt stejně jako nerost
  while (b.wacc >= 1) { b.wacc -= 1; b.out.push('spoil'); s.made.spoil = (s.made.spoil ?? 0) + 1; }
  if (!l) pitMark(s, b.cur[0], b.cur[1]); // na povrchu po těžbě zůstává jáma
}
function stepUnloader(s, u) {
  const hub = u._adj.hub, tgt = at(s, u.x + DX[u.d], u.y + DY[u.d]), it = u.f;
  if (!hub || !tgt || !it || (s.inv[it] ?? 0) < 1 || (!hub.hq && s.money < DEPOT_FEE && !s.sandbox) || !insert(s, tgt, it, u.d)) return;
  s.inv[it] -= 1;
  if (!hub.hq) pay(s, DEPOT_FEE);
}

// ---------------------------------------------------------------- silnice a auta: auto patří dolu a vozí z jeho hromady k odběrateli nebo do skladu
/** Co budova přijme: odběratel jen svoje suroviny, stroj vstupy své výroby, sklad vše kromě rozpracovaných dávek. */
export const takes = (t, it) => (t?.k === 'npc' ? BUYERS[t.t].buys.includes(it) : t?.k === 'machine' ? needs(t)[it] !== undefined : t?.k === 'hub' && !ITEMS[it].wip);
const around = (b) => { // dlaždice kolem půdorysu budovy
  const r = [];
  for (let i = 0; i < b.w; i++) r.push([b.x + i, b.y - 1], [b.x + i, b.y + b.h]);
  for (let j = 0; j < b.h; j++) r.push([b.x - 1, b.y + j], [b.x + b.w, b.y + j]);
  return r;
};
/** Cesta po silnici od budovy a k budově b: pole dlaždic [x, y], nebo null, když silnice nevede. */
export function pathOf(s, a, b) { // shortcut: nejkratší cesta podle počtu dlaždic, ne podle času; přepsat na Dijkstru, až budou sítě silnic různých tříd
  if (!a || !b) return null;
  const goal = new Set(around(b).map(([x, y]) => key(x, y)).filter((k) => s._road.has(k))), prev = new Map(), q = [];
  for (const [x, y] of around(a)) { const k = key(x, y); if (s._road.has(k) && !prev.has(k)) { prev.set(k, -1); q.push(k); } }
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    if (goal.has(k)) { const p = []; for (let c = k; c !== -1; c = prev.get(c)) p.push([Math.floor(c / 65536) - 32768, (c % 65536) - 32768]); return p.reverse(); }
    for (const d of [65536, -65536, 1, -1]) if (s._road.has(k + d) && !prev.has(k + d)) { prev.set(k + d, k); q.push(k + d); }
  }
  return null;
}
/** Kam může důl nebo pec vozit, co vyrábí: [{ t: budova, it, usd: cena teď (u vlastního stroje 0), path }]. Napřed místa, kam vede silnice; z nich vlastní výroba, pak podle ceny. */
export function sinks(s, b) {
  const its = b.k === 'miner' ? [ORES[b.oi]?.id, ORES[b.oi]?.waste ? 'spoil' : null].filter(Boolean) : Object.keys(ROUTES[b.prod]?.out ?? {}); // důl vozí nerost i hlušinu
  return its.flatMap((it) => s.list.filter((t) => t !== b && takes(t, it)).map((t) => ({ t, it, usd: t.k === 'machine' ? 0 : priceNow(s, it, t.k === 'npc' ? t.mul : SELL), path: pathOf(s, b, t) })))
    .sort((x, y) => !!y.path - !!x.path || (y.t.k === 'machine') - (x.t.k === 'machine') || y.usd - x.usd);
}
/** Návrh silnice mezi dvěma dlaždicemi: co nejlevněji a co nejrovněji, kolem budov; hotová silnice se použije zadarmo. Stojí-li na dlaždici budova, vede cesta těsně k ní. Vrací { tiles, usd } nebo null. */
export function planRoad(s, id, a, b) {
  const f = LOGI[id], oa = at(s, a.x, a.y), ob = at(s, b.x, b.y);
  if (oa && oa === ob) return null;
  const ends = (o, p) => (o ? around(o).filter(([x, y]) => !at(s, x, y)) : [[p.x, p.y]]);
  const A = ends(oa, a), B = ends(ob, b), goal = new Set(B.map(([x, y]) => key(x, y)));
  if (!A.length || !B.length) return null;
  const xs = [...A, ...B].map((p) => p[0]), ys = [...A, ...B].map((p) => p[1]), x0 = Math.min(...xs) - 14, x1 = Math.max(...xs) + 14, y0 = Math.min(...ys) - 14, y1 = Math.max(...ys) + 14;
  const usd = (x, y) => ((s._road.get(key(x, y)) ?? 0) >= f.road ? 0 : roadCost(s, f, x, y));
  const best = new Map(), from = new Map(), heap = []; // Dijkstra nad stavem (dlaždice, směr příjezdu): zatáčka něco stojí, proto vychází rovné úseky
  const push = (c, st, p) => {
    if (c >= (best.get(st) ?? Infinity)) return;
    best.set(st, c); from.set(st, p);
    let i = heap.push([c, st]) - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
    return top;
  };
  const xy = (st) => { const k = Math.floor(st / 5); return [Math.floor(k / 65536) - 32768, (k % 65536) - 32768, k]; };
  for (const [x, y] of A) push(usd(x, y) / f.usd + 0.02, key(x, y) * 5 + 4, -1);
  while (heap.length) {
    const [c, st] = pop();
    if (c > best.get(st)) continue;
    const [x, y, k] = xy(st), d0 = st % 5;
    if (goal.has(k)) { const tiles = []; for (let q = st; q !== -1; q = from.get(q)) tiles.push(xy(q).slice(0, 2)); tiles.reverse(); return { tiles, usd: tiles.reduce((sum, [tx, ty]) => sum + usd(tx, ty), 0) }; }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || at(s, nx, ny)) continue;
      push(c + usd(nx, ny) / f.usd + 0.02 + (d0 !== 4 && d0 !== d ? 0.4 : 0), key(nx, ny) * 5 + d, st);
    }
  }
  return null;
}
/** Postaví navrženou silnici. Když na celou nejsou peníze, nepostaví nic. */
export function buildRoad(s, id, plan) {
  if (!plan?.tiles?.length || (!s.sandbox && s.money < plan.usd)) return false;
  for (const [x, y] of plan.tiles) if (!canPlace(s, id, x, y)) place(s, id, x, y);
  return true;
}
// Auta se nekupují: jezdí sama, jakmile od budovy vede silnice k nějakému cíli. Typ auta je nejlepší odemčený; když hromada roste a všechna auta jsou pryč, přibude další.
export const MAXCARS = 4;
const bestCar = (s) => ['car_dump', 'car_truck', 'car_pickup'].find((id) => unlocked(s, CARS[id].req)) ?? 'car_pickup';
/** Zásoba vstupů, kterou u sebe stroj drží: { položka: nejvýš kolik }. */
export const capOf = (m) => needs(m);
// Kolik zboží už k budově veze jiné auto (aby se k plné peci neposílala další).
const incoming = (s, t, it) => { let n = 0; for (const b of s._act) for (const c of b.cars ?? []) if (c.dir > 0 && c.it === it && c.to && at(s, c.to[0], c.to[1]) === t) n += c.n; return n; };
// Kam s nákladem, rozhoduje se před každou jízdou: nejdřív vlastní výroba, která má na surovinu místo, pak nejlépe platící sklad nebo odběratel.
// Ručně zvolený cíl platí, pokud k němu vede silnice a náklad bere. Když je všude plno, auto čeká u zdroje.
function pickDst(s, b, it) {
  const list = b._sinks.filter((x) => x.path && x.it === it);
  const room = (t) => t.k !== 'machine' || (t.buf[it] ?? 0) + incoming(s, t, it) < needs(t)[it];
  const hand = b.auto === false && b.to && list.find((x) => x.t === at(s, b.to[0], b.to[1]));
  if (hand) return room(hand.t) ? hand : null;
  return list.find((x) => x.t.k === 'machine' && room(x.t)) ?? list.find((x) => x.t.k !== 'machine') ?? null;
}
// Pruh = dlaždice + směr jízdy. V pruhu je místo pro jedno auto, takže auta jedou za sebou a protisměr se míjí.
function cellOf(path, i, dir) {
  const end = path.length - 1, j = i + dir, ahead = j >= 0 && j <= end, a = path[i], b = path[ahead ? j : Math.max(0, Math.min(end, i - dir))], k = ahead ? 1 : -1; // na konci cesty se směr bere z posledního úseku
  const dx = (b[0] - a[0]) * k, dy = (b[1] - a[1]) * k;
  return key(a[0], a[1]) * 4 + (dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3);
}
function enter(s, c, path, i) { // smí auto do pruhu na dlaždici i? když ano, zabere ho
  const cell = cellOf(path, i, c.dir), o = s._occ.get(cell);
  if (o && o !== c) return false;
  if (s._occ.get(c._cell) === c) s._occ.delete(c._cell);
  s._occ.set(cell, c); c._cell = cell;
  return true;
}
function traffic(s) { // kde která auta zrovna jedou (stojící u budov pruh neblokují)
  s._occ = new Map();
  for (const b of s._act) for (const c of b.cars ?? []) if (c.dir && c._path && !(c.dir > 0 && c.p >= c._path.length - 1)) { c._cell = cellOf(c._path, Math.max(0, Math.min(c._path.length - 1, Math.round(c.p))), c.dir); s._occ.set(c._cell, c); }
}
function stepCars(s, b, dt) {
  if (b._adj?.hub || b._adj?.npc) return; // stojí těsně u skladu nebo odběratele: předává rovnou, auta nepotřebuje
  const sv = `${s._grev}:${s._rev}:${b.oi ?? b.prod}`;
  if (b._sv !== sv) { b._sv = sv; b._sinks = sinks(s, b); for (const c of b.cars ?? []) c._path = null; } // změnila se síť silnic nebo budovy: cíle a cesty znovu
  const cars = (b.cars ??= []);
  if (b._sinks.some((x) => x.path) && (cars.length ? cars.length < MAXCARS && b.out.length >= 2 * CARS[cars[0].m].cap + 4 && cars.every((c) => c.dir !== 0) : b.out.length >= 2)) cars.push({ m: bestCar(s), p: 0, dir: 0, n: 0, it: null }); // p = poloha na cestě, dir: 0 stojí u zdroje, 1 jede s nákladem, −1 se vrací
  for (const c of cars) {
    if (c.dir === 0) { // u zdroje nakládá jeden druh zboží, pro který existuje cíl; odjede plné, se zbytkem z vytěženého ložiska, nebo po čtyřech hodinách
      if (!c.n) c.m = bestCar(s); // lepší auto ze Stromu se vymění samo
      const cap = CARS[c.m].cap;
      for (let i = 0; i < b.out.length && c.n < cap; i++) if (c.n ? b.out[i] === c.it : b._sinks.some((x) => x.path && x.it === b.out[i])) { c.it = b.out[i]; c.n++; b.out.splice(i--, 1); }
      c.w = c.n ? (c.w ?? 0) + dt : 0;
      if (c.n >= cap || (c.n && (b.st === 'empty' || c.w > 4 * HOUR))) {
        const r = pickDst(s, b, c.it);
        if (r) { c.dir = 1; if (enter(s, c, r.path, 0)) { c.to = [r.t.x, r.t.y]; c._path = r.path; c.p = 0; c.w = 0; } else c.dir = 0; } // výjezd, až je pruh volný
      }
      continue;
    }
    const dst = c.to && at(s, c.to[0], c.to[1]);
    if (!c._path) c._path = dst ? pathOf(s, b, dst) : null;
    const path = c._path;
    if (!path) { c.p = 0; c.dir = 0; continue; } // cesta zmizela: auto je zpátky u zdroje i s nákladem
    const end = path.length - 1;
    if (c.dir > 0 && c.p >= end) { // u cíle skládá, co cíl pobere
      if (s._occ.get(c._cell) === c) s._occ.delete(c._cell);
      if (!takes(dst, c.it)) { c.dir = -1; continue; } // cíl náklad nebere: veze ho zpátky
      if (dst.k === 'npc') { sellTo(s, dst, c.it, c.n); c.n = 0; }
      else while (c.n > 0 && (dst.k === 'hub' ? (deliver(s, dst, c.it), true) : feed(s, dst, c.it))) c.n--;
      c.w = c.n ? (c.w ?? 0) + dt : 0;
      if (!c.n) { c.it = null; c.dir = -1; c.w = 0; } else if (c.w > 20) { c.dir = -1; c.w = 0; } // plno i po čekání: náklad jede zpátky a příště jinam
      continue;
    }
    const i = Math.max(0, Math.min(end, Math.round(c.p))), [x, y] = path[i];
    const np = Math.max(0, Math.min(end, c.p + c.dir * LOGI['road' + (s._road.get(key(x, y)) ?? 1)].speed * dt)), ni = Math.round(np);
    if (ni !== i && !enter(s, c, path, ni)) { c.blk = (c.blk ?? 0) + dt; if (c.blk < 6) continue; } // pruh před ním je obsazený: čeká (po 6 s projede, pojistka proti zaseknutí)
    c.blk = 0; c.p = np;
    if (c.dir < 0 && c.p <= 0) { c.dir = 0; if (s._occ.get(c._cell) === c) s._occ.delete(c._cell); if (!c.n) c.it = null; }
  }
}

// ---------------------------------------------------------------- krok simulace
export function tick(s, dt) {
  s.t += dt; s.tick++;
  if (s._dirty) rebuild(s);
  traffic(s);
  stepBelts(s, dt);
  for (const b of s._act) { if (b.k === 'machine') stepMachine(s, b, dt); else if (b.k === 'miner') { stepMiner(s, b, dt); if (MODELS[b.model].kind !== 'm_drill') stepCars(s, b, dt); } else stepUnloader(s, b); }
  s._mt += dt;
  if (s._mt >= 0.5) { market(s, s._mt); s._mt = 0; }
}
// Text stavu stroje pro panel.
export function statusOf(s, b) {
  if (b.k === 'miner') {
    const shaft = MODELS[b.model].kind === 'm_shaft';
    return { run: MODELS[b.model].kind === 'm_drill' ? `Vrtá: ${Math.floor(b.dep)} m z ${MODELS[b.model].maxLv * LEVEL_M} m` : `Těží: ${b.oi ? ITEMS[ORES[b.oi].id].name : ''}${shaft ? `, hloubka ${b.goal * LEVEL_M} m` : ''}`,
      sink: `Hloubí: ${Math.floor(b.dep)} z ${b.goal * LEVEL_M} m`, done: 'Vrt je hotový', full: 'Hromada je plná: není kam vozit. Doveď cestu do Skladu, k peci nebo k odběrateli', money: 'Nedostatek peněz',
      staff: 'Nikdo tu nepracuje: přidej zaměstnance', empty: shaft ? 'Patro v dosahu je vytěžené: jdi hlouběji nebo postav důl jinde' : 'Ložisko v dosahu je vytěžené: přesuň rypadlo jinam' }[b.st] ?? '';
  }
  if (b.k !== 'machine') return '';
  if (b.job) { const r = ROUTES[b.job.r]; return `${r.ops[b.job.i].name} (${Math.round((b.job.t / b.job.T) * 100)} %)`; }
  return { staff: 'Nikdo tu nepracuje: přidej zaměstnance', idle: b.prod || b.q.length ? 'Čeká' : 'Nemá práci: přivez dávku nebo zvol výrobek', miss: `Chybí: ${ITEMS[b.miss]?.name ?? ''}`, money: 'Nedostatek peněz na materiál',
    tape: 'Nejdřív zaplať návrh čipu a sadu masek (okno Čipy)', cap: 'Čeká: v oběhu je dost rozpracovaných dávek', full: bulk(b) ? 'Hotové zboží nemá kam: postav stroj těsně ke Skladu, nebo mu kup auto' : 'Výstup je plný: přistav dopravník nebo další stroj' }[b.st] ?? '';
}
