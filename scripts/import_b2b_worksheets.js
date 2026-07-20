/* Import the filled Caleb+Mario worksheets back into the B2B data core.
 *   node scripts/import_b2b_worksheets.js items "<b2b-item-worksheet.csv>" [--apply]
 *   node scripts/import_b2b_worksheets.js templates "<b2b-templates-worksheet.csv>" [--apply]
 * items: tier_final → product_profiles.tier · category_fix → profiles.category (+ category_map
 *        by genus when consistent) · popular_rank → popular_items pools (Spring 2027).
 * templates: rows → customer_type_templates (EXAMPLE rows skipped). Dry-run by default. */
const fs = require('fs'), path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));
const [mode, file] = [process.argv[2], process.argv[3]];
const apply = process.argv.includes('--apply');
const PLAN = 'd2360134-0fbb-4548-af2f-5cc3ccd590c6'; // Spring 2027
if (!mode || !file) { console.error('usage: import_b2b_worksheets.js items|templates <csv> [--apply]'); process.exit(1); }
const env = {}; for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
function parseCSV(t) { const rows = []; let f = [], cur = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { f.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; f.push(cur); if (f.some(x => x.trim())) rows.push(f); f = []; cur = ''; } else cur += c; } if (cur || f.length) { f.push(cur); if (f.some(x => x.trim())) rows.push(f); } return rows; }
const TIERS = ['value', 'standard', 'premium'];

(async () => {
  const rows = parseCSV(fs.readFileSync(file, 'utf8'));
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  const col = n => hdr.findIndex(h => h.startsWith(n));
  const get = (r, n) => { const i = col(n); return i >= 0 ? (r[i] || '').trim() : ''; };

  if (mode === 'items') {
    let tiers = 0, cats = 0, ranks = 0, bad = [];
    const poolRows = [];
    for (const r of rows.slice(1)) {
      const sku = get(r, 'sku'); if (!sku) continue;
      const { data: pi } = await sb.from('production_items').select('id, product_profiles(id, category)').eq('sku', sku).single();
      if (!pi || !pi.product_profiles) { bad.push(sku); continue; }
      const profId = pi.product_profiles.id;
      const tier = get(r, 'tier_final').toLowerCase();
      const catFix = get(r, 'category_fix').toLowerCase().replace(/\s+/g, '_');
      const rank = parseInt(get(r, 'popular_rank'), 10);
      const upd = {};
      if (TIERS.includes(tier)) { upd.tier = tier; tiers++; }
      if (catFix) { upd.category = catFix; cats++; }
      if (Object.keys(upd).length && apply) await sb.from('product_profiles').update(upd).eq('id', profId);
      if (rank >= 1) { poolRows.push({ plan_id: PLAN, category: catFix || get(r, 'category') || pi.product_profiles.category, product_profile_id: profId, rank, curated_by: 'worksheet' }); ranks++; }
    }
    if (apply && poolRows.length) {
      await sb.from('popular_items').delete().eq('plan_id', PLAN).eq('curated_by', 'worksheet');
      for (let i = 0; i < poolRows.length; i += 200) await sb.from('popular_items').insert(poolRows.slice(i, i + 200));
    }
    console.log(`${apply ? 'APPLIED' : 'DRY'} — tiers set: ${tiers} · categories fixed: ${cats} · pool entries: ${ranks} · unknown skus: ${bad.length}${bad.length ? ' (' + bad.slice(0, 5).join(', ') + '…)' : ''}`);
  }

  if (mode === 'templates') {
    let made = 0;
    for (const r of rows.slice(1)) {
      const name = get(r, 'template_name');
      if (!name || name.toUpperCase().startsWith('EXAMPLE')) continue;
      const posture = get(r, 'tier_posture').toLowerCase();
      const mix = {}, sizes = {};
      hdr.forEach((h, i) => {
        if (h.startsWith('pct_')) { const v = parseFloat(r[i]); if (v > 0) mix[h.slice(4)] = v; }
        if (h.startsWith('size_ratio_')) { const v = parseFloat(r[i]); if (v > 0) sizes[h.slice(11).replace(/\(.*/, '')] = v; }
      });
      if (apply) await sb.from('customer_type_templates').upsert({ name, tier_posture: TIERS.concat('mixed').includes(posture) ? posture : 'mixed', category_mix: mix, size_balance: sizes, notes: get(r, 'notes') || null, created_by: 'worksheet' }, { onConflict: 'name' });
      made++;
      console.log(`  ${name}: ${posture} · mix ${JSON.stringify(mix)} · sizes ${JSON.stringify(sizes)}`);
    }
    console.log(`${apply ? 'APPLIED' : 'DRY'} — ${made} template(s)`);
  }
})();
