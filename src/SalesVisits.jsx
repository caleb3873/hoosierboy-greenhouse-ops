// Sales Visits — customer-facing deal pages served from ops.hoosierboy.com.
// A visit page is a self-contained HTML document (offer sheets, pricing one-pagers)
// stored in sales_visits and served at /?sv=<slug> with NO login — the link a
// customer keeps. The mobile module lists them: open, copy link, remove.
// First page: "Sullivan Mum Sales 2026" (the Mum Fest tiered-pricing sheet).
import { useEffect, useState } from "react";
import { getSupabase, useTable } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74",
  border: "#dfe7d8", red: "#d94f3d", text: "#2f3b2a" };
const FONT = "'DM Sans', sans-serif";

// ── public viewer (?sv=<slug>) — no auth, full page ──────────────────────────
export function SalesVisitViewer({ slug }) {
  const [row, setRow] = useState(undefined);   // undefined=loading, null=not found
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from("sales_visits").select("title,html").eq("slug", slug).maybeSingle();
      setRow(data || null);
      if (data?.title) document.title = data.title;
    })();
  }, [slug]);
  if (row === undefined) return <div style={{ fontFamily: FONT, padding: 40, color: "#7a8c74" }}>Loading…</div>;
  if (row === null) return (
    <div style={{ fontFamily: FONT, padding: 40, textAlign: "center", color: "#7a8c74" }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🌼</div>
      This link isn't active. Reach out to Hoosier Boy for a fresh one.
    </div>
  );
  return (
    <iframe title={row.title} srcDoc={row.html}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none", background: "#fff" }} />
  );
}

// ── mobile module: the list ──────────────────────────────────────────────────
export default function SalesVisits() {
  const { rows, loading, remove } = useTable("sales_visits", { orderBy: "created_at", ascending: false });
  const { rows: responses } = useTable("sv_responses", { orderBy: "updated_at", ascending: false });
  const respOf = slug => (responses || []).find(r => r.slug === slug);
  const { displayName } = useAuth();
  const [copied, setCopied] = useState(null);
  const [confirmRm, setConfirmRm] = useState(null);
  // two doors, one page: the CUSTOMER link is clean (no notes tab renders on it);
  // Open adds &prep=1 so YOUR view always shows the private meeting-notes tab
  const custLinkFor = v => `${window.location.origin}/?sv=${v.slug}`;
  const openLinkFor = v => `${window.location.origin}/?sv=${v.slug}&prep=1`;

  const copy = async v => {
    try { await navigator.clipboard.writeText(custLinkFor(v)); setCopied(v.id); setTimeout(() => setCopied(null), 1600); }
    catch { window.prompt("Copy the customer link:", custLinkFor(v)); }
  };

  return (
    <div style={{ fontFamily: FONT, padding: "4px 2px 30px" }}>
      <div style={{ fontSize: 13, color: C.muted, margin: "2px 2px 14px" }}>
        Customer-facing deal pages on <b>ops.hoosierboy.com</b>. <b>Open</b> = your view (private meeting-notes tab included) · <b>Copy customer link</b> = the clean page you send out. Pages stay current when updated.
      </div>
      {loading && <div style={{ color: C.muted, padding: 20 }}>Loading…</div>}
      {!loading && !(rows || []).length && (
        <div style={{ textAlign: "center", color: C.muted, padding: "36px 16px", background: "#fff", borderRadius: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>💼</div>
          No visit pages yet — they're added from the planning side as deals come up.
        </div>
      )}
      {(rows || []).map(v => (
        <div key={v.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: C.dark }}>{v.title}</div>
            {v.customer && <div style={{ fontSize: 12, color: C.muted }}>{v.customer}</div>}
            {respOf(v.slug) && (() => { const r = respOf(v.slug); const n = Object.keys(r.answers || {}).filter(k => k !== "general").length; return (
              <span title="answers saved on the page — Open to read them"
                style={{ fontSize: 10.5, fontWeight: 800, background: "#e8f2e2", color: "#2e7d32", border: "1px solid #bcd9ae", borderRadius: 7, padding: "2px 8px" }}>
                ✅ {n} answered{r.answeredBy ? ` · ${r.answeredBy}` : ""} · {new Date(r.updatedAt).toLocaleDateString()}
              </span>
            ); })()}
            <span style={{ flex: 1 }} />
            <div style={{ fontSize: 11, color: C.muted }}>{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : ""}</div>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, margin: "4px 0 10px", fontFamily: "ui-monospace,Menlo,monospace", wordBreak: "break-all" }}>
            {custLinkFor(v)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={openLinkFor(v)} target="_blank" rel="noreferrer"
              title="opens YOUR view — includes the private meeting-notes tab when the page has one"
              style={{ padding: "8px 16px", borderRadius: 9, background: C.dark, color: C.cream, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
              Open
            </a>
            <button onClick={() => copy(v)}
              title="copies the CLEAN link — no notes tab ever shows on it; this is what you send out"
              style={{ padding: "8px 16px", borderRadius: 9, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
              {copied === v.id ? "✓ Copied" : "🔗 Copy customer link"}
            </button>
            <span style={{ flex: 1 }} />
            {confirmRm === v.id ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>Remove? The link goes dead.</span>
                <button onClick={() => { remove(v.id); setConfirmRm(null); }}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Yes</button>
                <button onClick={() => setConfirmRm(null)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmRm(v.id)} title={`remove (added by ${v.createdBy || "?"})`}
                style={{ padding: "8px 10px", borderRadius: 9, border: "none", background: "none", color: C.muted, fontSize: 13, cursor: "pointer" }}>✕</button>
            )}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 14 }}>
        Signed in as {displayName || "—"} · pages are public to anyone with the link
      </div>
    </div>
  );
}
