// Sloučí rešerši cen (data/research/*.json) do data/prices.js, který čte herní katalog.
// Spuštění: node tools/merge-research.mjs. Položka je 'doc' jen s platnou adresou zdroje, jinak 'estimate'.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data/research');
const ALIAS = { power_mosfet: 'mosfet' }; // rešerše čipů a materiálů pojmenovala totéž různě
const NUM = ['usd', 'launch_usd', 'die_mm2', 'transistors', 'year', 'rate', 'kw', 'pins'], STR = ['src', 'note', 'node', 'package', 'unit'];
const out = {};
let files = 0;
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : []) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { console.error(`PŘESKOČENO ${f}: ${e.message}`); continue; }
  if (!Array.isArray(arr)) { console.error(`PŘESKOČENO ${f}: není pole`); continue; }
  files++;
  for (const e of arr) {
    if (!e || typeof e.id !== 'string') continue;
    const c = {};
    for (const k of NUM) if (typeof e[k] === 'number' && Number.isFinite(e[k]) && e[k] > 0) c[k] = e[k];
    for (const k of STR) if (typeof e[k] === 'string' && e[k].trim()) c[k] = e[k].trim();
    if (c.src && !/^https?:\/\//.test(c.src)) delete c.src;
    c.fact = e.fact === 'doc' && c.src ? 'doc' : 'estimate';
    const id = ALIAS[e.id] ?? e.id;
    out[id] = { ...(out[id] ?? {}), ...c };
  }
}
const ids = Object.keys(out).sort();
fs.writeFileSync(path.join(root, 'data/prices.js'),
  `// GENEROVÁNO: tools/merge-research.mjs z data/research/*.json (rešerše cen). Neupravovat ručně.\nexport default ${JSON.stringify(Object.fromEntries(ids.map((i) => [i, out[i]])), null, 1)};\n`);
console.log(`${files} souborů, ${ids.length} položek, z toho doloženo ${ids.filter((i) => out[i].fact === 'doc').length}`);
