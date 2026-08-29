/* Custom fantasy draft scoring engine (Caleb 8/29).
 *
 *   node scripts/draft_score.js [list_name]     (default caleb-4qx)
 *
 * Reads draft_config.weights (usage/env/hvt/talent + pos_factor) + draft_metrics,
 * computes the 0-100 custom score, and REWRITES the target list's order in
 * draft_players — the personal link's rankings panel simply becomes the strategy.
 * Re-run after any metrics refresh or weight tweak; scoring logic never needs
 * the app rebuilt. Kacie's and the league lists are never touched.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('../node_modules/@supabase/supabase-js');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

const LIST = process.argv[2] || 'caleb-4qx';
const DEFAULT_POS_FACTOR = { QB: 0.80, K: 0.35, 'D/ST': 0.40, TE: 0.95 };  // 10-team 1-QB: wait on QB/TE, punt K/DST

(async () => {
  const { data: cfgRow } = await sb.from('draft_config').select('weights').eq('id', LIST).maybeSingle();
  const w = { usage: 0.4, env: 0.3, hvt: 0.2, talent: 0.1, ...(cfgRow?.weights || {}) };
  const posFactor = { ...DEFAULT_POS_FACTOR, ...(w.pos_factor || {}) };

  const page = async (q) => { let all = [], off = 0; for (;;) { const { data } = await q.range(off, off + 999); all = all.concat(data || []); if (!data || data.length < 1000) break; off += 1000; } return all; };
  const players = await page(sb.from('draft_players').select('*').eq('list_name', LIST).order('rk'));
  const metrics = await page(sb.from('draft_metrics').select('*'));
  const mByName = Object.fromEntries(metrics.map(m => [m.player, m]));

  const scored = players.map(p => {
    const m = mByName[p.player] || {};
    const base = (m.usage_score ?? 30) * w.usage + (m.env_score ?? 30) * w.env
               + (m.hvt_score ?? 25) * w.hvt + (m.talent_score ?? 30) * w.talent;
    // elite-usage TEs keep full value (McBride/Bowers rule); everyone else takes the positional haircut
    let f = posFactor[p.pos] ?? 1;
    if (p.pos === 'TE' && (m.usage_score ?? 0) >= 90) f = 1;
    return { ...p, score: Math.round(base * f * 10) / 10, m };
  }).sort((a, b) => b.score - a.score || a.rk - b.rk);

  console.log(`list=${LIST}  weights=${JSON.stringify(w)}\n`);
  scored.slice(0, 40).forEach((p, i) =>
    console.log(`${String(i + 1).padStart(3)} ${p.player.padEnd(26)} ${String(p.pos).padEnd(5)} ${String(p.score).padStart(5)}  adp ${String(p.m.adp ?? '-').padStart(3)}  ${p.m.label || ''}${p.m.colts ? ' 🏠' : ''}`));

  if (process.argv.includes('--dry')) { console.log('\n(dry run — no writes)'); return; }
  // tiers from score gaps: a drop of 3+ points starts a new tier (cap 16) — so the
  // tier headers follow THIS order, not the source sheet's (Caleb 8/29)
  let tier = 1, n = 0;
  for (let i = 0; i < scored.length; i++) {
    if (i > 0 && scored[i - 1].score - scored[i].score >= 3 && tier < 16) tier++;
    const want = i + 1;
    if (scored[i].rk !== want || scored[i].tier !== tier) {
      await sb.from('draft_players').update({ rk: want, tier }).eq('id', scored[i].id); n++;
    }
  }
  console.log(`\nrewrote ${n} ranks/tiers on ${LIST}`);
})();
