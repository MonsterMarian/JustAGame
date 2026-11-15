// Zvuky syntetizované přes WebAudio (žádné soubory): krátké cvaknutí relé, mince, chyba, fanfára.
let ctx = null;
export const audio = { on: localStorage.getItem('myc_sound') !== '0' };
function tone(freq, t0, dur, type = 'square', vol = 0.05) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
  o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur);
}
const SFX = {
  place: () => { tone(1800, 0, 0.012, 'square', 0.04); tone(240, 0.004, 0.03, 'triangle', 0.06); },
  remove: () => tone(140, 0, 0.06, 'sawtooth', 0.04),
  error: () => { tone(110, 0, 0.09, 'sawtooth', 0.05); tone(98, 0.07, 0.1, 'sawtooth', 0.05); },
  coin: () => { tone(1320, 0, 0.05, 'sine', 0.05); tone(1760, 0.05, 0.09, 'sine', 0.05); },
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.14, 'triangle', 0.06)),
  click: () => tone(900, 0, 0.01, 'square', 0.025),
};
export function sfx(name) {
  if (!audio.on) return;
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); SFX[name]?.(); } catch { /* bez zvukové karty hra běží dál */ }
}
