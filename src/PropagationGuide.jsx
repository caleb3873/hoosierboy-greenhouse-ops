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

export default function PropagationGuide({ mobile, onBack, readOnly }) {
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
    })();
  }, [sb, cc]); // eslint-disable-line

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
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>🌱 Propagation Guide</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{crops.length} crops on file · culture facts + our notes, SOPs and timing</div>
          </div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search a crop…"
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: FONT, marginBottom: 12 }} />
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
