import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, place, remove, removeGround, tick, at, key, serialize, deserialize, revenue, buy, sell, research, tapeout, d0Of, canPlace, oreAt, survey, pathOf, planRoad, buildRoad, capOf, needOf, staffed, boost, setStaff, upgrade, upgradeCost, swaps, WAGE_DAY, RESERVE, MAXCARS, SURF_T,
  hoursOf, grade, setMaint, repairCost, statusOf, GRID_MWH, SLOPE_K, DAY, DEAL_BONUS, resaleFactor, takeLoan, repayLoan, reclaim, RECLAIM_USD, powerTariff, RC_OPEX, setDrillMode, drillSurvey, isPit,
  UPG, MODS, hasMod, modCost, installMod, installAllMods, upgradeMax, pileOf, maxCarsOf, reachOf, reserveOf, depotFeeOf, evolutions, upgradeModelCost, upgradeModelErr, upgradeModel, FIX_H, PILE, DEPOT_FEE,
  unlockWithReqs, autoConnectRoad, hireAllStaff, maintAll, upgradeAll, connectAllRoads, finishBuildNow, fixBrokenNow, expandHall, buildMineWithRoad, buildFactory, buildDumpNextTo } from '../src/sim.js';
import { MODELS, ITEMS, CHIPS, KINDS, LOGI, CARS, COAL_PER_MWH, FEED_USD, HOUR, DIESEL } from '../data/catalog.js';
import { ROUTES, RESEARCH, MISSIONS, canDo } from '../data/routes.js';
import { ORES } from '../src/world.js';

const run = (s, seconds, dt = 1 / 20) => { for (let i = 0; i < seconds / dt; i++) tick(s, dt); };
const must = (r) => { assert.equal(r.err, undefined, r.err); return r.b; };
const dilna = (seed) => { const s = newGame({ seed }); s.pts = 99; s.money = 50000; for (const r of ['mine1', 'smt1']) assert.ok(research(s, r), r); return s; }; // hra po odemknutí Dílny elektroniky
const hall = (s, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s._hall.add(key(x, y)); }; // hala zdarma, jen pro zkoušku

test('každý krok každé trasy umí aspoň jeden stroj z katalogu a jeho výzkum existuje', () => {
  const ids = new Set(RESEARCH.map((r) => r.id));
  for (const r of Object.values(ROUTES)) {
    assert.ok(!r.req || ids.has(r.req), `${r.id}: výzkum ${r.req}`);
    r.ops.forEach((op, i) => assert.ok(Object.values(MODELS).some((m) => canDo(m, r, op)), `${r.id} krok ${i} (${op.kind}) nemá stroj`));
  }
  for (const m of Object.values(MODELS)) {
    assert.ok(KINDS[m.kind], m.id);
    for (const q of [m.req].flat()) assert.ok(ids.has(q), `${m.id}: výzkum ${q}`);
    assert.ok(m.usd > 0 && m.rate > 0, m.id);
  }
});

test('dopravník doveze položku do Centrály a plná kolona se posouvá celá', () => {
  const s = dilna(1);
  for (let x = 3; x <= 8; x++) must(place(s, 'belt', x, 0, 2));
  at(s, 8, 0).it = 'halite';
  run(s, 2.2);
  assert.equal(s.got.halite, 1);
  assert.ok(s.autoSell.halite && s.sold.halite > 0, 'sůl nejde nikde použít, tak se prodá sama');
  for (let x = 3; x <= 8; x++) Object.assign(at(s, x, 0), { it: 'coal', p: 1 });
  tick(s, 1 / 20);
  assert.equal(s.got.coal, 1, 'první odjela do skladu');
  assert.equal(at(s, 8, 0).it, null, 'poslední dlaždice se uvolnila ve stejném kroku');
  run(s, 2);
  assert.equal(s.got.coal, 6);
  at(s, 8, 0).it = 'bauxite'; s.autoSell = {}; // křemen potřebuje sklárna, proto zůstává skladem
  at(s, 7, 0).it = 'quartz';
  run(s, 2);
  assert.ok(s.autoSell.bauxite === true && s.autoSell.quartz === true && !s.inv.quartz && s.sold.quartz > 0, 'bez pece se prodá i křemen');
});

test('zcela plná smyčka dopravníků se točí dál', () => {
  const s = dilna(1);
  const ring = [[10, 10, 0], [11, 10, 1], [11, 11, 2], [10, 11, 3]];
  ring.forEach(([x, y, d], i) => { must(place(s, 'belt', x, y, d)); at(s, x, y).it = i === 0 ? 'quartz' : 'coal'; });
  const where = () => ring.findIndex(([x, y]) => at(s, x, y).it === 'quartz');
  run(s, 0.4);
  assert.notEqual(where(), 0, 'položky se posunuly');
  assert.equal(ring.filter(([x, y]) => at(s, x, y).it).length, 4, 'žádná se neztratila');
});

test('garážová linka u Centrály vyrobí Arduino Uno a prodá ho', () => {
  const s = dilna(1);
  const money = s.money;
  const [printer] = ['stencil_vxb', 'pnp_lumen', 'reflow_t962a', 'aoi_scope', 'fct_jig'].map((id, i) => must(place(s, id, 3, -3 + i)));
  printer.prod = 'arduino_uno';
  run(s, 130);
  assert.ok(s.made.arduino_uno >= 1, 'vyrobeno');
  assert.ok(s.sold.arduino_uno > 0, 'prodáno samo');
  assert.ok(s.money > money - 5000, 'tržba přišla');
  assert.ok((s.inv.pcb_uno ?? 0) < 2, 'desky se spotřebovaly');
});

test('stroj si bere dávky i díly z dopravníku, který vede kolem něj', () => {
  const s = dilna(1);
  hall(s, 14, 0, 26, 2);
  const printer = must(place(s, 'stencil_vxb', 20, 1));
  printer.prod = 'arduino_uno';
  for (let x = 16; x <= 26; x++) must(place(s, 'belt', x, 0, 0));
  at(s, 16, 0).it = 'pcb_uno';
  run(s, 20);
  assert.ok(printer.job || printer.out.length || [...Array(11)].some((_, i) => at(s, 16 + i, 0).it?.startsWith('w:arduino_uno')), 'tiskař desku vzal a zpracoval');
});

test('třídič pustí vybranou položku rovně a ostatní do strany', () => {
  const s = dilna(1);
  for (const x of [10, 11]) must(place(s, 'belt', x, 20, 0));
  must(place(s, 'sorter', 12, 20)).f = 'quartz';
  must(place(s, 'belt', 13, 20, 0)); must(place(s, 'belt', 12, 21, 1));
  at(s, 10, 20).it = 'quartz'; at(s, 11, 20).it = 'coal';
  run(s, 0.5);
  assert.ok(at(s, 13, 20).it === 'quartz' && at(s, 12, 21).it === 'coal');
});

test('trh: nad hloubkou trhu tržba roste jen logaritmicky', () => {
  const s = dilna(1);
  const d = ITEMS.arduino_uno.depth, full = revenue(s, 'arduino_uno', d);
  assert.ok(Math.abs(full - d * ITEMS.arduino_uno.usd * 0.85) < 1e-6);
  assert.ok(revenue(s, 'arduino_uno', 2 * d) < 1.8 * full);
  assert.ok(buy(s, 'mlcc', 3) && s.inv.mlcc === 4);
  assert.equal(sell(s, 'mlcc', 10), revenue(newGame({ seed: 1 }), 'mlcc', 4), 'prodá jen to, co je skladem');
});

test('čistý prostor, výzkum a návrh čipu brání stavbě a výrobě', () => {
  const s = dilna(1);
  assert.equal(canPlace(s, 'furnace_a400', 20, 20), 'Nejdřív odemkni ve Stromu rozvoje');
  s.money = 1e9;
  for (const r of ['fab0', 'pkg1', 'fab200']) assert.ok(research(s, r), r);
  assert.equal(canPlace(s, 'furnace_a400', 20, 20), 'Výrobní stroj musí stát v hale');
  assert.equal(canPlace(s, 'floor', 20, 20), 'Čistý prostor jde postavit jen v hale');
  for (let x = 20; x < 23; x++) for (let y = 20; y < 22; y++) must(place(s, 'hall', x, y));
  assert.equal(canPlace(s, 'furnace_a400', 20, 20), 'Stroj musí stát celý v čistém prostoru');
  for (let x = 20; x < 23; x++) for (let y = 20; y < 22; y++) must(place(s, 'floor', x, y));
  must(place(s, 'furnace_a400', 20, 20));
  assert.ok(tapeout(s, 'nv1') && s.tape.nv1 && !tapeout(s, 'nv1'));
  assert.ok(!removeGround(s, 20, 20), 'pod strojem podlahu zbourat nejde');
  must(place(s, 'hall', 24, 20)); must(place(s, 'floor', 24, 20));
  assert.ok(removeGround(s, 24, 20) && removeGround(s, 24, 20) && !removeGround(s, 24, 20), 'nejdřív čistý prostor, pak hala');
});

test('výtěžnost roste s počtem zpracovaných waferů', () => {
  const s = newGame({ seed: 1 });
  const a = d0Of(s, 'intel14');
  s.learn.intel14 = 5000;
  assert.ok(d0Of(s, 'intel14') < a / 3);
  assert.ok(CHIPS.i7_9700.yield0 > 0.5 && CHIPS.i7_9700.gross > 5000);
});

test('garážový fab na smyčce vyrobí Intel 4004 od waferu po pouzdro a neucpe se', () => {
  const s = newGame({ seed: 3, sandbox: true });
  hall(s, 5, 3, 30, 16);
  s.inv.wafer100 = 60;
  const X0 = 8, X1 = 20, Y0 = 8, Y1 = 12; // smyčka po směru hodinových ručiček
  for (let x = X0; x < X1; x++) must(place(s, 'belt', x, Y0, 0));
  for (let y = Y0 + 1; y < Y1; y++) must(place(s, 'belt', X1, y, 1));
  for (let x = X1; x > X0; x--) must(place(s, 'belt', x, Y1, 2));
  for (let y = Y1; y > Y0; y--) must(place(s, 'belt', X0, y, 3));
  must(place(s, 'sorter', X1, Y0)).f = 'i4004'; // hotové čipy pustí rovně ven, rozpracované dávky zahne zpět do smyčky
  must(place(s, 'belt', X1 + 1, Y0, 0)); must(place(s, 'depot', X1 + 2, Y0 - 1));
  const top = ['wet_hood', 'track_spin', 'litho_hf2', 'etch_pe25', 'furnace_mti', 'pvd_hf', 'prober_station', 'ate_smu', 'dicer_scribe', 'diebond_manual'].map((id, i) => must(place(s, id, 9 + i, Y0 - 1)));
  ['wirebond_4524', 'seal_manual'].forEach((id, i) => must(place(s, id, 10 + i, Y1 + 1)));
  top[0].prod = 'fab_i4004'; top[8].prod = 'pkg_i4004';
  must(place(s, 'unloader', 3, 0, 0)).f = 'wafer100'; // wafery ze skladu slepým dopravníkem do prvního stroje
  for (let x = 4; x < 9; x++) must(place(s, 'belt', x, 0, 0));
  for (let y = 0; y < Y0 - 1; y++) must(place(s, 'belt', 9, y, 1));
  let peak = 0;
  for (let i = 0; i < 8000 * 12; i++) { tick(s, 1 / 12); if (i % 600 === 0) peak = Math.max(peak, s.wip.fab_i4004 ?? 0); }
  assert.ok(peak > 1 && peak <= 8, `v oběhu nejvýš 8 lotů (bylo ${peak})`);
  assert.ok(s.made.wl_i4004 >= 4, `lotů waferů ${s.made.wl_i4004}`);
  assert.ok(s.got.i4004 >= 10, `balení čipů v depu ${s.got.i4004}`);
  assert.ok(s.yieldAvg.i4004 > 0.1 && s.yieldAvg.i4004 < 1 && s.learn.hobby10 >= 20);
});

test('každou ze všech tras jde dokončit: stroje z katalogu kolem smyčky, díly po dopravníku', () => {
  for (const r of Object.values(ROUTES)) {
    const s = newGame({ seed: 5, sandbox: true });
    s._world.terrain = () => 2; s._world.ore = () => 0; // rovná louka, ať rozhoduje jen výroba
    const speed = (m) => m.rate / KINDS[m.kind].ref;
    const best = r.ops.map((op) => Object.values(MODELS).filter((m) => canDo(m, r, op)).sort((a, b) => speed(b) - speed(a))[0]); // nejrychlejší stroj na každý krok
    const ids = [...new Set(best.map((m) => m.id))];
    const inputs = new Set(r.ops.flatMap((op) => Object.keys(op.in ?? {})));
    const W = Math.max(ids.reduce((a, id) => a + MODELS[id].w + 1, 1), inputs.size * 3 + 20), OX = 10, OY = 20; // smyčka dost dlouhá i pro všechny díly
    hall(s, OX, OY - 15, OX + W, OY);
    for (let y = OY - 15; y < OY; y++) for (let x = OX; x <= OX + W; x++) must(place(s, 'floor', x, y));
    const ring = [];
    for (let x = 0; x < W; x++) ring.push(must(place(s, 'belt', OX + x, OY, 0)));
    ring.push(must(place(s, 'belt', OX + W, OY, 1)));
    for (let x = W; x > 0; x--) ring.push(must(place(s, 'belt', OX + x, OY + 1, 2)));
    ring.push(must(place(s, 'belt', OX, OY + 1, 3)));
    let x = OX + 1;
    for (const id of ids) { const b = must(place(s, id, x, OY - MODELS[id].h)); x += MODELS[id].w + 1; if (canDo(MODELS[id], r, r.ops[0])) b.prod = r.id; }
    const target = r.out ? Object.keys(r.out)[0] : r.cat === 'fab' ? 'wl_' + r.chip : r.chip;
    const qty = r.ops.reduce((a, op) => a + Object.values(op.in ?? {}).reduce((p, q) => p + q, 0), 0);
    const limit = (r.ops.reduce((a, op, n) => a + op.h / speed(best[n]), 0) * 6 * 4 + r.ops.length * (ring.length / 6 + 5) + qty * 6 + 300) * 12; // práce s rezervou + objezdy smyčky + dovoz dílů
    let i = 0;
    const done = () => (r.power ? s.gen >= r.power : s.made[target]); // elektrárna nic nevyrábí do Skladu, plní zásobník proudu
    for (; i < limit && !done(); i++) {
      if (i % 12 === 0) for (const b of ring) if (b.it && !ITEMS[b.it].wip && !inputs.has(b.it)) b.it = null; // hotové kusy odebírá zkouška
      // díly přijíždějí po smyčce, nejvýš dva kusy od každého (víc by smyčku zaplavilo)
      if (i % 12 === 0) for (const it of inputs) if (ring.filter((b) => b.it === it).length < 2) { const f = ring.find((b) => !b.it); if (f) f.it = it; }
      tick(s, 1 / 12);
    }
    assert.ok(done(), `${r.id}: ${target} nevzniklo (rozpracováno ${JSON.stringify(s.wip)}, stav strojů ${s.list.filter((b) => b.k === 'machine').map((b) => `${b.model}:${b.st}${b.miss ? '/' + b.miss : ''}`).join(' ')})`);
  }
});

test('sklad nebere rozpracované dávky a první stroj hlídá jejich počet v oběhu', () => {
  const s = dilna(1);
  for (let x = 3; x <= 6; x++) must(place(s, 'belt', x, 0, 2));
  at(s, 6, 0).it = 'w:arduino_uno:1';
  run(s, 3);
  assert.equal(at(s, 3, 0).it, 'w:arduino_uno:1', 'dávka stojí před Centrálou');
  const printer = must(place(s, 'stencil_vxb', 3, -3));
  Object.assign(printer, { prod: 'arduino_uno', cap: 1 });
  s.inv.pcb_uno = 10;
  run(s, 60);
  assert.equal(s.wip.arduino_uno, 1, 'druhou dávku nezačne, dokud první nedojede');
  assert.equal(printer.st, 'cap');
});

test('hra začíná od mála: jen Sklad, ruční lom, polní cesta a malá sklárna; zbytek je zamčený a dílna přijde s elektronikou', () => {
  const s = newGame({ seed: 9 });
  assert.equal(s.money, 15000);
  assert.deepEqual(s.list.filter((b) => b.k !== 'npc').map((b) => b.k), ['hub'], 'stojí jen Sklad');
  assert.ok(s._hall.size === 0 && s.list.filter((b) => b.k === 'npc').length >= 7 && s.list.some((b) => b.t === 'build'));
  for (const id of ['miner_u17', 'belt', 'road2', 'hall', 'depot', 'stencil_vxb', 'glass_tank']) assert.equal(canPlace(s, id, 30, 30), 'Nejdřív odemkni ve Stromu rozvoje', id);
  assert.equal(canPlace(s, 'road1', 30, 30), null);
  assert.equal(canPlace(s, 'glass_pot', 30, 30), 'Nedostatek peněz', 'sklářská dílna je odemčená, ale stojí 40 000 $');
  assert.ok(!research(s, 'mine1'), 'bez bodů se neodemyká');
  must(place(s, 'road1', -4, -3)); // silnice přesně tam, kam přijde linka: ustoupí jí
  s.pts = 6;
  assert.ok(research(s, 'mine1') && s.pts === 4 && !research(s, 'pc') && research(s, 'smt1') && s.pts === 0);
  assert.ok(s._hall.has(key(13, 8)) && s._hall.has(key(-12, -8)), 'Dílna elektroniky postaví halu kolem Skladu');
  assert.deepEqual([-3, -2, -1, 0, 1].map((y) => at(s, -4, y).model), ['stencil_vxb', 'pnp_lumen', 'reflow_t962a', 'aoi_scope', 'fct_jig'], 'a v ní linku');
  assert.equal(s.money, 15000, 'linka je zdarma a silnice pod ní se vrátila v plné ceně');
  at(s, -4, -3).prod = 'arduino_uno';
  run(s, 130);
  assert.ok(s.made.arduino_uno >= 1 && s.sold.arduino_uno > 0);
});

test('cesta se navrhne mezi dvěma body a auta přijedou sama; sklárna u Skladu taví sklo a přebytek surovin se prodává', () => {
  const s = newGame({ seed: 2 });
  const hq = s.list.find((b) => b.hq), q = must(place(s, 'quarry_hand', 22, -17));
  setStaff(s, q, 99); // tři směny, ať zkouška netrvá dny
  run(s, 150, 1 / 12);
  assert.ok(!q.cars?.length && q.out.length > 0 && !s.got.quartz, 'bez silnice nic nejezdí a hromada roste');
  const plan = planRoad(s, 'road1', { x: 22, y: -17 }, { x: 0, y: 0 }); // hráč ukáže dva body: lom a Sklad
  const turns = plan.tiles.filter((p, n, a) => n > 1 && (p[0] - a[n - 1][0] !== a[n - 1][0] - a[n - 2][0] || p[1] - a[n - 1][1] !== a[n - 1][1] - a[n - 2][1])).length;
  assert.ok(plan.usd === plan.tiles.length * LOGI.road1.usd && plan.tiles.length <= 34 && turns <= 2, `cesta ${plan.tiles.length} m se ${turns} zatáčkami`);
  s.money = 100;
  assert.ok(!buildRoad(s, 'road1', plan) && s._road.size === 0, 'bez peněz na celou cestu se nestaví nic');
  s.money = 15000;
  assert.ok(buildRoad(s, 'road1', plan) && s.money === 15000 - plan.usd && pathOf(s, q, hq).length === plan.tiles.length);
  assert.equal(planRoad(s, 'road1', { x: 22, y: -17 }, { x: 0, y: 0 }).usd, 0, 'po hotové silnici je návrh zadarmo');
  assert.equal(planRoad(s, 'road1', { x: 22, y: -17 }, { x: 23, y: -16 }), null, 'z budovy do téže budovy cesta nevede');
  assert.equal(canPlace(s, 'quarry_hand', ...plan.tiles[10]), 'Na silnici stavět nejde');
  const trips = (sec) => { const a = s.got.quartz ?? 0; q.out = Array(40).fill('quartz'); for (let n = 0; n < sec * 12; n++) { tick(s, 1 / 12); if (q.out.length < 10) q.out.push('quartz'); } return s.got.quartz - a; }; // hromada pořád plná: měří se jen doprava
  s.money = 40000; // na čtyři auta s rezervou
  const m0 = s.money, slow = trips(600);
  assert.ok(slow >= 60 && q.cars.every((c) => !c.to || c.to[0] === hq.x), `po polní cestě do Skladu ${slow} t`);
  assert.ok(q.cars.length === MAXCARS && q.cars.every((c) => c.m === 'car_pickup'), 'auta přibyla sama, když hromada rostla');
  const carUsd = MAXCARS * CARS.car_pickup.usd;
  assert.ok((s.inv.quartz ?? 0) <= 5 && s.sold.quartz > 0 && s.money > m0 - carUsd, `bez pece se křemen prodává celý: těžba vydělává i po nákupu aut (${Math.round(s.money - m0 + carUsd)} $)`);
  s.money = 200000;
  const [gx, gy] = [[3, -1], [-6, -1], [-1, 3], [-1, -6]].find(([x, y]) => !canPlace(s, 'glass_pot', x, y)); // volné místo těsně u Skladu
  const g = must(place(s, 'glass_pot', gx, gy));
  assert.equal(g.prod, 'glassware', 'pec nemá co volit');
  run(s, 30, 1 / 12);
  assert.ok(g.st === 'miss' && g.miss === 'coal' && g.buf.quartz >= 1 && !g.cars?.length, 'křemen má, uhlí chybí; u Skladu auto nepotřebuje');
  const c = must(place(s, 'quarry_hand', -28, 18));
  assert.ok(buildRoad(s, 'road1', planRoad(s, 'road1', { x: -28, y: 18 }, { x: 0, y: 0 })));
  run(s, 900, 1 / 12);
  setStaff(s, g, 99);
  run(s, 600, 1 / 12);
  assert.ok(c.cars.length >= 1 && s.made.glassware >= 5 && s.sold.glassware > 0 && s.lvl >= 1 && s.inv.quartz >= RESERVE - 3 && s.inv.coal >= RESERVE - 3, `foukané sklo ${s.made.glassware} balení, úroveň ${s.lvl}; Sklad teď drží zásobu pro pec`);
  // sklárna jinde než u Skladu: auta jí vozí sama a mají ji radši než Sklad; sklo si odveze sama
  const [rx, ry] = plan.tiles[12], spot = [[rx - 1, ry - 3], [rx - 1, ry + 1], [rx - 3, ry - 1], [rx + 1, ry - 1]].find(([x, y]) => !canPlace(s, 'glass_pot', x, y));
  const g2 = must(place(s, 'glass_pot', ...spot));
  run(s, 200, 1 / 12);
  assert.ok(g2.buf.quartz >= 1, 'křemen jezdí i do nové sklárny');
  q.out = Array(40).fill('quartz'); // pec je brzy plná: další jízdy jedou do Skladu, auta u ní nestojí a lom neustrne
  const before2 = s.got.quartz;
  run(s, 200, 1 / 12);
  assert.ok(g2.buf.quartz >= capOf(g2).quartz - 1 && s.got.quartz - before2 >= 15 && q.cars.filter((c) => c.dir > 0 && c.p >= (c._path?.length ?? 1) - 1 && c.w > 5).length === 0, `plná pec neblokuje: do Skladu mezitím dojelo ${s.got.quartz - before2} t`);
  const cells = new Set(), moving = q.cars.filter((c) => c.dir && c._path && !(c.dir > 0 && c.p >= c._path.length - 1));
  for (const c of moving) cells.add(c._cell);
  assert.equal(cells.size, moving.length, 'dvě auta nikdy nejedou ve stejném pruhu na stejné dlaždici');
  q.to = [hq.x, hq.y]; q.auto = false; g2.buf.quartz = 0;
  run(s, 120, 1 / 12);
  assert.ok(g2.buf.quartz === 0 && q.cars.every((c) => !c.to || c.dir <= 0 || c.to[0] === hq.x), 'ručně zvolený cíl platí: do pece už nic nejede');
  s.pts = 4;
  assert.ok(research(s, 'road2') && research(s, 'car2'));
  const up = planRoad(s, 'road2', { x: 22, y: -17 }, { x: 0, y: 0 });
  assert.ok(up.tiles.length === plan.tiles.length && up.usd === plan.tiles.length * (LOGI.road2.usd - LOGI.road1.usd) && buildRoad(s, 'road2', up), 'vylepšení vede po staré cestě a stojí jen rozdíl');
  const fast = trips(600);
  assert.ok(fast > slow * 1.4 && q.cars.some((x) => x.m === 'car_truck'), `po štěrku se sklápěči ${fast} t proti ${slow} t`);
  const money = s.money, [bx, by] = plan.tiles[5];
  assert.ok(removeGround(s, bx, by) && s.money === money + LOGI.road2.usd, 'zbouraná silnice vrací cenu');
  run(s, 20, 1 / 12);
  assert.ok(pathOf(s, q, hq) === null && q.cars.every((x) => x.p === 0 && x.dir === 0), 'bez silnice se auta vrátí k lomu');
  const s2 = deserialize(serialize(s));
  assert.ok(s2._road.size === s._road.size && at(s2, 22, -17).cars.length === q.cars.length && s2.pts === s.pts && s2.list.some((b) => b.k === 'npc'), 'silnice, auta, body a odběratelé se uloží');
  const land = s._world.terrain, m1 = s.money;
  s._world.terrain = (x, y) => (x === 60 ? 0 : land(x, y)); // pruh vody
  must(place(s, 'road1', 60, 0));
  assert.equal(m1 - s.money, LOGI.road1.usd * 10, 'přes vodu vede silnice jako násep za desetinásobek');
  assert.equal(canPlace(s, 'quarry_hand', 60, 5), 'Na vodě stavět nejde');
  assert.ok(removeGround(s, 60, 0) && s.money === m1);
  assert.ok(remove(s, q) && !remove(s, s.list.find((b) => b.k === 'npc')), 'odběratel zbourat nejde');
});

test('úrovně: každá začíná svou výbavou, splněné cíle ji vyhrají a volnou hru vedou úkoly', () => {
  assert.deepEqual(MISSIONS.map((l) => l.id), ['l1', 'l2', 'l3', 'l4', 'free']);
  const a = newGame({ seed: 3, level: 'l1' });
  assert.ok(a.level === 'l1' && a.guide === 0 && a.money === 15000 && !a.won);
  const lom = must(place(a, 'quarry_hand', -28, 18));
  a.made.coal = 10; a.got.coal = 10; a.pts = 2;
  run(a, 1);
  assert.ok(!a.won && a.quest === 0, 'chybí dva cíle; úkoly se v úrovni nepočítají');
  assert.ok(setStaff(a, lom, 4) && research(a, 'road2'), 'druhá směna a první odemčení');
  run(a, 1);
  assert.ok(a.won && a._fx.some((f) => f.win === 'l1') && deserialize(serialize(a)).won, 'všechny cíle splněny');
  const d = newGame({ seed: 3, level: 'l4' });
  assert.ok(d.guide === null && d._hall.size > 0 && d.research.includes('smt1') && at(d, -4, -3).model === 'stencil_vxb' && d.money === 30000, 'čtvrtá úroveň začíná s dílnou a linkou');
  assert.equal(canPlace(d, 'belt', 30, 30), null, 'dopravníky přijdou s dílnou');
  const f = newGame({ seed: 3 });
  assert.ok(f.level === 'free' && f.guide === null && canPlace(f, 'belt', 30, 30) === 'Nejdřív odemkni ve Stromu rozvoje');
  f.pts = 2;
  assert.ok(research(f, 'belts') && canPlace(f, 'belt', 30, 30) === null, 'dopravníky jdou odemknout i samostatně');
  f.got.coal = 10;
  run(f, 1);
  assert.ok(f.quest === 1 && !f.won, 've volné hře běží úkoly');
  assert.throws(() => deserialize(JSON.stringify({ v: 2 })), 'stará uložená hra se nenačte');
});

test('lidé, směny, vylepšení a výměna za lepší stroj: směna pracuje 8 hodin denně, mzdy se platí jen za práci', () => {
  const s = newGame({ seed: 4 });
  s.money = 1e7;
  const H = MODELS.quarry_hand, K = MODELS.miner_u17, q = must(place(s, 'quarry_hand', 22, -17));
  const mine = (days = 3) => { const a = s.made.quartz ?? 0; for (let n = 0; n < days * 144 * 12; n++) { q.out.length = 0; tick(s, 1 / 12); } return ((s.made.quartz ?? 0) - a) / days; }; // tun za den; hromadu zkouška hned odváží
  const near = (x, y) => Math.abs(x - y) <= 0.08 * y + 0.5;
  const base = mine(), qSpd = ORES[1].speed ?? 1;
  assert.ok(near(base, H.rate * qSpd * 8) && staffed(q) === H.crew && near(boost(q), 1 / 3), `jedna směna vytěží ${base.toFixed(1)} t za den (${(H.rate * qSpd).toFixed(2)} t za hodinu práce)`);
  assert.ok(setStaff(s, q, 99) && q.staff === 3 * H.crew && boost(q) === 1 && near(mine(), 3 * base), 'tři směny jedou nepřetržitě');
  assert.ok(setStaff(s, q, 0) && mine(1) === 0 && q.st === 'staff', 'bez lidí se netěží');
  setStaff(s, q, H.crew);
  const up = Math.round(H.usd * 1.5), m0 = s.money;
  assert.ok(upgradeCost(q) === up && upgrade(s, q) && s.money === m0 - up && q.lv === 1 && near(boost(q), 0.5));
  assert.ok(near(mine(), 1.5 * base), 'první úroveň přidá polovinu výkonu');
  q.out = Array(40).fill('quartz'); // plná hromada: lom stojí a mzdy neběží
  const m1 = s.money;
  run(s, 60, 1 / 12);
  assert.ok(q.st === 'full' && s.money === m1, 'kdo nepracuje, nestojí nic');
  q.out.length = 0;
  const m2 = s.money, got = mine(1);
  assert.ok(Math.abs(m2 - s.money - (got * 6 + H.crew * WAGE_DAY)) < 0.05 * H.crew * WAGE_DAY + 12, `den práce jedné směny stál na mzdách ${Math.round(m2 - s.money - got * 6)} $`);
  // lepší stroj položený přes horší ho vymění (stejný druh a půdorys), platí se rozdíl
  assert.equal(canPlace(s, 'miner_u17', 22, -17), 'Nejdřív odemkni ve Stromu rozvoje');
  assert.equal(canPlace(s, 'glass_pot', 22, -17), 'Obsazeno');
  s.pts = 2;
  assert.ok(research(s, 'mine1') && swaps(s, q).map((f) => f.id).join() === 'miner_u17_used,miner_u17');
  q.out = ['quartz', 'quartz'];
  const m3 = s.money, same = must(place(s, 'miner_u17', 22, -17));
  assert.ok(same === q && q.model === 'miner_u17' && q.lv === 0 && staffed(q) === K.crew && q.out.length === 2 && s.list.filter((b) => b.k === 'miner').length === 1, 'tentýž lom, jen lepší stroj; hromada zůstala');
  assert.equal(m3 - s.money, K.usd - H.usd - up, 'platí se rozdíl a vylepšení starého se vrací');
  assert.ok(near(mine(), K.rate * qSpd * 8), 'minirypadlo těží svým výkonem');
  assert.equal(canPlace(s, 'quarry_hand', 22, -17), 'Vyměnit jde jen za lepší stroj téhož druhu a stejné velikosti');
  upgrade(s, q);
  const m4 = s.money;
  assert.ok(remove(s, q) && s.money === m4 + Math.round((K.usd + Math.round(K.usd * 1.5)) * resaleFactor(q)), 'zbourání vrací stroj i vylepšení');
  const old = JSON.parse(serialize(s)); // starší uložená hra bez lidí a úrovní
  old.list.push({ k: 'miner', model: 'quarry_hand', x: 22, y: -17, w: 2, h: 2, d: 0, acc: 0, out: [], rr: 0, oi: 0, cur: null, dep: 0, goal: 1, st: 'run' });
  const s2 = deserialize(JSON.stringify(old)), q2 = at(s2, 22, -17);
  run(s2, 144 * 2, 1 / 12);
  assert.ok(staffed(q2) === H.crew && near(boost(q2), 1 / 3) && s2.made.quartz >= 1, 'stará budova má jednu směnu');
});

test('kopce a hlušina: kolem Skladu je rovina, dál se terén zvedá; s nerostem se kope i hlušina', () => {
  const s = newGame({ seed: 4, sandbox: true }), H = s._world.height;
  let hi = 0, sea = 0, n = 0;
  for (let x = -600; x <= 600; x += 12) for (let y = -600; y <= 600; y += 12) {
    const h = H(x, y);
    assert.ok(h >= 0 && h < 80, `výška ${h}`);
    if (Math.hypot(x, y) < 88) assert.equal(h, 0, 'u Skladu je rovina');
    if (s._world.terrain(x, y) === 0) { n++; if (h > 0.01) sea++; }
    hi = Math.max(hi, h);
  }
  assert.ok(hi > 12 && n > 20 && sea === 0, `nejvyšší kopec ${hi.toFixed(1)} m, voda je v nule`);
  assert.ok(Math.abs(H(200, 200) - H(200.5, 200)) < 1.5, 'terén je spojitý');
  let hill = null;
  for (let x = 150; x < 600 && !hill; x += 7) for (let y = -300; y < 300 && !hill; y += 7) if (H(x, y) > 6 && s._world.terrain(x, y) !== 0) hill = [x, y];
  assert.equal(canPlace(s, 'hall', ...hill), 'Halu jde postavit jen na rovině');
  assert.equal(canPlace(s, 'hall', 30, 30), null);
  const q = must(place(s, 'quarry_hand', 22, -17));
  setStaff(s, q, 99);
  for (let i = 0; i < 12 * 450; i++) { tick(s, 1 / 12); if (q.out.length > 30) q.out.length = 0; }
  assert.ok(s.made.quartz >= 20 && Math.abs(s.made.spoil - s.made.quartz * 0.5) <= 1, `na ${s.made.quartz} t křemene vyšlo ${s.made.spoil} t hlušiny`);
  assert.ok(buildRoad(s, 'road1', planRoad(s, 'road1', { x: 22, y: -17 }, { x: 0, y: 0 })));
  for (let i = 0; i < 12 * 600; i++) tick(s, 1 / 12);
  assert.ok(s.got.spoil >= 10 && s.got.quartz >= 20 && q.st === 'run' && q.out.length < 30, `auta odvážejí nerost i hlušinu: do Skladu dojelo ${s.got.quartz} t křemene a ${s.got.spoil} t hlušiny`);
});

test('ložisko má konečné zásoby: rypadlo ho v dosahu vytěží a zastaví se', () => {
  const s = newGame({ seed: 4, sandbox: true });
  assert.equal(canPlace(s, 'miner_u17', 60, 60) ?? canPlace(s, 'miner_u17', -60, -60), 'V dosahu rypadla není žádné ložisko');
  const m = must(place(s, 'miner_u17', 22, -17));
  setStaff(s, m, 99); // tři směny: těží nepřetržitě
  must(place(s, 'depot', 24, -17)); // odvoz hned vedle
  const before = survey(s, 23, -16, 6, 0)[1];
  assert.ok(before >= 20 * SURF_T, `křemene v dosahu ${before} t`);
  for (let i = 0; i < 12 * 6 * (before / 5 + 50) && m.st !== 'empty'; i++) tick(s, 1 / 12);
  assert.equal(m.st, 'empty');
  const rest = survey(s, 23, -16, 6, 0)[1] ?? 0; // co zůstalo: jen to pod rypadlem a depem, tam se nekope
  assert.equal(s.made.quartz + rest, before, 'vytěžilo se všechno kromě toho pod budovami');
  assert.ok(rest >= 4 * SURF_T && rest <= 20 * SURF_T && oreAt(s, 23, -16) === 1 && s.dug[key(22, -17) * 8] === undefined);
  const pit = Object.keys(s.dug).map((k) => [Math.floor(k / 8 / 65536) - 32768, (Math.floor(k / 8) % 65536) - 32768])[0];
  assert.ok(s._pit.size >= 1 && oreAt(s, ...pit) === 0, 'vytěžená dlaždice je prázdná');
  assert.equal(canPlace(s, 'belt', ...pit), 'V jámě po těžbě stavět nejde');
  assert.ok(deserialize(serialize(s))._pit.size >= 1, 'jámy se po načtení zase vykreslí');
});

test('průzkumný vrt odkryje patra a hlubinný důl se k nerostu prorazí; hlouběji je těžba dražší', () => {
  const s = newGame({ seed: 4, sandbox: true });
  s._world.deep = (x, y, l) => (l === 2 && Math.abs(x - 100) < 4 && Math.abs(y - 100) < 4 ? 3 : 0); // měď jen ve 2. patře (100 m)
  const d = must(place(s, 'drill_lf90', 98, 98));
  run(s, 6 * 30, 1 / 12); // 30 hodin = 60 m
  assert.ok(d.dep > 55 && d.dep < 65 && d.st === 'run');
  assert.deepEqual(survey(s, 99, 99, 12, 1), {});
  assert.equal(survey(s, 99, 99, 12, 2)[3], 49 * 150);
  const m = must(place(s, 'shaft_st7', 102, 98));
  setStaff(s, m, 99); // tři směny: těží nepřetržitě
  must(place(s, 'depot', 107, 98));
  run(s, 6 * 120, 1 / 12);
  assert.equal(m.st, 'empty', 'v 1. patře nic není');
  m.goal = 2;
  const money = s.money;
  run(s, 6 * 120, 1 / 12);
  assert.ok(m.st === 'run' && s.made.ore_cu > 100, `měď ${s.made.ore_cu} t`);
  assert.ok(money - s.money > 50 * 6000 * 0.9, 'ražba dalších 50 m stála peníze');
  for (let i = 0; i < 12 * 6 * 400 && m.st !== 'empty'; i++) tick(s, 1 / 12); // i s opravami po poruchách
  assert.equal(m.st, 'empty');
  assert.equal(s.made.ore_cu, 49 * 150);
  const small = must(place(s, 'drill_small', 120, 98)); // malá souprava dosáhne jen do 100 m
  run(s, 6 * 90, 1 / 12);
  assert.ok(small.st === 'done' && Math.abs(small.dep - 100) < 1);
});

test('uložení a načtení zachová rozehranou hru; zbourání vrací peníze', () => {
  const s = dilna(7);
  const m = must(place(s, 'pnp_lumen', 5, 5));
  must(place(s, 'belt', 6, 5, 0)).it = 'coal';
  run(s, 1);
  const s2 = deserialize(serialize(s));
  assert.equal(s2.list.length, s.list.length);
  assert.equal(at(s2, 5, 5).model, 'pnp_lumen');
  assert.ok(s2._hall.size === s._hall.size && s2._hall.has(key(13, 8)), 'hala se uloží');
  run(s2, 1);
  const old = JSON.parse(serialize(s)); // uložená hra ze starší verze: položka a trasa, které katalog už nezná
  old.inv.zrusena = 3; old.autoBuy.zrusena = 5; old.list.push({ k: 'belt', x: 40, y: 40, d: 0, it: 'w:zrusena:1', p: 0 });
  const s3 = deserialize(JSON.stringify(old));
  run(s3, 1);
  assert.ok(!('zrusena' in s3.inv) && at(s3, 40, 40).it === null);
  const before = s.money;
  assert.ok(remove(s, m) && s.money === before + MODELS.pnp_lumen.usd && !at(s, 5, 5));
});

test('elektrárna: vlastní proud z uhlí jde nejdřív do strojů, přebytek se prodá do sítě', () => {
  const s = dilna(6);
  s.money = 1e7;
  const reflow = at(s, -4, -1);
  assert.equal(reflow.model, 'reflow_t962a');
  Object.assign(reflow, { job: { r: 'arduino_uno', i: 2, t: 0, T: 1e9 } }); s.mwh = 1;
  run(s, 6, 1 / 12); // jedna hodina práce stroje s příkonem 1,5 kW
  assert.ok(Math.abs(s.mwh - (1 - MODELS.reflow_t962a.kw / 1000)) < 1e-6, `ze zásobníku ubylo ${1 - s.mwh} MWh`);
  reflow.job = null;
  s.pts = 9;
  assert.ok(research(s, 'power1'));
  const p = must(place(s, 'power_1', 3, -3)); // těsně u Skladu: uhlí si bere sama
  p.build = 0; p.st = 'idle'; // v tomto testu zkoušíme rovnou výrobu elektřiny
  assert.ok(p.prod === 'power' && staffed(p) === MODELS.power_1.crew);
  setStaff(s, p, 99);
  s.inv.coal = 200; s.autoSell.coal = false; s.mwh = 0;
  run(s, 6 * 10, 1 / 12);
  assert.ok(s.gen >= 8 && s.gen <= 10.5, `za 10 hodin ${s.gen} MWh z 1 MW`);
  assert.ok(Math.abs(200 - s.inv.coal - (p.buf.coal ?? 0) - s.gen * COAL_PER_MWH) < COAL_PER_MWH + 1e-6, 'na MWh se spálí COAL_PER_MWH tun uhlí');
  const m0 = s.money;
  run(s, 6 * 20, 1 / 12);
  assert.ok(s.mwh <= GRID_MWH + 1e-9 && s.gen > GRID_MWH, 'zásobník má strop');
  assert.ok(s.rateIn > 0 && FEED_USD > 0 && s.money > m0 - 3 * WAGE_DAY * 2, 'přebytek se prodává');
});

test('poruchy: stroj se po odpracovaných hodinách porouchá, opravuje se a údržbář poruchy zředí', () => {
  const s = newGame({ seed: 4 });
  s.money = 1e7;
  const q = must(place(s, 'quarry_hand', 22, -17));
  setStaff(s, q, 99);
  let down = 0, sawText = '';
  const work = (hours) => { for (let i = 0; i < hours * 6 * 12; i++) { q.out.length = 0; tick(s, 1 / 12); if (q.st === 'broken') { down++; sawText ||= statusOf(s, q); } } };
  work(1500);
  const f1 = q.fails ?? 0;
  assert.ok(f1 >= 1 && f1 <= 7, `bez údržby ${f1} poruch za 1 500 h`);
  assert.ok(down > 0 && sawText.startsWith('Porucha') && repairCost(q) === Math.round(MODELS.quarry_hand.usd * 0.02));
  assert.ok(setMaint(s, q, true));
  work(1500);
  assert.ok((q.fails - f1) < f1 || f1 <= 1, `s údržbářem ${q.fails - f1} poruch`);
  const s2 = newGame({ seed: 4 }), q2 = must(place(s2, 'quarry_hand', 22, -17));
  setStaff(s2, q2, 99); s2.money = 1e7;
  for (let i = 0; i < 1500 * 6 * 12; i++) { q2.out.length = 0; tick(s2, 1 / 12); }
  assert.equal(q2.fails, f1, 'stejná hra = stejné poruchy');
});

test('výroba v halách má lidi a mzdy, fab bere chemii ze Skladu a sám ji dokupuje', () => {
  const s = dilna(8);
  s.pts = 9;
  assert.ok(research(s, 'fab0') && s.autoBuy.fabchem === 10, 'po odemčení fabu se chemie dokupuje sama');
  assert.ok(ROUTES.fab_i4004.ops.every((op) => op.opex === 0 && op.chem > 0), 've fabu je spotřební materiál zboží');
  s.autoBuy = {}; s.inv.fabchem = 0; s.inv.wafer100 = 5; s.tape.i4004 = true;
  const w = must(place(s, 'wet_hood', 3, -3));
  w.prod = 'fab_i4004';
  assert.ok(MODELS.wet_hood.crew === 1 && staffed(w) === 3 && hoursOf(w) === 24, 'výroba začíná na třech směnách');
  run(s, 3);
  assert.ok(w.st === 'miss' && w.miss === 'fabchem' && !w.job, 'bez chemie stojí');
  s.inv.fabchem = 1;
  const m0 = s.money;
  run(s, 3);
  assert.ok(w.job && s.inv.fabchem < 1 && s.money < m0, 'chemie se spotřebovala a lidé dostávají mzdu');
  setStaff(s, w, 0); w.job = null;
  run(s, 1);
  assert.equal(w.st, 'staff');
});

test('auta se kupují sama s rezervou, jezdí za naftu a ve svahu je silnice dražší', () => {
  const s = newGame({ seed: 2 });
  const q = must(place(s, 'quarry_hand', 22, -17));
  setStaff(s, q, 99);
  assert.ok(buildRoad(s, 'road1', planRoad(s, 'road1', { x: 22, y: -17 }, { x: 0, y: 0 })));
  const feed = (sec) => { for (let i = 0; i < 12 * sec; i++) { tick(s, 1 / 12); if (q.out.length < 30) q.out.push('quartz'); } };
  s.money = 100;
  feed(5);
  assert.ok(!q.cars.length && q.carWait, 'bez peněz auto nepřijede a panel to řekne');
  s.money = 5000;
  feed(300);
  assert.equal(q.cars.length, 1, 'první auto se koupí, na další není rezerva');
  assert.ok(CARS.car_pickup.km > 0 && CARS.car_dump.km > CARS.car_truck.km);
  const money = s.money, cars = q.cars.length;
  assert.ok(remove(s, q) && s.money === money + Math.round(MODELS.quarry_hand.usd * resaleFactor(q)) + cars * CARS.car_pickup.usd, 'auta se při zbourání prodají');
  // svah: najdi dlaždici v kopci
  let hill = null;
  for (let x = 150; x < 600 && !hill; x += 3) for (let y = -300; y < 300 && !hill; y += 3) if (grade(s, x, y) > 0.05 && s._world.terrain(x, y) !== 0 && !at(s, x, y)) hill = [x, y];
  s.money = 1e6; s.pts = 9;
  const m1 = s.money;
  must(place(s, 'road1', ...hill));
  assert.ok(Math.abs(m1 - s.money - LOGI.road1.usd * (1 + SLOPE_K * grade(s, ...hill))) < 1e-6, `ve sklonu ${Math.round(grade(s, ...hill) * 100)} % stojí metr ${Math.round(m1 - s.money)} $`);
  assert.ok(removeGround(s, ...hill) && Math.abs(s.money - m1) < 1e-6, 'zbourání vrací totéž');
});

test('zakázky, průběh peněz a stará uložená hra', () => {
  const s = newGame({ seed: 2, sandbox: true });
  s.made.coal = 100;
  run(s, DAY + 2, 1 / 12);
  const d = s.deal, npc = s.list.find((b) => b.k === 'npc' && b.x === d?.x && b.y === d?.y);
  assert.ok(d && d.it === 'coal' && d.n === 20 && npc?.t === 'power' && d.bonus === Math.round(d.n * ITEMS.coal.usd * npc.mul * DEAL_BONUS), `zakázka ${JSON.stringify(d)}`);
  assert.ok(s.hist.length >= 20, 'průběh peněz se zaznamenává po hodinách');
  const pts = s.pts;
  for (let i = 0; i < d.n; i++) { const t = must(place(s, 'belt', npc.x - 1, npc.y, 0)); t.it = 'coal'; t.p = 1; tick(s, 1 / 12); remove(s, t); } // uhlí po dopravníku přímo odběrateli
  run(s, 1);
  assert.ok(!s.deal && s.pts >= pts + 1 && s._fx.some((f) => f.deal === 'done' && f.usd === d.bonus), 'splněná zakázka přidá bod a prémii');
  const old = JSON.parse(serialize(s));
  for (const k of ['mwh', 'gen', 'hist', 'deal', 'dealAt']) delete old[k];
  const s2 = deserialize(JSON.stringify(old));
  run(s2, 1);
  assert.ok(s2.mwh === 0 && s2.hist.length >= 1 && s2.deal === null, 'stará hra dostane výchozí hodnoty');
});

test('realismus těžby a dopravy: tvrdost horniny, nafta rypadla, větrání v hloubce a mzda řidiče', () => {
  const s = newGame({ seed: 2, sandbox: true });
  s.money = 1e6;
  const q1 = must(place(s, 'quarry_hand', 22, -17)); // křemen (tvrdý)
  const q2 = must(place(s, 'quarry_hand', -28, 18)); // uhlí (měkčí)
  setStaff(s, q1, 99); setStaff(s, q2, 99);
  for (let i = 0; i < 12 * 120; i++) { q1.out.length = 0; q2.out.length = 0; tick(s, 1 / 12); }
  assert.ok((s.made.coal ?? 0) >= (s.made.quartz ?? 0) * 1.8, `uhlí (${s.made.coal} t) se těží výrazně rychleji než křemen (${s.made.quartz} t)`);
  assert.ok(MODELS.miner_u17.fuel > 0 && MODELS.miner_cat320.fuel > MODELS.miner_u17.fuel, 'rypadla mají spotřebu nafty');
  assert.ok(CARS.car_pickup.driver > 0 && CARS.car_pickup.km > CARS.car_pickup.driver, 'auta počítají mzdu řidiče i naftu');
  assert.ok(MODELS.shaft_small.sink >= 8000 && MODELS.shaft_small.powerPerLv > 0, 'šachta má reálnou cenu hloubení a spotřebu v hloubce');
  // úvěry, tarify, rekultivace, kolísání cen a odpisy
  const s3 = newGame({ seed: 5 });
  const mStart = s3.money;
  assert.ok(takeLoan(s3, 10000) && s3.money === mStart + 10000 && s3.loan === 10000);
  run(s3, DAY + 1, 1 / 4);
  assert.ok(s3.loan > 10000, 'úvěr nabíhá denní úrok');
  assert.ok(repayLoan(s3, 5000) && s3.loan < 10000);
  assert.ok(powerTariff(12 * HOUR) === 1.25 && powerTariff(2 * HOUR) === 0.625, 'denní a noční tarif v poměru 2:1');
  assert.ok(Object.keys(s3.mkt).length > 0, 'tržní ceny surovin a křemíku kolísají po dnech');
  // rekultivace jámy
  s3.dug[key(30, 30) * 8] = SURF_T;
  const beforeRec = s3.money;
  assert.ok(reclaim(s3, 30, 30) && s3.money === beforeRec - RECLAIM_USD && !(key(30, 30) * 8 in s3.dug));
  // odpisy starého stroje
  assert.ok(resaleFactor({ age: 10 }) === 1 && resaleFactor({ age: 1500 }) < 0.7 && resaleFactor({ age: 5000 }) === 0.45);
});

test('doba stavby velkých staveb: v normální hře se staví několik dní, v sandboxu ihned', () => {
  for (const id of ['power_1', 'power_20', 'glass_tank', 'arc_furnace', 'siemens_line', 'litho_nsr2205', 'litho_nxe3600']) {
    assert.ok(MODELS[id].buildDays >= 2, `${id} má mít buildDays >= 2`);
  }
  const s = dilna(4);
  s.money = 1e9; s.pts = 999;
  assert.ok(research(s, 'power1'));
  const p = must(place(s, 'power_1', 3, -3));
  assert.equal(p.build, MODELS.power_1.buildDays * 24);
  assert.equal(p.st, 'build');
  assert.match(statusOf(s, p), /Staví se:/);
  s.inv.coal = 200; s.autoSell.coal = false; s.mwh = 0;
  setStaff(s, p, 99);
  run(s, 6 * 10, 1 / 12); // prvních 10 hodin stavby ještě nevyrábí
  assert.equal(s.gen, 0, 'během stavby elektrárna nevyrábí');
  assert.equal(p.st, 'build');
  assert.ok(Math.abs(p.build - (MODELS.power_1.buildDays * 24 - 10)) < 1e-6);
  // doběhne zbytek stavby + pár hodin výroby
  run(s, 6 * (MODELS.power_1.buildDays * 24 - 10 + 5), 1 / 12);
  assert.equal(p.build, 0);
  assert.notEqual(p.st, 'build');
  assert.ok(s.gen > 0, 'po dokončení stavby elektrárna vyrábí');
  // v sandboxu je stavba okamžitá
  const sb = newGame({ seed: 4, sandbox: true });
  const p2 = must(place(sb, 'power_1', 3, -3));
  assert.equal(p2.build, 0);
  assert.notEqual(p2.st, 'build');
});

test('průzkumný vrt: jádrové vrtání vs levné a rychlé RC vrtání s odhadem ±30 %', () => {
  const s = dilna(4);
  s.money = 1e7; s.pts = 99;
  assert.ok(research(s, 'survey'));
  const md = MODELS.drill_small;
  // najdeme souřadnice s rudou v hloubce 50 m (patro 1), aby drillSurvey měl co vracet
  let dx = 22, dy = -17;
  for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) {
    if (Object.keys(survey(s, x, y, md.reach, 1)).length > 0 && !at(s, x, y)) { dx = x; dy = y; break; }
  }
  const dCore = must(place(s, 'drill_small', dx, dy));
  assert.equal(dCore.rc, false);
  assert.match(statusOf(s, dCore), /jádrově/);
  const m0 = s.money;
  run(s, 6 * 10, 1 / 12); // 10 hodin jádrového vrtání
  const depCore = dCore.dep, costCore = m0 - s.money;
  assert.ok(Math.abs(depCore - md.rate * 10) < 1e-4);
  const expCore = (KINDS.m_drill.opex * md.rate + md.fuel * DIESEL.usd) * 10;
  assert.ok(Math.abs(costCore - expCore) < 1e-3, `jádrové vrtání stálo ${costCore}, čekáno ${expCore}`);
  // přesné zásoby
  const [cx, cy] = [dCore.x + (dCore.w >> 1), dCore.y + (dCore.h >> 1)];
  const exact = survey(s, cx, cy, md.reach, 1);
  assert.deepEqual(drillSurvey(s, dCore, 1), exact);

  // přepnutí na RC vrtání: 2× rychlejší, 45 $/m, odhad ±30 %
  assert.ok(setDrillMode(s, dCore, true));
  assert.equal(dCore.rc, true);
  assert.match(statusOf(s, dCore), /RC/);
  const m1 = s.money, dep1 = dCore.dep;
  run(s, 6 * 10, 1 / 12); // 10 hodin RC vrtání
  const depRC = dCore.dep - dep1, costRC = m1 - s.money;
  assert.ok(Math.abs(depRC - md.rate * 2 * 10) < 1e-4, 'RC vrtá 2× rychleji');
  const expRC = (RC_OPEX * md.rate * 2 + md.fuel * DIESEL.usd) * 10;
  assert.ok(Math.abs(costRC - expRC) < 1e-3, `RC vrtání stálo ${costRC}, čekáno ${expRC}`);
  const est = drillSurvey(s, dCore, 1);
  for (const o in exact) {
    assert.ok(est[o] >= Math.floor(exact[o] * 0.7) && est[o] <= Math.ceil(exact[o] * 1.3), `RC odhad ${est[o]} mimo ±30 % z ${exact[o]}`);
  }
  assert.equal(isPit(s, 30, 30), false);
});

test('1-klik továrny, doly, Sklad a hromadné vylepšování fungují end-to-end', () => {
  const s = newGame({ id: 'free', sandbox: true });
  const hq = s.list.find((b) => b.hq);
  assert.ok(hq, 'HQ Sklad musí existovat');
  assert.ok(upgradeCost(hq) > 0, 'Sklad má cenu vylepšení');
  assert.ok(upgrade(s, hq), 'Sklad jde vylepšit');
  assert.equal(hq.lv, 1);
  setStaff(s, hq, 6);
  assert.equal(staffed(hq), 6);

  const dr = must(place(s, 'drill_small', 22, -17));
  assert.ok(upgradeCost(dr) > 0 && upgrade(s, dr), 'Vrt jde vylepšit');

  const mine = buildMineWithRoad(s, 'coal');
  assert.ok(!mine.err && mine.b, `Automatický uhelný důl + silnice selhal: ${mine.err}`);
  assert.ok(pathOf(s, mine.b, hq), 'Cesta z dolu do Skladu existuje');

  const ard = buildFactory(s, 'arduino_uno');
  assert.ok(!ard.err && ard.b, `Továrna arduino_uno selhala: ${ard.err}`);
  hireAllStaff(s);
  upgradeAll(s);
  maintAll(s);
  connectAllRoads(s);
  expandHall(s, 10, 8, false);
  run(s, 6 * 48, 1 / 12);
  assert.ok((s.made.arduino_uno ?? 0) >= 1, 'Továrna na Arduino Uno musí po simulaci vyrobit první kusy');

  const s2 = newGame({ id: 'l1' });
  s2.pts = 500;
  const deep = RESEARCH.find((r) => r.req.length && !s2.research.includes(r.id) && r.req.some((q) => RESEARCH.find((x) => x.id === q)?.req.length));
  assert.ok(deep && unlockWithReqs(s2, deep.id), 'unlockWithReqs odemkne celý strom předpokladů');
  assert.ok(s2.research.includes(deep.id), 'Cílový výzkum byl odemčen');

  const s3 = newGame({ id: 'free', sandbox: true });
  const fab = buildFactory(s3, 'fab_i4004');
  assert.ok(!fab.err && fab.b, `Továrna fab_i4004 selhala: ${fab.err}`);
  assert.ok(finishBuildNow(s3, fab.b) || fab.b.build === 0);
  fixBrokenNow(s3, fab.b);
});

test('uhelný důl napojený jen na Teplárnu nezasekne hromada hlušiny (spoil) a plynule prodává uhlí', () => {
  const s = newGame({ seed: 4, sandbox: true });
  const plant = s.list.find((b) => b.k === 'npc' && b.t === 'power');
  assert.ok(plant, 'Teplárna musí existovat');
  // najdi uhelné ložisko mimo Sklad, spoj pouze s Teplárnou (nikam do Skladu)
  const mine = must(place(s, 'miner_u17', -28, 18));
  setStaff(s, mine, 99);
  const plan = planRoad(s, 'road1', { x: mine.x, y: mine.y }, { x: plant.x, y: plant.y });
  assert.ok(plan && buildRoad(s, 'road1', plan), 'Silnice k Teplárně musí jít postavit');
  assert.ok(pathOf(s, mine, plant), 'pathOf vidí cestu k Teplárně');
  run(s, 6 * 36, 1 / 12);
  assert.ok((s.made.coal ?? 0) >= 25 && (s.made.spoil ?? 0) >= 75, `Vytěženo ${s.made.coal} t uhlí a ${s.made.spoil} t hlušiny`);
  assert.ok((s.out.coal ?? 0) >= 20, `Do Teplárny se prodalo jen ${s.out.coal ?? 0} t uhlí`);
  assert.notEqual(mine.st, 'full', 'Hromada se nesmí zaseknout ve stavu full kvůli hlušině');
});

test('polní sklad (dump) jde postavit od začátku i na jámě vedle dolu, ukládá hlušinu a nechá auta vozit uhlí do Teplárny', () => {
  // 1. od startu je odemčený a jde postavit přes vykopanou jámu hned vedle lomu
  const s0 = newGame({ seed: 4 });
  assert.equal(canPlace(s0, 'dump', 30, 30), null, 'Polní sklad je odemčený hned od začátku');
  s0.dug[key(30, 30) * 8] = SURF_T;
  assert.equal(canPlace(s0, 'dump', 30, 30), null, 'Polní sklad lze postavit i v nakopané jámě vedle dolu');

  // 2. důl napojený silnicí do Teplárny dostane buildDumpNextTo -> hlušina jde do skladu (s.got.spoil), uhlí dál vozí auta do Teplárny
  const s = newGame({ seed: 4, sandbox: true });
  const plant = s.list.find((b) => b.k === 'npc' && b.t === 'power');
  const mine = must(place(s, 'miner_u17', -28, 18));
  setStaff(s, mine, 99);
  const plan = planRoad(s, 'road1', { x: mine.x, y: mine.y }, { x: plant.x, y: plant.y });
  assert.ok(plan && buildRoad(s, 'road1', plan));

  // nasimuluj ucpanou hromadu hlušinou před postavením skladu
  mine.out = Array(40).fill('spoil');
  mine.st = 'full';
  const res = buildDumpNextTo(s, mine);
  assert.ok(res.ok && res.hub?.dump && mine._adj?.hub === res.hub, `Sklad vedle dolu se nepodařilo postavit: ${res.err}`);
  assert.equal(mine.out.length, 0, 'Hlušina z ucpané hromady se ihned přesunula do polního skladu');
  assert.equal(mine.st, 'run', 'Důl se ihned odblokoval');

  s.autoSell.spoil = false; // hráč si chce hlušinu nechat ve skladu
  run(s, 6 * 36, 1 / 12);
  assert.ok((s.got.spoil ?? 0) >= 80 && (s.inv.spoil ?? 0) >= 80, `Hlušina se ukládá do skladu (got=${s.got.spoil}, inv=${s.inv.spoil})`);
  assert.ok((s.out.coal ?? 0) >= 20, `Auta stále vozí uhlí po silnici do Teplárny (prodáno ${s.out.coal} t)`);
  assert.notEqual(mine.st, 'full');
  const saved = deserialize(serialize(s));
  assert.ok(saved.list.some((b) => b.dump), 'Polní sklad se uloží a načte');
  assert.ok(remove(saved, saved.list.find((b) => b.dump)), 'Polní sklad lze zbourat');
});

test('5 úrovní vylepšení, moduly budov (auto/cool/cap) a povýšení na větší model', () => {
  const s = newGame({ seed: 4 });
  s.pts = 99; s.money = 1e8;
  unlockWithReqs(s, LOGI.depot.req);
  const hq = s.list.find((b) => b.hq);
  const q = must(place(s, 'quarry_hand', 22, -17));
  const dp = must(place(s, 'depot', -12, -10));

  // 1. 5 úrovní vylepšení (lv 0 -> 4) a jejich bonusy (dosah, auta, rezerva, poplatek depa)
  assert.equal(UPG.length, 4);
  assert.equal(upgradeMax(s, q), 4, 'Lom lze vylepšit až na úroveň 5 (lv=4)');
  assert.equal(q.lv, 4);
  assert.equal(upgradeCost(q), null);
  assert.equal(reachOf(q), MODELS.quarry_hand.reach + 4, 'Každá úroveň přidá +1 m dosahu');
  assert.equal(maxCarsOf(q), MAXCARS + 4, 'Každá úroveň přidá +1 max auto');

  assert.equal(upgradeMax(s, hq), 4);
  assert.equal(reserveOf(s), RESERVE * 3, 'Úroveň 5 Skladu drží 3× základní rezervu surovin');
  assert.equal(depotFeeOf(dp), DEPOT_FEE);
  assert.equal(upgradeMax(s, dp), 4);
  assert.equal(depotFeeOf(dp), 0, 'Úroveň 5 depa sníží manipulační poplatek až na 0 $/t');

  // 2. Moduly budov (auto, cool, cap), jejich bonusy, refundace a serializace
  assert.equal(modCost(hq, 'auto'), null, 'Sklad nepovoluje nesmyslný modul automatizace');
  assert.ok(installMod(s, hq, 'cap') && hasMod(hq, 'cap'));
  assert.equal(reserveOf(s), RESERVE * 6, 'Modul zásobníků zdvojnásobí rezervu Skladu');

  setStaff(s, q, MODELS.quarry_hand.crew); // 1 směna = 8 h
  assert.equal(hoursOf(q), 8);
  assert.ok(installMod(s, q, 'auto') && !installMod(s, q, 'auto'));
  assert.equal(hoursOf(q), 16, 'Automatizace zdvojnásobí odpracované hodiny na směnu');
  assert.ok(Math.abs(boost(q) - (16 / 24) * 3 * 1.25) < 1e-9, 'Automatizace přidá +25 % rychlosti');

  assert.ok(installAllMods(s) >= 2, 'installAllMods doinstaluje zbývající moduly cool a cap');
  assert.equal(installAllMods(s), 0);
  assert.ok(hasMod(q, 'cool') && hasMod(q, 'cap'));
  assert.equal(pileOf(q), PILE * 2, 'Modul cap zdvojnásobí kapacitu hromady');
  assert.equal(maxCarsOf(q), MAXCARS + 4 + 2, 'Modul cap přidá +2 nákladní auta');

  // Modul cool zkrátí opravu na polovinu (FIX_H / 2)
  q.age = 0; q.mtbf = 1; q.wear = 0.99; q.fails = 0;
  tick(s, 1);
  assert.ok(q.fails >= 1 && q.fix > 0 && q.fix <= FIX_H / 2, `Chladicí modul zkrátil opravu na <= ${FIX_H / 2} h (bylo ${q.fix})`);

  // Serializace zachová úroveň i moduly; zbourání vrátí podíl ceny modulů
  const rt = deserialize(serialize(s)), qRt = at(rt, q.x, q.y);
  assert.ok(qRt.lv === 4 && ['auto', 'cool', 'cap'].every((id) => hasMod(qRt, id)), 'Úroveň i moduly se uloží a načtou');
  const paidQ = UPG.reduce((a, k) => a + Math.round(MODELS.quarry_hand.usd * k), 0)
    + Object.keys(MODS).reduce((a, id) => a + modCost(q, id), 0);
  const mBefore = s.money;
  assert.ok(remove(s, q));
  assert.equal(s.money - mBefore, Math.round((MODELS.quarry_hand.usd + paidQ) * resaleFactor(q)), 'Zbourání vrací i cenu modulů');

  // 3. Povýšení napříč rozměry: miner_u17 (2x2) -> miner_cat320 (4x4) a dump (2x2) -> depot (4x4)
  const s2 = newGame({ seed: 4 });
  s2.pts = 99; s2.money = 1e8;
  assert.ok(research(s2, 'mine1'));
  const m2 = must(place(s2, 'miner_u17', 22, -17));
  assert.equal(evolutions(s2, m2).length, 0);
  assert.equal(upgradeModelErr(s2, m2, 'miner_cat320'), 'Nejdřív odemkni ve Stromu rozvoje');
  unlockWithReqs(s2, MODELS.miner_cat320.req);
  assert.deepEqual(evolutions(s2, m2).map((f) => f.id), ['miner_cat320']);
  assert.ok(upgrade(s2, m2) && installMod(s2, m2, 'auto'));
  const baseDiff = MODELS.miner_cat320.usd - MODELS.miner_u17.usd;
  assert.ok(upgradeModelCost(s2, m2, 'miner_cat320') < baseDiff, 'Cena povýšení odečte dřívější vylepšení a moduly');
  const rEvo = upgradeModel(s2, m2, 'miner_cat320');
  assert.ok(rEvo.ok && m2.model === 'miner_cat320' && m2.w === 4 && m2.h === 4 && m2.lv === 0 && m2.mods.length === 0);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.equal(at(s2, m2.x + i, m2.y + j), m2, 'Nový 4×4 důl správně zabírá mřížku');

  // Polní sklad (dump 2x2) -> Logistické depo (depot 4x4), vč. ošetření těsné překážky
  unlockWithReqs(s2, LOGI.depot.req);
  const d = must(place(s2, 'dump', -20, -18));
  assert.deepEqual(evolutions(s2, d).map((f) => f.id), ['depot']);
  const rDepot = upgradeModel(s2, d, 'depot');
  assert.ok(rDepot.ok && !d.dump && d.w === 4 && d.h === 4, 'Polní sklad se přestavěl na Logistické depo 4×4');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.equal(at(s2, d.x + i, d.y + j), d);
});
