/* Apply selected-broker pricing into a plan's scheduled_crops.liner_unit_cost.
 *
 * Match grain: plan item_name → normalized variety key → broker_prices (the supplier
 * that carries it) → that supplier's chosen broker (sourcing_selections, else the
 * recommended/cheapest) → landed cost (prefer URC, then callused).
 *
 * SAFE BY DEFAULT: dry-run prints a preview (matches, $ deltas, margin impact).
 * Pass --apply to actually write liner_unit_cost + broker.
 *
 *   node scripts/apply_sourcing_to_plan.js "spring 2027"            # dry run
 *   node scripts/apply_sourcing_to_plan.js "spring 2027" --apply    # write
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

// ---- normalization (must match scripts/parse_broker_quotes.js) ----
// MUST stay byte-identical to scripts/parse_broker_quotes.js makeKey (and the copy in
// src/ProductionPlans.jsx srcMakeKey) so a plan item keys the same way broker_prices.variety_key did.
const SPECIES = /^(millefolium|reptans|spurium|didyma|dubium|hybrida|hybrid|aurantiaca|cordata|interspecific|x|sp|spp|species|officinalis|off|vulgaris|vul|angustifolia|angust|ang|dracunculus|drac|citriodorus|citriodora|citrata|citri|cit|intermedia|inter|piperita|pip|spicata|suaveolens|serpyllum|serp|praecox|amygdaloides|amy|lindheimeri|lind|nobilis|stoechas|st|douglasii|doug|montana|mastichina|pulegioides|herba|barona|elegans|arvensis|fruticosa|abrotanum|arborescens|canariensis|canary|pseudolanuginosus|pseudolanugin|hederacea|bonariensis|diffusa|odoratum|rebaudiana|chamaecyparissus|viridis|incisa|clinopodioides|europaea|ovata)$/;
const GENUS_SYN = { mentha: 'mint', thymus: 'thyme', salvia: 'sage', laurus: 'bay', ocimum: 'basil', rosmarinus: 'rosemary', satureja: 'savory', origanum: 'oregano', lippia: 'lemonverbena', aloysia: 'lemonverbena', helichrysum: 'curry', helichr: 'curry', chamaemelum: 'chamomile', coriandrum: 'coriander', majorana: 'marjoram', pelargonium: 'geranium', lavendula: 'lavandula', ipom: 'ipomoea' };
const WORD_SYN = { cas: 'cascadias', com: 'compact', bic: 'bicolor', bestie: 'besties', swt: 'sweet', hrt: 'heart' };
function tidy(s) {
  s = ' ' + String(s).toLowerCase() + ' ';
  s = s.replace(/[áàâäãå]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôöõ]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c');
  s = s.replace(/\bw\//g, ' ').replace(/\bwith\b/g, ' ');
  s = s.replace(/[`'´‘’"*]/g, ' ').replace(/[™®℠]/g, ' ').replace(/#/g, ' ');
  s = s.replace(/\bpp\s?\d+\b/g, ' ').replace(/\bppaf\b/g, ' ').replace(/\bcpbr\s?\d+\b/g, ' ')
       .replace(/\beu\s?\d*\b/g, ' ').replace(/\bp\.?p\.?a\.?f\.?\b/g, ' ');
  s = s.replace(/\b(usppp?|us\spp)\d+\b/g, ' ');
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\b20\d\d\b/g, ' ');
  s = s.replace(/-?(urc|cc|rc|tc|liner|plug|pellet|callused|unrooted|rooted)\b/g, ' ');
  s = s.replace(/\bn\/?g\b/g, ' ').replace(/\bnew guinea\b/g, ' ');
  s = s.replace(/\bmain street\b/g, 'mainstreet');          // Dümmen Coleus series: "Main Street" == "Mainstreet"
  s = s.replace(/\bimproved\b/g, ' ').replace(/\bimp\b/g, ' ');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
// strip a leading size token from a plan item name: 4.5", HB 10", POT, 1801, FIBER…
const stripSize = n => String(n || "").replace(/^\s*(HB\s*\d+(?:\.\d+)?"?|\d+(?:\.\d+)?"|1801[LS]?|FIBER|POT|MARKET|BOWL)\s*/i, "").trim();
function makeKey(crop, botanical, varietyName) {
  varietyName = String(varietyName || '').replace(/^\s*(HE|OR)\s+/, '');
  const cropClean = String(crop || '').trim().replace(/^(herbs?|perennials?|annuals?|grass(es)?|vegetables?|veg|tropicals?|foliage|edibles?)\b\s*/i, '');
  const canon = g => GENUS_SYN[g] || g;
  let genus = canon(tidy((botanical || cropClean || '').split(/\s+/)[0] || ''));
  let w = tidy(varietyName).split(' ').filter(Boolean);
  if (!genus && w.length) genus = canon(w.shift());
  while (w.length && (canon(w[0]) === genus || w[0] === genus || SPECIES.test(w[0]))) w.shift();
  w = w.map(x => WORD_SYN[x] || x).filter(x => x).sort();
  return (genus + (w.length ? ' ' + w.join(' ') : '')).trim();
}
const FORM_RANK = { urc: 0, callused: 1, urc_autostix: 2, rooted: 3, liner: 4, plug: 5 };
// Only price from Unrooted (URC) or Callused quotes — not enough liner/plug quotes yet (Caleb).
const ALLOWED_FORMS = new Set(['urc', 'callused']);
// Force a genus to a preferred supplier when that supplier carries the variety. ipomoea → Pell.
// (pansy/viola handled separately below — Bob's plug at a specific tray size.)
const GENUS_SUPPLIER = { ipomoea: 'Pell' };
// Pansies/violas: 288 plug by default; Cool Wave & Top Wave run in 144s.
const trayFor = name => /cool wave|top wave/i.test(String(name || '')) ? '144' : '288';
// Vegetative begonias come from Lucas as ROOTED LINERS (too finicky to propagate) — NOT a URC quote.
// Reiger is the only exception. No begonia except Reiger is a URC buy, so skip them all from
// URC matching (no Lucas quote loaded yet → they'd otherwise mis-price as URC).
const isLucasBegonia = name => /\bbegonia\b/i.test(name) && !/reiger/i.test(name);

(async () => {
  const apply = process.argv.includes('--apply');
  const planQuery = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || 'spring 2027';

  const { data: plans } = await sb.from('production_plans').select('id,name').ilike('name', `%${planQuery}%`);
  if (!plans || !plans.length) { console.error('no plan matching', JSON.stringify(planQuery)); process.exit(1); }
  const plan = plans[0];
  console.log('Plan:', plan.name, `(${plan.id})`, apply ? '— APPLYING' : '— DRY RUN');

  const page = async (tbl, sel, filt) => { let out = []; for (let f = 0; ; f += 1000) { let q = sb.from(tbl).select(sel).range(f, f + 999); if (filt) q = filt(q); const { data, error } = await q; if (error) { console.error(error.message); break; } if (!data || !data.length) break; out = out.concat(data); if (data.length < 1000) break; } return out; };

  // URC/callused for everything, PLUS Bob's plug quote (pansies/violas) as an explicit exception.
  const prices = await page('broker_prices', 'broker,supplier,form_class,variety_key,landed,form_raw,origin', q => q.eq('season', '2026-2027').gt('landed', 0).or('form_class.in.(urc,callused),supplier.eq.Bobs'));
  const sel = await page('sourcing_selections', 'supplier,form_class,selected_broker', q => q.eq('season', '2026-2027').eq('form_class', '*'));
  const sels = {}; sel.forEach(s => { if (s.selected_broker) sels[s.supplier] = s.selected_broker; });
  const crops = await page('scheduled_crops', 'id,item_name,qty_pots,plants_per_unit,liner_unit_cost,broker,is_combo_component', q => q.eq('plan_id', plan.id).eq('is_combo_component', false).gt('qty_pots', 0));

  // index broker_prices by variety key → supplier → broker → best landed (prefer URC)
  const idx = {}, bobsTray = {}; // bobsTray[key][cellCount] = landed (pansy/viola tray pricing)
  for (const p of prices) {
    const k = p.variety_key; if (!k) continue;
    ((idx[k] = idx[k] || {})[p.supplier] = idx[k][p.supplier] || {});
    const cur = idx[k][p.supplier][p.broker];
    const better = !cur || (FORM_RANK[p.form_class] ?? 9) < (FORM_RANK[cur.form_class] ?? 9) || ((FORM_RANK[p.form_class] ?? 9) === (FORM_RANK[cur.form_class] ?? 9) && p.landed < cur.landed);
    if (better) idx[k][p.supplier][p.broker] = { landed: p.landed, form_class: p.form_class, origin: p.origin || null };
    if (p.supplier === 'Bobs') { const m = String(p.form_raw || '').match(/(\d{2,4})/); const cells = m ? m[1] : 'na'; const t = (bobsTray[k] = bobsTray[k] || {}); if (t[cells] == null || p.landed < t[cells]) t[cells] = p.landed; }
  }
  // recommended broker per supplier = cheapest-most-often (use the catalog min as proxy fallback)
  // here: for a key+supplier, if no selection, take the cheapest broker available for that key.

  let matched = 0, ambiguous = 0, unmatched = 0, gap = 0, costUp = 0, costDn = 0, deltaPlants = 0;
  const updates = [], gaps = [];
  let lucasBegonia = 0;
  for (const c of crops) {
    const key = makeKey(null, null, stripSize(c.item_name));
    const genus = key.split(' ')[0];
    // vegetative begonias → Lucas rooted liner (pending Lucas quote); never URC-match these
    if (isLucasBegonia(c.item_name)) { lucasBegonia++; continue; }
    // pansy/viola → Bob's plug at the right tray (288 default; Cool/Top Wave → 144)
    if ((genus === 'pansy' || genus === 'viola') && bobsTray[key]) {
      const t = bobsTray[key], tray = trayFor(c.item_name);
      const landed = t[tray] ?? t['288'] ?? Math.min(...Object.values(t));
      const old = +c.liner_unit_cost || 0;
      const plants = (+c.qty_pots || 0) * (+c.plants_per_unit || 1);
      deltaPlants += (landed - old) * plants; if (landed > old) costUp++; else if (landed < old) costDn++;
      matched++; updates.push({ id: c.id, item: c.item_name, supplier: 'Bobs', broker: 'Ball', origin: null, landed, old, tray });
      continue;
    }
    const suppliers = idx[key];
    if (!suppliers) { unmatched++; continue; }
    const supNames = Object.keys(suppliers);
    // choose supplier: genus-forced supplier first (e.g. ipomoea→Pell), then a selected supplier,
    // then the single supplier, else flag ambiguous
    let chosenSup = (GENUS_SUPPLIER[genus] && suppliers[GENUS_SUPPLIER[genus]]) ? GENUS_SUPPLIER[genus] : supNames.find(s => sels[s]);
    if (!chosenSup && supNames.length === 1) chosenSup = supNames[0];
    if (!chosenSup) { ambiguous++; continue; }
    const brokers = suppliers[chosenSup];
    let broker = sels[chosenSup];
    if (!broker || !brokers[broker]) { // no selection or chosen broker doesn't carry it → cheapest available
      const want = sels[chosenSup];
      broker = Object.keys(brokers).sort((a, b) => brokers[a].landed - brokers[b].landed)[0];
      if (want && !brokers[want]) { gap++; gaps.push({ item: c.item_name, supplier: chosenSup, want, got: broker, landed: brokers[broker].landed }); }
    }
    const landed = brokers[broker].landed;
    matched++;
    const old = +c.liner_unit_cost || 0;
    const plants = (+c.qty_pots || 0) * (+c.plants_per_unit || 1);
    const d = (landed - old) * plants;
    deltaPlants += d;
    if (landed > old) costUp++; else if (landed < old) costDn++;
    updates.push({ id: c.id, item: c.item_name, supplier: chosenSup, broker, origin: brokers[broker].origin || null, landed, old });
  }

  console.log(`\ncrops (finished): ${crops.length}`);
  console.log(`  matched to a broker catalog: ${matched}`);
  console.log(`  ambiguous (≥2 suppliers, no selection): ${ambiguous}`);
  console.log(`  unmatched (not in any catalog): ${unmatched}`);
  console.log(`  selection had a broker gap (fell back to cheapest): ${gap}`);
  console.log(`  vegetative begonias skipped (Lucas liner, pending quote): ${lucasBegonia}`);
  console.log(`  selections in place: ${Object.keys(sels).length ? JSON.stringify(sels) : 'NONE — using cheapest available per variety'}`);
  console.log(`\nliner-cost change if applied: ${deltaPlants >= 0 ? '+' : ''}$${deltaPlants.toFixed(0)} (${costUp} up, ${costDn} down)`);
  console.log('\nsample matches:');
  updates.slice(0, 12).forEach(u => console.log(`  ${u.item.slice(0, 42).padEnd(44)} ${u.supplier}/${u.broker}  $${u.old.toFixed(4)} → $${u.landed.toFixed(4)}`));
  if (gaps.length) {
    console.log(`\nGAP — your selected broker doesn't carry these in URC/callused; fell back to cheapest (${gaps.length}):`);
    gaps.forEach(g => console.log(`  ${g.item.slice(0, 46).padEnd(48)} ${g.supplier}: want ${g.want} → using ${g.got}  $${g.landed.toFixed(4)}`));
  }

  if (apply) {
    let done = 0;
    for (const u of updates) {
      const { error } = await sb.from('scheduled_crops').update({ liner_unit_cost: u.landed, broker: u.broker, supplier: u.supplier, origin: u.origin }).eq('id', u.id);
      if (error) { console.error('update failed', u.id, error.message); break; }
      done++;
    }
    console.log(`\nAPPLIED ${done} updates.`);
  } else {
    console.log('\n(dry run — pass --apply to write)');
  }
})();
