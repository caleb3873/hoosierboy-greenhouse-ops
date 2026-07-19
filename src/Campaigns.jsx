import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { compressImage } from "./ManagerTasksView";
import { TEMPLATES, shell, easyBody, fillMerge, mergeFieldsIn, SAMPLE_MERGE, parseMailchimpCsv } from "./emailKit";

// Campaigns — self-hosted email blasts. P2 = composer (this file). The send pipeline (P3)
// wires to the buttons after Caleb reviews this flow. Staff-only (authenticated RLS).
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#e0ead8", red: "#d94f3d", amber: "#e89a3a" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const fmtDT = iso => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const STATUS_CHIP = { draft: ["#eef2fb", "#4a6fb0"], scheduled: ["#fdf3e4", "#b06c14"], sending: ["#fdf3e4", "#b06c14"], sent: ["#e7f6ef", "#1e7a4f"], canceled: ["#f3f3f1", "#8a8a84"] };

export default function Campaigns() {
  const sb = getSupabase();
  const { user, displayName } = useAuth();
  const [tab, setTab] = useState("campaigns"); // campaigns | contacts
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});      // campaign_id -> {sent, opened, clicked, bounced}
  const [view, setView] = useState(null);      // null | 'new' | campaign id
  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("campaigns").select("*").order("created_at", { ascending: false });
    setRows(data || []);
    const { data: ms } = await sb.from("messages").select("campaign_id,status,opened_at,clicked_at").not("campaign_id", "is", null);
    const agg = {};
    (ms || []).forEach(m => {
      const a = (agg[m.campaign_id] = agg[m.campaign_id] || { sent: 0, opened: 0, clicked: 0, bounced: 0 });
      a.sent++; if (m.opened_at) a.opened++; if (m.clicked_at) a.clicked++; if (m.status === "bounced") a.bounced++;
    });
    setStats(agg);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  if (view === "new") return <Composer sb={sb} me={{ email: user?.email, name: displayName }} onBack={() => { setView(null); load(); }} />;
  if (view) { const c = rows.find(r => r.id === view); if (c) return <CampaignDetail sb={sb} campaign={c} stats={stats[c.id]} onBack={() => { setView(null); load(); }} />; }

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>📣 Campaigns</h2>
        {tab === "campaigns" && <button onClick={() => setView("new")} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>＋ New campaign</button>}
        <div style={{ flex: 1 }} />
        {[["campaigns", "Campaigns"], ["contacts", "Contacts"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: tab === id ? C.dark : "#fff", color: tab === id ? C.cream : C.muted, border: `1.5px solid ${tab === id ? C.dark : C.border}`, borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {tab === "contacts" ? <Contacts sb={sb} /> : (<>
        {rows.map(c => {
          const s = stats[c.id]; const chip = STATUS_CHIP[c.status] || STATUS_CHIP.draft;
          return (
            <div key={c.id} onClick={() => setView(c.id)} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "11px 15px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: C.dark, ...wrap }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  {c.recipient_count || 0} recipients
                  {c.status === "sent" && s ? ` · ${Math.round(100 * s.opened / Math.max(s.sent, 1))}% open · ${Math.round(100 * s.clicked / Math.max(s.sent, 1))}% click` : ""}
                  {c.status === "scheduled" ? ` · sends ${fmtDT(c.scheduled_at)}` : c.sent_at ? ` · sent ${fmtDT(c.sent_at)}` : ` · created ${fmtDT(c.created_at)}`}
                </div>
              </div>
              <span style={{ background: chip[0], color: chip[1], fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 11px", textTransform: "capitalize" }}>{c.status}</span>
            </div>
          );
        })}
        {!rows.length && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>No campaigns yet — hit ＋ New campaign.</div>}
      </>)}
    </div>
  );
}

// ── The 3-step composer ─────────────────────────────────────────────────────────
function Composer({ sb, me, onBack }) {
  // step 1 — the email
  const [mode, setMode] = useState("");         // template id | 'easy' | 'custom'
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [headline, setHeadline] = useState("");
  const [message, setMessage] = useState("");
  const [imgUrl, setImgUrl] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  // step 2 — the audience
  const [audTab, setAudTab] = useState("customers");
  const [customers, setCustomers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [suppressed, setSuppressed] = useState(new Set());
  const [q, setQ] = useState("");
  const [sel, setSel] = useState({});           // lowercased email -> {email,name,organization}
  // step 3
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: mc }, { data: un }] = await Promise.all([
        sb.from("shipping_customers").select("id,company_name,email,customer_type,city").not("email", "is", null).order("company_name"),
        sb.from("marketing_contacts").select("email,name,unsubscribed").order("email"),
        sb.from("unsubscribes").select("email"),
      ]);
      setCustomers((cs || []).filter(c => c.email));
      setContacts(mc || []);
      setSuppressed(new Set([...(un || []).map(u => u.email.toLowerCase()), ...(mc || []).filter(m => m.unsubscribed).map(m => m.email.toLowerCase())]));
    })();
  }, [sb]);

  // effective html for preview + save
  const effHtml = mode === "easy" ? easyBody({ headline, message, imageUrl: imgUrl }) : html;
  const previewHtml = (fillMerge(effHtml || shell("<p style='font-family:Arial;font-size:15px;color:#8a8a84;'>Your email will appear here as you build it…</p>"), SAMPLE_MERGE)).replace("{UNSUB}", "<span style='text-decoration:underline;'>Unsubscribe</span>");
  const fieldsUsed = mergeFieldsIn(subject + " " + (effHtml || ""));

  function pickTemplate(v) {
    setMode(v);
    const t = TEMPLATES.find(t2 => t2.id === v);
    if (t) { setSubject(t.subject); setHtml(t.body); }
    else if (v === "easy") { setHtml(""); }
    else if (v === "custom") { if (!html) setHtml(shell("<p style=\"font-family:Arial;font-size:15px;\">Hi {first_name},</p>")); }
  }
  async function insertPicture(f) {
    if (!f) return; setImgBusy(true);
    try {
      const blob = await compressImage(f, 1400, 0.8);
      const path = `email-assets/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("tradeshow-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setImgUrl(sb.storage.from("tradeshow-photos").getPublicUrl(path).data.publicUrl);
    } catch (e) { window.alert("Upload failed: " + (e.message || e)); }
    setImgBusy(false);
  }

  const custList = useMemo(() => customers.filter(c => !q || (c.company_name || "").toLowerCase().includes(q.toLowerCase()) || (c.email || "").toLowerCase().includes(q.toLowerCase())), [customers, q]);
  const contList = useMemo(() => contacts.filter(c => !c.unsubscribed && (!q || (c.email + " " + (c.name || "")).toLowerCase().includes(q.toLowerCase()))), [contacts, q]);
  const activeList = audTab === "customers"
    ? custList.map(c => ({ email: c.email.toLowerCase(), name: c.company_name, organization: c.company_name, sub: [c.customer_type, c.city].filter(Boolean).join(" · ") }))
    : contList.map(c => ({ email: c.email.toLowerCase(), name: c.name || "", organization: "", sub: c.name || "" }));
  const visible = activeList.filter(r => !suppressed.has(r.email)).slice(0, 500);
  const toggle = r => setSel(s => { const n = { ...s }; if (n[r.email]) delete n[r.email]; else n[r.email] = r; return n; });
  const selectAllMatching = () => setSel(s => { const n = { ...s }; activeList.forEach(r => { if (!suppressed.has(r.email)) n[r.email] = r; }); return n; });
  const selCount = Object.keys(sel).length;

  async function saveCampaign(status, scheduledAt) {
    if (!subject.trim() || !effHtml) { window.alert("Step 1 first — pick or write the email."); return null; }
    if (!selCount) { window.alert("Step 2 — choose at least one recipient."); return null; }
    const cname = name.trim() || subject.trim();
    const { data: c, error } = await sb.from("campaigns").insert({
      name: cname, subject: subject.trim(), body: effHtml, template_id: TEMPLATES.some(t => t.id === mode) ? mode : mode || null,
      status, scheduled_at: scheduledAt || null, recipient_count: selCount, created_by: me.name || me.email,
    }).select("*").single();
    if (error) { window.alert(error.message); return null; }
    const recips = Object.values(sel).map(r => ({ campaign_id: c.id, email: r.email, contact_name: r.name || null, organization: r.organization || null }));
    for (let i = 0; i < recips.length; i += 500) await sb.from("campaign_recipients").insert(recips.slice(i, i + 500));
    return c;
  }
  async function sendTest() {
    if (!me.email) { window.alert("No staff email on your login."); return; }
    setBusy("test");
    try {
      const r = await fetch("/api/campaign-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: me.email, subject, html: effHtml }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || "Send failed");
      window.alert(`Test sent to ${me.email}${out.note ? "\n\n" + out.note : ""}`);
    } catch (e) { window.alert(e.message || "Test send isn't wired yet — the pipeline lands after you review this flow."); }
    setBusy("");
  }
  async function sendNow() {
    if (!window.confirm(`Send now to ${selCount} recipient${selCount !== 1 ? "s" : ""}?`)) return;
    setBusy("send");
    const c = await saveCampaign("draft");
    if (c) {
      const r = await fetch("/api/campaign-dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: c.id }) }).catch(() => null);
      if (r && r.ok) { window.alert("Sending!"); onBack(); }
      else { window.alert("Draft saved. The send pipeline is the next build step — this draft will be sendable from its detail page once it lands."); onBack(); }
    }
    setBusy("");
  }
  async function scheduleIt() {
    if (!when) { window.alert("Pick a date & time."); return; }
    if (new Date(when) <= new Date()) { window.alert("Schedule must be in the future."); return; }
    setBusy("sched");
    const c = await saveCampaign("scheduled", new Date(when).toISOString());
    if (c) { window.alert(`Scheduled for ${fmtDT(c.scheduled_at)} — goes out within ~15 min of that time.`); onBack(); }
    setBusy("");
  }

  const stepHead = (n, t) => <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, margin: "18px 0 8px" }}><span style={{ background: C.dark, color: C.cream, borderRadius: "50%", display: "inline-flex", width: 22, height: 22, alignItems: "center", justifyContent: "center", marginRight: 8, fontSize: 12 }}>{n}</span>{t}</div>;
  const inp = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13.5, fontFamily: "inherit" };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 1100 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← Campaigns</button>
      <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: "6px 0 0" }}>New campaign</h2>

      {stepHead(1, "CHOOSE YOUR EMAIL")}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(320px, 1fr)", gap: 16, alignItems: "start" }}>
        <div>
          <select value={mode} onChange={e => pickTemplate(e.target.value)} style={{ ...inp, fontWeight: 700, marginBottom: 10 }}>
            <option value="">Pick a starting point…</option>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="easy">Write my own — text &amp; picture (easy)</option>
            <option value="custom">Advanced: paste/edit HTML</option>
          </select>
          {mode && <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" style={{ ...inp, marginBottom: 10, fontWeight: 700 }} />}
          {mode === "easy" && (<>
            <input value={headline} onChange={e => { setHeadline(e.target.value); if (!subject) setSubject(e.target.value); }} placeholder="Headline (auto-fills the subject)" style={{ ...inp, marginBottom: 10 }} />
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={9} placeholder={"Your message…\n\nBlank line = new paragraph. You can use {first_name}, {organization}."} style={{ ...inp, resize: "vertical", marginBottom: 8 }} />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => insertPicture(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={imgBusy} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{imgBusy ? "Uploading…" : imgUrl ? "🖼 Replace picture" : "🖼 Insert a picture"}</button>
            {imgUrl && <button onClick={() => setImgUrl(null)} style={{ background: "none", border: "none", color: C.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginLeft: 8 }}>remove</button>}
          </>)}
          {(mode === "custom" || TEMPLATES.some(t => t.id === mode)) && mode && (
            <textarea value={html} onChange={e => setHtml(e.target.value)} rows={mode === "custom" ? 14 : 8}
              placeholder="Email HTML (inline styles, tables — see the preview live)…"
              style={{ ...inp, resize: "vertical", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5 }} />
          )}
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .5, marginBottom: 5 }}>Live preview</div>
          <iframe title="preview" srcDoc={previewHtml} style={{ width: "100%", height: 430, border: `1px solid ${C.border}`, borderRadius: 10, background: "#faf8f5" }} />
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            {fieldsUsed.length
              ? <>✨ Personalized: {fieldsUsed.map(f => `{${f}}`).join(", ")} — each recipient sees their own name/organization; this preview shows samples.</>
              : "Tip: use {first_name} or {organization} anywhere to personalize per recipient."}
          </div>
        </div>
      </div>

      {stepHead(2, "CHOOSE WHO GETS IT")}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        {[["customers", `Customers (${customers.length})`], ["imported", `Imported contacts (${contacts.filter(c => !c.unsubscribed).length})`]].map(([id, l]) => (
          <button key={id} onClick={() => setAudTab(id)} style={{ background: audTab === id ? C.light : "#fff", color: audTab === id ? "#fff" : C.muted, border: `1.5px solid ${audTab === id ? C.light : C.border}`, borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ...inp, width: 220, padding: "7px 11px" }} />
        <button onClick={selectAllMatching} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Select all matching ({activeList.filter(r => !suppressed.has(r.email)).length})</button>
        {selCount > 0 && <button onClick={() => setSel({})} style={{ background: "none", border: "none", color: C.red, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>clear</button>}
        <span style={{ fontSize: 13, fontWeight: 800, color: "#2e5c1e", marginLeft: "auto" }}>{selCount} selected</span>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 300, overflow: "auto" }}>
        {visible.map(r => (
          <label key={r.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={!!sel[r.email]} onChange={() => toggle(r)} />
            <span style={{ fontWeight: 700, color: C.dark }}>{r.name || r.email}</span>
            <span style={{ color: C.muted, fontSize: 12 }}>{r.email}{r.sub ? ` · ${r.sub}` : ""}</span>
          </label>
        ))}
        {activeList.length > 500 && <div style={{ padding: "8px 12px", fontSize: 11.5, color: C.muted }}>Showing first 500 — "Select all matching" still covers everything.</div>}
        {!visible.length && <div style={{ padding: "16px 12px", fontSize: 12.5, color: C.muted }}>No matches{audTab === "imported" ? " — import contacts on the Contacts tab first" : ""}.</div>}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Unsubscribed addresses are hidden here and suppressed again at send time. Selection is by email, so nobody gets doubled across sources.</div>

      {stepHead(3, "SEND")}
      <input value={name} onChange={e => setName(e.target.value)} placeholder={`Campaign name (defaults to the subject)`} style={{ ...inp, maxWidth: 420, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={sendTest} disabled={busy === "test"} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.dark}`, borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy === "test" ? "Sending…" : `📨 Send a test to myself`}</button>
        <button onClick={sendNow} disabled={!!busy} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy === "send" ? "…" : `Send now to ${selCount}`}</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.dark }}>
          <input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} /> Schedule for later
        </label>
        {schedule && (<>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={{ ...inp, width: 220 }} />
          <button onClick={scheduleIt} disabled={!!busy} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Schedule</button>
          <span style={{ fontSize: 11.5, color: C.muted }}>goes out within ~15 min of the chosen time</span>
        </>)}
      </div>
    </div>
  );
}

// ── Campaign detail: stat tiles + per-recipient table ──────────────────────────
function CampaignDetail({ sb, campaign: c, stats, onBack }) {
  const [recips, setRecips] = useState([]);
  const [msgs, setMsgs] = useState({});
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const { data } = await sb.from("campaign_recipients").select("*").eq("campaign_id", c.id).order("email");
    setRecips(data || []);
    const { data: ms } = await sb.from("messages").select("id,to_email,status,opened_at,clicked_at").eq("campaign_id", c.id);
    setMsgs(Object.fromEntries((ms || []).map(m => [m.to_email, m])));
  }, [sb, c.id]);
  useEffect(() => { load(); }, [load]);
  const s = stats || { sent: 0, opened: 0, clicked: 0, bounced: 0 };
  const pct = n => s.sent ? Math.round(100 * n / s.sent) + "%" : "—";
  const tile = (label, val) => (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "12px 16px", minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.dark }}>{val}</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
    </div>
  );
  async function act(kind) {
    setBusy(kind);
    if (kind === "cancel") { await sb.from("campaigns").update({ status: "canceled" }).eq("id", c.id).in("status", ["draft", "scheduled"]); onBack(); }
    if (kind === "send") {
      const r = await fetch("/api/campaign-dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: c.id }) }).catch(() => null);
      if (r && r.ok) { window.alert("Sending!"); onBack(); }
      else window.alert("The send pipeline is the next build step — this campaign stays ready to go.");
    }
    setBusy("");
  }
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 960 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← Campaigns</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 4px" }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0, ...wrap }}>{c.name}</h2>
        {["draft", "scheduled"].includes(c.status) && (<>
          <button onClick={() => act("send")} disabled={!!busy} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Send now</button>
          <button onClick={() => act("cancel")} disabled={!!busy} style={{ background: "#fff", color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 9, padding: "8px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </>)}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>“{c.subject}” · {c.status}{c.scheduled_at ? ` · scheduled ${fmtDT(c.scheduled_at)}` : ""}{c.sent_at ? ` · sent ${fmtDT(c.sent_at)}` : ""}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        {tile("Recipients", c.recipient_count || recips.length)}{tile("Sent", s.sent)}{tile("Opened", `${s.opened} · ${pct(s.opened)}`)}{tile("Clicked", `${s.clicked} · ${pct(s.clicked)}`)}{tile("Bounced", s.bounced)}
      </div>
      <div style={{ fontSize: 11.5, color: C.amber, fontWeight: 700, marginBottom: 12 }}>⚠️ Open/click tracking requires the toggles on the Resend domain — until they're on, these will read 0.</div>
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 380, overflow: "auto" }}>
        {recips.map(r => {
          const m = msgs[r.email];
          return (
            <div key={r.id} style={{ display: "flex", gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12.5, alignItems: "center" }}>
              <span style={{ flex: 1, color: C.dark, ...wrap }}>{r.email}{r.contact_name ? ` · ${r.contact_name}` : ""}</span>
              <span style={{ textTransform: "capitalize", fontWeight: 800, color: r.status === "failed" ? C.red : r.status === "skipped" ? C.muted : "#2e5c1e" }}>{m ? m.status : r.status}</span>
              {m && m.opened_at && <span title="opened">👁</span>}
              {m && m.clicked_at && <span title="clicked">🔗</span>}
              {r.error && <span style={{ color: C.red, fontSize: 11 }}>{r.error}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Contacts: Mailchimp import + list ──────────────────────────────────────────
function Contacts({ sb }) {
  const [contacts, setContacts] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);
  const load = useCallback(async () => {
    const { data } = await sb.from("marketing_contacts").select("*").order("created_at", { ascending: false }).limit(2000);
    setContacts(data || []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  async function importText(text) {
    setBusy(true); setReport(null);
    try {
      const { contacts: parsed, skippedInvalid, emailCol } = parseMailchimpCsv(text);
      if (!parsed.length) { window.alert("No valid emails found. Export the audience from Mailchimp as CSV and try again."); setBusy(false); return; }
      // dedupe against existing, chunked
      const existing = new Set();
      for (let i = 0; i < parsed.length; i += 500) {
        const chunk = parsed.slice(i, i + 500).map(p2 => p2.email);
        const { data } = await sb.from("marketing_contacts").select("email").in("email", chunk);
        (data || []).forEach(r => existing.add(r.email));
      }
      const fresh = parsed.filter(p2 => !existing.has(p2.email));
      for (let i = 0; i < fresh.length; i += 500) {
        await sb.from("marketing_contacts").insert(fresh.slice(i, i + 500).map(p2 => ({ email: p2.email, name: p2.name, source: "mailchimp_import" })));
      }
      setReport({ imported: fresh.length, already: existing.size, invalid: skippedInvalid, emailCol });
      load();
    } catch (e) { window.alert(e.message || e); }
    setBusy(false);
  }
  const list = contacts.filter(c => !q || (c.email + " " + (c.name || "")).toLowerCase().includes(q.toLowerCase())).slice(0, 300);

  return (
    <div>
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Import from Mailchimp</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Mailchimp → Audience → Export audience → upload the CSV here (or paste it). Only opted-in lists — this is a consent-based tool.</div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) f.text().then(importText); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "Importing…" : "⬆ Upload CSV"}</button>
          <button onClick={() => { const t = window.prompt("Paste the CSV text:"); if (t) importText(t); }} disabled={busy} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Paste CSV</button>
        </div>
        {report && <div style={{ fontSize: 12.5, color: "#2e5c1e", fontWeight: 700, marginTop: 8 }}>Imported {report.imported} · {report.already} already on file · {report.invalid} invalid skipped (email column: {report.emailCol})</div>}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${contacts.length} contacts…`} style={{ width: 300, boxSizing: "border-box", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: "inherit", marginBottom: 8 }} />
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 420, overflow: "auto" }}>
        {list.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12.5, alignItems: "center" }}>
            <span style={{ flex: 1, color: C.dark }}>{c.email}{c.name ? ` · ${c.name}` : ""}</span>
            {c.bounced && <span style={{ color: C.red, fontWeight: 800, fontSize: 11 }}>BOUNCED</span>}
            {c.unsubscribed && <span style={{ color: C.muted, fontWeight: 800, fontSize: 11 }}>UNSUBSCRIBED</span>}
          </div>
        ))}
        {!list.length && <div style={{ padding: "16px 12px", fontSize: 12.5, color: C.muted }}>No contacts yet — import your Mailchimp audience above.</div>}
      </div>
    </div>
  );
}
