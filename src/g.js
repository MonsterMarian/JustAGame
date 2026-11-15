// Sdílený stav aplikace (hra, kamera, vybraný nástroj) pro main.js, world3d.js a ui.js.
export const CAM0 = { x: 16, y: -16, z: 8.5, yaw: -0.35, pitch: 0.95 }; // pohled na začátku hry: dílna, křemen i Sklárna v jednom záběru
export const G = {
  s: null, // stav hry ze sim.js
  cam: { ...CAM0 }, // cíl pohledu v metrech, z = přiblížení (vzdálenost kamery = 900 / z m), natočení a sklon v radiánech
  tool: null, // id stavby ze stavebního menu, 'demolish', nebo null
  rot: 0, sel: null, hover: null, speed: 1, lastSpeed: 1, time: 0,
  fly: null, // cíl plynulého přeletu kamery { x, y, z }
  mark: null, // místo, na které ukazuje průvodce { x, y, w, h, top }
  rect: null, // tažený obdélník haly nebo čistého prostoru { a, b }
  inside: true, // střechy hal jsou otevřené
  moved: false, // hráč už pohnul pohledem (první krok průvodce)
  under: false, // pohled pod zem: povrch průhledný, vidět jsou patra odkrytá vrtem nebo dolem
  hot: null, // budova pod kurzorem, na kterou jde kliknout
};
export const fmt = (n) => {
  const a = Math.abs(n), sgn = n < 0 ? '−' : '';
  if (a >= 1e9) return `${sgn}${(a / 1e9).toFixed(2).replace('.', ',')} mld. $`;
  if (a >= 1e6) return `${sgn}${(a / 1e6).toFixed(2).replace('.', ',')} mil. $`;
  return `${sgn}${Math.round(a).toLocaleString('cs-CZ')} $`;
};
export const num = (n, d = 0) => n.toLocaleString('cs-CZ', { maximumFractionDigits: d });
