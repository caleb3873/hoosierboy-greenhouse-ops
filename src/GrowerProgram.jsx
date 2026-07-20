// GrowerProgram — the head grower's planner-side workspace.
//   📅 Program     — the 52-week spray + beneficial plan, editable, generates tasks
//   🔄 Rotation    — per-pest IRAC/FRAC sequence with resistance warnings
//   🐞 Beneficials — release ledger + species library + spend
//   🧪 Products    — library w/ pest search, costs, doses, best practices
//   🔧 Equipment   — sprayers/injectors + fertigation tank recipes
//   📒 Records · 🔬 Purdue — shared with the Work Hub
//
// Task creation itself lives in the normal task app; this page is for planning,
// costing and the decisions behind the tasks.
import { useMemo, useState } from "react";
import {
  useSprayProgram, useChemProducts, useManagerTasks, useSprayRecords,
  useDrenchDoses, useFertigationRecipes, useApplicationEquipment,
  useBeneficialProducts, useBeneficialReleases,
} from "./supabase";
import { useAuth } from "./Auth";
import { RecordsTab, ProductsTab, PurdueTab } from "./WorkRecords";
import { bucketToDate } from "./ManagerTasksView";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const MUTED = "#7a8c74";
const RED = "#d94f3d";
const AMBER = "#e89a3a";
const BLUE = "#3a6ea8";

const TABS = [
  ["program", "📅 Program"], ["rotation", "🔄 Rotation"], ["beneficials", "🐞 Beneficials"],
  ["products", "🧪 Products"], ["equipment", "🔧 Equipment"], ["records", "📒 Records"], ["purdue", "🔬 Purdue"],
];

const LOCATIONS = [
  { id: "", label: "All houses" }, { id: "west", label: "West" }, { id: "main", label: "Main" },
  { id: "main+quonsets", label: "Main + Quonsets" }, { id: "sprague", label: "Sprague" },
  { id: "houseplants", label: "Houseplants" }, { id: "bluff", label: "Bluff" },
];

const input = {
  width: "100%", padding: 9, borderRadius: 8, border: "1.5px solid #c8d8c0",
  fontSize: 13, fontFamily: FONT, boxSizing: "border-box", outline: "none", background: "#fff",
};
const btn = (bg = DARK, color = "#c8e6b8") => ({
  padding: "9px 16px", borderRadius: 9, border: "none", background: bg, color,
  fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
});
const card = { background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 14, marginBottom: 10 };
const money = n => n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function currentWeek() {
  const d = new Date();
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((dt - ys) / 86400000) + 1) / 7), year: dt.getUTCFullYear() };
}

// "8 oz/100 gal" | "15oz" (assumed per 100 gal) | "3.2 oz/10,000 ft" | "200 ppm"
export function parseRate(rate) {
  if (!rate) return null;
  const s = String(rate).toLowerCase().replace(/,/g, "");
  if (/ppm/.test(s)) return { kind: "ppm", amount: parseFloat(s), unit: "ppm" };
  const m = s.match(/([\d.]+)\s*(oz|lb|lbs|g|gram|grams|ml|gal)\b/);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  let unit = m[2].replace(/^lbs$/, "lb").replace(/^gram(s)?$/, "g");
  const per = s.match(/\/\s*([\d.]+)?\s*(gal|ft)/);
  if (per && per[2] === "ft") return { kind: "area", amount, unit, per: parseFloat(per[1] || 10000) };
  const perGal = per && per[1] ? parseFloat(per[1]) : 100; // industry convention: per 100 gal
  return { kind: "volume", amount, unit, per: perGal };
}

// oz of product for a given tank size, plus cost when the library knows the price
export function computeDose(rate, tankGal, product) {
  const p = parseRate(rate);
  if (!p || p.kind !== "volume" || !tankGal) return null;
  const amount = (p.amount * tankGal) / p.per;
  let oz = amount;
  if (p.unit === "lb") oz = amount * 16;
  else if (p.unit === "g") oz = amount / 28.35;
  else if (p.unit === "ml") oz = amount / 29.57;
  else if (p.unit === "gal") oz = amount * 128;
  const cost = product?.costPerUnit != null ? oz * Number(product.costPerUnit) : null;
  return { amount: Math.round(amount * 100) / 100, unit: p.unit, oz, cost };
}

export default function GrowerProgram() {
  const [tab, setTab] = useState("program");
  return (
    <div style={{ fontFamily: FONT }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: DARK, fontSize: 27, margin: "0 0 3px" }}>Grower Program</h2>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
        The spray and beneficial plan, what it costs, and the reference behind it. Tasks are created from here into the normal task board.
      </div>
      <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "9px 15px", borderRadius: 9, border: `1.5px solid ${tab === id ? GREEN : "#c8d8c0"}`,
            background: tab === id ? GREEN : "#fff", color: tab === id ? "#fff" : MUTED,
            fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT,
          }}>{l}</button>
        ))}
      </div>
      {tab === "program" && <ProgramTab />}
      {tab === "rotation" && <RotationTab />}
      {tab === "beneficials" && <BeneficialsTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "equipment" && <EquipmentTab />}
      {tab === "records" && <RecordsTab />}
      {tab === "purdue" && <PurdueTab />}
    </div>
  );
}

// ── 📅 Program ────────────────────────────────────────────────────────────────
function ProgramTab() {
  const { rows: program, insert, update, remove } = useSprayProgram();
  const { rows: products } = useChemProducts();
  const { rows: beneficials } = useBeneficialProducts();
  const { rows: tasks, upsert } = useManagerTasks();
  const { displayName } = useAuth();
  const now = useMemo(currentWeek, []);
  const [week, setWeek] = useState(now.week);
  const [adding, setAdding] = useState(false);
  const [tankGal, setTankGal] = useState(100);
  const [busy, setBusy] = useState(false);

  const prodByName = useMemo(() => {
    const m = new Map();
    (products || []).forEach(p => m.set((p.name || "").toLowerCase(), p));
    return m;
  }, [products]);
  const lookup = n => prodByName.get((n || "").toLowerCase()) || null;

  const weekRows = useMemo(() => (program || [])
    .filter(r => r.weekNumber === week && r.active !== false)
    .sort((a, b) => (a.location || "").localeCompare(b.location || "") || (a.sortOrder || 0) - (b.sortOrder || 0)),
    [program, week]);

  // group by location so a week reads the way the sheet did
  const byLocation = useMemo(() => {
    const m = new Map();
    weekRows.forEach(r => {
      const k = r.location || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()];
  }, [weekRows]);

  // cost estimate for the week at the chosen tank size
  const weekCost = useMemo(() => weekRows.reduce((sum, r) => {
    const d = computeDose(r.rate, tankGal, lookup(r.productName));
    return sum + (d?.cost || 0);
  }, 0), [weekRows, tankGal, prodByName]); // eslint-disable-line

  // whole-season cost at this tank size — what the program actually commits to
  const seasonCost = useMemo(() => (program || [])
    .filter(r => r.active !== false)
    .reduce((sum, r) => sum + (computeDose(r.rate, tankGal, lookup(r.productName))?.cost || 0), 0),
    [program, tankGal, prodByName]); // eslint-disable-line

  // resistance check: same MOA as the previous week on the same location
  const prevWeekMoa = useMemo(() => {
    const prev = (program || []).filter(r => r.weekNumber === week - 1 && r.active !== false);
    return new Set(prev.map(r => lookup(r.productName)?.moa).filter(m => m && /^(IRAC|FRAC)\s/i.test(m)));
  }, [program, week, prodByName]); // eslint-disable-line

  // beneficial conflict: anything harmful scheduled the same week as a release
  const releaseThisWeek = weekRows.some(r => r.kind === "beneficial");
  const conflicts = weekRows.filter(r => r.kind !== "beneficial" && lookup(r.productName)?.beneficialSafety === "harmful");

  async function generateTasks() {
    if (busy) return;
    setBusy(true);
    try {
      const targetDate = bucketToDate("today");
      const maxPriority = Math.max(0, ...(tasks || []).map(t => t.priority || 0));
      let i = 0;
      for (const r of weekRows) {
        const p = lookup(r.productName);
        const isBen = r.kind === "beneficial";
        const dose = computeDose(r.rate, tankGal, p);
        await upsert({
          id: crypto.randomUUID(),
          title: `${isBen ? "🐞 Release" : "💧 Apply"}: ${r.productName}${r.rate ? ` @ ${r.rate}` : ""}${r.location ? ` — ${r.location}` : ""}`,
          description: [
            p?.targets && `Controls: ${p.targets}`,
            dose && `Measure ${dose.amount} ${dose.unit} for a ${tankGal} gal tank`,
            p?.moa && `MOA ${p.moa}`,
            p?.reiHours != null && `REI ${p.reiHours}h`,
            p?.applicationNotes,
            r.notes,
          ].filter(Boolean).join(" · ") || null,
          priority: maxPriority + 10 + i,
          weekNumber: now.week, year: now.year,
          status: "pending", category: "growing",
          bucket: "today", targetDate, carriedOver: false,
          createdBy: displayName || "Head Grower",
          assignees: [], photos: [],
          location: r.location || null,
          programWeek: week,
          sourceKind: isBen ? "handwork" : "application",
          workPayload: {
            kind: isBen ? "handwork" : "application",
            product_id: p?.id || null,
            product_name: r.productName,
            epa_reg_number: p?.epaRegNumber || null,
            active_ingredient: p?.activeIngredient || null,
            method: isBen ? null : (p?.productType === "drench" ? "drench" : "spray"),
            rate: r.rate || null,
            total_volume: `${tankGal} gal`,
            rei_hours: isBen ? null : (p?.reiHours ?? null),
            houses: r.location || null,
            notes: r.notes || null,
          },
        });
        i++;
      }
      alert(`Created ${weekRows.length} task${weekRows.length !== 1 ? "s" : ""} on the board for today.`);
    } catch (e) {
      alert("Could not create tasks: " + e.message);
    } finally { setBusy(false); }
  }

  return (
    <div>
      {/* week picker + economics */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Week</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setWeek(w => Math.max(1, w - 1))} style={btn("#fff", MUTED)}>←</button>
            <select value={week} onChange={e => setWeek(Number(e.target.value))} style={{ ...input, width: 120 }}>
              {Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}{w === now.week ? " (now)" : ""}</option>
              ))}
            </select>
            <button onClick={() => setWeek(w => Math.min(52, w + 1))} style={btn("#fff", MUTED)}>→</button>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Tank size (for dosing + cost)</span>
          <select value={tankGal} onChange={e => setTankGal(Number(e.target.value))} style={{ ...input, width: 130 }}>
            {[25, 50, 100, 200, 300].map(g => <option key={g} value={g}>{g} gal</option>)}
          </select>
        </div>
        <div style={{ ...card, margin: 0, padding: "10px 16px", background: "#f7faf4" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>This week</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: DARK }}>{money(weekCost)}</div>
        </div>
        <div style={{ ...card, margin: 0, padding: "10px 16px", background: "#f7faf4" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>Full 52-week program</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: DARK }}>{money(seasonCost)}</div>
        </div>
        <button onClick={generateTasks} disabled={!weekRows.length || busy} style={{ ...btn(GREEN, "#fff"), opacity: weekRows.length && !busy ? 1 : 0.5 }}>
          {busy ? "Creating…" : `→ Generate ${weekRows.length} task${weekRows.length !== 1 ? "s" : ""}`}
        </button>
      </div>

      {conflicts.length > 0 && releaseThisWeek && (
        <div style={{ ...card, background: "#fff5f3", borderColor: RED }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: RED }}>
            ⚠ Beneficial conflict — {conflicts.map(c => c.productName).join(", ")} {conflicts.length === 1 ? "is" : "are"} harmful to beneficials, and a release is scheduled this same week.
          </div>
          <div style={{ fontSize: 12, color: "#7a3d2f", marginTop: 4 }}>
            Move one of them, or you are paying for predators twice — once to buy them and once to kill them.
          </div>
        </div>
      )}

      {weekRows.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: MUTED, padding: 40 }}>
          Nothing scheduled for week {week}. Add a line below, or run the program migrations if the 52-week plan hasn't been imported yet.
        </div>
      )}

      {byLocation.map(([loc, rows]) => (
        <div key={loc} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "0 2px 7px" }}>
            📍 {LOCATIONS.find(l => l.id === loc)?.label || loc || "All houses"}
          </div>
          {rows.map(r => {
            const p = lookup(r.productName);
            const dose = computeDose(r.rate, tankGal, p);
            const repeat = p?.moa && prevWeekMoa.has(p.moa);
            const safety = p?.beneficialSafety;
            return (
              <ProgramRow
                key={r.id} row={r} product={p} dose={dose} repeat={repeat} safety={safety}
                products={products} beneficials={beneficials}
                onSave={patch => update(r.id, patch)}
                onDelete={() => window.confirm(`Remove ${r.productName} from week ${r.weekNumber}?`) && remove(r.id)}
              />
            );
          })}
        </div>
      ))}

      {adding ? (
        <AddProgramRow
          week={week} products={products} beneficials={beneficials}
          onCancel={() => setAdding(false)}
          onSave={async row => { await insert({ id: crypto.randomUUID(), year: 2026, weekNumber: week, ...row }); setAdding(false); }}
        />
      ) : (
        <button onClick={() => setAdding(true)} style={btn()}>+ Add to week {week}</button>
      )}
    </div>
  );
}

function ProgramRow({ row, product, dose, repeat, safety, products, beneficials, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(row.rate || "");
  const [notes, setNotes] = useState(row.notes || "");
  const isBen = row.kind === "beneficial";
  const safetyChip = safety === "harmful" ? { bg: "#fde4e1", c: RED, t: "harmful to beneficials" }
    : safety === "caution" ? { bg: "#fdf0e0", c: "#a86a10", t: "caution w/ beneficials" }
    : safety === "safe" ? { bg: "#e8f5e0", c: "#4a7a35", t: "beneficial-safe" } : null;

  return (
    <div style={{ ...card, borderColor: repeat ? AMBER : "#e0e8d8", padding: "11px 14px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{isBen ? "🐞" : "💧"} {row.productName}</span>
        {row.rate && <span style={{ fontSize: 13, color: MUTED }}>@ {row.rate}</span>}
        {product?.moa && <span style={{ fontSize: 11, background: "#e6ecf7", color: BLUE, borderRadius: 6, padding: "2px 8px", fontWeight: 800 }}>{product.moa}</span>}
        {safetyChip && <span style={{ fontSize: 11, background: safetyChip.bg, color: safetyChip.c, borderRadius: 6, padding: "2px 8px", fontWeight: 800 }}>{safetyChip.t}</span>}
        {product?.reiHours != null && <span style={{ fontSize: 11, color: MUTED }}>REI {product.reiHours}h</span>}
        <span style={{ flex: 1 }} />
        <button onClick={() => setEditing(e => !e)} style={{ ...btn("#fff", MUTED), border: "1.5px solid #c8d8c0", padding: "5px 11px", fontSize: 12 }}>{editing ? "Close" : "Edit"}</button>
        <button onClick={onDelete} style={{ ...btn("#fff", RED), border: `1.5px solid ${RED}55`, padding: "5px 11px", fontSize: 12 }}>Remove</button>
      </div>

      <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
        {dose && <><b style={{ color: DARK }}>Measure {dose.amount} {dose.unit}</b>{dose.cost != null && <> · {money(dose.cost)}</>} · </>}
        {product?.targets || (isBen ? "" : "no target list on file")}
      </div>
      {product?.applicationNotes && (
        <div style={{ fontSize: 12, color: "#5a6a54", marginTop: 3, fontStyle: "italic" }}>{product.applicationNotes}</div>
      )}
      {repeat && (
        <div style={{ fontSize: 12, color: "#a86a10", marginTop: 5, fontWeight: 700 }}>
          ⚠ {product.moa} was also used last week — rotate to a different group.
        </div>
      )}
      {row.notes && <div style={{ fontSize: 12, color: AMBER, marginTop: 4, fontWeight: 700 }}>📌 {row.notes}</div>}

      {editing && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eef2ea", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Rate</span>
            <input style={input} value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 8 oz or 3.2 oz/10,000 ft" />
          </div>
          <div style={{ flex: 2, minWidth: 160 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Note</span>
            <input style={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Sprague: add Pylon" />
          </div>
          <button onClick={() => { onSave({ rate: rate.trim() || null, notes: notes.trim() || null }); setEditing(false); }} style={btn()}>Save</button>
        </div>
      )}
    </div>
  );
}

function AddProgramRow({ week, products, beneficials, onCancel, onSave }) {
  const [kind, setKind] = useState("chemical");
  const [productName, setProductName] = useState("");
  const [rate, setRate] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const list = kind === "beneficial" ? (beneficials || []) : (products || []).filter(p => p.active !== false);

  return (
    <div style={{ ...card, borderColor: GREEN }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: DARK, marginBottom: 8 }}>Add to week {week}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["chemical", "💧 Chemical"], ["beneficial", "🐞 Beneficial"]].map(([id, l]) => (
          <button key={id} onClick={() => { setKind(id); setProductName(""); }} style={{
            ...btn(kind === id ? GREEN : "#fff", kind === id ? "#fff" : MUTED),
            border: `1.5px solid ${kind === id ? GREEN : "#c8d8c0"}`, padding: "7px 13px", fontSize: 12.5,
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 2, minWidth: 180 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Product</span>
          <select style={input} value={productName} onChange={e => setProductName(e.target.value)}>
            <option value="">Choose…</option>
            {[...list].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Rate</span>
          <input style={input} value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 8 oz" />
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Location</span>
          <select style={input} value={location} onChange={e => setLocation(e.target.value)}>
            {LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 140 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Note</span>
          <input style={input} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <button onClick={onCancel} style={{ ...btn("#fff", MUTED), border: "1.5px solid #c8d8c0" }}>Cancel</button>
        <button
          onClick={() => productName && onSave({
            kind, productName, rate: rate.trim() || null,
            location: location || null, notes: notes.trim() || null, sortOrder: 99, active: true,
          })}
          style={{ ...btn(), opacity: productName ? 1 : 0.5 }}>Add</button>
      </div>
    </div>
  );
}

// ── 🔄 Rotation ───────────────────────────────────────────────────────────────
function RotationTab() {
  const { rows: sprayRows } = useSprayRecords();
  const { rows: products } = useChemProducts();
  const { rows: program } = useSprayProgram();
  const [source, setSource] = useState("history");

  const byName = useMemo(() => {
    const m = new Map();
    (products || []).forEach(p => m.set((p.name || "").toLowerCase(), p));
    return m;
  }, [products]);

  // History view: what actually went out, grouped by target pest
  const history = useMemo(() => {
    const cutoff = new Date(Date.now() - 120 * 86400000).toISOString();
    const byPest = new Map();
    for (const r of (sprayRows || [])) {
      if (!r.appliedAt || r.appliedAt < cutoff) continue;
      const pest = (r.targetPest || "").trim().toLowerCase();
      if (!pest || pest.length < 3) continue;
      const p = byName.get((r.productName || "").toLowerCase());
      if (!byPest.has(pest)) byPest.set(pest, []);
      byPest.get(pest).push({ date: r.appliedAt.slice(0, 10), product: r.productName, moa: p?.moa || null });
    }
    for (const seq of byPest.values()) {
      seq.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < seq.length; i++) {
        if (seq[i].moa && seq[i].moa === seq[i - 1].moa && /^(IRAC|FRAC)\s/i.test(seq[i].moa)) seq[i].repeat = true;
      }
    }
    return [...byPest.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [sprayRows, byName]);

  // Program view: the planned MOA sequence week by week
  const planned = useMemo(() => {
    const weeks = new Map();
    for (const r of (program || [])) {
      if (r.active === false || r.kind === "beneficial") continue;
      const p = byName.get((r.productName || "").toLowerCase());
      if (!weeks.has(r.weekNumber)) weeks.set(r.weekNumber, []);
      weeks.get(r.weekNumber).push({ product: r.productName, moa: p?.moa || null });
    }
    const ordered = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ordered.length; i++) {
      const prev = new Set(ordered[i - 1][1].map(x => x.moa).filter(m => m && /^(IRAC|FRAC)\s/i.test(m)));
      ordered[i][1].forEach(x => { if (x.moa && prev.has(x.moa)) x.repeat = true; });
    }
    return ordered;
  }, [program, byName]);

  return (
    <div>
      <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
        {[["history", "What went out (120 days)"], ["program", "What's planned (52 weeks)"]].map(([id, l]) => (
          <button key={id} onClick={() => setSource(id)} style={{
            ...btn(source === id ? GREEN : "#fff", source === id ? "#fff" : MUTED),
            border: `1.5px solid ${source === id ? GREEN : "#c8d8c0"}`, fontSize: 12.5,
          }}>{l}</button>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>
        ⚠ marks the same IRAC/FRAC group used twice in a row — the pattern that builds resistance. Biologicals, botanicals and PGRs are exempt; they can repeat freely.
      </div>

      {source === "history" && (history.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: MUTED, padding: 40 }}>
          No applications with a target pest in the last 120 days.
        </div>
      ) : history.map(([pest, seq]) => (
        <div key={pest} style={{ ...card, borderColor: seq.some(e => e.repeat) ? AMBER : "#e0e8d8" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: DARK, textTransform: "capitalize", marginBottom: 7 }}>
            🎯 {pest} <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>({seq.length})</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {seq.map((e, i) => <MoaChip key={i} {...e} />)}
          </div>
        </div>
      )))}

      {source === "program" && planned.map(([wk, items]) => (
        <div key={wk} style={{ ...card, padding: "10px 14px", borderColor: items.some(i => i.repeat) ? AMBER : "#e0e8d8" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: MUTED, minWidth: 62 }}>Week {wk}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
              {items.map((e, i) => <MoaChip key={i} {...e} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MoaChip({ date, product, moa, repeat }) {
  return (
    <span style={{
      background: repeat ? "#fdf0e0" : "#f4f7f1", border: `1px solid ${repeat ? AMBER : "#dce6d4"}`,
      borderRadius: 7, padding: "4px 9px", fontSize: 11.5, color: repeat ? "#a86a10" : "#41513a",
    }}>
      {repeat && "⚠ "}{date ? `${date.slice(5)} ` : ""}<b>{product}</b>{moa ? ` · ${moa}` : " · MOA?"}
    </span>
  );
}

// ── 🐞 Beneficials ────────────────────────────────────────────────────────────
function BeneficialsTab() {
  const { rows: species } = useBeneficialProducts();
  const { rows: releases, insert, remove } = useBeneficialReleases();
  const { rows: products } = useChemProducts();
  const { displayName } = useAuth();
  const [logging, setLogging] = useState(false);
  const [f, setF] = useState({ productName: "", quantity: "", location: "", houses: "", targetPest: "", notes: "" });

  const yearSpend = useMemo(() => {
    const yr = new Date().getFullYear();
    return (releases || [])
      .filter(r => (r.releasedAt || "").slice(0, 4) === String(yr))
      .reduce((s, r) => s + (Number(r.estCost) || 0), 0);
  }, [releases]);

  const harmful = useMemo(() => (products || [])
    .filter(p => p.beneficialSafety === "harmful" && p.active !== false)
    .map(p => p.name), [products]);

  async function logRelease() {
    const sp = (species || []).find(s => s.name === f.productName);
    if (!sp) return;
    const qty = Number(f.quantity) || 1;
    await insert({
      id: crypto.randomUUID(),
      productId: sp.id, productName: sp.name, quantity: qty,
      location: f.location || null, houses: f.houses || null,
      targetPest: f.targetPest || null, releasedBy: displayName || "Grower",
      releasedAt: new Date().toISOString(),
      estCost: sp.unitCost != null ? qty * Number(sp.unitCost) : null,
      notes: f.notes || null,
    });
    setF({ productName: "", quantity: "", location: "", houses: "", targetPest: "", notes: "" });
    setLogging(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ ...card, margin: 0, padding: "10px 16px", background: "#f7faf4" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>Released this year</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: DARK }}>{money(yearSpend)}</div>
        </div>
        <button onClick={() => setLogging(l => !l)} style={btn()}>{logging ? "Cancel" : "+ Log a release"}</button>
        <div style={{ fontSize: 12, color: MUTED, flex: 1, minWidth: 200 }}>
          Releases are the other half of the pest program — tracked here so their cost and their conflicts with sprays are both visible.
        </div>
      </div>

      {harmful.length > 0 && (
        <div style={{ ...card, background: "#fff8f6", borderColor: "#f0c8bf" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: RED, marginBottom: 3 }}>Never spray these during a release week</div>
          <div style={{ fontSize: 12.5, color: "#7a3d2f" }}>{harmful.join(" · ")}</div>
        </div>
      )}

      {logging && (
        <div style={{ ...card, borderColor: GREEN }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Species</span>
              <select style={input} value={f.productName} onChange={e => setF(v => ({ ...v, productName: e.target.value }))}>
                <option value="">Choose…</option>
                {(species || []).map(s => <option key={s.id} value={s.name}>{s.name} — {s.packSize}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Packs</span>
              <input style={input} inputMode="decimal" value={f.quantity} onChange={e => setF(v => ({ ...v, quantity: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Houses</span>
              <input style={input} value={f.houses} onChange={e => setF(v => ({ ...v, houses: e.target.value }))} placeholder="e.g. Bluff H4–6" />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Target</span>
              <input style={input} value={f.targetPest} onChange={e => setF(v => ({ ...v, targetPest: e.target.value }))} placeholder="thrips" />
            </div>
            <button onClick={logRelease} style={{ ...btn(), opacity: f.productName ? 1 : 0.5 }}>Log</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "16px 2px 8px" }}>
        Species library ({(species || []).length})
      </div>
      {(species || []).length === 0 && (
        <div style={{ ...card, textAlign: "center", color: MUTED, padding: 30 }}>
          Run the beneficials migration to load the species library.
        </div>
      )}
      {(species || []).map(s => (
        <div key={s.id} style={{ ...card, padding: "11px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: DARK }}>🐞 {s.name}</span>
            {s.species && <span style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>{s.species}</span>}
            {s.packSize && <span style={{ fontSize: 11, background: "#f0f5ee", borderRadius: 6, padding: "2px 8px", color: MUTED, fontWeight: 700 }}>{s.packSize}</span>}
            {s.unitCost != null && <span style={{ fontSize: 12, fontWeight: 800, color: DARK }}>${Number(s.unitCost).toFixed(2)}</span>}
          </div>
          {s.targets && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>🎯 {s.targets}</div>}
          {s.releaseNotes && <div style={{ fontSize: 12, color: "#5a6a54", marginTop: 3, fontStyle: "italic" }}>{s.releaseNotes}</div>}
        </div>
      ))}

      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "18px 2px 8px" }}>
        Release log ({(releases || []).length})
      </div>
      {(releases || []).slice(0, 40).map(r => (
        <div key={r.id} style={{ ...card, padding: "10px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{r.productName}</span>
            {r.quantity && <span style={{ fontSize: 12.5, color: MUTED }}>×{r.quantity}</span>}
            {r.estCost != null && <span style={{ fontSize: 12.5, fontWeight: 800, color: DARK }}>{money(r.estCost)}</span>}
            <span style={{ flex: 1 }} />
            <button onClick={() => window.confirm("Delete this release record?") && remove(r.id)} style={{ ...btn("#fff", RED), border: `1.5px solid ${RED}44`, padding: "4px 10px", fontSize: 11.5 }}>Delete</button>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
            {new Date(r.releasedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {r.releasedBy && ` · ${r.releasedBy}`}{r.houses && ` · 📍 ${r.houses}`}{r.targetPest && ` · 🎯 ${r.targetPest}`}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 🔧 Equipment + recipes + drench doses ─────────────────────────────────────
function EquipmentTab() {
  const { rows: equipment, insert, update, remove } = useApplicationEquipment();
  const { rows: doses } = useDrenchDoses();
  const { rows: recipes } = useFertigationRecipes();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", kind: "sprayer", capacityGal: "", injectorRatio: "", notes: "" });

  const dosesByProduct = useMemo(() => {
    const m = new Map();
    (doses || []).forEach(d => {
      if (!m.has(d.productName)) m.set(d.productName, []);
      m.get(d.productName).push(d);
    });
    return [...m.entries()];
  }, [doses]);

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "0 2px 8px" }}>
        Equipment ({(equipment || []).length})
      </div>
      {(equipment || []).map(e => (
        <div key={e.id} style={{ ...card, padding: "10px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: DARK }}>🔧 {e.name}</span>
            <span style={{ fontSize: 11, background: "#f0f5ee", borderRadius: 6, padding: "2px 8px", color: MUTED, fontWeight: 700, textTransform: "capitalize" }}>{e.kind}</span>
            {e.capacityGal && <span style={{ fontSize: 12.5, color: MUTED }}>{e.capacityGal} gal</span>}
            {e.injectorRatio && <span style={{ fontSize: 12.5, color: MUTED }}>1:{e.injectorRatio}</span>}
            <span style={{ flex: 1 }} />
            <button onClick={() => window.confirm(`Remove ${e.name}?`) && remove(e.id)} style={{ ...btn("#fff", RED), border: `1.5px solid ${RED}44`, padding: "4px 10px", fontSize: 11.5 }}>Remove</button>
          </div>
          {e.notes && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{e.notes}</div>}
        </div>
      ))}
      {adding ? (
        <div style={{ ...card, borderColor: GREEN, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 150 }}><span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Name</span><input style={input} value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))} /></div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Kind</span>
            <select style={input} value={f.kind} onChange={e => setF(v => ({ ...v, kind: e.target.value }))}>
              {["sprayer", "fogger", "injector", "drench", "spreader"].map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 90 }}><span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Gallons</span><input style={input} inputMode="decimal" value={f.capacityGal} onChange={e => setF(v => ({ ...v, capacityGal: e.target.value }))} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>Injector 1:</span><input style={input} inputMode="decimal" value={f.injectorRatio} onChange={e => setF(v => ({ ...v, injectorRatio: e.target.value }))} /></div>
          <button onClick={() => setAdding(false)} style={{ ...btn("#fff", MUTED), border: "1.5px solid #c8d8c0" }}>Cancel</button>
          <button onClick={async () => {
            if (!f.name.trim()) return;
            await insert({ id: crypto.randomUUID(), name: f.name.trim(), kind: f.kind, capacityGal: f.capacityGal ? Number(f.capacityGal) : null, injectorRatio: f.injectorRatio ? Number(f.injectorRatio) : null, notes: f.notes || null, active: true });
            setF({ name: "", kind: "sprayer", capacityGal: "", injectorRatio: "", notes: "" }); setAdding(false);
          }} style={btn()}>Add</button>
        </div>
      ) : <button onClick={() => setAdding(true)} style={btn()}>+ Add equipment</button>}

      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "20px 2px 8px" }}>
        Drench doses by pot size
      </div>
      {dosesByProduct.length === 0 && <div style={{ ...card, textAlign: "center", color: MUTED, padding: 26 }}>Run the costs/doses migration to load these.</div>}
      {dosesByProduct.map(([name, list]) => (
        <div key={name} style={{ ...card, padding: "11px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: DARK, marginBottom: 6 }}>💧 {name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {list.map(d => (
              <span key={d.id} style={{ background: "#f4f7f1", border: "1px solid #dce6d4", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, color: "#41513a" }}>
                <b>{d.potSize}</b> → {d.dosePerPot}{d.injectorRatio ? ` @ 1:${d.injectorRatio}` : ""}
              </span>
            ))}
          </div>
          {list[0]?.notes && <div style={{ fontSize: 12, color: MUTED, marginTop: 5 }}>{list[0].notes}</div>}
        </div>
      ))}

      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, margin: "20px 2px 8px" }}>
        Fertigation tank recipes
      </div>
      {(recipes || []).map(r => (
        <div key={r.id} style={{ ...card, padding: "11px 14px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: DARK }}>🧾 {r.name}</span>
            {r.season && <span style={{ fontSize: 11, background: "#f0f5ee", borderRadius: 6, padding: "2px 8px", color: MUTED, fontWeight: 700 }}>{r.season}</span>}
            {r.tankGal && <span style={{ fontSize: 12, color: MUTED }}>{r.tankGal} gal</span>}
            {r.injectorSetting && <span style={{ fontSize: 12, color: MUTED }}>injector {r.injectorSetting}</span>}
            {r.targetEc && <span style={{ fontSize: 12, color: MUTED }}>EC {r.targetEc}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#41513a", marginTop: 4 }}>{r.recipe}</div>
          {r.notes && <div style={{ fontSize: 12, color: AMBER, marginTop: 3, fontWeight: 700 }}>📌 {r.notes}</div>}
        </div>
      ))}
    </div>
  );
}
