// ⚡ WAR ROOM — ESPN-style companion draft view (Caleb 8/30). Original design,
// familiar conventions: dense available-player table (center), roster/queue/
// recommendations rail (right), status strip (top), pick feed (bottom).
// Pure UI layer: all state arrives via props from DraftBoard (data), rankings
// come pre-ordered by the strategy engine, and picking routes back through the
// parent's confirm flow. Commish links only (strategy intel lives here).
import { useEffect, useMemo, useRef, useState } from "react";

const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const POS_COLOR = { WR: "#2d7dd2", RB: "#2e9e4f", QB: "#d94f3d", TE: "#e89a3a", K: "#8e5cd9", "D/ST": "#6b7280" };
const LABEL_COLOR = { CORE: "#2e9e4f", VALUE: "#1fa8a0", FLIP: "#e89a3a", LOTTERY: "#8e5cd9", FADE: "#d94f3d" };
const SLOT_ORDER = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "D/ST"];
const btn = (bg, color = "#e8eee4") => ({ background: bg, color, border: "none", borderRadius: 7, padding: "5px 10px", fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT });

export default function DraftWarRoom({ players, metrics, picks, slots, mySlot, next, pickNo, onClock, myPicks, pickedNames, onSelect, roundsTotal, onClose }) {
  const [q, setQ] = useState("");
  const [posF, setPosF] = useState("ALL");
  const [labelF, setLabelF] = useState("ALL");
  const [sortCol, setSortCol] = useState("rk");
  const [sortDir, setSortDir] = useState(1);
  const [drawer, setDrawer] = useState(null);
  const [queue, setQueue] = useState(() => { try { return JSON.parse(localStorage.getItem("draft-queue") || "[]"); } catch { return []; } });
  const searchRef = useRef(null);
  const saveQueue = qn => { setQueue(qn); localStorage.setItem("draft-queue", JSON.stringify(qn)); };

  // hotkeys: "/" search · Esc close · discoverable via the ⌨ hint
  useEffect(() => {
    const h = e => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setDrawer(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const nTeams = slots.length || 10;
  const myNextNo = myPicks[0]?.no ?? null;
  const picksUntil = myNextNo && pickNo ? myNextNo - pickNo : null;
  const totalPicks = nTeams * roundsTotal;

  // availability vs MY NEXT pick — mock/ADP-based ESTIMATE, Colts reach priced in
  const availability = p => {
    if (!myNextNo || pickedNames.has(p.player)) return null;
    const m = metrics[p.player] || {};
    let adp = +(m.adp ?? p.rk);
    if (m.colts) adp -= 8;                       // local-reach: availability only, never the rating
    const cushion = adp - myNextNo;
    if (cushion >= 10) return ["very likely", "#2e9e4f"];
    if (cushion >= 4) return ["likely", "#7fb069"];
    if (cushion >= -2) return ["50/50", "#e89a3a"];
    if (cushion >= -8) return ["unlikely", "#d97a3d"];
    return ["take now", "#d94f3d"];
  };

  const avail = useMemo(() => players.filter(p => !pickedNames.has(p.player)), [players, pickedNames]);

  // dynamic positional tiers off the strategy list's tier field
  const tierAlerts = useMemo(() => {
    const out = [];
    ["RB", "WR", "TE", "QB"].forEach(pos => {
      const pool = avail.filter(p => p.pos === pos);
      if (!pool.length) return;
      const top = Math.min(...pool.map(p => p.tier || 99));
      const left = pool.filter(p => (p.tier || 99) === top);
      if (left.length <= 2) out.push({ pos, tier: top, left: left.map(p => p.player) });
    });
    return out;
  }, [avail]);

  // positional run detection over the last 6 picks
  const run = useMemo(() => {
    const last6 = [...picks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
    const counts = {};
    last6.forEach(p => { counts[p.pos] = (counts[p.pos] || 0) + 1; });
    const [pos, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    if (n >= 4) {
      const sameTier = tierAlerts.find(t => t.pos === pos);
      return { pos, n, drying: !!sameTier };
    }
    return null;
  }, [picks, tierAlerts]);

  // roster slotting: starters → FLEX → bench
  const roster = useMemo(() => {
    const mine = picks.filter(p => p.slot === mySlot).sort((a, b) => a.round - b.round);
    const slotsOut = SLOT_ORDER.map(s => ({ want: s, player: null }));
    const bench = [];
    mine.forEach(p => {
      let spot = slotsOut.find(s => !s.player && s.want === p.pos);
      if (!spot && ["RB", "WR", "TE"].includes(p.pos)) spot = slotsOut.find(s => !s.player && s.want === "FLEX");
      if (spot) spot.player = p; else bench.push(p);
    });
    return { slotsOut, bench };
  }, [picks, mySlot]);

  const visible = useMemo(() => {
    let v = avail.filter(p =>
      (posF === "ALL" || p.pos === posF) &&
      (labelF === "ALL" || metrics[p.player]?.label === labelF) &&
      (!q || `${p.player} ${p.team} ${p.pos}`.toLowerCase().includes(q.toLowerCase())));
    const val = p => {
      const m = metrics[p.player] || {};
      switch (sortCol) {
        case "adp": return +(m.adp ?? 999);
        case "value": return -((+(m.adp ?? p.rk)) - p.rk);
        case "usage": return -(m.usage_score ?? 0);
        case "env": return -(m.env_score ?? 0);
        case "hvt": return -(m.hvt_score ?? 0);
        case "bye": return +(p.bye ?? 99);
        default: return p.rk;
      }
    };
    return [...v].sort((a, b) => (val(a) - val(b)) * sortDir);
  }, [avail, posF, labelF, q, sortCol, sortDir, metrics]);

  const recs = useMemo(() => avail.slice(0, 5).map(p => {
    const m = metrics[p.player] || {};
    return { p, m, av: availability(p) };
  }), [avail, metrics, myNextNo]);

  const queuedAvail = queue.filter(name => !pickedNames.has(name));
  const feed = [...picks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  const myTurn = next && next.slot === mySlot;

  const th = (label, col) => (
    <th onClick={() => { if (col) { setSortCol(col); setSortDir(d => (sortCol === col ? -d : 1)); } }}
      style={{ padding: "5px 6px", fontSize: 9.5, fontWeight: 800, letterSpacing: .5, color: sortCol === col ? "#c8e6b8" : "#7a8c74", cursor: col ? "pointer" : "default", whiteSpace: "nowrap", textAlign: "left", position: "sticky", top: 0, background: "#181f16", zIndex: 3 }}>
      {label}{sortCol === col ? (sortDir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  const drawerM = drawer ? (metrics[drawer.player] || {}) : null;
  return (
    <div style={{ fontFamily: FONT, background: "#141a12", color: "#e8eee4", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── top status strip ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 14px", borderBottom: "1px solid #2c3828", position: "sticky", top: 0, background: "#141a12", zIndex: 20, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SERIF, fontSize: 17 }}>⚡ War Room</span>
        {next ? <>
          <Stat label="CURRENT PICK" value={`${pickNo} · Rd ${next.round}`} />
          <Stat label="ON THE CLOCK" value={onClock} hot={myTurn} />
          <Stat label="MY NEXT PICK" value={myNextNo ?? "—"} />
          <Stat label="UNTIL MY TURN" value={picksUntil === 0 ? "NOW" : picksUntil ?? "—"} hot={picksUntil != null && picksUntil <= 2} />
        </> : <Stat label="DRAFT" value="COMPLETE" />}
        <div style={{ flex: 1, minWidth: 80, height: 6, background: "#1c241a", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, (picks.length / totalPicks) * 100)}%`, height: "100%", background: "#7fb069" }} />
        </div>
        <span style={{ fontSize: 10, color: "#7a8c74" }}>{picks.length}/{totalPicks}</span>
        <span title={'Hotkeys: "/" search · Esc close drawer'} style={{ fontSize: 11, color: "#5a6a54", cursor: "help" }}>⌨</span>
        <button onClick={onClose} style={btn("#3a4a34")}>← Board</button>
      </div>
      {/* run + tier alerts */}
      {(run || tierAlerts.length > 0) && (
        <div style={{ display: "flex", gap: 8, padding: "6px 14px", flexWrap: "wrap", borderBottom: "1px solid #2c3828" }}>
          {run && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 7, background: run.drying ? "#d94f3d22" : "#1c241a", border: `1px solid ${run.drying ? "#d94f3d" : "#3a4a34"}`, color: run.drying ? "#d94f3d" : "#a9bda0" }}>
              🏃 {run.n} {run.pos}s in the last 6 picks — {run.drying ? "tier IS drying up" : "tier still deep, stay disciplined"}
            </span>
          )}
          {tierAlerts.map(t => (
            <span key={t.pos} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 7, background: "#e89a3a22", border: "1px solid #e89a3a", color: "#e89a3a" }}>
              ⚠ {t.pos} Tier {t.tier}: only {t.left.length} left ({t.left.join(", ")})
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flex: 1, minHeight: 0, alignItems: "stretch" }}>
        {/* ── center: available player table ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder='search player / team / pos  ("/" to focus)'
              style={{ flex: 1, minWidth: 200, padding: "8px 10px", borderRadius: 8, border: "1px solid #3a4a34", background: "#1c241a", color: "#e8eee4", fontFamily: FONT, fontSize: 14 }} />
            {["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"].map(p => (
              <button key={p} onClick={() => setPosF(p)} style={{ ...btn(posF === p ? (POS_COLOR[p] || "#7fb069") : "#3a4a34", posF === p ? "#fff" : "#a9bda0") }}>{p}</button>
            ))}
            {["ALL", "CORE", "VALUE", "FLIP", "LOTTERY", "FADE"].map(l => (
              <button key={l} onClick={() => setLabelF(l)} style={{ ...btn(labelF === l ? (LABEL_COLOR[l] || "#7fb069") : "#1c241a", labelF === l ? "#141a12" : LABEL_COLOR[l] || "#a9bda0"), border: "1px solid #2c3828", fontSize: 10 }}>{l}</button>
            ))}
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                {th("RK", "rk")}{th("ADP", "adp")}{th("Δ VAL", "value")}{th("PLAYER")}{th("POS")}{th("TEAM")}{th("BYE", "bye")}
                {th("SCORE")}{th("USE", "usage")}{th("ENV", "env")}{th("HVT", "hvt")}{th("LABEL")}{th("AT MY PICK*")}{th("")}
              </tr></thead>
              <tbody>
                {visible.slice(0, 200).map(p => {
                  const m = metrics[p.player] || {};
                  const dv = m.adp != null ? Math.round(+m.adp - p.rk) : null;
                  const av = availability(p);
                  const queued = queue.includes(p.player);
                  return (
                    <tr key={p.id} onClick={() => setDrawer(p)}
                      style={{ borderBottom: "1px solid #1f2a1a", cursor: "pointer", background: myTurn && p.rk === avail[0]?.rk ? "#7fb06915" : "transparent" }}>
                      <td style={tdS(true)}>{p.rk}</td>
                      <td style={tdS(true)}>{m.adp != null ? Math.round(+m.adp) : "—"}</td>
                      <td style={{ ...tdS(true), color: dv >= 8 ? "#1fa8a0" : dv <= -8 ? "#d94f3d" : "#7a8c74", fontWeight: 800 }}>{dv != null ? (dv > 0 ? `+${dv}` : dv) : "—"}</td>
                      <td style={{ ...tdS(), fontWeight: 700 }}>{p.player}{m.colts ? " 🏠" : ""}{m.injury_risk === "risk" ? " 🩹" : ""}{m.age >= 30 && ["RB", "WR", "TE"].includes(p.pos) ? " 👴" : ""}</td>
                      <td style={{ ...tdS(), color: POS_COLOR[p.pos] || "#fff", fontWeight: 800 }}>{p.pos_rank}</td>
                      <td style={tdS()}>{p.team}</td>
                      <td style={tdS(true)}>{p.bye}</td>
                      <td style={{ ...tdS(true), fontWeight: 800 }}>{scoreOf(m)}</td>
                      <td style={tdS(true)}>{m.usage_score ?? "—"}</td>
                      <td style={tdS(true)}>{m.env_score ?? "—"}</td>
                      <td style={tdS(true)}>{m.hvt_score ?? "—"}</td>
                      <td style={tdS()}>{m.label && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: (LABEL_COLOR[m.label] || "#3a4a34") + "33", color: LABEL_COLOR[m.label] }}>{m.label}</span>}</td>
                      <td style={tdS()}>{av && <span style={{ fontSize: 9.5, fontWeight: 800, color: av[1] }}>{av[0]}</span>}</td>
                      <td style={tdS()} onClick={e => e.stopPropagation()}>
                        <button onClick={() => saveQueue(queued ? queue.filter(n => n !== p.player) : [...queue, p.player])}
                          style={{ ...btn(queued ? "#7fb069" : "#1c241a", queued ? "#141a12" : "#a9bda0"), padding: "3px 8px", fontSize: 10, border: "1px solid #2c3828" }}>{queued ? "✓Q" : "+Q"}</button>
                        <button onClick={() => onSelect(p)} style={{ ...btn("#2e9e4f", "#fff"), padding: "3px 8px", fontSize: 10, marginLeft: 4 }}>DRAFT</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: 8, fontSize: 10, color: "#5a6a54" }}>*availability = estimate vs your next pick from ADP (+ Indy-reach adjustment on 🏠 players) — not a real probability.</div>
          </div>
        </div>
        {/* ── right rail ── */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: "1px solid #2c3828", overflowY: "auto", padding: 10 }}>
          <Rail title={myTurn ? "🟢 YOU'RE ON THE CLOCK — RECOMMENDED" : "RECOMMENDED PICKS"}>
            {recs.map(({ p, m, av }, i) => (
              <div key={p.id} onClick={() => setDrawer(p)} style={{ padding: "6px 8px", borderRadius: 8, background: i === 0 ? "#7fb06918" : "#1c241a", border: `1px solid ${i === 0 ? "#7fb069" : "#2c3828"}`, marginBottom: 5, cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <b style={{ fontSize: 12.5, flex: 1 }}>{i + 1}. {p.player}{m.colts ? " 🏠" : ""}</b>
                  <span style={{ color: POS_COLOR[p.pos], fontWeight: 800, fontSize: 10.5 }}>{p.pos_rank}</span>
                </div>
                <div style={{ fontSize: 9.5, color: "#a9bda0" }}>rk {p.rk} · adp {m.adp != null ? Math.round(+m.adp) : "—"}
                  {m.label && <span style={{ color: LABEL_COLOR[m.label], fontWeight: 800 }}> · {m.label}</span>}
                  {av && <span style={{ color: av[1], fontWeight: 800 }}> · {av[0]}</span>}
                </div>
                {m.note && <div style={{ fontSize: 9.5, color: "#8ba183", lineHeight: 1.3, marginTop: 2 }}>{String(m.note).split(". ")[0]}.</div>}
                <button onClick={e => { e.stopPropagation(); onSelect(p); }} style={{ ...btn("#2e9e4f", "#fff"), marginTop: 4, padding: "4px 10px", fontSize: 10 }}>DRAFT</button>
              </div>
            ))}
          </Rail>
          <Rail title={`QUEUE (${queuedAvail.length})`}>
            {queue.length === 0 && <div style={{ fontSize: 10.5, color: "#5a6a54" }}>+Q on any row to build your queue.</div>}
            {queue.map((name, i) => {
              const gone = pickedNames.has(name);
              const p = players.find(x => x.player === name);
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", borderRadius: 7, background: "#1c241a", marginBottom: 3, opacity: gone ? .4 : 1 }}>
                  <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, textDecoration: gone ? "line-through" : "none" }}>{name}</span>
                  {gone ? <span style={{ fontSize: 9, color: "#d94f3d", fontWeight: 800 }}>TAKEN</span> : <>
                    {p && <button onClick={() => onSelect(p)} style={{ ...btn("#2e9e4f", "#fff"), padding: "2px 7px", fontSize: 9 }}>DRAFT</button>}
                    <button disabled={i === 0} onClick={() => { const n = [...queue]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; saveQueue(n); }} style={{ ...btn("#3a4a34"), padding: "2px 6px", fontSize: 10, opacity: i === 0 ? .3 : 1 }}>▲</button>
                    <button disabled={i === queue.length - 1} onClick={() => { const n = [...queue]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; saveQueue(n); }} style={{ ...btn("#3a4a34"), padding: "2px 6px", fontSize: 10, opacity: i === queue.length - 1 ? .3 : 1 }}>▼</button>
                    <button onClick={() => saveQueue(queue.filter(n => n !== name))} style={{ ...btn("#3a4a34"), padding: "2px 6px", fontSize: 10 }}>✕</button>
                  </>}
                </div>
              );
            })}
          </Rail>
          <Rail title="MY ROSTER">
            {roster.slotsOut.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 6, padding: "3px 4px", fontSize: 11.5, borderBottom: "1px solid #1f2a1a" }}>
                <span style={{ width: 38, fontWeight: 800, color: POS_COLOR[s.want] || "#7a8c74", fontSize: 10 }}>{s.want}</span>
                {s.player ? <span style={{ fontWeight: 700 }}>{s.player.player} <span style={{ color: "#7a8c74", fontSize: 9.5 }}>Rd {s.player.round}</span></span>
                  : <span style={{ color: "#3f4c3a" }}>—</span>}
              </div>
            ))}
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#7a8c74", margin: "6px 0 2px" }}>BENCH</div>
            {roster.bench.map(p => (
              <div key={p.id} style={{ display: "flex", gap: 6, padding: "2px 4px", fontSize: 11 }}>
                <span style={{ width: 38, fontWeight: 800, color: POS_COLOR[p.pos], fontSize: 10 }}>{p.pos}</span>
                <span>{p.player} <span style={{ color: "#7a8c74", fontSize: 9.5 }}>Rd {p.round}</span></span>
              </div>
            ))}
            {roster.bench.length === 0 && <div style={{ fontSize: 10.5, color: "#5a6a54" }}>bench empty</div>}
          </Rail>
        </div>
      </div>
      {/* ── bottom pick feed ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 12px", borderTop: "1px solid #2c3828", overflowX: "auto", whiteSpace: "nowrap", background: "#11160f" }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: "#7a8c74" }}>RECENT</span>
        {feed.map(p => {
          const n = slots.length || 10;
          const no = (p.round - 1) * n + (p.round % 2 === 1 ? p.slot : n - p.slot + 1);
          return (
            <span key={p.id} style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 6, background: "#1c241a", border: "1px solid #2c3828" }}>
              <b style={{ color: "#7a8c74" }}>{no}.</b> <b style={{ color: POS_COLOR[p.pos] }}>{p.player}</b>
              <span style={{ color: "#7a8c74" }}> → {slots.find(s => s.slot === p.slot)?.member}</span>
            </span>
          );
        })}
        {feed.length === 0 && <span style={{ fontSize: 10.5, color: "#5a6a54" }}>no picks yet</span>}
      </div>
      {/* ── player drawer ── */}
      {drawer && (
        <div onClick={() => setDrawer(null)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "#141a12cc", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, maxWidth: "94vw", background: "#1a2217", borderLeft: "2px solid #7fb069", overflowY: "auto", padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: SERIF, fontSize: 24 }}>{drawer.player}</span>
              <span style={{ color: POS_COLOR[drawer.pos], fontWeight: 800 }}>{drawer.pos_rank}</span>
              <button onClick={() => setDrawer(null)} style={{ ...btn("#3a4a34"), marginLeft: "auto" }}>Esc ✕</button>
            </div>
            <div style={{ fontSize: 12, color: "#a9bda0", margin: "2px 0 12px" }}>
              {drawer.team} · bye {drawer.bye}{drawerM.age ? ` · age ${drawerM.age}` : ""}{drawerM.colts ? " · 🏠 local-reach risk" : ""}{drawerM.injury_risk ? ` · ${drawerM.injury_risk === "out" ? "🚑 OUT" : "🩹 injury risk"}` : ""}
            </div>
            <DrawerSec title="MARKET VALUE">
              <Row k="Custom rank" v={drawer.rk} /><Row k="ADP (consensus)" v={drawerM.adp != null ? Math.round(+drawerM.adp) : "—"} />
              <Row k="Δ value" v={drawerM.adp != null ? `${Math.round(+drawerM.adp - drawer.rk) > 0 ? "+" : ""}${Math.round(+drawerM.adp - drawer.rk)}` : "—"}
                hi={drawerM.adp != null && +drawerM.adp - drawer.rk >= 8} />
              {(() => { const av = availability(drawer); return av ? <Row k="At my next pick*" v={av[0]} color={av[1]} /> : null; })()}
            </DrawerSec>
            <DrawerSec title="STRATEGY BREAKDOWN (40/30/20/10)">
              <Bar k="Usage / floor" v={drawerM.usage_score} />
              <Bar k="Offense environment" v={drawerM.env_score} />
              <Bar k="High-value touches" v={drawerM.hvt_score} />
              <Bar k="Talent / efficiency" v={drawerM.talent_score} />
              <Row k="Final score" v={scoreOf(drawerM)} hi />
              {drawerM.label && <Row k="Label" v={drawerM.label} color={LABEL_COLOR[drawerM.label]} />}
            </DrawerSec>
            <DrawerSec title="WHY WE WANT HIM / WHAT COULD GO WRONG">
              <div style={{ fontSize: 12, color: "#c9d6c0", lineHeight: 1.5 }}>
                {drawerM.note || "No curated note — this player sits below the hand-scouted top 60; scores are formula-derived from list position."}
              </div>
              {drawerM.injury_risk === "risk" && <div style={{ fontSize: 11.5, color: "#e89a3a", marginTop: 6 }}>⚠ Carries current injury risk — check the latest news before drafting.</div>}
              {drawerM.colts && <div style={{ fontSize: 11.5, color: "#e89a3a", marginTop: 6 }}>🏠 This room likely takes him ahead of national ADP — treat the availability estimate as optimistic.</div>}
            </DrawerSec>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => { onSelect(drawer); setDrawer(null); }} style={{ ...btn("#2e9e4f", "#fff"), flex: 1, padding: "12px", fontSize: 13 }}>DRAFT {drawer.player.split(" ").slice(-1)[0].toUpperCase()}</button>
              <button onClick={() => { saveQueue(queue.includes(drawer.player) ? queue.filter(n => n !== drawer.player) : [...queue, drawer.player]); }}
                style={{ ...btn("#3a4a34"), padding: "12px 14px", fontSize: 13 }}>{queue.includes(drawer.player) ? "✓ Queued" : "+ Queue"}</button>
            </div>
            <div style={{ fontSize: 9, color: "#5a6a54", marginTop: 10 }}>*Availability is an ADP-based estimate, not a measured probability. Opportunity/projection columns fill in when a projections source is loaded into draft_metrics.</div>
          </div>
        </div>
      )}
    </div>
  );
}
const scoreOf = m => m && m.usage_score != null ? Math.round((m.usage_score * .4 + m.env_score * .3 + m.hvt_score * .2 + m.talent_score * .1) * 10) / 10 : "—";
const tdS = num => ({ padding: "5px 6px", fontSize: 11.5, whiteSpace: "nowrap", fontVariantNumeric: num ? "tabular-nums" : "normal", textAlign: num ? "right" : "left" });
const Stat = ({ label, value, hot }) => (
  <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.15 }}>
    <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: .8, color: "#7a8c74" }}>{label}</span>
    <span style={{ fontSize: 13.5, fontWeight: 800, color: hot ? "#7fb069" : "#e8eee4" }}>{value}</span>
  </span>
);
const Rail = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", marginBottom: 5 }}>{title}</div>
    {children}
  </div>
);
const DrawerSec = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: "#7fb069", borderBottom: "1px solid #2c3828", paddingBottom: 3, marginBottom: 6 }}>{title}</div>
    {children}
  </div>
);
const Row = ({ k, v, hi, color }) => (
  <div style={{ display: "flex", fontSize: 12, padding: "2px 0" }}>
    <span style={{ flex: 1, color: "#a9bda0" }}>{k}</span>
    <b style={{ color: color || (hi ? "#1fa8a0" : "#e8eee4") }}>{v}</b>
  </div>
);
const Bar = ({ k, v }) => (
  <div style={{ marginBottom: 4 }}>
    <div style={{ display: "flex", fontSize: 10.5 }}><span style={{ flex: 1, color: "#a9bda0" }}>{k}</span><b>{v ?? "—"}</b></div>
    <div style={{ height: 4, background: "#141a12", borderRadius: 3 }}>
      <div style={{ width: `${v || 0}%`, height: "100%", background: "#7fb069", borderRadius: 3 }} />
    </div>
  </div>
);
