import { useMemo, useState } from "react";
import { useShippingCustomers } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const BORDER = "#e0ead8";

const CUSTOMER_TYPE_COLORS = {
  "HOUSEPLANT SHOP":     "#7fb069",
  "GARDEN CENTER":       "#4a9d7f",
  "FLOWER SHOP":         "#d9a04a",
  "EXTERIOR LANDSCAPER": "#8a6a4a",
  "FUNDRAISER":          "#a94aa0",
};

function typeColor(t) { return CUSTOMER_TYPE_COLORS[t] || "#7a8c74"; }

export default function ShippingCustomers() {
  const { rows: customers, loading } = useShippingCustomers();
  const [search, setSearch]     = useState("");
  const [cityFilter, setCity]   = useState("");
  const [typeFilter, setType]   = useState("");
  const [termsFilter, setTerms] = useState("");
  const [selected, setSelected] = useState(null);

  // Unique filter options from the loaded data
  const cities = useMemo(() => [...new Set(customers.map(c => c.city).filter(Boolean))].sort(), [customers]);
  const types  = useMemo(() => [...new Set(customers.map(c => c.customerType).filter(Boolean))].sort(), [customers]);
  const terms  = useMemo(() => [...new Set(customers.map(c => c.terms).filter(Boolean))].sort(), [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      if (q && !(
        (c.companyName || "").toLowerCase().includes(q) ||
        (c.careOf || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      )) return false;
      if (cityFilter  && c.city !== cityFilter)        return false;
      if (typeFilter  && c.customerType !== typeFilter) return false;
      if (termsFilter && c.terms !== termsFilter)      return false;
      return true;
    });
  }, [customers, search, cityFilter, typeFilter, termsFilter]);

  const activeFilters = [cityFilter, typeFilter, termsFilter].filter(Boolean).length;

  return (
    <div style={{ ...FONT }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
        <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Customers</div>
        <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
          {loading ? "Loading…" : `${customers.length.toLocaleString()} customers • ${filtered.length.toLocaleString()} shown`}
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 16, marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by company, contact, city, email, phone…"
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit",
            boxSizing: "border-box", outline: "none", marginBottom: 12,
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FilterSelect label="City"  value={cityFilter}  onChange={setCity}  options={cities} />
          <FilterSelect label="Type"  value={typeFilter}  onChange={setType}  options={types} />
          <FilterSelect label="Terms" value={termsFilter} onChange={setTerms} options={terms} />
          {activeFilters > 0 && (
            <button onClick={() => { setCity(""); setType(""); setTerms(""); }}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: "#f2f5ef", color: "#7a8c74", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Clear {activeFilters} filter{activeFilters !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {/* Customer list */}
      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
            {loading ? "Loading customers…" : "No customers match your search."}
          </div>
        ) : (
          <VirtualizedList
            items={filtered}
            onSelect={setSelected}
            selectedId={selected?.id}
          />
        )}
      </div>

      {selected && <CustomerDetailModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${BORDER}`,
        background: value ? "#f0f8eb" : "#fff", color: DARK,
        fontSize: 13, fontWeight: value ? 700 : 500, fontFamily: "inherit",
        cursor: "pointer", outline: "none",
      }}>
      <option value="">{label}: All</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Lightweight virtualization — render only visible rows (windowed)
const ROW_HEIGHT = 78;
const VIEWPORT_HEIGHT = 640;

function VirtualizedList({ items, onSelect, selectedId }) {
  const [scrollTop, setScrollTop] = useState(0);
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 10;
  const endIdx = Math.min(items.length, startIdx + visibleCount);
  const paddingTop = startIdx * ROW_HEIGHT;
  const totalHeight = items.length * ROW_HEIGHT;

  return (
    <div
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      style={{ height: VIEWPORT_HEIGHT, overflowY: "auto", position: "relative" }}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${paddingTop}px)` }}>
          {items.slice(startIdx, endIdx).map(c => (
            <CustomerRow key={c.id} customer={c} onClick={() => onSelect(c)} selected={selectedId === c.id} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomerRow({ customer: c, onClick, selected }) {
  const addrLine = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const isCOD = (c.terms || "").toUpperCase().includes("C.O.D");
  return (
    <div onClick={onClick}
      style={{
        height: ROW_HEIGHT, padding: "12px 18px",
        borderBottom: `1px solid ${BORDER}`,
        background: selected ? "#f0f8eb" : "#fff",
        cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.companyName}
          </div>
          {c.customerType && (
            <span style={{
              fontSize: 9, fontWeight: 800, color: "#fff",
              background: typeColor(c.customerType),
              borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap",
            }}>
              {c.customerType}
            </span>
          )}
          {isCOD && (
            <span style={{
              fontSize: 9, fontWeight: 800, color: "#c03030",
              background: "#fde8e8", border: "1px solid #c03030",
              borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap",
            }}>
              COD
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#7a8c74", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {addrLine || "— no address —"}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#7a8c74", textAlign: "right", flexShrink: 0 }}>
        {c.phone && <div>{c.phone}</div>}
        {c.careOf && <div style={{ fontStyle: "italic" }}>{c.careOf}</div>}
      </div>
    </div>
  );
}

function CustomerDetailModal({ customer: c, onClose }) {
  const addrLine = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const mapsUrl = addrLine ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrLine)}` : null;
  const isCOD = (c.terms || "").toUpperCase().includes("C.O.D");

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ background: DARK, color: CREAM, padding: "18px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>{c.companyName}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {c.customerType && (
                <span style={{ fontSize: 10, fontWeight: 800, background: typeColor(c.customerType), color: "#fff", borderRadius: 999, padding: "3px 10px" }}>
                  {c.customerType}
                </span>
              )}
              {isCOD && (
                <span style={{ fontSize: 10, fontWeight: 800, background: "#c03030", color: "#fff", borderRadius: 999, padding: "3px 10px" }}>
                  COD
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: CREAM, fontSize: 26, cursor: "pointer", padding: 0 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22 }}>
          {c.careOf && <DetailRow label="Contact" value={c.careOf} />}
          {addrLine && (
            <DetailRow
              label="Address"
              value={
                <div>
                  <div>{c.address1}</div>
                  <div>{[c.city, c.state, c.zip].filter(Boolean).join(", ")}</div>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-block", marginTop: 6, color: GREEN, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                      📍 Open in Google Maps
                    </a>
                  )}
                </div>
              }
            />
          )}
          {c.phone && (
            <DetailRow
              label="Phone"
              value={<a href={`tel:${c.phone}`} style={{ color: DARK, textDecoration: "none", fontWeight: 700 }}>{c.phone}</a>}
            />
          )}
          {c.email && (
            <DetailRow
              label="Email"
              value={<a href={`mailto:${c.email}`} style={{ color: GREEN, textDecoration: "none", fontWeight: 700 }}>{c.email}</a>}
            />
          )}
          {c.terms && <DetailRow label="Terms" value={c.terms} />}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: DARK, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
