// Chronological audit feed of every change made to inventory:
//   * lot created
//   * count change (before → after, with delta)
//   * per-lot note added
//   * per-house note added
//   * photo added
//
// Sources are all derived from existing inventory_lots + inventory_location_notes
// rows so no extra writes are needed elsewhere. Lives on the PlannerShell
// Operations tab.

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useInventoryLots, useInventoryLocationNotes } from "./supabase";

const FONT = "'DM Sans','Segoe UI',sans-serif";

const KIND_LABELS = {
  created:    { label: "Row added",   bg: "#eef5fb", color: "#1e4a7a" },
  count:      { label: "Count",       bg: "#dff2d2", color: "#2e5e1a" },
  note:       { label: "Row note",    bg: "#fff7d6", color: "#7a5a00" },
  "house-note": { label: "House note", bg: "#fdecea", color: "#7a2418" },
  photo:      { label: "Photo",       bg: "#f0e6fa", color: "#5a2e7a" },
};

export default function InventoryReport() {
  const { rows: lots } = useInventoryLots();
  const { rows: locationNotes } = useInventoryLocationNotes();

  // ── Build the flat event list ─────────────────────────────────────────────
  const events = useMemo(() => {
    const out = [];
    (lots || []).forEach(lot => {
      // Lot creation (uses createdAt as the timestamp)
      if (lot.createdAt) {
        out.push({
          ts: lot.createdAt,
          kind: "created",
          location: lot.location,
          rowId: lot.rowId,
          variety: lot.variety,
          size: lot.potSize,
          plannedQty: lot.plannedQty,
          user: lot.countedBy,
          detail: lot.variety ? `Added "${lot.variety}"` : "Added blank row",
        });
      }
      // Count history — each entry { qty, countedAt, countedBy }. Compare to
      // the previous entry's qty to compute a delta.
      const history = lot.countHistory || [];
      history.forEach((entry, idx) => {
        const prev = idx > 0 ? history[idx - 1].qty : null;
        const delta = prev != null ? (entry.qty - prev) : null;
        out.push({
          ts: entry.countedAt,
          kind: "count",
          location: lot.location,
          rowId: lot.rowId,
          variety: lot.variety,
          size: lot.potSize,
          plannedQty: lot.plannedQty,
          user: entry.countedBy,
          before: prev,
          after: entry.qty,
          delta,
          detail: prev != null ? `${prev} → ${entry.qty}` : `Counted ${entry.qty}`,
        });
      });
      // Per-lot notes
      (lot.noteLog || []).forEach(entry => {
        out.push({
          ts: entry.addedAt,
          kind: "note",
          location: lot.location,
          rowId: lot.rowId,
          variety: lot.variety,
          size: lot.potSize,
          user: entry.addedBy,
          detail: entry.text,
        });
      });
      // Photos
      (lot.photos || []).forEach(entry => {
        out.push({
          ts: entry.takenAt,
          kind: "photo",
          location: lot.location,
          rowId: lot.rowId,
          variety: lot.variety,
          size: lot.potSize,
          user: entry.takenBy,
          detail: "Photo added",
        });
      });
    });
    // Per-house notes (not tied to a specific lot)
    (locationNotes || []).forEach(loc => {
      (loc.noteLog || []).forEach(entry => {
        out.push({
          ts: entry.addedAt,
          kind: "house-note",
          location: loc.location,
          rowId: null,
          variety: null,
          size: null,
          user: entry.addedBy,
          detail: entry.text,
        });
      });
    });
    return out
      .filter(e => e.ts)
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  }, [lots, locationNotes]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [daysFilter, setDaysFilter] = useState(7);
  const [userFilter, setUserFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const distinctUsers = useMemo(() => {
    return [...new Set(events.map(e => e.user).filter(Boolean))].sort();
  }, [events]);
  const distinctLocations = useMemo(() => {
    return [...new Set(events.map(e => e.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [events]);

  const filtered = useMemo(() => {
    const cutoff = daysFilter ? Date.now() - daysFilter * 86400000 : 0;
    const q = search.trim().toLowerCase();
    return events.filter(e => {
      if (cutoff && new Date(e.ts || 0).getTime() < cutoff) return false;
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (userFilter && e.user !== userFilter) return false;
      if (locationFilter && e.location !== locationFilter) return false;
      if (q) {
        const hay = `${e.location || ""} ${e.rowId || ""} ${e.variety || ""} ${e.user || ""} ${e.detail || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, daysFilter, kindFilter, userFilter, locationFilter, search]);

  // ── Aggregates for the top stat cards ─────────────────────────────────────
  const stats = useMemo(() => {
    const counted = filtered.filter(e => e.kind === "count").length;
    const notes = filtered.filter(e => e.kind === "note" || e.kind === "house-note").length;
    const photos = filtered.filter(e => e.kind === "photo").length;
    const added = filtered.filter(e => e.kind === "created").length;
    const users = new Set(filtered.map(e => e.user).filter(Boolean)).size;
    return { counted, notes, photos, added, users };
  }, [filtered]);

  function exportXlsx() {
    const rows = filtered.map(e => ({
      When: e.ts ? new Date(e.ts).toLocaleString() : "",
      Event: KIND_LABELS[e.kind]?.label || e.kind,
      Location: e.location || "",
      Row: e.rowId || "",
      Item: [e.size, e.variety].filter(Boolean).join(" · "),
      Detail: e.detail || "",
      "Before": e.before ?? "",
      "After": e.after ?? "",
      "Δ": e.delta != null ? (e.delta > 0 ? `+${e.delta}` : `${e.delta}`) : "",
      By: e.user || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 28 },
      { wch: 40 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
    XLSX.writeFile(wb, `inventory-report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 30, fontWeight: 700, color: "#1e2d1a", margin: 0 }}>
            📊 Inventory Report
          </h1>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            Audit feed of every count, note, photo, and row added since {daysFilter ? `the last ${daysFilter} day${daysFilter === 1 ? "" : "s"}` : "the beginning of time"}.
          </div>
        </div>
        <button onClick={exportXlsx}
          style={{ background: "#7fb069", color: "#1e2d1a", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇ Export XLSX
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Counts logged" value={stats.counted} />
        <StatCard label="Notes added"   value={stats.notes} />
        <StatCard label="Photos"        value={stats.photos} />
        <StatCard label="Rows added"    value={stats.added} />
        <StatCard label="People"        value={stats.users} />
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, padding: 14, marginBottom: 16, display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", gap: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search location / row / variety / user / detail"
          style={inputStyle} />
        <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} style={inputStyle}>
          <option value="all">All events</option>
          {Object.entries(KIND_LABELS).map(([id, k]) => <option key={id} value={id}>{k.label}</option>)}
        </select>
        <select value={daysFilter} onChange={e => setDaysFilter(parseInt(e.target.value, 10) || 0)} style={inputStyle}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All time</option>
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={inputStyle}>
          <option value="">All locations</option>
          {distinctLocations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={inputStyle}>
          <option value="">All people</option>
          {distinctUsers.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Event table */}
      <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#162212", color: "#c8e6b8" }}>
              <Th style={{ width: 170 }}>When</Th>
              <Th style={{ width: 110 }}>Event</Th>
              <Th style={{ width: 180 }}>Location · Row</Th>
              <Th style={{ width: 220 }}>Item</Th>
              <Th>Detail</Th>
              <Th style={{ width: 90 }}>Δ</Th>
              <Th style={{ width: 110 }}>By</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#7a8c74", fontStyle: "italic" }}>No events match the current filters.</td></tr>
            ) : filtered.map((e, i) => {
              const kindMeta = KIND_LABELS[e.kind] || { label: e.kind, bg: "#e8eee5", color: "#7a8c74" };
              const altBg = i % 2 === 0 ? "#fff" : "#fafbf7";
              return (
                <tr key={i} style={{ background: altBg, borderTop: "1px solid #f0f4ec" }}>
                  <Td>
                    <div style={{ fontWeight: 700 }}>{e.ts ? new Date(e.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                    <div style={{ fontSize: 10, color: "#9aaa90" }}>{e.ts ? new Date(e.ts).toLocaleDateString("en-US", { weekday: "short" }) : ""}</div>
                  </Td>
                  <Td>
                    <span style={{ display: "inline-block", background: kindMeta.bg, color: kindMeta.color, fontWeight: 800, fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>
                      {kindMeta.label}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 700, color: "#1e2d1a" }}>{e.location || "—"}</div>
                    {e.rowId && <div style={{ fontSize: 11, color: "#4a7a35", fontWeight: 700, marginTop: 1 }}>{e.rowId}</div>}
                  </Td>
                  <Td>
                    {e.variety ? (
                      <>
                        {e.size && <span style={{ fontWeight: 800, color: "#4a7a35" }}>{e.size} · </span>}
                        <span>{e.variety}</span>
                      </>
                    ) : <span style={{ color: "#9aaa90" }}>—</span>}
                  </Td>
                  <Td><span style={{ whiteSpace: "pre-wrap" }}>{e.detail || ""}</span></Td>
                  <Td>
                    {e.delta != null && (
                      <span style={{ fontWeight: 900, color: e.delta < 0 ? "#d94f3d" : e.delta > 0 ? "#4a7a35" : "#7a8c74" }}>
                        {e.delta > 0 ? "+" : ""}{e.delta}
                      </span>
                    )}
                  </Td>
                  <Td>{e.user || ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 8 }}>
        Showing {filtered.length.toLocaleString()} of {events.length.toLocaleString()} total events.
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#1e2d1a", fontFamily: "'DM Serif Display',Georgia,serif", marginTop: 2 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0",
  fontSize: 13, fontFamily: FONT, background: "#fff",
};

const Th = ({ children, style }) => (
  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, ...style }}>{children}</th>
);
const Td = ({ children, style }) => (
  <td style={{ padding: "10px 12px", verticalAlign: "top", ...style }}>{children}</td>
);
