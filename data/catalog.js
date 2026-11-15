// Herní katalog: druhy strojů, skutečné modely, položky a čipy.
// Ceny: fact 'doc' = doloženo zdrojem (src), 'estimate' = odhad. Výchozí čísla jsou odhady; doložené hodnoty z rešerše
// (data/research/*.json → data/prices.js přes tools/merge-research.mjs) je přepisují. Popisy strojů jsou z data/hw/.
import HW_MACHINES from './hw/machines.js';
import { MACHINES_EXTRA } from './hw/parts_fab.js';
import PRICES from './prices.js';

export const HW = Object.fromEntries([...HW_MACHINES, ...MACHINES_EXTRA].map((m) => [m.id, m]));
export const HOUR = 6; // 1 herní hodina = 6 s simulace (den = 144 s)
export const KWH_USD = PRICES.electricity_kwh?.usd ?? 0.1;
export const SELL = 0.85; // výrobce prodává pod cenou distributora
export const WAGE = PRICES.wage_day?.usd ?? 150; // mzda dělníka za osmihodinovou směnu (z rešerše, jinak odhad)
export const WAGE_FACT = PRICES.wage_day ?? { fact: 'estimate', note: 'odhad bez zdroje' };
const HF = 'https://docs.hackerfab.org/';

// ---------------------------------------------------------------- druhy strojů
// u = jednotka výkonu, ref = výkon referenčního (průmyslového) stroje za hodinu, opex = spotřební materiál v USD na jednotku
// (herní odhad řádu: rezist, plyny, suspenze, terče…), look = tvar v mapě, cat = záložka stavebního menu.
const k = (cat, look, u, ref, opex, name) => ({ cat, look, u, ref, opex, name });
// Vsázka na tunu sodnovápenatého skla (rešerše, glass_batch): 740 kg křemene, 222 kg sody, 187 kg vápence. Soda a vápenec jsou náklad, křemen a uhlí se vozí.
const GLASS_OPEX = Math.round((0.222 * (PRICES.soda_ash?.usd ?? 160) + 0.187 * (PRICES.limestone?.usd ?? 18.5)) * 10) / 10;
export const KINDS = {
  // Fab (wafery za hodinu)
  m_furnace: k('Fab', 'furnace', 'wafer', 60, 1.5), m_wet_bench: k('Fab', 'wet', 'wafer', 600, 1.2), m_track: k('Fab', 'track', 'wafer', 275, 0),
  m_iline_stepper: k('Fab', 'scanner', 'wafer', 150, 0.3), m_duv_immersion: k('Fab', 'scanner', 'wafer', 275, 2), m_euv: k('Fab', 'scanner', 'wafer', 160, 8),
  m_implanter: k('Fab', 'implanter', 'wafer', 300, 0.8), m_cvd: k('Fab', 'cluster', 'wafer', 100, 3), m_ald: k('Fab', 'cluster', 'wafer', 50, 5),
  m_pvd: k('Fab', 'cluster', 'wafer', 70, 4), m_etch: k('Fab', 'cluster', 'wafer', 100, 2), m_cmp: k('Fab', 'cmp', 'wafer', 70, 6),
  m_ecd: k('Fab', 'wet', 'wafer', 80, 3), m_inspection: k('Fab', 'metro', 'wafer', 50, 0.2), m_cdsem: k('Fab', 'metro', 'wafer', 60, 0.2),
  // Test a pouzdření
  m_prober: k('Pouzdření', 'prober', 'wafer', 6, 1), m_ate: k('Pouzdření', 'ate', 'unit', 1500, 0.01), m_dicer: k('Pouzdření', 'dicer', 'wafer', 8, 4),
  m_die_bonder: k('Pouzdření', 'bonder', 'unit', 5000, 0.03), m_wire_bonder: k('Pouzdření', 'bonder', 'wire', 60000, 0.0004),
  m_flipchip_bonder: k('Pouzdření', 'bonder', 'unit', 2000, 0.6), m_molding: k('Pouzdření', 'mold', 'unit', 3000, 0.04),
  // Wafery
  m_cz_puller: k('Wafery', 'puller', 'ingot', 1 / 60, 3000), m_wire_saw: k('Wafery', 'saw', 'wafer', 40, 1.5), m_wafer_polish: k('Wafery', 'cmp', 'wafer', 25, 2),
  // Osazování
  m_paste_printer: k('Osazování', 'printer', 'board', 400, 0.05), m_pick_place: k('Osazování', 'pnp', 'place', 96000, 0),
  m_reflow: k('Osazování', 'oven', 'board', 400, 0.02), m_aoi: k('Osazování', 'metro', 'board', 400, 0),
  m_fct: k('Osazování', 'ate', 'board', 120, 0, 'Funkční / elektrický tester desek'), m_assembly: k('Osazování', 'bench', 'unit', 3, 0.5, 'Montážní pracoviště PC'),
  // DPS (panely za hodinu)
  m_pcb_ldi: k('DPS', 'ldi', 'panel', 120, 0.4), m_pcb_etch: k('DPS', 'wet', 'panel', 150, 0.3, 'Leptací linka DPS (vyvolání, leptání, strip)'),
  m_pcb_press: k('DPS', 'press', 'panel', 40, 3), m_pcb_drill: k('DPS', 'drill', 'panel', 50, 0.3), m_pcb_plating: k('DPS', 'plating', 'panel', 100, 0.8),
  // Pasivní součástky a mechanika (tisíce kusů za hodinu)
  m_tape_caster: k('Pasivní', 'line', 'kpcs', 800, 0.6), m_iso_laminator: k('Pasivní', 'press', 'kpcs', 800, 0.02), m_tunnel_kiln: k('Pasivní', 'line', 'kpcs', 600, 0.05),
  m_belt_furnace: k('Pasivní', 'oven', 'kpcs', 600, 0.03), m_termination_dipper: k('Pasivní', 'printer', 'kpcs', 600, 0.15), m_chip_plating: k('Pasivní', 'plating', 'kpcs', 800, 0.1),
  m_taping: k('Pasivní', 'pnp', 'kpcs', 1200, 0.08), m_laser_trimmer: k('Pasivní', 'ldi', 'kpcs', 1000, 0), m_foil_line: k('Pasivní', 'line', 'kpcs', 500, 4),
  m_cap_winder: k('Pasivní', 'winder', 'kpcs', 6, 6), m_cap_assembly: k('Pasivní', 'line', 'kpcs', 30, 10), m_powder_press: k('Pasivní', 'stamp', 'kpcs', 20, 15),
  m_coil_winder: k('Pasivní', 'winder', 'kpcs', 3, 40), m_quartz_autoclave: k('Pasivní', 'puller', 'kpcs', 50, 3), m_seam_sealer: k('Pasivní', 'bonder', 'kpcs', 6, 20),
  m_stamping: k('Pasivní', 'stamp', 'kpcs', 100, 8), m_reel_plating: k('Pasivní', 'plating', 'kpcs', 100, 6), m_injection: k('Pasivní', 'mold', 'kpcs', 2, 60),
  m_digital_cutter: k('Pasivní', 'ldi', 'kpcs', 1, 30), m_extrusion: k('Pasivní', 'line', 'kpcs', 2, 400), m_mixer_calender: k('Pasivní', 'line', 'kpcs', 2, 250),
  // Suroviny
  m_miner: k('Suroviny', 'excavator', 't', 150, 6, 'Povrchová těžba (rypadlo)'), m_drill: k('Suroviny', 'drill', 'm', 2, 150, 'Průzkumný vrt (jádrové vrtání)'),
  m_shaft: k('Suroviny', 'shaft', 't', 40, 14, 'Hlubinný důl'), m_arc_furnace: k('Suroviny', 'arc', 't', 1.7, 90, 'Elektrická oblouková pec (metalurgický křemík)'),
  m_siemens: k('Suroviny', 'reactor', 't', 0.06, 1200, 'Siemensova linka (trichlorsilan → polykřemík)'),
  m_glass: k('Suroviny', 'furnace', 't', 3.33, GLASS_OPEX, 'Vanová sklářská pec'), m_glass_studio: k('Suroviny', 'furnace', 't', 0.0113, GLASS_OPEX, 'Sklářská dílna (pánvová pec)'),
  m_power: k('Suroviny', 'power', 'MWh', 1, 0, 'Uhelná elektrárna'),
};
for (const [id, kd] of Object.entries(KINDS)) { kd.id = id; kd.name ??= HW[id]?.name ?? id; }
export const UNIT = { wafer: 'waferů/h', unit: 'ks/h', wire: 'drátků/h', ingot: 'ingotů/h', board: 'desek/h', place: 'součástek/h', panel: 'panelů/h', kpcs: 'tis. ks/h', t: 't/h', m: 'm/h', MWh: 'MW' };
// Elektrárna: spotřeba tepla průměrného amerického uhelného bloku (EIA 2025: 10 647 Btu/kWh = 11,2 GJ na MWh) dělená výhřevností černého uhlí 24 GJ/t (odhad).
export const HEAT_RATE = { gj: Math.round(10647 * 1.055056) / 1000, fact: 'doc', src: 'https://www.eia.gov/electricity/annual/html/epa_08_01.html', note: 'EIA, Electric Power Annual, tab. 8.1: průměrná spotřeba tepla uhelných bloků v USA 2025 = 10 647 Btu na kWh.' };
export const COAL_GJ = 24; // výhřevnost černého uhlí v GJ na tunu (odhad bez zdroje, běžné energetické uhlí 22–26 GJ/t)
export const COAL_PER_MWH = Math.round((HEAT_RATE.gj / COAL_GJ) * 1000) / 1000; // tuny uhlí na MWh elektřiny
export const FEED_USD = 40; // výkupní cena přebytku do sítě v USD za MWh (odhad velkoobchodní ceny bez zdroje)
// Nafta pro auta: EIA, průměr USA 9. 11. 2026 = 6,127 USD za galon včetně daní.
export const DIESEL = { usd: Math.round((6.127 / 3.78541) * 1000) / 1000, fact: 'doc', src: 'https://www.eia.gov/petroleum/gasdiesel/', note: 'EIA: průměrná cena nafty v USA 9. 11. 2026 = 6,127 USD za galon (3,785 l) včetně daní.' };
export const CATS = ['Doprava', 'Logistika', 'Osazování', 'DPS', 'Pasivní', 'Pouzdření', 'Fab', 'Wafery', 'Suroviny'];

// ---------------------------------------------------------------- modely (skutečné stroje)
// M(id, druh, název, třída, cena USD, výkon/h v jednotce druhu, příkon kW, šířka, hloubka (m = dlaždice), další)
// třída: hobby (dílna, garáž) | used (repasovaný, 200 mm) | new (nový, průmysl). req = výzkum, wafer = průměry waferů,
// res = rozlišení litografie v nm, clean = musí stát v čistém prostoru.
export const MODELS = {};
const M = (id, kind, name, tier, usd, rate, kw, w, h, o = {}) => {
  let p = PRICES[id];
  // Cena použitého kusu nepatří k novému stroji: nový zůstane odhadem a doložená cena z bazaru jde do poznámky.
  if (p && tier === 'new' && (/^(použit|odhad typické ceny použit|repas)/i.test(p.note ?? '') || id === 'reflow_1913')) p = { src: p.src, note: `odhad ceny nového stroje; nabídka z druhé ruky nebo z tržiště: ${Math.round(p.usd).toLocaleString('cs')} USD (${p.note})` };
  MODELS[id] = { id, kind, name, tier, usd: p?.usd ?? usd, fact: p?.fact ?? o.fact ?? 'estimate', src: p?.src ?? o.src ?? null, note: p?.note ?? o.note ?? null,
    rate: PRICES['rate_' + id]?.rate ?? rate, rateFact: PRICES['rate_' + id]?.fact ?? 'estimate', rateSrc: PRICES['rate_' + id]?.src ?? null, rateNote: PRICES['rate_' + id]?.note ?? null, kw, w, h, req: o.req, wafer: o.wafer ?? null, res: o.res ?? null, clean: !!o.clean, reach: o.reach ?? null, maxLv: o.maxLv ?? null, sink: o.sink ?? null, crew: o.crew ?? (KINDS[kind].cat === 'Suroviny' ? null : 1) }; // crew = kolik lidí obsadí jednu směnu (odhad); výrobní stroje v halách obsluhuje jeden člověk na směnu, vrt obsluhu nepočítá
};
const doc = (src, x = {}) => ({ fact: 'doc', src, ...x });
const W100 = [100], W200 = [200], W300 = [300];

// Osazování (SMT)
M('stencil_vxb', 'm_paste_printer', 'Ruční šablonový tiskař 3040 (VXB)', 'hobby', 445, 40, 0, 1, 1, { req: 'smt1' });
M('dek_tq', 'm_paste_printer', 'ASMPT DEK TQ', 'new', 160000, 400, 2, 2, 1, { req: 'smt2' });
M('pnp_lumen', 'm_pick_place', 'Opulo LumenPnP v4', 'hobby', 1995, 1000, 0.2, 1, 1, { req: 'smt1', ...doc('https://www.opulo.io/') });
M('pnp_yy1', 'm_pick_place', 'NeoDen YY1', 'hobby', 2899, 4000, 0.3, 1, 1, { req: 'smt1' });
M('pnp_tx2i', 'm_pick_place', 'ASMPT SIPLACE TX2i', 'new', 350000, 96000, 2, 1, 3, { req: 'smt2' });
M('reflow_t962a', 'm_reflow', 'Puhui T-962A (stolní IR pec)', 'hobby', 250, 20, 1.5, 1, 1, { req: 'smt1' });
M('reflow_in6', 'm_reflow', 'NeoDen IN6 (6 zón)', 'hobby', 2500, 120, 2, 1, 1, { req: 'smt1' });
M('reflow_1913', 'm_reflow', 'Heller 1913 MK7', 'new', 130000, 400, 14, 6, 2, { req: 'smt2' });
M('aoi_scope', 'm_aoi', 'Ruční kontrola: stereomikroskop AmScope SM-4TZ', 'hobby', 520, 30, 0, 1, 1, { req: 'smt1' });
M('aoi_zenith', 'm_aoi', 'Koh Young Zenith (3D AOI)', 'new', 160000, 400, 2, 2, 2, { req: 'smt2' });
M('fct_jig', 'm_fct', 'Testovací přípravek s pogo piny (vlastní)', 'hobby', 300, 60, 0, 1, 1, { req: 'smt1' });
M('fct_takaya', 'm_fct', 'Takaya APT-1600FD (létající sondy)', 'new', 280000, 120, 2, 2, 2, { req: 'smt2' });
M('bench_esd', 'm_assembly', 'ESD montážní stůl s nářadím', 'hobby', 1200, 3, 0.1, 2, 1, { req: 'pc' });
// DPS
M('pcb_ldi_protolaser', 'm_pcb_ldi', 'LPKF ProtoLaser ST', 'hobby', 90000, 4, 1, 1, 1, { req: 'pcb1' });
M('pcb_ldi_nuvogo', 'm_pcb_ldi', 'KLA Orbotech Nuvogo 780', 'new', 1200000, 120, 8, 4, 2, { req: 'pcb2' });
M('pcb_etch_sprint', 'm_pcb_etch', 'Bungard Sprint 3000 (sprejové leptání)', 'hobby', 6000, 6, 2, 1, 1, { req: 'pcb1' });
M('pcb_etch_line', 'm_pcb_etch', 'Průběžná linka DES (vyvolání–leptání–strip)', 'new', 600000, 150, 60, 14, 2, { req: 'pcb2' });
M('pcb_press_multipress', 'm_pcb_press', 'LPKF MultiPress S4', 'hobby', 28000, 1, 3, 1, 1, { req: 'pcb1' });
M('pcb_press_lamv', 'm_pcb_press', 'Bürkle LAMV 125', 'new', 1500000, 40, 80, 4, 3, { req: 'pcb2' });
M('pcb_drill_ccd2', 'm_pcb_drill', 'Bungard CCD/2', 'hobby', 9000, 1.5, 0.5, 1, 1, { req: 'pcb1' });
M('pcb_drill_speedmaster', 'm_pcb_drill', 'Schmoll Speedmaster', 'new', 350000, 50, 15, 3, 3, { req: 'pcb2' });
M('pcb_plate_compacta', 'm_pcb_plating', 'Bungard Compacta 30', 'hobby', 12000, 2, 1.5, 2, 1, { req: 'pcb1' });
M('pcb_plate_uniplate', 'm_pcb_plating', 'MKS Atotech Uniplate (horizontální)', 'new', 3500000, 100, 150, 30, 3, { req: 'pcb2' });
// Pasivní součástky a mechanika – příklady modelů a rozměry z data/hw/parts_fab.js
const P = (kind, usd, kw, name) => { const hw = HW[kind]; M(kind, kind, name ?? hw.example ?? hw.name, 'new', usd, KINDS[kind].ref, kw, Math.ceil(hw.size[0]), Math.ceil(hw.size[1]), { req: 'passives' }); };
P('m_tape_caster', 1200000, 60); P('m_iso_laminator', 600000, 15); P('m_tunnel_kiln', 2000000, 250); P('m_belt_furnace', 350000, 60);
P('m_termination_dipper', 300000, 5); P('m_chip_plating', 400000, 30); P('m_taping', 250000, 2); P('m_laser_trimmer', 450000, 5);
P('m_foil_line', 8000000, 400, 'Linka leptání a formování Al fólie'); P('m_cap_winder', 60000, 2, 'Navíječka svitků (TMAXCN)');
P('m_cap_assembly', 1500000, 30, 'Linka impregnace, zalisování a stárnutí'); P('m_powder_press', 900000, 30); P('m_coil_winder', 150000, 2, 'Navíječka cívek Nittoku');
P('m_quartz_autoclave', 1500000, 80, 'Autokláv pro růst křemene'); P('m_stamping', 900000, 40); P('m_reel_plating', 2500000, 80, 'Kontinuální galvanizace pásu (Meco)');
P('m_injection', 180000, 25); P('m_digital_cutter', 150000, 3); P('m_extrusion', 12000000, 900); P('m_mixer_calender', 1200000, 60, 'Planetový mixér Ross + kalandr');
M('m_seam_sealer', 'm_seam_sealer', 'Nippon Avionics – švová svařovačka víček', 'new', 200000, 6, 3, 2, 2, { req: 'fab0' });
M('seal_manual', 'm_seam_sealer', 'Ruční zalepení víčka keramického pouzdra', 'hobby', 50, 0.05, 0, 1, 1, { req: 'fab0' });
// Test a pouzdření
M('dicer_scribe', 'm_dicer', 'Diamantové rydlo a lámání waferu (ručně)', 'hobby', 60, 0.5, 0, 1, 1, { req: 'fab0', wafer: W100 });
M('dicer_dad3350', 'm_dicer', 'DISCO DAD3350 (použitá)', 'used', 45000, 3, 2, 2, 1, { req: 'pkg1', wafer: [100, 200] });
M('dicer_dfd6362', 'm_dicer', 'DISCO DFD6362', 'new', 350000, 8, 5, 2, 2, { req: 'pkg1', wafer: [200, 300] });
M('diebond_manual', 'm_die_bonder', 'Ruční lepení čipu (mikroskop, epoxid)', 'hobby', 600, 40, 0, 1, 1, { req: 'fab0' });
M('diebond_2200', 'm_die_bonder', 'Besi Datacon 2200 evo plus', 'new', 400000, 5000, 3, 2, 2, { req: 'pkg1' });
M('wirebond_4524', 'm_wire_bonder', 'Kulicke & Soffa 4524D (ruční, použitý)', 'hobby', 8000, 300, 0.2, 1, 1, { req: 'fab0' });
M('wirebond_rapid', 'm_wire_bonder', 'Kulicke & Soffa RAPID', 'new', 100000, 60000, 1, 2, 1, { req: 'pkg1' });
M('fcbond_9800', 'm_flipchip_bonder', 'Besi 9800 TC next', 'new', 1500000, 2000, 8, 3, 2, { req: 'pkg2' });
M('mold_ypm', 'm_molding', 'TOWA YPM1180', 'new', 900000, 3000, 30, 3, 2, { req: 'pkg1' });
M('prober_station', 'm_prober', 'Hrotová měřicí stanice', 'hobby', 15800, 0.3, 0.1, 1, 1, { req: 'fab0', wafer: W100, ...doc(HF) });
M('prober_p8', 'm_prober', 'Tokyo Electron P-8XL (použitý)', 'used', 60000, 4, 3, 2, 2, { req: 'pkg1', wafer: W200 });
M('prober_precio', 'm_prober', 'Tokyo Electron Precio XL', 'new', 1000000, 6, 5, 2, 2, { req: 'fab300', wafer: W300 });
M('ate_smu', 'm_ate', 'DIY SMU (Hacker Fab)', 'hobby', 800, 60, 0, 1, 1, { req: 'fab0', ...doc(HF) });
M('ate_j750', 'm_ate', 'Teradyne J750 (použitý)', 'used', 250000, 800, 12, 2, 2, { req: 'pkg1' });
M('ate_v93k', 'm_ate', 'Advantest V93000 EXA Scale', 'new', 2000000, 1500, 30, 3, 2, { req: 'fab300' });
// Garážový fab (Hacker Fab, Sam Zeloof) – ceny doložené v data/hw/buy_machines.js
const G = { req: 'fab0', wafer: W100 };
M('furnace_hf', 'm_furnace', 'Hacker Fab – trubková pec V1', 'hobby', 200, 1.5, 1.5, 1, 1, { ...G, ...doc(HF) });
M('furnace_mti', 'm_furnace', 'MTI OTF-1200X-S (trubková pec 1200 °C)', 'hobby', 3905, 3, 2.5, 1, 1, { ...G, ...doc('https://mtixtl.com/en-internon/products/OTF-1200X-S') });
M('wet_hood', 'm_wet_bench', 'Stolní digestoř, kádinky a HF', 'hobby', 2000, 6, 0.3, 1, 1, G);
M('track_spin', 'm_track', 'Hacker Fab – vakuový spin coater V1', 'hobby', 200, 10, 0.1, 1, 1, { ...G, ...doc(HF) });
M('litho_hf2', 'm_iline_stepper', 'Hacker Fab – bezmaskový stepper V2', 'hobby', 3015, 0.3, 0.2, 1, 1, { ...G, res: 2000, ...doc(HF) });
M('pvd_hf', 'm_pvd', 'Hacker Fab – RF naprašovací komora', 'hobby', 18400, 0.6, 2, 1, 1, { ...G, ...doc(HF) });
M('etch_pe25', 'm_etch', 'Plasma Etch PE-25', 'hobby', 17400, 2, 1, 1, 1, { ...G, ...doc(HF) });
// Fab 200 mm – repasované stroje z druhé ruky
const U = { req: 'fab200', wafer: W200, clean: true };
M('furnace_a400', 'm_furnace', 'ASM A400 (použitá)', 'used', 250000, 40, 40, 3, 2, U);
M('wet_ws820', 'm_wet_bench', 'SCREEN WS-820L (použitá)', 'used', 150000, 150, 25, 6, 3, U);
M('track_act8', 'm_track', 'Tokyo Electron CLEAN TRACK ACT 8 (použitý)', 'used', 350000, 80, 30, 4, 3, U);
M('litho_pas5500', 'm_iline_stepper', 'ASML PAS 5500/100D (repasovaný)', 'used', 600000, 70, 20, 3, 3, { ...U, res: 400 });
M('litho_nsr2205', 'm_iline_stepper', 'Nikon NSR-2205iL1', 'new', 5000000, 150, 30, 3, 3, { ...U, res: 350 });
M('implant_e500', 'm_implanter', 'Varian E500 (použitý)', 'used', 400000, 150, 60, 6, 3, U);
M('cvd_p5000', 'm_cvd', 'Applied Materials P5000 CVD (použitý)', 'used', 250000, 40, 40, 3, 3, U);
M('pvd_endura5500', 'm_pvd', 'Applied Materials Endura 5500 (použitá)', 'used', 500000, 40, 70, 4, 4, U);
M('etch_tcp9600', 'm_etch', 'Lam Research TCP 9600 (použitý)', 'used', 200000, 40, 35, 3, 3, U);
M('cmp_mirra', 'm_cmp', 'Applied Materials Mirra (použitý)', 'used', 350000, 35, 30, 4, 3, U);
M('insp_kla2135', 'm_inspection', 'KLA-Tencor 2135 (použitý)', 'used', 300000, 25, 10, 3, 2, U);
M('cdsem_s9300', 'm_cdsem', 'Hitachi S-9300 (použitý)', 'used', 250000, 30, 10, 3, 2, U);
// Fab 300 mm – nové stroje (příklady z data/hw/machines.js)
const N = { req: 'fab300', wafer: W300, clean: true };
M('furnace_ace', 'm_furnace', 'Kokusai Electric AdvancedAce', 'new', 3000000, 60, 60, 4, 2, N);
M('wet_su3400', 'm_wet_bench', 'SCREEN SU-3400', 'new', 5000000, 600, 40, 6, 4, N);
const N2 = { ...N, req: ['fab300', 'pkg2'] }, N3 = { ...N, req: ['fab300', 'pkg3'] }; // bumpy pro flip-chip a interposer CoWoS potřebují tytéž stroje
M('track_lithius', 'm_track', 'Tokyo Electron CLEAN TRACK LITHIUS Pro Z', 'new', 8000000, 275, 60, 6, 3, N2);
M('litho_fpa5550', 'm_iline_stepper', 'Canon FPA-5550iZ2', 'new', 9000000, 150, 30, 3, 3, { ...N, res: 350 });
M('litho_nxt2000', 'm_duv_immersion', 'ASML TWINSCAN NXT:2000i', 'new', 80000000, 275, 150, 7, 4, N3);
M('litho_nxe3600', 'm_euv', 'ASML TWINSCAN NXE:3600D', 'new', 150000000, 160, 1000, 10, 4, { ...N, req: 'euv', note: 'cca 150 mil. USD (2021) – data/hw/machines.js' });
M('litho_exe5000', 'm_euv', 'ASML TWINSCAN EXE:5000 (High-NA)', 'new', 380000000, 185, 1400, 14, 4, { ...N, req: 'highna', note: 'High-NA 300–400 mil. USD – data/hw/machines.js' });
M('implant_purion', 'm_implanter', 'Axcelis Purion H', 'new', 5000000, 300, 100, 8, 4, N);
M('cvd_producer', 'm_cvd', 'Applied Materials Producer', 'new', 4500000, 100, 60, 5, 4, N3);
M('ald_pulsar', 'm_ald', 'ASM Pulsar XP', 'new', 5000000, 50, 40, 5, 4, N);
M('pvd_endura', 'm_pvd', 'Applied Materials Endura', 'new', 7000000, 70, 100, 5, 4, N2);
M('etch_kiyo', 'm_etch', 'Lam Research Kiyo', 'new', 5000000, 100, 60, 5, 4, N3);
M('cmp_frex', 'm_cmp', 'Ebara F-REX300XA', 'new', 4000000, 70, 40, 6, 3, N3);
M('ecd_sabre', 'm_ecd', 'Lam Research SABRE 3D', 'new', 5000000, 80, 30, 5, 3, N2);
M('insp_kla39', 'm_inspection', 'KLA 39xx (širokopásmové plazma)', 'new', 20000000, 50, 20, 4, 3, N);
M('cdsem_cg7300', 'm_cdsem', 'Hitachi High-Tech CG7300', 'new', 4000000, 60, 15, 3, 3, N);
// Wafery
M('cz_cg6000', 'm_cz_puller', 'Kayex CG6000 (použitá, 200 mm)', 'used', 400000, 1 / 40, 120, 3, 3, { req: 'wafers', wafer: W200 });
M('cz_ekz3500', 'm_cz_puller', 'PVA TePla EKZ 3500 (300 mm)', 'new', 2500000, 1 / 60, 250, 4, 3, { req: 'wafers', wafer: W300 });
M('saw_mwm444', 'm_wire_saw', 'Komatsu NTC MWM444B (použitá)', 'used', 250000, 30, 40, 3, 2, { req: 'wafers', wafer: W200 });
M('saw_mwm3050', 'm_wire_saw', 'Komatsu NTC MWM3050nQ', 'new', 1200000, 40, 60, 4, 2, { req: 'wafers', wafer: W300 });
M('polish_ac1500', 'm_wafer_polish', 'Peter Wolters AC 1500 (použitá)', 'used', 300000, 15, 30, 3, 3, { req: 'pkg1', wafer: W200 });
M('polish_ac2000', 'm_wafer_polish', 'Lapmaster Wolters AC 2000-P3', 'new', 1800000, 25, 40, 4, 3, { req: 'pkg1', wafer: [200, 300] });
// Suroviny
// reach = pracovní okruh v metrech: rypadlo objíždí ložisko kolem sebe, důl razí chodby v patře.
// maxLv = nejhlubší patro (po 50 m), kam vrt nebo důl dosáhne; sink = cena hloubení v USD za metr (odhad).
M('quarry_hand', 'm_miner', 'Ruční lom: palice, klíny a kolečko', 'hobby', 400, 1, 0, 2, 2, { req: 'mine0', crew: 2, reach: 4, note: 'Odhad bez zdroje: nářadí pro dva dělníky. Výkon jedna tuna za hodinu je herní hodnota.' });
M('glass_pot', 'm_glass_studio', 'Sklářská dílna: pánvová pec na 90 kg skla', 'hobby', 40000, 0.0113, 0, 3, 3, { req: 'glass0', crew: 2 });
M('glass_tank', 'm_glass', 'Vanová pec na obalové sklo (80 t denně)', 'new', 12100000, 3.33, 0, 6, 10, { req: 'glass1', crew: 12 });
M('miner_u17', 'm_miner', 'Minirypadlo Kubota U17-3', 'hobby', 27000, 5, 0, 2, 2, { req: 'mine1', crew: 1, reach: 6 });
M('drill_small', 'm_drill', 'Malá vrtná souprava na přívěsu (do 100 m)', 'hobby', 45000, 1.5, 0, 2, 1, { req: 'survey', reach: 8, maxLv: 2, note: 'Odhad bez zdroje. Vrtání stojí dalších asi 150 USD za metr (odhad).' });
M('shaft_small', 'm_shaft', 'Malý důl: šachta s vrátkem (do 100 m)', 'hobby', 180000, 8, 0, 3, 3, { req: 'shaft1', crew: 6, reach: 10, maxLv: 2, sink: 2000, note: 'Odhad bez zdroje: těžní věžička, vrátek, kompresor. Hloubení stojí dalších asi 2 000 USD za metr (odhad).' });
M('drill_lf90', 'm_drill', 'Boart Longyear LF90D (jádrová vrtná souprava)', 'new', 400000, 2, 0, 2, 2, { req: 'shaft2', reach: 12, maxLv: 6, note: 'Odhad ceny soupravy; vrtání stojí dalších asi 150 USD za metr (odhad).' });
M('shaft_st7', 'm_shaft', 'Úpadnice s nakladačem Epiroc Scooptram ST7', 'new', 2500000, 40, 0, 5, 5, { req: 'shaft2', crew: 12, reach: 20, maxLv: 6, sink: 6000, note: 'Odhad: nakladač, důlní vůz, větrání a zázemí malého dolu. Ražba stojí dalších asi 6 000 USD za metr hloubky (odhad).' });
M('miner_cat320', 'm_miner', 'Caterpillar 320 + drtič Metso Nordberg C106', 'new', 650000, 150, 0, 4, 4, { req: 'mine2', crew: 3, reach: 14 });
M('arc_furnace', 'm_arc_furnace', 'Oblouková pec 20 MVA (metalurgický křemík)', 'new', 30000000, 1.7, 20000, 12, 12, { req: 'silicon', crew: 8 });
M('siemens_line', 'm_siemens', 'Siemensovy reaktory + syntéza a destilace TCS', 'new', 35000000, 0.06, 3500, 14, 10, { req: 'silicon', crew: 10 });
// Elektrárny: rate = výkon v MW (MWh za hodinu práce). Ceny a počty lidí jsou odhady bez zdroje (malé uhelné bloky kolem 3 000–4 000 USD za kW).
M('power_1', 'm_power', 'Uhelná teplárna 1 MW (roštový kotel + parní turbína)', 'used', 4000000, 1, 0, 6, 6, { req: 'power1', crew: 2, note: 'Odhad bez zdroje: malý roštový kotel s parní turbínou, asi 4 000 USD za kW.' });
M('power_20', 'm_power', 'Uhelná elektrárna 20 MW (práškový kotel)', 'new', 60000000, 20, 0, 14, 12, { req: 'power2', crew: 8, note: 'Odhad bez zdroje: blok 20 MW, asi 3 000 USD za kW.' });

// Logistika a budovy (ceny = odhad stavebních nákladů)
// Silnice: road = třída (1 až 3), speed = rychlost aut v dlaždicích za sekundu (herní hodnota, stejně jako rychlost dopravníku). Ceny za metr jsou odhady bez zdroje.
const road = (tier, name, usd, speed, what) => { const p = PRICES['road' + tier]; return { id: 'road' + tier, name, usd: Math.round(p?.usd ?? usd), fact: p?.fact ?? 'estimate', src: p?.src ?? null, road: tier, speed, w: 1, h: 1, req: 'road' + tier, note: p?.note ?? 'odhad stavebních nákladů na metr úzké účelové cesty, bez zdroje', what: what + ' Klikni na začátek a na konec, třeba na lom a na Sklad: cesta mezi nimi se postaví sama a auta po ní začnou jezdit. Cena je za metr; přes vodu vede jako násep za desetinásobek.' }; };
export const LOGI = {
  road1: road(1, 'Polní cesta', 8, 5, 'Vyježděná hliněná cesta. Auta po ní jedou pomalu.'),
  road2: road(2, 'Štěrková cesta', 45, 9, 'Zhutněný štěrk: auta jedou skoro dvakrát rychleji než po polní cestě. Přetažením vylepšíš polní cestu a zaplatíš jen rozdíl.'),
  road3: road(3, 'Asfaltová silnice', 400, 14, 'Asfalt: nejrychlejší silnice. Přetažením vylepšíš horší cestu a zaplatíš jen rozdíl.'),
  hall: { id: 'hall', name: 'Hala', req: 'smt1', usd: PRICES.warehouse_m2?.usd ?? 800, w: 1, h: 1, note: PRICES.warehouse_m2?.note, src: PRICES.warehouse_m2?.src, what: 'Tovární hala. Výrobní stroje stojí jen v hale; těžba a dopravníky můžou být venku. Halu postavíš tažením obdélníku. Cena za 1 m².' },
  belt: { id: 'belt', name: 'Dopravník', req: ['belts', 'smt1'], usd: 300, w: 1, h: 1, note: 'odhad za metr dlouhé trasy' + (PRICES.belt_m ? `; krátký díl s vlastním pohonem: ${Math.round(PRICES.belt_m.usd)} USD/m (${PRICES.belt_m.note})` : ''), src: PRICES.belt_m?.src, what: 'Veze jednu položku na metr. Stroje si z dopravníku, který vede kolem nich, samy berou, co potřebují.' },
  junction: { id: 'junction', name: 'Křížení', req: ['belts', 'smt1'], usd: 500, w: 1, h: 1, what: 'Dva dopravníky se tu kříží bez míchání.' },
  splitter: { id: 'splitter', name: 'Rozdělovač', req: ['belts', 'smt1'], usd: 800, w: 1, h: 1, what: 'Střídavě rozděluje položky do ostatních tří stran.' },
  sorter: { id: 'sorter', name: 'Třídič', req: ['belts', 'smt1'], usd: 1200, w: 1, h: 1, what: 'Vybranou položku pustí rovně, ostatní do stran.' },
  unloader: { id: 'unloader', name: 'Výdejník', req: ['belts', 'smt1'], usd: 2000, w: 1, h: 1, what: 'Stojí těsně u Skladu nebo depa a vydává ze skladu vybranou položku ve směru šipky, na dopravník nebo rovnou do stroje.' },
  depot: { id: 'depot', name: 'Logistické depo', req: 'depot', usd: Math.round((PRICES.warehouse_m2?.usd ?? 1200) * 16), w: 4, h: 4, note: PRICES.warehouse_m2?.note, src: PRICES.warehouse_m2?.src,
    what: 'Sklad 16 m² s rampou, napojený kamiony na Sklad. Auta z dolů do něj vozí suroviny, stroje, které se ho dotýkají, si z něj berou díly a odkládají do něj hotové výrobky. Každá převezená položka stojí 2 USD. Rozpracované dávky nebere.' },
  floor: { id: 'floor', name: 'Čistý prostor ISO 5', usd: PRICES.cleanroom_iso5_m2?.usd ?? 6000, fact: PRICES.cleanroom_iso5_m2?.fact, note: PRICES.cleanroom_iso5_m2?.note, src: PRICES.cleanroom_iso5_m2?.src, w: 1, h: 1, req: ['fab200', 'pkg2'], what: 'Podlaha čistého prostoru (třída 100) uvnitř haly; pokládá se tažením obdélníku. Stroje fabu 200 a 300 mm bez ní neběží. Cena za 1 m².' },
};

// Auta: jezdí sama po silnici od dolu nebo pece k cíli; kupují se sama za cenu vozu, když je na ně peněz dost. cap = nosnost v tunách.
// l100 = spotřeba nafty v litrech na 100 km, wear = opotřebení a servis v USD na km (obojí odhad bez zdroje); km = provoz celkem v USD na km.
const car = (id, name, usd, cap, req, note, l100, wear) => { const p = PRICES[id]; return { id, name, usd: Math.round(p?.usd ?? usd), cap, req, fact: p?.fact ?? 'estimate', src: p?.src ?? null, note: p?.note ?? note, l100, wear, km: Math.round(((l100 / 100) * DIESEL.usd + wear) * 100) / 100 }; };
export const CARS = {
  car_pickup: car('car_pickup', 'Starý ojetý pick-up (nosnost 1 t)', 3000, 1, 'road1', 'Odhad ceny hodně ojetého vozu.', 12, 0.12),
  car_truck: car('car_truck', 'Ojetý sklápěč (nosnost 5 t)', 28000, 5, 'car2', 'Odhad ceny ojetého lehkého nákladního sklápěče.', 25, 0.3),
  car_dump: car('car_dump', 'Kloubový dampr Volvo A30G (29 t)', 450000, 29, 'car3', 'Odhad ceny nového stroje.', 90, 1.5),
};
// Odběratelé surovin na mapě. SPOTS: [druh, x, y, násobek ceny, jméno]; vzdálenější platí víc. Každý odběratel platí aspoň ceníkovou cenu, tedy víc než Trh (85 %).
export const BUYERS = {
  build: { name: 'Stavebniny', buys: ['glass', 'glassware', 'spoil'], what: 'Velkoobchod: vykupuje sklo a hlušinu jako kamenivo.' },
  power: { name: 'Teplárna', buys: ['coal'], what: 'Spaluje černé uhlí.' },
  cu: { name: 'Měděná huť', buys: ['ore_cu'], what: 'Zpracovává měděnou rudu.' },
  chem: { name: 'Chemička', buys: ['halite', 'fluorspar'], what: 'Ze soli vyrábí chlor a louh, z kazivce kyselinu fluorovodíkovou.' },
  al: { name: 'Hliníkárna', buys: ['bauxite'], what: 'Z bauxitu vyrábí oxid hlinitý a hliník.' },
  sn: { name: 'Cínová huť', buys: ['ore_sn'], what: 'Zpracovává cínovou rudu.' },
  au: { name: 'Rafinerie zlata', buys: ['ore_au'], what: 'Louží a rafinuje zlatonosnou rudu.' },
};
const THERMAL = PRICES.coal_thermal?.usd && PRICES.coal?.usd ? Math.round((PRICES.coal_thermal.usd / PRICES.coal.usd) * 100) / 100 : 1; // teplárna platí cenu energetického uhlí
export const SPOTS = [['build', 40, -36, 1], ['power', -48, 30, THERMAL], ['build', -70, -130, 1.2, 'Velkoobchod skla'], ['cu', 150, 120, 1.1], ['chem', -190, -60, 1.1], ['al', 60, 250, 1.1],
  ['power', 230, -140, Math.round(THERMAL * 110) / 100, 'Elektrárna'], ['sn', -380, 300, 1.15], ['au', 420, -520, 1.15]];

// ---------------------------------------------------------------- položky
// I(id, název, cena USD za balení, balení, { cat, depth = balení za den za plnou cenu, shape, col, buy: false = nejde koupit })
export const ITEMS = {};
// per = násobitel ceny z rešerše (rešerše je za kus → balení 100 ks; nebo koncentrát → surová ruda u dolu), why = proč
const I = (id, name, usd, pack, o = {}) => {
  const p = o.own ? undefined : PRICES[id], derived = p?.usd != null && o.why; // own = cenu a její původ určuje volající
  ITEMS[id] = { id, name, usd: p?.usd != null ? Math.round(p.usd * (o.per ?? 1) * 100) / 100 : usd, pack, fact: derived ? 'estimate' : p?.fact ?? o.fact ?? 'estimate', src: p?.src ?? o.src ?? null,
    note: derived ? `${o.why}; výchozí cena: ${p.note ?? ''}` : p?.note ?? o.note ?? null,
    cat: o.cat ?? 'Díly', depth: o.depth ?? 50, shape: o.shape ?? 'box', col: o.col ?? '#9aa0a6', buy: o.buy !== false, sell: o.sell !== false };
};
// Suroviny: z ložiska jde surová ruda. Cena u dolu = cena koncentrátu × (kovnatost rudy / kovnatost koncentrátu) × 0,5 (herní předpoklad).
const raw = (id, name, usd, depth, col, per, why) => I(id, name, usd, 't', { cat: 'Suroviny', depth, shape: 'ore', col, buy: false, per, why }); // suroviny se nekupují: těží se
raw('quartz', 'Křemen (kusový)', 60, 400, '#e9e4d8'); raw('coal', 'Černé uhlí (redukční)', 150, 400, '#2a2d33');
raw('ore_cu', 'Měděná ruda (1 % Cu)', 40, 300, '#c9783b', 0.02, 'ruda 1 % Cu z ceny koncentrátu 25 % Cu × 0,5');
raw('bauxite', 'Bauxit', 50, 300, '#b5533a'); raw('halite', 'Kamenná sůl', 50, 300, '#f3c9d2');
raw('fluorspar', 'Kazivec (35 % CaF₂)', 90, 200, '#9a6fd6', 0.18, 'ruda 35 % CaF₂ z ceny kyselinového kazivce 97 % × 0,5');
raw('ore_sn', 'Cínová ruda (0,5 % Sn)', 80, 200, '#8a8f98', 0.0042, 'ruda 0,5 % Sn z ceny koncentrátu 60 % Sn × 0,5');
raw('ore_au', 'Zlatonosná ruda (5 g/t)', 250, 150, '#f0c040', 0.5, 'polovina hodnoty obsaženého zlata');
I('spoil', 'Hlušina (kamenivo)', 10, 't', { cat: 'Suroviny', depth: 2000, shape: 'ore', col: '#8d8a84', buy: false, note: 'Odhad ceny netříděného lomového kamene u lomu, bez zdroje.' });
I('glass', 'Sklo (ploché a obalové)', 160, 't', { cat: 'Výrobky', depth: 300, shape: 'box', col: '#9fd3e6', buy: false });
I('glassware', 'Foukané sklo (ruční výroba)', 1000, '100 kg', { cat: 'Výrobky', depth: 30, shape: 'box', col: '#bfe6f2', buy: false, note: 'Odhad bez zdroje: velkoobchodní cena ručně foukaného užitkového skla kolem 10 USD za kilogram.' });
const si = (id, name, usd, pack, depth, shape, col) => I(id, name, usd, pack, { cat: 'Křemík', depth, shape, col });
// Spotřební materiál fabu (rezist, plyny, suspenze, terče) chodí do strojů potrubím z centrálního rozvodu, takže se bere rovnou ze Skladu.
I('fabchem', 'Chemie a plyny pro fab (rezist, plyny, suspenze, terče)', 1000, 'zásoba za 1 000 $', { cat: 'Spotřební', depth: 1000, shape: 'box', col: '#7fb3d5', sell: false, note: 'Herní hodnota: jedno balení je spotřební materiál fabu za 1 000 USD; kolik ho který krok spotřebuje, je herní odhad.' });
si('mgsi', 'Metalurgický křemík (98–99 %)', 2800, 't', 60, 'ore', '#6c7480'); si('polysi', 'Polykřemík 9N–11N', 3000, '100 kg', 80, 'ore', '#aeb9c9');
si('ingot200', 'Monokrystal CZ 200 mm', 30000, 'ingot ~100 kg', 4, 'ingot', '#7f8a99'); si('ingot300', 'Monokrystal CZ 300 mm', 60000, 'ingot ~330 kg', 4, 'ingot', '#93a0b3');
I('wafer100', 'Wafery 100 mm s oxidem a polykřemíkem', 225, '5 ks', { cat: 'Křemík', depth: 20, shape: 'foup', col: '#c9d2de', per: 0.2, why: 'balení 5 ks přepočtené z ceny 25 ks' });
si('wafer200', 'Wafery 200 mm (prime)', 1250, '25 ks', 60, 'foup', '#c9d2de'); si('wafer300', 'Wafery 300 mm (prime)', 2750, 'FOUP 25 ks', 80, 'foup', '#dfe6ee');
const part = (id, name, usd, pack, depth, shape = 'reel', col = '#8fa3b8') => I(id, name, usd, pack, { cat: 'Součástky', depth, shape, col });
part('mlcc', 'MLCC 0402 100 nF', 20, 'kotouč 10 000 ks', 500); part('resistor', 'Rezistory 0402', 8, 'kotouč 10 000 ks', 500, 'reel', '#5f6b7a');
part('elcap', 'Elektrolytické kondenzátory', 80, '1 000 ks', 200, 'reel', '#3d6fb5'); part('tantalum', 'Tantalové kondenzátory', 350, '1 000 ks', 100, 'reel', '#d9a23a');
part('polymer_cap', 'Polymerové kondenzátory', 150, '1 000 ks', 200, 'reel', '#7c5fd0'); part('inductor', 'Výkonové tlumivky VRM', 300, '1 000 ks', 200, 'reel', '#55606e');
part('crystal', 'Krystaly (křemenné rezonátory)', 150, '1 000 ks', 100, 'reel', '#c7ced6');
part('conn_small', 'Drobné konektory (USB, lišty, jacky)', 50, '100 ks', 300, 'box', '#3b4350'); part('conn_slot', 'Sloty PCIe / DIMM / M.2', 80, '100 ks', 300, 'box', '#2c3138');
part('conn_socket', 'Patice LGA1151', 600, '100 ks', 100, 'box', '#b9b2a0'); part('conn_video', 'Konektory HDMI / DP / VGA', 60, '100 ks', 200, 'box', '#59616d');
part('conn_power', 'Napájecí konektory ATX / PCIe', 40, '100 ks', 200, 'box', '#e8e3d2');
part('fan120', 'Ventilátor 120 mm', 350, '100 ks', 100, 'box', '#2a2e35'); part('cooler_cpu', 'Chladič CPU (hliník + ventilátor)', 600, '100 ks', 80, 'box', '#aab2bc');
part('cooler_small', 'Malý chladič (GPU / čipset)', 250, '100 ks', 100, 'box', '#aab2bc'); part('cooler_gpu', 'Chladič grafické karty', 2000, '100 ks', 60, 'box', '#767d87');
part('thermal_pad', 'Teplovodivé podložky', 100, '100 sad', 100, 'box', '#6fa8dc');
const pcb = (id, name, usd, depth = 100) => I(id, name, usd, '100 ks', { cat: 'DPS', depth, shape: 'pcb', col: '#1f7a4d' });
pcb('pcb_uno', 'DPS Arduino Uno (2 vrstvy)', 60); pcb('pcb_edge3d', 'DPS Edge 3D (4 vrstvy, PCI)', 500); pcb('pcb_dimm', 'DPS modulu DIMM (6 vrstev)', 250);
pcb('pcb_k620', 'DPS Quadro K620 (6 vrstev)', 600); pcb('pcb_gpu', 'DPS grafické karty (10 vrstev)', 2500); pcb('pcb_atx', 'DPS základní desky ATX (4 vrstvy)', 1800);
pcb('pcb_ssd', 'DPS M.2 2280 (6 vrstev)', 150);
const ic = (id, name, usd, depth = 100) => I(id, name, usd, '100 ks', { cat: 'Čipy', depth, shape: 'tray', col: '#2b2e33' });
ic('atmega328p', 'Microchip ATmega328P-AU', 250); ic('atmega16u2', 'Microchip ATmega16U2-MU', 330); ic('misc_ic', 'Drobné IO (stabilizátory, OZ, EEPROM)', 40, 500);
ic('eprom_27c256', 'EPROM 27C256', 300); ic('dram_256k16', 'FPM DRAM 256K×16 (SOJ-40)', 400); ic('ad1845', 'Analog Devices AD1845 (kodek)', 1200);
ic('ddr3_4gb', 'DDR3 4 Gb', 200); ic('lpddr4_ssd', 'LPDDR4 512 MB (SSD)', 300); ic('ssd_ctrl', 'Řadič NVMe SSD', 600);
const pc = (id, name, usd) => I(id, name, usd, '100 ks', { cat: 'Díly PC', depth: 100, shape: 'box', col: '#4a5261', sell: false });
pc('psu600', 'Zdroj ATX 600 W 80+ Bronze', 5000); pc('psu650', 'Zdroj Seasonic Core GX-650', 9000); pc('case_atx', 'Skříň ATX midi-tower', 6000);
pc('dell_t5810', 'Dell Precision T5810 (barebone, použitý)', 15000); pc('p100_kit', 'Sada pro Tesla P100 (kryty, ventilátory 9733, redukce EPS, Add2PSU)', 9000);
pc('ssd_870', 'Samsung 870 EVO 1 TB (SATA)', 9500);

// ---------------------------------------------------------------- čipy, které jde vyrobit
// sub = plocha pouzdra v mm² (podle ní se počítá cena substrátu ABF; 1400 mm² = desktopové CPU)
// process = klíč výrobního postupu (data/hw/processes.js + vlastní hobby10, euv5), pkg = pouzdření, die = plocha čipu mm²,
// mask = cena sady masek (tape-out), foundry = wafery jde koupit hotové (návrh bez vlastní továrny), wl = cena 1 waferu od foundry.
export const CHIPS = {};
const C = (id, name, year, process, pkg, die, pins, usd, mask, depth, o = {}) => {
  const r = PRICES[id]; // rešerše čipů: { die_mm2, launch_usd, … }
  CHIPS[id] = { id, name, year, process, pkg, die: r?.die_mm2 ?? die, pins, mask, cd: o.cd ?? null, sub: o.sub ?? 1400, foundry: o.foundry ?? null, req: o.req, extra: o.extra ?? null,
    node: r?.node ?? o.node ?? null, tr: r?.transistors ?? o.tr ?? null };
  const priced = r?.usd != null || r?.launch_usd != null; // cena čipu je doložená jen tehdy, když ji rešerše opravdu našla
  I(id, name, r?.usd ?? (r?.launch_usd ?? usd) * 100, '100 ks', { own: true, cat: 'Čipy', depth, shape: 'tray', col: o.col ?? '#2b2e33', buy: o.buy, sell: o.sell, fact: priced ? r.fact : 'estimate', src: r?.src,
    note: priced ? r.note : `Cena čipu je odhad.${r?.note ? ' ' + r.note : ''}` });
  I('wl_' + id, `Wafery s čipy ${name} (otestované)`, (o.foundry ?? 0) * 25, '25 waferů', { cat: 'Wafery s čipy', depth: 10, shape: 'foup', col: o.col ?? '#b08d57', buy: !!o.foundry, sell: false });
};
const mk = (id, d) => PRICES['maskset_' + id]?.usd ?? d, fw = (id, d) => PRICES['foundry_wafer_' + id]?.usd ?? d;
C('i4004', 'Intel 4004', 1971, 'hobby10', 'pkg_cerdip', 12, 16, 60, 2000, 3, { cd: 10000, req: 'fab0', buy: false, tr: 2300 });
C('mos6502', 'MOS Technology 6502', 1975, 'hobby10', 'pkg_cerdip', 16.6, 40, 25, 2500, 8, { cd: 8000, req: 'fab0', buy: false, tr: 3510 });
C('i8080', 'Intel 8080', 1974, 'hobby10', 'pkg_cerdip', 20, 40, 360, 3000, 1, { cd: 6000, req: 'fab0b', buy: false, tr: 4500 });
C('i8086', 'Intel 8086', 1978, 'hobby10', 'pkg_cerdip', 33, 40, 360, 5000, 1.5, { cd: 3000, req: 'fab0b', buy: false, tr: 29000 });
C('nv1', 'NVIDIA NV1 (STG2000X)', 1995, 'st05', 'pkg_wirebond', 90, 208, 60, mk('500nm', 80000), 8, { req: 'pkg1', foundry: fw('500nm', 700), tr: 1e6 });
C('stg1764', 'SGS-Thomson STG1764X (Palette-DAC)', 1995, 'st05', 'pkg_wirebond', 40, 128, 15, mk('500nm', 80000), 8, { req: 'pkg1', foundry: fw('500nm', 700) });
C('mosfet', 'Výkonový trench MOSFET 30 V (VRM)', 2000, 'power', 'pkg_wirebond', 4, 8, 1.2, 40000, 300, { req: 'power', col: '#3a3f47' });
C('gm107', 'NVIDIA GM107', 2014, 'tsmc28', 'pkg_flipchip', 148, 908, 40, mk('28nm', 2000000), 30, { req: 'pkg2', foundry: fw('28nm', 3000), tr: 1.87e9, sub: 841 });
C('xeon_e5_1650v3', 'Intel Xeon E5-1650 v3', 2014, 'intel22', 'pkg_flipchip', 354, 2011, 583, mk('22nm', 4000000), 15, { req: 'finfet', col: '#2f6fb5', sub: 2362 });
C('i7_9700', 'Intel Core i7-9700', 2019, 'intel14', 'pkg_flipchip', 174, 1151, 323, mk('16nm', 7000000), 300, { req: 'finfet', col: '#2f6fb5' });
C('b360_pch', 'Intel B360 (PCH)', 2018, 'intel14', 'pkg_flipchip', 60, 874, 26, mk('16nm', 7000000), 300, { req: 'finfet', sub: 552 });
C('hbm2_4gb', 'HBM2 4 GB (stoh 4× 8 Gb + TSV)', 2016, 'dram', 'pkg_hbm', 92, 4900, 60, 4000000, 20, { req: 'memory', buy: true });
C('gp100', 'NVIDIA GP100 na CoWoS (se 4× HBM2)', 2016, 'tsmc16', 'pkg_cowos', 610, 2397, 1800, mk('16nm', 7000000), 4, { req: 'pkg3', foundry: fw('16nm', 6000), tr: 1.53e10, extra: { hbm2_4gb: 4 }, col: '#76b900', buy: false, sell: false }); // NVIDIA čip GP100 samostatně neprodává
C('ga104', 'NVIDIA GA104', 2020, 'samsung8n', 'pkg_flipchip', 392.5, 2000, 110, mk('8nm', 10000000), 60, { req: 'pkg2', foundry: fw('8nm', 7500), tr: 1.74e10, col: '#76b900', sub: 1225 });
C('ddr4_8gb', 'DDR4 8 Gb (FBGA-78)', 2016, 'dram', 'pkg_wirebond', 50, 78, 3.5, 4000000, 3000, { req: 'memory' });
C('gddr6x_8gb', 'Micron GDDR6X 8 Gb', 2020, 'dram', 'pkg_flipchip', 60, 180, 6, 4000000, 600, { req: 'memory', sub: 168 });
C('vnand_512g', 'Samsung V-NAND 512 Gb', 2018, 'vnand', 'pkg_wirebond', 65, 132, 3.5, 4000000, 2000, { req: 'memory' });
C('ryzen_7700x', 'AMD Ryzen 7 7700X', 2022, 'euv5', 'pkg_flipchip', 71, 1718, 399, mk('5nm', 30000000), 60, { req: 'pkg2', foundry: fw('5nm', 16000), tr: 6.57e9, col: '#e0562b', sub: 1600 });

// ---------------------------------------------------------------- výrobky z desek (kusovník na 1 kus, osazení = počet součástek na desce)
export const BOARDS = {};
const B = (id, name, usd, depth, pcbId, places, bom, req) => {
  BOARDS[id] = { id, name, pcb: pcbId, places, bom, req };
  I(id, name, usd * 100, '100 ks', { cat: 'Výrobky', depth, shape: 'board', col: '#1f7a4d', buy: id !== 'arduino_uno', per: 100 });
};
B('arduino_uno', 'Arduino Uno R3', 27.6, 20, 'pcb_uno', 50, { atmega328p: 1, atmega16u2: 1, misc_ic: 4, crystal: 2, mlcc: 16, resistor: 14, conn_small: 6 }, 'smt1');
B('edge3d', 'Diamond Edge 3D 2120 (NV1)', 249, 4, 'pcb_edge3d', 190, { nv1: 1, stg1764: 1, dram_256k16: 4, ad1845: 1, eprom_27c256: 1, misc_ic: 10, crystal: 1, mlcc: 80, resistor: 60, elcap: 12, tantalum: 6, conn_small: 5, conn_video: 1 }, 'fab200');
B('udimm8', 'Kingston HyperX Fury 8 GB DDR4-2666', 35, 200, 'pcb_dimm', 85, { ddr4_8gb: 8, misc_ic: 1, mlcc: 40, resistor: 36 }, 'smt2');
B('rdimm8', 'DDR4 ECC RDIMM 8 GB', 45, 60, 'pcb_dimm', 110, { ddr4_8gb: 9, misc_ic: 2, mlcc: 55, resistor: 44 }, 'smt2');
B('ssd_970', 'Samsung 970 EVO Plus 500 GB', 129.99, 100, 'pcb_ssd', 100, { ssd_ctrl: 1, lpddr4_ssd: 1, vnand_512g: 8, misc_ic: 3, mlcc: 60, resistor: 30 }, 'smt2');
B('k620', 'NVIDIA Quadro K620 2 GB', 189, 20, 'pcb_k620', 400, { gm107: 1, ddr3_4gb: 4, mosfet: 4, inductor: 3, polymer_cap: 6, misc_ic: 8, mlcc: 220, resistor: 150, conn_video: 2, cooler_small: 1 }, 'pkg2');
B('mb_b360', 'ASUS PRIME B360-PLUS', 99, 80, 'pcb_atx', 1900, { b360_pch: 1, misc_ic: 15, mosfet: 14, inductor: 9, polymer_cap: 30, elcap: 6, crystal: 3, mlcc: 900, resistor: 700, conn_socket: 1, conn_slot: 12, conn_small: 30, conn_video: 3, conn_power: 2, cooler_small: 2 }, 'smt2');
B('rtx3060ti', 'ASUS Dual GeForce RTX 3060 Ti', 399, 60, 'pcb_gpu', 1800, { ga104: 1, gddr6x_8gb: 8, mosfet: 20, inductor: 10, polymer_cap: 20, misc_ic: 25, mlcc: 1100, resistor: 600, conn_video: 4, conn_power: 1, cooler_gpu: 1, thermal_pad: 1 }, 'pkg2');
B('tesla_p100', 'NVIDIA Tesla P100 16 GB', 5899, 3, 'pcb_gpu', 1500, { gp100: 1, mosfet: 16, inductor: 16, polymer_cap: 30, tantalum: 10, misc_ic: 20, mlcc: 900, resistor: 500, conn_power: 1, cooler_gpu: 1, thermal_pad: 1 }, 'pkg3');
// Sestavy PC (montáž z hotových dílů) – tvoje projekty MŮJ PC a AI PC 2× P100
export const BUILDS = {
  pc_mypc: { id: 'pc_mypc', name: 'MŮJ PC (i7-9700, RTX 3060 Ti, 32 GB)', bom: { case_atx: 1, psu600: 1, mb_b360: 1, i7_9700: 1, udimm8: 4, rtx3060ti: 1, ssd_970: 1, cooler_cpu: 1, fan120: 4 } },
  pc_ai: { id: 'pc_ai', name: 'AI PC 2× Tesla P100 (Dell T5810)', bom: { dell_t5810: 1, xeon_e5_1650v3: 1, rdimm8: 4, tesla_p100: 2, k620: 1, ssd_870: 1, psu650: 1, p100_kit: 1 } },
};
for (const b of Object.values(BUILDS)) {
  const sum = Object.entries(b.bom).reduce((a, [it, n]) => a + ITEMS[it].usd * n, 0);
  I(b.id, b.name, Math.round(sum * 1.25), '100 ks', { own: true, cat: 'Výrobky', depth: b.id === 'pc_mypc' ? 20 : 2, shape: 'pc', col: '#ffb52e', buy: false,
    note: 'Herní odhad: součet cen dílů + 25 % (montáž, software, marže).' });
}

// výtěžnost: hrubý počet čipů na waferu a model defektů (negativně binomický, α = 3)
export const diesPerWafer = (d, a) => Math.max(1, Math.floor((Math.PI * d * d) / (4 * a) - (Math.PI * d) / Math.sqrt(2 * a)));
export const yieldOf = (dieMm2, d0) => (1 + ((dieMm2 / 100) * d0) / 3) ** -3;
