import { useState, useMemo, useEffect, useRef } from "react";
import { useBrehobItems } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const BORDER = "#e0ead8";
const AMBER = "#e89a3a";
const RED = "#d94f3d";

const CATEGORIES = ["Chemicals", "Hard Goods", "Tools", "Other"];
const URGENCIES = [
  { value: "high", label: "Need today", color: RED },
  { value: "normal", label: "This week", color: AMBER },
  { value: "low", label: "Whenever", color: GREEN },
];

function fmtMoney(n) { if (!n && n !== 0) return "—"; return `$${Number(n).toFixed(2)}`; }
function fmtDate(iso) { if (!iso) return ""; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

// ── Manager View (can suggest, approve, mark purchased, remove) ──
export function BrehobManagerView() {
  const { rows: items, insert, update, remove } = useBrehobItems();
  const { displayName } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [decliningId, setDecliningId] = useState(null);
  const autoOpenedRef = useRef(false);

  const pending = useMemo(() => items.filter(i => i.status === "pending"), [items]);
  const onList = useMemo(() => items.filter(i => i.status === "on_list"), [items]);
  const purchased = useMemo(() => items.filter(i => i.status === "purchased").slice(0, 20), [items]);
  const declined = useMemo(() => items.filter(i => i.status === "declined").slice(0, 10), [items]);

  useEffect(() => {
    if (!autoOpenedRef.current && pending.length > 0) {
      autoOpenedRef.current = true;
      setShowPending(true);
    }
  }, [pending.length]);

  async function approveItem(item) {
    await update(item.id, { status: "on_list", approvedBy: displayName, approvedAt: new Date().toISOString() });
  }

  async function declineItem(item, reason) {
    await update(item.id, { status: "declined", declineReason: reason, approvedBy: displayName, approvedAt: new Date().toISOString() });
    setDecliningId(null);
  }

  async function markPurchased(item, actualCost) {
    await update(item.id, { status: "purchased", purchasedBy: displayName, purchasedAt: new Date().toISOString(), actualCost: actualCost || item.estimatedCost || null });
  }

  async function removeItem(item) {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    await remove(item.id);
  }

  async function addItem(form) {
    await insert({
      id: crypto.randomUUID(),
      name: form.name,
      qty: form.qty || null,
      category: form.category || "Other",
      urgency: form.urgency || "normal",
      notes: form.notes || null,
      estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null,
      requestedBy: displayName,
      status: "on_list",
      approvedBy: displayName,
      approvedAt: new Date().toISOString(),
    });
    setShowAdd(false);
  }

  const onListByCat = useMemo(() => {
    const m = {};
    for (const cat of CATEGORIES) m[cat] = [];
    for (const i of onList) {
      const c = i.category || "Other";
      if (!m[c]) m[c] = [];
      m[c].push(i);
    }
    return m;
  }, [onList]);

  const totalEst = onList.reduce((s, i) => s + (parseFloat(i.estimatedCost) || 0), 0);

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shopping List</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Brehob</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{onList.length} items · Est. {fmtMoney(totalEst)}</div>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: "12px 18px", background: GREEN, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Item
        </button>
      </div>

      {/* Pending approvals banner */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setShowPending(!showPending)}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${AMBER}`, background: "#fff7ec", color: DARK, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            🛒 {pending.length} suggestion{pending.length !== 1 ? "s" : ""} awaiting your review {showPending ? "▾" : "▸"}
          </button>
          {showPending && (
            <div style={{ marginTop: 8, background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
              {pending.map(item => (
                <div key={item.id} style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>
                        {item.name}
                        {item.qty && <span style={{ marginLeft: 8, color: MUTED, fontWeight: 600 }}>× {item.qty}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        {item.category} · {URGENCIES.find(u => u.value === item.urgency)?.label || item.urgency} · Requested by {item.requestedBy || "—"}
                      </div>
                      {item.notes && <div style={{ fontSize: 12, color: DARK, marginTop: 4, fontStyle: "italic" }}>"{item.notes}"</div>}
                    </div>
                  </div>
                  {decliningId === item.id ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <input type="text" placeholder="Why decline? (e.g. 'have in East shed')"
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) declineItem(item, e.target.value.trim()); }}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit" }} />
                      <button onClick={() => setDecliningId(null)}
                        style={{ padding: "8px 12px", background: "#fff", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <button onClick={() => approveItem(item)}
                        style={{ flex: 1, padding: "10px 0", background: GREEN, color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✓ Add to list</button>
                      <button onClick={() => setDecliningId(item.id)}
                        style={{ flex: 1, padding: "10px 0", background: "#fff", color: RED, border: `1.5px solid ${RED}`, borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✗ Decline</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* On list, grouped by category */}
      <div style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ background: "#fafcf8", padding: "10px 14px", fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${BORDER}` }}>
          📋 Shopping List
        </div>
        {onList.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: 13 }}>List is empty — add items when you need them.</div>
        ) : (
          CATEGORIES.filter(c => onListByCat[c]?.length > 0).map(cat => (
            <div key={cat}>
              <div style={{ padding: "6px 14px", background: "#f7faf4", fontSize: 10, fontWeight: 800, color: DARK, textTransform: "uppercase", letterSpacing: 0.8 }}>
                {cat} ({onListByCat[cat].length})
              </div>
              {onListByCat[cat].map(item => (
                <ItemRow key={item.id} item={item} onPurchase={markPurchased} onRemove={removeItem} showActions />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Recently purchased */}
      {purchased.length > 0 && (
        <div style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ background: "#fafcf8", padding: "10px 14px", fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${BORDER}` }}>
            ✓ Recently Purchased
          </div>
          {purchased.map(item => (
            <div key={item.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: MUTED, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 700, color: DARK }}>{item.name}</span>
                {item.qty && <span> × {item.qty}</span>}
                <span style={{ marginLeft: 8, fontSize: 10 }}>{item.purchasedBy} · {fmtDate(item.purchasedAt)}</span>
              </div>
              <div style={{ color: GREEN, fontWeight: 700 }}>{fmtMoney(item.actualCost)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Declined */}
      {declined.length > 0 && (
        <div style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ background: "#fafcf8", padding: "10px 14px", fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${BORDER}` }}>
            ✗ Recently Declined
          </div>
          {declined.map(item => (
            <div key={item.id} style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: MUTED }}>
              <span style={{ fontWeight: 700, color: DARK }}>{item.name}</span>
              {item.declineReason && <span style={{ marginLeft: 8, fontStyle: "italic" }}>— {item.declineReason}</span>}
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddItemModal onSave={addItem} onCancel={() => setShowAdd(false)} />}
    </div>
  );
}

// ── Worker View (suggest only, view approved list) ──
export function BrehobWorkerView({ compact = false }) {
  const { rows: items, insert, update } = useBrehobItems();
  const { displayName } = useAuth();
  const [showSuggest, setShowSuggest] = useState(false);

  const onList = useMemo(() => items.filter(i => i.status === "on_list"), [items]);
  const mine = useMemo(() => items.filter(i => i.requestedBy === displayName && i.status === "pending"), [items, displayName]);

  async function suggestItem(form) {
    await insert({
      id: crypto.randomUUID(),
      name: form.name,
      qty: form.qty || null,
      category: form.category || "Other",
      urgency: form.urgency || "normal",
      notes: form.notes || null,
      requestedBy: displayName,
      status: "pending",
    });
    setShowSuggest(false);
  }

  async function markPurchased(item, actualCost) {
    await update(item.id, { status: "purchased", purchasedBy: displayName, purchasedAt: new Date().toISOString(), actualCost: actualCost || item.estimatedCost || null });
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shopping List</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Brehob</div>
        </div>
        <button onClick={() => setShowSuggest(true)}
          style={{ padding: "10px 14px", background: GREEN, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ➕ Suggest
        </button>
      </div>

      {mine.length > 0 && (
        <div style={{ padding: "8px 12px", background: "#fff7ec", border: `1px solid ${AMBER}`, borderRadius: 10, marginBottom: 10, fontSize: 12, color: DARK }}>
          ⏳ You have {mine.length} suggestion{mine.length !== 1 ? "s" : ""} awaiting manager review.
        </div>
      )}

      {onList.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 12, border: `1.5px dashed ${BORDER}`, borderRadius: 10 }}>
          Nothing on the list right now. Suggest items if you need them.
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", background: "#fafcf8", borderBottom: `1px solid ${BORDER}` }}>
            {onList.length} item{onList.length !== 1 ? "s" : ""} on list
          </div>
          {onList.map(item => (
            <ItemRow key={item.id} item={item} onPurchase={markPurchased} showActions />
          ))}
        </div>
      )}

      {showSuggest && <SuggestModal onSave={suggestItem} onCancel={() => setShowSuggest(false)} />}
    </div>
  );
}

// ── Row component ──
function ItemRow({ item, onPurchase, onRemove, showActions }) {
  const [entering, setEntering] = useState(false);
  const [costInput, setCostInput] = useState("");
  const urg = URGENCIES.find(u => u.value === item.urgency) || URGENCIES[1];

  return (
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>
          {item.name}
          {item.qty && <span style={{ marginLeft: 8, color: MUTED, fontWeight: 600 }}>× {item.qty}</span>}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: urg.color, fontWeight: 700 }}>{urg.label}</span>
          {item.estimatedCost && <span>~{fmtMoney(item.estimatedCost)}</span>}
          {item.requestedBy && <span>· {item.requestedBy}</span>}
        </div>
        {item.notes && <div style={{ fontSize: 11, color: DARK, marginTop: 2, fontStyle: "italic" }}>"{item.notes}"</div>}
      </div>
      {showActions && (
        entering ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: MUTED }}>$</span>
            <input type="number" step="0.01" value={costInput} onChange={e => setCostInput(e.target.value)}
              placeholder="cost" autoFocus
              onKeyDown={e => { if (e.key === "Enter") { onPurchase(item, parseFloat(costInput) || null); setEntering(false); setCostInput(""); } }}
              style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
            <button onClick={() => { onPurchase(item, parseFloat(costInput) || null); setEntering(false); setCostInput(""); }}
              style={{ padding: "6px 10px", background: GREEN, color: "#fff", border: "none", borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✓</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={() => setEntering(true)}
              style={{ padding: "6px 10px", background: "#f0f9ec", color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              Got it
            </button>
            {onRemove && (
              <button onClick={() => onRemove(item)}
                style={{ padding: "6px 8px", background: "#fff", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ×
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ── Add Item Modal (manager) ──
function AddItemModal({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: "", qty: "", category: "Chemicals", urgency: "normal", notes: "", estimatedCost: "" });
  const canSave = form.name.trim().length > 0;
  return (
    <Modal title="Add to Brehob list" onCancel={onCancel}>
      <F label="Item name *">
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus style={inputStyle} />
      </F>
      <F label="Quantity">
        <input value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="e.g. 2 gal, 1 case" style={inputStyle} />
      </F>
      <F label="Category">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </F>
      <F label="Urgency">
        <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))} style={inputStyle}>
          {URGENCIES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </F>
      <F label="Estimated cost">
        <input type="number" step="0.01" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="$" style={inputStyle} />
      </F>
      <F label="Notes">
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="What's it for?" />
      </F>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, background: "#fff", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={() => canSave && onSave(form)} disabled={!canSave}
          style={{ flex: 2, padding: 12, background: canSave ? GREEN : "#c8d8c0", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, cursor: canSave ? "pointer" : "default", fontFamily: "inherit" }}>
          Add to list
        </button>
      </div>
    </Modal>
  );
}

// ── Suggest Modal (worker) ──
function SuggestModal({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: "", qty: "", category: "Chemicals", urgency: "normal", notes: "" });
  const canSave = form.name.trim().length > 0;
  return (
    <Modal title="Suggest Brehob item" onCancel={onCancel}>
      <div style={{ padding: "8px 12px", background: "#f2f5ef", borderRadius: 8, marginBottom: 12, fontSize: 11, color: MUTED }}>
        Manager will review to make sure we don't already have it.
      </div>
      <F label="What do you need? *">
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus style={inputStyle} />
      </F>
      <F label="Quantity">
        <input value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="e.g. 2 gal" style={inputStyle} />
      </F>
      <F label="Category">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </F>
      <F label="Urgency">
        <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))} style={inputStyle}>
          {URGENCIES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </F>
      <F label="Why do you need it?">
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="What's it for?" />
      </F>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, background: "#fff", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={() => canSave && onSave(form)} disabled={!canSave}
          style={{ flex: 2, padding: 12, background: canSave ? GREEN : "#c8d8c0", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, cursor: canSave ? "pointer" : "default", fontFamily: "inherit" }}>
          Submit for review
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onCancel, children }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "20px 20px 28px", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>{title}</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function F({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };
