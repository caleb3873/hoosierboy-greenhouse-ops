import React, { useState, useEffect, useMemo, useRef } from "react";
import { useHiringCandidates, getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "20px 22px", marginBottom: 14 };
const labelStyle = { fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 5, display: "block" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const textareaStyle = { ...inputStyle, minHeight: 70, resize: "vertical" };
const btnPrimary = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const btnSec = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

const SECTIONS = [
  { id: "prep", label: "Meeting Prep" },
  { id: "notes", label: "Meeting Notes" },
  { id: "candidates", label: "Candidates" },
];

// ── Form schemas (single source of truth for both UI + print) ──
const PREP_SECTIONS = [
  {
    id: "head_grower", title: "Head Grower",
    fields: [
      { k: "hg_responsibilities", label: "Main responsibilities", type: "textarea" },
      { k: "hg_focus", label: "Are we hiring a…", type: "multi", options: ["Crop expert", "People manager", "Future operational leader", "Modernize systems"] },
      { k: "hg_required_experience", label: "Experience absolutely required", type: "textarea" },
      { k: "hg_culture", label: "Personality / culture fit", type: "textarea" },
      { k: "hg_ornamental_required", label: "Ornamental wholesale experience required?", type: "select", options: ["Required", "Preferred", "Not required"] },
    ],
  },
  {
    id: "asst_grower", title: "Assistant Grower",
    fields: [
      { k: "ag_type", label: "Experienced or developmental?", type: "select", options: ["Experienced grower", "Developmental candidate", "Either"] },
      { k: "ag_focus", label: "Focus", type: "multi", options: ["Annuals", "Foliage", "Mixed"] },
      { k: "ag_ipm", label: "IPM / scouting emphasis", type: "select", options: ["Yes", "Maybe", "No"] },
      { k: "ag_production", label: "Production management emphasis", type: "select", options: ["Yes", "Maybe", "No"] },
      { k: "ag_future_leader", label: "Future leadership potential desired?", type: "select", options: ["Yes", "Maybe", "No"] },
    ],
  },
  {
    id: "compensation", title: "Compensation",
    fields: [
      { k: "comp_ideal_hg", label: "Ideal salary range — Head Grower", type: "text" },
      { k: "comp_max_hg", label: "Max realistic — Head Grower", type: "text" },
      { k: "comp_ideal_ag", label: "Ideal salary range — Assistant Grower", type: "text" },
      { k: "comp_max_ag", label: "Max realistic — Assistant Grower", type: "text" },
      { k: "comp_pay_impact", label: "Would increasing pay meaningfully improve candidate quality?", type: "textarea" },
      { k: "comp_bonuses", label: "Bonuses", type: "textarea" },
      { k: "comp_pto", label: "PTO", type: "text" },
      { k: "comp_housing", label: "Housing assistance", type: "textarea" },
      { k: "comp_schedule", label: "Schedule flexibility", type: "textarea" },
    ],
  },
  {
    id: "relocation", title: "Relocation",
    fields: [
      { k: "reloc_open", label: "Open to relocation candidates?", type: "select", options: ["Yes", "Preferred local", "No"] },
      { k: "reloc_moving", label: "Moving expenses", type: "textarea" },
      { k: "reloc_temp_housing", label: "Temporary housing", type: "textarea" },
      { k: "reloc_stipend", label: "Relocation stipend", type: "text" },
    ],
  },
  {
    id: "timeline", title: "Timeline",
    fields: [
      { k: "time_ideal_start", label: "Ideal start date", type: "date" },
      { k: "time_latest_start", label: "Latest acceptable start date", type: "date" },
      { k: "time_overlap", label: "Training / overlap time needed?", type: "textarea" },
    ],
  },
];

const NOTES_SECTIONS = [
  {
    id: "decision", title: "Final Decision",
    fields: [
      { k: "decision", label: "Decision", type: "select", options: ["Undecided", "Max Hire", "Full Recruiter Search", "Pass — not a fit"] },
      { k: "decision_notes", label: "Decision notes", type: "textarea" },
    ],
  },
  {
    id: "industry", title: "Industry Experience",
    fields: [
      { k: "ind_recent", label: "Recent ornamental wholesale greenhouse grower placements", type: "textarea" },
      { k: "ind_annuals", label: "Annuals experience", type: "textarea" },
      { k: "ind_perennials", label: "Perennials experience", type: "textarea" },
      { k: "ind_foliage", label: "Foliage experience", type: "textarea" },
      { k: "ind_midwest", label: "Midwest operations", type: "textarea" },
    ],
  },
  {
    id: "pool", title: "Candidate Pool",
    fields: [
      { k: "pool_size", label: "Realistic candidate pool size", type: "textarea" },
      { k: "pool_relocation", label: "Would these require relocation?", type: "textarea" },
      { k: "pool_currently_moving", label: "Are strong candidates currently moving jobs?", type: "textarea" },
    ],
  },
  {
    id: "process", title: "Recruiting Process",
    fields: [
      { k: "proc_sourcing", label: "How does the sourcing process work?", type: "textarea" },
      { k: "proc_passive", label: "Contacting passive candidates directly?", type: "textarea" },
      { k: "proc_customization", label: "How customized is outreach?", type: "textarea" },
      { k: "proc_count", label: "How many candidates contacted typically?", type: "textarea" },
      { k: "proc_timeline", label: "Time before first candidates appear?", type: "textarea" },
    ],
  },
  {
    id: "screening", title: "Candidate Screening",
    fields: [
      { k: "scr_depth", label: "Overall screening depth", type: "textarea" },
      { k: "scr_technical", label: "Screen for technical greenhouse knowledge?", type: "textarea" },
      { k: "scr_leadership", label: "Screen for leadership ability?", type: "textarea" },
      { k: "scr_relocation", label: "Screen for relocation willingness?", type: "textarea" },
      { k: "scr_comp", label: "Screen for compensation expectations?", type: "textarea" },
      { k: "scr_culture", label: "Screen for culture fit?", type: "textarea" },
    ],
  },
  {
    id: "comp", title: "Compensation Benchmarking",
    fields: [
      { k: "bench_range", label: "Competitive ranges for Midwest ornamental greenhouse growers", type: "textarea" },
      { k: "bench_strong", label: "Compensation level that begins attracting significantly stronger candidates", type: "textarea" },
    ],
  },
  {
    id: "max_vs_full", title: "Max Hire vs Full Search",
    fields: [
      { k: "rec_recommendation", label: "Their recommendation — Max Hire or Full Search?", type: "textarea" },
      { k: "rec_full_search_role", label: "Which role most likely needs full recruiting?", type: "textarea" },
      { k: "rec_when_upgrade", label: "What situations lead to upgrading from Max Hire?", type: "textarea" },
    ],
  },
  {
    id: "guarantees", title: "Guarantees / Risk Protection",
    fields: [
      { k: "guar_hire_fails", label: "What happens if the hire doesn't work out?", type: "textarea" },
      { k: "guar_replacement", label: "Replacement guarantee?", type: "textarea" },
      { k: "guar_refunds", label: "Refunds?", type: "textarea" },
      { k: "guar_period", label: "Guarantee period", type: "textarea" },
      { k: "guar_voids", label: "What voids the guarantee?", type: "textarea" },
    ],
  },
  {
    id: "eval", title: "Post-Call Evaluation",
    fields: [
      { k: "eval_ornamental_knowledge", label: "Knowledgeable about ornamental greenhouse operations?", type: "select", options: ["Yes", "Somewhat", "No"] },
      { k: "eval_wholesale_understanding", label: "Understood wholesale production realities?", type: "select", options: ["Yes", "Somewhat", "No"] },
      { k: "eval_realistic_pool", label: "Realistic about the candidate pool?", type: "select", options: ["Yes", "Somewhat", "No"] },
      { k: "eval_culture_understanding", label: "Understood the culture/personality we need?", type: "select", options: ["Yes", "Somewhat", "No"] },
      { k: "eval_pricing_strategy", label: "Did pricing and strategy make sense?", type: "select", options: ["Yes", "Somewhat", "No"] },
      { k: "eval_unique_access", label: "Can they access candidates we cannot reach ourselves?", type: "select", options: ["Yes", "Somewhat", "No"] },
      { k: "eval_overall_notes", label: "Overall takeaway / notes", type: "textarea" },
    ],
  },
];

// ── Hook to load + save a single hiring_forms row keyed by id ──
function useHiringForm(formId) {
  const db = getSupabase();
  const [content, setContent] = useState({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!db) { setLoaded(true); return; }
    let cancelled = false;
    db.from("hiring_forms").select("content").eq("id", formId).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      setContent(data?.content || {});
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [db, formId]);

  function setField(k, v) {
    setContent(prev => {
      const next = { ...prev, [k]: v };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (db) db.from("hiring_forms").upsert({ id: formId, content: next, updated_at: new Date().toISOString() });
      }, 600);
      return next;
    });
  }

  return { content, setField, loaded };
}

// ── Main page ───────────────────────────────────────────────────
export default function HeadGrowerHiring() {
  const { isOwner } = useAuth();
  const [section, setSectionState] = useState(() => {
    try { return localStorage.getItem("gh_hiring_section") || "prep"; } catch { return "prep"; }
  });
  const setSection = (s) => { setSectionState(s); try { localStorage.setItem("gh_hiring_section", s); } catch {} };

  if (!isOwner) {
    return (
      <div style={{ ...FONT, padding: 40, textAlign: "center", color: "#7a8c74" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>Restricted</div>
        <div style={{ fontSize: 13 }}>This page is only available to caleb@schlegelgreenhouse.com.</div>
      </div>
    );
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Print styles — hide nav/chrome, show forms cleanly */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .hire-print-wrap { padding: 0 !important; max-width: 100% !important; }
          .hire-card { box-shadow: none !important; border: 1px solid #ccc !important; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 28, fontWeight: 400, color: "#1a2a1a" }}>
            Head Grower Hiring
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            AgHires recruiting call prep, meeting notes, and candidate pipeline
          </div>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0ead8", marginBottom: 20, overflowX: "auto" }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ padding: "12px 22px", fontSize: 14, fontWeight: section === s.id ? 800 : 600,
              color: section === s.id ? "#1e2d1a" : "#7a8c74", background: "none", border: "none",
              borderBottom: section === s.id ? "3px solid #7fb069" : "3px solid transparent",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="hire-print-wrap">
        {section === "prep" && <FormView formId="meeting_prep" title="Meeting Prep — Internal Alignment" sections={PREP_SECTIONS} />}
        {section === "notes" && <FormView formId="meeting_notes" title="Meeting Notes — AgHires Call" sections={NOTES_SECTIONS} />}
        {section === "candidates" && <CandidatesView />}
      </div>
    </div>
  );
}

// ── Form view (used for both prep + notes) ──────────────────────
function FormView({ formId, title, sections }) {
  const { content, setField, loaded } = useHiringForm(formId);

  function exportMarkdown() {
    let md = `# ${title}\n\n_Exported ${new Date().toLocaleString()}_\n\n`;
    for (const sec of sections) {
      md += `## ${sec.title}\n\n`;
      for (const f of sec.fields) {
        const v = content[f.k];
        let display = "—";
        if (f.type === "multi" && Array.isArray(v) && v.length) display = v.join(", ");
        else if (v != null && v !== "") display = String(v);
        md += `**${f.label}**\n\n${display}\n\n`;
      }
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formId}-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!loaded) return <div style={{ ...card, color: "#7a8c74" }}>Loading…</div>;

  return (
    <div>
      <div className="no-print" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>Auto-saves as you type. Use the buttons to print or export.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportMarkdown} style={btnSec}>📄 Export .md</button>
          <button onClick={() => window.print()} style={btnPrimary}>🖨 Print</button>
        </div>
      </div>

      <div style={{ ...card, padding: "24px 28px" }} className="hire-card">
        <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 22, fontWeight: 400, color: "#1a2a1a", marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>Last opened {new Date().toLocaleString()}</div>

        {sections.map(sec => (
          <div key={sec.id} style={{ marginBottom: 24, paddingTop: 12, borderTop: "1.5px solid #f0f5ee" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", marginBottom: 14, fontFamily: "'DM Serif Display',Georgia,serif" }}>
              {sec.title}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {sec.fields.map(f => <FormField key={f.k} field={f} value={content[f.k]} onChange={(v) => setField(f.k, v)} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormField({ field, value, onChange }) {
  const f = field;
  return (
    <div>
      <label style={labelStyle}>{f.label}</label>
      {f.type === "text" && (
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
      {f.type === "date" && (
        <input type="date" value={value || ""} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
      {f.type === "textarea" && (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} style={textareaStyle} />
      )}
      {f.type === "select" && (
        <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">— select —</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.type === "multi" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(f.options || []).map(o => {
            const arr = Array.isArray(value) ? value : [];
            const active = arr.includes(o);
            return (
              <button key={o} onClick={() => onChange(active ? arr.filter(x => x !== o) : [...arr, o])}
                style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1.5px solid ${active ? "#7fb069" : "#c8d8c0"}`, background: active ? "#7fb069" : "#fff", color: active ? "#fff" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                {active ? "✓ " : ""}{o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Candidates view ─────────────────────────────────────────────
const ROLES = ["Head Grower", "Assistant Grower"];
const STATUSES = [
  { id: "new", label: "New", color: "#7a8c74" },
  { id: "phone_screen", label: "Phone screen", color: "#4a90d9" },
  { id: "interview", label: "Interview", color: "#e89a3a" },
  { id: "offer", label: "Offer", color: "#8e44ad" },
  { id: "hired", label: "Hired", color: "#7fb069" },
  { id: "declined", label: "Declined", color: "#d94f3d" },
];
const SOURCES = ["AgHires", "Referral", "LinkedIn", "Direct outreach", "Other"];

function CandidatesView() {
  const { rows: candidates, upsert, remove, refresh } = useHiringCandidates();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const filtered = useMemo(() => {
    let r = candidates;
    if (statusFilter !== "all") r = r.filter(c => c.status === statusFilter);
    if (roleFilter !== "all") r = r.filter(c => c.role === roleFilter);
    return r;
  }, [candidates, statusFilter, roleFilter]);

  return (
    <div>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 4 }}>Role:</span>
          <FilterChip active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>All</FilterChip>
          {ROLES.map(r => <FilterChip key={r} active={roleFilter === r} onClick={() => setRoleFilter(r)}>{r}</FilterChip>)}
          <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", margin: "0 4px 0 12px" }}>Status:</span>
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterChip>
          {STATUSES.map(s => <FilterChip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)} color={s.color}>{s.label}</FilterChip>)}
        </div>
        <button onClick={() => setAdding(true)} style={btnPrimary}>+ Add Candidate</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a1a", marginBottom: 4 }}>No candidates yet</div>
          <div style={{ fontSize: 12 }}>Add resumes and contact info as candidates come in.</div>
        </div>
      ) : (
        filtered.map(c => <CandidateCard key={c.id} candidate={c} onEdit={() => setEditing(c)} onDelete={async () => { if (window.confirm(`Delete ${c.name}?`)) { await remove(c.id); refresh(); } }} />)
      )}

      {adding && <CandidateModal onCancel={() => setAdding(false)} onSave={async (data) => { await upsert({ id: crypto.randomUUID(), ...data }); setAdding(false); refresh(); }} />}
      {editing && <CandidateModal candidate={editing} onCancel={() => setEditing(null)} onSave={async (data) => { await upsert({ ...editing, ...data, updatedAt: new Date().toISOString() }); setEditing(null); refresh(); }} />}
    </div>
  );
}

function FilterChip({ active, onClick, children, color }) {
  return (
    <button onClick={onClick}
      style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1.5px solid ${active ? (color || "#7fb069") : "#c8d8c0"}`, background: active ? (color || "#7fb069") : "#f2f5ef", color: active ? "#fff" : "#7a8c74", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

function CandidateCard({ candidate: c, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUSES.find(s => s.id === c.status) || STATUSES[0];
  const resumeUrl = useResumeUrl(c.resumePath);
  const stars = Math.max(0, Math.min(5, parseInt(c.rating) || 0));
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>{c.name}</div>
            <span style={{ background: status.color, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{status.label}</span>
            {c.role && <span style={{ fontSize: 11, color: "#7a8c74", fontWeight: 600 }}>· {c.role}</span>}
            {stars > 0 && <span style={{ color: "#e89a3a", fontSize: 13 }}>{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>}
          </div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {c.currentEmployer && <span>{c.currentEmployer}</span>}
            {c.location && <span>📍 {c.location}</span>}
            {c.yearsExperience != null && <span>{c.yearsExperience} yrs exp</span>}
            {c.source && <span>· via {c.source}</span>}
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ ...btnSec, padding: "6px 12px", fontSize: 12 }}>Edit</button>
      </div>
      {expanded && (
        <div style={{ padding: "14px 18px", borderTop: "1.5px solid #e0ead8", background: "#f9fbf6" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 13, color: "#1e2d1a" }}>
            {c.email && <div><b style={{ color: "#7a8c74", fontSize: 11, display: "block" }}>Email</b><a href={`mailto:${c.email}`} style={{ color: "#4a90d9" }}>{c.email}</a></div>}
            {c.phone && <div><b style={{ color: "#7a8c74", fontSize: 11, display: "block" }}>Phone</b><a href={`tel:${c.phone}`} style={{ color: "#4a90d9" }}>{c.phone}</a></div>}
            {c.linkedinUrl && <div><b style={{ color: "#7a8c74", fontSize: 11, display: "block" }}>LinkedIn</b><a href={c.linkedinUrl} target="_blank" rel="noreferrer" style={{ color: "#4a90d9" }}>{c.linkedinUrl}</a></div>}
            {c.compensationExpectation && <div><b style={{ color: "#7a8c74", fontSize: 11, display: "block" }}>Expects</b>{c.compensationExpectation}</div>}
            {c.willingToRelocate != null && <div><b style={{ color: "#7a8c74", fontSize: 11, display: "block" }}>Relocate</b>{c.willingToRelocate ? "Yes" : "No"}</div>}
            {c.earliestStartDate && <div><b style={{ color: "#7a8c74", fontSize: 11, display: "block" }}>Earliest start</b>{c.earliestStartDate}</div>}
          </div>
          {c.experienceSummary && <div style={{ marginTop: 12 }}><b style={{ color: "#7a8c74", fontSize: 11, display: "block", marginBottom: 4 }}>Experience summary</b><div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{c.experienceSummary}</div></div>}
          {c.notes && <div style={{ marginTop: 12 }}><b style={{ color: "#7a8c74", fontSize: 11, display: "block", marginBottom: 4 }}>Notes</b><div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{c.notes}</div></div>}
          {resumeUrl && <div style={{ marginTop: 12 }}><a href={resumeUrl} target="_blank" rel="noreferrer" style={{ color: "#4a90d9", fontWeight: 700, fontSize: 13 }}>📄 View resume</a></div>}
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onDelete} style={{ ...btnSec, color: "#d94f3d", borderColor: "#d94f3d", padding: "6px 12px", fontSize: 12 }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function useResumeUrl(path) {
  const db = getSupabase();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!path || !db) { setUrl(null); return; }
    let cancelled = false;
    db.storage.from("hiring-resumes").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl || null);
    });
    return () => { cancelled = true; };
  }, [path, db]);
  return url;
}

function CandidateModal({ candidate, onCancel, onSave }) {
  const db = getSupabase();
  const c = candidate || {};
  const [form, setForm] = useState({
    name: c.name || "",
    role: c.role || ROLES[0],
    status: c.status || "new",
    source: c.source || "",
    phone: c.phone || "",
    email: c.email || "",
    linkedinUrl: c.linkedinUrl || "",
    location: c.location || "",
    currentEmployer: c.currentEmployer || "",
    yearsExperience: c.yearsExperience ?? "",
    experienceSummary: c.experienceSummary || "",
    compensationExpectation: c.compensationExpectation || "",
    willingToRelocate: c.willingToRelocate ?? null,
    earliestStartDate: c.earliestStartDate || "",
    rating: c.rating ?? 0,
    notes: c.notes || "",
    resumePath: c.resumePath || "",
  });
  const [uploading, setUploading] = useState(false);

  function upd(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function uploadResume(file) {
    if (!file || !db) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${form.name.replace(/[^a-z0-9]/gi, "_") || "candidate"}_${Date.now()}.${ext}`;
      const { error } = await db.storage.from("hiring-resumes").upload(path, file, { upsert: true });
      if (error) throw error;
      upd("resumePath", path);
    } catch (e) {
      alert("Upload failed: " + e.message);
    }
    setUploading(false);
  }

  function save() {
    if (!form.name.trim()) { alert("Name is required."); return; }
    const data = { ...form };
    if (data.yearsExperience === "") data.yearsExperience = null;
    else data.yearsExperience = parseInt(data.yearsExperience) || null;
    if (data.rating === "" || data.rating == null) data.rating = null;
    onSave(data);
  }

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1.5px solid #e0ead8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {candidate ? "Edit candidate" : "New candidate"}
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&times;</button>
        </div>
        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Full name</label>
            <input value={form.name} onChange={e => upd("name", e.target.value)} style={inputStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select value={form.role} onChange={e => upd("role", e.target.value)} style={inputStyle}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={e => upd("status", e.target.value)} style={inputStyle}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <select value={form.source} onChange={e => upd("source", e.target.value)} style={inputStyle}>
              <option value="">— select —</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Rating (1–5 stars)</label>
            <select value={form.rating ?? 0} onChange={e => upd("rating", parseInt(e.target.value))} style={inputStyle}>
              {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? "—" : "★".repeat(n) + "☆".repeat(5 - n)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={form.phone} onChange={e => upd("phone", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={form.email} onChange={e => upd("email", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>LinkedIn URL</label>
            <input value={form.linkedinUrl} onChange={e => upd("linkedinUrl", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Location (city, state)</label>
            <input value={form.location} onChange={e => upd("location", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Current employer</label>
            <input value={form.currentEmployer} onChange={e => upd("currentEmployer", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Years experience</label>
            <input type="number" value={form.yearsExperience} onChange={e => upd("yearsExperience", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Compensation expectation</label>
            <input value={form.compensationExpectation} onChange={e => upd("compensationExpectation", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Willing to relocate?</label>
            <select value={form.willingToRelocate == null ? "" : form.willingToRelocate ? "yes" : "no"} onChange={e => upd("willingToRelocate", e.target.value === "" ? null : e.target.value === "yes")} style={inputStyle}>
              <option value="">— unknown —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Earliest start date</label>
            <input type="date" value={form.earliestStartDate} onChange={e => upd("earliestStartDate", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Experience summary</label>
            <textarea value={form.experienceSummary} onChange={e => upd("experienceSummary", e.target.value)} style={textareaStyle} placeholder="Key roles, crops, scale of operations…" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => upd("notes", e.target.value)} style={textareaStyle} placeholder="Interview impressions, references, next steps…" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Resume (PDF or .docx)</label>
            <input type="file" accept=".pdf,.doc,.docx" onChange={e => uploadResume(e.target.files?.[0])} style={{ fontSize: 13 }} />
            {uploading && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>Uploading…</div>}
            {form.resumePath && !uploading && <div style={{ fontSize: 12, color: "#4a7a35", marginTop: 4 }}>✓ {form.resumePath}</div>}
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1.5px solid #e0ead8", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btnSec}>Cancel</button>
          <button onClick={save} style={btnPrimary}>Save</button>
        </div>
      </div>
    </div>
  );
}
