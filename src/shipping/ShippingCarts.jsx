import { useMemo, useState } from "react";
import { useShippingCustomers } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const BORDER = "#e0ead8";

export default function ShippingCarts() {
  const { rows: customers, update, loading } = useShippingCustomers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("eligible"); // eligible | all

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      if (filter === "eligible" && !c.allowCarts) return false;
      if (!q) return true;
      return (c.companyName || "").toLowerCase().includes(q) ||
             (c.city || "").toLowerCase().includes(q);
    });
  }, [customers, search, filter]);

  const eligibleCount = customers.filter(c => c.allowCarts).length;

  async function toggleCart(c) {
    await update(c.id, { allowCarts: !c.allowCarts });
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
        <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Carts</div>
        <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
          {loading ? "Loading…" : `${eligibleCount} customer${eligibleCount === 1 ? "" : "s"} allowed to receive carts • ${customers.length} total`}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 14, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customers…"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {[{id:"eligible",label:`Cart-eligible (${eligibleCount})`},{id:"all",label:`All (${customers.length})`}].map(t => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 800,
                background: filter === t.id ? DARK : "#f2f5ef",
                color: filter === t.id ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${filter === t.id ? DARK : BORDER}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
            {filter === "eligible" ? "No cart-eligible customers yet. Switch to All to toggle customers." : "No customers match your search."}
          </div>
        ) : (
          filtered.map(c => (
            <div key={c.id}
              style={{
                padding: "12px 16px", borderBottom: `1px solid ${BORDER}`,
                display: "flex", alignItems: "center", gap: 12,
                background: c.allowCarts ? "#f0f8eb" : "#fff",
              }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>{c.allowCarts ? "🛒" : "○"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.companyName}
                </div>
                <div style={{ fontSize: 11, color: "#7a8c74", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[c.address1, c.city, c.state].filter(Boolean).join(", ")}
                </div>
              </div>
              <button onClick={() => toggleCart(c)}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  background: c.allowCarts ? "#4a7a35" : "#fff",
                  color: c.allowCarts ? "#fff" : DARK,
                  border: `1.5px solid ${c.allowCarts ? "#4a7a35" : BORDER}`,
                  fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}>
                {c.allowCarts ? "✓ Carts OK" : "Allow carts"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
