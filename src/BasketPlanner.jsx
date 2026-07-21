// BasketPlanner — baskets by size, their recipes and economics, and one-click
// capture of what you want to do differently next year.
//
// Caleb: "click 10\" hanging baskets, search for particular hanging baskets, dig
// into what the combo is and make them different or add a new one using material
// that will search the sourcing database… every year this is where a lot of the
// work is, the combos."
//
// Ideas arrive half-formed — "new combo, different colors", "try a different
// series" — so a proposal can be logged in one click with the CURRENT recipe
// snapshotted, then filled in with real costed material later. It is not a combo
// designer; it is the place the decision survives until someone builds it.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", card: "#fff", border: "#dfe7d8",
  muted: "#7a8c74", text: "#2f3b2a", red: "#c0392b", amber: "#c98a2e", green: "#2e7d32" };
const money = n => n == null ? "—" : (Math.abs(n) >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${(+n).toFixed(2)}`);
const pct = n => n == null ? "—" : `${Math.round(n * 100)}%`;
// Baskets and made-up containers — anything built from components rather than grown as one plant
const sizeOf = n => (String(n || "").trim().match(/^(HB\s*\d+"?|FIBER(?:\s+LG\.?)?|POT\s*\d*"?|BOWL\s*\d*"?|MARKET(?:\s+BASKET)?|\d+(?:\.\d+)?")/i) || ["Other"])[0].toUpperCase().replace(/\s+/g, " ");

const DIRECTIONS = [
  ["different_colors", "Different colours"],
  ["different_series", "Different series"],
  ["different_crop", "Different crop"],
  ["cheaper", "Cheaper material"],
  ["premium", "Premium version"],
  ["keep_recipe", "Same recipe, new size"],
];

async function pageAll(sb, table, cols, mod) {
  let out = [], from = 0;
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

export default function BasketPlanner({ plan, onOpenCombos }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [baskets, setBaskets] = useState(null);
  const [props, setProps] = useState([]);
  const [targets, setTargets] = useState({});   // item_name → plan_targets row
  const [size, setSize] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);     // basket being inspected
  const [draft, setDraft] = useState(null);   // proposal being written
  const [err, setErr] = useState(null);

  async function loadProposals() {
    const { data } = await sb.from("combo_proposals").select("*").eq("plan_id", plan.id).order("created_at", { ascending: false });
    setProps(data || []);
  }

  async function loadTargets() {
    const { data } = await sb.from("plan_targets").select("*").eq("plan_id", plan.id);
    setTargets(Object.fromEntries((data || []).map(t => [t.item_name, t])));
  }

  // Same decision store as the item projection — a basket target is not a
  // proposal, it's a projection decision like any other item's.
  async function saveTarget(b, patch) {
    const prev = targets[b.name] || {};
    const next = {
      plan_id: plan.id, item_name: b.name,
      target_units: patch.target_units !== undefined ? patch.target_units : (prev.target_units ?? null),
      ready_shift: patch.ready_shift !== undefined ? patch.ready_shift : (prev.ready_shift ?? null),
      decision: patch.decision !== undefined ? patch.decision : (prev.decision ?? null),
      prior_units: b.sold, current_units: b.baskets,
      decided_by: displayName || "planner", decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTargets(t => ({ ...t, [b.name]: { ...prev, ...next } }));
    try { await sb.from("plan_targets").upsert(next, { onConflict: "plan_id,item_name" }); }
    catch (e) { console.warn("target save failed", e); }
  }

  useEffect(() => {
    if (!sb || !plan?.id) return;
    (async () => {
      try {
        const [sc, vars, xw, tot] = await Promise.all([
          pageAll(sb, "scheduled_crops", "id,item_name,variety_id,qty_pots,qty_plants_ordered,ppp,pack_size,sale_price_per_pot,is_combo_component,combo_parent_id,planting_layout,broker,supplier,liner_unit_cost,ready_week", q => q.eq("plan_id", plan.id)),
          pageAll(sb, "variety_library", "id,crop_name"),
          pageAll(sb, "sales_sku_map", "sku,plan_item_name"),
          pageAll(sb, "sales_totals", "sku,units,revenue,avg_price"),
        ]);
        const crop = Object.fromEntries(vars.map(v => [v.id, v.crop_name]));
        const skuToItem = {}; xw.forEach(x => { if (x.plan_item_name) skuToItem[x.sku] = x.plan_item_name; });
        const sold = {}, srev = {};
        tot.forEach(t => { const it = skuToItem[t.sku]; if (!it) return;
          sold[it] = (sold[it] || 0) + +t.units; srev[it] = (srev[it] || 0) + +t.revenue; });

        const byId = Object.fromEntries(sc.map(r => [r.id, r]));
        const kids = {};
        sc.forEach(r => { if (r.is_combo_component && r.combo_parent_id) (kids[r.combo_parent_id] = kids[r.combo_parent_id] || []).push(r); });

        // one entry per distinct basket name, summed over its bench rows
        const m = {};
        for (const r of sc) {
          if (r.is_combo_component || !kids[r.id]) continue;      // parents only
          const k = r.item_name;
          const o = m[k] || (m[k] = { name: k, size: sizeOf(k), baskets: 0, linerCost: 0, ready: null,
            price: +r.sale_price_per_pot || null, recipe: [], layout: r.planting_layout || null, ids: [] });
          o.baskets += +r.qty_pots || 0;
          if (r.ready_week != null) o.ready = o.ready == null ? +r.ready_week : Math.min(o.ready, +r.ready_week);
          o.ids.push(r.id);
          if (!o.layout && r.planting_layout) o.layout = r.planting_layout;
          for (const ch of kids[r.id]) {
            o.linerCost += (+ch.qty_plants_ordered || 0) * (+ch.liner_unit_cost || 0);
            const label = `${crop[ch.variety_id] || "?"}`;
            const ex = o.recipe.find(x => x.label === label);
            const per = (+r.qty_pots > 0) ? (+ch.qty_plants_ordered || 0) / (+r.qty_pots) : 0;
            if (ex) { ex.plants += +ch.qty_plants_ordered || 0; ex.per = Math.max(ex.per, Math.round(per * 10) / 10); }
            else o.recipe.push({ label, plants: +ch.qty_plants_ordered || 0, per: Math.round(per * 10) / 10,
              broker: ch.broker, supplier: ch.supplier, liner: +ch.liner_unit_cost || null });
          }
        }
        Object.values(m).forEach(o => {
          o.sold = sold[o.name] || 0;
          o.rev = srev[o.name] || 0;
          o.st = o.baskets ? o.sold / o.baskets : null;
          o.costPer = o.baskets ? o.linerCost / o.baskets : null;
          o.gm = o.price && o.costPer != null ? (o.price - o.costPer) / o.price : null;
        });
        setBaskets(Object.values(m).sort((a, b) => b.baskets - a.baskets));
        await loadProposals();
        await loadTargets();
      } catch (e) { setErr(e.message || String(e)); }
    })();
  }, [sb, plan?.id]); // eslint-disable-line

  const sizes = useMemo(() => {
    if (!baskets) return [];
    const m = new Map();
    baskets.forEach(b => { const o = m.get(b.size) || { size: b.size, n: 0, baskets: 0, rev: 0 };
      o.n++; o.baskets += b.baskets; o.rev += b.rev; m.set(b.size, o); });
    return [...m.values()].sort((a, b) => b.baskets - a.baskets);
  }, [baskets]);

  const shown = useMemo(() => {
    if (!baskets) return [];
    const ql = q.trim().toLowerCase();
    return baskets.filter(b => (!size || b.size === size) && (!ql || b.name.toLowerCase().includes(ql)));
  }, [baskets, size, q]);

  function startProposal(kind, direction, basket) {
    setDraft({
      kind, direction,
      name: basket ? (kind === "replace" ? `Replacement for ${basket.name}` : basket.name) : "",
      size: basket?.size || size || "",
      based_on_item: basket?.name || null,
      target_baskets: basket?.baskets || null,
      target_price: basket?.price || null,
      replaces_recipe: basket ? basket.recipe : null,
      components: [], notes: "",
    });
  }

  async function saveProposal() {
    if (!draft?.name?.trim()) return;
    const est = draft.components.length
      ? draft.components.reduce((a, c) => a + (+c.landed || 0) * (+c.ppp || 1), 0) : null;
    const { error } = await sb.from("combo_proposals").insert({
      plan_id: plan.id, kind: draft.kind, direction: draft.direction,
      name: draft.name.trim(), size: draft.size || null, based_on_item: draft.based_on_item,
      target_baskets: draft.target_baskets ? +draft.target_baskets : null,
      target_price: draft.target_price ? +draft.target_price : null,
      components: draft.components, replaces_recipe: draft.replaces_recipe,
      est_cost_per_basket: est, notes: draft.notes || null,
      created_by: displayName || "planner",
    });
    if (error) { window.alert("Couldn't save: " + error.message); return; }
    setDraft(null); setOpen(null); loadProposals();
  }

  if (err) return <div style={{ padding: 20, color: C.red }}>Couldn't load: {err}</div>;
  if (!baskets) return <div style={{ padding: 20, color: C.muted }}>Loading baskets…</div>;

  const btn = (bg, col, extra = {}) => ({ padding: "7px 12px", borderRadius: 8, border: "none",
    background: bg, color: col, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra });

  return (
    <div style={{ display: "grid", gap: 13 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 12.5, color: C.muted }}>
        Every basket in the plan, by size, with its recipe and what it earned. Ideas can be logged half-formed —
        “different colours”, “try another series” — and the current recipe is saved with them so nobody starts from a blank page.
      </div>

      {/* size shelves */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {sizes.map(s => (
          <button key={s.size} onClick={() => setSize(size === s.size ? "" : s.size)}
            style={{ padding: "9px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
              border: `1.5px solid ${size === s.size ? C.dark : C.border}`,
              background: size === s.size ? C.dark : "#fff", color: size === s.size ? "#fff" : C.text }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{s.size}</div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>{s.n} baskets · {s.baskets.toLocaleString()} units · {money(s.rev)}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 search baskets…"
          style={{ padding: "8px 12px", borderRadius: 16, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", width: 260 }} />
        <span style={{ fontSize: 12, color: C.muted }}>{shown.length} shown</span>
        <button onClick={() => startProposal("new", null, null)} style={{ ...btn(C.dark, "#c8e6b8"), marginLeft: "auto" }}>+ Propose a new basket</button>
      </div>

      {props.length > 0 && <ProposalList props={props} onDelete={async id => { await sb.from("combo_proposals").delete().eq("id", id); loadProposals(); }} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 10 }}>
        {shown.map(b => (
          <BasketCard key={b.name} b={b} tgt={targets[b.name]} onOpen={() => setOpen(b)} />
        ))}
      </div>
      {shown.length === 0 && <div style={{ padding: 26, textAlign: "center", color: C.muted }}>No baskets match.</div>}

      {open && !draft && (
        <BasketDetail b={open} tgt={targets[open.name]} onSaveTarget={patch => saveTarget(open, patch)}
          onClose={() => setOpen(null)} onOpenCombos={onOpenCombos}
          onPropose={(kind, dir) => startProposal(kind, dir, open)} />
      )}
      {draft && (
        <ProposalEditor sb={sb} draft={draft} setDraft={setDraft}
          onCancel={() => setDraft(null)} onSave={saveProposal} />
      )}
    </div>
  );
}

function BasketCard({ b, tgt, onOpen }) {
  return (
    <div onClick={onOpen} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
      <div style={{ fontWeight: 700, color: C.dark, fontSize: 13.5 }}>{b.name}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
        {b.recipe.map(r => `${r.label}${r.per ? ` ×${r.per}` : ""}`).join(" + ") || "no components"}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 7, fontSize: 12, flexWrap: "wrap" }}>
        <span><b>{b.baskets.toLocaleString()}</b> planned</span>
        {tgt && (tgt.target_units != null || tgt.ready_shift) && (
          <span style={{ background: "#eef6e8", border: `1px solid ${C.light}`, borderRadius: 7, padding: "0 7px", fontWeight: 800, color: "#3f6d33" }}>
            🎯 {tgt.target_units != null ? tgt.target_units.toLocaleString() : ""}{tgt.ready_shift ? ` ${tgt.ready_shift > 0 ? "+" : ""}${tgt.ready_shift}wk` : ""}
          </span>
        )}
        <span style={{ color: b.st == null ? C.muted : b.st >= 0.95 ? C.green : b.st < 0.6 ? C.red : C.text, fontWeight: 700 }}>{pct(b.st)} sold</span>
        {b.costPer != null && <span style={{ color: C.muted }}>{money(b.costPer)}/ea</span>}
        {b.gm != null && <span style={{ fontWeight: 700 }}>{pct(b.gm)} GM</span>}
      </div>
    </div>
  );
}

function BasketDetail({ b, tgt, onSaveTarget, onClose, onPropose, onOpenCombos }) {
  const btn = (bg, col) => ({ padding: "8px 13px", borderRadius: 8, border: "none", background: bg, color: col,
    fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", borderRadius: 14, width: "100%", maxWidth: 620, maxHeight: "88vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>{b.name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{b.size} · {b.baskets.toLocaleString()} planned · {b.sold.toLocaleString()} sold in 2026</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: C.muted, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          {[["Sell-through", pct(b.st)], ["Cost / basket", money(b.costPer)], ["Price", money(b.price)],
            ["Direct margin", pct(b.gm)], ["2026 revenue", money(b.rev)]].map(([l, v]) => (
            <div key={l} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 800, textTransform: "uppercase" }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.dark }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>What's in it</div>
          {b.recipe.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, padding: "3px 0", flexWrap: "wrap" }}>
              <b style={{ minWidth: 120 }}>{r.label}</b>
              <span style={{ color: C.muted }}>{r.per ? `${r.per} per basket` : ""} · {r.plants.toLocaleString()} plants</span>
              {r.liner != null && <span style={{ color: C.muted }}>@ {money(r.liner)}</span>}
              {(r.broker || r.supplier) && <span style={{ color: C.muted, marginLeft: "auto" }}>{[r.broker, r.supplier].filter(Boolean).join(" / ")}</span>}
            </div>
          ))}
          {!b.recipe.length && <div style={{ color: C.muted, fontSize: 12.5 }}>No components recorded.</div>}
          <div style={{ fontSize: 11.5, color: b.layout ? C.green : C.amber, marginTop: 7 }}>
            {b.layout ? "✓ planting layout arranged" : "⚠ not arranged yet — no planting layout"}
          </div>
        </div>

        <ProjectionRow b={b} tgt={tgt} onSave={onSaveTarget} />

        <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", margin: "14px 0 6px" }}>
          Change the recipe for next year
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DIRECTIONS.map(([k, l]) => (
            <button key={k} onClick={() => onPropose("replace", k)} style={btn("#fff", C.text)}
              onMouseOver={e => e.currentTarget.style.borderColor = C.light}>
              {l}
            </button>
          ))}
          <button onClick={() => onPropose("change", null)} style={btn(C.light, "#fff")}>Modify recipe…</button>
          <button onClick={() => onPropose("drop", null)} style={btn("#fff", C.red)}>Drop it</button>
          {onOpenCombos && <button onClick={() => { onOpenCombos(b.name); onClose(); }} style={btn(C.dark, "#c8e6b8")}>Arrange layout →</button>}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
          Each of these logs the idea with this recipe attached — fill in material now or later.
        </div>
      </div>
    </div>
  );
}

// Quantity + timing for the projection session — the same plan_targets store the
// item view writes, so basket decisions are first-class, not proposals.
function ProjectionRow({ b, tgt, onSave }) {
  const [val, setVal] = useState(tgt?.target_units ?? "");
  const shift = tgt?.ready_shift || 0;
  const eff = b.ready != null ? b.ready + shift : null;
  const commit = raw => {
    const t = String(raw).trim();
    if (t === "") { onSave({ target_units: null, decision: null }); return; }
    const n = Math.max(0, Math.round(+t.replace(/[^0-9.]/g, "")));
    if (isNaN(n)) return;
    onSave({ target_units: n, decision: n === 0 ? "drop" : n > b.baskets ? "grow" : n < b.baskets ? "cut" : "hold" });
  };
  const chip = { padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff",
    color: C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div style={{ background: "#eef6e8", border: `1.5px solid ${C.light}`, borderRadius: 10, padding: "11px 13px", marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#3f6d33", textTransform: "uppercase", marginBottom: 7 }}>2027 projection</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: C.text }}>Baskets:</span>
          <input value={val} onChange={e => setVal(e.target.value)}
            onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={String(b.baskets)}
            style={{ width: 74, padding: "6px 8px", textAlign: "right", borderRadius: 8, fontSize: 13,
              fontFamily: "inherit", border: `1.5px solid ${tgt?.target_units != null ? C.light : C.border}`,
              fontWeight: tgt?.target_units != null ? 700 : 400 }} />
          <button style={chip} onClick={() => { setVal(String(b.baskets)); commit(b.baskets); }}>same</button>
          {b.sold > 0 && <button style={chip} onClick={() => { setVal(String(b.sold)); commit(b.sold); }}>=sold ({b.sold.toLocaleString()})</button>}
          <button style={{ ...chip, color: C.red }} onClick={() => { setVal("0"); commit(0); }}>drop</button>
        </div>
        {eff != null && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: C.text }}>Finish:</span>
            <button style={chip} title="one week earlier" onClick={() => onSave({ ready_shift: shift - 1 === 0 ? null : shift - 1 })}>◀</button>
            <b style={{ fontSize: 13, color: shift < 0 ? C.green : shift > 0 ? C.amber : C.text }}>
              wk{eff}{shift !== 0 && ` (${shift > 0 ? "+" : ""}${shift})`}
            </b>
            <button style={chip} title="one week later" onClick={() => onSave({ ready_shift: shift + 1 === 0 ? null : shift + 1 })}>▶</button>
            {shift !== 0 && <button style={{ ...chip, border: "none", color: C.red }} onClick={() => onSave({ ready_shift: null })}>×</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalEditor({ sb, draft, setDraft, onCancel, onSave }) {
  const [tab, setTab] = useState("idea");
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const est = draft.components.reduce((a, c) => a + (+c.landed || 0) * (+c.ppp || 1), 0);
  const inp = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${C.border}`,
    fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };
  const lab = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", display: "block", margin: "10px 0 4px" };
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto", padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          {draft.kind === "drop" ? "Drop this basket" : draft.kind === "replace" ? "Replace this basket" : draft.kind === "change" ? "Modify this basket" : "New basket idea"}
        </div>
        {draft.based_on_item && <div style={{ fontSize: 12, color: C.muted }}>based on {draft.based_on_item}</div>}

        <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
          {[["idea", "The idea"], ["material", `Material (${draft.components.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 14px", borderRadius: 16, cursor: "pointer",
              border: `1.5px solid ${tab === k ? C.light : C.border}`, background: tab === k ? C.light : "#fff",
              color: tab === k ? "#fff" : C.text, fontSize: 12.5, fontWeight: 700 }}>{l}</button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: C.muted, alignSelf: "center" }}>
            {est > 0 && <>est. <b style={{ color: C.dark }}>{money(est)}</b> material / basket</>}
          </div>
        </div>

        {tab === "idea" && (
          <>
            <span style={lab}>Name</span>
            <input style={inp} value={draft.name} onChange={e => set("name", e.target.value)} placeholder="e.g. HB 10&quot; Sun Combo — warm palette" />
            <span style={lab}>Direction</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {DIRECTIONS.map(([k, l]) => (
                <button key={k} onClick={() => set("direction", draft.direction === k ? null : k)}
                  style={{ padding: "6px 11px", borderRadius: 14, cursor: "pointer", fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${draft.direction === k ? C.light : C.border}`,
                    background: draft.direction === k ? C.light : "#fff", color: draft.direction === k ? "#fff" : C.text }}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><span style={lab}>Size</span><input style={inp} value={draft.size || ""} onChange={e => set("size", e.target.value)} /></div>
              <div style={{ flex: 1 }}><span style={lab}>Target baskets</span><input style={inp} inputMode="numeric" value={draft.target_baskets || ""} onChange={e => set("target_baskets", e.target.value)} /></div>
              <div style={{ flex: 1 }}><span style={lab}>Target price</span><input style={inp} inputMode="decimal" value={draft.target_price || ""} onChange={e => set("target_price", e.target.value)} /></div>
            </div>
            <span style={lab}>Notes</span>
            <textarea style={{ ...inp, minHeight: 64, resize: "vertical" }} value={draft.notes} onChange={e => set("notes", e.target.value)}
              placeholder="What you said in the room — e.g. 'sold out every year, try it in warmer colours and go up 20%'" />
            {draft.replaces_recipe?.length > 0 && (
              <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 12px", marginTop: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Replacing (saved with the idea)</div>
                <div style={{ fontSize: 12.5, color: C.text, marginTop: 3 }}>
                  {draft.replaces_recipe.map(r => `${r.label}${r.per ? ` ×${r.per}` : ""}`).join(" + ")}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "material" && <MaterialPicker sb={sb} draft={draft} setDraft={setDraft} />}

        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: "10px 16px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={onSave} disabled={!draft.name.trim()}
            style={{ flex: 1, padding: "10px 16px", borderRadius: 9, border: "none", background: draft.name.trim() ? C.dark : "#c8d8c0", color: "#c8e6b8", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Save idea
          </button>
        </div>
      </div>
    </div>
  );
}

// Search the real sourcing database (39k broker price rows) and pull costed material in.
function MaterialPicker({ sb, draft, setDraft }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [broker, setBroker] = useState("");

  async function search() {
    const term = q.trim();
    if (term.length < 3) { setHits([]); return; }
    setBusy(true);
    let sel = sb.from("v_sourcing_prices").select("crop,variety,broker,supplier,form_class,landed,list_price,variety_key").limit(60);
    sel = sel.or(`variety.ilike.%${term}%,crop.ilike.%${term}%`);
    if (broker) sel = sel.eq("broker", broker);
    const { data, error } = await sel;
    if (!error) setHits((data || []).sort((a, b) => (+a.landed || 9) - (+b.landed || 9)));
    setBusy(false);
  }
  useEffect(() => { const t = setTimeout(search, 350); return () => clearTimeout(t); }, [q, broker]); // eslint-disable-line

  const add = h => setDraft(d => ({ ...d, components: [...d.components, {
    crop: h.crop, variety: h.variety, broker: h.broker, supplier: h.supplier,
    form: h.form_class, landed: +h.landed || null, variety_key: h.variety_key, ppp: 1 }] }));
  const upd = (i, k, v) => setDraft(d => ({ ...d, components: d.components.map((c, j) => j === i ? { ...c, [k]: v } : c) }));
  const del = i => setDraft(d => ({ ...d, components: d.components.filter((_, j) => j !== i) }));

  const inp = { padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff" };
  return (
    <div>
      {draft.components.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>In this basket</div>
          {draft.components.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", flexWrap: "wrap", fontSize: 12.5 }}>
              <b style={{ flex: 1, minWidth: 150 }}>{c.variety}</b>
              <span style={{ color: C.muted }}>{[c.broker, c.supplier].filter(Boolean).join(" / ")}</span>
              <span style={{ color: C.muted }}>{money(c.landed)}</span>
              <label style={{ fontSize: 11, color: C.muted }}>ppp
                <input value={c.ppp} onChange={e => upd(i, "ppp", e.target.value)} inputMode="numeric"
                  style={{ ...inp, width: 48, padding: "3px 6px", marginLeft: 4 }} /></label>
              <b>{money((+c.landed || 0) * (+c.ppp || 1))}</b>
              <button onClick={() => del(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 search the sourcing catalog — crop or variety…"
          style={{ ...inp, flex: 1, minWidth: 220 }} />
        <select value={broker} onChange={e => setBroker(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
          <option value="">All brokers</option>
          {["Ball", "EHR", "Express"].map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, margin: "6px 0" }}>
        {busy ? "searching…" : hits.length ? `${hits.length} matches, cheapest first` : q.trim().length < 3 ? "type at least 3 characters" : "no matches"}
      </div>
      <div style={{ maxHeight: 260, overflow: "auto", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10 }}>
        {hits.map((h, i) => (
          <div key={i} onClick={() => add(h)} style={{ display: "flex", gap: 9, alignItems: "center", padding: "7px 11px",
            borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontSize: 12.5 }}>
            <b style={{ flex: 1 }}>{h.variety}</b>
            <span style={{ color: C.muted }}>{h.crop}</span>
            <span style={{ color: C.muted }}>{h.form_class}</span>
            <span style={{ color: C.muted }}>{[h.broker, h.supplier].filter(Boolean).join(" / ")}</span>
            <b style={{ color: C.green }}>{money(h.landed)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalList({ props, onDelete }) {
  const meta = { idea: ["#eef3e8", C.muted], approved: ["#e8f5e0", C.green], rejected: ["#fdecea", C.red], built: ["#e6f0fa", "#2a6ab0"] };
  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.light}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 7 }}>
        Basket ideas for next year ({props.length})
      </div>
      {props.map(p => {
        const [bg, col] = meta[p.status] || meta.idea;
        return (
          <div key={p.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", fontSize: 12.5 }}>
            <span style={{ background: bg, color: col, borderRadius: 7, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{p.kind}</span>
            <b>{p.name}</b>
            {p.direction && <span style={{ color: C.muted }}>{(DIRECTIONS.find(d => d[0] === p.direction) || [, p.direction])[1]}</span>}
            {p.based_on_item && <span style={{ color: C.muted }}>← {p.based_on_item}</span>}
            {p.est_cost_per_basket && <span style={{ color: C.muted }}>{money(p.est_cost_per_basket)}/ea</span>}
            {(p.components || []).length > 0 && <span style={{ color: C.muted }}>{p.components.length} parts</span>}
            <button onClick={() => onDelete(p.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800 }}>×</button>
          </div>
        );
      })}
    </div>
  );
}
