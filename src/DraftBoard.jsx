// 🏈 LIVE FANTASY DRAFT BOARD (Caleb 8/29: one link the whole league opens at the
// draft, picks sync live; plus two private links with personal rankings for Caleb
// and Kacie). Public route ?draft=<board> (+&rank=<list> for a personal rankings
// panel). Realtime via draft_picks subscription + polling fallback — phones at a
// draft table lose sockets all the time.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";

const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const POS_COLOR = { WR: "#2d7dd2", RB: "#2e9e4f", QB: "#d94f3d", TE: "#e89a3a", K: "#8e5cd9", "D/ST": "#6b7280" };
const ROUNDS = 15;

export default function DraftBoard({ board = "hb26", rankList = "master" }) {
  const sb = getSupabase();
  const [slots, setSlots] = useState([]);
  const [picks, setPicks] = useState([]);
  const [players, setPlayers] = useState([]);
  const [q, setQ] = useState("");
  const [posF, setPosF] = useState("ALL");
  const [tab, setTab] = useState("board");       // mobile: board | ranks
  const [pending, setPending] = useState(null);  // player object awaiting confirm
  const [undoArm, setUndoArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const loadPicks = async () => {
    const { data } = await sb.from("draft_picks").select("*").eq("board", board);
    setPicks(data || []);
  };
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: s } = await sb.from("draft_slots").select("*").eq("board", board).order("slot");
      setSlots(s || []);
      let all = [], off = 0;
      for (;;) {
        const { data } = await sb.from("draft_players").select("*").eq("list_name", rankList).order("rk").range(off, off + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        off += 1000;
      }
      setPlayers(all);
      loadPicks();
    })();
    const ch = sb.channel(`draft-${board}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_picks", filter: `board=eq.${board}` }, loadPicks)
      .subscribe();
    pollRef.current = setInterval(loadPicks, 15000);   // socket fallback
    return () => { sb.removeChannel(ch); clearInterval(pollRef.current); };
  }, [sb, board, rankList]);

  const pickedNames = useMemo(() => new Set(picks.map(p => p.player)), [picks]);
  const grid = useMemo(() => {
    const g = {};
    picks.forEach(p => { g[`${p.round}|${p.slot}`] = p; });
    return g;
  }, [picks]);
  // snake: odd rounds 1→N, even rounds N→1
  const next = useMemo(() => {
    const n = slots.length || 10;
    for (let r = 1; r <= ROUNDS; r++) {
      const order = r % 2 === 1 ? [...Array(n)].map((_, i) => i + 1) : [...Array(n)].map((_, i) => n - i);
      for (const s of order) if (!grid[`${r}|${s}`]) return { round: r, slot: s };
    }
    return null;
  }, [grid, slots]);
  const onClock = next ? (slots.find(s => s.slot === next.slot)?.member || `Slot ${next.slot}`) : null;
  const pickNo = next ? (next.round - 1) * (slots.length || 10) + (next.round % 2 === 1 ? next.slot : (slots.length || 10) - next.slot + 1) : null;

  async function draftPlayer(pl) {
    if (!next || busy) return;
    setBusy(true);
    const { error } = await sb.from("draft_picks").insert({ board, round: next.round, slot: next.slot, player: pl.player, team: pl.team, pos: pl.pos });
    if (error && !/duplicate/i.test(error.message || "")) alert(`Pick failed: ${error.message}`);
    await loadPicks();
    setPending(null); setQ(""); setBusy(false);
  }
  async function undoLast() {
    if (!picks.length || busy) return;
    setBusy(true);
    const last = [...picks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    await sb.from("draft_picks").delete().eq("id", last.id);
    await loadPicks();
    setUndoArm(false); setBusy(false);
  }
  // personal lists: nudge a player up/down (swap rk with neighbor)
  async function nudge(pl, dir) {
    if (rankList === "master" || busy) return;
    const idx = players.findIndex(p => p.id === pl.id);
    const other = players[idx + dir];
    if (!other) return;
    setBusy(true);
    await sb.from("draft_players").update({ rk: other.rk }).eq("id", pl.id);
    await sb.from("draft_players").update({ rk: pl.rk }).eq("id", other.id);
    const { data } = await sb.from("draft_players").select("*").eq("list_name", rankList).order("rk").range(0, 999);
    setPlayers(data || []);
    setBusy(false);
  }

  const visible = players.filter(p =>
    (posF === "ALL" || p.pos === posF) &&
    (!q || `${p.player} ${p.team} ${p.pos}`.toLowerCase().includes(q.toLowerCase())));
  const bestAvail = players.find(p => !pickedNames.has(p.player));
  const personal = rankList !== "master";

  const cellW = 108;
  return (
    <div style={{ fontFamily: FONT, background: "#141a12", color: "#e8eee4", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      {/* header / on-the-clock */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid #2c3828", position: "sticky", top: 0, background: "#141a12", zIndex: 20 }}>
        <span style={{ fontFamily: SERIF, fontSize: 20 }}>🏈 Draft Board '26</span>
        {next ? (
          <span style={{ background: "#7fb069", color: "#141a12", borderRadius: 9, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>
            Pick {pickNo} · Rd {next.round} — {onClock} on the clock
          </span>
        ) : <span style={{ background: "#e89a3a", color: "#141a12", borderRadius: 9, padding: "4px 12px", fontWeight: 800 }}>DRAFT COMPLETE 🎉</span>}
        {personal && <span style={{ fontSize: 11, color: "#a9bda0", fontWeight: 700 }}>🔒 {rankList.split("-")[0].toUpperCase()}'s rankings</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {picks.length > 0 && (undoArm
            ? <>
                <button onClick={undoLast} disabled={busy} style={btn("#d94f3d")}>Confirm undo</button>
                <button onClick={() => setUndoArm(false)} style={btn("#3a4a34")}>✕</button>
              </>
            : <button onClick={() => setUndoArm(true)} style={btn("#3a4a34")}>↩ Undo last</button>)}
        </span>
      </div>
      {/* mobile tab switch */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 0" }} className="draft-tabs">
        {[["board", "📋 Board"], ["ranks", personal ? "⭐ My Rankings" : "📊 Rankings"]].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...btn(tab === t ? "#7fb069" : "#3a4a34"), color: tab === t ? "#141a12" : "#e8eee4" }}>{l}</button>
        ))}
        {bestAvail && <span style={{ marginLeft: "auto", fontSize: 11, color: "#a9bda0", alignSelf: "center" }}>Best available: <b style={{ color: POS_COLOR[bestAvail.pos] || "#fff" }}>{bestAvail.player}</b> ({bestAvail.pos_rank})</span>}
      </div>
      {/* confirm bar */}
      {pending && next && (
        <div style={{ position: "sticky", top: 52, zIndex: 30, margin: "8px 14px", background: "#1f2a1a", border: "2px solid #7fb069", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b>{pending.player}</b> <span style={{ color: POS_COLOR[pending.pos], fontWeight: 800 }}>{pending.pos_rank}</span>
          <span style={{ color: "#a9bda0", fontSize: 12 }}>→ {onClock} · Rd {next.round}</span>
          <button onClick={() => draftPlayer(pending)} disabled={busy} style={btn("#7fb069", "#141a12")}>✓ Draft</button>
          <button onClick={() => setPending(null)} style={btn("#3a4a34")}>Cancel</button>
        </div>
      )}
      {tab === "board" && (
        <div style={{ overflowX: "auto", padding: 14 }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
            <thead><tr>
              <th style={{ width: 30 }} />
              {slots.map(s => <th key={s.slot} style={{ minWidth: cellW, fontSize: 11.5, fontWeight: 800, color: "#c8e6b8", padding: "4px 2px" }}>{s.member}</th>)}
            </tr></thead>
            <tbody>
              {[...Array(ROUNDS)].map((_, ri) => {
                const r = ri + 1;
                return (
                  <tr key={r}>
                    <td style={{ fontSize: 10, color: "#7a8c74", fontWeight: 800, textAlign: "center" }}>{r}</td>
                    {slots.map(s => {
                      const p = grid[`${r}|${s.slot}`];
                      const isNext = next && next.round === r && next.slot === s.slot;
                      return (
                        <td key={s.slot} style={{
                          minWidth: cellW, height: 40, borderRadius: 7, padding: "2px 6px", fontSize: 10.5, verticalAlign: "middle",
                          background: p ? (POS_COLOR[p.pos] || "#3a4a34") : isNext ? "#7fb06933" : "#1c241a",
                          border: isNext ? "2px solid #7fb069" : "1px solid #2c3828",
                          color: p ? "#fff" : "#5a6a54", fontWeight: p ? 700 : 400,
                        }}>
                          {p ? <>{p.player}<div style={{ fontSize: 8.5, opacity: .85 }}>{p.pos} · {p.team}</div></> : isNext ? "⏱ on the clock" : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "ranks" && (
        <div style={{ padding: 14, maxWidth: 640 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="search player…"
              style={{ flex: 1, minWidth: 150, padding: "8px 10px", borderRadius: 9, border: "1px solid #3a4a34", background: "#1c241a", color: "#e8eee4", fontFamily: FONT, fontSize: 14 }} />
            {["ALL", "WR", "RB", "QB", "TE", "K", "D/ST"].map(p => (
              <button key={p} onClick={() => setPosF(p)} style={{ ...btn(posF === p ? (POS_COLOR[p] || "#7fb069") : "#3a4a34"), fontSize: 11 }}>{p}</button>
            ))}
          </div>
          {visible.slice(0, 120).map((p, i) => {
            const gone = pickedNames.has(p.player);
            const newTier = i === 0 || visible[i - 1].tier !== p.tier;
            return (
              <div key={p.id}>
                {newTier && posF === "ALL" && !q && <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", margin: "10px 0 3px", letterSpacing: 1 }}>TIER {p.tier}</div>}
                <div onClick={() => !gone && next && setPending(p)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, marginBottom: 2, cursor: gone ? "default" : "pointer",
                    background: gone ? "#181f16" : "#212b1d", opacity: gone ? .45 : 1, border: "1px solid #2c3828" }}>
                  <span style={{ width: 28, textAlign: "right", fontSize: 11, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{p.rk}</span>
                  <span style={{ width: 40, fontWeight: 800, fontSize: 11, color: POS_COLOR[p.pos] || "#fff" }}>{p.pos_rank}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, textDecoration: gone ? "line-through" : "none" }}>{p.player}</span>
                  <span style={{ fontSize: 10.5, color: "#a9bda0" }}>{p.team} · bye {p.bye}</span>
                  {personal && !gone && (
                    <span style={{ display: "flex", gap: 3 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => nudge(p, -1)} disabled={busy} style={{ ...btn("#3a4a34"), padding: "1px 7px" }}>▲</button>
                      <button onClick={() => nudge(p, 1)} disabled={busy} style={{ ...btn("#3a4a34"), padding: "1px 7px" }}>▼</button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length > 120 && <div style={{ color: "#7a8c74", fontSize: 11, padding: 8 }}>…{visible.length - 120} more — use search or position filters</div>}
        </div>
      )}
    </div>
  );
}
const btn = (bg, color = "#e8eee4") => ({ background: bg, color, border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT });
