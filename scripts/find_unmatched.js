/* Yearly maintenance helper: surface likely cross-broker matches the auto-rules missed,
 * so you can add a one-line entry to scripts/broker_aliases.json (which persists every year).
 *
 *   node scripts/parse_broker_quotes.js --json /tmp/broker_prices.json
 *   node scripts/find_unmatched.js [/tmp/broker_prices.json] [supplierFilter]
 *
 * Reports, per supplier+form, single-broker keys whose tokens are a subset of (or one token
 * off from) a key in another broker — i.e. the same plant named slightly differently. Shows the
 * raw names so you can judge and, if real, alias the longer/odd one to the shorter canonical.
 */
const fs = require('fs');
const all = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/broker_prices.json', 'utf8'));
const supFilter = (process.argv[3] || '').toLowerCase();

const toks = k => k.split(' ').slice(1); // drop genus
function relation(a, b) {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (A.size === 0 || B.size === 0) return null;
  let common = 0; A.forEach(x => { if (B.has(x)) common++; });
  const small = Math.min(A.size, B.size), big = Math.max(A.size, B.size);
  if (common === small && small < big) return 'subset';                 // one is contained in the other
  if (big - common === 1 && small - common <= 1 && common >= 1) return 'one-off';
  return null;
}

// index keys by supplier+form -> broker -> [keys]; and key -> sample raw name per broker
const idx = {}, sample = {};
for (const r of all) {
  if (supFilter && r.supplier.toLowerCase() !== supFilter) continue;
  const g = `${r.supplier}|${r.formClass}`;
  ((idx[g] = idx[g] || {})[r.broker] = idx[g][r.broker] || new Set()).add(r.key);
  sample[r.key + '|' + r.broker] = r.variety;
}

const out = [];
for (const g in idx) {
  const brokers = Object.keys(idx[g]);
  if (brokers.length < 2) continue;
  for (let i = 0; i < brokers.length; i++) for (let j = 0; j < brokers.length; j++) {
    if (i === j) continue;
    const A = [...idx[g][brokers[i]]], Bset = idx[g][brokers[j]];
    for (const a of A) {
      if (Bset.has(a)) continue;                 // already matches
      let best = null, rel = null;
      for (const b of Bset) { if (idx[g][brokers[i]].has(b)) continue; const rl = relation(a, b); if (rl) { best = b; rel = rl; break; } }
      if (best) out.push({ g, rel, a, b: best, an: sample[a + '|' + brokers[i]], bn: sample[best + '|' + brokers[j]], ba: brokers[i], bb: brokers[j] });
    }
  }
}
// dedupe symmetric pairs
const seen = new Set(), rows = [];
for (const o of out) { const id = [o.a, o.b].sort().join('||'); if (seen.has(id)) continue; seen.add(id); rows.push(o); }
rows.sort((x, y) => x.g.localeCompare(y.g));
console.log(`likely-same-plant pairs across brokers (${rows.length}) — review and alias the ones that are real:\n`);
for (const o of rows) console.log(`  [${o.g}] ${o.rel.padEnd(6)}  ${o.ba}:"${o.an}"  ~  ${o.bb}:"${o.bn}"`);
