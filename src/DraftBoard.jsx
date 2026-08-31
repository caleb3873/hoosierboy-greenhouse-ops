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
import DraftWarRoom from "./DraftWarRoom";

const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const POS_COLOR = { WR: "#2d7dd2", RB: "#2e9e4f", QB: "#d94f3d", TE: "#e89a3a", K: "#8e5cd9", "D/ST": "#6b7280" };
const LABEL_COLOR = { CORE: "#2e9e4f", VALUE: "#1fa8a0", FLIP: "#e89a3a", LOTTERY: "#8e5cd9", FADE: "#d94f3d" };
const ROUNDS = 15;
const DEFAULT_CLOCK_SECS = 60;
const NEED_TARGETS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, "D/ST": 1 };  // starting slots + 1 FLEX (RB/WR/TE)
const POS_MAX = { QB: 2, RB: 5, WR: 5, TE: 2, K: 2, "D/ST": 2 };           // hard caps from the sheet's ROSTER RULES
const TOUR = [
  ["👋 This laptop runs the draft", "Kacie — you're the draft machine. Every pick made here (or on anyone's phone) saves instantly and shows up on every screen within a second. Nothing needs refreshing, ever."],
  ["▶ Starting", "Nothing can happen until you press the green START DRAFT button in the header. Before that: set the real draft order in 🛡 with the ▲▼ arrows (it locks once picking starts), and set the pick clock length in 🛡 → Draft Settings."],
  ["🏈 Making picks", "The right panel is always the best-available list — drafted players disappear automatically. Tap a player → a popup asks Draft this player? → Yes. The popup names the team you're picking for, and the TEAM NEEDS bar above the list shows that team's roster: green ✓ = filled, amber = neglected, pulsing red = must fill now. The league's position limits are enforced — the app won't let anyone overdraft."],
  ["⏱ The clock", "Starts on every pick. At 0:00 the on-clock team automatically gets the best available player. ⏸ pauses everything (no auto-picks while paused), ▶ resumes, ↺ gives a fresh clock."],
  ["🛠 Fixing a wrong pick", "Press ⏸ pause, then tap the wrong pick's cell on the board. Search the player they actually wanted, tap to swap it in, resume. The draft order never reopens — corrections only work while paused."],
  ["📱 Remote & absent people", "Daniel and Mike B. can draft from anywhere — their links are in 🛡 → Share Links (tap 📋 to copy and text them). Their phones tell them when they're on the clock. If someone's unreachable, flip their 🤖 in 🛡 and the app drafts sensibly for them."],
  ["🏆 After the draft", "The trophy button shows every roster anytime. When it's done, copy the grading link from the 🏆 view and send it to everyone — people grade each team A+ to F and the averages show live."],
  ["🚨 If something goes wrong", "↩ Undo removes the last pick. ♻️ Restart draft (in 🛡, double-confirm) wipes everything but keeps the order and settings. Caleb's phone has all these same powers as backup. You've got this. 🌼"],
];
const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
const GRADE_PTS = Object.fromEntries(GRADES.map((g, i) => [g, GRADES.length - i]));
const avgGrade = gs => { if (!gs.length) return null; const a = gs.reduce((t, g) => t + (GRADE_PTS[g.grade] || 0), 0) / gs.length; return GRADES.reduce((best, g) => Math.abs(GRADE_PTS[g] - a) < Math.abs(GRADE_PTS[best] - a) ? g : best, "C"); };
const gradeStats = gs => {
  if (!gs.length) return null;
  const pts = gs.reduce((t, g) => t + (GRADE_PTS[g.grade] || 0), 0) / gs.length;
  const sorted = [...gs].sort((a, b) => (GRADE_PTS[b.grade] || 0) - (GRADE_PTS[a.grade] || 0));
  const hi = sorted[0], lo = sorted[sorted.length - 1];
  const names = g => { const ns = gs.filter(x => x.grade === g.grade).map(x => x.grader); return ns[0] + (ns.length > 1 ? ` +${ns.length - 1}` : ""); };
  return { pts, letter: avgGrade(gs), n: gs.length, hi, lo, hiWho: names(hi), loWho: names(lo) };
};
const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "D/ST"];
const RISK_CHIP = m => m?.injury_risk === "out" ? " 🚑" : m?.injury_risk === "risk" ? " 🩹" : "";
const OLD_CHIP = (m, pos) => (m?.age >= 30 && ["RB", "WR", "TE"].includes(pos)) ? " 👴" : "";
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
  const [toast, setToast] = useState(null);          // last pick announcement
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [warOpen, setWarOpen] = useState(false);
  const [tourStep, setTourStep] = useState(() => {
    try { return rankList === "kacie-7mv" && !localStorage.getItem("draft-tour-done") ? 0 : null; } catch { return null; }
  });
  const endTour = () => { localStorage.setItem("draft-tour-done", "1"); setTourStep(null); };
  const [editPick, setEditPick] = useState(null);    // commish: fix a placed pick {pick}
  const [editQ, setEditQ] = useState("");
  const [restartArm, setRestartArm] = useState(false);
  const gradeMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "grades";
  const [grades, setGrades] = useState([]);
  const [graderName, setGraderName] = useState(() => { try { return localStorage.getItem("draft-grader") || ""; } catch { return ""; } });
  const [recentIds, setRecentIds] = useState(new Set());
  const seenIdsRef = useRef(null);                   // null = before first load
  const [clockCfg, setClockCfg] = useState(null);   // shared pause/reset state (draft_clock)
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
  const loadGrades = async () => {
    const { data } = await sb.from("draft_grades").select("*").eq("board", board);
    setGrades(data || []);
  };
  const loadClock = async () => {
    const { data } = await sb.from("draft_clock").select("*").eq("board", activeBoard).maybeSingle();
    setClockCfg(data || null);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_clock", filter: `board=eq.${activeBoard}` }, loadClock)
      .subscribe();
    loadClock();
    if (gradeMode) loadGrades();
    pollRef.current = setInterval(() => { loadPicks(); loadSlots(); loadClock(); if (gradeMode) loadGrades(); }, 15000);
    return () => { sb.removeChannel(ch); clearInterval(pollRef.current); };
  }, [sb, activeBoard, rankList]);

  useEffect(() => {   // commish moved teams around → follow my name to its new slot
    if (!me || !slots.length || inMock) return;
    const atMine = slots.find(s => s.slot === me.slot);
    if (atMine && atMine.member === me.name) return;
    const moved = slots.find(s => s.member === me.name);
    if (moved) { const m2 = { ...me, slot: moved.slot }; setMe(m2); localStorage.setItem(meKey, JSON.stringify(m2)); }
  }, [slots, me, inMock]);
  useEffect(() => {
    const ids = new Set(picks.map(p => p.id));
    if (seenIdsRef.current === null) { seenIdsRef.current = ids; return; }   // initial load: no fanfare
    const fresh = picks.filter(p => !seenIdsRef.current.has(p.id));
    seenIdsRef.current = ids;
    if (!fresh.length) return;
    const newest = fresh.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const member = slots.find(s => s.slot === newest.slot)?.member || `Slot ${newest.slot}`;
    setToast({ ...newest, member });
    setRecentIds(prev => { const n = new Set(prev); fresh.forEach(f => n.add(`${f.round}|${f.slot}`)); return n; });
    setTimeout(() => setToast(t => (t?.id === newest.id ? null : t)), 4000);
    setTimeout(() => setRecentIds(prev => { const n = new Set(prev); fresh.forEach(f => n.delete(`${f.round}|${f.slot}`)); return n; }), 6000);
  }, [picks, slots]);
  const tokenPrefix = rankList !== "master" ? rankList.split("-")[0] : null;
  const mySlotRow = useMemo(() => tokenPrefix ? slots.find(s => s.token === tokenPrefix) : null, [slots, tokenPrefix]);
  useEffect(() => {   // personal links: identity follows the token's slot automatically
    if (!mySlotRow || inMock) return;
    if (!me || me.slot !== mySlotRow.slot) {
      const m2 = { name: mySlotRow.member, slot: mySlotRow.slot };   // adopt the slot's own team name
      setMe(m2); localStorage.setItem(meKey, JSON.stringify(m2));
      if (setupSlot !== mySlotRow.slot) setSetupSlot(mySlotRow.slot);
    }
  }, [mySlotRow, inMock]);
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
  const CLOCK_SECS = clockCfg?.clock_secs || DEFAULT_CLOCK_SECS;
  const draftStarted = inMock || !!clockCfg?.started;   // mocks are always live
  // Kacie's link is THE operator machine (Caleb 8/30: "we will draft using kacies link")
  const singleMode = !inMock && !!clockCfg?.single_mode && rankList === "kacie-7mv";
  const clockAnchor = Math.max(lastPickAt || 0, clockCfg?.anchor ? +new Date(clockCfg.anchor) : 0) || null;
  const clockPaused = !!clockCfg?.paused;
  const clockLeft = next && draftStarted && clockAnchor
    ? (clockPaused ? (clockCfg?.paused_left ?? CLOCK_SECS) : Math.max(0, CLOCK_SECS - Math.floor((nowT - clockAnchor) / 1000)))
    : null;
  async function clockAction(kind) {   // commish: pause / resume / reset — synced to every phone
    if (kind === "pause") await sb.from("draft_clock").upsert({ board: activeBoard, paused: true, paused_left: clockLeft ?? CLOCK_SECS });
    if (kind === "single") await sb.from("draft_clock").upsert({ board: activeBoard, single_mode: !clockCfg?.single_mode });
    if (kind === "start") await sb.from("draft_clock").upsert({ board: activeBoard, started: true, paused: false, anchor: new Date().toISOString(), paused_left: null });
    if (typeof kind === "number") await sb.from("draft_clock").upsert({ board: activeBoard, clock_secs: Math.max(15, Math.min(300, kind)) });
    if (kind === "resume") await sb.from("draft_clock").upsert({ board: activeBoard, paused: false, anchor: new Date(Date.now() - (CLOCK_SECS - (clockCfg?.paused_left ?? CLOCK_SECS)) * 1000).toISOString(), paused_left: null });
    if (kind === "reset") await sb.from("draft_clock").upsert({ board: activeBoard, paused: false, anchor: new Date().toISOString(), paused_left: null });
    await loadClock();
  }

  const posCountFor = (slot, pos) => picks.filter(p => p.slot === slot && p.pos === pos).length;
  const posMaxed = (slot, pos) => posCountFor(slot, pos) >= (POS_MAX[pos] ?? 99);
  async function insertPick(pl, target) {
    const { error } = await sb.from("draft_picks").insert({ board: activeBoard, round: target.round, slot: target.slot, player: pl.player, team: pl.team, pos: pl.pos });
    if (error && !/duplicate/i.test(error.message || "")) console.warn("pick failed", error.message);
    await loadPicks();
  }
  async function draftPlayer(pl) {
    if (!next || busy || !draftStarted) return;
    if (posMaxed(next.slot, pl.pos)) return;   // roster rule: position at max
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
      if (count(p.pos) >= (POS_MAX[p.pos] ?? 99)) return false;           // hard roster max
      if ((p.pos === "K" || p.pos === "D/ST") && round < 13) return false;
      if (p.pos === "K" && count("K") >= 1) return false;
      if (p.pos === "D/ST" && count("D/ST") >= 1) return false;
      if (p.pos === "QB" && count("QB") >= 1 && round < 12) return false;
      if (p.pos === "TE" && count("TE") >= 1 && round < 12) return false;
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
    if (inMock || !isCommish || !draftStarted || !next || !players.length || autoRef.current) return;
    const slotCfg = slots.find(s => s.slot === next.slot);
    const isCpu = !!slotCfg?.auto;
    const expired = clockLeft === 0 && draftStarted && !clockPaused;
    if (!isCpu && !expired) return;
    const t = setTimeout(async () => {
      if (autoRef.current) return;
      autoRef.current = true;
      const choice = choiceFor(next.slot, next.round, picks);
      if (choice) await insertPick(choice, next);
      autoRef.current = false;
    }, isCpu ? 5000 : 800);
    return () => clearTimeout(t);
  }, [next, slots, players, inMock, isCommish, clockLeft === 0, picks.length]);

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

  async function restartDraft() {
    setBusy(true);
    await sb.from("draft_picks").delete().eq("board", activeBoard);
    await sb.from("draft_clock").upsert({ board: activeBoard, started: false, paused: false, anchor: null, paused_left: null });
    await loadPicks(); await loadClock();
    setRestartArm(false); setCommishOpen(false); setBusy(false);
  }
  async function replacePick(pl) {
    if (!editPick || busy) return;
    // roster-max check excluding the pick being replaced
    const cnt = picks.filter(x => x.slot === editPick.slot && x.pos === pl.pos && x.id !== editPick.id).length;
    if (cnt >= (POS_MAX[pl.pos] ?? 99)) return;
    setBusy(true);
    await sb.from("draft_picks").update({ player: pl.player, team: pl.team, pos: pl.pos }).eq("id", editPick.id);
    await loadPicks(); setEditPick(null); setEditQ(""); setBusy(false);
  }
  async function removePick() {
    if (!editPick || busy) return;
    setBusy(true);
    await sb.from("draft_picks").delete().eq("id", editPick.id);
    await loadPicks(); setEditPick(null); setEditQ(""); setBusy(false);
  }
  async function saveSlotEdits() {
    setBusy(true);
    for (const [slot, name] of Object.entries(slotEdits)) {
      const clean = String(name).trim().toUpperCase().slice(0, 14);
      if (clean) await sb.from("draft_slots").update({ member: clean }).eq("board", activeBoard).eq("slot", +slot);
    }
    await loadSlots(); setSlotEdits({}); setBusy(false);
  }
  async function swapSlots(a, b) {   // move a TEAM between draft slots (pre-draft only)
    const sa = slots.find(s => s.slot === a), sbx = slots.find(s => s.slot === b);
    if (!sa || !sbx || busy) return;
    setBusy(true);
    await sb.from("draft_slots").update({ member: sbx.member, auto: sbx.auto, token: sbx.token }).eq("id", sa.id);
    await sb.from("draft_slots").update({ member: sa.member, auto: sa.auto, token: sa.token }).eq("id", sbx.id);
    await loadSlots(); setBusy(false);
  }
  async function toggleAuto(s) {
    await sb.from("draft_slots").update({ auto: !s.auto }).eq("id", s.id);
    await loadSlots();
  }
  async function saveSetup() {
    const slotToUse = mySlotRow ? mySlotRow.slot : setupSlot;
    if (!setupName.trim() || !slotToUse) return;
    const name = setupName.trim().toUpperCase().slice(0, 14);
    await sb.from("draft_slots").update({ member: name }).eq("board", board).eq("slot", slotToUse);
    await loadSlots();
    const m = { name, slot: slotToUse };
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
  // BEST AVAILABLE ONLY — drafted players drop off the list, ranks stay (Caleb 8/29)
  const visible = useMemo(() => {
    let v = players.filter(p =>
      !pickedNames.has(p.player) &&
      (posF === "ALL" || p.pos === posF) &&
      !hiddenTeams.has(p.team) &&
      (!q || `${p.player} ${p.team} ${p.pos}`.toLowerCase().includes(q.toLowerCase())));
    if (sortBy === "pos") v = [...v].sort((a, b) => String(a.pos).localeCompare(String(b.pos)) || a.rk - b.rk);
    if (sortBy === "team") v = [...v].sort((a, b) => String(a.team).localeCompare(String(b.team)) || a.rk - b.rk);
    return v;
  }, [players, pickedNames, posF, hiddenTeams, q, sortBy]);
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

  const upNext = useMemo(() => {
    if (!next || !slots.length) return [];
    const n = slots.length, out = [];
    const sim = picks.map(p => ({ round: p.round, slot: p.slot }));
    let cur = { ...next };
    while (cur && out.length < 6) {
      const no = (cur.round - 1) * n + (cur.round % 2 === 1 ? cur.slot : n - cur.slot + 1);
      out.push({ ...cur, no, member: slots.find(s => s.slot === cur.slot)?.member || `Slot ${cur.slot}` });
      sim.push({ round: cur.round, slot: cur.slot });
      cur = nextOpen(sim);
    }
    return out;
  }, [next, slots, picks]);
  async function submitGrade(slot, grade) {
    const name = graderName.trim().slice(0, 20);
    if (!name) return;
    localStorage.setItem("draft-grader", name);
    await sb.from("draft_grades").upsert({ board, slot, grader: name, grade }, { onConflict: "board,slot,grader" });
    await loadGrades();
  }
  const rosterCard = (s, withGrading) => {
    const roster = picks.filter(p => p.slot === s.slot)
      .sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || a.round - b.round);
    const teamGrades = grades.filter(g => g.slot === s.slot);
    const mine = teamGrades.find(g => g.grader === graderName.trim());
    const avg = avgGrade(teamGrades);
    return (
      <div key={s.slot} style={{ background: "#1c241a", border: "1px solid #2c3828", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: "2px solid #3a4a34", paddingBottom: 5, marginBottom: 6 }}>
          <b style={{ fontSize: 14, color: "#c8e6b8" }}>{s.member}</b>
          <span style={{ fontSize: 10, color: "#7a8c74" }}>slot {s.slot}</span>
          {avg && <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 16, color: "#7fb069" }}>{avg}<span style={{ fontSize: 9, color: "#7a8c74" }}> ({teamGrades.length})</span></span>}
        </div>
        {teamGrades.length > 0 && (() => {
          const st = gradeStats(teamGrades);
          const split = st.hi.grade !== st.lo.grade;   // only color hi/lo when opinions actually differ
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {[...teamGrades].sort((a, b) => (GRADE_PTS[b.grade] || 0) - (GRADE_PTS[a.grade] || 0)).map(g => {
                const isHi = split && g.grade === st.hi.grade, isLo = split && g.grade === st.lo.grade;
                return (
                  <span key={g.grader} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 20, background: "#141a12",
                    border: `1px solid ${isHi ? "#7fb069" : isLo ? "#d94f3d" : "#2c3828"}`,
                    color: isHi ? "#c8e6b8" : isLo ? "#e8a89d" : "#a9bda0" }}>
                    {g.grader} <b style={{ color: isHi ? "#7fb069" : isLo ? "#d94f3d" : "#e8eee4" }}>{g.grade}</b>
                  </span>
                );
              })}
            </div>
          );
        })()}
        {roster.map(p => (
          <div key={p.id} style={{ display: "flex", gap: 6, fontSize: 11.5, padding: "2px 0" }}>
            <span style={{ width: 34, fontWeight: 800, color: POS_COLOR[p.pos] || "#fff" }}>{p.pos}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{p.player}</span>
            <span style={{ color: "#7a8c74", fontSize: 10 }}>Rd {p.round}</span>
          </div>
        ))}
        {!roster.length && <div style={{ color: "#5a6a54", fontSize: 11 }}>no picks yet</div>}
        {withGrading && roster.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 8 }}>
            {GRADES.map(g => (
              <button key={g} onClick={() => submitGrade(s.slot, g)} disabled={!graderName.trim()}
                style={{ ...btn(mine?.grade === g ? "#7fb069" : "#141a12", mine?.grade === g ? "#141a12" : "#a9bda0"),
                  border: "1px solid #2c3828", padding: "5px 8px", fontSize: 11, opacity: graderName.trim() ? 1 : .4 }}>{g}</button>
            ))}
          </div>
        )}
      </div>
    );
  };
  const leaderboard = () => {
    const ranked = slots.map(s => ({ s, st: gradeStats(grades.filter(g => g.slot === s.slot)) }))
      .filter(r => r.st).sort((a, b) => b.st.pts - a.st.pts || b.st.n - a.st.n);
    if (!ranked.length) return null;
    return (
      <div style={{ background: "#1c241a", border: "1px solid #3a4a34", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: SERIF, fontSize: 19 }}>📊 Consensus board</span>
          <span style={{ fontSize: 10.5, color: "#7a8c74" }}>ranked by average grade — updates as votes come in</span>
        </div>
        {ranked.map((r, i) => (
          <div key={r.s.slot} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? "1px solid #232d1f" : "none" }}>
            <span style={{ width: 28, textAlign: "center", fontSize: i < 3 ? 17 : 12, fontWeight: 800, color: "#7a8c74", flexShrink: 0 }}>{["🥇", "🥈", "🥉"][i] || i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ fontSize: 13.5, color: i === 0 ? "#e8c547" : "#c8e6b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.s.member}</b>
                <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 17, color: i === 0 ? "#e8c547" : ranked.length > 1 && i === ranked.length - 1 ? "#d94f3d" : "#7fb069", flexShrink: 0 }}>
                  {r.st.letter}<span style={{ fontSize: 9.5, fontWeight: 600, color: "#7a8c74" }}> ({r.st.n})</span>
                </span>
              </div>
              <div style={{ height: 7, background: "#141a12", borderRadius: 4, overflow: "hidden", margin: "4px 0 3px" }}>
                <div style={{ width: `${Math.round((r.st.pts / GRADES.length) * 100)}%`, height: "100%", borderRadius: 4,
                  background: i === 0 ? "#e8c547" : ranked.length > 1 && i === ranked.length - 1 ? "#d94f3d" : "#7fb069" }} />
              </div>
              <div style={{ fontSize: 10.5, color: "#a9bda0" }}>
                {r.st.hi.grade === r.st.lo.grade
                  ? <span>everyone says <b style={{ color: "#e8eee4" }}>{r.st.hi.grade}</b></span>
                  : <span>high <b style={{ color: "#7fb069" }}>{r.st.hi.grade}</b> — {r.st.hiWho} &nbsp;·&nbsp; low <b style={{ color: "#d94f3d" }}>{r.st.lo.grade}</b> — {r.st.loWho}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  const rosterNeeds = slot => {
    if (!slot) return null;
    const roster = picks.filter(p => p.slot === slot);
    const counts = {};
    roster.forEach(p => { counts[p.pos] = (counts[p.pos] || 0) + 1; });
    const base = {}, extra = {};
    Object.keys(NEED_TARGETS).forEach(pos => {
      base[pos] = Math.min(counts[pos] || 0, NEED_TARGETS[pos]);
      extra[pos] = Math.max(0, (counts[pos] || 0) - NEED_TARGETS[pos]);
    });
    const flexUsed = Math.min(1, (extra.RB || 0) + (extra.WR || 0) + (extra.TE || 0));
    const unfilled = Object.keys(NEED_TARGETS).reduce((a, pos) => a + (NEED_TARGETS[pos] - base[pos]), 0) + (1 - flexUsed);
    const startersTotal = Object.values(NEED_TARGETS).reduce((a, b) => a + b, 0) + 1;
    const filledRatio = (startersTotal - unfilled) / startersTotal;
    const remaining = ROUNDS - roster.length;
    return { base, flexUsed, unfilled, filledRatio, remaining, roster, totals: counts };
  };
  const needsBar = slot => {
    const n = rosterNeeds(slot);
    if (!n) return null;
    const member = slots.find(s => s.slot === slot)?.member || `Slot ${slot}`;
    const chip = (label, have, want) => {
      const missing = want - have;
      const urgent = missing > 0 && n.remaining <= n.unfilled;            // must fill NOW
      const neglect = missing > 0 && n.filledRatio >= 0.6;               // everything else is filling up
      const done = missing <= 0;
      return (
        <span key={label} style={{ padding: "3px 8px", borderRadius: 7, fontSize: 11, fontWeight: 800,
          background: urgent ? "#d94f3d" : neglect ? "#e89a3a" : done ? "#2e9e4f33" : "#1c241a",
          color: urgent || neglect ? "#141a12" : done ? "#7fb069" : "#a9bda0",
          border: done ? "1px solid #2e9e4f55" : "1px solid #2c3828",
          animation: urgent ? "draftpulse 1.2s ease-in-out infinite" : "none" }}>
          {label} {have}/{want}{done ? "✓" : ""}
          <span style={{ opacity: .75, fontWeight: 700 }}> · {(n.totals && n.totals[label]) || 0}/{POS_MAX[label] ?? "-"}</span>
        </span>
      );
    };
    return (
      <div style={{ background: "#1f2a1a", border: "1px solid #3a4a34", borderRadius: 12, padding: "8px 12px", marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", marginBottom: 5 }}>
          {singleMode ? `TEAM NEEDS — ${member}` : "MY ROSTER"} · {n.remaining} picks left
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {Object.keys(NEED_TARGETS).map(pos => chip(pos, n.base[pos], NEED_TARGETS[pos]))}
          {chip("FLEX", n.flexUsed, 1)}
          <span style={{ padding: "3px 8px", borderRadius: 7, fontSize: 11, fontWeight: 700, color: "#7a8c74", border: "1px solid #2c3828" }}>
            bench {Math.max(0, n.roster.length - (9 - n.unfilled))}/6
          </span>
        </div>
      </div>
    );
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
                      animation: p && recentIds.has(`${r}|${s.slot}`) ? "cellpop .5s ease-out" : "none",
                      boxShadow: p && recentIds.has(`${r}|${s.slot}`) ? "0 0 14px #7fb069aa" : "none",
                    }} onClick={() => { if (p && isCommish && !inMock && clockPaused) { setEditPick(p); setEditQ(""); } }}
                    title={p && isCommish && !inMock ? (clockPaused ? "commissioner: tap to change this pick" : "pause the clock to change picks") : undefined}>
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
      {(singleMode ? next?.slot : mySlot) ? needsBar(singleMode ? next.slot : mySlot) : null}
      {!singleMode && myPicks.length > 0 && (
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
        <button onClick={() => setPosView(v => { localStorage.setItem("draft-posview", v ? "0" : "1"); return !v; })} style={btn(posView ? "#7fb069" : "#3a4a34", posView ? "#141a12" : "#e8eee4")}>
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
                {col.filter(p => !pickedNames.has(p.player)).slice(0, pos === "K" || pos === "D/ST" ? 12 : 40).map((p, i) => {
                  const m = metrics[p.player];
                  return (
                    <div key={p.id} onClick={() => next && draftStarted && setPending(p)}
                      style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "4px 4px", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
                      <span style={{ width: 22, textAlign: "right", fontSize: 10, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.player}{personal && m?.colts ? " 🏠" : ""}{personal ? RISK_CHIP(m) : ""}{personal ? OLD_CHIP(m, p.pos) : ""}
                      </span>
                      {isCommish && m?.label && <span style={{ fontSize: 7.5, fontWeight: 800, color: LABEL_COLOR[m.label] || "#a9bda0" }}>{m.label}</span>}
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
        const m = metrics[p.player];
        const newTier = sortBy === "rank" && (i === 0 || visible[i - 1].tier !== p.tier);
        const newGroup = sortBy !== "rank" && (i === 0 || visible[i - 1][sortBy === "pos" ? "pos" : "team"] !== p[sortBy === "pos" ? "pos" : "team"]);
        return (
          <div key={p.id}>
            {newTier && posF === "ALL" && !q && <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", margin: "10px 0 3px", letterSpacing: 1 }}>TIER {p.tier}</div>}
            {newGroup && <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", margin: "10px 0 3px", letterSpacing: 1 }}>{sortBy === "pos" ? p.pos : p.team}</div>}
            <div onClick={() => next && draftStarted && setPending(p)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, marginBottom: 2, cursor: "pointer",
                background: "#212b1d", border: "1px solid #2c3828" }}>
              <span style={{ width: 28, textAlign: "right", fontSize: 11, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{p.rk}</span>
              <span style={{ width: 40, fontWeight: 800, fontSize: 11, color: POS_COLOR[p.pos] || "#fff" }}>{p.pos_rank}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {p.player}{personal && m?.colts ? " 🏠" : ""}{personal ? RISK_CHIP(m) : ""}{personal ? OLD_CHIP(m, p.pos) : ""}
                </span>
                {isCommish && m?.label &&
                  <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: (LABEL_COLOR[m.label] || "#3a4a34") + "33", color: LABEL_COLOR[m.label] || "#a9bda0" }}>{m.label}</span>}
                {isCommish && m?.adp != null && +m.adp - p.rk >= 8 &&
                  <span style={{ marginLeft: 5, fontSize: 8.5, color: "#1fa8a0", fontWeight: 800 }}>▼{Math.round(+m.adp - p.rk)} vs ADP</span>}
                {isCommish && m?.note &&
                  <div style={{ fontSize: 9.5, color: "#8ba183", lineHeight: 1.3, marginTop: 1 }}>{m.note}</div>}
              </span>
              <span style={{ fontSize: 10.5, color: "#a9bda0", whiteSpace: "nowrap" }}>{p.team} · bye {p.bye}{personal && m?.age ? ` · ${m.age}y` : ""}</span>
              {personal && (
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

  if (gradeMode) return (
    <div style={{ fontFamily: FONT, background: "#141a12", color: "#e8eee4", minHeight: "100vh", padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontFamily: SERIF, fontSize: 26, marginBottom: 2 }}>🏆 Draft '26 — grade the teams</div>
        <div style={{ fontSize: 12.5, color: "#a9bda0", marginBottom: 12 }}>Put your name in, then hand out grades. One grade per team per person — tap again to change it. Your name shows next to your grade, so own it.</div>
        <input value={graderName} onChange={e => setGraderName(e.target.value)} placeholder="your name"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px solid #3a4a34", background: "#1c241a", color: "#e8eee4", fontFamily: FONT, fontSize: 16, fontWeight: 700, marginBottom: 14, width: 240 }} />
        {leaderboard()}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {slots.map(s => rosterCard(s, true))}
        </div>
      </div>
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
            {mySlotRow ? (
              <div style={{ background: "#141a12", border: "1px solid #3a4a34", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#7fb069" }}>You draft from slot {mySlotRow.slot}</div>
                <div style={{ fontSize: 11, color: "#a9bda0", marginTop: 2 }}>Your picks: {snakePicksFor(mySlotRow.slot).slice(0, 6).join(", ")}…</div>
              </div>
            ) : (<>
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
            </>)}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveSetup} disabled={!setupName.trim() || (!setupSlot && !mySlotRow)}
                style={{ ...btn(setupName.trim() && (setupSlot || mySlotRow) ? "#7fb069" : "#3a4a34", setupName.trim() && (setupSlot || mySlotRow) ? "#141a12" : "#7a8c74"), flex: 1, padding: "12px", fontSize: 14 }}>
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
      {tourStep !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "#141a12ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1f2a1a", border: "1px solid #7fb069", borderRadius: 16, padding: 24, maxWidth: 460, width: "100%" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", marginBottom: 8 }}>HOW THE DRAFT WORKS · {tourStep + 1} / {TOUR.length}</div>
            <div style={{ fontFamily: SERIF, fontSize: 21, marginBottom: 8 }}>{TOUR[tourStep][0]}</div>
            <div style={{ fontSize: 13.5, color: "#c9d6c0", lineHeight: 1.55, marginBottom: 18 }}>{TOUR[tourStep][1]}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {tourStep > 0 && <button onClick={() => setTourStep(s => s - 1)} style={{ ...btn("#3a4a34"), padding: "11px 16px" }}>← Back</button>}
              {tourStep < TOUR.length - 1
                ? <button onClick={() => setTourStep(s => s + 1)} style={{ ...btn("#7fb069", "#141a12"), flex: 1, padding: "11px" }}>Next →</button>
                : <button onClick={endTour} style={{ ...btn("#7fb069", "#141a12"), flex: 1, padding: "11px" }}>✓ Got it — let's draft</button>}
              <button onClick={endTour} style={{ ...btn("#3a4a34"), padding: "11px 14px" }}>Skip</button>
            </div>
          </div>
        </div>
      )}
      {editPick && (
        <div onClick={() => setEditPick(null)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "#141a12dd", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1f2a1a", border: "2px solid #e89a3a", borderRadius: 16, padding: 20, maxWidth: 400, width: "100%" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: "#e89a3a", marginBottom: 6 }}>
              🛡 FIX PICK — Rd {editPick.round} · {slots.find(s => s.slot === editPick.slot)?.member}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 20, marginBottom: 10 }}>{editPick.player} <span style={{ fontSize: 13, color: POS_COLOR[editPick.pos] }}>{editPick.pos}</span></div>
            <input value={editQ} onChange={e => setEditQ(e.target.value)} placeholder="search replacement…" autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #3a4a34", background: "#141a12", color: "#e8eee4", fontFamily: FONT, fontSize: 16, marginBottom: 8 }} />
            {editQ.trim() && (
              <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>
                {players.filter(pl => !pickedNames.has(pl.player) && pl.player.toLowerCase().includes(editQ.trim().toLowerCase())).slice(0, 8).map(pl => {
                  const cnt = picks.filter(x => x.slot === editPick.slot && x.pos === pl.pos && x.id !== editPick.id).length;
                  const blocked = cnt >= (POS_MAX[pl.pos] ?? 99);
                  return (
                    <div key={pl.id} onClick={() => !blocked && replacePick(pl)}
                      style={{ display: "flex", gap: 8, padding: "7px 8px", borderRadius: 8, cursor: blocked ? "default" : "pointer", opacity: blocked ? .4 : 1, background: "#212b1d", marginBottom: 3 }}>
                      <b style={{ color: POS_COLOR[pl.pos] || "#fff", width: 38, fontSize: 11 }}>{pl.pos_rank}</b>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{pl.player}</span>
                      <span style={{ fontSize: 10.5, color: "#7a8c74" }}>{blocked ? "pos max" : pl.team}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: "#a9bda0", marginBottom: 8 }}>Clock is paused — search the player they actually wanted, tap to swap it in, then resume. The draft order never moves.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditPick(null)} style={{ ...btn("#3a4a34"), flex: 1, padding: "11px" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {teamsOpen && (
        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SERIF, fontSize: 20 }}>🏆 Teams</span>
            {isCommish && (
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?draft=${board}&view=grades`); setCopied("grades"); setTimeout(() => setCopied(""), 1500); }}
                style={btn(copied === "grades" ? "#7fb069" : "#3a4a34", copied === "grades" ? "#141a12" : "#e8eee4")}>
                {copied === "grades" ? "✓ copied" : "📋 copy grading link"}
              </button>
            )}
            <button onClick={() => setTeamsOpen(false)} style={{ ...btn("#3a4a34"), marginLeft: "auto" }}>✕ close</button>
          </div>
          {leaderboard()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {slots.map(s => rosterCard(s, false))}
          </div>
        </div>
      )}
      {!teamsOpen && commishOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#141a12ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1f2a1a", border: "1px solid #3a4a34", borderRadius: 16, padding: 22, maxWidth: 420, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontFamily: SERIF, fontSize: 20, marginBottom: 4 }}>🛡 Commissioner</div>
            <div style={{ fontSize: 11.5, color: "#a9bda0", marginBottom: 12 }}>Fix names, 🤖 autodraft absentees, ▲▼ set the draft order (locked once picking starts). Anyone whose slot moves should re-tap ⚙ on their phone.</div>
            {slots.map(s => (
              <div key={s.slot} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 22, textAlign: "right", fontWeight: 800, fontSize: 12, color: "#7a8c74" }}>{s.slot}</span>
                <input value={slotEdits[s.slot] ?? s.member} onChange={e => setSlotEdits(o => ({ ...o, [s.slot]: e.target.value }))}
                  style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${slotEdits[s.slot] != null && slotEdits[s.slot] !== s.member ? "#7fb069" : "#3a4a34"}`, background: "#141a12", color: "#e8eee4", fontFamily: FONT, fontSize: 16, fontWeight: 700 }} />
                <button onClick={() => toggleAuto(s)} title={s.auto ? "autodraft ON — tap to hand control back" : "autodraft OFF — tap to draft for them"}
                  style={{ ...btn(s.auto ? "#7fb069" : "#3a4a34", s.auto ? "#141a12" : "#e8eee4"), padding: "8px 10px" }}>🤖</button>
                {picks.length === 0 && <>
                  <button onClick={() => swapSlots(s.slot, s.slot - 1)} disabled={busy || s.slot === 1} style={{ ...btn("#3a4a34"), padding: "8px 8px", opacity: s.slot === 1 ? .3 : 1 }}>▲</button>
                  <button onClick={() => swapSlots(s.slot, s.slot + 1)} disabled={busy || s.slot === slots.length} style={{ ...btn("#3a4a34"), padding: "8px 8px", opacity: s.slot === slots.length ? .3 : 1 }}>▼</button>
                </>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveSlotEdits} disabled={busy || !Object.keys(slotEdits).length}
                style={{ ...btn(Object.keys(slotEdits).length ? "#7fb069" : "#3a4a34", Object.keys(slotEdits).length ? "#141a12" : "#7a8c74"), flex: 1, padding: "11px" }}>✓ Save names</button>
              <button onClick={() => { setSlotEdits({}); setCommishOpen(false); }} style={{ ...btn("#3a4a34"), padding: "11px" }}>Close</button>
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74", margin: "16px 0 6px" }}>DRAFT SETTINGS</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>💻 Single-computer mode</span>
              <button onClick={() => clockAction("single")}
                style={{ ...btn(clockCfg?.single_mode ? "#7fb069" : "#3a4a34", clockCfg?.single_mode ? "#141a12" : "#e8eee4"), padding: "8px 14px" }}>
                {clockCfg?.single_mode ? "ON" : "OFF"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#7a8c74", marginBottom: 8, lineHeight: 1.4 }}>One machine runs the whole draft: needs bar follows the on-clock team, every pick confirms as that team, no per-phone identity.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>⏱ Pick clock</span>
              <button onClick={() => clockAction((clockCfg?.clock_secs || 60) - 15)} style={{ ...btn("#3a4a34"), padding: "8px 12px" }}>−15s</button>
              <span style={{ fontWeight: 800, fontSize: 14, minWidth: 44, textAlign: "center" }}>{clockCfg?.clock_secs || 60}s</span>
              <button onClick={() => clockAction((clockCfg?.clock_secs || 60) + 15)} style={{ ...btn("#3a4a34"), padding: "8px 12px" }}>+15s</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>♻️ Restart draft</span>
              {restartArm
                ? <>
                    <button onClick={restartDraft} disabled={busy} style={btn("#d94f3d")}>Wipe {picks.length} picks — confirm</button>
                    <button onClick={() => setRestartArm(false)} style={btn("#3a4a34")}>✕</button>
                  </>
                : <button onClick={() => setRestartArm(true)} style={{ ...btn("#3a4a34"), padding: "8px 14px" }}>RESTART…</button>}
            </div>
            <div style={{ fontSize: 10, color: "#7a8c74", marginBottom: 8, lineHeight: 1.4 }}>Deletes every pick and returns to "not started". Slots, order, and settings stay.</div>
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
        {!draftStarted && next ? (
          <span style={{ background: "#1c241a", border: "1px solid #3a4a34", color: "#a9bda0", borderRadius: 9, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>
            ⏳ Draft not started
          </span>
        ) : next ? (
          <span style={{ background: "#7fb069", color: "#141a12", borderRadius: 9, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>
            Pick {pickNo} · Rd {next.round} — {onClock}
          </span>
        ) : <span style={{ background: "#e89a3a", color: "#141a12", borderRadius: 9, padding: "4px 12px", fontWeight: 800 }}>DRAFT COMPLETE 🎉</span>}
        {!draftStarted && isCommish && !inMock && next && (
          <button onClick={() => clockAction("start")} style={{ ...btn("#7fb069", "#141a12"), padding: "8px 18px", fontSize: 14, animation: "draftpulse 1.6s ease-in-out infinite" }}>
            ▶ START DRAFT
          </button>
        )}
        {!inMock && clockLeft != null && next && (
          <span style={{ background: clockPaused ? "#e89a3a" : clockLeft <= 15 ? "#d94f3d" : "#1c241a", border: "1px solid #3a4a34",
            color: clockPaused ? "#141a12" : clockLeft <= 15 ? "#fff" : "#c8e6b8",
            borderRadius: 9, padding: "4px 10px", fontWeight: 800, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {clockPaused ? "⏸" : "⏱"} 0:{String(clockLeft).padStart(2, "0")}{clockPaused ? " paused" : ""}
          </span>
        )}
        {!inMock && isCommish && draftStarted && next && (
          <span style={{ display: "flex", gap: 4 }}>
            {clockPaused
              ? <button onClick={() => clockAction("resume")} style={btn("#7fb069", "#141a12")}>▶ resume</button>
              : <button onClick={() => clockAction("pause")} style={btn("#3a4a34")}>⏸</button>}
            <button onClick={() => clockAction("reset")} style={btn("#3a4a34")} title="restart the 60s clock">↺</button>
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
          {isCommish && <button onClick={() => setWarOpen(true)} style={btn("#3a4a34")} title="war room — table, queue, recommendations">⚡</button>}
          {!inMock && <button onClick={() => { setTeamsOpen(v => !v); loadGrades(); }} style={btn(teamsOpen ? "#7fb069" : "#3a4a34", teamsOpen ? "#141a12" : "#e8eee4")} title="all rosters">🏆</button>}
          {isCommish && !inMock && <button onClick={() => setCommishOpen(true)} style={btn("#3a4a34")} title="commissioner">🛡</button>}
          {isCommish && !inMock && <button onClick={() => setTourStep(0)} style={btn("#3a4a34")} title="how it all works">❓</button>}
          {picks.length > 0 && (undoArm
            ? <>
                <button onClick={undoLast} disabled={busy} style={btn("#d94f3d")}>Confirm undo</button>
                <button onClick={() => setUndoArm(false)} style={btn("#3a4a34")}>✕</button>
              </>
            : <button onClick={() => setUndoArm(true)} style={btn("#3a4a34")}>↩ Undo</button>)}
        </span>
      </div>
      {/* YOUR TURN banner — the "what do I do now" signal */}
      {!singleMode && mySlot && next && next.slot === mySlot && !pending && (
        <div style={{ background: "#7fb069", color: "#141a12", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, fontWeight: 800, animation: "draftpulse 1.6s ease-in-out infinite" }}>
          <span style={{ fontSize: 15 }}>🟢 YOU'RE ON THE CLOCK — Pick {pickNo}, Rd {next.round}</span>
          {!wide && tab === "board" && (
            <button onClick={() => setTab("ranks")} style={{ ...btn("#141a12", "#c8e6b8"), marginLeft: "auto", padding: "8px 14px", fontSize: 13 }}>Pick a player →</button>
          )}
        </div>
      )}
      <style>{`@keyframes draftpulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.18); } } @keyframes cellpop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } } @keyframes toastin { from { transform: translateY(-16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      {toast && (
        <div style={{ position: "fixed", top: 58, left: "50%", transform: "translateX(-50%)", zIndex: 80, animation: "toastin .3s ease-out",
          background: POS_COLOR[toast.pos] || "#7fb069", color: "#fff", borderRadius: 12, padding: "10px 18px",
          boxShadow: "0 10px 30px rgba(0,0,0,.55)", display: "flex", alignItems: "center", gap: 10, maxWidth: "92vw" }}>
          <span style={{ fontSize: 18 }}>🏈</span>
          <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {toast.member} drafts {toast.player}
            <span style={{ opacity: .85, fontWeight: 700, fontSize: 12 }}> · {toast.pos} {toast.team} · Rd {toast.round}</span>
          </span>
        </div>
      )}
      {next && upNext.length > 0 && draftStarted && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "7px 14px", borderBottom: "1px solid #2c3828", overflowX: "auto", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#7a8c74" }}>UP NEXT</span>
          {upNext.map((u, i) => (
            <span key={u.no} style={{ fontSize: 11.5, fontWeight: i === 0 ? 800 : 600, borderRadius: 7, padding: "3px 9px",
              background: i === 0 ? "#7fb069" : u.slot === mySlot ? "#1fa8a033" : "#1c241a",
              color: i === 0 ? "#141a12" : u.slot === mySlot ? "#1fa8a0" : "#a9bda0",
              border: i === 0 ? "none" : "1px solid #2c3828" }}>
              {u.no}. {u.member}
            </span>
          ))}
        </div>
      )}
      {/* draft confirm popup — dead center, yes or no, nothing to scroll */}
      {pending && next && (
        <div onClick={() => setPending(null)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "#141a12dd", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1f2a1a", border: "2px solid #7fb069", borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: (singleMode || next.slot === mySlot) ? "#7fb069" : "#e89a3a", marginBottom: 8 }}>
              {next.slot === mySlot ? "YOUR PICK" : `DRAFTING FOR ${String(onClock).toUpperCase()}`} · RD {next.round}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 24, marginBottom: 2 }}>{pending.player}</div>
            <div style={{ fontSize: 13, color: "#a9bda0", marginBottom: 4 }}>
              <b style={{ color: POS_COLOR[pending.pos] || "#fff" }}>{pending.pos_rank}</b> · {pending.team} · bye {pending.bye}{personal && metrics[pending.player]?.age ? ` · ${metrics[pending.player].age}y` : ""}{personal ? RISK_CHIP(metrics[pending.player]) : ""}{personal ? OLD_CHIP(metrics[pending.player], pending.pos) : ""}
            </div>
            {isCommish && metrics[pending.player]?.note &&
              <div style={{ fontSize: 10.5, color: "#8ba183", lineHeight: 1.35, marginBottom: 6 }}>{metrics[pending.player].note}</div>}
            {posMaxed(next.slot, pending.pos) && (
              <div style={{ background: "#d94f3d", color: "#fff", borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontWeight: 800, marginBottom: 10 }}>
                ⛔ {onClock} already has {posCountFor(next.slot, pending.pos)} {pending.pos}s — league max is {POS_MAX[pending.pos]}
              </div>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 14px" }}>Draft this player?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => draftPlayer(pending)} disabled={busy || posMaxed(next.slot, pending.pos)}
                style={{ ...btn(posMaxed(next.slot, pending.pos) ? "#3a4a34" : "#7fb069", posMaxed(next.slot, pending.pos) ? "#7a8c74" : "#141a12"), flex: 1, padding: "15px", fontSize: 16 }}>✓ Yes, draft</button>
              <button onClick={() => setPending(null)} style={{ ...btn("#3a4a34"), flex: 1, padding: "15px", fontSize: 16 }}>✕ No</button>
            </div>
          </div>
        </div>
      )}
      {warOpen ? (
        <DraftWarRoom players={players} metrics={metrics} picks={picks} slots={slots} mySlot={mySlot}
          next={next} pickNo={pickNo} onClock={onClock} myPicks={(() => {
            if (!mySlot || !slots.length) return [];
            const n = slots.length, out = [];
            for (let r = 1; r <= ROUNDS; r++) {
              const no = (r - 1) * n + (r % 2 === 1 ? mySlot : n - mySlot + 1);
              if (!grid[`${r}|${mySlot}`]) out.push({ round: r, no });
            }
            return out;
          })()} pickedNames={pickedNames} roundsTotal={ROUNDS}
          onSelect={p => { if (next && draftStarted) setPending(p); }} onClose={() => setWarOpen(false)} />
      ) : wide ? (
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
