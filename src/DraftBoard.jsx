// 🏈 LIVE FANTASY DRAFT BOARD (Caleb 8/29): one league link, picks sync live; every
// member has a private ?rank= link with reorderable rankings. Caleb + Kacie carry the
// strategy layer (labels/notes/value flags via draft_metrics + scripts/draft_score.js)
// and commissioner powers: fix slots, share links, per-slot 🤖 autodraft, and 🎮 MOCK
// DRAFT mode — practice snake drafts vs CPU opponents on a throwaway board. A 60-second
// pick clock runs on the real draft; expiry auto-picks best available (enforced by
// whichever commish device is open — phones at the table race safely, the unique
// (board,round,slot) constraint dedupes).
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";

const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const POS_COLOR = { WR: "#2d7dd2", RB: "#2e9e4f", QB: "#d94f3d", TE: "#e89a3a", K: "#8e5cd9", "D/ST": "#6b7280" };
const LABEL_COLOR = { CORE: "#2e9e4f", VALUE: "#1fa8a0", FLIP: "#e89a3a", LOTTERY: "#8e5cd9", FADE: "#d94f3d" };
const ROUNDS = 15;
const CLOCK_SECS = 60;
const btn = (bg, color = "#e8eee4") => ({ background: bg, color, border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT });

export default function DraftBoard({ board = "hb26", rankList = "master" }) {
  const sb = getSupabase();
  const isCommish = ["caleb-4qx", "kacie-7mv"].includes(rankList);
  const [activeBoard, setActiveBoard] = useState(() => {
    try { return localStorage.getItem(`draft-${board}-mock-${rankList}`) || board; } catch { return board; }
  });
  const inMock = activeBoard !== board;
  const [mockSlot, setMockSlot] = useState(() => { try { return +localStorage.getItem(`draft-${board}-mockslot-${rankList}`) || null; } catch { return null; } });
  const [mockSetup, setMockSetup] = useState(false);

  const [slots, setSlots] = useState([]);
  const [picks, setPicks] = useState([]);
  const [players, setPlayers] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [q, setQ] = useState("");
  const [posF, setPosF] = useState("ALL");
  const [sortBy, setSortBy] = useState("rank");
  const [posView, setPosView] = useState(false);
  const [hiddenTeams, setHiddenTeams] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("draft-hidden-teams") || "[]")); } catch { return new Set(); }
  });
  const [showTeamBar, setShowTeamBar] = useState(false);
  const [tab, setTab] = useState("board");
  const [pending, setPending] = useState(null);
  const [undoArm, setUndoArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(typeof window !== "undefined" && window.innerWidth > 1080);
  const [commishOpen, setCommishOpen] = useState(false);
  const [slotEdits, setSlotEdits] = useState({});
  const [copied, setCopied] = useState("");
  const [nowT, setNowT] = useState(Date.now());
  const meKey = `draft-${board}-me`;
  const [me, setMe] = useState(() => { try { return JSON.parse(localStorage.getItem(meKey) || "null"); } catch { return null; } });
  const [setup, setSetup] = useState(!me && !isCommish);
  const [setupName, setSetupName] = useState(me?.name || (rankList !== "master" ? rankList.split("-")[0].toUpperCase() : ""));
  const [setupSlot, setSetupSlot] = useState(me?.slot || null);
  const pollRef = useRef(null);
  const autoRef = useRef(false);   // re-entrancy guard for autodraft

  useEffect(() => {
    const onR = () => setWide(window.innerWidth > 1080);
    window.addEventListener("resize", onR);
    const t = setInterval(() => setNowT(Date.now()), 1000);
    return () => { window.removeEventListener("resize", onR); clearInterval(t); };
  }, []);

  const loadPicks = async () => {
    const { data } = await sb.from("draft_picks").select("*").eq("board", activeBoard);
    setPicks(data || []);
  };
  const loadSlots = async () => {
    const { data } = await sb.from("draft_slots").select("*").eq("board", activeBoard).order("slot");
    setSlots(data || []);
  };
  const loadPlayers = async () => {
    let all = [], off = 0;
    for (;;) {
      const { data } = await sb.from("draft_players").select("*").eq("list_name", rankList).order("rk").range(off, off + 999);
      all = all.concat(data || []);
      if (!data || data.length < 1000) break;
      off += 1000;
    }
    setPlayers(all);
  };
  useEffect(() => {
    if (!sb) return;
    (async () => {
      await loadSlots();
      await loadPlayers();
      if (rankList !== "master") {
        let mm = [], moff = 0;
        for (;;) {
          const { data } = await sb.from("draft_metrics").select("*").range(moff, moff + 999);
          mm = mm.concat(data || []);
          if (!data || data.length < 1000) break;
          moff += 1000;
        }
        setMetrics(Object.fromEntries(mm.map(m => [m.player, m])));
      }
      loadPicks();
    })();
    const ch = sb.channel(`draft-${activeBoard}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_picks", filter: `board=eq.${activeBoard}` }, loadPicks)
      .subscribe();
    pollRef.current = setInterval(() => { loadPicks(); loadSlots(); }, 15000);
    return () => { sb.removeChannel(ch); clearInterval(pollRef.current); };
  }, [sb, activeBoard, rankList]);

  const pickedNames = useMemo(() => new Set(picks.map(p => p.player)), [picks]);
  const grid = useMemo(() => { const g = {}; picks.forEach(p => { g[`${p.round}|${p.slot}`] = p; }); return g; }, [picks]);
  const next = useMemo(() => {
    const n = slots.length || 10;
    for (let r = 1; r <= ROUNDS; r++) {
      const order = r % 2 === 1 ? [...Array(n)].map((_, i) => i + 1) : [...Array(n)].map((_, i) => n - i);
      for (const s of order) if (!grid[`${r}|${s}`]) return { round: r, slot: s };
    }
    return null;
  }, [grid, slots]);
  const onClockSlot = next ? slots.find(s => s.slot === next.slot) : null;
  const onClock = onClockSlot?.member || (next ? `Slot ${next.slot}` : null);
  const pickNo = next ? (next.round - 1) * (slots.length || 10) + (next.round % 2 === 1 ? next.slot : (slots.length || 10) - next.slot + 1) : null;

  // ── pick clock: 60s from the previous pick ────────────────────────────────
  const lastPickAt = useMemo(() => picks.length ? Math.max(...picks.map(p => +new Date(p.created_at))) : null, [picks]);
  const clockLeft = next && lastPickAt ? Math.max(0, CLOCK_SECS - Math.floor((nowT - lastPickAt) / 1000)) : null;

  async function insertPick(pl, target) {
    const { error } = await sb.from("draft_picks").insert({ board: activeBoard, round: target.round, slot: target.slot, player: pl.player, team: pl.team, pos: pl.pos });
    if (error && !/duplicate/i.test(error.message || "")) console.warn("pick failed", error.message);
    await loadPicks();
  }
  async function draftPlayer(pl) {
    if (!next || busy) return;
    const wasMine = next.slot === (inMock ? mockSlot : me?.slot);
    setBusy(true);
    await insertPick(pl, next);
    setPending(null); setQ(""); setBusy(false);
    if (wasMine && !wide) setTab("board");   // show your pick landing on the board
  }
  async function undoLast() {
    if (!picks.length || busy) return;
    setBusy(true);
    const last = [...picks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    await sb.from("draft_picks").delete().eq("id", last.id);
    await loadPicks();
    setUndoArm(false); setBusy(false);
  }

  // ── autodraft brain: best available by market cost + team-need sense.
  // Pure over a supplied pick set so the mock can simulate whole runs locally.
  function choiceFor(slot, round, simPicks) {
    const taken = new Set(simPicks.map(p => p.player));
    const roster = simPicks.filter(p => p.slot === slot);
    const count = pos => roster.filter(p => p.pos === pos).length;
    const elig = players.filter(p => {
      if (taken.has(p.player)) return false;
      if ((p.pos === "K" || p.pos === "D/ST") && round < 13) return false;
      if (p.pos === "K" && count("K") >= 1) return false;
      if (p.pos === "D/ST" && count("D/ST") >= 1) return false;
      if (p.pos === "QB" && count("QB") >= 1 && round < 12) return false;
      if (p.pos === "TE" && count("TE") >= 1 && round < 12) return false;
      // team needs: make sure QB/TE get filled before the end game
      return true;
    }).sort((a, b) => (+(metrics[a.player]?.adp ?? a.rk)) - (+(metrics[b.player]?.adp ?? b.rk)));
    if (round >= 10 && count("QB") === 0 && elig.some(p => p.pos === "QB")) return elig.find(p => p.pos === "QB");
    if (round >= 11 && count("TE") === 0 && elig.some(p => p.pos === "TE")) return elig.find(p => p.pos === "TE");
    if (round >= 14) {
      if (count("K") === 0 && elig.some(p => p.pos === "K")) return elig.find(p => p.pos === "K");
      if (count("D/ST") === 0 && elig.some(p => p.pos === "D/ST")) return elig.find(p => p.pos === "D/ST");
    }
    const top = elig.slice(0, 3);
    return top[Math.floor(Math.random() * top.length)] || elig[0];
  }
  const nextOpen = simPicks => {
    const n = slots.length || 10;
    for (let r = 1; r <= ROUNDS; r++) {
      const order = r % 2 === 1 ? [...Array(n)].map((_, i) => i + 1) : [...Array(n)].map((_, i) => n - i);
      for (const s of order) if (!simPicks.some(p => p.round === r && p.slot === s)) return { round: r, slot: s };
    }
    return null;
  };
  // MOCK: burst every CPU pick instantly until it's YOUR turn — no clock, no delays
  useEffect(() => {
    if (!inMock || !next || !players.length || !slots.length || autoRef.current) return;
    if (next.slot === mockSlot) return;
    autoRef.current = true;
    (async () => {
      let sim = picks.map(p => ({ round: p.round, slot: p.slot, player: p.player, team: p.team, pos: p.pos }));
      const rows = [];
      let cur = { ...next };
      while (cur && cur.slot !== mockSlot && rows.length < 160) {
        const c = choiceFor(cur.slot, cur.round, sim);
        if (!c) break;
        const row = { board: activeBoard, round: cur.round, slot: cur.slot, player: c.player, team: c.team, pos: c.pos };
        sim.push(row); rows.push(row);
        cur = nextOpen(sim);
      }
      if (rows.length) await sb.from("draft_picks").insert(rows);
      await loadPicks();
      autoRef.current = false;
    })();
  }, [inMock, next, players, slots, mockSlot]);
  // REAL BOARD: 🤖 slots (5s) + clock expiry, driven by open commish devices
  useEffect(() => {
    if (inMock || !isCommish || !next || !players.length || autoRef.current) return;
    const slotCfg = slots.find(s => s.slot === next.slot);
    const isCpu = !!slotCfg?.auto;
    const expired = clockLeft === 0 && picks.length > 0;
    if (!isCpu && !expired) return;
    const t = setTimeout(async () => {
      if (autoRef.current) return;
      autoRef.current = true;
      const choice = choiceFor(next.slot, next.round, picks);
      if (choice) await insertPick(choice, next);
      autoRef.current = false;
    }, isCpu ? 5000 : 800);
    return () => clearTimeout(t);
  }, [next, slots, players, inMock, isCommish, clockLeft, picks.length]);

  // ── mock draft lifecycle ────────────────────────────────────────────────────
  async function startMock(slot) {
    setBusy(true);
    const id = `mock-${rankList}-${Date.now().toString(36)}`;
    const rows = [...Array(10)].map((_, i) => ({ board: id, slot: i + 1, member: i + 1 === slot ? "⭐ YOU" : `CPU ${i + 1}`, auto: i + 1 !== slot }));
    await sb.from("draft_slots").insert(rows);
    localStorage.setItem(`draft-${board}-mock-${rankList}`, id);
    localStorage.setItem(`draft-${board}-mockslot-${rankList}`, String(slot));
    setMockSlot(slot); setMockSetup(false); setActiveBoard(id); setPicks([]); setBusy(false);
  }
  function exitMock() {
    localStorage.removeItem(`draft-${board}-mock-${rankList}`);
    localStorage.removeItem(`draft-${board}-mockslot-${rankList}`);
    setActiveBoard(board); setMockSlot(null); setPicks([]);
  }

  async function saveSlotEdits() {
    setBusy(true);
    for (const [slot, name] of Object.entries(slotEdits)) {
      const clean = String(name).trim().toUpperCase().slice(0, 14);
      if (clean) await sb.from("draft_slots").update({ member: clean }).eq("board", activeBoard).eq("slot", +slot);
    }
    await loadSlots(); setSlotEdits({}); setBusy(false);
  }
  async function toggleAuto(s) {
    await sb.from("draft_slots").update({ auto: !s.auto }).eq("id", s.id);
    await loadSlots();
  }
  async function saveSetup() {
    if (!setupName.trim() || !setupSlot) return;
    const name = setupName.trim().toUpperCase().slice(0, 14);
    await sb.from("draft_slots").update({ member: name }).eq("board", board).eq("slot", setupSlot);
    await loadSlots();
    const m = { name, slot: setupSlot };
    setMe(m); localStorage.setItem(meKey, JSON.stringify(m));
    setSetup(false);
  }
  const snakePicksFor = slot => {
    const n = slots.length || 10;
    return [...Array(ROUNDS)].map((_, ri) => {
      const r = ri + 1;
      return (r - 1) * n + (r % 2 === 1 ? slot : n - slot + 1);
    });
  };
  const toggleTeam = t => setHiddenTeams(prev => {
    const n = new Set(prev);
    n.has(t) ? n.delete(t) : n.add(t);
    localStorage.setItem("draft-hidden-teams", JSON.stringify([...n]));
    return n;
  });
  async function nudge(pl, dir) {
    if (rankList === "master" || busy) return;
    const idx = players.findIndex(p => p.id === pl.id);
    const other = players[idx + dir];
    if (!other) return;
    setBusy(true);
    await sb.from("draft_players").update({ rk: other.rk }).eq("id", pl.id);
    await sb.from("draft_players").update({ rk: pl.rk }).eq("id", other.id);
    await loadPlayers();
    setBusy(false);
  }

  const teams = useMemo(() => [...new Set(players.map(p => p.team).filter(Boolean))].sort(), [players]);
  const visible = useMemo(() => {
    let v = players.filter(p =>
      (posF === "ALL" || p.pos === posF) &&
      !hiddenTeams.has(p.team) &&
      (!q || `${p.player} ${p.team} ${p.pos}`.toLowerCase().includes(q.toLowerCase())));
    if (sortBy === "pos") v = [...v].sort((a, b) => String(a.pos).localeCompare(String(b.pos)) || a.rk - b.rk);
    if (sortBy === "team") v = [...v].sort((a, b) => String(a.team).localeCompare(String(b.team)) || a.rk - b.rk);
    return v;
  }, [players, posF, hiddenTeams, q, sortBy]);
  const bestAvail = players.find(p => !pickedNames.has(p.player) && !hiddenTeams.has(p.team));
  const personal = rankList !== "master";
  const mySlot = inMock ? mockSlot : me?.slot;

  const myPicks = useMemo(() => {
    if (!mySlot || !slots.length) return [];
    const n = slots.length, out = [];
    for (let r = 1; r <= ROUNDS; r++) {
      const no = (r - 1) * n + (r % 2 === 1 ? mySlot : n - mySlot + 1);
      if (!grid[`${r}|${mySlot}`]) out.push({ round: r, no });
    }
    return out.slice(0, 3);
  }, [mySlot, slots, grid]);
  const availAt = target => players.filter(p => !pickedNames.has(p.player) &&
    (metrics[p.player]?.adp == null || +metrics[p.player].adp >= target - 4)).slice(0, 4);
  const availTag = (p, target) => {
    const adp = +(metrics[p.player]?.adp ?? 999);
    return adp - target >= 6 ? ["safe", "#2e9e4f"] : adp - target >= 0 ? ["likely", "#e89a3a"] : ["risky", "#d94f3d"];
  };

  const boardPanel = (
    <div style={{ overflowX: "auto", padding: 14, flex: 1, minWidth: 0 }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
        <thead><tr>
          <th style={{ width: 26, position: "sticky", left: 0, background: "#141a12", zIndex: 5 }} />
          {slots.map(s => <th key={s.slot} style={{ minWidth: wide ? 104 : 88, fontSize: wide ? 11.5 : 10, fontWeight: 800, padding: "4px 2px",
            color: mySlot === s.slot ? "#141a12" : "#c8e6b8", background: mySlot === s.slot ? "#7fb069" : "transparent", borderRadius: 6 }}>
            {s.member}{s.auto && !inMock ? " 🤖" : ""}</th>)}
        </tr></thead>
        <tbody>
          {[...Array(ROUNDS)].map((_, ri) => {
            const r = ri + 1;
            return (
              <tr key={r}>
                <td style={{ fontSize: 10, color: "#7a8c74", fontWeight: 800, textAlign: "center", position: "sticky", left: 0, background: "#141a12", zIndex: 5 }}>{r}</td>
                {slots.map(s => {
                  const p = grid[`${r}|${s.slot}`];
                  const isNext = next && next.round === r && next.slot === s.slot;
                  return (
                    <td key={s.slot} style={{
                      minWidth: wide ? 104 : 88, height: 40, borderRadius: 7, padding: "2px 6px", fontSize: wide ? 10.5 : 9.5, verticalAlign: "middle",
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
  );

  const ranksPanel = (
    <div style={{ padding: 14, maxWidth: wide ? undefined : 640 }}>
      {myPicks.length > 0 && (
        <div style={{ background: "#1f2a1a", border: "1px solid #3a4a34", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", marginBottom: 6 }}>MY NEXT PICKS</div>
          {myPicks.map(mp => (
            <div key={mp.no} style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 12, color: "#c8e6b8" }}>Pick {mp.no}</span>
              <span style={{ fontSize: 10.5, color: "#7a8c74" }}> (Rd {mp.round}) — </span>
              {availAt(mp.no).map(p => {
                const [tag, col] = availTag(p, mp.no);
                return <span key={p.id} style={{ fontSize: 11.5, marginRight: 10, whiteSpace: "nowrap" }}>
                  <b style={{ color: POS_COLOR[p.pos] || "#fff" }}>{p.player}</b>
                  <span style={{ color: col, fontSize: 9.5 }}> {tag}</span>
                </span>;
              })}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search player…"
          style={{ flex: 1, minWidth: 130, padding: "9px 10px", borderRadius: 9, border: "1px solid #3a4a34", background: "#1c241a", color: "#e8eee4", fontFamily: FONT, fontSize: 16 }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 9, border: "1px solid #3a4a34", background: "#1c241a", color: "#e8eee4", fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
          <option value="rank">sort: ranking</option>
          <option value="pos">sort: position</option>
          <option value="team">sort: team</option>
        </select>
        <button onClick={() => setShowTeamBar(v => !v)} style={btn(showTeamBar || hiddenTeams.size ? "#7fb069" : "#3a4a34", showTeamBar || hiddenTeams.size ? "#141a12" : "#e8eee4")}>
          ✕ teams{hiddenTeams.size ? ` (${hiddenTeams.size})` : ""}
        </button>
        <button onClick={() => setPosView(v => !v)} style={btn(posView ? "#7fb069" : "#3a4a34", posView ? "#141a12" : "#e8eee4")}>
          ⊞ by position
        </button>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
        {["ALL", "WR", "RB", "QB", "TE", "K", "D/ST"].map(p => (
          <button key={p} onClick={() => setPosF(p)} style={{ ...btn(posF === p ? (POS_COLOR[p] || "#7fb069") : "#3a4a34"), fontSize: 11, padding: "4px 9px" }}>{p}</button>
        ))}
      </div>
      {showTeamBar && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap", background: "#1c241a", border: "1px solid #2c3828", borderRadius: 10, padding: 8 }}>
          {teams.map(t => {
            const off = hiddenTeams.has(t);
            return <button key={t} onClick={() => toggleTeam(t)} title={off ? "show team" : "hide team"}
              style={{ ...btn(off ? "#3a2222" : "#2c3828"), fontSize: 10, padding: "3px 7px", color: off ? "#d94f3d" : "#c8e6b8", textDecoration: off ? "line-through" : "none" }}>
              {off ? "✕ " : ""}{t}
            </button>;
          })}
          {hiddenTeams.size > 0 && <button onClick={() => { setHiddenTeams(new Set()); localStorage.setItem("draft-hidden-teams", "[]"); }}
            style={{ ...btn("#3a4a34"), fontSize: 10 }}>reset</button>}
        </div>
      )}
      {posView && (
        <div style={{ display: "grid", gridTemplateColumns: wide ? "1fr 1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {["WR", "RB", "TE", "QB", "K", "D/ST"].map(pos => {
            const col = players.filter(p => p.pos === pos && !hiddenTeams.has(p.team)
              && (!q || `${p.player} ${p.team}`.toLowerCase().includes(q.toLowerCase())));
            if (!col.length) return null;
            return (
              <div key={pos} style={{ background: "#1c241a", border: "1px solid #2c3828", borderRadius: 10, padding: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: POS_COLOR[pos] || "#fff", borderBottom: `2px solid ${POS_COLOR[pos] || "#3a4a34"}`, paddingBottom: 4, marginBottom: 5 }}>{pos}</div>
                {col.slice(0, pos === "K" || pos === "D/ST" ? 12 : 40).map((p, i) => {
                  const gone = pickedNames.has(p.player);
                  const m = metrics[p.player];
                  return (
                    <div key={p.id} onClick={() => !gone && next && setPending(p)}
                      style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "3px 4px", borderRadius: 5, cursor: gone ? "default" : "pointer",
                        opacity: gone ? .4 : 1, fontSize: 12 }}>
                      <span style={{ width: 22, textAlign: "right", fontSize: 10, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 700, textDecoration: gone ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.player}{personal && m?.colts ? " 🏠" : ""}
                      </span>
                      {personal && m?.label && <span style={{ fontSize: 7.5, fontWeight: 800, color: LABEL_COLOR[m.label] || "#a9bda0" }}>{m.label}</span>}
                      <span style={{ fontSize: 9.5, color: "#7a8c74" }}>{p.team}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {!posView && visible.slice(0, 150).map((p, i) => {
        const gone = pickedNames.has(p.player);
        const m = metrics[p.player];
        const newTier = sortBy === "rank" && (i === 0 || visible[i - 1].tier !== p.tier);
        const newGroup = sortBy !== "rank" && (i === 0 || visible[i - 1][sortBy === "pos" ? "pos" : "team"] !== p[sortBy === "pos" ? "pos" : "team"]);
        return (
          <div key={p.id}>
            {newTier && posF === "ALL" && !q && <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", margin: "10px 0 3px", letterSpacing: 1 }}>TIER {p.tier}</div>}
            {newGroup && <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", margin: "10px 0 3px", letterSpacing: 1 }}>{sortBy === "pos" ? p.pos : p.team}</div>}
            <div onClick={() => !gone && next && setPending(p)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, marginBottom: 2, cursor: gone ? "default" : "pointer",
                background: gone ? "#181f16" : "#212b1d", opacity: gone ? .45 : 1, border: "1px solid #2c3828" }}>
              <span style={{ width: 28, textAlign: "right", fontSize: 11, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{p.rk}</span>
              <span style={{ width: 40, fontWeight: 800, fontSize: 11, color: POS_COLOR[p.pos] || "#fff" }}>{p.pos_rank}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, textDecoration: gone ? "line-through" : "none" }}>
                  {p.player}{personal && m?.colts ? " 🏠" : ""}
                </span>
                {personal && m?.label &&
                  <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: (LABEL_COLOR[m.label] || "#3a4a34") + "33", color: LABEL_COLOR[m.label] || "#a9bda0" }}>{m.label}</span>}
                {personal && m?.adp != null && +m.adp - p.rk >= 8 && !gone &&
                  <span style={{ marginLeft: 5, fontSize: 8.5, color: "#1fa8a0", fontWeight: 800 }}>▼{Math.round(+m.adp - p.rk)} vs ADP</span>}
                {personal && m?.note && !gone &&
                  <div style={{ fontSize: 9.5, color: "#8ba183", lineHeight: 1.3, marginTop: 1 }}>{m.note}</div>}
              </span>
              <span style={{ fontSize: 10.5, color: "#a9bda0", whiteSpace: "nowrap" }}>{p.team} · bye {p.bye}</span>
              {personal && !gone && (
                <span style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => nudge(p, -1)} disabled={busy} style={{ ...btn("#3a4a34"), padding: "6px 10px", fontSize: 13 }}>▲</button>
                  <button onClick={() => nudge(p, 1)} disabled={busy} style={{ ...btn("#3a4a34"), padding: "6px 10px", fontSize: 13 }}>▼</button>
                </span>
              )}
            </div>
          </div>
        );
      })}
      {!posView && visible.length > 150 && <div style={{ color: "#7a8c74", fontSize: 11, padding: 8 }}>…{visible.length - 150} more — search or filter</div>}
    </div>
  );

  return (
    <div style={{ fontFamily: FONT, background: "#141a12", color: "#e8eee4", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      {setup && !inMock && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#141a12ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1f2a1a", border: "1px solid #3a4a34", borderRadius: 16, padding: 22, maxWidth: 420, width: "100%" }}>
            <div style={{ fontFamily: SERIF, fontSize: 22, marginBottom: 4 }}>
              🏈 Welcome{(() => {
                const NAMES = { caleb: "Caleb", kacie: "Kacie", mikeb: "Mike B.", daniel: "Daniel", alex: "Alex", dave: "Dave", michael: "Michael", peter: "Peter", martin: "Martin", paul: "Paul" };
                const raw = me?.name || NAMES[rankList.split("-")[0]] || "";
                const nice = raw && (NAMES[String(raw).toLowerCase()] || String(raw).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()));
                return nice ? `, ${nice}` : " to the '26 draft";
              })()}!
            </div>
            <div style={{ fontSize: 12, color: "#a9bda0", marginBottom: 14 }}>Snake draft — enter your team name and grab your draft slot.</div>
            <input value={setupName} onChange={e => setSetupName(e.target.value)} placeholder="team / your name"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 12px", borderRadius: 10, border: "1.5px solid #3a4a34", background: "#141a12", color: "#e8eee4", fontFamily: FONT, fontSize: 16, fontWeight: 700, marginBottom: 12 }} />
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", marginBottom: 6 }}>YOUR PICK SLOT</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 10 }}>
              {slots.map(s => (
                <button key={s.slot} onClick={() => setSetupSlot(s.slot)}
                  style={{ ...btn(setupSlot === s.slot ? "#7fb069" : "#141a12", setupSlot === s.slot ? "#141a12" : "#e8eee4"),
                    border: "1px solid #3a4a34", padding: "10px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 15 }}>{s.slot}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, opacity: .8, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{s.member}</span>
                </button>
              ))}
            </div>
            {setupSlot && (
              <div style={{ fontSize: 11, color: "#a9bda0", marginBottom: 12 }}>
                Slot {setupSlot} picks: {snakePicksFor(setupSlot).slice(0, 6).join(", ")}…
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveSetup} disabled={!setupName.trim() || !setupSlot}
                style={{ ...btn(setupName.trim() && setupSlot ? "#7fb069" : "#3a4a34", setupName.trim() && setupSlot ? "#141a12" : "#7a8c74"), flex: 1, padding: "12px", fontSize: 14 }}>
                ✓ I'm in
              </button>
              <button onClick={() => setSetup(false)} style={{ ...btn("#3a4a34"), padding: "12px" }}>Just watching</button>
            </div>
          </div>
        </div>
      )}
      {mockSetup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#141a12ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1f2a1a", border: "1px solid #3a4a34", borderRadius: 16, padding: 22, maxWidth: 420, width: "100%" }}>
            <div style={{ fontFamily: SERIF, fontSize: 22, marginBottom: 4 }}>🎮 Mock draft</div>
            <div style={{ fontSize: 12, color: "#a9bda0", marginBottom: 14 }}>Pick your draft position — the other 9 slots autodraft so you can practice the real flow. Nothing touches the league board.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
              {[...Array(10)].map((_, i) => (
                <button key={i} onClick={() => startMock(i + 1)} disabled={busy}
                  style={{ ...btn("#141a12"), border: "1px solid #3a4a34", padding: "14px 4px", fontSize: 15 }}>{i + 1}</button>
              ))}
            </div>
            <button onClick={() => setMockSetup(false)} style={{ ...btn("#3a4a34"), width: "100%", padding: "10px" }}>Cancel</button>
          </div>
        </div>
      )}
      {commishOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#141a12ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1f2a1a", border: "1px solid #3a4a34", borderRadius: 16, padding: 22, maxWidth: 420, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontFamily: SERIF, fontSize: 20, marginBottom: 4 }}>🛡 Commissioner</div>
            <div style={{ fontSize: 11.5, color: "#a9bda0", marginBottom: 12 }}>Fix slot names, or flip 🤖 autodraft on for anyone who can't make it.</div>
            {slots.map(s => (
              <div key={s.slot} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 22, textAlign: "right", fontWeight: 800, fontSize: 12, color: "#7a8c74" }}>{s.slot}</span>
                <input value={slotEdits[s.slot] ?? s.member} onChange={e => setSlotEdits(o => ({ ...o, [s.slot]: e.target.value }))}
                  style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${slotEdits[s.slot] != null && slotEdits[s.slot] !== s.member ? "#7fb069" : "#3a4a34"}`, background: "#141a12", color: "#e8eee4", fontFamily: FONT, fontSize: 16, fontWeight: 700 }} />
                <button onClick={() => toggleAuto(s)} title={s.auto ? "autodraft ON — tap to hand control back" : "autodraft OFF — tap to draft for them"}
                  style={{ ...btn(s.auto ? "#7fb069" : "#3a4a34", s.auto ? "#141a12" : "#e8eee4"), padding: "8px 10px" }}>🤖</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveSlotEdits} disabled={busy || !Object.keys(slotEdits).length}
                style={{ ...btn(Object.keys(slotEdits).length ? "#7fb069" : "#3a4a34", Object.keys(slotEdits).length ? "#141a12" : "#7a8c74"), flex: 1, padding: "11px" }}>✓ Save names</button>
              <button onClick={() => { setSlotEdits({}); setCommishOpen(false); }} style={{ ...btn("#3a4a34"), padding: "11px" }}>Close</button>
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", margin: "16px 0 6px" }}>SHARE LINKS</div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {[["League board (view + draft)", `/?draft=${board}`],
                ["Mike B.", `/?draft=${board}&rank=mikeb-2rf`], ["Caleb", `/?draft=${board}&rank=caleb-4qx`],
                ["Daniel", `/?draft=${board}&rank=daniel-8kt`], ["Kacie", `/?draft=${board}&rank=kacie-7mv`],
                ["Alex", `/?draft=${board}&rank=alex-5wj`], ["Dave", `/?draft=${board}&rank=dave-9hn`],
                ["Michael", `/?draft=${board}&rank=michael-3vp`], ["Peter", `/?draft=${board}&rank=peter-6qd`],
                ["Martin", `/?draft=${board}&rank=martin-1zs`], ["Paul", `/?draft=${board}&rank=paul-7gx`]].map(([who, path]) => (
                <div key={who} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>{who}</span>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.origin + path); setCopied(who); setTimeout(() => setCopied(""), 1500); }}
                    style={{ ...btn(copied === who ? "#7fb069" : "#3a4a34", copied === who ? "#141a12" : "#e8eee4"), fontSize: 10.5, padding: "4px 10px" }}>
                    {copied === who ? "✓ copied" : "📋 copy link"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #2c3828", position: "sticky", top: 0, background: "#141a12", zIndex: 20 }}>
        <span style={{ fontFamily: SERIF, fontSize: wide ? 20 : 16 }}>{inMock ? "🎮 Mock" : "🏈 Draft '26"}</span>
        {next ? (
          <span style={{ background: "#7fb069", color: "#141a12", borderRadius: 9, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>
            Pick {pickNo} · Rd {next.round} — {onClock}
          </span>
        ) : <span style={{ background: "#e89a3a", color: "#141a12", borderRadius: 9, padding: "4px 12px", fontWeight: 800 }}>DRAFT COMPLETE 🎉</span>}
        {!inMock && clockLeft != null && next && (
          <span style={{ background: clockLeft <= 15 ? "#d94f3d" : "#1c241a", border: "1px solid #3a4a34", color: clockLeft <= 15 ? "#fff" : "#c8e6b8",
            borderRadius: 9, padding: "4px 10px", fontWeight: 800, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            ⏱ 0:{String(clockLeft).padStart(2, "0")}
          </span>
        )}
        {personal && !inMock && <span style={{ fontSize: 11, color: "#a9bda0", fontWeight: 700 }}>🔒 {rankList.split("-")[0].toUpperCase()}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isCommish && !inMock && <button onClick={() => setMockSetup(true)} style={btn("#3a4a34")}>🎮 Mock</button>}
          {inMock && <>
            <button onClick={() => setMockSetup(true)} style={btn("#3a4a34")}>↻ New mock</button>
            <button onClick={exitMock} style={btn("#e89a3a", "#141a12")}>⏹ Exit mock</button>
          </>}
          {!inMock && <button onClick={() => setSetup(true)} style={btn("#3a4a34")} title="change my name / slot">
            {me ? `⚙ ${me.name} · ${me.slot}` : "⚙ join"}
          </button>}
          {isCommish && !inMock && <button onClick={() => setCommishOpen(true)} style={btn("#3a4a34")} title="commissioner">🛡</button>}
          {picks.length > 0 && (undoArm
            ? <>
                <button onClick={undoLast} disabled={busy} style={btn("#d94f3d")}>Confirm undo</button>
                <button onClick={() => setUndoArm(false)} style={btn("#3a4a34")}>✕</button>
              </>
            : <button onClick={() => setUndoArm(true)} style={btn("#3a4a34")}>↩ Undo</button>)}
        </span>
      </div>
      {/* YOUR TURN banner — the "what do I do now" signal */}
      {mySlot && next && next.slot === mySlot && !pending && (
        <div style={{ background: "#7fb069", color: "#141a12", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, fontWeight: 800, animation: "draftpulse 1.6s ease-in-out infinite" }}>
          <span style={{ fontSize: 15 }}>🟢 YOU'RE ON THE CLOCK — Pick {pickNo}, Rd {next.round}</span>
          {!wide && tab === "board" && (
            <button onClick={() => setTab("ranks")} style={{ ...btn("#141a12", "#c8e6b8"), marginLeft: "auto", padding: "8px 14px", fontSize: 13 }}>Pick a player →</button>
          )}
        </div>
      )}
      <style>{`@keyframes draftpulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.18); } }`}</style>
      {/* bottom drafting sheet — always under your thumb, wherever you tapped the player */}
      {pending && next && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60, background: "#1f2a1a", borderTop: "2px solid #7fb069",
          padding: "14px 16px calc(14px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 30px rgba(0,0,0,.5)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 17 }}>{pending.player}</b>
            <span style={{ color: POS_COLOR[pending.pos], fontWeight: 800 }}>{pending.pos_rank}</span>
            <span style={{ color: "#a9bda0", fontSize: 12 }}>{pending.team} · bye {pending.bye}</span>
            <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: next.slot === mySlot ? "#7fb069" : "#e89a3a" }}>
              {next.slot === mySlot ? "→ YOUR pick" : `→ drafts for ${onClock}`} · Rd {next.round}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => draftPlayer(pending)} disabled={busy}
              style={{ ...btn("#7fb069", "#141a12"), flex: 1, padding: "14px", fontSize: 16 }}>
              ✓ DRAFT {pending.player.split(" ").slice(-1)[0].toUpperCase()}
            </button>
            <button onClick={() => setPending(null)} style={{ ...btn("#3a4a34"), padding: "14px 18px", fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}
      {wide ? (
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {boardPanel}
          <div style={{ width: 400, flexShrink: 0, borderLeft: "1px solid #2c3828", maxHeight: "calc(100vh - 54px)", overflowY: "auto", position: "sticky", top: 54 }}>
            {ranksPanel}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, padding: "8px 14px 0" }}>
            {[["board", "📋 Board"], ["ranks", personal ? "⭐ My Rankings" : "📊 Available"]].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{ ...btn(tab === t ? "#7fb069" : "#3a4a34", tab === t ? "#141a12" : "#e8eee4") }}>{l}</button>
            ))}
          </div>
          {tab === "board" ? boardPanel : ranksPanel}
        </>
      )}
    </div>
  );
}
