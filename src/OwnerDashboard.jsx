import { useState, useMemo } from "react";
import {
  useOwnerProjects, useOwnerBills, useOwnerNotes, useAppUsers,
  useCropRuns, useHpSales, useHpOrderItems, useHouses,
} from "./supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const FL = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>{children}</div>;
const SH = ({ children }) => <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 16, marginTop: 24 }}>{children}</div>;
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

const fmt$ = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt$2 = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SECTIONS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "projects", label: "Projects", icon: "📋" },
  { id: "bills", label: "Bills & Cashflow", icon: "💵" },
  { id: "notes", label: "Vault", icon: "🔒" },
  { id: "users", label: "Users", icon: "👥" },
];

export default function OwnerDashboard() {
  const [section, setSection] = useState("overview");

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 28, fontWeight: 400, color: "#1a2a1a" }}>
          Owner Dashboard
        </div>
        <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
          Private — visible only to you
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0ead8", marginBottom: 20, overflowX: "auto" }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ padding: "12px 22px", fontSize: 14, fontWeight: section === s.id ? 800 : 600,
              color: section === s.id ? "#1e2d1a" : "#7a8c74", background: "none", border: "none",
              borderBottom: section === s.id ? "3px solid #7fb069" : "3px solid transparent",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {section === "overview" && <OverviewTab />}
      {section === "projects" && <ProjectsTab />}
      {section === "bills" && <BillsTab />}
      {section === "notes" && <VaultTab />}
      {section === "users" && <UsersTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── OVERVIEW (BIRD'S EYE) ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab() {
  const { rows: cropRuns } = useCropRuns();
  const { rows: sales } = useHpSales();
  const { rows: orders } = useHpOrderItems();
  const { rows: houses } = useHouses();
  const { rows: bills } = useOwnerBills();
  const { rows: projects } = useOwnerProjects();

  const stats = useMemo(() => {
    const activeRuns = cropRuns.filter(r => r.status && r.status !== "shipped").length;
    const recentSales = sales.reduce((s, r) => s + (parseFloat(r.totalSales) || 0), 0);
    const pendingOrders = orders.length;
    const orderValue = orders.reduce((s, o) => s + (o.quantity * (parseFloat(o.unitPrice) || 0)), 0);
    const unpaidBills = bills.filter(b => b.status === "unpaid").reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    const openProjects = projects.filter(p => p.status === "open").length;
    return { activeRuns, recentSales, pendingOrders, orderValue, unpaidBills, openProjects };
  }, [cropRuns, sales, orders, bills, projects]);

  const salesByWeek = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      const p = s.reportPeriod || "Unknown";
      if (!map[p]) map[p] = { name: p, revenue: 0 };
      map[p].revenue += parseFloat(s.totalSales) || 0;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [sales]);

  const KPI = ({ label, value, color, sub }) => (
    <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "#1e2d1a", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KPI label="Active Crops" value={stats.activeRuns} color="#4a90d9" sub={`${cropRuns.length} total runs`} />
        <KPI label="Houseplant Revenue" value={fmt$(stats.recentSales)} color="#4a7a35" sub={`${sales.length} records`} />
        <KPI label="Open Orders" value={stats.pendingOrders} color="#c8791a" sub={fmt$(stats.orderValue) + " value"} />
        <KPI label="Unpaid Bills" value={fmt$(stats.unpaidBills)} color={stats.unpaidBills > 0 ? "#d94f3d" : "#7a8c74"} />
        <KPI label="Open Projects" value={stats.openProjects} color="#8e44ad" />
        <KPI label="Houses" value={houses.length} color="#7fb069" />
      </div>

      {salesByWeek.length > 1 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Houseplant Revenue Trend</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={salesByWeek}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <Tooltip formatter={v => fmt$(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#7fb069" strokeWidth={3} dot={{ fill: "#1e2d1a", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PROJECTS ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const PROJECT_STATUSES = [
  { id: "open", label: "Open", color: "#4a90d9", bg: "#e8f0ff" },
  { id: "in_progress", label: "In Progress", color: "#c8791a", bg: "#fff4e8" },
  { id: "blocked", label: "Blocked", color: "#d94f3d", bg: "#fde8e8" },
  { id: "completed", label: "Completed", color: "#4a7a35", bg: "#e8f5e0" },
];

const PROJECT_PRIORITIES = [
  { id: "low", label: "Low", color: "#7a8c74" },
  { id: "normal", label: "Normal", color: "#4a90d9" },
  { id: "high", label: "High", color: "#c8791a" },
  { id: "critical", label: "Critical", color: "#d94f3d" },
];

const PROJECT_BLANK = { title: "", description: "", status: "open", priority: "normal", category: "", dueDate: "", notes: "" };

function ProjectsTab() {
  const { rows: projects, upsert, remove } = useOwnerProjects();
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = statusFilter === "all" ? projects : projects.filter(p => p.status === statusFilter);

  if (view === "form") return <ProjectForm initial={editing}
    onSave={async (p) => { await upsert(p); setView("list"); setEditing(null); }}
    onCancel={() => { setView("list"); setEditing(null); }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setStatusFilter("all")} style={{ ...BTN_SEC, ...(statusFilter === "all" ? { borderColor: "#7fb069", color: "#1e2d1a", fontWeight: 800 } : {}), fontSize: 12 }}>All ({projects.length})</button>
          {PROJECT_STATUSES.map(s => {
            const n = projects.filter(p => p.status === s.id).length;
            return <button key={s.id} onClick={() => setStatusFilter(s.id)}
              style={{ ...BTN_SEC, ...(statusFilter === s.id ? { borderColor: s.color, color: s.color, fontWeight: 800 } : {}), fontSize: 12 }}>
              {s.label} ({n})
            </button>;
          })}
        </div>
        <button onClick={() => { setEditing(null); setView("form"); }} style={BTN}>+ New Project</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 16 }}>Track private projects only you can see</div>
          <button onClick={() => { setEditing(null); setView("form"); }} style={BTN}>Create First Project</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(p => {
            const st = PROJECT_STATUSES.find(s => s.id === p.status) || PROJECT_STATUSES[0];
            const pr = PROJECT_PRIORITIES.find(s => s.id === p.priority) || PROJECT_PRIORITIES[1];
            const overdue = p.dueDate && new Date(p.dueDate) < new Date() && p.status !== "completed";
            return (
              <div key={p.id} onClick={() => { setEditing(p); setView("form"); }}
                style={{ ...card, cursor: "pointer", borderColor: overdue ? "#f0c8c0" : "#e0ead8", transition: "all .15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = overdue ? "#f0c8c0" : "#e0ead8"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{p.title}</div>
                  <span style={{ background: st.bg, color: st.color, borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span>
                </div>
                {p.description && <div style={{ fontSize: 13, color: "#4a5a40", marginBottom: 8, lineHeight: 1.5 }}>{p.description.slice(0, 120)}{p.description.length > 120 ? "..." : ""}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
                  <span style={{ color: pr.color, fontWeight: 700 }}>● {pr.label}</span>
                  {p.category && <span style={{ color: "#7a8c74" }}>• {p.category}</span>}
                  {p.dueDate && <span style={{ color: overdue ? "#d94f3d" : "#7a8c74", fontWeight: overdue ? 700 : 400 }}>• Due {p.dueDate}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...PROJECT_BLANK, ...initial } : PROJECT_BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  function save() {
    if (!f.title.trim()) return;
    onSave({ ...f, id: f.id || crypto.randomUUID(), updatedAt: new Date().toISOString() });
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Project" : "New Project"}</div>
      </div>

      <div style={card}>
        <div style={{ marginBottom: 12 }}>
          <FL>Title *</FL>
          <input value={f.title} onChange={e => upd("title", e.target.value)} style={IS(false)} placeholder="e.g. New broker contract negotiation" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <FL>Description</FL>
          <textarea value={f.description} onChange={e => upd("description", e.target.value)} style={{ ...IS(false), minHeight: 80, resize: "vertical" }} placeholder="What needs to happen?" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <FL>Status</FL>
            <select value={f.status} onChange={e => upd("status", e.target.value)} style={IS(false)}>
              {PROJECT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <FL>Priority</FL>
            <select value={f.priority} onChange={e => upd("priority", e.target.value)} style={IS(false)}>
              {PROJECT_PRIORITIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <FL>Category</FL>
            <input value={f.category} onChange={e => upd("category", e.target.value)} style={IS(false)} placeholder="e.g. Strategic, Legal, Financial" />
          </div>
          <div>
            <FL>Due Date</FL>
            <input type="date" value={f.dueDate || ""} onChange={e => upd("dueDate", e.target.value)} style={IS(false)} />
          </div>
        </div>
        <div>
          <FL>Notes</FL>
          <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS(false), minHeight: 100, resize: "vertical" }} placeholder="Confidential notes, decisions, contacts..." />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} style={{ ...BTN, flex: 1, padding: 14 }}>{initial ? "Save Changes" : "Create Project"}</button>
        <button onClick={onCancel} style={{ ...BTN_SEC, padding: 14 }}>Cancel</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── BILLS & CASHFLOW ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const BILL_BLANK = { vendor: "", amount: "", category: "", billDate: "", dueDate: "", paidAt: "", status: "unpaid", recurring: false, frequency: "", paymentMethod: "", account: "", invoiceNumber: "", notes: "" };
const BILL_CATEGORIES = ["Utilities", "Rent/Mortgage", "Supplies", "Labor", "Insurance", "Equipment", "Vehicles", "Loan Payment", "Tax", "Professional Services", "Other"];

function BillsTab() {
  const { rows: bills, upsert, remove } = useOwnerBills();
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("unpaid");

  const filtered = useMemo(() => {
    let items = bills;
    if (statusFilter !== "all") items = items.filter(b => b.status === statusFilter);
    return items.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  }, [bills, statusFilter]);

  const totals = useMemo(() => {
    const unpaid = bills.filter(b => b.status === "unpaid").reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    const paidThisMonth = bills.filter(b => b.status === "paid" && b.paidAt && b.paidAt.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    const overdueCount = bills.filter(b => b.status === "unpaid" && b.dueDate && new Date(b.dueDate) < new Date()).length;
    return { unpaid, paidThisMonth, overdueCount };
  }, [bills]);

  const byCategory = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const cat = b.category || "Uncategorized";
      if (!map[cat]) map[cat] = { name: cat, total: 0, count: 0 };
      map[cat].total += parseFloat(b.amount) || 0;
      map[cat].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bills]);

  if (view === "form") return <BillForm initial={editing}
    onSave={async (b) => { await upsert(b); setView("list"); setEditing(null); }}
    onCancel={() => { setView("list"); setEditing(null); }} />;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Outstanding</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: totals.unpaid > 0 ? "#d94f3d" : "#7a8c74" }}>{fmt$(totals.unpaid)}</div>
          {totals.overdueCount > 0 && <div style={{ fontSize: 12, color: "#d94f3d", fontWeight: 700, marginTop: 2 }}>{totals.overdueCount} overdue</div>}
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Paid This Month</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#4a7a35" }}>{fmt$(totals.paidThisMonth)}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Total Bills</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2d1a" }}>{bills.length}</div>
        </div>
      </div>

      {/* By category chart */}
      {byCategory.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Spending by Category</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byCategory} layout="vertical" margin={{ left: 120, right: 20 }}>
              <XAxis type="number" tickFormatter={v => fmt$(v)} tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={120} />
              <Tooltip formatter={v => fmt$2(v)} />
              <Bar dataKey="total" fill="#7fb069" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {["unpaid", "paid", "all"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ ...BTN_SEC, ...(statusFilter === s ? { borderColor: "#7fb069", color: "#1e2d1a", fontWeight: 800 } : {}), fontSize: 12, textTransform: "capitalize" }}>
            {s}
          </button>
        ))}
        <button onClick={() => { setEditing(null); setView("form"); }} style={{ ...BTN, marginLeft: "auto" }}>+ Add Bill</button>
      </div>

      {/* Bill list */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px", color: "#7a8c74" }}>No {statusFilter !== "all" ? statusFilter : ""} bills</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
          {filtered.map((b, i) => {
            const overdue = b.status === "unpaid" && b.dueDate && new Date(b.dueDate) < new Date();
            return (
              <div key={b.id} onClick={() => { setEditing(b); setView("form"); }}
                style={{ display: "flex", padding: "12px 18px", borderBottom: i < filtered.length - 1 ? "1px solid #f0f5ee" : "none", cursor: "pointer", background: i % 2 === 0 ? "#fff" : "#fafcf8", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{b.vendor}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>{b.category} {b.invoiceNumber && `• #${b.invoiceNumber}`}</div>
                </div>
                <div style={{ flex: 1, fontSize: 12, color: overdue ? "#d94f3d" : "#7a8c74", fontWeight: overdue ? 700 : 400 }}>
                  {b.dueDate ? `Due ${b.dueDate}` : ""}
                  {overdue && " • OVERDUE"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: b.status === "paid" ? "#7a8c74" : "#1e2d1a", textDecoration: b.status === "paid" ? "line-through" : "none" }}>
                  {fmt$2(b.amount)}
                </div>
                <span style={{ background: b.status === "paid" ? "#e8f5e0" : overdue ? "#fde8e8" : "#fff4e8", color: b.status === "paid" ? "#4a7a35" : overdue ? "#d94f3d" : "#c8791a", borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                  {b.status === "paid" ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BillForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...BILL_BLANK, ...initial } : BILL_BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  function save() {
    if (!f.vendor.trim() || !f.amount) return;
    onSave({ ...f, id: f.id || crypto.randomUUID(), amount: parseFloat(f.amount), updatedAt: new Date().toISOString() });
  }

  function markPaid() {
    upd("status", "paid");
    upd("paidAt", new Date().toISOString().slice(0, 10));
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Bill" : "New Bill"}</div>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <FL>Vendor *</FL>
            <input value={f.vendor} onChange={e => upd("vendor", e.target.value)} style={IS(false)} placeholder="e.g. Duke Energy" />
          </div>
          <div>
            <FL>Amount *</FL>
            <input type="number" step="0.01" value={f.amount} onChange={e => upd("amount", e.target.value)} style={IS(false)} placeholder="0.00" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <FL>Category</FL>
            <select value={f.category} onChange={e => upd("category", e.target.value)} style={IS(false)}>
              <option value="">Select...</option>
              {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <FL>Bill Date</FL>
            <input type="date" value={f.billDate || ""} onChange={e => upd("billDate", e.target.value)} style={IS(false)} />
          </div>
          <div>
            <FL>Due Date</FL>
            <input type="date" value={f.dueDate || ""} onChange={e => upd("dueDate", e.target.value)} style={IS(false)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <FL>Invoice Number</FL>
            <input value={f.invoiceNumber} onChange={e => upd("invoiceNumber", e.target.value)} style={IS(false)} placeholder="Optional" />
          </div>
          <div>
            <FL>Account</FL>
            <input value={f.account} onChange={e => upd("account", e.target.value)} style={IS(false)} placeholder="Account # or name" />
          </div>
          <div>
            <FL>Payment Method</FL>
            <input value={f.paymentMethod} onChange={e => upd("paymentMethod", e.target.value)} style={IS(false)} placeholder="e.g. ACH, Check, Card" />
          </div>
          <div>
            <FL>Status</FL>
            <select value={f.status} onChange={e => upd("status", e.target.value)} style={IS(false)}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="scheduled">Scheduled</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 13, color: "#1e2d1a" }}>
          <input type="checkbox" checked={f.recurring} onChange={e => upd("recurring", e.target.checked)} />
          Recurring bill
          {f.recurring && (
            <select value={f.frequency} onChange={e => upd("frequency", e.target.value)} style={{ ...IS(false), width: "auto", marginLeft: 8 }}>
              <option value="">Frequency...</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          )}
        </label>

        {f.status === "paid" && (
          <div style={{ marginBottom: 12 }}>
            <FL>Paid Date</FL>
            <input type="date" value={f.paidAt || ""} onChange={e => upd("paidAt", e.target.value)} style={IS(false)} />
          </div>
        )}

        <div>
          <FL>Notes</FL>
          <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS(false), minHeight: 70, resize: "vertical" }} placeholder="Optional notes..." />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} style={{ ...BTN, flex: 1, padding: 14 }}>{initial ? "Save Changes" : "Add Bill"}</button>
        {initial && f.status !== "paid" && (
          <button onClick={() => { markPaid(); save(); }} style={{ ...BTN, padding: 14, background: "#4a7a35" }}>Mark Paid</button>
        )}
        <button onClick={onCancel} style={{ ...BTN_SEC, padding: 14 }}>Cancel</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VAULT (sensitive notes) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const NOTE_BLANK = { title: "", content: "", category: "", pinned: false };

function VaultTab() {
  const { rows: notes, upsert, remove } = useOwnerNotes();
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [searchQ, setSearchQ] = useState("");

  const filtered = useMemo(() => {
    let items = notes;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter(n => (n.title || "").toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q) || (n.category || "").toLowerCase().includes(q));
    }
    return [...items].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [notes, searchQ]);

  if (view === "form") return <NoteForm initial={editing}
    onSave={async (n) => { await upsert(n); setView("list"); setEditing(null); }}
    onDelete={async (id) => { if (window.confirm("Delete this note?")) { await remove(id); setView("list"); setEditing(null); } }}
    onCancel={() => { setView("list"); setEditing(null); }} />;

  return (
    <div>
      <div style={{ background: "#fff4e8", border: "1.5px solid #e8d0a0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#6a4a20" }}>
        🔒 This area stores sensitive notes. Visible only to you. Use for account numbers, passwords, vendor contacts, strategic plans, etc.
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search vault..." style={{ ...IS(!!searchQ), maxWidth: 400 }} />
        <button onClick={() => { setEditing(null); setView("form"); }} style={{ ...BTN, marginLeft: "auto" }}>+ New Note</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>{searchQ ? "No matches" : "Vault is empty"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map(n => (
            <div key={n.id} onClick={() => { setEditing(n); setView("form"); }}
              style={{ ...card, cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a" }}>{n.pinned && "📌 "}{n.title}</div>
                {n.category && <span style={{ background: "#f0f8eb", color: "#4a7a35", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{n.category}</span>}
              </div>
              <div style={{ fontSize: 12, color: "#7a8c74", lineHeight: 1.5 }}>
                {(n.content || "").slice(0, 120)}{(n.content || "").length > 120 ? "..." : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteForm({ initial, onSave, onDelete, onCancel }) {
  const [f, setF] = useState(initial ? { ...NOTE_BLANK, ...initial } : NOTE_BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  function save() {
    if (!f.title.trim()) return;
    onSave({ ...f, id: f.id || crypto.randomUUID(), updatedAt: new Date().toISOString() });
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Note" : "New Note"}</div>
        {initial && <button onClick={() => onDelete(initial.id)} style={{ ...BTN_SEC, borderColor: "#f0c8c0", color: "#d94f3d", fontSize: 12 }}>Delete</button>}
      </div>

      <div style={card}>
        <div style={{ marginBottom: 12 }}>
          <FL>Title *</FL>
          <input value={f.title} onChange={e => upd("title", e.target.value)} style={IS(false)} placeholder="e.g. Bank account info" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
          <div>
            <FL>Category</FL>
            <input value={f.category} onChange={e => upd("category", e.target.value)} style={IS(false)} placeholder="e.g. Banking, Insurance, Strategic" />
          </div>
          <label style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingBottom: 11, fontSize: 13, color: "#1e2d1a" }}>
            <input type="checkbox" checked={f.pinned} onChange={e => upd("pinned", e.target.checked)} />
            Pin
          </label>
        </div>
        <div>
          <FL>Content</FL>
          <textarea value={f.content} onChange={e => upd("content", e.target.value)} style={{ ...IS(false), minHeight: 240, resize: "vertical", fontFamily: "monospace" }} placeholder="Enter sensitive details..." />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} style={{ ...BTN, flex: 1, padding: 14 }}>{initial ? "Save Changes" : "Save Note"}</button>
        <button onClick={onCancel} style={{ ...BTN_SEC, padding: 14 }}>Cancel</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── USERS ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const ROLE_META = {
  owner: { label: "Owner", color: "#8e44ad", bg: "#f5f0ff" },
  admin: { label: "Admin", color: "#4a90d9", bg: "#e8f0ff" },
  viewer: { label: "Viewer", color: "#7a8c74", bg: "#f0f5ee" },
};

function UsersTab() {
  const { rows: users, upsert, remove } = useAppUsers();

  async function changeRole(user, newRole) {
    await upsert({ ...user, role: newRole });
  }

  async function toggleActive(user) {
    await upsert({ ...user, active: !user.active });
  }

  return (
    <div>
      <div style={{ background: "#fff4e8", border: "1.5px solid #e8d0a0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#6a4a20" }}>
        ℹ️ To add new users, create them in Supabase Auth or have them sign up. They'll appear here automatically and you can assign them a role.
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", padding: "12px 18px", background: "#fafcf8", borderBottom: "2px solid #e0ead8", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>
          <div>User</div>
          <div>Role</div>
          <div>Status</div>
          <div>Last Login</div>
          <div></div>
        </div>
        {users.map(u => {
          const role = ROLE_META[u.role] || ROLE_META.admin;
          return (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 100px", padding: "14px 18px", borderBottom: "1px solid #f0f5ee", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{u.displayName || u.email.split("@")[0]}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{u.email}</div>
              </div>
              <div>
                <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${role.color}`, background: role.bg, color: role.color, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                  {Object.entries(ROLE_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <span style={{ background: u.active ? "#e8f5e0" : "#f0f5ee", color: u.active ? "#4a7a35" : "#7a8c74", borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                  {u.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#7a8c74" }}>
                {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button onClick={() => toggleActive(u)} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                  {u.active ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
