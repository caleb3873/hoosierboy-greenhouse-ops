// Maintenance facility tree. Buildings are stable, so they live as a constant
// rather than a DB table. Each leaf has a canonical ID stored in
// manager_tasks.facility.
import React, { useState, useMemo } from "react";

export const FACILITIES = [
  {
    property: "BLUFF",
    groups: [
      {
        id: "bluff_quonsets",
        label: "Quonsets",
        // Houses 02–23 + 25 (no 01 — that's Bluff Main — and no 24)
        leaves: (() => {
          const out = [];
          for (let i = 2; i <= 25; i++) {
            if (i === 24) continue;
            const n = String(i).padStart(2, "0");
            out.push({ id: `bluff_house_${n}`, label: `House ${n}`, num: i });
          }
          return out;
        })(),
      },
      {
        id: "bluff_main",
        label: "Bluff Main",
        leaves: [
          { id: "bluff_main",          label: "Bluff Main" },
          { id: "bluff_main_pole_barn", label: "Bluff Main Pole Barn" },
        ],
      },
      {
        id: "bluff_pads",
        label: "Outdoor Pads",
        leaves: [
          { id: "bluff_pad_south", label: "South Pad" },
          { id: "bluff_pad_west",  label: "West Pad" },
          { id: "bluff_pad_north", label: "North Pad" },
          { id: "bluff_pad_east",  label: "East Pad" },
        ],
      },
    ],
  },
  {
    property: "SPRAGUE",
    groups: [
      {
        id: "sprague_quonsets",
        label: "Quonsets",
        leaves: [
          { id: "sprague_quonset_north", label: "Sprague North Quonset" },
          { id: "sprague_quonset_south", label: "Sprague South Quonset" },
        ],
      },
      {
        id: "sprague_main",
        label: "Sprague Main",
        leaves: [
          { id: "sprague_main",        label: "Sprague Main" },
          { id: "sprague_main_garage", label: "Sprague Main Garage" },
        ],
      },
      {
        id: "sprague_west",
        label: "Sprague West",
        leaves: [
          { id: "sprague_west",        label: "Sprague West" },
          { id: "sprague_west_garage", label: "Sprague West Garage" },
        ],
      },
    ],
  },
];

// Quick lookup from facility id → human label
export const FACILITY_LABELS = (() => {
  const m = new Map();
  for (const prop of FACILITIES) {
    for (const grp of prop.groups) {
      for (const leaf of grp.leaves) m.set(leaf.id, leaf.label);
    }
  }
  return m;
})();

export function facilityLabel(id) {
  return FACILITY_LABELS.get(id) || id || "Unassigned";
}

// Tap-to-pick facility tree. Counts open maintenance tasks per leaf.
export function FacilityPicker({ tasks, onSelect }) {
  // Default Quonsets expanded (it's the long one — Tyler scans it fast).
  // Other groups collapsed until tapped.
  const [openGroups, setOpenGroups] = useState(new Set(["bluff_quonsets"]));
  const toggle = (id) => {
    setOpenGroups(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const openByFacility = useMemo(() => {
    const m = new Map();
    for (const t of (tasks || [])) {
      if ((t.category || "production") !== "maintenance") continue;
      if (t.status === "completed" || t.status === "rejected" || t.status === "requested") continue;
      if (!t.facility) continue;
      m.set(t.facility, (m.get(t.facility) || 0) + 1);
    }
    return m;
  }, [tasks]);

  function openCountFor(group) {
    return group.leaves.reduce((sum, l) => sum + (openByFacility.get(l.id) || 0), 0);
  }

  return (
    <div style={{ padding: "12px 14px 80px", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {FACILITIES.map(prop => (
        <div key={prop.property} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 800, letterSpacing: 1.2, marginBottom: 8 }}>
            🏡 {prop.property}
          </div>
          {prop.groups.map(grp => {
            const isOpen = openGroups.has(grp.id);
            const openCount = openCountFor(grp);
            const isQuonsets = grp.id === "bluff_quonsets";
            return (
              <div key={grp.id} style={{ marginBottom: 8 }}>
                <button onClick={() => toggle(grp.id)}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10,
                    background: "#fff", border: "1.5px solid #e0ead8",
                    color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: "pointer",
                    fontFamily: "inherit",
                  }}>
                  <span>{isOpen ? "▼" : "▸"} {grp.label}</span>
                  <span style={{ fontSize: 11, color: openCount > 0 ? "#d94f3d" : "#7a8c74", fontWeight: 800 }}>
                    {openCount > 0 ? `${openCount} open` : "—"}
                  </span>
                </button>

                {isOpen && (
                  isQuonsets ? (
                    /* Quonsets render in two columns: even on left, odd on right */
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                      <div>
                        {grp.leaves.filter(l => l.num % 2 === 0).map(l =>
                          <LeafButton key={l.id} leaf={l} openCount={openByFacility.get(l.id) || 0} onSelect={onSelect} />
                        )}
                      </div>
                      <div>
                        {grp.leaves.filter(l => l.num % 2 === 1).map(l =>
                          <LeafButton key={l.id} leaf={l} openCount={openByFacility.get(l.id) || 0} onSelect={onSelect} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      {grp.leaves.map(l =>
                        <LeafButton key={l.id} leaf={l} openCount={openByFacility.get(l.id) || 0} onSelect={onSelect} />
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LeafButton({ leaf, openCount, onSelect }) {
  return (
    <button onClick={() => onSelect(leaf.id)}
      style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "9px 12px", marginBottom: 4, borderRadius: 8,
        background: "#f8fbf5", border: "1px solid #e0ead8",
        color: "#1e2d1a", fontSize: 13, fontWeight: 700, cursor: "pointer",
        fontFamily: "inherit",
      }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leaf.label}</span>
      {openCount > 0 && (
        <span style={{ background: "#d94f3d", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, padding: "2px 7px", marginLeft: 6 }}>
          {openCount}
        </span>
      )}
    </button>
  );
}

// Done-tasks running list grouped by facility, filterable by year.
export function FacilityHistoryView({ tasks }) {
  const allYears = useMemo(() => {
    const s = new Set();
    for (const t of (tasks || [])) {
      if ((t.category || "production") !== "maintenance") continue;
      if (t.status !== "completed") continue;
      const date = t.completedAt || t.completed_at;
      if (!date) continue;
      s.add(new Date(date).getFullYear());
    }
    s.add(new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [tasks]);

  const [year, setYear] = useState(allYears[0] || new Date().getFullYear());
  const [facilityFilter, setFacilityFilter] = useState("all");

  const done = useMemo(() => {
    return (tasks || [])
      .filter(t => (t.category || "production") === "maintenance" && t.status === "completed")
      .filter(t => {
        const date = t.completedAt || t.completed_at;
        return date && new Date(date).getFullYear() === year;
      })
      .filter(t => facilityFilter === "all" || t.facility === facilityFilter)
      .sort((a, b) => {
        const da = new Date(a.completedAt || a.completed_at).getTime();
        const db = new Date(b.completedAt || b.completed_at).getTime();
        return db - da; // newest first
      });
  }, [tasks, year, facilityFilter]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of done) {
      const key = t.facility || "unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(t);
    }
    return [...m.entries()].sort((a, b) =>
      facilityLabel(a[0]).localeCompare(facilityLabel(b[0]))
    );
  }, [done]);

  function fmt(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div style={{ padding: "12px 14px 80px", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: "#fff", color: "#1e2d1a" }}>
          {allYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: "#fff", color: "#1e2d1a" }}>
          <option value="all">All facilities</option>
          {FACILITIES.flatMap(p => p.groups.flatMap(g => g.leaves.map(l => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))))}
        </select>
      </div>

      <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 10 }}>
        {done.length} repair{done.length !== 1 ? "s" : ""} done in {year}
        {facilityFilter !== "all" && <> at {facilityLabel(facilityFilter)}</>}
      </div>

      {grouped.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: 24, textAlign: "center", color: "#7a8c74" }}>
          No completed maintenance tasks in {year}{facilityFilter !== "all" ? ` at ${facilityLabel(facilityFilter)}` : ""}.
        </div>
      ) : grouped.map(([facId, items]) => (
        <div key={facId} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, paddingLeft: 4 }}>
            {facilityLabel(facId)} · {items.length}
          </div>
          {items.map(t => (
            <div key={t.id} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>
                ✓ {t.title}
              </div>
              <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>📌 Assigned {fmt(t.assignedAt || t.createdAt)}</span>
                <span>✓ Done {fmt(t.completedAt)}</span>
                {t.completedBy && <span>· {t.completedBy}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
