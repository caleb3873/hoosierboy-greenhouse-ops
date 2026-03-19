import { useState } from "react";
import { useCombos, useComboTags } from "./supabase";
import { useContainers, useSoilMixes, useCropRuns } from "./supabase";
import LotDesigner from "./combo/LotDesigner";
import ComboLibrary from "./combo/ComboLibrary";
import { calcLotGrandTotal } from "./combo/CostEngine";

const uid = () => crypto.randomUUID();
const dc  = (o) => JSON.parse(JSON.stringify(o));

const STATUSES = [
  { id: "draft",     label: "Draft",               color: "#7a8c74", bg: "#f0f5ee" },
  { id: "submitted", label: "Submitted for Review", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "approved",  label: "Approved",             color: "#4a7a35", bg: "#e8f5e0" },
  { id: "revised",   label: "Revised",              color: "#7b3fa0", bg: "#f5eeff" },
  { id: "revision",  label: "Needs Revision",       color: "#c8791a", bg: "#fff4e8" },
  { id: "ordered",   label: "Ordered",              color: "#1e2d1a", bg: "#c8e6b8" },
  { id: "completed", label: "Completed",            color: "#4a7a35", bg: "#e0f0e0" },
];

const FORM_TYPES = [
  { id: "URC",  label: "URC",  color: "#8e44ad", bg: "#f5f0ff" },
  { id: "PLUG", label: "Plug", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "SEED", label: "Seed", color: "#c8791a", bg: "#fff4e8" },
  { id: "BULB", label: "Bulb", color: "#7a5a20", bg: "#fdf5e0" },
  { id: "CALL", label: "Call", color: "#7a8c74", bg: "#f0f5ee" },
];

// Keep week helpers inline (small, used only by DesignQueue)
function weekToDate(week, year) {
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const d = new Date(s);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}
function fmtWeekDate(week, year) {
  if (!week || !year) return "—";
  return weekToDate(+week, +year).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function subtractWeeks(week, year, n) {
  let w = +week - n, y = +year;
  while (w <= 0) { w += 52; y--; }
  return { week: w, year: y };
}
function computeRunSchedule(run) {
  const { targetWeek, targetYear, movesOutside, weeksIndoor, weeksOutdoor, weeksProp } = run;
  if (!targetWeek || !targetYear) return null;
  const totalFinish = (movesOutside ? (+weeksIndoor||0) + (+weeksOutdoor||0) : (+weeksIndoor||0));
  const transplantWk = subtractWeeks(targetWeek, targetYear, totalFinish);
  const prop = +weeksProp || 0;
  const seedWk = prop > 0 ? subtractWeeks(transplantWk.week, transplantWk.year, prop) : null;
  return { transplant: transplantWk, seed: seedWk, ready: { week: +targetWeek, year: +targetYear } };
}

// ── DESIGN QUEUE ──────────────────────────────────────────────────────────
function DesignQueue({ runs, containers, onStartDesign }) {
  const queued = runs.filter(r => r.status === "needs_design");
  if (queued.length === 0) return (
    <div style={{ background: "#f8faf6", borderRadius: 16, border: "2px dashed #c8d8c0", padding: "32px 24px", marginBottom: 28, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>No lots waiting on design</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#4a5a40", marginBottom: 4 }}>All caught up</div>
      <div style={{ fontSize: 12, color: "#7a8c74" }}>When a crop run is marked "Needs Design" it will appear here</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#e07b39", textTransform: "uppercase", letterSpacing: .8 }}>Ready to Design</div>
        <div style={{ background: "#e07b39", color: "#fff", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{queued.length}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {queued.map(run => {
          const sched = computeRunSchedule(run);
          const container = containers.find(c => c.id === run.containerId);
          const units = run.cases && run.packSize ? Number(run.cases) * Number(run.packSize) : null;
          const readyDate = sched ? fmtWeekDate(sched.ready.week, sched.ready.year) : null;
          const transplantDate = sched ? fmtWeekDate(sched.transplant.week, sched.transplant.year) : null;
          return (
            <div key={run.id} style={{ background: "#fff", borderRadius: 14, border: "2px solid #f0d8c0", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ background: "linear-gradient(135deg, #e07b39, #c8791a)", padding: "12px 16px" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 2 }}>
                  {run.cropName || "Unnamed Crop"}{run.groupNumber ? <span style={{ fontSize: 12, fontWeight: 400, opacity: .8 }}> -- Group {run.groupNumber}</span> : ""}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)" }}>
                  {container ? `${container.name}${container.diameter ? ` - ${container.diameter}"` : ""}` : "No container set"}
                </div>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {units && <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#2e5c1e" }}>{units.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>Units</div>
                  </div>}
                  {readyDate && <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#2e5c1e" }}>{readyDate}</div>
                    <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>Ready</div>
                  </div>}
                  {transplantDate && <div style={{ background: "#e8f4f8", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#2e7d9e" }}>{transplantDate}</div>
                    <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>Transplant</div>
                  </div>}
                </div>
                <button onClick={() => onStartDesign(run, sched, container, units)}
                  style={{ width: "100%", background: "linear-gradient(135deg, #e07b39, #c8791a)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  Start Designing
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LOT CARD ──────────────────────────────────────────────────────────────
function LotCard({ lot, onEdit, onDelete, onDuplicate, onApprove, onRevision, onMarkRevised, isApprover, containers, soilMixes, tags }) {
  const status = STATUSES.find(s => s.id === lot.status) || STATUSES[0];
  const allPlants = (lot.combos || []).flatMap(c => c.plants || []);
  const hasPhotos = allPlants.some(p => p.imageUrl);
  const totalMaterial = calcLotGrandTotal(lot.combos, Number(lot.totalQty) || 0, containers, soilMixes, tags);
  const brokers = [...new Set(allPlants.map(p => p.broker).filter(Boolean))];

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: `2px solid ${status.color}33`, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
      {hasPhotos && (
        <div style={{ display: "flex", height: 65, overflow: "hidden" }}>
          {allPlants.filter(p => p.imageUrl).slice(0, 6).map((p, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden" }}><img src={p.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /></div>
          ))}
        </div>
      )}
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a", marginBottom: 3 }}>{lot.name || "Untitled Lot"}</div>
            <div style={{ fontSize: 12, color: "#7a8c74" }}>{lot.season ? `${lot.season} - ` : ""}{lot.totalQty ? `${Number(lot.totalQty).toLocaleString()} units` : ""}</div>
          </div>
          <span style={{ background: status.bg, color: status.color, border: `1px solid ${status.color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{status.label}</span>
        </div>
        {(lot.combos || []).length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {(lot.combos || []).map((c, i) => <div key={i} style={{ background: "#f0f8eb", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#2e5c1e" }}>{c.name || `Combo ${i + 1}`} x{c.qty || 0}</div>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {totalMaterial > 0 && <div style={{ background: "#f5f0ff", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#6a3db0" }}>${totalMaterial.toFixed(0)}</div>
            <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>total material</div>
          </div>}
          {brokers.length > 0 && <div style={{ background: "#e8f4f8", borderRadius: 8, padding: "6px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#2e7d9e", marginBottom: 2 }}>Brokers</div>
            <div style={{ fontSize: 12, color: "#1e2d1a" }}>{brokers.join(", ")}</div>
          </div>}
        </div>
        {lot.approvalNote && <div style={{ background: "#fff8f0", border: "1px solid #f0c080", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#7a5010" }}>{lot.approvalNote}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => onEdit(lot)} style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
          <button onClick={() => onDuplicate(lot)} style={{ background: "none", color: "#7a8c74", border: "1px solid #c8d8c0", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Duplicate</button>
          {isApprover && lot.status === "submitted" && <>
            <button onClick={() => onApprove(lot.id)} style={{ background: "#4a7a35", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Approve</button>
            <button onClick={() => onRevision(lot.id)} style={{ background: "#c8791a", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Needs Revision</button>
          </>}
          <button onClick={() => onDelete(lot.id)} style={{ background: "none", color: "#e07b39", border: "1px solid #f0d0c0", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────
export default function ComboDesigner() {
  const { rows: containers } = useContainers();
  const { rows: soilMixes } = useSoilMixes();
  const { rows: runs } = useCropRuns();
  const { rows: tags } = useComboTags();
  const { rows: lots, insert: insertLot, update: updateLot, remove: removeLot } = useCombos();

  const [view, setView] = useState("list"); // "list" | "add" | "edit"
  const [tab, setTab] = useState("active"); // "active" | "library"
  const [editId, setEditId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [prefilledLot, setPrefilledLot] = useState(null);
  const isApprover = true;

  const shared = { containers, soilMixes, tags };

  const saveLot = async (lot) => {
    if (editId) { await updateLot(editId, lot); }
    else { await insertLot({ ...lot, id: lot.id || uid() }); }
    setView("list"); setEditId(null); setPrefilledLot(null);
  };
  const del = async (id) => { if (window.confirm("Remove this lot?")) await removeLot(id); };
  const dup = async (lot) => { await insertLot({ ...dc(lot), id: uid(), name: lot.name + " (Copy)", status: "draft", isTemplate: false, templateId: lot.isTemplate ? lot.id : lot.templateId }); };
  const approve = async (id) => { await updateLot(id, { status: "approved" }); };
  const revision = async (id) => { await updateLot(id, { status: "revision" }); };
  const markRevised = async (id) => {
    const note = window.prompt("What did you change? (optional)");
    const lot = lots.find(l => l.id === id);
    const entry = { date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), note: note || "Revised" };
    await updateLot(id, { status: "revised", changelog: [...(lot?.changelog || []), entry] });
  };

  // Fork a template into a new lot
  const forkTemplate = (template) => {
    const forked = {
      ...dc(template),
      id: null,
      name: template.name,
      status: "draft",
      isTemplate: false,
      templateId: template.id,
      version: (template.version || 1),
      productionQty: null,
      completedAt: null,
      finishedPhotos: [],
    };
    setPrefilledLot(forked);
    setEditId(null);
    setView("add");
  };

  // Update a template (edit in place, bump version)
  const editTemplate = (template) => {
    setEditId(template.id);
    setView("edit");
  };

  // Start design from crop run queue
  const handleStartDesign = (run, sched, container, units) => {
    const needByDate = sched?.seed
      ? weekToDate(sched.seed.week, sched.seed.year).toISOString().slice(0, 10)
      : sched?.transplant
      ? weekToDate(sched.transplant.week, sched.transplant.year).toISOString().slice(0, 10)
      : "";
    const prefilled = {
      id: null,
      name: [run.cropName, run.groupNumber ? `Group ${run.groupNumber}` : null].filter(Boolean).join(" -- "),
      season: `Spring ${sched?.ready.year || new Date().getFullYear()}`,
      totalQty: units || "",
      status: "draft",
      notes: run.notes || "",
      cropRunId: run.id,
      combos: [{
        id: uid(), name: "", qty: null, plants: [],
        containerId: run.containerId || "", soilId: "", tagId: "", tagDescription: "",
        suggestedNeedBy: needByDate,
      }],
    };
    setPrefilledLot(prefilled);
    setEditId(null);
    setView("add");
  };

  // ── RENDER ──
  if (view === "add") return (
    <LotDesigner
      initial={prefilledLot || undefined}
      onSave={saveLot}
      onCancel={() => { setView("list"); setPrefilledLot(null); }}
      {...shared}
    />
  );
  if (view === "edit") {
    const lot = lots.find(l => l.id === editId);
    if (!lot) { setView("list"); return null; }
    return <LotDesigner initial={lot} onSave={(updated) => {
      // If editing a template, bump version
      if (lot.isTemplate) {
        saveLot({ ...updated, version: (lot.version || 1) + 1 });
      } else {
        saveLot(updated);
      }
    }} onCancel={() => { setView("list"); setEditId(null); }} {...shared} />;
  }

  // Active lots (exclude templates/completed unless "all")
  const activeLots = lots.filter(l => !l.isTemplate && l.status !== "completed");
  const filtered = activeLots.filter(l => statusFilter === "all" || l.status === statusFilter);
  const pending = lots.filter(l => l.status === "submitted").length;
  const needsDesign = runs.filter(r => r.status === "needs_design").length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1e2d1a" }}>Combo Designs</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{lots.length} lot{lots.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {needsDesign > 0 && <div style={{ background: "#fff4e8", border: "1.5px solid #f0c080", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#e07b39", fontWeight: 700 }}>{needsDesign} need design</div>}
          {pending > 0 && <div style={{ background: "#e8f4f8", border: "1.5px solid #b0d8e8", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#2e7d9e", fontWeight: 700 }}>{pending} awaiting approval</div>}
          <button onClick={() => { setPrefilledLot(null); setView("add"); }} style={{
            background: "linear-gradient(135deg,#7fb069,#4a7a35)", color: "#fff", border: "none", borderRadius: 12,
            padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 4px 12px rgba(79,160,69,.3)",
          }}>+ New Combo Lot</button>
        </div>
      </div>

      {/* Tabs: Active | Library */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e0ead8" }}>
        {[["active", "Active Lots"], ["library", "Library"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "12px 24px", border: "none", borderBottom: `3px solid ${tab === id ? "#7fb069" : "transparent"}`,
            background: "none", fontWeight: tab === id ? 800 : 500, fontSize: 14, cursor: "pointer",
            color: tab === id ? "#1e2d1a" : "#7a8c74", fontFamily: "inherit", marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {tab === "active" && (<>
        <DesignQueue runs={runs} containers={containers} onStartDesign={handleStartDesign} />

        {/* Status filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[["all", "All Statuses"], ...STATUSES.filter(s => s.id !== "completed").map(s => [s.id, s.label])].map(([id, label]) => {
            const s = STATUSES.find(x => x.id === id);
            return <button key={id} onClick={() => setStatusFilter(id)} style={{
              padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${statusFilter === id ? (s?.color || "#7fb069") : "#c8d8c0"}`,
              background: statusFilter === id ? (s?.bg || "#f0f8eb") : "#fff",
              color: statusFilter === id ? (s?.color || "#2e5c1e") : "#7a8c74",
              fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>{label}</button>;
          })}
        </div>

        {/* Lot grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#fafcf8", borderRadius: 20, border: "2px dashed #c8d8c0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>Combo Designs</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#4a5a40", marginBottom: 8 }}>No combo lots yet</div>
            <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24, lineHeight: 1.6 }}>Design your combos here, or start from a lot in the queue above.</div>
            <button onClick={() => { setPrefilledLot(null); setView("add"); }} style={{
              background: "#7fb069", color: "#fff", border: "none", borderRadius: 12,
              padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}>+ Create First Lot</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
            {filtered.map(lot => (
              <LotCard key={lot.id} lot={lot} isApprover={isApprover}
                onEdit={() => { setEditId(lot.id); setView("edit"); }}
                onDelete={del} onDuplicate={dup} onApprove={approve}
                onRevision={revision} onMarkRevised={markRevised} {...shared} />
            ))}
          </div>
        )}
      </>)}

      {tab === "library" && (
        <ComboLibrary lots={lots} onFork={forkTemplate} onEdit={editTemplate} {...shared} />
      )}
    </div>
  );
}
