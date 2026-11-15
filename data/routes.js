// Výrobní trasy hry. Kroky pocházejí z výrobních postupů v data/hw/processes.js a parts_fab.js (rešerše se zdroji);
// vlastní jsou jen garážový postup hobby10 (podle čipu Z2 Sama Zeloofa), euv5 a keramické pouzdro. Dávka (lot, přepravka,
// panel) projde stroji v pořadí kroků; každý krok udělá stroj daného druhu.
import PROCESSES_BASE from './hw/processes.js';
import { PROCESSES_EXTRA } from './hw/parts_fab.js';
import MATERIALS, { ROUTES as OWN_CHIP_ROUTES } from './hw/materials.js';
import PRICES from './prices.js';
import { KINDS, ITEMS, CHIPS, BOARDS, BUILDS, MODELS, SELL, diesPerWafer, yieldOf } from './catalog.js'; // MODELS: i pro úkoly se směnami

export const MATS = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));
const W = 'https://en.wikipedia.org/wiki/';
const ZELOOF = OWN_CHIP_ROUTES.find((r) => r.id === 'route_zeloof');
const st = (name, what, machines, materials = []) => ({ name, what, machines, materials });

export const PROC = {
  ...PROCESSES_BASE, ...PROCESSES_EXTRA,
  hobby10: {
    name: 'Garážový MOS proces 10–3 µm s polykřemíkovým hradlem (podle čipu Z2 Sama Zeloofa)', year: 2021, fact: 'estimate',
    what: ZELOOF?.what ?? 'Domácí výroba čipů z nakoupených waferů, spin-on dopantů a podomácku stavěných pecí a litografie.',
    sources: ZELOOF?.sources ?? [], fabs: [],
    steps: [
      st('Výchozí wafer a čištění', 'Kupovaný wafer už má hradlový oxid a vrstvu polykřemíku. Očistí se rozpouštědly a krátce v HF.', ['m_wet_bench'], ['mat_si_wafer', 'mat_wet_chem']),
      st('Litografie hradel', 'Rezist se nanese odstředěním, bezmaskový stepper promítne vzor hradel a rezist se vyvolá.', ['m_track', 'm_iline_stepper'], ['mat_photoresist']),
      st('Leptání polykřemíku', 'Plazma odleptá polykřemík mimo hradla; hradlo pak samo slouží jako maska pro dopování.', ['m_etch'], ['mat_specialty_gases']),
      st('Dopování source a drain', 'Spin-on dopant (fosfor nebo bor) se nanese odstředěním a v trubkové peci při ~1000 °C zadifunduje do křemíku.', ['m_track', 'm_furnace'], ['mat_dopants']),
      st('Odstranění skla dopantu', 'Zbylé sklo po difúzi se odleptá v HF.', ['m_wet_bench'], ['mat_wet_chem']),
      st('Izolační oxid', 'Spin-on sklo se nanese a vypálí; izoluje hradla od kovu.', ['m_track', 'm_furnace'], ['mat_precursors']),
      st('Kontaktní okna', 'Druhá maska otevře v oxidu okna ke kontaktům, oxid se vyleptá v HF.', ['m_track', 'm_iline_stepper', 'm_wet_bench'], ['mat_photoresist', 'mat_wet_chem']),
      st('Naprášení hliníku', 'Na celý wafer se ve vakuu napráší vrstva hliníku.', ['m_pvd'], ['mat_sputter_targets']),
      st('Litografie a leptání kovu', 'Třetí maska vytvaruje hliníkové spoje, zbytek se odleptá.', ['m_track', 'm_iline_stepper', 'm_wet_bench'], ['mat_photoresist', 'mat_wet_chem']),
      st('Žíhání kontaktů', 'Krátké žíhání ve formovacím plynu zlepší kontakt hliníku s křemíkem.', ['m_furnace'], ['mat_bulk_gases']),
      st('Měření na hrotech', 'Každý čip se na hrotové stanici změří zdrojem-měřičem (SMU).', ['m_prober', 'm_ate']),
    ],
  },
  euv5: {
    name: 'TSMC N5 (FinFET, EUV) – AMD Ryzen 7000', year: 2020, fact: 'estimate', sources: [W + '5_nm_process'],
    what: 'FinFET s EUV litografií na zhruba deseti až čtrnácti vrstvách; EUV nahrazuje vícenásobné vzorování 193i u hradel, kontaktů a spodních kovů.',
    fabs: [{ name: 'TSMC Fab 18, Tainan', country: 'TW', lat: 23.11, lon: 120.27, fact: 'doc', src: W + '5_nm_process' }],
    steps: [
      st('Vzorování finů (SAQP)', 'Finy vznikají čtyřnásobným samozarovnaným vzorováním z expozice 193i.', ['m_duv_immersion', 'm_track', 'm_cvd', 'm_ald', 'm_etch', 'm_cdsem'], ['mat_photoresist', 'mat_photomask', 'mat_precursors']),
      st('Izolace a odhalení finů', 'Vyplnění oxidem, CMP a zpětné leptání, aby fin vyčníval.', ['m_cvd', 'm_cmp', 'm_etch'], ['mat_precursors', 'mat_cmp_slurry']),
      st('Implantace van a Vt', 'Nastavení typu a prahového napětí tranzistorů.', ['m_implanter', 'm_furnace'], ['mat_dopants']),
      st('Obětní hradla a řez hradel EUV', 'Obětní polykřemíková hradla; řezy hradel exponuje EUV jednou expozicí.', ['m_euv', 'm_track', 'm_cvd', 'm_ald', 'm_etch'], ['mat_photoresist', 'mat_photomask', 'mat_tin_euv']),
      st('Epitaxní S/D', 'Source a drain dorostou epitaxním SiGe (PMOS) a SiP (NMOS).', ['m_etch', 'm_cvd'], ['mat_specialty_gases', 'mat_dopants']),
      st('HKMG gate-last', 'Obětní hradlo nahradí oxid hafnia a pracovní kovy z ALD.', ['m_ald', 'm_pvd', 'm_cvd', 'm_cmp', 'm_etch'], ['mat_precursors', 'mat_sputter_targets', 'mat_cmp_slurry']),
      st('Kontakty EUV', 'Kontakty k tranzistorům exponované EUV, plněné kobaltem nebo wolframem.', ['m_euv', 'm_track', 'm_etch', 'm_pvd', 'm_cvd', 'm_cmp'], ['mat_photoresist', 'mat_sputter_targets', 'mat_cmp_slurry']),
      st('Spodní kovy EUV', 'Nejhustší měděné vrstvy s roztečí kolem 30 nm jednou expozicí EUV.', ['m_euv', 'm_track', 'm_cvd', 'm_etch', 'm_pvd', 'm_ecd', 'm_cmp'], ['mat_photoresist', 'mat_photomask', 'mat_cu_plating', 'mat_cmp_slurry']),
      st('Vyšší kovy 193i', 'Řidší vrstvy mědi exponuje imerzní skener.', ['m_duv_immersion', 'm_track', 'm_cvd', 'm_etch', 'm_pvd', 'm_ecd', 'm_cmp'], ['mat_photoresist', 'mat_cu_plating', 'mat_cmp_slurry']),
      st('Pasivace a pady', 'Ochranné vrstvy a pady pro bumpy.', ['m_pvd', 'm_cvd', 'm_etch'], ['mat_sputter_targets', 'mat_precursors']),
      st('Inline kontrola a metrologie', 'Optická inspekce defektů a CD-SEM.', ['m_inspection', 'm_cdsem']),
      st('Test na waferu', 'Funkční test každého čipu.', ['m_prober', 'm_ate']),
    ],
  },
  pkg_cerdip: {
    name: 'Keramické pouzdro DIP s víčkem (CERDIP)', year: 1965, fact: 'estimate', sources: [W + 'Dual_in-line_package'], fabs: [],
    what: 'Čip se vlepí do keramického pouzdra, drátky se připojí k vývodům a pouzdro se hermeticky uzavře víčkem. Tak se pouzdřily první mikroprocesory.',
    steps: [
      st('Dělení waferu', 'Wafer se rozdělí na jednotlivé čipy.', ['m_dicer']),
      st('Vlepení čipu do pouzdra', 'Čip se přilepí do dutiny keramického pouzdra.', ['m_die_bonder'], ['mat_leadframe']),
      st('Drátkování', 'Zlaté nebo hliníkové drátky spojí plošky čipu s vývody.', ['m_wire_bonder'], ['mat_bond_wire']),
      st('Uzavření víčkem', 'Víčko se přivaří nebo přilepí; čip je hermeticky uzavřený.', ['m_seam_sealer']),
      st('Finální test', 'Každý kus se elektricky otestuje.', ['m_ate']),
    ],
  },
};

const LITHO = new Set(['m_iline_stepper', 'm_duv_immersion', 'm_euv']);
// Postup → pořadí strojů. U litografie: nanést rezist (track) → osvit → vyvolat (track).
function flat(key, { rep = {}, map = {}, order } = {}) {
  const out = [], steps = PROC[key].steps;
  for (const si of order ?? steps.map((_, i) => i)) {
    const s = steps[si];
    let ms = (s.machines ?? []).map((m) => map[m] ?? m);
    const li = ms.find((m) => LITHO.has(m));
    if (li && ms.includes('m_track')) ms = ms.filter((m) => m !== 'm_track').flatMap((m) => (m === li ? ['m_track', li, 'm_track'] : [m]));
    for (let r = 0; r < (rep[si] ?? 1); r++) for (const m of ms) out.push({ kind: m, name: s.name, what: s.what, mats: s.materials ?? [], proc: key, si });
  }
  return out;
}

export const ROUTES = {};
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 58%)`; };
const SHAPE = { fab: 'foup', pkg: 'tray', smt: 'board', pcb: 'pcb', passive: 'box', wafer: 'ingot', bulk: 'ore', build: 'pc' };
// ctx = velikost dávky v jednotkách jednotlivých druhů strojů; z ní a z referenčního výkonu vyjde čas kroku.
function route(id, name, cat, ops, ctx, o = {}) {
  const r = { id, name, cat, req: o.req, chip: o.chip ?? null, wafer: o.wafer ?? null, cd: o.cd ?? null, out: o.out ?? null, tape: o.tape ?? null, lot: o.lot ?? null, dies: o.dies ?? null };
  r.ops = ops.map((op, i) => {
    const kd = KINDS[op.kind];
    const units = op.units ?? ctx[kd.u] ?? 1;
    const opex = (op.kind === 'm_track' ? o.resist ?? 0.5 : kd.opex) * units + (i === 0 ? o.mat ?? 0 : 0);
    return { kind: op.kind, name: op.name, what: op.what, mats: op.mats ?? [], proc: op.proc, h: op.h ?? units / kd.ref, opex, in: op.in ?? null, nw: !!op.nw };
  });
  if (o.in) r.ops[0].in = { ...o.in, ...(r.ops[0].in ?? {}) };
  ROUTES[id] = r;
  for (let i = 1; i < r.ops.length; i++) ITEMS[`w:${id}:${i}`] = { id: `w:${id}:${i}`, name: `${name} – před krokem ${i + 1}/${r.ops.length}: ${r.ops[i].name}`, wip: true, route: id, step: i, usd: 0, pack: 'dávka', cat: 'Rozpracováno', shape: SHAPE[cat], col: hue(id), buy: false, sell: false };
  return r;
}

// ---------------------------------------------------------------- fab: jedna trasa na čip
// d0 = hustota defektů zralého procesu (na cm²), resist = cena rezistu na wafer a průchod, rep = opakování kroků (vrstvy kovu)
export const FAB = {
  hobby10: { wafer: 100, lot: 5, d0: 2, resist: 0.3, req: 'fab0' },
  st05: { wafer: 200, d0: 0.12, resist: 0.6, rep: { 10: 3, 11: 2 }, req: 'fab200', cd: 500 },
  power: { wafer: 200, d0: 0.12, resist: 0.6, req: 'power', cd: 500 },
  tsmc28: { wafer: 300, d0: 0.1, resist: 4, rep: { 7: 4 }, req: 'fab300' },
  intel22: { wafer: 300, d0: 0.1, resist: 4, rep: { 8: 5 }, req: 'finfet' },
  intel14: { wafer: 300, d0: 0.1, resist: 4, rep: { 6: 4, 8: 3 }, req: 'finfet' },
  tsmc16: { wafer: 300, d0: 0.1, resist: 4, rep: { 7: 5 }, req: 'finfet' },
  samsung8n: { wafer: 300, d0: 0.1, resist: 4, rep: { 7: 5 }, req: 'n8' },
  dram: { wafer: 300, d0: 0.08, resist: 4, rep: { 7: 2 }, req: 'memory', cd: 500 },
  vnand: { wafer: 300, d0: 0.08, resist: 4, rep: { 1: 3 }, req: 'memory', cd: 500 },
  euv5: { wafer: 300, d0: 0.1, resist: 10, rep: { 7: 5, 8: 4 }, req: 'euv' },
};
// Pouzdření: pořadí kroků postupu, výzkum, materiál pouzdra v USD na kus (rámeček, substrát, drátky, hmota)
const abf = (PRICES.abf_substrate?.usd ?? 600) / 100;
export const PKG = {
  pkg_cerdip: { req: 'fab0', mat: 3 },
  pkg_wirebond: { req: 'pkg1', mat: 0.12 },
  pkg_flipchip: { req: 'pkg2', mat: abf, order: [1, 2, 0, 3, 4, 5, 6, 7] }, // nejdřív bumpy a dělení waferu, pak substrát a osazení
  pkg_cowos: { req: 'pkg3', mat: 40 + abf * 3, order: [0, 3, 4, 5, 6, 7], src: 'pkg_cowos' },
  pkg_hbm: { req: 'pkg3', mat: 2, order: [1, 2, 7], src: 'pkg_cowos' },
};
for (const c of Object.values(CHIPS)) {
  const f = FAB[c.process], lot = f.lot ?? 25, gross = diesPerWafer(f.wafer, c.die) * lot;
  c.wafer = f.wafer; c.lot = lot; c.gross = gross; c.yield0 = yieldOf(c.die, f.d0);
  const order = c.process === 'dram' && c.id !== 'hbm2_4gb' ? PROC.dram.steps.map((_, i) => i).filter((i) => i !== 8) : undefined; // TSV jen u HBM
  const pre = c.process === 'hobby10' || c.process === 'st05' ? [] : [{ kind: 'm_wet_bench', name: 'Vstupní čištění waferů', what: 'Nové wafery se před prvním krokem vyčistí lázněmi RCA.', mats: ['mat_si_wafer', 'mat_wet_chem'], proc: c.process }];
  route('fab_' + c.id, `${c.name} – výroba na waferu`, 'fab', [...pre, ...flat(c.process, { rep: f.rep, order })], { wafer: lot, unit: Math.min(gross, 20000) },
    { req: f.req, chip: c.id, wafer: f.wafer, cd: c.cd ?? f.cd, resist: f.resist, in: { ['wafer' + f.wafer]: 1 }, tape: c.id, lot, dies: gross });
  const p = PKG[c.pkg], n = gross * 0.8, ops = flat(p.src ?? c.pkg, { order: p.order });
  let cut = false; // po rozřezání waferu už na jeho průměru nezáleží (nw)
  for (const op of ops) { op.nw = cut; if (op.kind === 'm_dicer') cut = true; }
  if (c.extra) ops.find((op) => op.si === 4).in = Object.fromEntries(Object.entries(c.extra).map(([it, q]) => [it, (q * n) / 100])); // 4× HBM2 na GP100 v kroku Chip-on-Wafer
  route('pkg_' + c.id, `${c.name} – pouzdření a test`, 'pkg', ops, { wafer: lot, unit: n, wire: n * c.pins, board: n / 100, kpcs: n / 1000, panel: n / 200 },
    { req: p.req, chip: c.id, wafer: f.wafer, in: { ['wl_' + c.id]: 1 }, mat: (c.pkg === 'pkg_flipchip' ? (abf * c.sub) / 1400 : p.mat) * n, dies: gross });
}

// ---------------------------------------------------------------- DPS: [vrstvy, plocha desky m²]
const PCBS = { pcb_uno: [2, 0.0037, 'pcb1'], pcb_edge3d: [4, 0.0214, 'pcb1'], pcb_dimm: [6, 0.0041, 'pcb2'], pcb_k620: [6, 0.011, 'pcb2'], pcb_gpu: [10, 0.0264, 'pcb2'], pcb_atx: [4, 0.0744, 'pcb2'], pcb_ssd: [6, 0.0018, 'pcb2'] };
for (const [id, [layers, area, req]] of Object.entries(PCBS)) {
  const panels = Math.ceil((area * 100) / 0.2), inner = (layers - 2) / 2;
  const ops = flat('pcb', { map: { m_wet_bench: 'm_pcb_etch', m_ate: 'm_fct' }, rep: { 0: inner, 1: inner }, order: layers > 2 ? undefined : [3, 4, 5, 6, 7, 8] });
  route(id, ITEMS[id].name, 'pcb', ops, { panel: panels, board: panels, unit: 100 }, { req, out: { [id]: 1 }, mat: panels * layers * 3 }); // laminát a měděná fólie
}

// ---------------------------------------------------------------- osazování (SMT): kusovník v baleních na 100 desek
const PACK = { mlcc: 10000, resistor: 10000, elcap: 1000, tantalum: 1000, polymer_cap: 1000, inductor: 1000, crystal: 1000 };
const MANUAL = new Set(['cooler_small', 'cooler_gpu', 'thermal_pad']); // montuje se ručně až po pájení
for (const b of Object.values(BOARDS)) {
  const packs = (f) => Object.fromEntries(Object.entries(b.bom).filter(([it]) => MANUAL.has(it) === f).map(([it, n]) => [it, (n * 100) / (PACK[it] ?? 100)]));
  const ops = flat('smt', { map: { m_ate: 'm_fct' }, order: [0, 1, 2, 4, 6] }).filter((op) => op.kind !== 'm_inspection' && !(op.si === 0 && op.kind === 'm_aoi'));
  ops.find((op) => op.kind === 'm_pick_place').in = packs(false);
  const hand = packs(true);
  if (Object.keys(hand).length) ops.splice(ops.length - 1, 0, { kind: 'm_assembly', name: 'Montáž chladiče', what: 'Na osazenou desku se ručně nasadí teplovodivé podložky a přišroubuje chladič.', in: hand, h: 100 / 30 });
  route(b.id, b.name, 'smt', ops, { board: 100, place: 100 * b.places, unit: 100 }, { req: b.req, in: { [b.pcb]: 1 }, out: { [b.id]: 1 } });
}
for (const b of Object.values(BUILDS)) {
  route(b.id, b.name, 'build', [{ kind: 'm_assembly', name: 'Montáž počítače', what: 'Technik sestaví počítač z hotových dílů, zapojí kabely a spustí zátěžový test.', in: b.bom }], { unit: 100 }, { req: 'pc', out: { [b.id]: 1 } });
}

// ---------------------------------------------------------------- pasivní součástky a mechanika: [postup, dávka v tis. ks, kusů v balení]
const PASSIVE = {
  mlcc: ['mlcc', 1000, 10000], resistor: ['chip_resistor', 1000, 10000], elcap: ['al_elcap', 20, 1000], tantalum: ['tantalum', 20, 1000, 120], polymer_cap: ['polymer_cap', 20, 1000],
  inductor: ['inductor', 20, 1000], crystal: ['crystal', 20, 1000], conn_small: ['connector', 10, 100], conn_slot: ['connector', 10, 100], conn_socket: ['connector', 10, 100, 1500],
  conn_video: ['connector', 10, 100], conn_power: ['connector', 10, 100], fan120: ['fan_cooler', 2, 100, 800], cooler_cpu: ['fan_cooler', 2, 100, 1500],
  cooler_small: ['fan_cooler', 2, 100, 500], cooler_gpu: ['fan_cooler', 2, 100, 6000], thermal_pad: ['thermal_pad', 5, 100],
};
for (const [id, [proc, kpcs, pack, matPerK = 0]] of Object.entries(PASSIVE)) {
  route('mk_' + id, ITEMS[id].name, 'passive', flat(proc), { kpcs, wafer: 25, unit: kpcs * 1000, board: kpcs / 5, place: kpcs * 5000, panel: 10 },
    { req: 'passives', out: { [id]: (kpcs * 1000) / pack }, mat: matPerK * kpcs });
}

// ---------------------------------------------------------------- křemík: křemen → metalurgický křemík → polykřemík → ingot → wafery
const WS = PROC.wafer.steps;
const one = (kind, si, inp) => [{ kind, name: WS[si].name, what: WS[si].what, mats: WS[si].materials, proc: 'wafer', in: inp }];
route('mgsi', ITEMS.mgsi.name, 'bulk', one('m_arc_furnace', 1, { quartz: 2.7, coal: 1.2 }), { t: 1 }, { req: 'silicon', out: { mgsi: 1 } });
route('polysi', ITEMS.polysi.name, 'bulk', one('m_siemens', 2, { mgsi: 1.1 }), { t: 1 }, { req: 'silicon', out: { polysi: 10 } });
for (const [d, poly, wafers] of [[200, 1.2, 800], [300, 4, 1000]]) {
  route('ingot' + d, ITEMS['ingot' + d].name, 'wafer', one('m_cz_puller', 3, { polysi: poly }), { ingot: 1 }, { req: 'wafers', wafer: d, out: { ['ingot' + d]: 1 } });
  route('wafer' + d, ITEMS['wafer' + d].name, 'wafer', flat('wafer', { order: [5, 6, 7, 8, 9, 10] }), { wafer: wafers }, { req: 'wafers', wafer: d, in: { ['ingot' + d]: 1 }, out: { ['wafer' + d]: wafers / 25 } });
}

// sklo: první vlastní výroba ve hře (křemen + uhlí → sklo)
route('glass', ITEMS.glass.name, 'bulk', [{ kind: 'm_glass', name: 'Tavení skla', what: 'Křemen se sodou a vápencem se ve vanové peci roztaví při 1 500 °C na sklovinu, ze které automaty lisují a foukají obalové sklo.', in: { quartz: 0.74, coal: 0.24 } }], { t: 1 }, { req: 'glass1', out: { glass: 1 } });
// sklářská dílna: dávka 100 kg; malá pec hoří celý den, proto spotřebuje na kilogram skla mnohem víc paliva než vana (odhad z příkonu hořáku 150 000 BTU/h)
route('glassware', ITEMS.glassware.name, 'bulk', [{ kind: 'm_glass_studio', name: 'Tavení a foukání skla', what: 'V pánvové peci se utaví vsázka z křemene, sody a vápence a skláři z ní píšťalou foukají užitkové sklo.', in: { quartz: 0.074, coal: 0.14 } }], { t: 0.1 }, { req: 'glass0', out: { glassware: 1 } });

// kdo položku spotřebovává: podle toho sklad pozná, co je hotový výrobek na prodej a co díl do další výroby
export const USERS = {};
for (const r of Object.values(ROUTES)) for (const op of r.ops) for (const it in op.in ?? {}) (USERS[it] ??= []).push(r);
// které trasy může stroj daného druhu zahájit
export const STARTS = {};
for (const r of Object.values(ROUTES)) (STARTS[r.ops[0].kind] ??= []).push(r.id);
export const canDo = (model, r, op) => model.kind === op.kind && (op.nw || !model.wafer || !r.wafer || model.wafer.includes(r.wafer)) && (!model.res || !r.cd || model.res <= r.cd);
// Ekonomika jedné dávky při nákupu všech dílů na Trhu: díly, spotřební materiál a tržba za výstup (bez elektřiny).
export function econ(r) {
  let parts = 0, opex = 0, out = 0;
  for (const op of r.ops) { opex += op.opex; for (const it in op.in ?? {}) parts += op.in[it] * ITEMS[it].usd; }
  if (r.out) for (const it in r.out) out += r.out[it] * ITEMS[it].usd * SELL;
  else if (r.cat === 'pkg') out = ((CHIPS[r.chip].gross * CHIPS[r.chip].yield0) / 100) * ITEMS[r.chip].usd * SELL;
  else out = ITEMS['wl_' + r.chip].usd; // lot waferů se neprodává; hodnota = cena téhož lotu od foundry (0, když ho foundry nenabízí)
  return { parts, opex, out };
}

// ---------------------------------------------------------------- strom rozvoje: odemyká se za body rozvoje (herní hodnota), ne za peníze
// R(id, větev, název, cena v bodech, co musí být odemčeno předtím, popis). Body přicházejí s tržbami a za úkoly (sim.js).
export const LANES = ['Těžba', 'Doprava', 'Elektronika', 'Čipy', 'Křemík'];
const R = (id, lane, name, pts, req, what) => ({ id, lane, name, pts, req, what });
export const RESEARCH = [
  R('mine0', 0, 'Ruční lom', 0, [], 'Dva dělníci s palicemi, klíny a kolečkem. Pomalé, ale skoro zadarmo. S tím hra začíná.'),
  R('glass0', 0, 'Sklářská dílna', 0, [], 'Pánvová pec a dva skláři: z křemene a uhlí 90 kg foukaného skla za směnu. Na začátek drahá (40 000 $), ale z tuny křemene udělá zboží za desetitisíce.'),
  R('glass1', 0, 'Vanová sklářská pec', 3, ['glass0', 'car2'], 'Kontinuální vana na 80 t obalového skla denně. Stojí 12 milionů a potřebuje tři směny.'),
  R('mine1', 0, 'Minirypadlo', 2, ['mine0'], 'Kubota U17-3 vytěží za směnu sedmnáctkrát víc než dva lidé v ručním lomu.'),
  R('survey', 0, 'Průzkumný vrt', 2, ['mine1'], 'Malá vrtná souprava ukáže, co leží v patrech pod zemí do hloubky 100 m.'),
  R('shaft1', 0, 'Malý důl', 3, ['survey'], 'Šachta s vrátkem do 100 m: uhlí, sůl a měď, které na povrchu nejsou.'),
  R('mine2', 0, 'Velké rypadlo s drtičem', 4, ['mine1', 'car2'], 'Caterpillar 320 a čelisťový drtič: 150 t za hodinu. Bez pořádných aut a silnice to neodvezeš.'),
  R('shaft2', 0, 'Hlubinný důl', 5, ['shaft1'], 'Jádrová souprava LF90D a úpadnice s nakladačem až do 300 m: cín a zlato.'),
  R('road1', 1, 'Polní cesta', 0, [], 'Vyježděná cesta. Po každé silnici jezdí auta sama: stačí ji dovést od lomu k cíli. S tím hra začíná.'),
  R('belts', 1, 'Pásové dopravníky', 2, ['road1'], 'Dopravník veze tunu na metr bez auta: lom, který se ho dotýká, na něj sype sám. Je dražší než cesta, ale nikdy nečeká.'),
  R('road2', 1, 'Štěrková cesta', 2, ['road1'], 'Auta po ní jedou skoro dvakrát rychleji. Polní cestu vylepšíš přetažením.'),
  R('car2', 1, 'Sklápěč 5 t', 2, ['road2'], 'Ojetý sklápěč odveze pětkrát víc než pick-up. Auta se vymění sama.'),
  R('depot', 1, 'Logistické depo', 2, ['road2'], 'Sklad u silnice: auta do něj vozí suroviny pro vlastní výrobu a přebytky se prodávají na Trhu.'),
  R('road3', 1, 'Asfaltová silnice', 3, ['road2'], 'Nejrychlejší silnice. Vyplatí se na dlouhé trasy k odběratelům, kteří platí víc.'),
  R('car3', 1, 'Kloubový dampr 29 t', 4, ['road3', 'car2'], 'Volvo A30G pro velké rypadlo a doly. Auta se vymění sama.'),
  R('smt1', 2, 'Dílna elektroniky', 4, ['mine1'], 'V dílně u Skladu přibude linka pěti stolních strojů a díly na první dvě balení Arduino Uno R3. Odemkne haly a dopravníky.'),
  R('pc', 2, 'Montáž počítačů', 2, ['smt1'], 'Montážní stůl: z hotových dílů sestavíš MŮJ PC i AI PC se dvěma Tesla P100.'),
  R('pcb1', 2, 'Výroba DPS v dílně', 2, ['smt1'], 'Laboratorní stroje LPKF a Bungard: dvou- a čtyřvrstvé desky.'),
  R('smt2', 2, 'Průmyslová linka SMT', 4, ['smt1'], 'DEK TQ, SIPLACE TX2i, Heller 1913, Koh Young Zenith. Paměťové moduly, SSD, základní desky a grafické karty.'),
  R('pcb2', 2, 'Průmyslová výroba DPS', 5, ['pcb1'], 'Orbotech, Bürkle, Schmoll, Atotech: vícevrstvé desky pro grafické karty a základní desky.'),
  R('passives', 2, 'Pasivní součástky a mechanika', 5, ['smt2'], 'Linky na MLCC, rezistory, kondenzátory, tlumivky, krystaly, konektory, chladiče a teplovodivé podložky.'),
  R('fab0', 3, 'Garážový fab 10 µm', 3, ['smt1'], 'Stroje Hacker Fab a keramická pouzdra: Intel 4004 a MOS 6502 z nakoupených waferů, bez čistého prostoru.'),
  R('fab0b', 3, 'NMOS 6 až 3 µm', 3, ['fab0'], 'Jemnější motiv na stejných strojích: Intel 8080 a 8086.'),
  R('pkg1', 3, 'Pouzdření s drátky', 4, ['fab0'], 'Dělení waferu, osazení čipu, drátkování, zalisování a test. S hotovými wafery od foundry vyrábíš čipy bez vlastního fabu.'),
  R('fab200', 3, 'Fab 200 mm (0,5 µm CMOS)', 6, ['pkg1'], 'Repasované stroje a čistý prostor: NVIDIA NV1 a Palette-DAC postupem SGS-Thomson z roku 1995.'),
  R('power', 3, 'Výkonové trench MOSFETy', 4, ['fab200'], 'Tranzistory pro napájecí kaskády základních desek a grafických karet.'),
  R('pkg2', 3, 'Flip-chip na substrátu ABF', 6, ['pkg1'], 'Pouzdra pro CPU a GPU. Zpřístupní tape-out GM107, GA104 a Ryzenu 7 7700X u foundry.'),
  R('pkg3', 3, 'CoWoS a stohy HBM2', 7, ['pkg2'], 'Křemíkový interposer a paměti s TSV: NVIDIA GP100 pro Tesla P100.'),
  R('fab300', 3, 'Fab 300 mm (28 nm HKMG)', 8, ['fab200', 'pkg2'], 'Nové stroje pro 300mm wafery včetně imerzního skeneru ASML NXT:2000i.'),
  R('memory', 3, 'DRAM a V-NAND', 8, ['fab300'], 'Paměti DDR4, GDDR6X, HBM2 a 3D NAND.'),
  R('finfet', 3, 'FinFET 22 až 14 nm', 8, ['fab300'], 'Intel 22 nm a 14 nm, TSMC 16FF+: Xeon E5-1650 v3, Core i7-9700, čipset B360 a GP100.'),
  R('n8', 3, 'Samsung 8N', 9, ['finfet'], 'Vlastní výroba GA104 pro RTX 3060 Ti.'),
  R('euv', 3, 'EUV litografie (5 nm)', 10, ['n8'], 'ASML TWINSCAN NXE:3600D a proces třídy N5: vlastní Ryzen 7 7700X.'),
  R('highna', 3, 'High-NA EUV', 12, ['euv'], 'ASML TWINSCAN EXE:5000, nejdražší výrobní stroj na světě.'),
  R('wafers', 4, 'Výroba waferů', 6, ['fab200'], 'Tažička Czochralského, drátová pila a leštička: vlastní wafery z polykřemíku.'),
  R('silicon', 4, 'Křemík z křemene', 6, ['wafers'], 'Oblouková pec a Siemensův proces: z křemene a uhlí polykřemík čistoty 9N.'),
];

// ---------------------------------------------------------------- úkoly: [text, podmínka nad stavem hry, odměna USD, odměna v bodech rozvoje]
const made = (it, n = 1) => (s) => (s.made[it] ?? 0) >= n;
const sent = (it, n) => (s) => (s.out[it] ?? 0) >= n; // prodáno odběratelům na mapě
export const QUESTS = [
  ['Dovez do Skladu 10 t uhlí: ruční lom na černém ložisku a polní cesta od lomu ke Skladu (klikni na lom, pak na Sklad). Auta přijedou sama.', (s) => (s.got.coal ?? 0) >= 10, 300, 1],
  ['Přidej lomu druhou směnu (klikni na lom, tlačítko +). Směna pracuje 8 hodin denně.', (s) => s.list.some((b) => b.k === 'miner' && b.staff > MODELS[b.model].crew), 300, 1],
  ['Za body rozvoje odemkni ve Stromu (klávesa V) Minirypadlo a postav ho na ložisko, nebo ho polož přes ruční lom.', (s) => s.list.some((b) => b.model === 'miner_u17'), 2000, 2],
  ['Odemkni Štěrkovou cestu a veď ji mezi lomem a Skladem: auta pojedou skoro dvakrát rychleji.', (s) => [...s._road.values()].some((t) => t >= 2), 1000, 1],
  ['Postav Sklářskou dílnu těsně u Skladu, dovez do Skladu křemen i uhlí a vyrob první balení foukaného skla.', made('glassware'), 3000, 2],
  ['Odemkni Dílnu elektroniky a vyrob první balení Arduino Uno R3: klikni na tiskař pasty (první stroj linky u Skladu) a zvol výrobek.', made('arduino_uno'), 5000, 2],
  ['Vyrob 10 balení Arduina. U tiskaře zapni dokupování dílů. Hotové výrobky se ve Skladu samy prodají.', made('arduino_uno', 10), 10000, 2],
  ['Odemkni Garážový fab a vyrob svůj první procesor: Intel 4004 (nejdřív zaplať návrh čipu v okně Čipy).', made('i4004'), 50000, 3],
  ['Vyrob všechny čtyři historické procesory: 4004, 6502, 8080 a 8086.', (s) => ['i4004', 'mos6502', 'i8080', 'i8086'].every((c) => s.made[c]), 150000, 3],
  ['Pouzdření s drátky: kup u foundry wafery s čipy NVIDIA NV1 a zapouzdři je.', made('nv1'), 300000, 3],
  ['Průmyslová linka SMT: osaď grafickou kartu Diamond Edge 3D 2120.', made('edge3d'), 500000, 3],
  ['Postav fab 200 mm v čistém prostoru a vyrob NV1 na vlastních waferech.', made('wl_nv1'), 2000000, 4],
  ['Vyrob paměťové moduly Kingston Fury 8 GB DDR4.', made('udimm8'), 500000, 3],
  ['Pasivní součástky: vyrob vlastní kondenzátory MLCC.', made('mlcc'), 5000000, 4],
  ['Flip-chip: zapouzdři GM107 a osaď Quadro K620.', made('k620'), 3000000, 4],
  ['Osaď ASUS Dual RTX 3060 Ti.', made('rtx3060ti'), 5000000, 4],
  ['Sestav MŮJ PC: i7-9700, B360-PLUS, 32 GB, RTX 3060 Ti, 970 EVO Plus.', made('pc_mypc'), 10000000, 5],
  ['CoWoS: vyrob NVIDIA GP100 se čtyřmi stohy HBM2 a osaď Tesla P100.', made('tesla_p100'), 20000000, 5],
  ['Sestav AI PC se dvěma Tesla P100 (Dell T5810).', made('pc_ai'), 20000000, 5],
  ['Fab 300 mm: vyrob vlastní Core i7-9700 na 14 nm.', made('wl_i7_9700'), 100000000, 6],
  ['Od písku k waferu: křemen → metalurgický křemík → polykřemík → ingot → vlastní 300mm wafery.', made('wafer300'), 100000000, 6],
  ['EUV: vyrob Ryzen 7 7700X na vlastním 5nm procesu.', made('wl_ryzen_7700x'), 500000000, 8],
];

// ---------------------------------------------------------------- úrovně: každá něco učí a má cíle; splněná odemkne další (jako sektory v Mindustry)
// money a research = s čím úroveň začíná, pts = body rozvoje do začátku, guide: 1 = průvodce krok za krokem, 2 = průvodce linkou na Arduino.
// goals: [text, podmínka nad stavem hry]. Volná hra cíle nemá, vedou ji úkoly (QUESTS).
const START = ['mine0', 'road1', 'glass0'];
const glassSold = (s) => (s.got.glass ?? 0) + (s.out.glass ?? 0);
const count = (s, model) => s.list.filter((b) => b.model === model).length;
export const MISSIONS = [
  { id: 'l1', name: 'První uhlí', what: 'Výuka krok za krokem: ruční lom, cesta do Skladu, hlušina, směny a strom rozvoje.', money: 15000, research: START, guide: 1,
    goals: [['Vytěž 10 t uhlí', (s) => (s.made.coal ?? 0) >= 10], ['Přidej lomu druhou směnu', (s) => s.list.some((b) => b.k === 'miner' && b.staff > MODELS[b.model].crew)], ['Odemkni něco ve Stromu rozvoje', (s) => s.research.length > START.length]] },
  { id: 'l2', name: 'Mechanizace', what: 'Minirypadlo vytěží za směnu sedmnáctkrát víc než dva lidé s krumpáči. Auta a cesta musí stačit.', money: 45000, research: [...START, 'mine1'], pts: 2,
    goals: [['Postav Minirypadlo', (s) => count(s, 'miner_u17') >= 1], ['Polož aspoň 30 m štěrkové cesty', (s) => [...s._road.values()].filter((t) => t >= 2).length >= 30], ['Vytěž 300 t uhlí nebo křemene', (s) => (s.made.coal ?? 0) + (s.made.quartz ?? 0) >= 300], ['Měj na účtu 60 000 $', (s) => s.money >= 60000]] },
  { id: 'l3', name: 'Sklářská dílna', what: 'První vlastní výroba: pánvová pec taví z křemene a uhlí sklo a skláři z něj foukají zboží.', money: 90000, research: [...START, 'mine1', 'road2'], pts: 2,
    goals: [['Postav Sklářskou dílnu', (s) => count(s, 'glass_pot') >= 1], ['Vyrob 5 balení foukaného skla', made('glassware', 5)], ['Měj na účtu 100 000 $', (s) => s.money >= 100000]] },
  { id: 'l4', name: 'Dílna elektroniky', what: 'První elektronika: v dílně stojí linka pěti strojů. Rozjeď ji a zrychli.', money: 30000, research: [...START, 'road2', 'mine1', 'car2', 'smt1'], guide: 2,
    goals: [['Vyrob první balení Arduino Uno R3', made('arduino_uno')], ['Vyměň osazovací automat za NeoDen YY1', (s) => count(s, 'pnp_yy1') >= 1], ['Vyrob 20 balení Arduina', made('arduino_uno', 20)]] },
  { id: 'free', name: 'Volná hra', what: 'Celý strom rozvoje od ručního lomu po EUV skener. Bez cíle, vedou tě úkoly.', money: 15000, research: START, goals: [] },
];
