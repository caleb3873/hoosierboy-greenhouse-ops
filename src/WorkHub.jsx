// WorkHub — grower-initiated work tasks in three categories:
//   💧 Application (spray/drench)  🧪 Fertigation  ✋ Hand Work (pinch, space, …)
// Tasks flow through the normal manager_tasks claim → complete machinery.
// Completing an application/fertigation task auto-writes the compliance record
// (spray_records) — applicator, date/time, product, EPA #, rate, REI — so the
// state chemist log is a byproduct of doing the work, never a separate chore.
import { useMemo, useState } from "react";
import { getSupabase, useChemProducts, useSprayRecords } from "./supabase";
import { APPLICATION_METHODS, REI_PRESETS, uid } from "./shared";
import { bucketToDate } from "./ManagerTasksView";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const GREEN_DARK = "#1e2d1a";
const GREEN = "#7fb069";
const AMBER = "#e89a3a";
const RED = "#d94f3d";

export const WORK_KINDS = [
  { id: "application", label: "Application", icon: "💧", color: "#4a90d9", sub: "Spray · drench · fog" },
  { id: "fertigation", label: "Fertigation", icon: "🧪", color: "#8e5aa8", sub: "Fertilizer · injection" },
  { id: "handwork",    label: "Hand Work",   icon: "✋", color: AMBER,     sub: "Pinch · space · clean" },
];

export const HAND_WORK_TYPES = [
  "Pinching", "Spacing", "Cleaning", "Trimming", "Sticking", "Weeding", "Moving", "Other",
];

function isoWeekOf(iso) {
  const d = new Date(iso + "T12:00:00");
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((dt - ys) / 86400000) + 1) / 7), year: dt.getUTCFullYear() };
}

// ── Compliance logging ────────────────────────────────────────────────────────
// Called when an application/fertigation task completes. Idempotent per task.
// Writes the spray_records ledger row and, if an REI applies, fires a push so
// nobody walks into the treated area.
export async function logWorkCompliance(task, completedBy, completedAtISO) {
  const sb = getSupabase();
  const wp = task?.workPayload;
  const kind = task?.sourceKind;
  if (!sb || !wp || (kind !== "application" && kind !== "fertigation")) return;
  const { data: existing } = await sb.from("spray_records").select("id").eq("task_id", task.id).limit(1);
  if (existing && existing.length) return; // already logged
  const appliedAt = completedAtISO || new Date().toISOString();
  const reiHours = Number(wp.rei_hours) || null;
  const reiExpires = reiHours ? new Date(new Date(appliedAt).getTime() + reiHours * 3600000).toISOString() : null;
  await sb.from("spray_records").insert({
    id: uid(),
    category: kind,
    task_id: task.id,
    product_id: wp.product_id || null,
    grower_name: completedBy || task.completedBy || null,
    product_name: wp.product_name || null,
    epa_reg_number: wp.epa_reg_number || null,
    active_ingredient: wp.active_ingredient || null,
    application_method: wp.method || (kind === "fertigation" ? "fertigation" : null),
    rate: wp.rate || null,
    total_volume: wp.total_volume || null,
    target_pest: wp.target_pest || null,
    crop: wp.crop || null,
    houses: wp.houses || null,
    house_name: wp.houses || null,
    applied_at: appliedAt,
    rei_hours: reiHours,
    rei_expires_at: reiExpires,
    notes: wp.notes || null,
  });
  if (reiExpires && new Date(reiExpires) > new Date()) {
    const until = new Date(reiExpires).toLocaleString("en-US", {
      timeZone: "America/Indiana/Indianapolis", weekday: "short", hour: "numeric", minute: "2-digit",
    });
    fetch("/api/notify-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "rei_started",
        title: `${wp.product_name || "Application"}${wp.houses ? ` — ${wp.houses}` : ""} · no entry until ${until}`,
      }),
    }).catch(() => {});
  }
}

// ── REI banner ────────────────────────────────────────────────────────────────
// Shows every area currently under a re-entry interval. Drop into any view.
export function ReiBanner() {
  const { rows } = useSprayRecords();
  const active = useMemo(() => {
    const now = new Date();
    return (rows || [])
      .filter(r => r.reiExpiresAt && new Date(r.reiExpiresAt) > now)
      .sort((a, b) => (a.reiExpiresAt || "").localeCompare(b.reiExpiresAt || ""));
  }, [rows]);
  if (!active.length) return null;
  return (
    <div style={{ margin: "8px 12px 0", background: "#3a1e18", border: `1.5px solid ${RED}`, borderRadius: 10, padding: "10px 12px", ...FONT }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#ffb3a8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
        ⚠️ Re-Entry Restricted — do not enter
      </div>
      {active.map(r => (
        <div key={r.id} style={{ fontSize: 12.5, color: "#ffd9d2", marginTop: 2 }}>
          <b>{r.houses || r.houseName || "Area"}</b> — {r.productName}
          {" · until "}
          {new Date(r.reiExpiresAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
        </div>
      ))}
    </div>
  );
}

// ── New Work modal ────────────────────────────────────────────────────────────
// Structured quick-create. Parent passes the manager_tasks upsert + task list
// (for priority) and refreshes on close.
export function NewWorkModal({ tasks, upsert, createdBy, defaultLocation = "bluff", onClose, onCreated }) {
  const { rows: products, insert: insertProduct } = useChemProducts();
  const [kind, setKind] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // shared fields
  const [bucket, setBucket] = useState("today");
  const [location, setLocation] = useState(defaultLocation);
  const [houses, setHouses] = useState("");
  const [crop, setCrop] = useState("");
  const [notes, setNotes] = useState("");
  // application / fertigation
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [method, setMethod] = useState("spray");
  const [rate, setRate] = useState("");
  const [totalVolume, setTotalVolume] = useState("");
  const [targetPest, setTargetPest] = useState("");
  const [reiHours, setReiHours] = useState("");
  const [customRei, setCustomRei] = useState("");
  // new-product inline form
  const [addingProduct, setAddingProduct] = useState(false);
  const [np, setNp] = useState({ name: "", epa: "", ai: "", rate: "", rei: "", signal: "" });
  // hand work
  const [handType, setHandType] = useState("Pinching");
  const [handDetail, setHandDetail] = useState("");

  const isFert = kind === "fertigation";
  const pickList = useMemo(() => (products || [])
    .filter(p => p.active !== false)
    .filter(p => isFert ? p.productType === "fertigation" : p.productType !== "fertigation")
    .sort((a, b) => (a.name || "").localeCompare(b.name || "")), [products, isFert]);
  const selectedProduct = pickList.find(p => p.id === productId) || null;

  function pickProduct(p) {
    setProductId(p.id);
    setProductName(p.name);
    if (p.defaultRate) setRate(p.defaultRate);
    if (p.reiHours != null && p.reiHours !== "") setReiHours(String(p.reiHours));
  }

  async function saveNewProduct() {
    if (!np.name.trim()) return;
    const row = {
      id: crypto.randomUUID(),
      name: np.name.trim(),
      productType: isFert ? "fertigation" : method === "drench" ? "drench" : "spray",
      epaRegNumber: np.epa.trim() || null,
      activeIngredient: np.ai.trim() || null,
      defaultRate: np.rate.trim() || null,
      reiHours: np.rei !== "" ? Number(np.rei) : null,
      signalWord: np.signal.trim() || null,
      active: true,
    };
    await insertProduct(row);
    pickProduct(row);
    setAddingProduct(false);
    setNp({ name: "", epa: "", ai: "", rate: "", rei: "", signal: "" });
  }

  function composed() {
    const effectiveRei = reiHours === "custom" ? (Number(customRei) || null) : (Number(reiHours) || null);
    if (kind === "application") {
      const m = APPLICATION_METHODS.find(x => x.id === method);
      return {
        title: `💧 ${m?.label || "Apply"}: ${productName}${rate ? ` @ ${rate}` : ""}${houses ? ` — ${houses}` : ""}`,
        description: [
          targetPest && `Target: ${targetPest}`,
          crop && `Crop: ${crop}`,
          effectiveRei && `REI ${effectiveRei}h after application`,
          selectedProduct?.signalWord && `Signal word: ${selectedProduct.signalWord}`,
        ].filter(Boolean).join(" · ") || null,
        payload: {
          kind, product_id: productId || null, product_name: productName,
          epa_reg_number: selectedProduct?.epaRegNumber || null,
          active_ingredient: selectedProduct?.activeIngredient || null,
          method, rate: rate || null, total_volume: totalVolume || null,
          target_pest: targetPest || null, rei_hours: effectiveRei,
          crop: crop || null, houses: houses || null, notes: notes || null,
        },
      };
    }
    if (kind === "fertigation") {
      return {
        title: `🧪 Fertigate: ${productName}${rate ? ` @ ${rate}` : ""}${houses ? ` — ${houses}` : ""}`,
        description: crop ? `Crop: ${crop}` : null,
        payload: {
          kind, product_id: productId || null, product_name: productName,
          epa_reg_number: selectedProduct?.epaRegNumber || null,
          active_ingredient: selectedProduct?.activeIngredient || null,
          method: "fertigation", rate: rate || null, total_volume: totalVolume || null,
          rei_hours: null, crop: crop || null, houses: houses || null, notes: notes || null,
        },
      };
    }
    return {
      title: `✋ ${handType}${crop ? `: ${crop}` : ""}${houses ? ` — ${houses}` : ""}`,
      description: handDetail || null,
      payload: { kind, hand_type: handType, crop: crop || null, houses: houses || null, notes: notes || null },
    };
  }

  const canSave = kind === "handwork"
    ? !!handType
    : !!productName.trim();

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const { title, description, payload } = composed();
      const targetDate = bucketToDate(bucket);
      const wi = isoWeekOf(targetDate);
      const maxPriority = Math.max(0, ...(tasks || [])
        .filter(t => t.year === wi.year && t.weekNumber === wi.week && (t.category || "production") === "growing")
        .map(t => t.priority || 0));
      await upsert({
        id: crypto.randomUUID(),
        title,
        description,
        priority: maxPriority + 10,
        weekNumber: wi.week,
        year: wi.year,
        status: "pending",
        category: "growing",
        bucket,
        targetDate,
        carriedOver: false,
        createdBy: createdBy || "Grower",
        assignedTo: null,
        assignees: [],
        location,
        photos: [],
        sourceKind: kind,
        workPayload: payload,
        notes: notes || null,
      });
      fetch("/api/notify-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "task_created", title, category: "growing", bucket }),
      }).catch(() => {});
      onCreated && onCreated();
      onClose();
    } catch (e) {
      setError(e.message || "Save failed");
      setSaving(false);
    }
  }

  const input = {
    width: "100%", padding: 11, borderRadius: 10, border: "1.5px solid #c8d8c0",
    fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", background: "#fff",
  };
  const label = { fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, display: "block", margin: "12px 0 5px" };
  const chip = (active, color = GREEN) => ({
    padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${active ? color : "#c8d8c0"}`,
    background: active ? color : "#fff", color: active ? "#fff" : "#5a6a54",
    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  });

  const BUCKETS = [
    { id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" },
    { id: "check_tomorrow", label: "Day After" }, { id: "this_week", label: "This Week" },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f2f5ef", borderRadius: "20px 20px 0 0", padding: "20px 18px 26px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", color: GREEN_DARK }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {kind ? `${WORK_KINDS.find(k => k.id === kind).icon} ${WORK_KINDS.find(k => k.id === kind).label}` : "New Work"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 26, color: "#7a8c74", cursor: "pointer" }}>&times;</button>
        </div>

        {/* Step 1 — pick a category */}
        {!kind && (
          <>
            <div style={{ fontSize: 12.5, color: "#7a8c74", marginBottom: 14 }}>
              What kind of work? It goes straight on the task board — applications log themselves for state records when completed.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {WORK_KINDS.map(k => (
                <button key={k.id} onClick={() => setKind(k.id)} style={{
                  display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                  background: "#fff", border: "1.5px solid #dce6d4", borderLeft: `5px solid ${k.color}`,
                  borderRadius: 14, padding: "16px 16px", cursor: "pointer", fontFamily: "inherit",
                }}>
                  <span style={{ fontSize: 30 }}>{k.icon}</span>
                  <span>
                    <div style={{ fontSize: 16, fontWeight: 800, color: GREEN_DARK }}>{k.label}</div>
                    <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{k.sub}</div>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2 — details */}
        {kind && (
          <>
            <button onClick={() => setKind(null)} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0 0", fontFamily: "inherit" }}>← change type</button>

            {(kind === "application" || kind === "fertigation") && (
              <>
                <span style={label}>{isFert ? "Fertilizer" : "Product"}</span>
                {!addingProduct && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {pickList.map(p => (
                        <button key={p.id} onClick={() => pickProduct(p)} style={chip(productId === p.id, "#4a90d9")}>
                          {p.name}
                        </button>
                      ))}
                      <button onClick={() => { setAddingProduct(true); setProductId(""); }} style={{ ...chip(false), borderStyle: "dashed" }}>
                        + New {isFert ? "fertilizer" : "product"}
                      </button>
                    </div>
                    {pickList.length === 0 && (
                      <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 6 }}>No products in the library yet — add the first one.</div>
                    )}
                    {selectedProduct && (
                      <div style={{ fontSize: 11.5, color: "#7a8c74", marginTop: 6 }}>
                        {selectedProduct.epaRegNumber ? `EPA ${selectedProduct.epaRegNumber}` : "No EPA # on file"}
                        {selectedProduct.activeIngredient ? ` · ${selectedProduct.activeIngredient}` : ""}
                        {selectedProduct.reiHours != null ? ` · REI ${selectedProduct.reiHours}h` : ""}
                        {selectedProduct.moa ? ` · ${selectedProduct.moa}` : ""}
                      </div>
                    )}
                  </>
                )}
                {addingProduct && (
                  <div style={{ background: "#fff", border: "1.5px solid #dce6d4", borderRadius: 12, padding: 12, marginTop: 2 }}>
                    <input style={input} placeholder={isFert ? "Fertilizer name (e.g. 20-10-20 Peat-Lite)" : "Product name (e.g. Avid 0.15EC)"} value={np.name} onChange={e => setNp(v => ({ ...v, name: e.target.value }))} />
                    {!isFert && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input style={input} placeholder="EPA Reg. #" value={np.epa} onChange={e => setNp(v => ({ ...v, epa: e.target.value }))} />
                        <input style={input} placeholder="Active ingredient" value={np.ai} onChange={e => setNp(v => ({ ...v, ai: e.target.value }))} />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input style={input} placeholder={isFert ? "Default rate (e.g. 200ppm)" : "Default rate (e.g. 8 oz/100 gal)"} value={np.rate} onChange={e => setNp(v => ({ ...v, rate: e.target.value }))} />
                      {!isFert && <input style={input} placeholder="REI hours" inputMode="numeric" value={np.rei} onChange={e => setNp(v => ({ ...v, rei: e.target.value }))} />}
                      {!isFert && <input style={input} placeholder="Signal word" value={np.signal} onChange={e => setNp(v => ({ ...v, signal: e.target.value }))} />}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={() => setAddingProduct(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={saveNewProduct} disabled={!np.name.trim()} style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: np.name.trim() ? GREEN_DARK : "#c8d8c0", color: "#c8e6b8", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Save to library</button>
                    </div>
                  </div>
                )}

                {kind === "application" && (
                  <>
                    <span style={label}>Method</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {APPLICATION_METHODS.map(m => (
                        <button key={m.id} onClick={() => setMethod(m.id)} style={chip(method === m.id)}>{m.icon} {m.label}</button>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <span style={label}>Rate</span>
                    <input style={input} placeholder={isFert ? "e.g. 200 ppm" : "e.g. 8 oz/100 gal"} value={rate} onChange={e => setRate(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={label}>Total volume</span>
                    <input style={input} placeholder="e.g. 100 gal" value={totalVolume} onChange={e => setTotalVolume(e.target.value)} />
                  </div>
                </div>

                {kind === "application" && (
                  <>
                    <span style={label}>Target pest / disease</span>
                    <input style={input} placeholder="e.g. thrips, aphids, botrytis" value={targetPest} onChange={e => setTargetPest(e.target.value)} />
                    <span style={label}>REI (re-entry interval)</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {REI_PRESETS.map(p => {
                        const val = p.hours == null ? "custom" : String(p.hours);
                        return (
                          <button key={p.label} onClick={() => setReiHours(reiHours === val ? "" : val)} style={chip(reiHours === val, RED)}>{p.label}</button>
                        );
                      })}
                      {reiHours === "custom" && (
                        <input style={{ ...input, width: 90 }} placeholder="hours" inputMode="numeric" value={customRei} onChange={e => setCustomRei(e.target.value)} />
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {kind === "handwork" && (
              <>
                <span style={label}>Type of work</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {HAND_WORK_TYPES.map(t => (
                    <button key={t} onClick={() => setHandType(t)} style={chip(handType === t, AMBER)}>{t}</button>
                  ))}
                </div>
                <span style={label}>Details</span>
                <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} placeholder="What exactly needs doing? e.g. pinch to 5 nodes, space to 12&quot; centers" value={handDetail} onChange={e => setHandDetail(e.target.value)} />
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={label}>Crop / variety</span>
                <input style={input} placeholder="e.g. 8&quot; garden mums" value={crop} onChange={e => setCrop(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={label}>Houses / benches</span>
                <input style={input} placeholder="e.g. Bluff H4–6" value={houses} onChange={e => setHouses(e.target.value)} />
              </div>
            </div>

            <span style={label}>Location</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["bluff", "sprague"].map(l => (
                <button key={l} onClick={() => setLocation(l)} style={chip(location === l)}>{l === "bluff" ? "Bluff" : "Sprague"}</button>
              ))}
            </div>

            <span style={label}>When</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {BUCKETS.map(b => (
                <button key={b.id} onClick={() => setBucket(b.id)} style={chip(bucket === b.id)}>{b.label}</button>
              ))}
            </div>

            <span style={label}>Notes</span>
            <textarea style={{ ...input, minHeight: 56, resize: "vertical" }} placeholder="Anything else the person doing this should know" value={notes} onChange={e => setNotes(e.target.value)} />

            {error && <div style={{ color: RED, fontSize: 13, fontWeight: 700, marginTop: 10 }}>{error}</div>}

            <button onClick={save} disabled={!canSave || saving} style={{
              width: "100%", marginTop: 16, padding: "15px 0", borderRadius: 12, border: "none",
              background: canSave && !saving ? GREEN_DARK : "#c8d8c0", color: "#c8e6b8",
              fontSize: 15, fontWeight: 800, cursor: canSave && !saving ? "pointer" : "default", fontFamily: "inherit",
            }}>
              {saving ? "Saving…" : "Add to Task Board"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
