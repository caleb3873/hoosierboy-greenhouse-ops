// Propagation Guide — comprehensive, mobile-friendly reference built from the
// culture-guide sources, with OUR own notes, an SOP we grow over the season, and
// timing overrides that will prefill production time + prop tasks in the plan.
//
// Culture facts come from culture_guides_public (read-only, cross-project).
// Our layer (notes / SOP / timing overrides) lives in prop_guides.
import { useEffect, useMemo, useState } from "react";
import { getSupabase, getCultureClient } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", border: "#dfe7d8",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c98a2e", red: "#c0392b", green: "#2e7d32", bg: "#f6f9f3" };
const FONT = "'DM Sans','Segoe UI',sans-serif";

// pull a value from a guide's propagation_details (snake keys) or culture_details
// (Title Case keys) — first non-empty wins
const pick = (g, pdKeys, cdKeys) => {
  const pd = g.propagation_details || {}, cd = g.culture_details || {};
  for (const k of pdKeys) { const v = pd[k]; if (v != null && String(v).trim()) return String(v).trim(); }
  for (const k of (cdKeys || [])) { const v = cd[k]; if (v != null && String(v).trim()) return String(v).trim(); }
  return null;
};

// the propagation fields we surface, in display order
const FIELDS = [
  { key: "prop_weeks", label: "Propagation weeks", timing: true, get: g => g.propagation_weeks != null ? String(g.propagation_weeks) : pick(g, ["propagation_weeks", "plug_crop_time"], ["Propagation Average Time"]) },
  { key: "stick_to_transplant", label: "Stick → transplant (wks)", timing: true, get: g => pick(g, ["wks_stick_to_transplant"], ["Weeks Stick to Transplant"]) },
  { key: "mist_days", label: "Days in mist", timing: true, get: g => pick(g, ["days_in_mist", "days_with_mist"], ["Days In Mist"]) },
  { key: "weeks_to_pinch", label: "Weeks to pinch", timing: true, get: g => pick(g, ["weeks_to_pinch"], ["Weeks To Pinch"]) },
  { key: "tray", label: "Tray / cell", get: g => pick(g, ["tray_size", "tray_sizes", "rec_tray"], ["Tray Size"]) },
  { key: "hormone", label: "Rooting hormone", get: g => pick(g, ["rooting_hormone", "hormone"], ["Rooting Hormone", "Propagation Hormone"]) },
  { key: "day_temp", label: "Day temp", get: g => pick(g, ["avg_air_temp_day", "temp"], ["Average Air Temp (Day, prop)", "Day Temperature"]) },
  { key: "night_temp", label: "Night temp", get: g => pick(g, ["avg_air_temp_night"], ["Average Air Temp (Night, prop)", "Night Temperature"]) },
  { key: "soil_temp", label: "Soil temp", get: g => pick(g, ["avg_soil_temp"], ["Average Soil Temp"]) },
  { key: "pinch", label: "Prop pinch", get: g => pick(g, ["propagation_pinch", "pinch"], ["Propagation Pinch"]) },
  { key: "fungicide", label: "Fungicide", get: g => pick(g, ["fungicide"], ["Propagation Fungicide"]) },
  { key: "fertility", label: "Fertility", get: g => pick(g, ["fertility_rate", "fertilization"], ["Fertilizer Rate (prop)"]) },
  { key: "pgr", label: "PGR (prop)", get: g => pick(g, [], ["PGR Suggestions (prop)"]) },
  { key: "irrigation", label: "Irrigation", get: g => pick(g, ["irrigation"], ["Irrigation (prop)"]) },
];
const TIPS = g => pick(g, ["comments", "key_tips"], ["Propagation Tips", "Propagation Notes", "Finishing Tips"]);
const pdfOf = g => (g.culture_details || {})["Culture Guide PDF"] || (g.culture_details || {})["Culture Guide PDF (Origin)"] || null;

export default function PropagationGuide({ mobile, onBack, readOnly, plan }) {
  const ro = readOnly ?? mobile;   // mobile is a reference by default; edit on the planner side
  const sb = getSupabase();
  const cc = getCultureClient();
  const { displayName } = useAuth();
  const [corpus, setCorpus] = useState(null);   // light list: {id, crop_name, category, series_name, series_variety}
  const [guides, setGuides] = useState({});     // crop -> full guides (lazy)
  const [ours, setOurs] = useState({});         // guide_key -> prop_guides row
  const [q, setQ] = useState("");
  const [crop, setCrop] = useState(null);
  const [variety, setVariety] = useState(null); // exact culture guide id for detail
  const [treatments, setTreatments] = useState([]);   // prop-treatment templates
  const [view, setView] = useState(ro ? "cards" : "grid");   // grid = edit fast, cards = browse
  const [prefill, setPrefill] = useState(false);   // phase-2 plan-prefill panel

  useEffect(() => {
    (async () => {
      if (cc) {
        let out = [], from = 0;
        for (;;) {
          const { data } = await cc.from("culture_guides_public")
            .select("id,crop_name,category,series_name,series_variety,propagation_weeks,requires_heat").range(from, from + 999);
          out = out.concat(data || []);
          if (!data || data.length < 1000) break; from += 1000;
        }
        setCorpus(out);
      } else setCorpus([]);
      const { data: pg } = await sb.from("prop_guides").select("*");
      setOurs(Object.fromEntries((pg || []).map(r => [r.guide_key, r])));
      const { data: tr } = await sb.from("prop_treatments").select("*").order("name");
      setTreatments(tr || []);
    })();
  }, [sb, cc]); // eslint-disable-line
  // per-crop most-common culture propagation_weeks (a light rooting-time default for the grid)
  const cropPropWeeks = useMemo(() => {
    const m = {};
    (corpus || []).forEach(r => { const k = (r.crop_name || "").trim(); if (!k || r.propagation_weeks == null) return; (m[k] = m[k] || {})[r.propagation_weeks] = (m[k][r.propagation_weeks] || 0) + 1; });
    const out = {}; Object.entries(m).forEach(([k, c]) => { out[k] = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; });
    return out;
  }, [corpus]);

  // crop list with counts
  const crops = useMemo(() => {
    const m = new Map();
    (corpus || []).forEach(r => { const k = (r.crop_name || "").trim(); if (!k) return; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name));
  }, [corpus]);
  const shownCrops = crops.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  async function openCrop(name) {
    setCrop(name); setVariety(null);
    if (!guides[name] && cc) {
      const { data } = await cc.from("culture_guides_public")
        .select("id,crop_name,category,series_name,series_variety,propagation_weeks,requires_heat,propagation_details,culture_details")
        .ilike("crop_name", name).limit(400);
      setGuides(g => ({ ...g, [name]: data || [] }));
    }
  }
  const keyFor = (cropName) => cropName.toLowerCase().trim();

  async function saveOurs(cropName, patch) {
    const gk = keyFor(cropName);
    const next = { guide_key: gk, crop: cropName, ...(ours[gk] || {}), ...patch, updated_by: displayName || null, updated_at: new Date().toISOString() };
    delete next.id; delete next.created_at;
    setOurs(o => ({ ...o, [gk]: { ...(o[gk] || {}), ...next } }));
    await sb.from("prop_guides").upsert(next, { onConflict: "guide_key" });
  }
  async function addTreatment() {
    const name = window.prompt("New prop-treatment template name (e.g. 'Cool-week mist, 288 tray'):");
    if (!name || !name.trim()) return null;
    const detail = window.prompt("Detail (optional):") || null;
    const { error } = await sb.from("prop_treatments").insert({ name: name.trim(), detail });
    if (error) { window.alert("Couldn't add: " + error.message); return null; }
    const { data: tr } = await sb.from("prop_treatments").select("*").order("name");
    setTreatments(tr || []);
    return name.trim();
  }

  // aggregate a crop's culture prop fields — most common non-empty value, note variation
  const agg = useMemo(() => {
    if (!crop || !guides[crop]) return null;
    const gs = guides[crop];
    const res = {};
    for (const f of FIELDS) {
      const counts = {};
      gs.forEach(g => { const v = f.get(g); if (v) counts[v] = (counts[v] || 0) + 1; });
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      res[f.key] = entries.length ? { value: entries[0][0], varies: entries.length > 1 } : null;
    }
    const tipsSet = [...new Set(gs.map(TIPS).filter(Boolean))];
    const heat = gs.some(g => g.requires_heat);
    return { fields: res, tips: tipsSet, heat, count: gs.length,
      varieties: gs.map(g => ({ id: g.id, label: [g.series_name, g.series_variety].filter(Boolean).join(" ") || g.crop_name, cat: g.category })).filter(v => v.label).sort((a, b) => a.label.localeCompare(b.label)) };
  }, [crop, guides]);

  const detailGuide = variety && guides[crop] ? guides[crop].find(g => g.id === variety) : null;

  const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? 13 : 15 };
  const lab = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 };

  if (corpus === null) return <div style={{ padding: 24, color: C.muted, fontFamily: FONT }}>Loading the culture library…</div>;

  // ── crop list ──
  if (!crop) {
    return (
      <div style={{ fontFamily: FONT, maxWidth: 900, margin: "0 auto", padding: mobile ? "12px 12px 90px" : 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {onBack && <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.dark }}>←</button>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>🌱 Propagation Guide</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{crops.length} crops on file · culture facts + our notes, SOPs and timing</div>
          </div>
          {plan && !ro && (
            <button onClick={() => setPrefill(true)}
              style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT, border: `1.5px solid ${C.green}`, background: C.green, color: "#fff", whiteSpace: "nowrap" }}>
              🔗 Prefill {plan.name?.split(" ")[0] || "plan"}
            </button>
          )}
        </div>
        {prefill && plan && <PrefillPanel plan={plan} ours={ours} keyFor={keyFor} onClose={() => setPrefill(false)} />}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search a crop…"
            style={{ flex: 1, boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: FONT }} />
          {!ro && [["grid", "▦ Grid"], ["cards", "☷ Cards"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: "0 14px", borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT, border: `1.5px solid ${view === k ? C.dark : C.border}`, background: view === k ? C.dark : "#fff", color: view === k ? "#fff" : C.text }}>{l}</button>
          ))}
        </div>
        {view === "grid" && !ro ? (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["Crop", "Prop treatment", "Cell size", "Rooting wks", "Pinch", ""].map((h, i) => (
                <th key={i} style={{ position: "sticky", top: 0, background: "#eef3e8", textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {shownCrops.map(c => {
                  const gkc = keyFor(c.name), mn = ours[gkc] || {}, o = mn.overrides || {};
                  const set = patch => saveOurs(c.name, { overrides: { ...o, ...patch } });
                  const rootDefault = cropPropWeeks[c.name];
                  return (
                    <tr key={c.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "5px 10px", fontWeight: 700, color: C.dark, whiteSpace: "nowrap" }}>{c.name}</td>
                      <td style={{ padding: "4px 8px" }}>
                        <select value={o.prop_treatment || ""} onChange={e => { if (e.target.value === "__add") { addTreatment().then(n => n && set({ prop_treatment: n })); } else set({ prop_treatment: e.target.value || undefined }); }}
                          style={{ padding: "5px 6px", borderRadius: 7, border: `1px solid ${o.prop_treatment ? C.light : C.border}`, fontSize: 12.5, fontFamily: FONT, background: "#fff", minWidth: 150, cursor: "pointer" }}>
                          <option value="">— treatment —</option>
                          {treatments.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                          <option value="__add">＋ new template…</option>
                        </select>
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <input defaultValue={o.tray ?? ""} placeholder="e.g. 105" onBlur={e => { const v = e.target.value.trim(); if (v !== (o.tray ?? "")) set({ tray: v || undefined }); }}
                          style={{ width: 70, padding: "5px 7px", borderRadius: 7, border: `1px solid ${o.tray ? C.light : C.border}`, fontSize: 12.5, fontFamily: FONT }} />
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <input defaultValue={o.rooting_weeks ?? ""} placeholder={rootDefault || "—"} inputMode="decimal" onBlur={e => { const v = e.target.value.trim(); if (v !== (o.rooting_weeks ?? "")) set({ rooting_weeks: v || undefined }); }}
                          style={{ width: 56, padding: "5px 7px", textAlign: "right", borderRadius: 7, border: `1px solid ${o.rooting_weeks ? C.light : C.border}`, fontSize: 12.5, fontFamily: FONT }} />
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <div style={{ display: "flex", gap: 3 }}>
                          {["Yes", "No"].map(p => <button key={p} onClick={() => set({ pinch: o.pinch === p ? undefined : p })}
                            style={{ padding: "4px 9px", borderRadius: 7, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT, border: `1px solid ${o.pinch === p ? (p === "Yes" ? C.green : C.muted) : C.border}`, background: o.pinch === p ? (p === "Yes" ? C.green : C.muted) : "#fff", color: o.pinch === p ? "#fff" : C.text }}>{p}</button>)}
                        </div>
                      </td>
                      <td style={{ padding: "4px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => openCrop(c.name)} style={{ background: "none", border: "none", color: C.dark, cursor: "pointer", fontSize: 12, fontWeight: 700, textDecoration: "underline" }}>details ›</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 10 }}>
          {shownCrops.map(c => {
            const mine = ours[keyFor(c.name)];
            const done = mine && (mine.sop?.length || mine.our_notes || mine.overrides);
            return (
              <button key={c.name} onClick={() => openCrop(c.name)}
                style={{ ...card, textAlign: "left", cursor: "pointer", fontFamily: FONT, borderTopColor: done ? C.light : C.border, borderTopWidth: done ? 3 : 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.dark }}>{c.name}{done && <span style={{ color: C.green, marginLeft: 5 }}>✓</span>}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{c.n} {c.n === 1 ? "variety" : "varieties"}{mine?.sop?.length ? ` · SOP (${mine.sop.length})` : ""}</div>
              </button>
            );
          })}
        </div>
        )}
      </div>
    );
  }

  // ── crop detail ──
  const gk = keyFor(crop);
  const mine = ours[gk] || {};
  const ov = mine.overrides || {};
  const sop = mine.sop || [];
  return (
    <div style={{ fontFamily: FONT, maxWidth: 820, margin: "0 auto", padding: mobile ? "12px 12px 90px" : 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setCrop(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.dark }}>←</button>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>{crop}</div>
        {agg?.heat && <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: C.amber, padding: "2px 9px", borderRadius: 9 }}>needs bottom heat</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>{agg?.count || 0} varieties</span>
      </div>

      {/* Timing — the plan-feeding block */}
      <div style={{ ...card, borderColor: C.light, borderWidth: 1.5 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={lab}>Production timing</span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.muted }}>{ro ? "our value, else the culture default" : "your value overrides the culture default · feeds the plan"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
          {FIELDS.filter(f => f.timing).map(f => {
            const cult = agg?.fields[f.key]?.value;
            return (
              <div key={f.key}>
                <label style={{ ...lab, display: "block", marginBottom: 3 }}>{f.label}</label>
                {ro ? (
                  <div style={{ fontSize: 16, fontWeight: 800, color: (ov[f.key] || cult) ? C.dark : C.muted }}>{ov[f.key] || cult || "—"}{ov[f.key] ? "" : cult && agg.fields[f.key].varies ? "*" : ""}</div>
                ) : (
                  <input defaultValue={ov[f.key] ?? ""} placeholder={cult || "—"}
                    onBlur={e => { const v = e.target.value.trim(); if (v !== (ov[f.key] ?? "")) saveOurs(crop, { overrides: { ...ov, [f.key]: v || undefined } }); }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 9px", borderRadius: 8, border: `1.5px solid ${ov[f.key] ? C.light : C.border}`, fontSize: 14, fontWeight: 700, fontFamily: FONT }} />
                )}
                {!ro && cult && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>culture: {cult}{agg.fields[f.key].varies ? " (varies)" : ""}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Our SOP */}
      {(!ro || sop.length > 0) && (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={lab}>📋 Our SOP</span>
          {!ro && <button onClick={() => saveOurs(crop, { sop: [...sop, { step: "", detail: "" }] })}
            style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>＋ Add step</button>}
        </div>
        {!sop.length && <div style={{ fontSize: 12.5, color: C.muted }}>No SOP yet — build it over the season. Add the steps your crew follows for this crop.</div>}
        {sop.map((s, i) => ro ? (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", borderBottom: i < sop.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.light, minWidth: 22 }}>{i + 1}.</span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{s.step || "—"}</div>{s.detail && <div style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>{s.detail}</div>}</div>
          </div>
        ) : (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderBottom: i < sop.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.light, minWidth: 22 }}>{i + 1}.</span>
            <div style={{ flex: 1 }}>
              <input defaultValue={s.step} placeholder="step (e.g. Stick into 105s)"
                onBlur={e => { if (e.target.value !== s.step) saveOurs(crop, { sop: sop.map((x, j) => j === i ? { ...x, step: e.target.value } : x) }); }}
                style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13.5, fontWeight: 700, fontFamily: FONT }} />
              <textarea defaultValue={s.detail} placeholder="detail / notes…" rows={1}
                onBlur={e => { if (e.target.value !== s.detail) saveOurs(crop, { sop: sop.map((x, j) => j === i ? { ...x, detail: e.target.value } : x) }); }}
                style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: FONT, marginTop: 4, resize: "vertical" }} />
            </div>
            <button onClick={() => saveOurs(crop, { sop: sop.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        ))}
      </div>
      )}

      {/* Our notes */}
      {(!ro || mine.our_notes) && (
      <div style={card}>
        <div style={lab}>📝 Our notes — our setup</div>
        {ro ? <div style={{ fontSize: 13.5, color: C.text, marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{mine.our_notes || "—"}</div>
          : <textarea defaultValue={mine.our_notes || ""} placeholder="notes specific to our greenhouse — bench, mist zone, timing quirks, what worked…"
              rows={3} onBlur={e => { if (e.target.value !== (mine.our_notes || "")) saveOurs(crop, { our_notes: e.target.value }); }}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 13.5, fontFamily: FONT, marginTop: 6, resize: "vertical", lineHeight: 1.45 }} />}
      </div>
      )}

      {/* Culture reference */}
      <div style={card}>
        <div style={{ ...lab, marginBottom: 8 }}>📖 Culture reference {agg && `· ${agg.count} varieties`}</div>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3,1fr)", gap: "8px 14px" }}>
          {FIELDS.filter(f => !f.timing).map(f => { const v = agg?.fields[f.key]; return v ? (
            <div key={f.key} style={{ fontSize: 12.5 }}>
              <div style={{ ...lab, fontSize: 9.5 }}>{f.label}</div>
              <div style={{ color: C.text, fontWeight: 600 }}>{v.value}{v.varies && <span style={{ color: C.muted, fontWeight: 400 }}> ·varies</span>}</div>
            </div>
          ) : null; })}
        </div>
        {agg?.tips?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ ...lab, fontSize: 9.5, marginBottom: 3 }}>Tips</div>
            {agg.tips.slice(0, 4).map((t, i) => <div key={i} style={{ fontSize: 12.5, color: C.text, padding: "2px 0" }}>• {t}</div>)}
          </div>
        )}
      </div>

      {/* Varieties + PDFs */}
      {agg?.varieties?.length > 0 && (
        <div style={card}>
          <div style={{ ...lab, marginBottom: 6 }}>Varieties on file — tap for exact culture + PDF</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {agg.varieties.slice(0, 60).map(v => (
              <button key={v.id} onClick={() => setVariety(variety === v.id ? null : v.id)}
                style={{ padding: "5px 10px", borderRadius: 14, border: `1px solid ${variety === v.id ? C.light : C.border}`, background: variety === v.id ? C.light : "#fff", color: variety === v.id ? "#fff" : C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>{v.label}</button>
            ))}
          </div>
          {detailGuide && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.dark }}>{[detailGuide.series_name, detailGuide.series_variety].filter(Boolean).join(" ")} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>· {detailGuide.category}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3,1fr)", gap: "6px 14px", marginTop: 6 }}>
                {FIELDS.map(f => { const v = f.get(detailGuide); return v ? (
                  <div key={f.key} style={{ fontSize: 12 }}><span style={{ color: C.muted }}>{f.label}:</span> <b style={{ color: C.text }}>{v}</b></div>
                ) : null; })}
              </div>
              {TIPS(detailGuide) && <div style={{ fontSize: 12, color: C.text, marginTop: 6 }}>💡 {TIPS(detailGuide)}</div>}
              {pdfOf(detailGuide) && <a href={pdfOf(detailGuide)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, padding: "7px 13px", borderRadius: 8, background: C.dark, color: C.cream, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>📄 Culture guide PDF</a>}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: C.muted, textAlign: "center" }}>Timing overrides you set here will prefill production time + prop tasks when a plan is built for this crop.</div>
    </div>
  );
}

// ── Phase 2: prefill a plan's production time + prop tasks from the guide ──────
const PROPPED = m => /^(URC|CALL|SEED)/i.test(m || "");   // gets a prop tray + rooting time
function isoWeekMonday(year, week) {
  const s = new Date(Date.UTC(+year, 0, 1 + (week - 1) * 7));
  const dow = s.getUTCDay();
  if (dow <= 4) s.setUTCDate(s.getUTCDate() - dow + 1);
  else s.setUTCDate(s.getUTCDate() + 8 - dow);
  return s.toISOString().slice(0, 10);
}
function isoWeekOf(dateStr) {
  const t = new Date(dateStr); t.setHours(0, 0, 0, 0);
  const dn = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dn + 3);
  const f = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - f) / 86400000 - 3 + (f.getDay() + 6) % 7) / 7);
}

function PrefillPanel({ plan, ours, keyFor, onClose }) {
  const sb = getSupabase();
  const [groups, setGroups] = useState(null);
  const [sel, setSel] = useState({});          // crop -> bool
  const [makeTasks, setMakeTasks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    (async () => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.from("scheduled_crops")
          .select("id,item_name,variety_id,prop_method,prop_tray_size,plant_week,plant_year,ship_week,ready_week,is_combo_component,qty_pots")
          .eq("plan_id", plan.id).range(from, from + 999);
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const vIds = [...new Set(rows.map(r => r.variety_id).filter(Boolean))];
      const vmap = {};
      for (let i = 0; i < vIds.length; i += 500) {
        const { data: vs } = await sb.from("variety_library").select("id,crop_name,variety").in("id", vIds.slice(i, i + 500));
        (vs || []).forEach(v => { vmap[v.id] = v; });
      }
      const byCrop = {};
      rows.forEach(r => {
        const crop = (vmap[r.variety_id]?.crop_name || "").trim();
        if (!crop || !PROPPED(r.prop_method)) return;
        (byCrop[crop] = byCrop[crop] || []).push(r);
      });
      const gs = [];
      Object.entries(byCrop).forEach(([crop, rs]) => {
        const o = ours[keyFor(crop)]?.overrides || {};
        if (!o.tray && !o.rooting_weeks && !o.pinch) return;   // nothing in the guide to apply
        const trays = [...new Set(rs.map(r => r.prop_tray_size).filter(Boolean))];
        const leads = rs.map(r => (r.plant_week != null && r.ship_week != null) ? r.plant_week - r.ship_week : null).filter(x => x != null);
        gs.push({
          crop, rows: rs, guide: o,
          curTray: trays.join(", ") || "—",
          curLead: leads.length ? (Math.round(leads.reduce((a, b) => a + b, 0) / leads.length * 10) / 10) : null,
        });
      });
      gs.sort((a, b) => a.crop.localeCompare(b.crop));
      setGroups(gs);
      setSel(Object.fromEntries(gs.map(g => [g.crop, true])));
    })();
  }, [sb, plan.id]); // eslint-disable-line

  async function apply() {
    setBusy(true);
    let rowsUpdated = 0, tasksMade = 0;
    for (const g of (groups || [])) {
      if (!sel[g.crop]) continue;
      const root = g.guide.rooting_weeks != null && g.guide.rooting_weeks !== "" ? +g.guide.rooting_weeks : null;
      for (const r of g.rows) {
        const patch = {};
        if (g.guide.tray) patch.prop_tray_size = String(g.guide.tray);
        if (root != null && !Number.isNaN(root) && r.plant_week != null) patch.ship_week = r.plant_week - root;
        if (Object.keys(patch).length) { await sb.from("scheduled_crops").update(patch).eq("id", r.id); rowsUpdated++; }
      }
      if (makeTasks) tasksMade += await genTasks(g, root);
    }
    setDone({ rowsUpdated, tasksMade });
    setBusy(false);
  }

  async function genTasks(g, root) {
    let made = 0;
    // one task set per distinct plant week among this crop's rows
    const weeks = {};
    g.rows.forEach(r => { if (r.plant_week != null) { const k = `${r.plant_year || plan.year || new Date().getFullYear()}|${r.plant_week}`; weeks[k] = { year: +(r.plant_year || plan.year || new Date().getFullYear()), plantWk: r.plant_week }; } });
    for (const { year, plantWk } of Object.values(weeks)) {
      const stickWk = root != null ? plantWk - root : null;
      const set = [];
      if (stickWk != null) set.push({ wk: stickWk, title: `Stick ${g.crop} (wk ${stickWk})`, desc: `Stick unrooted/callused ${g.crop} into ${g.guide.tray || "prop"} trays.${g.guide.prop_treatment ? ` Treatment: ${g.guide.prop_treatment}.` : ""}${root != null ? ` Root ~${root} wk before transplant.` : ""}` });
      set.push({ wk: plantWk, title: `Transplant ${g.crop} (wk ${plantWk})`, desc: `Move rooted ${g.crop} liners from prop into final containers.` });
      if (g.guide.pinch === "Yes") set.push({ wk: plantWk + 2, title: `Pinch ${g.crop} (wk ${plantWk + 2})`, desc: `Soft-pinch ${g.crop} ~2 wk after transplant to build habit.` });
      for (const t of set) {
        const date = isoWeekMonday(year, t.wk);
        const { data: ex } = await sb.from("manager_tasks").select("id").eq("plan_id", plan.id).eq("target_date", date).eq("title", t.title).limit(1);
        if (ex && ex.length) continue;
        await sb.from("manager_tasks").insert({
          plan_id: plan.id, category: "production", title: t.title, description: t.desc,
          target_date: date, priority: 3, status: "pending",
          week_number: isoWeekOf(date), year: new Date(date).getFullYear(), created_by: "auto:prop-guide",
        });
        made++;
      }
    }
    return made;
  }

  const P = C, overlay = { position: "fixed", inset: 0, background: "rgba(20,30,16,.5)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 12px", overflow: "auto" };
  const selCount = Object.values(sel).filter(Boolean).length;
  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 760, width: "100%", padding: 20, fontFamily: FONT, boxShadow: "0 12px 40px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1, fontSize: 19, fontWeight: 800, color: P.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>🔗 Prefill {plan.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: P.muted }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: P.muted, marginBottom: 14 }}>Applies your guide timing to this plan's propagated crops: sets the prop tray/cell, backs the stick week off the plant week by your rooting time, and (optionally) drops stick / transplant / pinch tasks onto the plan.</div>

        {groups === null && <div style={{ color: P.muted, padding: 20 }}>Scanning plan crops…</div>}
        {groups && !groups.length && <div style={{ color: P.muted, padding: 20, textAlign: "center" }}>No matches. Set tray / rooting weeks / pinch on crops in the guide grid, and make sure the plan has propagated (URC/CALL/SEED) rows for those crops.</div>}

        {groups && !!groups.length && !done && (
          <>
            <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, overflow: "auto", maxHeight: "48vh" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr>{["", "Crop", "Rows", "Tray now → guide", "Prop lead now → guide", "Pinch"].map((h, i) => (
                  <th key={i} style={{ position: "sticky", top: 0, background: "#eef3e8", textAlign: i > 2 ? "left" : "left", padding: "7px 9px", fontSize: 10, fontWeight: 800, color: P.muted, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.crop} style={{ borderBottom: `1px solid ${P.border}` }}>
                      <td style={{ padding: "5px 9px" }}><input type="checkbox" checked={!!sel[g.crop]} onChange={e => setSel(s => ({ ...s, [g.crop]: e.target.checked }))} /></td>
                      <td style={{ padding: "5px 9px", fontWeight: 700, color: P.dark }}>{g.crop}</td>
                      <td style={{ padding: "5px 9px", color: P.muted }}>{g.rows.length}</td>
                      <td style={{ padding: "5px 9px" }}>{g.curTray} {g.guide.tray ? <b style={{ color: P.green }}>→ {g.guide.tray}</b> : <span style={{ color: P.muted }}>(no change)</span>}</td>
                      <td style={{ padding: "5px 9px" }}>{g.curLead != null ? `${g.curLead}w` : "—"} {g.guide.rooting_weeks ? <b style={{ color: P.green }}>→ {g.guide.rooting_weeks}w</b> : <span style={{ color: P.muted }}>(no change)</span>}</td>
                      <td style={{ padding: "5px 9px" }}>{g.guide.pinch || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 2px", fontSize: 13, color: P.text, cursor: "pointer" }}>
              <input type="checkbox" checked={makeTasks} onChange={e => setMakeTasks(e.target.checked)} />
              Also generate stick / transplant{groups.some(g => sel[g.crop] && g.guide.pinch === "Yes") ? " / pinch" : ""} tasks (idempotent — won't duplicate)
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${P.border}`, background: "#fff", color: P.text, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              <button disabled={busy || !selCount} onClick={apply} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: selCount ? P.green : P.border, color: "#fff", fontWeight: 800, cursor: selCount ? "pointer" : "default", fontFamily: FONT }}>{busy ? "Applying…" : `Apply to ${selCount} crop${selCount === 1 ? "" : "s"}`}</button>
            </div>
          </>
        )}

        {done && (
          <div style={{ textAlign: "center", padding: "18px 8px" }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: P.dark }}>Prefill applied</div>
            <div style={{ fontSize: 13, color: P.muted, marginTop: 6 }}>{done.rowsUpdated} scheduled-crop row{done.rowsUpdated === 1 ? "" : "s"} updated{makeTasks ? ` · ${done.tasksMade} prop task${done.tasksMade === 1 ? "" : "s"} created` : ""}.</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: "10px 22px", borderRadius: 10, border: "none", background: P.dark, color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
