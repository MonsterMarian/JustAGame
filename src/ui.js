// Ovládání a panely: stavební menu, vstup myši a kláves, inspektor budovy, okna Trh / Čipy / Výzkum / Postupy / Menu.
import { G, CAM0, fmt, num } from './g.js';
import * as sim from './sim.js';
import { MODELS, ITEMS, CHIPS, KINDS, CATS, UNIT, HW, HOUR, CARS, BUYERS, yieldOf } from '../data/catalog.js';
import { ROUTES, STARTS, RESEARCH, LANES, QUESTS, MISSIONS, PROC, MATS, FAB, canDo, econ } from '../data/routes.js';
import { MACHINE_BUY } from '../data/hw/buy_machines.js';
import { ORES, LEVEL_M, STARTERS } from './world.js';
import { pick as pick3d, pickThing } from './world3d.js';
import { icon, CAT_COL } from './sprites.js';
import { sfx, audio } from './audio.js';

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs ?? {}) {
    const v = attrs[k];
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hours = (x) => (x < 1 ? `${Math.max(1, Math.round(x * 60))} min` : x < 48 ? `${num(x, 1)} h` : `${num(x / 24, 1)} dne`);
const TIER = { hobby: 'dílna', used: 'repasovaný', new: 'nový' };
const GLYPH = { road1: '┅', road2: '═', road3: '▬', hall: '⌂', belt: '➔', junction: '✛', splitter: '⑂', sorter: '◇', unloader: '⇥', depot: '▣', floor: '▦' };
const ROAD_ORDER = ['road1', 'road2', 'road3'], LOGI_ORDER = ['hall', 'belt', 'junction', 'splitter', 'sorter', 'unloader', 'depot', 'floor'];
const RECT = { hall: 'Hala', floor: 'Čistý prostor' }; // tyhle stavby se pokládají tažením obdélníku
const ROUTE_CATS = { smt: 'Osazování desek', build: 'Sestavy PC', pcb: 'Výroba DPS', fab: 'Čipy: výroba na waferu', pkg: 'Čipy: pouzdření a test', passive: 'Pasivní součástky a mechanika', bulk: 'Křemík', wafer: 'Ingoty a wafery' };
// štítek původu ceny: doloženo zdrojem / odhad
const badge = (f) => h('span', { class: 'badge ' + (f.fact === 'doc' ? 'doc' : 'est'), title: f.note ?? '' }, f.fact === 'doc' ? 'DOLOŽENO' : 'ODHAD');
const link = (url, text = 'zdroj') => url && h('a', { href: url, target: '_blank', rel: 'noreferrer' }, text + ' ↗');
const kv = (k, ...v) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, ...v));
const reqName = (req) => [req].flat().map((r) => RESEARCH.find((x) => x.id === r)?.name ?? r).join(' nebo ');
// marže jedné dávky, když se všechny díly koupí na Trhu (bez elektřiny)
const margin = (r) => { const e = econ(r), m = e.out - e.parts - e.opex; return e.out ? h('span', { class: m < 0 ? 'warn' : '' }, `${m < 0 ? 'ztráta' : 'zisk'} ${fmt(Math.abs(m))} na dávku`) : 'lot waferů se neprodává, zpracuje ho pouzdření'; };

let stockSig = null, goalSig = '', dealSig = '';
let api, cat = 'Osazování', modal = null, panelDyn = null, viewer = null, drag = null, lastSlow = 0, lastMini = 0, lastCoin = 0;
const keys = new Set(), sales = new Map();

// ---------------------------------------------------------------- hlášky
export function toast(text, kind = '', life = 4000) {
  const e = h('div', { class: 'toast ' + kind }, text);
  $('toasts').prepend(e);
  while ($('toasts').children.length > 6) $('toasts').lastChild.remove();
  setTimeout(() => e.remove(), life);
  return e;
}
function saleToast(it, usd) { // tržby za stejnou položku se sčítají do jedné hlášky
  let t = sales.get(it);
  if (!t || !t.el.isConnected) { t = { el: toast('', 'sale', 3500), usd: 0 }; sales.set(it, t); }
  t.usd += usd; t.el.textContent = `+${fmt(t.usd)} · ${ITEMS[it].name}`;
}

// ---------------------------------------------------------------- stavební menu
function pick(id) {
  G.tool = G.tool === id ? null : id; G.plan = null;
  if (G.tool) select(null);
  for (const b of $('tools').children) b.classList.toggle('on', b.dataset.id === G.tool);
  modeUI();
  sfx('click');
}
// Pruh nad stavebním menu, barevný rámeček okna, kurzor a štítek u kurzoru říkají, jestli se zrovna staví, bourá, nebo jen prohlíží.
function modeUI() {
  const t = G.tool, f = t && t !== 'demolish' ? sim.defOf(t) : null;
  document.body.dataset.mode = !t ? '' : f ? 'build' : 'demolish';
  $('mode').replaceChildren(h('b', null, !t ? 'Prohlížíš' : f ? 'Stavíš' : 'Bouráš'), h('span', null, !t ? 'Klik na budovu ji vybere. Levé tlačítko táhne mapu, pravé otáčí pohled, kolečko přibližuje.'
    : f ? `${f.name} · ${fmt(f.usd)}. ${RECT[t] ? 'Táhni obdélník.' : f.road ? 'Klikni na začátek a pak na konec, třeba na lom a na Sklad. Cesta mezi nimi se postaví sama.' : t === 'belt' ? 'Klikni nebo táhni.' : 'Klikni na místo.'}${f.road || RECT[t] ? '' : ' R otáčí.'} Esc nebo pravé tlačítko: konec stavění.`
      : 'Klik na stavbu nebo silnici ji zbourá a vrátí cenu. Esc nebo pravé tlačítko: konec bourání.'));
  $('ctag').textContent = f ? (f.road ? `${f.name}: klikni na začátek` : `Stavíš: ${f.name}`) : 'Bouráš';
  if (!t) $('ctag').hidden = true;
  G.hot = null; $('view').classList.remove('hot');
}
// Co pec nebo huť spotřebuje a co z toho je (stroje, které umějí jedinou věc).
const short = (it) => ITEMS[it].name.split(' (')[0].toLowerCase();
function recipe(m) {
  const r = (STARTS[m.kind] ?? []).length === 1 && KINDS[m.kind].cat === 'Suroviny' && ROUTES[STARTS[m.kind][0]];
  return r && kv('Vyrábí', `${Object.entries(r.ops[0].in ?? {}).map(([it, q]) => `${num(q, 2)} t ${short(it)}`).join(' + ')} → ${Object.entries(r.out).map(([it, q]) => `${num(q, 2)} t ${short(it)}`).join(', ')}`);
}
function toolTip(id) {
  const f = sim.defOf(id), m = MODELS[id];
  if (!m) return [h('b', null, f.name), h('p', null, f.what), kv('Cena', fmt(f.usd), RECT[id] ? ' za m²' : id === 'belt' || f.road ? ' za metr' : ''), f.note && h('p', { class: 'dim' }, f.note)];
  const kd = KINDS[m.kind];
  return [h('b', null, m.name), h('div', { class: 'dim' }, `${kd.name} · ${TIER[m.tier]}`), kv('Cena', fmt(m.usd), ' ', badge(m)), kv('Výkon', `${num(m.rate, m.rate < 10 ? 2 : 0)} ${m.crew ? 't za hodinu práce' : UNIT[kd.u]}`, m.crew ? [' ', badge({ fact: m.rateFact, note: 'výkon stroje' })] : ''),
    m.kw > 0 && kv('Příkon', `${num(m.kw, 1)} kW`), kv('Půdorys', `${m.w} × ${m.h} m`), m.wafer && kv('Wafery', m.wafer.join(' / ') + ' mm'), m.res && kv('Rozlišení', `${num(m.res)} nm`),
    m.clean && h('div', { class: 'warn' }, 'Musí stát v čistém prostoru'), recipe(m), m.note && !HW[m.kind] && h('p', { class: 'dim' }, m.note), HW[m.kind] && h('p', null, HW[m.kind].what)];
}
function tip(anchor, content) {
  const t = $('tip');
  if (!anchor) { t.hidden = true; return; }
  t.replaceChildren(...[content].flat().filter(Boolean)); t.hidden = false;
  const r = anchor.getBoundingClientRect();
  t.style.left = clamp(r.left, 8, innerWidth - t.offsetWidth - 8) + 'px'; t.style.top = Math.max(8, r.top - t.offsetHeight - 8) + 'px';
}
export function renderBuild() {
  const s = G.s, idsOf = (c) => (c === 'Doprava' ? ROAD_ORDER : c === 'Logistika' ? LOGI_ORDER : Object.values(MODELS).filter((m) => KINDS[m.kind].cat === c).sort((a, b) => a.usd - b.usd).map((m) => m.id));
  const opened = (c) => idsOf(c).filter((id) => sim.unlocked(s, sim.defOf(id).req));
  const cats = CATS.filter((c) => opened(c).length); // záložky, ve kterých zatím nic není, se neukazují
  if (!cats.includes(cat)) cat = cats[0];
  $('cats').replaceChildren(...cats.map((c) => h('button', { class: c === cat ? 'on' : '', 'data-c': c, style: `--c:${CAT_COL[c]}`, onclick: () => { cat = c; renderBuild(); } }, c)));
  const ids = idsOf(cat), open = opened(cat);
  const btns = open.map((id) => { const f = sim.defOf(id); return h('button', { class: 'tool' + (G.tool === id ? ' on' : ''), 'data-id': id, 'data-usd': f.usd, onclick: () => pick(id), onmouseenter: (e) => tip(e.currentTarget, toolTip(id)), onmouseleave: () => tip() },
    MODELS[id] ? icon(id, 34) : f.road ? h('span', { class: 'sw r' + f.road }) : h('span', { class: 'glyph' }, GLYPH[id]), h('b', null, f.name), h('i', null, fmt(f.usd))); });
  for (const id of ids.filter((x) => !open.includes(x))) { // zamčené: je vidět, co přijde, a klik otevře Strom na správném místě
    const f = sim.defOf(id), node = RESEARCH.find((r) => r.id === [f.req].flat()[0]);
    btns.push(h('button', { class: 'tool lock', title: `Odemkni ve Stromu rozvoje: ${node?.name} (★ ${node?.pts})`, onclick: () => { tsel = node?.id; openModal('research', true); } }, h('span', { class: 'glyph' }, '🔒'), h('b', null, f.name), h('i', null, `★ ${node?.pts}`)));
  }
  if (cat === 'Logistika' || cat === 'Doprava') btns.push(h('button', { class: 'tool' + (G.tool === 'demolish' ? ' on' : ''), 'data-id': 'demolish', onclick: () => pick('demolish') }, h('span', { class: 'glyph' }, '✕'), h('b', null, 'Bourat'), h('i', null, 'vrací plnou cenu')));
  $('tools').replaceChildren(...btns);
}

// ---------------------------------------------------------------- myš a klávesy
const tileOf = (e) => pick3d(e.clientX, e.clientY) ?? G.hover ?? { x: 0, y: 0, fx: 0, fy: 0 };
function use(t, loud, hit) { // hit = stroj, na jehož těleso se kliklo; v šikmém pohledu leží dlaždice pod kurzorem až za ním
  const s = G.s;
  if (G.tool === 'demolish') {
    const b = hit || sim.at(s, t.x, t.y);
    if (b ? sim.remove(s, b) : sim.removeGround(s, t.x, t.y)) { sfx('remove'); if (G.sel === b) select(null); }
    return;
  }
  const [w, hh] = sim.sizeOf(G.tool, G.rot), r = sim.place(s, G.tool, t.x - ((w - 1) >> 1), t.y - ((hh - 1) >> 1), G.rot);
  if (!r.err) sfx('place');
  else if (loud || (r.err === 'Nedostatek peněz' && performance.now() - lastErr > 3000)) { toast(r.err, 'err'); sfx('error'); lastErr = performance.now(); } // při tažení se ozve jen došlá hotovost
}
let lastErr = 0;
function rectPlace({ a, b }) {
  const s = G.s, id = G.tool;
  let n = 0;
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) if (!sim.place(s, id, x, y).err) n++;
  if (n) { sfx('place'); toast(`${RECT[id]}: ${n} m² za ${fmt(n * sim.defOf(id).usd)}`, 'ok'); } else { toast(sim.canPlace(s, id, a.x, a.y) ?? 'Tady to postavit nejde', 'err'); sfx('error'); }
}
function stroke(a, b) { // tažení myší: dopravník se sám otáčí po směru tahu
  let { x, y } = a;
  while (x !== b.x || y !== b.y) {
    const px = x, py = y;
    if (x !== b.x) x += Math.sign(b.x - x); else y += Math.sign(b.y - y);
    if (G.tool === 'belt') { G.rot = x > px ? 0 : x < px ? 2 : y > py ? 1 : 3; sim.place(G.s, 'belt', px, py, G.rot); }
    use({ x, y }, false);
  }
}
function planTo(t) { // návrh silnice od začátku k dlaždici pod kurzorem: náhled ve světě, délka a cena u kurzoru
  const p = G.plan, r = sim.planRoad(G.s, G.tool, p.a, t);
  p.b = t; p.tiles = r?.tiles ?? []; p.usd = r?.usd ?? 0; p.ok = !!r && (G.s.sandbox || G.s.money >= p.usd);
  $('ctag').textContent = !r ? 'Sem cesta nevede' : `${sim.defOf(G.tool).name}: ${p.tiles.length} m za ${fmt(p.usd)}${p.ok ? ', klikni na konec' : ', chybí peníze'}`;
}
function finishRoad() {
  const p = G.plan, name = sim.defOf(G.tool).name;
  G.plan = null;
  if (sim.buildRoad(G.s, G.tool, p)) { sfx('place'); toast(`${name}: postaveno ${p.tiles.length} m za ${fmt(p.usd)}. Auta po ní začnou jezdit sama.`, 'ok'); }
  else { toast(p.tiles?.length ? `Na tuhle cestu chybí peníze: stojí ${fmt(p.usd)}` : 'Mezi těmi dvěma místy cesta postavit nejde', 'err'); sfx('error'); }
  modeUI();
}
// Pruhy se stavem budovy po vzoru Mindustry: text uvnitř, výplň = jak je plno. U dolu těžba, hromada a ložisko, u pece vstupy, hotové zboží a tavba; pod tím lidé.
function barsOf(s, b) {
  const m = MODELS[b.model], out = [];
  const row = (text, part, col = 'var(--amber)') => out.push(h('div', { class: 'mbar' }, h('i', { style: `width:${Math.max(0, Math.min(1, part)) * 100}%;background:${col}` }), h('span', null, text)));
  if (!m) return out;
  const bo = sim.boost(b), run = b.st === 'run';
  if (b.k === 'miner') {
    if (m.kind === 'm_drill') return out;
    const [cx, cy] = sim.centerOf(b), left = b.oi ? sim.survey(s, cx, cy, m.reach, m.kind === 'm_shaft' ? b.goal : 0)[b.oi] ?? 0 : 0;
    row(`Těžba ${run ? num(m.rate * bo * 24, 1) : 0} t za den` + (b.oi ? ` · ${ORES[b.oi].name}` : '') + ` (${num(m.rate * (1 + 0.5 * (b.lv ?? 0)), 2)} t za hodinu práce)`, run ? 1 : 0, 'var(--ok)');
    row(`Hromada ${b.out.length} z ${sim.PILE} t`, b.out.length / sim.PILE);
    row(`Ložisko v dosahu: zbývá ${num(left)} t`, left > 0 ? 1 : 0, '#8a6a45');
  } else if (KINDS[m.kind].cat === 'Suroviny' && ROUTES[b.prod]?.power) { // elektrárna: uhlí, výkon a zásobník proudu
    const cap = sim.capOf(b);
    for (const it in cap) row(`${short(it)} ${Math.floor(b.buf[it] ?? 0)} z ${cap[it]} t`, (b.buf[it] ?? 0) / cap[it], '#6f9be0');
    row(`Výkon ${run ? num(m.rate * bo, 2) : 0} MW průměrně (${num(m.rate, 0)} MW při práci) · spálí ${num(m.rate * bo * 24 * ROUTES.power.ops[0].in.coal, 1)} t uhlí za den`, run ? 1 : 0, 'var(--ok)');
    row(`Zásobník proudu ${num(s.mwh, 1)} z ${sim.GRID_MWH} MWh · přebytek se prodává do sítě`, s.mwh / sim.GRID_MWH);
  } else if (KINDS[m.kind].cat === 'Suroviny' && ROUTES[b.prod]?.out) {
    const cap = sim.capOf(b);
    for (const it in cap) row(`${short(it)} ${Math.floor(b.buf[it] ?? 0)} z ${cap[it]} t`, (b.buf[it] ?? 0) / cap[it], '#6f9be0');
    row(`Hotovo: ${Object.keys(ROUTES[b.prod].out).map(short).join(', ')} ${b.out.length} z ${sim.PILE}`, b.out.length / sim.PILE);
    row(b.job ? `Tavba ${Math.round((b.job.t / b.job.T) * 100)} %` : 'Netaví', b.job ? b.job.t / b.job.T : 0, 'var(--ok)');
    const r = ROUTES[b.prod], perDay = (24 * bo * (m.rate / KINDS[m.kind].ref)) / r.ops[0].h; // dávek za den
    row(`Za den: ${Object.entries(r.ops[0].in ?? {}).map(([it, q]) => `${num(q * perDay, 2)} t ${short(it)}`).join(' + ')} → ${Object.entries(r.out).map(([it, q]) => `${num(q * perDay, 2)}× ${short(it)}`).join(', ')}`, 0);
  } else return out;
  if (m.crew) row(`Lidé ${sim.staffed(b)} z ${3 * m.crew} · pracuje ${num(sim.hoursOf(b), 0)} h denně`, sim.staffed(b) / (3 * m.crew), '#b08d57');
  return out;
}
const tipBody = (b) => [h('b', null, b.model ? MODELS[b.model].name : b.k === 'npc' ? b.name : b.k === 'hub' ? (b.hq ? 'Sklad' : 'Logistické depo') : sim.defOf(b.k).name),
  h('div', { class: 'dim' }, (b.model && sim.statusOf(G.s, b)) || (b.k === 'npc' ? `vykupuje: ${BUYERS[b.t].buys.map((it) => ITEMS[it].name).join(', ')}` : 'kliknutím otevřeš podrobnosti')), ...barsOf(G.s, b)];
let lastHover = 0, lastPrev = null;
function hoverTip(e) { // bublina se jménem a stavem stroje pod kurzorem
  const t = $('tip');
  if (performance.now() - lastHover < 70) return;
  lastHover = performance.now();
  const b = !G.tool && pickThing(e.clientX, e.clientY)?.b;
  G.hot = b || null; $('view').classList.toggle('hot', !!b); // bílý rámeček a ručička: na tohle jde kliknout
  if (!b) { if (t.dataset.w) { t.hidden = true; t.dataset.w = ''; } return; }
  t.replaceChildren(...tipBody(b));
  t.hidden = false; t.dataset.w = '1'; t.style.left = clamp(e.clientX + 14, 8, innerWidth - 320) + 'px'; t.style.top = e.clientY + 18 + 'px';
}
function bindInput() {
  const view = $('view');
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    const t = tileOf(e), rot = e.button !== 0 || e.shiftKey; // pravé nebo prostřední tlačítko, případně Shift + levé: otáčení pohledu
    drag = { btn: e.button, rot, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, a: t, last: t };
    if (rot) return;
    if (RECT[G.tool]) G.rect = { a: t, b: t };
    else if (sim.defOf(G.tool)?.road) { if (G.plan) finishRoad(); else { G.plan = { a: t }; planTo(t); } } // silnice: první klik je začátek, druhý konec
    else if (G.tool) use(t, true, G.tool === 'demolish' && pickThing(e.clientX, e.clientY)?.b);
  });
  view.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // prostřední tlačítko by jinak zapnulo automatické rolování
  view.addEventListener('pointermove', (e) => {
    const t = (G.hover = tileOf(e));
    G.mouse = { x: e.clientX, y: e.clientY };
    if (G.plan && (t.x !== G.plan.b?.x || t.y !== G.plan.b?.y)) planTo(t);
    const mm = MODELS[G.tool];
    if (mm?.kind === 'm_miner' && (t.x !== lastPrev?.x || t.y !== lastPrev?.y)) {
      lastPrev = t;
      const sv = sim.survey(G.s, t.x - ((mm.w - 1) >> 1) + (mm.w >> 1), t.y - ((mm.h - 1) >> 1) + (mm.h >> 1), mm.reach, 0), o = Object.keys(sv).sort((x, y) => sv[y] - sv[x])[0];
      $('ctag').textContent = o ? `${mm.name.split(':')[0]}: ${ORES[o].name}, ${num(mm.rate, 1)} t/h, v dosahu ${num(sv[o])} t` : `${mm.name.split(':')[0]}: tady není co těžit`;
    }
    if (G.tool) { const c = $('ctag'); c.hidden = false; c.style.left = e.clientX + 16 + 'px'; c.style.top = e.clientY + 22 + 'px'; }
    if (!drag) { hoverTip(e); return; }
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
    if (drag.rot) { // pravé tlačítko otáčí pohled
      if (drag.moved) { G.cam.yaw -= (e.clientX - drag.lx) * 0.006; G.cam.pitch = clamp(G.cam.pitch + (e.clientY - drag.ly) * 0.005, 0.12, 1.55); G.fly = null; G.moved = true; }
    } else if (!G.tool) { // posun: bod, který držíš, zůstává pod kurzorem
      if (drag.moved) { G.cam.x += drag.a.fx - t.fx; G.cam.y += drag.a.fy - t.fy; G.fly = null; G.moved = true; }
    } else if (t.x !== drag.last.x || t.y !== drag.last.y) { if (G.rect) G.rect = { a: drag.a, b: t }; else if (!G.plan) stroke(drag.last, t); drag.last = t; }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  view.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      if (drag.btn === 2) { if (G.plan) { G.plan = null; modeUI(); } else if (G.tool) pick(G.tool); else select(null); }
      else if (drag.btn === 0 && !drag.rot && !G.tool) {
        const th = pickThing(e.clientX, e.clientY);
        if (th?.roof) { G.fly = { x: drag.a.fx, y: drag.a.fy, z: 24 }; toast('Jsi v hale. Když pohled oddálíš, střecha se zase zavře.'); } // klik na střechu = vstup do haly
        else select(th?.b ?? sim.at(G.s, drag.a.x, drag.a.y) ?? null);
      }
    }
    if (G.plan?.b && drag?.btn === 0 && !drag.rot && drag.moved && (G.plan.b.x !== G.plan.a.x || G.plan.b.y !== G.plan.a.y)) finishRoad(); // tažení od začátku ke konci funguje taky
    if (G.rect) rectPlace(G.rect);
    drag = G.rect = null;
  });
  view.addEventListener('pointerleave', () => { G.hover = G.hot = null; $('tip').hidden = true; $('ctag').hidden = true; });
  view.addEventListener('dblclick', (e) => { if (!G.tool) { const p = tileOf(e); G.fly = { x: p.fx, y: p.fy }; } }); // dvojklik: přelet na to místo
  view.addEventListener('wheel', (e) => { // přiblížení k místu pod kurzorem
    e.preventDefault();
    const z0 = G.cam.z, z1 = clamp(z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 3, 120), p = tileOf(e), k = 1 - z0 / z1;
    G.cam.x += (p.fx - G.cam.x) * k; G.cam.y += (p.fy - G.cam.y) * k; G.cam.z = z1; G.fly = null; G.moved = true;
  }, { passive: false });
  $('minimap').addEventListener('pointerdown', (e) => { const m = G.mini, r = e.currentTarget.getBoundingClientRect(); if (m) { G.fly = null; G.cam.x = m.bx - m.half + ((e.clientX - r.left) / 2) * m.step; G.cam.y = m.by - m.half + ((e.clientY - r.top) / 2) * m.step; } });
  addEventListener('keydown', (e) => {
    if (G.title) { if (e.key === 'Escape' && modal) closeModal(); return; } // v hlavním menu klávesy hry neplatí
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 's') { e.preventDefault(); api.save(); toast('Hra uložena', 'ok'); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    keys.add(k);
    if (k === 'escape') { if (modal) closeModal(); else if (G.plan) { G.plan = null; modeUI(); } else if (G.tool) pick(G.tool); else if (G.sel) select(null); else openModal('menu'); }
    else if (k === 'r') G.rot = (G.rot + (e.shiftKey ? 3 : 1)) & 3;
    else if (k === 'x' || k === 'delete') pick('demolish');
    else if (k === 'g') toggleUnder();
    else if (k === 'f' && G.hover) { const b = sim.at(G.s, G.hover.x, G.hover.y); if (b && !b.hq && b.k !== 'npc') { G.rot = b.d ?? G.rot; const id = b.model ?? (b.k === 'hub' ? 'depot' : b.k); if (G.tool !== id) pick(id); } }
    else if (k === ' ') { e.preventDefault(); setSpeed(G.speed ? 0 : G.lastSpeed); }
    else if ('1234'.includes(k)) setSpeed([1, 3, 10, 30][+k - 1]);
    else if (k === 'h') home();
    else if (k === 'm') openModal('market'); else if (k === 'c') openModal('chips'); else if (k === 'v') openModal('research'); else if (k === 'p') openModal('routes'); else if (k === 'i') openModal('stats');
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
}
const home = () => { G.under = false; G.fly = { x: -2, y: -1, z: 30, pitch: 0.9 }; }; // zpět do dílny
const turn = (dir) => { G.fly = { ...G.fly, yaw: (G.fly?.yaw ?? G.cam.yaw) + (dir * Math.PI) / 4 }; G.moved = true; }; // otočení pohledu o osminu kruhu
const tilt = (pitch) => { G.fly = { ...G.fly, pitch }; G.moved = true; };
function toggleUnder() { // pohled pod zem a zpět
  G.under = !G.under;
  G.fly = G.under ? { pitch: 0.45, z: Math.min(G.cam.z, 9) } : { pitch: 0.9, z: Math.max(G.cam.z, 14) };
  if (G.under && !G.s.list.some((b) => b.dep > 0)) toast('Pod zemí je vidět jen to, co odkryl průzkumný vrt nebo důl. Zatím žádný nemáš (záložka Suroviny).', '', 7000);
  $('viewpad').querySelector('[data-under]').classList.toggle('on', G.under);
}
export function setSpeed(v) {
  G.speed = v; if (v) G.lastSpeed = v;
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.v === v);
}

// ---------------------------------------------------------------- inspektor vybrané budovy
const itemOptions = (cur, extra = []) => {
  const groups = {};
  for (const it of Object.values(ITEMS)) if (!it.wip) (groups[it.cat] ??= []).push(it);
  return [h('option', { value: '' }, '— nic —'), ...extra.map(([v, t]) => h('option', { value: v, selected: v === cur }, t)),
    ...Object.entries(groups).map(([c, list]) => h('optgroup', { label: c }, list.map((it) => h('option', { value: it.id, selected: it.id === cur }, it.name))))];
};
function select(b) {
  G.sel = b; viewer?.dispose(); viewer = null; panelDyn = null;
  const p = $('panel');
  p.hidden = !b;
  if (!b) return;
  const s = G.s, close = h('button', { class: 'x', onclick: () => select(null) }, '✕');
  const demolish = !b.hq && b.k !== 'npc' && h('button', { class: 'danger', onclick: () => { sim.remove(s, b); sfx('remove'); select(null); } }, `Zbourat (vrátí ${fmt(sim.defOf(b.model ?? (b.k === 'hub' ? 'depot' : b.k)).usd)})`);
  if (b.k === 'machine' || b.k === 'miner') machinePanel(p, s, b, close, demolish);
  else if (b.k === 'npc') { // odběratel surovin
    const t = BUYERS[b.t], rows = h('div', { class: 'specs' });
    panelDyn = () => rows.replaceChildren(...t.buys.map((it) => kv(ITEMS[it].name, `${fmt(sim.priceNow(s, it, b.mul))} za tunu`)));
    p.replaceChildren(h('header', null, h('h3', null, b.name), close), h('p', null, `Odběratel na mapě. ${t.what}`), h('h4', null, 'Vykupuje'), rows,
      h('p', { class: 'dim' }, `Platí ${Math.round(b.mul * 100)} % ceníkové ceny. Když prodáš víc, než trh za den pobere, cena klesá. Suroviny sem vozí auta: postav silnici od dolu až sem, auta se koupí a přijedou sama.`));
  } else if (b.k === 'hub') {
    const list = h('div', { class: 'inv' });
    panelDyn = () => list.replaceChildren(...Object.keys(s.inv).filter((it) => s.inv[it] >= 1 && ITEMS[it]).sort((x, y) => ITEMS[x].cat.localeCompare(ITEMS[y].cat, 'cs')).map((it) => h('div', { title: ITEMS[it].name }, icon(it, 20), h('span', null, ITEMS[it].name), h('b', null, num(Math.floor(s.inv[it]))))));
    p.replaceChildren(h('header', null, h('h3', null, b.hq ? 'Sklad' : 'Logistické depo'), close), h('p', null, b.hq ? 'Sem se vozí všechno, co vytěžíš a vyrobíš. Suroviny pro vlastní výrobu tu zůstávají a stroje, které se Skladu dotýkají, si je berou samy. Hotové výrobky se samy prodávají na Trhu.' : `Rampa napojená kamiony na Sklad. Každá převezená položka stojí ${sim.DEPOT_FEE} $.`),
      h('button', { onclick: () => openModal('market') }, 'Otevřít Trh'), h('h4', null, 'Skladem'), list, demolish);
  } else {
    const names = { belt: 'Dopravník', junction: 'Křížení', splitter: 'Rozdělovač', sorter: 'Třídič', unloader: 'Výdejník' };
    const body = [h('p', null, sim.defOf(b.k).what)];
    if (b.k === 'sorter') body.push(h('label', null, 'Rovně pustí', h('select', { onchange: (e) => { b.f = e.target.value || null; } }, itemOptions(b.f, [['*wip', 'všechny rozpracované dávky'], ['*done', 'vše kromě rozpracovaných dávek']]))));
    if (b.k === 'unloader') {
      body.push(h('label', null, 'Vydává', h('select', { onchange: (e) => { b.f = e.target.value || null; } }, itemOptions(b.f))));
      if (!b._adj?.hub) body.push(h('div', { class: 'warn' }, 'Výdejník musí stát těsně u Skladu nebo depa.'));
    }
    if (b.k === 'belt') { // u rozpracované dávky je vidět, na který stroj čeká
      const el = h('div', { class: 'dim' });
      body.push(el);
      panelDyn = () => { const w = b.it && ITEMS[b.it]; el.textContent = !w ? 'Prázdný' : `Veze: ${w.name}` + (w.wip ? `. Čeká na stroj: ${KINDS[ROUTES[w.route].ops[w.step].kind].name}.` : ''); };
    }
    p.replaceChildren(h('header', null, h('h3', null, names[b.k]), close), ...body, demolish);
  }
  panelDyn?.();
}
function machinePanel(p, s, b, close, demolish) {
  const m = MODELS[b.model], kd = KINDS[m.kind], hw = HW[m.kind], speed = m.rate / kd.ref;
  const st = h('div', { class: 'status' }), bar = h('i'), util = h('b'), stock = h('div', { class: 'dim' });
  const barBox = h('div', { class: 'mbars' }), crewBox = h('div');
  let crewSig = '';
  const parts = [h('header', null, icon(b.model, 40), h('div', null, h('h3', null, m.name), h('div', { class: 'dim' }, `${kd.name} · ${TIER[m.tier]}`)), close), st, h('div', { class: 'bar' }, bar), barBox];
  if (m.crew) parts.push(h('h4', null, 'Lidé a vylepšení'), crewBox);
  const maintBox = h('div');
  let maintSig = '';
  parts.push(h('h4', null, 'Poruchy a údržba'), maintBox);
  const maintDyn = () => { // tlačítko se překreslí jen při změně, jinak by klik propadl
    const left = b.mtbf ? Math.max(0, b.mtbf - (b.wear ?? 0)) : null, sig = [b.mt, b.fails, b.st === 'broken', left && Math.round(left / 10)].join();
    if (sig === maintSig) return;
    maintSig = sig;
    maintBox.replaceChildren(
      h('div', { class: 'dim' }, `Stroj se občas porouchá a oprava trvá ${sim.FIX_H} h a stojí ${fmt(sim.repairCost(b))}. Poruch zatím: ${b.fails ?? 0}.${left != null ? ` Další asi za ${num(left)} h práce.` : ''} Údržbář je jeden člověk na každou odpracovanou směnu (${fmt(sim.WAGE_DAY)}) a poruchy jsou s ním třikrát řidší. Doby jsou herní hodnoty.`),
      h('button', { 'data-maint': 1, class: b.mt ? '' : 'primary', onclick: () => { sim.setMaint(s, b, !b.mt); toast(b.mt ? 'Údržbář nastoupil: poruchy budou třikrát řidší' : 'Údržbář odešel', b.mt ? 'ok' : ''); maintSig = ''; panelDyn(); } }, b.mt ? 'Propustit údržbáře' : 'Najmout údržbáře'));
  };
  const crewDyn = () => { // tlačítka se překreslí, jen když se něco změnilo (jinak by klik mohl propadnout)
    const n = sim.staffed(b), up = sim.upgradeCost(b), sw = sim.swaps(s, b), sig = [n, b.lv, up && s.money >= up, ...sw.map((f) => f.id + !sim.swapErr(s, b, f.id))].join();
    if (sig === crewSig) return;
    crewSig = sig;
    crewBox.replaceChildren(
      h('div', { class: 'kv' }, h('span', null, 'Zaměstnanci'), h('b', null, h('button', { class: 'mini', 'data-staff': -1, onclick: () => { sim.setStaff(s, b, n - 1); panelDyn(); } }, '−'), ` ${n} z ${3 * m.crew} `, h('button', { class: 'mini', 'data-staff': 1, onclick: () => { sim.setStaff(s, b, n + 1); panelDyn(); } }, '+'))),
      h('div', { class: 'dim' }, `Směna je ${m.crew} ${m.crew === 1 ? 'člověk' : m.crew < 5 ? 'lidé' : 'lidí'} a pracuje 8 hodin denně; tři směny jedou nepřetržitě. Teď ${num(sim.hoursOf(b), 0)} h denně, mzdy ${fmt(n * sim.WAGE_DAY)} za den práce (${fmt(sim.WAGE_DAY)} za směnu). Když budova stojí, neplatí se.`),
      h('div', { class: 'kv' }, h('span', null, 'Úroveň'), h('b', null, `${(b.lv ?? 0) + 1} z ${sim.UPG.length + 1}`)),
      up ? h('button', { 'data-up': 1, disabled: !s.sandbox && s.money < up, onclick: () => { if (sim.upgrade(s, b)) { sfx('done'); toast(`Vylepšeno na úroveň ${b.lv + 1}`, 'ok'); } panelDyn(); } }, `Vylepšit za ${fmt(up)}: o polovinu základního výkonu víc`) : h('div', { class: 'dim' }, 'Nejvyšší úroveň.'),
      ...sw.map((f) => h('button', { 'data-swap': f.id, disabled: !!sim.swapErr(s, b, f.id), title: 'Stejně funguje položení lepšího stroje přes tenhle. Hromada, cesty i auta zůstanou.', onclick: () => { if (!sim.place(s, f.id, b.x, b.y).err) { sfx('done'); toast(`Vyměněno za: ${f.name}`, 'ok'); select(b); } } }, `Vyměnit za ${f.name}: doplatek ${fmt(sim.swapCost(b, f.id))}`)));
  };
  const found = h('div', { class: 'specs' }), haul = h('div'), [cx, cy] = sim.centerOf(b);
  let age = 0, opts = [], sig = '';
  const dest = h('select', { onchange: (e) => { const t = opts[+e.target.value]; b.to = t ? [t.x, t.y] : null; b.auto = !t; b._sv = null; age = 0; } }); // ruční volba vypne automatiku
  const nameOf = (t) => t.name ?? (t.model ? MODELS[t.model].name.split(':')[0] : t.hq ? 'Sklad' : 'Logistické depo');
  const hauls = (b.k === 'miner' && m.kind !== 'm_drill') || (b.k === 'machine' && kd.cat === 'Suroviny' && !ROUTES[b.prod]?.power); // auta patří dolům, pecím a hutím; elektrárna nic neodváží
  const refreshHaul = () => {
    const list = sim.sinks(s, b), cur = b.to && list.find((x) => x.t === sim.at(s, b.to[0], b.to[1])), direct = b._adj?.hub || b._adj?.npc || b._adj?.mach?.length;
    const txt = list.map((x) => `${short(x.it)} → ${nameOf(x.t)} · ${x.t.k === 'machine' ? 'vlastní výroba' : `${fmt(x.usd)} za tunu`} · ${x.path ? `${x.path.length} m po silnici` : 'nevede tam silnice'}`), key = txt.join('|') + (cur ? list.indexOf(cur) : -1) + (b.auto !== false);
    if (sig !== key && document.activeElement !== dest) { // seznam cílů se překreslí, jen když se změnil a není zrovna rozbalený
      sig = key; opts = list.map((x) => x.t);
      dest.replaceChildren(h('option', { value: -1, selected: b.auto !== false }, '— samo: vlastní výroba, která má místo, jinak nejlepší cena —'), ...txt.map((t, i) => h('option', { value: i, selected: b.auto === false && list[i] === cur }, t)));
    }
    const cars = b.cars ?? [];
    haul.replaceChildren(h('div', { class: 'dim' }, `Na hromadě ${b.out.length} t z ${sim.PILE} t.`),
      direct ? h('div', { class: 'dim' }, 'Stojí těsně u jiné budovy a předává jí rovnou, auta nepotřebuje.')
        : !list.some((x) => x.path) ? h('div', { class: 'warn' }, 'Nevede odsud žádná silnice k cíli. V záložce Doprava vyber cestu, klikni sem a pak na cíl (Sklad, pec, odběratel).')
          : b.carWait ? h('div', { class: 'warn' }, `Na první auto chybí peníze (ojetý pick-up stojí ${fmt(CARS.car_pickup.usd)}). Koupí se samo, jakmile budou.`)
            : h('div', { class: 'dim' }, `Auta se kupují a jezdí sama (nejvýš ${sim.MAXCARS}); další auto se koupí, jen když po nákupu zůstane aspoň tolik, kolik stálo. Nafta a servis: ${[...new Set((cars.length ? cars : [{ m: 'car_pickup' }]).map((c) => `${num(CARS[c.m].km, 2)} $/km`))].join(', ')}. Před každou jízdou si auto vybere cíl: nejdřív vlastní výroba, která má místo, jinak nejlepší cena.`),
      ...cars.map((c) => { const d = c.to && sim.at(s, c.to[0], c.to[1]); return h('div', { class: 'kv' }, h('span', null, CARS[c.m].name), h('b', null, c.dir > 0 ? `veze ${c.n} t${d ? ' → ' + nameOf(d) : ''}` : c.dir < 0 ? 'vrací se' : c.n >= CARS[c.m].cap ? 'čeká: cíl má plno' : `nakládá ${c.n} z ${CARS[c.m].cap} t`)); }));
  };
  if (b.k === 'miner') { // co je v dosahu: na povrchu, nebo v patrech, kam už vrt či důl došel
    parts.push(h('h4', null, m.kind === 'm_miner' ? 'Zásoby v dosahu' : 'Co je pod zemí v dosahu'), found);
    if (m.kind === 'm_shaft') parts.push(h('label', null, 'Těžit v hloubce', h('select', { onchange: (e) => { b.goal = +e.target.value; b.cur = null; b.oi = 0; age = 0; } },
      [...Array(m.maxLv)].map((_, i) => h('option', { value: i + 1, selected: b.goal === i + 1 }, `${(i + 1) * LEVEL_M} m (patro ${i + 1})`)))),
      h('div', { class: 'dim' }, `Hloubení stojí asi ${fmt(m.sink)} za metr a těžba je s každým patrem dražší. Kde co leží, zjistí levněji průzkumný vrt. Tlačítko Pod zem (G) ukáže patra v řezu.`));
    if (hauls) parts.push(h('h4', null, 'Odvoz'), haul, h('label', null, 'Kam auta vozí', dest),
      null);
  }
  if (b.k === 'machine') {
    parts.push(kv('Vytížení', util));
    const starts = (STARTS[m.kind] ?? []).map((id) => ROUTES[id]).filter((r) => sim.unlocked(s, r.req) && canDo(m, r, r.ops[0]));
    if (starts.length) {
      const info = h('div', { class: 'dim' });
      const show = () => {
        const r = ROUTES[b.prod];
        if (!r) { info.textContent = 'Tento stroj umí zahájit výrobu. Zvol, co má vyrábět.'; return; }
        const op = r.ops[0];
        info.replaceChildren(`Na dávku: ${Object.entries(op.in ?? {}).map(([it, q]) => `${num(q, 2)}× ${ITEMS[it].name}`).join(', ') || 'nic'}. Tento krok trvá ${hours(op.h / speed)}${r.ops.length > 1 ? `, celá trasa má ${r.ops.length} kroků` : ''}. ${kd.cat === 'Suroviny' ? 'Při cenách Trhu: ' : 'S díly z Trhu: '}`, margin(r), '. ',
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); rsel = r.id; openModal('routes', true); } }, 'Zobrazit postup'), r.tape && !sim.taped(s, r.tape) ? h('div', { class: 'warn' }, 'Nejdřív zaplať návrh čipu v okně Čipy.') : '');
      };
      const inputs = (r) => [...new Set(r.ops.flatMap((op) => Object.keys(op.in ?? {})))];
      const pickProd = (e) => { // díly zvolené trasy sklad přestane sám prodávat
        b.prod = e.target.value || null; b._need = null;
        const off = b.prod ? inputs(ROUTES[b.prod]).filter((it) => s.autoSell[it]) : [];
        for (const it of off) s.autoSell[it] = false;
        if (off.length) toast(`Sklad už sám neprodává: ${off.map((it) => ITEMS[it].name).join(', ')}`);
        show();
      };
      const autoBuy = () => { // sklad drží zásobu dílů na dvě dávky
        const r = ROUTES[b.prod], got = [];
        for (const op of r?.ops ?? []) for (const it in op.in ?? {}) if (sim.canBuy(s, it)) { s.autoBuy[it] = Math.max(s.autoBuy[it] ?? 0, Math.ceil(op.in[it] * 2)); got.push(ITEMS[it].name); }
        toast(got.length ? `Sklad bude sám dokupovat: ${got.join(', ')}` : 'Tahle trasa nemá díly, které jdou koupit', got.length ? 'ok' : '');
      };
      parts.push(h('label', null, 'Vyrábí', h('select', { onchange: pickProd }, h('option', { value: '' }, '— nic nezahajuje —'),
        Object.entries(ROUTE_CATS).map(([c, name]) => { const l = starts.filter((r) => r.cat === c); return l.length ? h('optgroup', { label: name }, l.map((r) => h('option', { value: r.id, selected: r.id === b.prod }, r.name))) : null; }))), info,
        kd.cat !== 'Suroviny' && h('button', { 'data-auto': 1, title: 'Nastaví v Trhu u všech dílů trasy zásobu na dvě dávky', onclick: autoBuy }, 'Dokupovat díly trasy samo'),
        kd.cat !== 'Suroviny' && h('label', { title: 'První stroj trasy nepustí do oběhu víc rozpracovaných dávek, aby se dopravníky neucpaly.' }, 'Nejvíc dávek v oběhu', h('input', { type: 'number', min: 1, max: 99, value: b.cap ?? sim.WIP_CAP, onchange: (e) => { b.cap = clamp(Math.floor(+e.target.value || 1), 1, 99); } })));
      show();
    }
    parts.push(stock);
  }
  if (hauls && b.k === 'machine') parts.push(h('h4', null, 'Odvoz'), haul, h('label', null, 'Kam auta vozí', dest),
    null);
  parts.push(h('h4', null, 'Stroj'), kv('Cena', fmt(m.usd), ' ', badge(m), ' ', link(m.src)), m.note && h('div', { class: 'dim' }, m.note),
    kv('Výkon', `${num(m.rate, m.rate < 10 ? 2 : 0)} ${kd.u === 't' && m.crew ? 't za hodinu práce' : UNIT[kd.u]}`, kd.cat === 'Suroviny' && m.crew ? [' ', badge({ fact: m.rateFact, note: 'výkon stroje' })] : ''), m.kw > 0 && kv('Příkon', `${num(m.kw, 1)} kW`), kv('Půdorys', `${m.w} × ${m.h} m`),
    m.wafer && kv('Wafery', m.wafer.join(' / ') + ' mm'), m.res && kv('Rozlišení', `${num(m.res)} nm`), m.reach && kv('Pracovní okruh', `${m.reach} m`));
  if (hw) {
    const box = h('div', { class: 'v3d' });
    parts.push(h('p', null, hw.what), hw.specs?.length && h('div', { class: 'specs' }, hw.specs.map(([a, v]) => kv(a, v))),
      hw.makers?.length && kv('Výrobci', hw.makers.map((x) => `${x.name} (${x.country})`).join(', ')),
      h('button', { onclick: async (e) => { // 3D model se načte až na vyžádání
        e.target.remove();
        const v3 = await import('./viewer3d.js');
        if (G.sel !== b) return;
        if (!v3.has3D(m.kind)) { box.textContent = 'Pro tento stroj 3D model není.'; return; }
        viewer = v3.mount(box, m.kind);
        box.append(h('div', { class: 'dim' }, 'Zjednodušený model z modulů (odhad tvaru). Části: ' + viewer.modules.map((x) => x.name).join(' · ')));
      } }, 'Ukázat 3D model'), box, hw.sources?.length && h('div', { class: 'srcs' }, hw.sources.slice(0, 4).map((u, i) => link(u, `zdroj ${i + 1}`))),
      MACHINE_BUY[m.kind] && [h('h4', null, 'Kde se takový stroj dá pořídit'), MACHINE_BUY[m.kind].map((o) => h('div', { class: 'kv' }, h('span', null, o.tier), h('b', null, link(o.url, o.label), o.price ? ` · ${o.price}` : '')))]);
  }
  parts.push(demolish);
  p.replaceChildren(...parts.flat(3).filter(Boolean));
  panelDyn = () => {
    st.textContent = sim.statusOf(s, b); st.dataset.st = b.st;
    barBox.replaceChildren(...barsOf(s, b));
    if (m.crew) crewDyn();
    maintDyn();
    bar.style.width = (b.job ? Math.min(100, (b.job.t / b.job.T) * 100) : b.k !== 'miner' ? 0 : m.kind === 'm_miner' ? b.acc * 100 : ((b.dep % LEVEL_M) / LEVEL_M) * 100) + '%';
    if (b.k === 'miner') { // zásoby a odvoz se přepočítávají jen občas, je to pár tisíc dlaždic
      if (age++ % 8) return;
      if (hauls) refreshHaul();
      const list = (l) => Object.entries(sim.survey(s, cx, cy, m.reach, l)).map(([o, t]) => `${ITEMS[ORES[o].id].name} ${num(t)} t`).join(', ') || 'nic';
      const levels = m.kind === 'm_miner' ? [0] : [...Array(Math.min(m.maxLv, Math.floor(b.dep / LEVEL_M)))].map((_, i) => i + 1);
      found.replaceChildren(...(levels.length ? levels.map((l) => kv(l ? `${l * LEVEL_M} m` : 'povrch', list(l))) : [h('div', { class: 'dim' }, 'Zatím nic: první patro je v hloubce 50 m.')]));
      return;
    }
    if (hauls && !(age++ % 8)) refreshHaul();
    util.textContent = `${Math.round(b.busy * 100)} %`;
    const q = b.q.map((w) => ITEMS[w].name.split(' – ')[0]), buf = Object.entries(b.buf).filter(([, n]) => n > 0.005).map(([it, n]) => `${num(n, 2)}× ${ITEMS[it].name}`);
    stock.textContent = [q.length && `Ve frontě: ${q.join(', ')}`, buf.length && `U stroje: ${buf.join(', ')}`, b.out.length && `Na výstupu: ${b.out.length}`].filter(Boolean).join(' · ');
  };
}

// ---------------------------------------------------------------- okna
function frame(title, ...body) { $('win').replaceChildren(h('header', null, h('h2', null, title), h('button', { class: 'x', onclick: closeModal }, '✕')), h('div', { class: 'body' }, ...body)); }
export function openModal(id, keep) {
  if (modal?.id === id && !keep) return closeModal();
  modal = { id }; $('modal').hidden = false; tip();
  MODALS[id]();
  sfx('click');
}
function closeModal() { modal = null; $('modal').hidden = true; $('win').replaceChildren(); }

let mcat = 'Odběratelé', rsel = 'arduino_uno', tsel = null;
const MARKET_CATS = ['Odběratelé', 'Skladem', 'Výrobky', 'Čipy', 'Wafery s čipy', 'Součástky', 'DPS', 'Díly PC', 'Křemík', 'Spotřební', 'Suroviny'];
// Okno Statistiky: čára peněz, příjmů a výdajů za posledních až 14 dní (body po herních hodinách).
const qty = (n, it) => (ITEMS[it].pack === 't' ? `${num(n, 1)} t` : `${num(n, 1)} × ${ITEMS[it].pack}`);
function chart(hist, series, zero = true) { // zero = osa od nuly (příjmy a výdaje); peníze se ukazují v rozsahu, ve kterém se pohybují
  const c = h('canvas', { width: 760, height: 220, class: 'chart' }), g = c.getContext('2d'), W = c.width, H = c.height, P = 70;
  const t0 = hist[0]?.[0] ?? 0, t1 = Math.max(t0 + 1, hist.at(-1)?.[0] ?? 1), vals = hist.flatMap((p) => series.map(([i]) => p[i]));
  let lo = zero ? Math.min(0, ...vals) : Math.min(...vals), hi = Math.max(zero ? 1 : lo + 1, ...vals);
  if (!zero) { const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1; lo -= pad; hi += pad; }
  const X = (t) => P + ((t - t0) / (t1 - t0)) * (W - P - 8), Y = (v) => H - 22 - ((v - lo) / (hi - lo)) * (H - 34);
  g.font = '12px Bahnschrift, "Segoe UI", sans-serif'; g.fillStyle = '#8a94a3'; g.strokeStyle = '#2f3743'; g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4, y = Y(v); g.beginPath(); g.moveTo(P, y); g.lineTo(W - 8, y); g.stroke(); g.fillText(fmt(v).replace(' $', ''), 2, y + 4); }
  for (let d = Math.ceil(t0 / sim.DAY); d * sim.DAY <= t1; d++) g.fillText(`den ${d + 1}`, X(d * sim.DAY) - 14, H - 6);
  for (const [i, col] of series) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); hist.forEach((p, n) => (n ? g.lineTo(X(p[0]), Y(p[i])) : g.moveTo(X(p[0]), Y(p[i])))); g.stroke(); }
  return c;
}
const STUCK = { miss: 'chybí vstup', full: 'plno: není kam dávat', staff: 'nikdo nepracuje', money: 'došly peníze', broken: 'porucha', empty: 'vytěženo', tape: 'nezaplacený návrh čipu', cap: 'čeká na dávky v oběhu' };
const MODALS = {
  intro() { // úvod úrovně: o co jde a co je cílem
    const L = sim.levelOf(G.s), i = MISSIONS.indexOf(L);
    frame(L.id === 'free' ? L.name : `Úroveň ${i + 1}: ${L.name}`, h('p', { class: 'lead' }, L.what),
      h('div', { class: 'how' }, HOW.map(([t, d], n) => h('div', null, h('b', null, n + 1), h('h3', null, t), h('p', null, d)))),
      L.goals.length ? [h('h4', null, 'Cíle úrovně'), goalList(L)] : h('p', { class: 'dim' }, 'Volná hra nemá cíl. Vlevo nahoře uvidíš úkoly, které tě povedou dál.'),
      L.guide ? h('p', { class: 'dim' }, 'Vlevo nahoře je průvodce: říká, co udělat teď. Šipka ve světě ukazuje kde a tlačítko, na které máš kliknout, pulzuje.') : null,
      h('div', { class: 'row' }, h('button', { class: 'primary', 'data-go': 1, onclick: closeModal }, 'Začít')));
  },
  win() { // úroveň splněna
    const L = sim.levelOf(G.s), nx = MISSIONS[MISSIONS.indexOf(L) + 1];
    frame(`Úroveň splněna: ${L.name}`, h('p', { class: 'lead' }, `Všechny cíle jsou splněné za ${Math.floor(G.s.t / sim.DAY) + 1} herních dní.`), goalList(L, G.s),
      h('div', { class: 'row' }, nx && h('button', { class: 'primary', 'data-next': nx.id, onclick: () => startLevel(nx.id) }, nx.id === 'free' ? 'Dál: Volná hra' : `Další úroveň: ${nx.name}`),
        h('button', { onclick: closeModal }, 'Hrát tady dál'), h('button', { onclick: () => { api.save(); showTitle(); } }, 'Hlavní menu')));
  },
  market() {
    const s = G.s, redo = () => MODALS.market();
    const tabs = h('div', { class: 'tabs' }, MARKET_CATS.map((c) => h('button', { class: c === mcat ? 'on' : '', onclick: () => { mcat = c; redo(); } }, c)));
    if (mcat === 'Odběratelé') { // kdo na mapě co vykupuje a kde je
      const rows = s.list.filter((b) => b.k === 'npc').map((b) => h('tr', null, h('td', null, h('b', null, b.name), h('small', null, BUYERS[b.t].what)),
        h('td', null, BUYERS[b.t].buys.map((it) => h('div', null, `${ITEMS[it].name}: `, h('b', null, fmt(sim.priceNow(s, it, b.mul))), ' za tunu'))), h('td', { class: 'n' }, `${num(Math.hypot(b.x, b.y))} m`),
        h('td', null, h('button', { onclick: () => { closeModal(); G.under = false; G.fly = { x: b.x + b.w / 2, y: b.y + b.h / 2, z: 14 }; } }, 'Ukázat na mapě'))));
      frame('Trh', tabs, h('p', { class: 'dim' }, 'Odběratelé stojí na mapě (tyrkysové čtverce v minimapě) a suroviny k nim musí dojet autem po silnici. Vzdálenější platí víc. Co dovezeš do Skladu nebo depa, prodá se na Trhu za 85 % ceny.'),
        h('table', { class: 'grid' }, h('thead', null, h('tr', null, ['Odběratel', 'Vykupuje (cena teď)', 'Od dílny', ''].map((t) => h('th', null, t)))), h('tbody', null, rows)));
      return;
    }
    const list = Object.values(ITEMS).filter((it) => (mcat === 'Skladem' ? (s.inv[it.id] ?? 0) >= 1 : it.cat === mcat));
    const rows = list.map((it) => {
      const can = sim.canBuy(s, it.id);
      const buy = (n) => h('button', { 'data-buy': it.usd * n, onclick: () => { if (sim.buy(s, it.id, n)) sfx('place'); else { toast('Nedostatek peněz', 'err'); sfx('error'); } modal.dyn(); } }, '+' + n);
      return h('tr', null, h('td', null, icon(it.id, 22)), h('td', null, h('b', null, it.name), h('small', null, it.pack)), h('td', { 'data-stock': it.id, class: 'n' }),
        h('td', { class: 'n' }, it.wip ? '' : [fmt(it.usd), ' ', badge(it), ' ', link(it.src, '')]), h('td', { 'data-sell': it.id, class: 'n' }),
        h('td', null, can ? [buy(1), buy(10), buy(100)] : it.id.startsWith('wl_') && it.buy ? h('small', null, 'po zaplacení návrhu čipu') : ''),
        h('td', null, it.sell && h('button', { onclick: () => { if (sim.sell(s, it.id, Infinity)) sfx('coin'); modal.dyn(); } }, 'Prodat vše')),
        h('td', null, it.sell && h('input', { type: 'checkbox', checked: !!s.autoSell[it.id], title: 'Prodávat samo, jakmile dojede do Centrály', onchange: (e) => { s.autoSell[it.id] = e.target.checked; } })),
        h('td', null, can && h('input', { type: 'number', min: 0, step: 1, value: s.autoBuy[it.id] ?? 0, title: 'Sklad sám dokupuje na tuto zásobu', onchange: (e) => { const v = Math.max(0, Math.floor(+e.target.value || 0)); if (v) s.autoBuy[it.id] = v; else delete s.autoBuy[it.id]; } })));
    });
    frame('Trh', tabs,
      h('p', { class: 'dim' }, 'Ceny jsou za balení. Prodáváš za 85 % ceny distributora; když prodáš víc, než trh za den pobere, cena klesá. Nakoupené zboží je hned ve skladu Centrály.'),
      h('table', { class: 'grid' }, h('thead', null, h('tr', null, ['', 'Položka', 'Skladem', 'Nákup', 'Prodej teď', 'Koupit', '', 'Sám prodávat', 'Držet zásobu'].map((t) => h('th', null, t)))), h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: 9, class: 'dim' }, 'Sklad je prázdný.')))));
    modal.dyn = () => {
      for (const e of $('win').querySelectorAll('[data-stock]')) e.textContent = num(Math.floor(s.inv[e.dataset.stock] ?? 0));
      for (const e of $('win').querySelectorAll('[data-sell]')) { const it = ITEMS[e.dataset.sell]; e.textContent = it.sell ? fmt(sim.priceNow(s, it.id)) : ''; e.classList.toggle('warn', it.sell && (s.sold[it.id] ?? 0) > it.depth); }
      for (const e of $('win').querySelectorAll('[data-buy]')) e.disabled = !s.sandbox && s.money < +e.dataset.buy;
    };
    modal.dyn();
  },
  chips() {
    const s = G.s;
    const cards = Object.values(CHIPS).sort((a, b) => a.year - b.year).map((c) => {
      const it = ITEMS[c.id], f = FAB[c.process], open = sim.unlocked(s, c.req), own = yieldOf(c.die, sim.d0Of(s, c.process));
      const act = sim.taped(s, c.id) ? h('span', { class: 'ok' }, 'NÁVRH ZAPLACEN') : open
        ? h('button', { disabled: !s.sandbox && s.money < c.mask, onclick: () => { if (sim.tapeout(s, c.id)) { sfx('done'); toast(`Návrh čipu ${c.name} je zaplacený`, 'ok'); MODALS.chips(); } } }, `Zaplatit návrh a masky: ${fmt(c.mask)}`)
        : h('span', { class: 'dim' }, `Nejdřív odemkni ve Stromu: ${reqName(c.req)}`);
      return h('div', { class: 'card' }, h('header', null, icon(c.id, 30), h('div', null, h('h3', null, c.name), h('div', { class: 'dim' }, `${c.year} · ${PROC[c.process].name}`))),
        kv('Plocha čipu', `${num(c.die, 1)} mm²`, c.tr ? ` · ${num(c.tr)} tranzistorů` : ''), kv('Pouzdro', `${PROC[c.pkg === 'pkg_hbm' ? 'pkg_cowos' : c.pkg].name.split(' (')[0]}, ${num(c.pins)} vývodů`),
        kv('Čipů na waferu', `${num(c.gross / c.lot)} (wafer ${f.wafer} mm, lot ${c.lot} ks)`), kv('Výtěžnost', `vlastní fab teď ${Math.round(own * 100)} %, zralý proces ${Math.round(c.yield0 * 100)} %`),
        kv('Cena čipu', fmt(it.usd / 100), ' ', badge(it), ' ', link(it.src)), it.note && h('div', { class: 'dim' }, it.note),
        c.foundry ? kv('Wafer od foundry', `${fmt(c.foundry)}, lot ${fmt(c.foundry * 25)}`) : h('div', { class: 'dim' }, 'Vyrábí jen výrobce ve vlastním fabu, foundry ho nenabízí.'), act);
    });
    frame('Čipy', h('p', { class: 'dim' }, 'Než čip poprvé vyrobíš, zaplatíš návrh a sadu masek. U čipů navržených pro foundry pak můžeš na Trhu kupovat hotové otestované wafery a jen je zapouzdřit; ostatní si musíš vyrobit ve vlastním fabu.'), h('div', { class: 'cards' }, cards));
  },
  research() { // strom rozvoje: větve pod sebou, zleva doprava to, co na sebe navazuje; odemyká se za body
    const s = G.s, W = 158, H = 50, X0 = 92, depth = {}, slot = {}, pos = {}, rows = LANES.map(() => 1);
    const d = (id) => (depth[id] ??= 1 + Math.max(-1, ...RESEARCH.find((r) => r.id === id).req.map(d)));
    for (const r of RESEARCH) { const k = r.lane + ':' + d(r.id), i = (slot[k] = (slot[k] ?? -1) + 1); rows[r.lane] = Math.max(rows[r.lane], i + 1); pos[r.id] = [X0 + d(r.id) * W, r.lane, i]; }
    const top = rows.map((_, l) => rows.slice(0, l).reduce((a, n) => a + n * H + 16, 8)), xy = (id) => [pos[id][0], top[pos[id][1]] + pos[id][2] * H];
    const has = (id) => s.sandbox || s.research.includes(id), ready = (r) => r.req.every(has);
    tsel = RESEARCH.find((r) => r.id === tsel) ? tsel : (RESEARCH.find((r) => !has(r.id) && ready(r)) ?? RESEARCH[0]).id;
    const cur = RESEARCH.find((r) => r.id === tsel), keep = $('win').querySelector('.tree'), sx = keep?.scrollLeft ?? 0, sy = keep?.scrollTop ?? 0;
    const width = X0 + (Math.max(...RESEARCH.map((r) => d(r.id))) + 1) * W, height = top.at(-1) + rows.at(-1) * H + 8;
    const lines = RESEARCH.flatMap((r) => r.req.map((q) => { const [x1, y1] = xy(q), [x2, y2] = xy(r.id), a = x1 + 142, b = y1 + 20, c = y2 + 20, m = (a + x2) / 2; return `<path d="M${a} ${b} C${m} ${b} ${m} ${c} ${x2} ${c}" stroke="${has(q) ? '#3fe08a' : '#2f3743'}"/>`; }));
    const svg = h('div'); svg.innerHTML = `<svg width="${width}" height="${height}" fill="none" stroke-width="2">${lines.join('')}</svg>`;
    const unlock = () => { if (sim.research(s, cur.id)) { sfx('done'); toast(`Odemčeno: ${cur.name}`, 'ok'); if (cur.id === 'smt1') { s.guide = GUIDE2; renderQuest(); toast('V dílně u Skladu stojí nová linka. Průvodce ukáže, co s ní.', '', 8000); } renderBuild(); MODALS.research(); } };
    const act = has(cur.id) ? h('span', { class: 'ok' }, 'ODEMČENO') : !ready(cur) ? h('span', { class: 'dim' }, `Nejdřív: ${cur.req.filter((q) => !has(q)).map(reqName).join(', ')}`)
      : h('button', { class: 'primary', 'data-unlock': 1, disabled: s.pts < cur.pts, onclick: unlock }, s.pts < cur.pts ? `Stojí ★ ${cur.pts}, máš ★ ${s.pts}` : `Odemknout za ★ ${cur.pts}`);
    frame('Strom rozvoje', h('div', { class: 'treeinfo' }, h('div', { class: 'pts' }, h('b', null, `★ ${s.sandbox ? '∞' : s.pts}`), h('small', null, 'body rozvoje')), h('div', null, h('h3', null, cur.name), h('p', { class: 'dim' }, cur.what)), act),
      h('div', { class: 'tree' }, h('div', { class: 'canvas', style: `width:${width}px;height:${height}px` }, svg.firstChild,
        LANES.map((n, l) => h('div', { class: 'lane', style: `top:${top[l] - 8}px;height:${rows[l] * H + 16}px` }, n)),
        RESEARCH.map((r) => { const [x, y] = xy(r.id); return h('button', { class: 'node ' + (has(r.id) ? 'done' : ready(r) ? 'ready' : 'lock') + (r.id === tsel ? ' sel' : ''), 'data-node': r.id, style: `left:${x}px;top:${y}px`, title: r.what, onclick: () => { tsel = r.id; MODALS.research(); } }, h('span', null, r.name), h('small', null, has(r.id) ? '✓ odemčeno' : `★ ${r.pts}`)); }))),
      h('p', { class: 'dim' }, 'Body rozvoje dostáváš za tržby (každý další bod je o pětinu dražší) a za splněné úkoly. Ceny v bodech jsou herní hodnota. Odemčené stroje a stavby si pak kupuješ za peníze ve stavebním menu.'));
    const tree = $('win').querySelector('.tree'); tree.scrollLeft = sx; tree.scrollTop = sy;
    let last = s.pts;
    modal.dyn = () => { if (s.pts !== last) { last = s.pts; MODALS.research(); } };
  },
  routes() {
    const s = G.s, r = ROUTES[rsel] ?? ROUTES.arduino_uno, pr = PROC[r.ops.find((o) => o.proc)?.proc], ec = econ(r);
    const side = Object.entries(ROUTE_CATS).map(([c, name]) => [h('h4', null, name), Object.values(ROUTES).filter((x) => x.cat === c).map((x) => h('button', { class: (x.id === r.id ? 'on ' : '') + (sim.unlocked(s, x.req) ? '' : 'lock'), onclick: () => { rsel = x.id; MODALS.routes(); } }, x.name))]);
    const kinds = [...new Set(r.ops.map((o) => o.kind))];
    let prev = null;
    const steps = r.ops.map((op, i) => { const first = op.name !== prev; prev = op.name; return h('tr', { class: first ? 'first' : '' }, h('td', { class: 'n' }, i + 1), h('td', { title: op.what ?? '' }, first ? op.name : ''), h('td', null, KINDS[op.kind].name),
      h('td', null, [...Object.entries(op.in ?? {}).map(([it, q]) => `${num(q, 2)}× ${ITEMS[it].name}`), ...(first ? op.mats.map((id) => MATS[id]?.name).filter(Boolean) : [])].join(', ')), h('td', { class: 'n' }, hours(op.h)), h('td', { class: 'n' }, op.chem ? `${num(op.chem, 3)}× chemie` : op.opex >= 1 ? fmt(op.opex) : '')); });
    const outs = r.out ? Object.entries(r.out).map(([it, q]) => `${num(q, 1)}× ${ITEMS[it].name}`) : r.power ? [`${num(r.power)} MWh elektřiny do zásobníku`] : r.cat === 'fab' ? [`1× ${ITEMS['wl_' + r.chip].name}`] : [`${ITEMS[r.chip].name}: ${num(CHIPS[r.chip].gross / 100, 0)} balení × výtěžnost`];
    frame('Výrobní postupy', h('div', { class: 'split' }, h('nav', { class: 'side' }, side), h('div', { class: 'detail' },
      h('h3', null, r.name), !sim.unlocked(s, r.req) && h('div', { class: 'warn' }, `Nejdřív odemkni ve Stromu: ${reqName(r.req)}`),
      kv('Začíná na stroji', KINDS[r.ops[0].kind].name), kv('Vyrobí', outs.join(', ')), kv('Čas na referenčních strojích', hours(r.ops.reduce((a, o) => a + o.h, 0))),
      kv('Díly na dávku za ceny Trhu', fmt(ec.parts)), kv('Spotřební materiál na dávku', fmt(ec.opex)), kv('Tržba za dávku (85 % ceny)', ec.out ? fmt(ec.out) : '—'), kv('Výsledek bez elektřiny', margin(r)),
      pr && [h('h4', null, pr.name), h('p', null, pr.what), pr.fabs?.length && kv('Kde se to dělá', pr.fabs.map((f) => `${f.name} (${f.country})`).join('; ')), pr.sources?.length && h('div', { class: 'srcs' }, pr.sources.slice(0, 5).map((u, i) => link(u, `zdroj ${i + 1}`)))],
      h('h4', null, `Kroky (${r.ops.length})`), h('table', { class: 'grid' }, h('thead', null, h('tr', null, ['#', 'Krok', 'Stroj', 'Vstupy a materiály', 'Čas', 'Materiál'].map((t) => h('th', null, t)))), h('tbody', null, steps)),
      h('h4', null, 'Stroje, které tuhle trasu umí'), kinds.map((k) => { const ms = Object.values(MODELS).filter((m) => r.ops.some((op) => op.kind === k && canDo(m, r, op))); return kv(KINDS[k].name, ms.map((m) => `${m.name} (${fmt(m.usd)})`).join(' · ')); }))));
  },
  stats() { // průběh peněz, výroba za den a co kde stojí
    const s = G.s, hist = s.hist.length ? s.hist : [[s.t, s.money, s.rateIn, s.rateOut]], key = (b) => (b.model ? MODELS[b.model].name.split(':')[0] : '');
    const day = Object.entries(s.lastDay ?? {}).filter(([it]) => ITEMS[it]).sort((a, b) => b[1] * ITEMS[b[0]].usd - a[1] * ITEMS[a[0]].usd).slice(0, 12);
    const stuck = s.list.filter((b) => (b.k === 'machine' || b.k === 'miner') && STUCK[b.st]);
    const legend = (items) => h('div', { class: 'legend' }, items.map(([t, c]) => h('span', null, h('i', { style: `background:${c}` }), t)));
    frame('Statistiky',
      h('div', { class: 'specs' }, kv('Peníze', fmt(s.money)), kv('Příjem za den', fmt(s.rateIn)), kv('Výdaje za den', fmt(s.rateOut)),
        kv('Vlastní elektřina', s.gen ? `vyrobeno ${num(s.gen, 1)} MWh, v zásobníku ${num(s.mwh, 1)} z ${sim.GRID_MWH} MWh` : 'zatím žádná (Strom: Uhelná teplárna)')),
      h('h4', null, 'Peníze'), chart(hist, [[1, '#ffb52e']], false),
      h('h4', null, 'Příjmy a výdaje za den'), chart(hist, [[2, '#3fe08a'], [3, '#ff4d5e']]), legend([['příjem', '#3fe08a'], ['výdaje', '#ff4d5e']]),
      h('h4', null, 'Výroba za poslední celý den'), day.length ? h('table', { class: 'grid' }, h('tbody', null, day.map(([it, n]) => h('tr', null, h('td', null, icon(it, 20)), h('td', null, ITEMS[it].name), h('td', { class: 'n' }, qty(n, it)), h('td', { class: 'n' }, fmt(n * ITEMS[it].usd))))))
        : h('p', { class: 'dim' }, 'Zatím není za celý den nic: počkej do dalšího dne.'),
      h('h4', null, `Kde to vázne (${stuck.length})`), stuck.length ? h('table', { class: 'grid' }, h('tbody', null, stuck.slice(0, 30).map((b) => h('tr', null, h('td', null, key(b)), h('td', { class: 'warn' }, STUCK[b.st]), h('td', { class: 'dim' }, sim.statusOf(s, b)),
        h('td', null, h('button', { onclick: () => { closeModal(); G.under = false; G.fly = { x: b.x + b.w / 2, y: b.y + b.h / 2, z: 22 }; select(b); } }, 'Ukázat'))))))
        : h('p', { class: 'dim' }, 'Všechny stroje a doly jedou, nebo čekají na práci.'));
    const n = s.hist.length;
    modal.dyn = () => { if (s.hist.length !== n) MODALS.stats(); };
  },
  menu() {
    const mk = (t, f, c = '') => h('button', { class: c, onclick: f }, t);
    frame('Make Your CPU', h('p', null, 'Tovární hra v otevřeném 3D světě. Začínáš s ručním lomem, polní cestou a starým pick-upem a končíš s vlastním fabem, EUV skenerem a procesorem vyrobeným z křemene, který sis sám vytěžil. Stroje, výrobní postupy a ceny vycházejí ze skutečnosti; u každé ceny je napsáno, jestli je doložená, nebo odhad.'),
      h('div', { class: 'row' }, mk('Pokračovat', closeModal, 'primary'), mk('Uložit hru', () => { api.save(); toast('Hra uložena', 'ok'); }), mk('Hlavní menu: nová hra a úrovně', () => { api.save(); showTitle(); }), mk(audio.on ? 'Zvuk: zapnutý' : 'Zvuk: vypnutý', (e) => { audio.on = !audio.on; localStorage.setItem('myc_sound', audio.on ? '1' : '0'); e.target.textContent = audio.on ? 'Zvuk: zapnutý' : 'Zvuk: vypnutý'; })),
      h('h4', null, 'Jak se hraje'), h('ul', null, ['Začíná se těžbou: lom na ložisko a silnice do Skladu (vyber cestu, klikni na lom a pak na Sklad). Auta jezdí sama. Sklárna u Skladu taví z křemene a uhlí sklo, které se samo prodává.',
        'Sklad si nechává 20 t každé suroviny pro tvoje stroje a zbytek prodává, takže těžba vydělává i bez Sklárny.',
        'Odběratelé na mapě (tyrkysové čtverce v minimapě) platí za některé zboží víc než Trh; co kdo vykupuje, ukáže okno Trh.',
        'Za tržby a úkoly přicházejí body rozvoje. Ve Stromu (V) za ně odemykáš lepší silnice, auta, rypadla, doly a později elektroniku a čipy; odemčené si pak kupuješ za peníze.',
        'Lepší silnice znamená rychlejší auta. Horší cestu vylepšíš přetažením lepší a zaplatíš jen rozdíl.',
        'Pruh nad stavebním menu říká, jestli zrovna prohlížíš, stavíš, nebo bouráš. Při stavění má okno jantarový rámeček, při bourání červený.',
        'Stroj postav z menu vpravo dole. Stroj, který trasu zahajuje (třeba tiskař pasty), klikni a zvol, co má vyrábět.',
        'Dávka pak projde stroji v pořadí kroků. Stroje si ji předávají, když se dotýkají, nebo ji pošli dopravníkem: stroj si z dopravníku, který vede kolem něj, sám vezme, co potřebuje.',
        'Výrobní stroje stojí v hale. Na halu se díváš shora bez střechy; když pohled oddálíš, střecha se zavře a klikem na ni se vrátíš dovnitř. Novou halu postavíš tažením obdélníku.',
        'Díly ber ze Skladu: stroj, který se dotýká Skladu nebo depa, si je bere sám; jinam je vozí Výdejník a dopravník. Hotové výrobky dovez do Skladu nebo depa, tam se prodají.',
        'Venku se těží. Ložisko má konečné zásoby a rypadlo ho v dosahu časem vytěží. Hlouběji leží další nerosty: Průzkumný vrt ukáže, co je v kterém patře, a Hlubinný důl se k tomu prorazí.',
        'Pro fab postav smyčku dopravníků a stroje kolem ní. Lot waferů krouží a každý stroj si ho vezme, když je na řadě jeho krok. Hotové kusy ze smyčky vyvede Třídič.',
        'Rozpracované dávky sklad nebere: musí dojet ke stroji, který umí další krok. Když se dávka zasekne, v panelu stroje a v okně Postupy uvidíš, jaký stroj chybí.',
        'Okno Postupy ukáže u každého výrobku všechny kroky, stroje, materiály a jestli se výroba vyplatí.',
        'Auta se kupují sama za svou cenu a platí naftu a servis za každý kilometr. Do kopce jedou pomaleji a silnice ve svahu je dražší.',
        'Stroje se občas porouchají; v panelu stroje jde najmout údržbáře, s ním jsou poruchy třikrát řidší. Výrobní stroje v halách mají obsluhu a mzdy jako doly a pece.',
        'Uhelná teplárna (Strom) dělá z uhlí proud: stroje berou elektřinu nejdřív z ní, přebytek se prodá do sítě. Fab bere chemii a plyny ze Skladu, Sklad je sám dokupuje.',
        'Odběratelé občas pošlou zakázku (vlevo nahoře): dovez do termínu dané množství a dostaneš prémii a bod rozvoje. Okno Statistiky (I) ukáže průběh peněz, výrobu za den a co kde vázne.'].map((t) => h('li', null, t))),
      h('h4', null, 'Ovládání'), h('div', { class: 'keys' }, [['WASD, tažení levým tlačítkem, kurzor u okraje', 'posun'], ['tažení pravým nebo prostředním tlačítkem, Shift + levé, kompas', 'otočení a náklon pohledu'], ['Q a E', 'plynulé otáčení'], ['kolečko', 'přiblížení'], ['dvojklik', 'přelet na místo'], ['G', 'pohled pod zem'], ['klik na střechu', 'vstup do haly'], ['H', 'zpět do dílny'], ['R', 'otočit stavbu'], ['F', 'vzít stavbu pod kurzorem'], ['X', 'bourat'], ['pravé tlačítko, Esc', 'zrušit nástroj'], ['mezerník, 1–4', 'pauza a rychlost'], ['V M C P I', 'Strom, Trh, Čipy, Postupy, Statistiky'], ['Ctrl+S', 'uložit']].map(([a, b]) => kv(a, b))));
  },
};

// ---------------------------------------------------------------- hlavní menu a úrovně
const DONE = 'myc_done'; // splněné úrovně (mimo uloženou hru: platí pro všechny hry)
const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE) ?? '[]')); } catch { return new Set(); } };
const HOW = [['Těž', 'Lom nebo rypadlo postav na ložisko.'], ['Vez', 'Silnice a auto vozí suroviny do Skladu.'], ['Vyráběj', 'Stroje u Skladu z nich dělají zboží.'], ['Prodej a odemykej', 'Tržby dávají body do Stromu rozvoje.']];
const goalList = (L, s) => h('ul', { class: 'goals' }, L.goals.map(([t, f]) => h('li', { class: s && f(s) ? 'done' : '' }, t)));
function startLevel(id, sandbox = false) { // nová hra v dané úrovni a její úvod
  api.newGame({ level: id, sandbox });
  if (sim.levelOf(G.s).guide === 2) G.s.guide = GUIDE2;
  renderQuest();
  if (!sandbox) openModal('intro', true);
}
/** Hlavní menu přes celé okno; svět za ním stojí a pomalu se otáčí. page: 'main' | 'levels'. */
export function showTitle(page = 'main') {
  const t = $('title'), s = G.s, done = doneSet();
  if (!G.title) G.yaw0 = G.cam.yaw;
  G.title = true; document.body.dataset.title = '1'; t.hidden = false; closeModal(); select(null);
  if (G.tool) pick(G.tool);
  const btn = (text, sub, f, cls = '') => h('button', { class: cls, onclick: f }, h('b', null, text), h('small', null, sub));
  if (page === 'main') t.replaceChildren(h('div', { class: 'tbox' }, h('h1', null, 'MAKE YOUR ', h('b', null, 'CPU')), h('p', { class: 'tag' }, 'Od ručního lomu k vlastnímu procesoru. Stroje, postupy a ceny podle skutečnosti.'),
    G.live && btn('Pokračovat', `${sim.levelOf(s).name}, den ${Math.floor(s.t / sim.DAY) + 1}, ${fmt(s.money)}`, hideTitle, 'primary'),
    btn('Výuka', 'První úroveň: krok za krokem tě naučí těžit, vozit a vyrábět', () => startLevel('l1'), G.live ? '' : 'primary'),
    btn('Úrovně a volná hra', `Splněno ${MISSIONS.filter((l) => done.has(l.id)).length} z ${MISSIONS.length - 1} úrovní`, () => showTitle('levels')),
    btn('Pískoviště', 'Vše odemčeno, peníze bez omezení', () => startLevel('free', true)),
    btn('Jak se hraje a ovládání', 'Stručný přehled', () => openModal('menu', true)),
    btn('Konec', 'Zavře hru; rozehraná hra se uloží', () => { api.save(); window.close(); })));
  else t.replaceChildren(h('div', { class: 'tbox wide' }, h('h2', null, 'Úrovně'), h('p', { class: 'tag' }, 'Každá úroveň něco učí a má cíle. Splněná odemkne další.' + (G.live ? ' Nová hra přepíše tu rozehranou.' : '')),
    MISSIONS.map((L, i) => { const open = L.id === 'free' || i === 0 || done.has(MISSIONS[i - 1].id); return h('button', { class: 'lvl' + (done.has(L.id) ? ' done' : ''), disabled: !open, 'data-level': L.id, onclick: () => startLevel(L.id) },
      h('span', { class: 'num' }, L.id === 'free' ? '∞' : i + 1), h('div', null, h('b', null, L.name, done.has(L.id) ? ' ✓' : ''), h('small', null, open ? L.what : `Odemkne se po splnění úrovně „${MISSIONS[i - 1].name}“.`), open && L.goals.length ? h('small', { class: 'gl' }, 'Cíle: ' + L.goals.map((g) => g[0]).join(' · ')) : null)); }),
    h('button', { class: 'back', onclick: () => showTitle() }, 'Zpět')));
}
function hideTitle() { G.title = false; delete document.body.dataset.title; $('title').hidden = true; if (G.yaw0 != null) G.cam.yaw = G.yaw0; G.live = true; }

// ---------------------------------------------------------------- průvodce: jeden krok, jedna věc, zvýrazněné místo. Učí, co těžit a kam to vozit.
const line = (i) => { const l = G.s.line; return l && sim.at(G.s, l[0] + l[2] * i, l[1] + l[3] * i); }; // stroje linky, kterou přinese Dílna elektroniky
const hqB = () => G.s.list.find((b) => b.hq), glassB = () => G.s.list.find((b) => b.model === 'glass_pot');
const quarryAt = ([, x, y]) => G.s.list.find((b) => b.k === 'miner' && Math.hypot(b.x - x, b.y - y) < 14); // lom u startovního ložiska
const quartzQ = () => quarryAt(STARTERS[0]), coalQ = () => quarryAt(STARTERS[1]);
const glassSpot = () => [[3, -1], [-6, -1], [-1, 3], [-1, -6]].map(([x, y]) => ({ x, y, w: 3, h: 3 })).find((m) => !sim.canPlace(G.s, 'glass_pot', m.x, m.y)); // volné místo těsně u Skladu
const GUIDE = [
  { title: 'Rozhlédni se', t: 'Budova uprostřed je tvůj Sklad: sem se vozí všechno, co vytěžíš, a odtud se to prodává. Levým tlačítkem myši táhneš mapu, kolečkem přibližuješ. Zkus pohledem pohnout.', ok: () => G.moved },
  { title: 'Otoč pohled', t: 'Táhni pravým tlačítkem myši, nebo za kompas vlevo dole: pohled se otáčí a naklání na kteroukoli stranu. Zkus to.', hl: ['#compass'], ok: () => Math.abs(G.cam.yaw - CAM0.yaw) > 0.3 || Math.abs(G.cam.pitch - CAM0.pitch) > 0.2 },
  { title: 'Těž uhlí', t: 'Začneš uhlím: tuna stojí kolem 200 $ a vyplatí se i ruční těžba. Černé ložisko je pod šipkou. V záložce Suroviny vyber Ruční lom; u kurzoru uvidíš, co a jak rychle bude těžit. Klikni s ním na ložisko.', hl: ['[data-id=quarry_hand]', '#cats [data-c="Suroviny"]'], mark: () => ({ x: -28, y: 18, w: 2, h: 2 }), ok: () => !!coalQ() },
  { title: 'Cesta do Skladu', t: 'Uhlí musí do Skladu. V záložce Doprava vyber Polní cestu, klikni na lom a pak na Sklad. Cesta mezi nimi se postaví sama a auta po ní začnou jezdit sama.', hl: ['[data-id=road1]', '#cats [data-c="Doprava"]'], mark: () => (G.plan ? hqB() : coalQ()), ok: (s) => !!sim.pathOf(s, coalQ(), hqB()) },
  { title: 'Uhlí a hlušina', t: 'Dva lidé vykopou za hodinu práce asi půl tuny. S každou tunou uhlí vyjdou tři tuny hlušiny; auta vozí obojí do Skladu a obojí se tam prodá. Nad lomem vidíš zásobu ložiska a hromadu. Zrychli čas tlačítkem 10× a počkej, až do Skladu dojede 5 t uhlí.', hl: ['#speed [data-v="10"]'], mark: coalQ, ok: (s) => (s.got.coal ?? 0) >= 5 },
  { title: 'Druhá směna', t: 'Směna pracuje 8 hodin denně, zbytek dne lom stojí. Klikni na lom a tlačítkem + přidej dva lidi: druhá směna zdvojnásobí těžbu.', hl: ['#panel [data-staff="1"]'], mark: coalQ, ok: () => { const q = coalQ(); return !!q && q.staff > MODELS[q.model].crew; } },
  { title: 'Body rozvoje', t: 'Za tržby dostáváš body rozvoje: zelená hvězdička nahoře. Až budeš mít dva, otevři Strom (klávesa V), klikni na Minirypadlo a odemkni ho. Za směnu vytěží sedmnáctkrát víc než dva lidé.', hl: ['#win [data-unlock]', '#win [data-node=mine1]', '#nav [data-m=research]'], ok: (s) => s.research.length > 3 },
  { title: 'Umíš to hlavní', t: 'Těžit, vést cesty, obsazovat směny a odemykat. Co dál: našetři na Minirypadlo (dá se položit přímo přes ruční lom). Bílé ložisko je křemen pro Sklářskou dílnu. Další cíle uvidíš tady.', last: true },
  // druhá část: spustí se po odemknutí Dílny elektroniky
  { p2: true, title: 'Linka na Arduino', t: 'Kolem Skladu vyrostla dílna a u Skladu stojí v řadě pět strojů: linka na Arduino. Klikni na první z nich, tiskař pasty. Ukazuje na něj šipka.', mark: () => line(0), ok: () => !!G.sel && G.sel === line(0) },
  { title: 'Zvol výrobek', t: 'Vpravo se otevřel panel stroje. V poli „Vyrábí“ zvol Arduino Uno R3.', hl: ['#panel select'], mark: () => line(0), ok: () => line(0)?.prod === 'arduino_uno' },
  { title: 'Dokupování dílů', t: 'Linka jede: deska putuje strojem po stroji a díly si stroje berou ze Skladu, kterého se dotýkají. Aby díly nedošly, klikni v panelu na „Dokupovat díly trasy samo“.', hl: ['#panel [data-auto]'], mark: () => line(0), ok: (s) => s.autoBuy.pcb_uno > 0 },
  { title: 'První Arduino', t: 'Zrychli čas tlačítkem 10× nahoře a počkej na první balení Arduina. Hotové se samo prodá.', hl: ['#speed [data-v="10"]'], ok: (s) => s.made.arduino_uno >= 1 },
  { title: 'Rychlejší stroj', t: 'Nejpomalejší je druhý stroj, osazovací automat. Vyměň ho za rychlejší: stiskni X a klikni na něj (zbourání vrací plnou cenu). Pak v záložce Osazování vyber NeoDen YY1 a polož ho na stejné místo.', hl: ['[data-id=pnp_yy1]', '#cats [data-c="Osazování"]'], mark: () => { const l = G.s.line; return l && { x: l[0] + l[2], y: l[1] + l[3], w: 1, h: 1 }; }, ok: () => line(1)?.model === 'pnp_yy1' },
  { title: 'Výrobu umíš taky', t: 'Další obory odemyká Strom, další cíle uvidíš tady.', last: true },
];
const GUIDE2 = GUIDE.findIndex((g) => g.p2); // kde začíná druhá část
function renderQuest() { // karta cíle vlevo nahoře: krok průvodce, cíle úrovně, nebo úkol volné hry
  const s = G.s, g = GUIDE[s.guide], q = QUESTS[s.quest], L = sim.levelOf(s), a = s.guide >= GUIDE2 ? GUIDE2 : 0, n = (a ? GUIDE.length : GUIDE2) - a;
  const next = () => { s.guide = g.last ? null : s.guide + 1; sfx('done'); renderQuest(); };
  const head = (step, title, part) => [h('div', { class: 'qhead' }, h('span', { class: 'qstep' }, step), h('h3', null, title)), h('div', { class: 'qbar' }, h('i', { style: `width:${part * 100}%` }))];
  const goals = L.goals.length ? [h('h4', null, s.won ? 'Cíle úrovně: splněno' : 'Cíle úrovně'), goalList(L, s)] : [];
  goalSig = L.goals.map((x) => +!!x[1](s)).join('');
  if (g) $('quest').replaceChildren(...head(`Krok ${s.guide - a + 1} z ${n}`, g.title, (s.guide - a + 1) / n), h('p', null, g.t), h('div', { class: 'row' },
    g.mark && h('button', { class: 'primary', onclick: () => { const m = g.mark(); if (m) G.fly = { x: m.x + (m.w ?? 1) / 2, y: m.y + (m.h ?? 1) / 2, z: 22 }; } }, 'Ukaž mi kde'), g.last && h('button', { class: 'primary', onclick: next }, 'Rozumím'),
    !g.last && h('button', { class: 'link', onclick: () => { s.guide = null; renderQuest(); } }, 'Přeskočit průvodce')), ...goals);
  else if (goals.length) $('quest').replaceChildren(...head(`Úroveň ${MISSIONS.indexOf(L) + 1}`, L.name, goalSig.split('1').length - 1 ? (goalSig.split('1').length - 1) / L.goals.length : 0), h('p', null, s.won ? 'Úroveň je splněná. Můžeš hrát dál, nebo v Menu přejít na další.' : L.what), ...goals);
  else $('quest').replaceChildren(...(q ? [...head(`Úkol ${s.quest + 1} z ${QUESTS.length}`, 'Další cíl', s.quest / QUESTS.length), h('p', null, q[0]), h('div', { class: 'reward' }, `Odměna ${fmt(q[2])} a ★ ${q[3]}`)] : [...head('Úkoly', 'Všechno splněno', 1), h('p', null, 'Továrna je tvoje.')]));
  const d = s.deal; // zakázka odběratele: co, kolik, kam a do kdy
  if (d) $('quest').append(h('div', { class: 'deal' }, h('h4', null, `Zakázka: ${d.name}`),
    h('p', null, `Dovez ${qty(d.n, d.it)}: ${ITEMS[d.it].name.split(' (')[0].toLowerCase()}, do ${hours((d.until - s.t) / HOUR)}. Prémie ${fmt(d.bonus)} a ★ 1 navíc k ceně.`),
    h('div', { class: 'qbar' }, h('i', { style: `width:${Math.min(1, d.got / d.n) * 100}%` })), h('small', null, `doručeno ${num(Math.min(d.got, d.n))} z ${num(d.n)}`),
    h('button', { class: 'link', onclick: () => { G.under = false; G.fly = { x: d.x + 5, y: d.y + 4, z: 14 }; } }, 'Ukázat odběratele')));
}
function tickGuide(s) { // zvýrazní, kam kliknout, a po splnění kroku jde dál
  const g = GUIDE[s.guide], m = g?.mark?.();
  G.mark = m ? { x: m.x, y: m.y, w: m.w ?? 1, h: m.h ?? 1, top: m.k === 'npc' ? 5 : m.hq ? 3.5 : m.model ? 2.5 : 1.5 } : null;
  const el = g?.hl?.map((q) => document.querySelector(q)).find(Boolean);
  for (const e of document.querySelectorAll('.pulse')) if (e !== el) e.classList.remove('pulse');
  el?.classList.add('pulse');
  if (g && !g.last && g.ok(s)) { s.guide++; sfx('done'); renderQuest(); }
}
export function initUI(a) {
  api = a;
  $('nav').append(h('button', { title: 'Zpět do dílny', onclick: home }, 'Dílna', h('kbd', null, 'H')), ...[['research', 'Strom', 'V'], ['market', 'Trh', 'M'], ['chips', 'Čipy', 'C'], ['routes', 'Postupy', 'P'], ['stats', 'Statistiky', 'I'], ['menu', 'Menu', 'Esc']].map(([id, t, k]) => h('button', { 'data-m': id, onclick: () => openModal(id) }, t, h('kbd', null, k))));
  $('pts').addEventListener('click', () => openModal('research'));
  $('speed').append(...[0, 1, 3, 10, 30].map((v) => h('button', { 'data-v': v, title: v ? `Rychlost ${v}×` : 'Pauza (mezerník)', onclick: () => setSpeed(v) }, v ? v + '×' : 'Ⅱ')));
  // kompas: táhnutím za něj se pohled otáčí a naklání stejně jako pravým tlačítkem v mapě; střelka ukazuje sever
  const comp = h('div', { id: 'compass', title: 'Táhni myší: pohled se otáčí a naklání. Střelka ukazuje sever.' }, h('i'), h('span', null, 'Táhni: otočit pohled'));
  let cd = null;
  comp.addEventListener('pointerdown', (e) => { comp.setPointerCapture(e.pointerId); cd = [e.clientX, e.clientY]; });
  comp.addEventListener('pointermove', (e) => { if (!cd) return; G.cam.yaw -= (e.clientX - cd[0]) * 0.012; G.cam.pitch = clamp(G.cam.pitch + (e.clientY - cd[1]) * 0.008, 0.12, 1.55); cd = [e.clientX, e.clientY]; G.fly = null; G.moved = true; });
  comp.addEventListener('pointerup', () => { cd = null; });
  $('viewpad').append(comp, h('button', { title: 'Otočit pohled doleva (Q)', onclick: () => turn(1) }, '⟲'), h('button', { title: 'Otočit pohled doprava (E)', onclick: () => turn(-1) }, '⟳'),
    h('button', { title: 'Pohled shora', onclick: () => tilt(1.5) }, 'Shora'), h('button', { title: 'Šikmý pohled', onclick: () => tilt(0.9) }, 'Šikmo'), h('button', { title: 'Pohled nízko nad zemí', onclick: () => tilt(0.3) }, 'Nízko'),
    h('button', { class: 'wide', 'data-under': 1, title: 'Průhledná zem: jámy, vrty, šachty a nerosty v patrech (G)', onclick: toggleUnder }, 'Pod zem'));
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });
  bindInput();
  resetUI();
}
export function resetUI() { stockSig = null; G.title = false; delete document.body.dataset.title; $('title').hidden = true; select(null); G.tool = null; modeUI(); $('viewpad').querySelector('[data-under]')?.classList.remove('on'); closeModal(); renderBuild(); renderQuest(); setSpeed(G.speed); }
export function tickUI(now, dt) {
  if (G.title) { G.cam.yaw += dt * 0.04; return; } // za hlavním menu se svět jen pomalu otáčí
  const s = G.s, pan = (700 / G.cam.z) * dt, sn = Math.sin(G.cam.yaw), cs = Math.cos(G.cam.yaw);
  const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0), rt = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let ex = rt, ey = fw;
  if (G.hover && G.mouse && !drag && !ex && !ey) { // kurzor u okraje okna posouvá mapu
    const { x, y } = G.mouse;
    ex = x > innerWidth - 12 ? 1 : x < 12 ? -1 : 0; ey = y > innerHeight - 12 ? -1 : y < 58 ? 1 : 0;
  }
  const spin = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0); // Q a E otáčejí pohled plynule, dokud se drží
  if (spin) { G.cam.yaw += spin * 1.6 * dt; if (G.fly) delete G.fly.yaw; G.moved = true; }
  $('compass').firstChild.style.transform = `rotate(${G.cam.yaw}rad)`;
  if (ex || ey) { G.cam.x += (ex * cs - ey * sn) * pan; G.cam.y += (-ex * sn - ey * cs) * pan; if (G.fly) { delete G.fly.x; delete G.fly.y; } G.moved = true; } // posun podle natočení pohledu
  $('money').textContent = fmt(s.money);
  if (now - lastSlow < 250) return;
  lastSlow = now;
  $('flow').textContent = `příjem ${fmt(s.rateIn)} · výdaje ${fmt(s.rateOut)} za den` + (s.gen ? ` · proud ${num(s.mwh, 1)} MWh` : '');
  $('ptsn').textContent = `★ ${s.sandbox ? '∞' : s.pts}`; $('ptsbar').style.width = Math.min(100, (s.xp / sim.needOf(s.lvl)) * 100) + '%';
  $('ptsnext').textContent = `další za ${fmt(sim.needOf(s.lvl) - s.xp)}`;
  const inv = Object.keys(ITEMS).filter((it) => s.inv[it] >= 1).sort((a, b) => s.inv[b] * ITEMS[b].usd - s.inv[a] * ITEMS[a].usd).slice(0, 4).sort(), sg = inv.map((it) => it + Math.floor(s.inv[it])).join(); // čtyři nejcennější zásoby Skladu: vidět hned, bez klikání
  if (sg !== stockSig) { stockSig = sg; $('stock').replaceChildren(h('small', null, 'Ve Skladu'), h('div', null, inv.length ? inv.map((it) => h('span', { title: ITEMS[it].name }, icon(it, 16), h('b', null, num(Math.floor(s.inv[it]))), ' ' + ITEMS[it].name.split(' (')[0])) : h('span', { class: 'dim' }, 'zatím nic'))); }
  $('pts').title = `Body rozvoje: utrácejí se ve Stromu (V). Další bod za tržby ${fmt(sim.needOf(s.lvl) - s.xp)}.`;
  $('clock').textContent = `Den ${Math.floor(s.t / sim.DAY) + 1} · ${String(Math.floor((s.t % sim.DAY) / HOUR)).padStart(2, '0')}:00`;
  for (const fx of s._fx.splice(0)) {
    if (fx.win) { localStorage.setItem(DONE, JSON.stringify([...doneSet().add(fx.win)])); sfx('done'); renderQuest(); openModal('win', true); }
    else if (fx.quest != null) { toast(`Úkol splněn: +${fmt(fx.usd)} a ★ ${fx.pts}`, 'ok', 7000); sfx('done'); renderQuest(); }
    else if (fx.lvl != null) { toast(`Nový bod rozvoje. Máš ★ ${s.pts}: utrať je ve Stromu (klávesa V).`, 'ok', 7000); sfx('done'); }
    else if (fx.deal) { toast(fx.deal === 'new' ? `Nová zakázka od odběratele: ${s.deal?.name ?? ''}. Podrobnosti vlevo nahoře.` : fx.deal === 'done' ? `Zakázka splněna: prémie ${fmt(fx.usd)} a ★ 1` : 'Zakázka propadla: nestihlo se to. Další přijde zítra.', fx.deal === 'fail' ? 'err' : 'ok', 7000); sfx(fx.deal === 'fail' ? 'error' : 'done'); renderQuest(); }
    else if (fx.broke) toast(`Porucha: ${MODELS[fx.broke].name.split(':')[0]}. Oprava ${sim.FIX_H} h za ${fmt(fx.usd)}. Údržbář v panelu stroje poruchy zředí.`, 'err', 6000);
    else { saleToast(fx.it, fx.usd); if (now - lastCoin > 1500) { sfx('coin'); lastCoin = now; } }
  }
  if (G.sel && !s.list.includes(G.sel)) select(null);
  if (G.hot && $('tip').dataset.w && s.list.includes(G.hot)) $('tip').replaceChildren(...tipBody(G.hot)); // pruhy v bublině běží živě
  const ds = s.deal ? `${Math.min(s.deal.got, s.deal.n)}:${Math.ceil((s.deal.until - s.t) / HOUR)}` : '';
  if (goalSig !== sim.levelOf(s).goals.map((x) => +!!x[1](s)).join('') || ds !== dealSig) { dealSig = ds; renderQuest(); } // splněný cíl se odškrtne, zakázka ukazuje postup
  tickGuide(s);
  panelDyn?.(); modal?.dyn?.();
  for (const b of $('tools').children) if (b.dataset.usd) b.classList.toggle('poor', !s.sandbox && s.money < +b.dataset.usd);
  const hv = G.hover;
  if (hv) {
    const o = sim.oreAt(s, hv.x, hv.y), b = sim.at(s, hv.x, hv.y), w = b?.it && ITEMS[b.it];
    const rd = s._road.get(sim.key(hv.x, hv.y));
    $('coords').textContent = `${hv.x}, ${hv.y} m` + (b?.model ? ` · ${MODELS[b.model].name}` : b?.k === 'npc' ? ` · ${b.name}` : rd ? ` · ${sim.defOf('road' + rd).name}` : w ? ` · ${w.wip ? `čeká na: ${KINDS[ROUTES[w.route].ops[w.step].kind].name}` : w.name}` : o ? ` · ložisko: ${ORES[o].name}, zbývá ${num(sim.left(s, hv.x, hv.y))} t/m²` : sim.isHall(s, hv.x, hv.y) && !sim.isFloor(s, hv.x, hv.y) ? ' · hala' : sim.isFloor(s, hv.x, hv.y) ? ' · čistý prostor' : '');
  }
  if (now - lastMini > 1000) { lastMini = now; api.minimap(); }
}
