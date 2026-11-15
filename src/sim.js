// Simulace hry: stav, stavění, dopravníky, stroje, těžba, sklad a trh. Bez DOM – běží i v testech (node --test).
import { makeWorld, ORES, T, LEVELS, LEVEL_M, STARTERS } from './world.js';
import { MODELS, LOGI, ITEMS, CHIPS, KINDS, HOUR, KWH_USD, FEED_USD, DIESEL, SELL, CARS, BUYERS, SPOTS, WAGE as PRICES_WAGE, yieldOf } from '../data/catalog.js';
import { ROUTES, RESEARCH, QUESTS, MISSIONS, FAB, USERS, STARTS, canDo } from '../data/routes.js';

export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // směr d: 0 východ, 1 jih, 2 západ, 3 sever
export const key = (x, y) => (x + 32768) * 65536 + (y + 32768);
export const BELT_SPEED = 6; // dlaždic (metrů) za sekundu
export const DAY = 24 * HOUR;
export const DEPOT_FEE = 2;
export const WIP_CAP = 8; // kolik rozpracovaných dávek jednoho výrobku pustí první stroj trasy do oběhu (jde změnit u stroje)
export const SURF_T = 30, DEEP_T = 150; // zásoba nerostu na 1 m²: povrchová vrstva 10 m, patro pod zemí 50 m (asi 3 t/m³)
const SINK_MH = 0.2; // výchozí hloubení dolu v metrech za hodinu práce (šachta ~1,6 m/den na směnu; úpadnice rychleji)
// Lidé a vylepšení (těžba, pece, hutě). Výkon stroje je za hodinu práce; směna pracuje 8 hodin denně, tři směny jedou nepřetržitě.
// Průměrný výkon za herní hodinu = výkon × (odpracované hodiny / 24) × úroveň. Jedna směna = crew lidí.
export const WAGE_DAY = PRICES_WAGE; // mzda jednoho člověka za osmihodinovou směnu v USD; platí se jen za dny, kdy budova opravdu pracuje
export const UPG = [1.5, 3, 6, 10]; // cena další úrovně v násobcích ceny budovy (až úroveň 5); každá úroveň přidá polovinu základního výkonu
export const MODS = {
  auto: { id: 'auto', name: 'Automatizace a PLC řízení', icon: '⚡', k: 1.2, desc: '+25 % rychlost a plný 24h provoz i s poloviční obsluhou' },
  cool: { id: 'cool', name: 'Průmyslové chlazení a diagnostika', icon: '🛡️', k: 1.0, desc: '3× méně poruch, poloviční doba opravy (4 h) a −25 % spotřeba energie a nafty' },
  cap: { id: 'cap', name: 'Rozšířená rampa a zásobníky', icon: '📦', k: 0.9, desc: '2× větší hromada / vstupní zásobníky a +2 nákladní auta u budovy' },
};
export const hasMod = (b, id) => !!b?.mods?.includes(id);
const indoorM = (m) => KINDS[m.kind].cat !== 'Suroviny';
export const staffed = (b) => { if (b?.k === 'hub') return b.staff ?? 2; const m = MODELS[b?.model]; if (!m) return 0; return b.staff ?? (m.crew ?? 0) * (indoorM(m) ? 3 : 1); }; // výroba v halách začíná na třech směnách (jede nepřetržitě), těžba a pece na jedné; Sklad má skladníky
export const SHIFT_H = 8;
export const hoursOf = (b) => { const c = MODELS[b.model].crew; return c ? Math.min(24, (SHIFT_H * staffed(b) * (hasMod(b, 'auto') ? 2 : 1)) / c) : 24; }; // kolik hodin denně budova pracuje
export const boost = (b) => (hoursOf(b) / 24) * (1 + 0.5 * (b.lv ?? 0)) * (hasMod(b, 'auto') ? 1.25 : 1);
const baseUsd = (b) => (b?.k === 'hub' ? (b.hq ? 20000 : LOGI[b.dump ? 'dump' : 'depot'].usd) : MODELS[b?.model]?.usd ?? 0);
const modOkFor = (b, id) => !!(b && MODS[id] && (MODELS[b.model] || (b.hq && id === 'cap')));
export const modCost = (b, id) => (modOkFor(b, id) ? Math.max(400, Math.round(baseUsd(b) * MODS[id].k)) : null);
export const upgradeCost = (b) => ((b?.k === 'hub' || MODELS[b?.model]) && (b.lv ?? 0) < UPG.length ? Math.round(baseUsd(b) * UPG[b.lv ?? 0]) : null);
const paidUp = (b) => UPG.slice(0, b.lv ?? 0).reduce((a, k) => a + Math.round(baseUsd(b) * k), 0) + (b?.mods ?? []).reduce((a, id) => a + (modCost(b, id) ?? 0), 0);
export function setStaff(s, b, n) {
  if (b?.k === 'hub') { b.staff = Math.max(0, Math.min(6, Math.round(n))); return true; }
  const c = MODELS[b?.model]?.crew;
  if (!c) return false;
  b.staff = Math.max(0, Math.min(3 * c, Math.round(n)));
  return true;
}
export function upgrade(s, b) {
  const usd = upgradeCost(b);
  if (!usd || !pay(s, usd, true)) return false;
  b.lv = (b.lv ?? 0) + 1;
  b._need = null;
  s._rev++;
  return true;
}
export function upgradeMax(s, b) {
  let n = 0;
  while (upgrade(s, b)) n++;
  return n;
}
export function installMod(s, b, id) {
  if (!modOkFor(b, id) || hasMod(b, id)) return false;
  const usd = modCost(b, id);
  if (!usd || !pay(s, usd, true)) return false;
  (b.mods ??= []).push(id);
  b._need = null;
  s._rev++;
  return true;
}
export function installAllMods(s) {
  let n = 0;
  for (const b of s.list) for (const id of Object.keys(MODS)) if (installMod(s, b, id)) n++;
  return n;
}
// Poruchy: stroj se po odpracovaných hodinách porouchá; oprava trvá a něco stojí. Údržbář (b.mt) prodlouží dobu do poruchy třikrát a bere mzdu jednoho člověka.
// MTBF, doba a cena opravy jsou herní hodnoty; kdy přesně se stroj porouchá, je náhoda daná místem stroje (stejná hra = stejné poruchy).
export const MTBF = 500, FIX_H = 8, FIX_K = 0.02;
export const repairCost = (b) => Math.round(MODELS[b.model].usd * FIX_K);
const mtbfK = (m) => (m?.tier === 'used' ? 0.65 : m?.kind === 'm_euv' ? 0.85 : m?.kind === 'm_duv_immersion' || m?.kind === 'm_iline_stepper' ? 1.2 : 1);
const failAt = (s, b) => MTBF * mtbfK(MODELS[b.model]) * (1 + 0.2 * (b.lv ?? 0)) * (b.mt ? 3 : 1) * (hasMod(b, 'cool') ? 3 : 1) * (0.5 + s._world.rnd(b.x, b.y, 900 + (b.fails ?? 0)));
function wear(s, b, h) { // h = herní hodiny práce
  if (b.mt) { const w = (WAGE_DAY / SHIFT_H) * h; s.money -= w; s._out += w; } // údržbář na každou odpracovanou směnu
  b.age = (b.age ?? 0) + h;
  b.wear = (b.wear ?? 0) + h;
  if (b.wear < (b.mtbf ??= failAt(s, b))) return;
  b.wear = 0; b.fails = (b.fails ?? 0) + 1; b.mtbf = failAt(s, b); b.fix = hasMod(b, 'cool') ? FIX_H / 2 : FIX_H;
  const usd = repairCost(b); s.money -= usd; s._out += usd; // oprava se platí i na dluh, jako mzdy: stroj se jinak nerozjede
  if (s._fx.length < 40) s._fx.push({ broke: b.model, usd });
}
export function setMaint(s, b, on) { if (!MODELS[b?.model]) return false; b.mt = !!on; b.mtbf = null; return true; }
// Elektřina: spotřeba se bere nejdřív ze zásobníku vlastních elektráren (s.mwh), zbytek se platí síti (denní/noční tarif 2 : 1). Přebytek nad GRID_MWH se prodá do sítě.
export const GRID_MWH = 20;
export const powerTariff = (t) => { const h = Math.floor((t % DAY) / HOUR); return h >= 6 && h < 22 ? 1.25 : 0.625; };
function power(s, kw, h) {
  const need = (kw * h) / 1000, own = Math.min(need, s.mwh);
  s.mwh -= own;
  const usd = (need - own) * 1000 * KWH_USD * powerTariff(s.t); s.money -= usd; s._out += usd;
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
  Object.assign(b, { model: id, lv: 0, mods: [], staff: undefined, cur: null, _need: null, build: !s.sandbox && MODELS[id].buildDays ? MODELS[id].buildDays * 24 : 0 });
  if (b.build > 0) b.st = 'build';
  s._rev++; s._dirty = true;
}
export const RESERVE = 20; // kolik tun suroviny si Sklad nechává, když ji spotřebovává nějaká tvoje pec; zbytek prodává
export const PILE = 40; // kolik tun se vejde na hromadu u dolu, než se těžba zastaví
export const MAXCARS = 4;
export const pileOf = (b) => PILE * (hasMod(b, 'cap') ? 2 : 1);
export const maxCarsOf = (b) => MAXCARS + (b?.lv ?? 0) + (hasMod(b, 'cap') ? 2 : 0);
export const reachOf = (b) => (MODELS[b?.model]?.reach ?? 0) + (b?.lv ?? 0);
export const reserveOf = (s) => { const hq = s.list.find((x) => x.hq); return Math.round(RESERVE * (1 + 0.5 * (hq?.lv ?? 0)) * (hasMod(hq, 'cap') ? 2 : 1)); };
export const depotFeeOf = (hub) => (!hub || hub.hq || hub.dump ? 0 : Math.max(0, DEPOT_FEE - 0.5 * (hub.lv ?? 0)));
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
  const s = { v: 3, seed, sandbox, level: L.id, won: false, t: 0, money: sandbox ? 1e12 : L.money, loan: 0, mkt: {}, list: [], floor: [], hall: [], road: [], dug: {}, guide: L.guide === 1 ? 0 : null, inv: {}, autoSell: {}, autoBuy: {}, sold: {},
    research: [...L.research], pts: L.pts ?? 0, fix: 1, lvl: 0, xp: 0, out: {}, tape: {}, learn: {}, yieldAvg: {}, made: {}, got: {}, quest: 0, rateIn: 0, rateOut: 0,
    mwh: 0, gen: 0, hist: [], deal: null, dealAt: DAY };
  if (sandbox) s.autoBuy.fabchem = 10;
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
    if (b.mods) b.mods = b.mods.filter((id) => MODS[id]);
    known(b.buf);
  }
  // hra uložená před elektrárnami, zakázkami, chemií pro fab, úvěry a tržními cenami
  s.mwh ??= 0; s.gen ??= 0; s.hist ??= []; s.deal ??= null; s.dealAt ??= s.t + DAY; s.loan ??= 0; s.mkt ??= {};
  if (s.sandbox || s.research.includes('fab0')) s.autoBuy.fabchem ??= 10;
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
  const fee = depotFeeOf(hub);
  if (fee && it !== 'spoil') pay(s, fee);
  add(s, it); s.got[it] = (s.got[it] ?? 0) + 1;
  // Co nejde použít v žádné odemčené výrobě, je hotový výrobek: prodává se samo, dokud to hráč v Trhu nevypne.
  if (s.autoSell[it] === undefined) s.autoSell[it] = ITEMS[it].sell && (ITEMS[it].cat === 'Suroviny' || !(USERS[it] ?? []).some((r) => unlocked(s, r.req))); // suroviny se prodávají vždy (až na zásobu pro vlastní pec), díly pro odemčenou výrobu zůstávají
}
export const LOAN_RATE = 0.10; // roční úroková sazba úvěru (10 %, v USA 7,5–12 %)
export const RECLAIM_USD = 4; // cena rekultivace vytěžené jámy za m² (20–60 tis. $/ha)
export const RC_OPEX = 45; // RC (reverse circulation) průzkumný vrt: 45 $/m, 2× rychlejší, ale odhad ±30 %
export const isPit = (s, x, y) => (s.dug[key(x, y) * 8] ?? 0) > 0;
export function setDrillMode(s, b, rc) { if (!b || MODELS[b.model]?.kind !== 'm_drill') return false; b.rc = !!rc; return true; }
export function takeLoan(s, usd) {
  if (usd <= 0 || s.sandbox) return false;
  s.money += usd; s.loan = (s.loan ?? 0) + usd;
  return true;
}
export function repayLoan(s, usd) {
  const payAmt = Math.min(s.loan ?? 0, Math.max(0, usd), Math.max(0, s.money));
  if (payAmt <= 0) return false;
  s.money -= payAmt; s.loan -= payAmt;
  return true;
}
export function reclaim(s, x, y) {
  const k = key(x, y) * 8;
  if (!(k in s.dug) || !pay(s, RECLAIM_USD, true)) return false;
  delete s.dug[k];
  init(s); // přestaví s._pit
  s._grev++;
  return true;
}
export const itemMul = (s, it) => s.mkt?.[it] ?? 1;
export const canBuy = (s, it) => ITEMS[it].buy && (!it.startsWith('wl_') || taped(s, it.slice(3)));
export function buy(s, it, q) {
  if (!canBuy(s, it) || q <= 0 || !pay(s, ITEMS[it].usd * itemMul(s, it) * q)) return false;
  add(s, it, q);
  if (it.startsWith('wl_')) blendYield(s, CHIPS[it.slice(3)], CHIPS[it.slice(3)].yield0, q); // foundry dodává zralou výtěžnost
  return true;
}
// Tržba za q balení: plná cena do hloubky trhu (balení za den), nad ní cena klesá nepřímo úměrně prodanému množství.
// k = podíl z ceny: Trh platí 85 %, odběratel na mapě svůj násobek (hloubka trhu je společná).
export function revenue(s, it, q, k = SELL) {
  const d = ITEMS[it].depth, a = s.sold[it] ?? 0, b = a + q;
  return ITEMS[it].usd * itemMul(s, it) * k * (Math.max(0, Math.min(b, d) - a) + (b > d ? d * Math.log(b / Math.max(a, d)) : 0));
}
export const priceNow = (s, it, k = SELL) => ITEMS[it].usd * itemMul(s, it) * k * Math.min(1, ITEMS[it].depth / Math.max(s.sold[it] ?? 0, 1e-9));
function sellTo(s, npc, it, n) { // prodej odběrateli na mapě
  const r = revenue(s, it, n, npc.mul);
  s.sold[it] = (s.sold[it] ?? 0) + n; s.out[it] = (s.out[it] ?? 0) + n; earn(s, r);
  const d = s.deal;
  if (d && d.it === it && d.x === npc.x && d.y === npc.y) d.got += n;
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
  for (const it in s.autoSell) if (s.autoSell[it] && !s.autoBuy[it]) sell(s, it, (s.inv[it] ?? 0) - (ITEMS[it].cat === 'Suroviny' && s._act.some((b) => b.k === 'machine' && ROUTES[b.prod]?.ops.some((op) => op.in?.[it])) ? reserveOf(s) : 0)); // surovinu, kterou spotřebovává stojící pec, si Sklad nechává v zásobě (roste s úrovní Skladu)
  const a = Math.min(1, dt / (DAY / 4)); // klouzavý průměr příjmů a výdajů v USD za den
  if (s.mwh > GRID_MWH) { earn(s, (s.mwh - GRID_MWH) * FEED_USD); s.mwh = GRID_MWH; } // přebytek proudu se prodá do sítě
  s.rateIn += ((s._in / dt) * DAY - s.rateIn) * a; s.rateOut += ((s._out / dt) * DAY - s.rateOut) * a; s._in = s._out = 0;
  if (!s.hist.length || s.t - s.hist.at(-1)[0] >= HOUR) { s.hist.push([Math.round(s.t), Math.round(s.money), Math.round(s.rateIn), Math.round(s.rateOut)]); if (s.hist.length > 24 * 14) s.hist.shift(); } // průběh na dva týdny pro okno Statistiky
  const day = Math.floor(s.t / DAY);
  if (s._day !== day) {
    if (s._d0) s.lastDay = Object.fromEntries(Object.keys(s.made).map((it) => [it, s.made[it] - (s._d0[it] ?? 0)]).filter(([, n]) => n > 0));
    s._d0 = { ...s.made }; s._day = day;
    if (day > 0) {
      if (s.loan > 0) { const intr = s.loan * (LOAN_RATE / 365); s.loan += intr; s._out += intr; } // denní úrok z úvěru
      let j = 0; // kolísání cen surovin a křemíku (mean-reverting random walk, ±25–30 %)
      for (const it in ITEMS) if (ITEMS[it].cat === 'Suroviny' || ITEMS[it].cat === 'Křemík') {
        const cur = s.mkt[it] ?? 1, rnd = s._world.rnd(day, j++, 555) - 0.5;
        s.mkt[it] = Math.round(Math.max(0.75, Math.min(1.30, cur + (1 - cur) * 0.15 + rnd * 0.08)) * 1000) / 1000;
      }
    }
  }
  deals(s);
  const L = levelOf(s); // úroveň se plní cíli, volnou hru vedou úkoly
  if (L.goals.length) { if (!s.won && L.goals.every((g) => g[1](s))) { s.won = true; s._fx.push({ win: L.id }); } }
  else while (s.quest < QUESTS.length && QUESTS[s.quest][1](s)) { const [, , usd, pts] = QUESTS[s.quest]; s.money += usd; s.pts += pts; s._fx.push({ quest: s.quest, usd, pts }); s.quest++; }
}
// Zakázky: odběratel na mapě chce do termínu množství zboží, které už umíš vyrobit, a za splnění přidá prémii a bod rozvoje.
// Velikost zakázky, prémie (30 % ceny) a termín jsou herní hodnoty. Nesplněná zakázka jen propadne. Na levné zboží (hlušinu) zakázky nejsou.
export const DEAL_DAYS = 3, DEAL_BONUS = 0.3;
function deals(s) {
  const d = s.deal;
  if (d) {
    if (d.got >= d.n) { earn(s, d.bonus); s.pts++; s._fx.push({ deal: 'done', usd: d.bonus }); s.deal = null; s.dealAt = s.t + DAY; }
    else if (s.t > d.until) { s._fx.push({ deal: 'fail' }); s.deal = null; s.dealAt = s.t + DAY; }
    return;
  }
  if (s.guide != null || s.t < s.dealAt) return; // ve výuce zakázky neruší
  const opts = s.list.filter((b) => b.k === 'npc').flatMap((b) => BUYERS[b.t].buys.filter((it) => (s.made[it] ?? 0) >= 5 && ITEMS[it].usd >= 50).map((it) => [b, it]));
  if (!opts.length) return;
  const [b, it] = opts[Math.floor(s._world.rnd(Math.floor(s.t), 17, 71) * opts.length)];
  const n = Math.max(10, Math.min(5000, Math.round((s.made[it] ?? 0) * 0.2)));
  s.deal = { x: b.x, y: b.y, name: b.name, it, n, got: 0, until: s.t + DEAL_DAYS * DAY, bonus: Math.round(n * ITEMS[it].usd * b.mul * DEAL_BONUS) };
  s._fx.push({ deal: 'new' });
}
// Odemknutí ve stromu rozvoje stojí body, ne peníze.
export function research(s, id) {
  const r = RESEARCH.find((x) => x.id === id);
  if (!r || s.research.includes(id) || !r.req.every((q) => s.research.includes(q)) || (!s.sandbox && s.pts < r.pts)) return false;
  if (!s.sandbox) s.pts -= r.pts;
  s.research.push(id);
  if (id === 'smt1') workshop(s);
  if (id === 'fab0') s.autoBuy.fabchem ??= 10; // chemie pro fab se dokupuje sama, zásobu jde změnit v Trhu
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
    if (s.dug[k * 8] > 0 && !f.road && id !== 'dump') return 'V jámě po těžbě stavět nejde'; // silnice jámu zasype a polní sklad může stát u jámy; ostatní stavby ne
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
  const build = !s.sandbox && f.buildDays ? f.buildDays * 24 : 0;
  const b = id === 'belt' ? { k: 'belt', x, y, d, it: null, p: 0 }
    : id === 'junction' || id === 'splitter' ? { k: id, x, y, rr: 0 }
    : id === 'sorter' ? { k: 'sorter', x, y, f: null, rr: 0 }
    : id === 'unloader' ? { k: 'unloader', x, y, d, f: null }
    : id === 'depot' || id === 'dump' ? { k: 'hub', hq: false, ...(id === 'dump' ? { dump: true } : {}), x, y, w, h }
    : f.reach ? { k: 'miner', model: id, x, y, w, h, d, acc: 0, out: [], rr: 0, oi: 0, cur: null, dep: 0, goal: 1, build, st: build ? 'build' : 'run', cars: [], to: null, ...(f.kind === 'm_drill' ? { rc: false } : {}) } // lom, rypadlo, vrt, hlubinný důl; cars = auta, to = kam vozí
    : { k: 'machine', model: id, x, y, w, h, d, prod: soleRoute(s, f), cars: [], to: null, q: [], buf: {}, acc: {}, job: null, out: [], busy: 0, build, st: build ? 'build' : 'idle', rr: 0 };
  s.list.push(b); occupy(s, b); s._dirty = true; s._rev++;
  return { b };
}
export const resaleFactor = (b) => ((b.age ?? 0) < 24 ? 1 : Math.max(0.45, 1 - 0.55 * Math.min(1, ((b.age ?? 0) - 24) / 2000)));
// Zbourání vrací cenu podle stáří (po 2 000 h klesá k 45 %) a díly ze stroje do skladu; rozpracované dávky propadají.
export function remove(s, b) {
  if (!b || b.hq || b.k === 'npc') return false;
  const id = b.k === 'machine' || b.k === 'miner' ? b.model : b.k === 'hub' ? (b.dump ? 'dump' : 'depot') : b.k;
  s.money += Math.round((defOf(id).usd + (b.model || b.k === 'hub' ? paidUp(b) : 0)) * resaleFactor(b));
  for (const c of b.cars ?? []) { if (c.n) add(s, c.it, c.n); s.money += CARS[c.m].usd; } // náklad aut se vrátí do skladu a auta se prodají za cenu, za kterou se koupila
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
// Ve svahu jsou zemní práce dražší: každé procento sklonu přidá desetinu ceny (odhad bez zdroje), takže 10% svah stojí dvojnásobek.
export const SLOPE_K = 10, CLIMB_K = 8;
/** Sklon dlaždice (m na m): největší výškový rozdíl mezi jejími rohy. */
export function grade(s, x, y) {
  const k = key(x, y), c = (s._gk ??= new Map()).get(k);
  if (c !== undefined) return c;
  const H = s._world.height, h = H(x, y), g = Math.max(Math.abs(H(x + 1, y) - h), Math.abs(H(x, y + 1) - h), Math.abs(H(x + 1, y + 1) - h));
  s._gk.set(k, g);
  return g;
}
const wet = (s, x, y) => (s._world.terrain(x, y) === T.WATER ? 10 : 1) * (1 + SLOPE_K * grade(s, x, y));
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
const bulk = (m) => KINDS[MODELS[m.model].kind].cat === 'Suroviny'; // pece, hutě a elektrárny: větší zásoba vstupů i hromada výrobků, vozí jim auta
function needs(m) {
  if (m._need) return m._need;
  const need = {};
  const k = (bulk(m) ? 24 : 2) * (hasMod(m, 'cap') ? 2 : 1); // pece a hutě mají u sebe zásobu na den, ostatní stroje na dvě dávky (s modulem zásobníků dvojnásobek)
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
  const need = needs(m), fee = depotFeeOf(A.hub);
  for (const it in need) while ((m.buf[it] ?? 0) < need[it] && (s.inv[it] ?? 0) >= 1 && pay(s, fee)) { s.inv[it] -= 1; m.buf[it] = (m.buf[it] ?? 0) + 1; }
}
function syncSinks(s, b) {
  const sv = `${s._grev}:${s._rev}:${b.oi ?? b.prod}`;
  if (b._sv !== sv) { b._sv = sv; b._sinks = sinks(s, b); for (const c of b.cars ?? []) c._path = null; } // změnila se síť silnic nebo budovy: cíle a cesty znovu
}
// Výstup: rozpracovaná dávka jde do sousedního stroje nebo na dopravník; hotová položka nejdřív do sousedního skladu.
function emit(s, b) {
  const A = b._adj;
  if (b.k === 'miner' && A.hub) {
    syncSinks(s, b);
    const hasExt = (b._sinks ?? []).some((x) => x.path && x.t.k !== 'hub');
    if (hasExt) {
      for (let i = 0; i < b.out.length; i++) {
        const it = b.out[i];
        const byRoad = it !== 'spoil' && b._sinks.some((x) => x.path && x.t.k !== 'hub' && x.it === it);
        if (!byRoad || b.out.length >= pileOf(b) - 4) { deliver(s, A.hub, it); b.out.splice(i--, 1); }
      }
      return;
    }
    while (b.out.length) deliver(s, A.hub, b.out.shift());
    return;
  }
  const it = b.out[0];
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
  if (op.chem && (s.inv.fabchem ?? 0) < op.chem) { m.st = 'miss'; m.miss = 'fabchem'; return false; } // chemie jde ze Skladu centrálním rozvodem
  if (!pay(s, op.opex)) { m.st = 'money'; return false; }
  if (op.chem) s.inv.fabchem -= op.chem;
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
  else if (r.power) { s.mwh += r.power; s.gen += r.power; }
  else for (const it in r.out) produce(s, m, it, r.out[it]);
}
function stepMachine(s, m, dt) {
  if (m.build > 0) { m.build = Math.max(0, m.build - dt / HOUR); m.st = m.build > 0 ? 'build' : 'idle'; return; }
  if (m.out.length) emit(s, m);
  pull(s, m);
  if (m.fix > 0) { m.fix -= dt / HOUR; m.st = 'broken'; } // porucha: rozpracovaná dávka čeká ve stroji
  else if (m.job) {
    m.job.t += dt; m.st = 'run';
    power(s, MODELS[m.model].kw * (hasMod(m, 'cool') ? 0.75 : 1), dt / HOUR);
    if (MODELS[m.model].crew) wage(s, m, dt / HOUR);
    wear(s, m, (dt / HOUR) * (hoursOf(m) / 24));
    if (m.job.t >= m.job.T) finish(s, m);
  } else if (MODELS[m.model].crew && !staffed(m)) m.st = 'staff';
  else if (m.out.length < (bulk(m) ? pileOf(m) : hasMod(m, 'cap') ? 8 : 4)) start(s, m);
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
/** Průzkum vrtem: jádrové vrtání vrací přesné zásoby, RC vrtání vrací deterministický odhad ±30 %. */
export function drillSurvey(s, b, l) {
  const [cx, cy] = centerOf(b), md = MODELS[b.model], raw = survey(s, cx, cy, reachOf(b), l);
  if (!b.rc) return raw;
  const out = {};
  for (const o in raw) {
    let h = ((s.seed | 0) ^ (b.x * 374761393) ^ (b.y * 668265263) ^ (l * 2147483647) ^ (+o * 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = ((h ^ (h >>> 13)) >>> 0) / 4294967295;
    out[o] = Math.round(raw[o] * (0.7 + 0.6 * h));
  }
  return out;
}
function stepMiner(s, b, dt) {
  const md = MODELS[b.model], [cx, cy] = centerOf(b), h = dt / HOUR;
  if (b.build > 0) { b.build = Math.max(0, b.build - h); b.st = b.build > 0 ? 'build' : 'run'; return; }
  if (b.out.length) emit(s, b);
  if (b.fix > 0) { b.fix -= h; b.st = 'broken'; return; }
  const coolK = hasMod(b, 'cool') ? 0.75 : 1;
  if (md.kind === 'm_drill') { // vrt jde dolů a odkrývá patro po patru
    if (b.dep >= md.maxLv * LEVEL_M) { b.st = 'done'; return; }
    const rate = md.rate * (b.rc ? 2 : 1) * (1 + 0.5 * (b.lv ?? 0)) * (hasMod(b, 'auto') ? 1.25 : 1), opex = b.rc ? RC_OPEX : KINDS.m_drill.opex;
    if (pay(s, (opex * rate + md.fuel * DIESEL.usd * coolK) * h)) { b.dep += rate * h; b.st = 'run'; wear(s, b, h); } else b.st = 'money';
    return;
  }
  let l = 0, opex = KINDS.m_miner.opex;
  if (md.kind === 'm_shaft') {
    if (b.dep < b.goal * LEVEL_M) {
      if (md.crew && !staffed(b)) { b.st = 'staff'; return; }
      const sr = (md.sinkRate ?? SINK_MH) * boost(b);
      if (pay(s, md.sink * sr * h)) { b.dep += sr * h; b.st = 'sink'; wage(s, b, h); if (md.fuel) { const f = md.fuel * DIESEL.usd * coolK * h * (hoursOf(b) / 24); s.money -= f; s._out += f; } wear(s, b, h * (hoursOf(b) / 24)); } else b.st = 'money';
      return;
    }
    l = b.goal; opex = KINDS.m_shaft.opex * (1 + l / 2); // hlouběji je těžba dražší: doprava nahoru, větrání, čerpání vody
  }
  const pile = pileOf(b), reach = reachOf(b);
  if (b.out.length >= pile) { b.st = 'full'; return; }
  if (!b.cur || left(s, b.cur[0], b.cur[1], l) <= 0) { // dlaždice je vytěžená: další nejbližší, nejdřív stejný nerost
    const t = (b.oi && findOre(s, cx, cy, reach, l, b.oi)) || findOre(s, cx, cy, reach, l, 0);
    if (!t) { b.cur = null; b.st = 'empty'; return; }
    b.cur = [t[0], t[1]]; b.oi = t[2];
  }
  if (md.crew && !staffed(b)) { b.st = 'staff'; return; }
  const wh = h * (hoursOf(b) / 24);
  b.st = 'run'; b.acc += md.rate * (ORES[b.oi].speed ?? 1) * boost(b) * h; wage(s, b, h);
  if (md.fuel) { const f = md.fuel * DIESEL.usd * coolK * wh; s.money -= f; s._out += f; }
  if (md.powerPerLv && l > 0) power(s, md.powerPerLv * l * coolK, wh); // větrání a čerpání vody roste s hloubkou a chladicí modul snižuje odběr
  wear(s, b, wh);
  if (b.acc < 1) return;
  const it = ORES[b.oi].id, royRate = (ORES[b.oi].royalty ?? 0.025) * (md.kind === 'm_shaft' && it === 'coal' ? 0.64 : 1);
  const roy = ITEMS[it].usd * SELL * royRate; // těžební poplatek státu z vytěžené tuny
  if (!pay(s, opex + roy)) { b.acc = 1; b.st = 'money'; return; }
  const k = key(b.cur[0], b.cur[1]) * 8 + l;
  b.acc -= 1; s.dug[k] = (s.dug[k] ?? 0) + 1; b.out.push(it); s.made[it] = (s.made[it] ?? 0) + 1;
  b.wacc = (b.wacc ?? 0) + (ORES[b.oi].waste ?? 0); // s nerostem se vykope i hlušina; musí se odvézt stejně jako nerost
  while (b.wacc >= 1) { b.wacc -= 1; b.out.push('spoil'); s.made.spoil = (s.made.spoil ?? 0) + 1; }
  if (!l) pitMark(s, b.cur[0], b.cur[1]); // na povrchu po těžbě zůstává jáma
}
function stepUnloader(s, u) {
  const hub = u._adj.hub, tgt = at(s, u.x + DX[u.d], u.y + DY[u.d]), it = u.f, fee = depotFeeOf(hub);
  if (!hub || !tgt || !it || (s.inv[it] ?? 0) < 1 || (fee && s.money < fee && !s.sandbox) || !insert(s, tgt, it, u.d)) return;
  s.inv[it] -= 1;
  if (fee) pay(s, fee);
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
const aroundTouch = (b) => { // včetně 4 rohů půdorysu pro ručně taženou silnici
  const r = around(b);
  r.push([b.x - 1, b.y - 1], [b.x + b.w, b.y - 1], [b.x - 1, b.y + b.h], [b.x + b.w, b.y + b.h]);
  return r;
};
/** Cesta po silnici od budovy a k budově b: pole dlaždic [x, y], nebo null, když silnice nevede. */
export function pathOf(s, a, b) { // shortcut: nejkratší cesta podle počtu dlaždic, ne podle času; přepsat na Dijkstru, až budou sítě silnic různých tříd
  if (!a || !b) return null;
  const run = (fn) => {
    const goal = new Set(fn(b).map(([x, y]) => key(x, y)).filter((k) => s._road.has(k))), prev = new Map(), q = [];
    for (const [x, y] of fn(a)) { const k = key(x, y); if (s._road.has(k) && !prev.has(k)) { prev.set(k, -1); q.push(k); } }
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      if (goal.has(k)) { const p = []; for (let c = k; c !== -1; c = prev.get(c)) p.push([Math.floor(c / 65536) - 32768, (c % 65536) - 32768]); return p.reverse(); }
      for (const d of [65536, -65536, 1, -1]) if (s._road.has(k + d) && !prev.has(k + d)) { prev.set(k + d, k); q.push(k + d); }
    }
    return null;
  };
  return run(around) ?? run(aroundTouch);
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
  if (b._adj?.npc) return; // odběratel hned vedle: předává rovnou, auta nepotřebuje
  if (b._adj?.hub && b.out.length) emit(s, b);
  syncSinks(s, b);
  if (b._adj?.hub && (b.k !== 'miner' || !b._sinks.some((x) => x.path && x.t.k !== 'hub'))) return; // stojí těsně u skladu bez další cesty ven: předává rovnou, auta nepotřebuje
  const hasOrePath = b._sinks.some((x) => x.path && x.it !== 'spoil');
  const hasSpoilDst = !!pickDst(s, b, 'spoil');
  const pile = pileOf(b);
  if (!b._adj?.hub && !hasSpoilDst && ((hasOrePath && b.out.length >= pile - 4) || hasOrePath || b.out.length >= pile)) { // lokální výsypka u lomu: neprodejná hlušina neblokuje těžbu nerostu
    for (let i = b.out.length - 1; i >= 0; i--) if (b.out[i] === 'spoil') b.out.splice(i, 1);
    if (b.st === 'full' && b.out.length < pile) b.st = 'run';
  }
  const cars = (b.cars ??= []);
  b.carWait = false;
  if (b._sinks.some((x) => x.path) && (cars.length ? cars.length < maxCarsOf(b) && b.out.length >= 2 * CARS[cars[0].m].cap + 4 && cars.every((c) => c.dir !== 0) : b.out.length >= 2)) { // p = poloha na cestě, dir: 0 stojí u zdroje, 1 jede s nákladem, −1 se vrací
    const m = bestCar(s), usd = CARS[m].usd; // auto se koupí samo; další auta jen tehdy, když po nákupu zůstane aspoň tolik, kolik stálo (rezerva)
    if ((!cars.length || s.sandbox || s.money >= 2 * usd) && pay(s, usd, true)) cars.push({ m, p: 0, dir: 0, n: 0, it: null });
    else b.carWait = !cars.length;
  }
  for (const c of cars) {
    if (c.dir === 0) { // u zdroje nakládá jeden druh zboží, pro který existuje cíl; odjede plné, se zbytkem z vytěženého ložiska, nebo po čtyřech hodinách
      if (c.n > 0 && !pickDst(s, b, c.it) && (c.it === 'spoil' || b.out.some((it) => pickDst(s, b, it)))) { c.n = 0; c.it = null; c.w = 0; }
      const nb = bestCar(s), up = CARS[nb].usd - CARS[c.m].usd; // lepší auto ze Stromu se vymění samo: doplatí se rozdíl, když na něj je dvakrát tolik peněz
      if (!c.n && nb !== c.m && (s.sandbox || s.money >= 2 * up) && pay(s, up, true)) c.m = nb;
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
    const i = Math.max(0, Math.min(end, Math.round(c.p))), [x, y] = path[i], nx = path[Math.max(0, Math.min(end, i + c.dir))];
    const up = Math.max(0, s._world.height(nx[0] + 0.5, nx[1] + 0.5) - s._world.height(x + 0.5, y + 0.5)); // do kopce jede pomaleji (herní hodnota: 10% stoupání skoro na polovinu)
    const np = Math.max(0, Math.min(end, c.p + (c.dir * LOGI['road' + (s._road.get(key(x, y)) ?? 1)].speed * dt) / (1 + CLIMB_K * up))), ni = Math.round(np);
    if (ni !== i && !enter(s, c, path, ni)) { c.blk = (c.blk ?? 0) + dt; if (c.blk < 6) continue; } // pruh před ním je obsazený: čeká (po 6 s projede, pojistka proti zaseknutí)
    const fuel = (Math.abs(np - c.p) / 1000) * CARS[c.m].km; // nafta a opotřebení za ujeté metry
    s.money -= fuel; s._out += fuel;
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
const buildTxt = (h) => { const hh = Math.ceil(h), d = Math.floor(hh / 24), r = hh % 24; return `Staví se: zbývá ${d ? `${d} d${r ? ` ${r} h` : ''}` : `${r} h`}`; };
// Text stavu stroje pro panel.
export function statusOf(s, b) {
  if (b.k === 'miner') {
    const shaft = MODELS[b.model].kind === 'm_shaft';
    return { build: buildTxt(b.build),
      run: MODELS[b.model].kind === 'm_drill' ? `Vrtá (${b.rc ? 'RC' : 'jádrově'}): ${Math.floor(b.dep)} m z ${MODELS[b.model].maxLv * LEVEL_M} m` : `Těží: ${b.oi ? ITEMS[ORES[b.oi].id].name : ''}${shaft ? `, hloubka ${b.goal * LEVEL_M} m` : ''}`,
      sink: `Hloubí: ${Math.floor(b.dep)} z ${b.goal * LEVEL_M} m`, done: 'Vrt je hotový',
      full: b._sinks?.some((x) => x.path) ? 'Hromada je plná: připojený odběr má plno, doveď cestu i do Skladu' : 'Hromada je plná: není kam vozit. Doveď cestu do Skladu, k peci nebo k odběrateli',
      money: 'Nedostatek peněz',
      broken: `Porucha: oprava ještě ${Math.ceil(b.fix)} h`, staff: 'Nikdo tu nepracuje: přidej zaměstnance', empty: shaft ? 'Patro v dosahu je vytěžené: jdi hlouběji nebo postav důl jinde' : 'Ložisko v dosahu je vytěžené: přesuň rypadlo jinam' }[b.st] ?? '';
  }
  if (b.k !== 'machine') return '';
  if (b.st === 'build') return buildTxt(b.build);
  if (b.st === 'broken') return `Porucha: oprava ještě ${Math.ceil(b.fix)} h`;
  if (b.job) { const r = ROUTES[b.job.r]; return `${r.ops[b.job.i].name} (${Math.round((b.job.t / b.job.T) * 100)} %)`; }
  return { staff: 'Nikdo tu nepracuje: přidej zaměstnance', idle: b.prod || b.q.length ? 'Čeká' : 'Nemá práci: přivez dávku nebo zvol výrobek', miss: `Chybí: ${ITEMS[b.miss]?.name ?? ''}`, money: 'Nedostatek peněz na materiál',
    tape: 'Nejdřív zaplať návrh čipu a sadu masek (okno Čipy)', cap: 'Čeká: v oběhu je dost rozpracovaných dávek', full: bulk(b) ? 'Hotové zboží nemá kam: postav stroj těsně ke Skladu, nebo mu kup auto' : 'Výstup je plný: přistav dopravník nebo další stroj' }[b.st] ?? '';
}

// ---------------------------------------------------------------- snadné ovládání a stavba továren na 1 klik
function unlockPlan(s, req) {
  if (unlocked(s, req)) return [];
  const opts = Array.isArray(req) ? req : [req];
  let best = null;
  for (const root of opts) {
    const seen = new Set(), order = [];
    const visit = (x) => {
      if (seen.has(x) || s.research.includes(x)) return true;
      seen.add(x);
      const r = RESEARCH.find((n) => n.id === x);
      if (!r) return false;
      for (const q of r.req) if (!visit(q)) return false;
      order.push(r);
      return true;
    };
    if (!visit(root)) continue;
    const pts = order.reduce((a, r) => a + r.pts, 0);
    if (!best || pts < best.pts) best = { order, pts };
  }
  return best?.order ?? null;
}

/** Odemkne výzkum včetně všech chybějících předpokladů najednou. */
export function unlockWithReqs(s, req) {
  if (unlocked(s, req)) return true;
  const order = unlockPlan(s, req);
  if (!order) return false;
  const need = order.reduce((a, r) => a + r.pts, 0);
  if (!s.sandbox && s.pts < need) return false;
  for (const r of order) research(s, r.id);
  return true;
}

/** Automaticky postaví nejlepší dostupnou silnici od budovy ke Skladu. */
export function autoConnectRoad(s, b, roadId = null) {
  if (!b) return { err: 'Chybí budova' };
  const hq = s.list.find((x) => x.hq);
  if (!hq) return { err: 'Chybí Sklad' };
  if (s._dirty) rebuild(s);
  if (b._adj?.hub || pathOf(s, b, hq)) return { ok: true, tiles: [], usd: 0 };
  const tiers = roadId ? [roadId] : ['road3', 'road2', 'road1'].filter((r) => unlocked(s, LOGI[r].req));
  for (const tier of tiers) {
    const plan = planRoad(s, tier, { x: b.x, y: b.y }, { x: hq.x, y: hq.y });
    if (!plan?.tiles?.length) continue;
    if (buildRoad(s, tier, plan)) return { ok: true, tiles: plan.tiles, usd: plan.usd };
  }
  const fallback = planRoad(s, tiers[0] ?? 'road1', { x: b.x, y: b.y }, { x: hq.x, y: hq.y });
  return { err: fallback?.tiles?.length ? `Na silnici chybí peníze (${Math.round(fallback.usd)} $)` : 'Mezi budovou a Skladem cesta nevede' };
}

/** Najme plné 3 směny (24 h denně) u všech budov a skladníků ve Skladu/depech. */
export function hireAllStaff(s) {
  let n = 0;
  for (const b of s.list) {
    if (b.k === 'hub' && staffed(b) < 6 && setStaff(s, b, 6)) n++;
    else if (MODELS[b.model]?.crew) {
      const target = 3 * MODELS[b.model].crew;
      if (staffed(b) < target && setStaff(s, b, target)) n++;
    }
  }
  return n;
}

/** Zapne údržbáře u všech strojů a dolů a ihned opraví běžící poruchy. */
export function maintAll(s) {
  let n = 0;
  for (const b of s.list) {
    if (b.k !== 'machine' && b.k !== 'miner') continue;
    if (!b.mt || b.fix > 0) {
      b.mt = true; b.mtbf = null;
      if (b.fix > 0) { b.fix = 0; b.st = b.k === 'miner' ? 'run' : 'idle'; }
      n++;
    }
  }
  return n;
}

/** Vylepší o jednu úroveň všechny budovy, na které hráč má peníze. */
export function upgradeAll(s) {
  let n = 0;
  for (const b of s.list) if (upgradeCost(b) && upgrade(s, b)) n++;
  return n;
}

function findFit(s, b, w, h, f) {
  const cx = b.x + (b.w ?? 1) / 2, cy = b.y + (b.h ?? 1) / 2;
  const cands = [];
  for (let dy = -(h - 1); dy <= (b.h ?? 1) - 1; dy++) {
    for (let dx = -(w - 1); dx <= (b.w ?? 1) - 1; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (x + w <= b.x || x >= b.x + (b.w ?? 1) || y + h <= b.y || y >= b.y + (b.h ?? 1)) continue;
      let ok = true, extraUsd = 0;
      const needHall = [], needFloor = [];
      for (let j = 0; j < h && ok; j++) for (let i = 0; i < w && ok; i++) {
        const X = x + i, Y = y + j, k = key(X, Y), o = at(s, X, Y);
        if (s._world.terrain(X, Y) === T.WATER) ok = false;
        else if (s.dug[k * 8] > 0) ok = false;
        else if ((o && o !== b) || s._road.has(k)) ok = false;
        else if (f && indoor(f)) {
          if (!s._hall.has(k)) {
            if (!unlocked(s, LOGI.hall.req) || Math.max(s._world.height(X, Y), s._world.height(X + 1, Y + 1), s._world.height(X + 1, Y), s._world.height(X, Y + 1)) > 0.05) ok = false;
            else { needHall.push(k); extraUsd += LOGI.hall.usd; }
          }
          if (ok && f.clean && !s._floor.has(k)) {
            if (!unlocked(s, LOGI.floor.req)) ok = false;
            else { needFloor.push(k); extraUsd += LOGI.floor.usd; }
          }
        }
      }
      if (ok && f?.kind === 'm_miner' && !findOre(s, x + (w >> 1), y + (h >> 1), f.reach, 0, 0)) ok = false;
      if (ok) cands.push({ x, y, extraUsd, needHall, needFloor, d: Math.hypot(x + w / 2 - cx, y + h / 2 - cy) });
    }
  }
  cands.sort((a, c) => a.d - c.d);
  return cands[0] ?? null;
}

function evoSpec(b, id) {
  if (!b) return null;
  if (b.k === 'hub' && b.dump && id === 'depot') return { def: LOGI.depot, usd0: LOGI.dump.usd, indoorDef: null };
  const m = MODELS[b.model], f = MODELS[id];
  if (m && f && f.kind === m.kind && (f.w > m.w || f.h > m.h) && f.w >= m.w && f.h >= m.h && f.usd > m.usd) return { def: f, usd0: m.usd, indoorDef: f };
  return null;
}

/** Odemčené větší modely, na které jde budovu přímo povýšit (včetně přestavby Polního skladu na Depo). */
export const evolutions = (s, b) => {
  if (!b) return [];
  if (b.k === 'hub' && b.dump) return unlocked(s, LOGI.depot.req) ? [{ id: 'depot', ...LOGI.depot }] : [];
  const m = MODELS[b.model];
  if (!m) return [];
  return Object.values(MODELS)
    .filter((f) => f.kind === m.kind && (f.w > m.w || f.h > m.h) && f.w >= m.w && f.h >= m.h && f.usd > m.usd && unlocked(s, f.req))
    .sort((x, y) => x.usd - y.usd);
};

/** Cena povýšení budovy na větší model (včetně případné přístavby haly/podlahy a po odečtení již zaplacených vylepšení). */
export function upgradeModelCost(s, b, id) {
  const sp = evoSpec(b, id);
  if (!sp) return null;
  const fit = findFit(s, b, sp.def.w, sp.def.h, sp.indoorDef);
  return Math.max(0, sp.def.usd - sp.usd0 - paidUp(b)) + (fit?.extraUsd ?? 0);
}

/** Zkontroluje, zda jde budovu povýšit na větší model; vrací null, nebo důvod chyby. */
export function upgradeModelErr(s, b, id) {
  const sp = evoSpec(b, id);
  if (!sp) return 'Na tento model povýšit nelze';
  if (!unlocked(s, sp.def.req)) return 'Nejdřív odemkni ve Stromu rozvoje';
  const fit = findFit(s, b, sp.def.w, sp.def.h, sp.indoorDef);
  if (!fit) return `Kolem budovy není volné místo ${sp.def.w}×${sp.def.h} m`;
  const usd = Math.max(0, sp.def.usd - sp.usd0 - paidUp(b)) + fit.extraUsd;
  return s.sandbox || s.money >= usd ? null : `Chybí peníze (${usd} $)`;
}

/** Povýší budovu na větší model (např. Minirypadlo → CAT 320D nebo Polní sklad → Logistické depo). */
export function upgradeModel(s, b, id) {
  const err = upgradeModelErr(s, b, id);
  if (err) return { err };
  const sp = evoSpec(b, id), fit = findFit(s, b, sp.def.w, sp.def.h, sp.indoorDef);
  const usd = Math.max(0, sp.def.usd - sp.usd0 - paidUp(b)) + fit.extraUsd;
  pay(s, usd, true);
  for (let j = 0; j < (b.h ?? 1); j++) for (let i = 0; i < (b.w ?? 1); i++) s._grid.delete(key(b.x + i, b.y + j));
  for (const k of fit.needHall) s._hall.add(k);
  for (const k of fit.needFloor) s._floor.add(k);
  if (fit.needHall.length || fit.needFloor.length) s._grev++;
  b.x = fit.x; b.y = fit.y; b.w = sp.def.w; b.h = sp.def.h;
  if (b.k === 'hub') {
    delete b.dump;
    b.lv = 0; b.mods = [];
  } else {
    Object.assign(b, { model: id, lv: 0, mods: [], staff: undefined, cur: null, _need: null, build: !s.sandbox && sp.def.buildDays ? sp.def.buildDays * 24 : 0 });
    if (b.build > 0) b.st = 'build';
  }
  occupy(s, b); s._dirty = true; s._rev++;
  return { ok: true, b };
}

/** Napojí silnicí všechny nenapojené doly a venkovní pece/elektrárny ke Skladu. */
export function connectAllRoads(s) {
  let n = 0;
  for (const b of s.list) {
    const m = b.model && MODELS[b.model];
    if (!m) continue;
    const isOutdoor = (b.k === 'miner' && m.kind !== 'm_drill') || (b.k === 'machine' && KINDS[m.kind].cat === 'Suroviny');
    if (!isOutdoor) continue;
    const res = autoConnectRoad(s, b);
    if (res.ok && res.tiles?.length) n++;
  }
  return n;
}

export function finishBuildNow(s, b) {
  if (!b || !(b.build > 0)) return false;
  b.build = 0; b.st = b.k === 'miner' ? 'run' : 'idle';
  return true;
}

export function fixBrokenNow(s, b) {
  if (!b || !(b.fix > 0)) return false;
  b.fix = 0; b.st = b.k === 'miner' ? 'run' : 'idle';
  return true;
}

/** Rozšíří tovární halu (a volitelně čistý prostor) kolem Skladu. */
export function expandHall(s, halfW = 8, halfH = 6, withFloor = false) {
  let n = 0;
  for (let y = -halfH; y <= halfH; y++) for (let x = -halfW; x <= halfW; x++) {
    if (!s._hall.has(key(x, y)) && !canPlace(s, 'hall', x, y)) { place(s, 'hall', x, y); n++; }
    if (withFloor && !s._floor.has(key(x, y)) && !canPlace(s, 'floor', x, y)) { place(s, 'floor', x, y); n++; }
  }
  return n;
}

/** Postaví Polní sklad (2×2) těsně vedle dolu nebo pece pro okamžité ukládání hlušiny a přebytečných surovin. */
export function buildDumpNextTo(s, b) {
  if (!b) return { err: 'Chybí budova' };
  if (s._dirty) rebuild(s);
  if (b._adj?.hub) return { ok: true, hub: b._adj.hub, already: true };
  if (!s.sandbox && s.money < LOGI.dump.usd) return { err: `Potřebuješ ${LOGI.dump.usd} $` };
  const cands = [], seen = new Set();
  for (let py = b.y - 2; py <= b.y + b.h; py++) for (let px = b.x - 2; px <= b.x + b.w; px++) {
    const touchesX = (px + 2 === b.x || px === b.x + b.w) && py + 2 > b.y && py < b.y + b.h;
    const touchesY = (py + 2 === b.y || py === b.y + b.h) && px + 2 > b.x && px < b.x + b.w;
    if (!touchesX && !touchesY) continue;
    const k = key(px, py);
    if (seen.has(k) || canPlace(s, 'dump', px, py)) continue;
    seen.add(k);
    let oreTiles = 0, dugTiles = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (oreAt(s, px + i, py + j)) oreTiles++;
      if (s.dug[key(px + i, py + j) * 8] > 0) dugTiles++;
    }
    cands.push({ px, py, score: oreTiles * 10 + dugTiles });
  }
  if (!cands.length) return { err: 'Vedle budovy není volné místo 2×2 m (překáží voda, stavba nebo silnice)' };
  cands.sort((a, c) => a.score - c.score);
  const res = place(s, 'dump', cands[0].px, cands[0].py);
  if (res.err) return res;
  rebuild(s);
  if (b.out?.length) {
    emit(s, b);
    if (b.st === 'full' && b.out.length < pileOf(b)) b.st = b.k === 'miner' ? 'run' : 'idle';
  }
  return { ok: true, hub: res.b };
}

/** Postaví nejlepší dostupný důl na zvolený nerost, najme 3 směny a natáhne silnici do Skladu. */
export function buildMineWithRoad(s, oreId = 'coal') {
  const oi = ORES.findIndex((o) => o?.id === oreId);
  if (oi <= 0) return { err: 'Neznámý nerost' };
  const models = ['miner_cat320', 'miner_u17', 'miner_u17_used', 'quarry_hand'].filter((id) => unlocked(s, MODELS[id].req) && (s.sandbox || s.money >= MODELS[id].usd));
  if (!models.length) return { err: 'Nedostatek peněz nebo výzkumu na důl' };
  const id = models[0], md = MODELS[id], starter = STARTERS.find(([idx]) => idx === oi);
  const cx0 = starter ? starter[1] : 0, cy0 = starter ? starter[2] : 0;
  let spotPos = null;
  for (let rad = 0; rad <= 320 && !spotPos; rad += rad < 60 ? 1 : 4) {
    for (let dy = -rad; dy <= rad && !spotPos; dy++) for (let dx = -rad; dx <= rad && !spotPos; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
      const x = cx0 + dx, y = cy0 + dy;
      if (survey(s, x + (md.w >> 1), y + (md.h >> 1), md.reach, 0)[oi] > 0 && !canPlace(s, id, x, y)) spotPos = [x, y];
    }
  }
  if (!spotPos) return { err: `V okolí není volné ložisko (${ORES[oi].name})` };
  const res = place(s, id, spotPos[0], spotPos[1]);
  if (res.err) return res;
  setStaff(s, res.b, 99);
  res.b.build = 0; res.b.st = 'run';
  autoConnectRoad(s, res.b);
  return { b: res.b, x: res.b.x, y: res.b.y };
}

/** Postaví kompletní provoz nebo automatizovanou továrnu na 1 klik včetně haly, smyčky, třídiče a zásobování. */
export function buildFactory(s, routeId) {
  const r = ROUTES[routeId];
  if (!r) return { err: 'Neznámý výrobní postup' };
  if (!unlocked(s, r.req) && !unlockWithReqs(s, r.req)) return { err: `Chybí body rozvoje na: ${RESEARCH.find((x) => x.id === r.req)?.name ?? r.req}` };
  if (r.tape && !taped(s, r.tape) && !tapeout(s, r.tape)) return { err: `Na návrh čipu potřebuješ ${Math.round(CHIPS[r.tape].mask)} $` };

  const inKeys = [...new Set(r.ops.flatMap((op) => Object.keys(op.in ?? {})))];
  for (const it of inKeys) s.autoSell[it] = false;

  // venkovní výroba surovin (sklárna, elektrárna, křemík)
  if (KINDS[r.ops[0].kind].cat === 'Suroviny') {
    const ms = Object.values(MODELS).filter((m) => canDo(m, r, r.ops[0]) && unlocked(s, m.req)).sort((a, b) => a.usd - b.usd);
    const m = ms[0];
    if (!m) return { err: 'Není odemčený žádný vhodný stroj' };
    if (!s.sandbox && s.money < m.usd) return { err: `Potřebuješ ${Math.round(m.usd)} $` };
    let pos = null;
    for (let rad = 3; rad <= 75 && !pos; rad++) {
      for (let dy = -rad; dy <= rad && !pos; dy++) for (let dx = -rad; dx <= rad && !pos; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        if (!canPlace(s, m.id, dx, dy)) pos = [dx, dy];
      }
    }
    if (!pos) return { err: 'V okolí není volné místo' };
    const res = place(s, m.id, pos[0], pos[1]);
    if (res.err) return res;
    const b = res.b;
    b.build = 0; b.st = 'idle'; b.prod = r.id;
    setStaff(s, b, 99);
    for (const [it, q] of Object.entries(r.ops[0].in ?? {})) {
      if (canBuy(s, it)) {
        const want = Math.max(1, Math.ceil(q * 4));
        if ((s.inv[it] ?? 0) < want) buy(s, it, want - (s.inv[it] ?? 0));
        s.autoBuy[it] = Math.max(s.autoBuy[it] ?? 0, want);
      }
    }
    autoConnectRoad(s, b);
    return { b, x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  // halová výrobní linka na smyčce dopravníků
  const picked = [];
  for (const op of r.ops) {
    const ms = Object.values(MODELS).filter((m) => canDo(m, r, op) && unlocked(s, m.req)).sort((a, b) => a.usd - b.usd);
    if (!ms.length) return { err: `Chybí výzkum pro stroj: ${KINDS[op.kind].name}` };
    picked.push(ms[0]);
  }
  const ids = [...new Set(picked.map((m) => m.id))];
  const stepNeedsIn = new Set(ids.filter((id) => r.ops.some((op) => op.kind === MODELS[id].kind && Object.keys(op.in ?? {}).length > 0)));
  if (!unlocked(s, 'depot') && !unlockWithReqs(s, 'depot')) return { err: 'Odemkni nejdřív Logistické depo (Doprava)' };
  if (!unlocked(s, 'belt') && !unlockWithReqs(s, 'belt')) return { err: 'Odemkni nejdřív Dopravníky nebo Dílnu elektroniky' };

  const slots = [];
  let relX = 1;
  for (const id of ids) {
    const m = MODELS[id], depot = stepNeedsIn.has(id);
    slots.push({ id, m, rx: relX, depot });
    relX += Math.max(m.w + 1, depot ? 5 : m.w + 1);
  }
  const W = Math.max(relX + 1, 8), maxH = Math.max(...slots.map((x) => x.m.h + (x.depot ? 4 : 0)), 2);
  const minY = -maxH, maxY = 2; // hala [OX..OX+W, OY+minY..OY+1], výstupní depo [OX+W+2..OX+W+5, OY-1..OY+2]

  const isFreeRect = (ox, oy) => {
    for (let y = oy + minY; y <= oy + maxY; y++) for (let x = ox; x <= ox + W + 5; x++) {
      if (s._world.terrain(x, y) === T.WATER || at(s, x, y) || s._road.has(key(x, y)) || s.dug[key(x, y) * 8] > 0) return false;
      if (Math.max(s._world.height(x, y), s._world.height(x + 1, y), s._world.height(x, y + 1), s._world.height(x + 1, y + 1)) > 0.05) return false;
    }
    return true;
  };
  let OX = null, OY = null;
  for (let rad = 6; rad <= 72 && OX === null; rad += 3) {
    for (let dy = -rad; dy <= rad && OX === null; dy += 3) for (let dx = -rad; dx <= rad && OX === null; dx += 3) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
      if (isFreeRect(dx, dy)) { OX = dx; OY = dy; }
    }
  }
  if (OX === null) return { err: 'Nenašlo se dost velké rovné místo bez překážek' };

  const needClean = slots.some((x) => x.m.clean);
  if (needClean && !unlocked(s, LOGI.floor.req) && !unlockWithReqs(s, LOGI.floor.req)) return { err: 'Chybí výzkum pro čistý prostor ISO 5' };

  // orientační kontrola ceny před stavbou
  let newHall = 0, newFloor = 0;
  const machTop = OY - Math.max(...slots.map((x) => x.m.h));
  for (let y = machTop; y <= OY + 1; y++) for (let x = OX; x <= OX + W; x++) {
    if (!s._hall.has(key(x, y))) newHall++;
    if (needClean && !s._floor.has(key(x, y))) newFloor++;
  }
  const estUsd = slots.reduce((a, x) => a + x.m.usd + (x.depot ? LOGI.depot.usd : 0), 0)
    + newHall * LOGI.hall.usd + newFloor * LOGI.floor.usd
    + (2 * W + 1) * LOGI.belt.usd + LOGI.sorter.usd + LOGI.depot.usd;
  if (!s.sandbox && s.money < estUsd) return { err: `Na tuto továrnu potřebuješ asi ${Math.round(estUsd).toLocaleString('cs')} $` };

  for (let y = machTop; y <= OY + 1; y++) for (let x = OX; x <= OX + W; x++) {
    if (!s._hall.has(key(x, y))) place(s, 'hall', x, y);
    if (needClean && !s._floor.has(key(x, y))) place(s, 'floor', x, y);
  }
  for (let x = OX; x < OX + W; x++) place(s, 'belt', x, OY, 0);
  for (let x = OX + W; x > OX; x--) place(s, 'belt', x, OY + 1, 2);
  place(s, 'belt', OX, OY + 1, 3);
  const target = r.out ? Object.keys(r.out)[0] : r.cat === 'fab' ? 'wl_' + r.chip : r.chip;
  const srt = place(s, 'sorter', OX + W, OY);
  if (srt.b) srt.b.f = target;
  place(s, 'belt', OX + W + 1, OY, 0);
  place(s, 'depot', OX + W + 2, OY - 1);

  let first = null;
  for (const sl of slots) {
    const mx = OX + sl.rx, my = OY - sl.m.h;
    const res = place(s, sl.id, mx, my, 0);
    if (res.b) {
      res.b.build = 0; res.b.st = 'idle';
      setStaff(s, res.b, 99);
      if (!first) { res.b.prod = r.id; first = res.b; }
    }
    if (sl.depot) place(s, 'depot', mx, my - 4);
  }

  for (const op of r.ops) for (const [it, q] of Object.entries(op.in ?? {})) {
    if (canBuy(s, it)) {
      const want = Math.max(2, Math.ceil(q * 2));
      if ((s.inv[it] ?? 0) < want) buy(s, it, Math.min(want - (s.inv[it] ?? 0), s.sandbox ? want : Math.floor(s.money / ITEMS[it].usd)));
      s.autoBuy[it] = Math.max(s.autoBuy[it] ?? 0, want);
    }
  }
  if (r.cat === 'fab') {
    s.autoBuy.fabchem = Math.max(s.autoBuy.fabchem ?? 0, 10);
    if ((s.inv.fabchem ?? 0) < 2 && s.money >= ITEMS.fabchem.usd * 2) buy(s, 'fabchem', 2);
  }
  return { b: first, x: OX + W / 2, y: OY };
}
