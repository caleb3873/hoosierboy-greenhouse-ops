import { useState, useMemo, useEffect, useRef } from "react";
import { useManagerTasks, useVacationRequests, useAnnouncements, useHrMessages, useBrehobItems, useFloorCodes2, useDriverRequests, getSupabase } from "./supabase";
import { VacationRequestModal, OutThisWeekBanner, VacationRequestsInboxModal, isVacationApprover } from "./Vacation";
import { AnnouncementBanner, AnnouncementComposerModal, AnnouncementPopup, useAnnouncementPopup, canPostAnnouncement } from "./Announcements";
import { HrComposeModal, HrInbox, isHrInboxOwner } from "./HrMessages";
import { useAuth } from "./Auth";
import { BrehobManagerView } from "./BrehobList";
import { DriverRequestModal, DriverRequestStatusList, useDriverResponsePopup, DriverResponsePopup, DriverScheduleView, DriverRequestsSubPage } from "./DriverRequest";
import { FacilityPicker, FacilityHistoryView, facilityLabel } from "./Facilities";
import HouseDetail from "./HouseDetail";
import { ReceivingWeekSummary, aggregateFallReceivingForWeek } from "./Receiving";
import { useFallProgramItems } from "./supabase";
import { getCurrentWeek } from "./shared";
import { NotificationBanner } from "./PushNotifications";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

// ── Photo helpers ───────────────────────────────────────────────────────────
// Photos are stored in Supabase storage bucket 'task-photos'.
// The `photos` JSONB array on manager_tasks stores storage paths (new) or
// data URLs (legacy). TaskPhoto component handles both.
export async function uploadTaskPhoto(file) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const ts = Date.now();
  const ext = (file.name || "photo.jpg").split(".").pop() || "jpg";
  const path = `${ts}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("task-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}

export function TaskPhoto({ src, onRemove, size = 90 }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!src) return;
    if (src.startsWith("data:") || src.startsWith("http")) { setUrl(src); return; }
    const sb = getSupabase();
    if (!sb) return;
    sb.storage.from("task-photos").createSignedUrl(src, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [src]);
  return (
    <div style={{ position: "relative" }}>
      {url ? (
        <img src={url} alt="" style={{ width: size, height: size, objectFit: "cover", borderRadius: 10, border: "1.5px solid #e0ead8" }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: 10, background: "#f0f5ee", display: "flex", alignItems: "center", justifyContent: "center", color: "#7a8c74", fontSize: 11 }}>...</div>
      )}
      {onRemove && (
        <button onClick={onRemove}
          style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>&times;</button>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Production sub-types — derived from title prefix (emoji + verb) since the schema
// has no explicit subType column. Manual tasks fall under "other".
const PROD_TYPES = [
  { id: "all",      label: "All",     emoji: "" },
  { id: "sow",      label: "Sowing",  emoji: "🌱" },
  { id: "stick",    label: "Prop",    emoji: "🌱" },
  { id: "potfill",  label: "Pot Fill", emoji: "📦" },
  { id: "planting", label: "Plant",   emoji: "🌿" },
  { id: "tags",     label: "Tags",    emoji: "🏷" },
];
function getProdType(title) {
  if (!title) return "other";
  if (title.includes("🌱")) {
    if (title.includes("Sow ")) return "sow";
    if (title.includes("Stick ")) return "stick";
    return "sow";
  }
  if (title.includes("📦")) return "potfill";
  if (title.includes("🌿")) return "planting";
  if (title.includes("🏷")) return "tags";
  return "other";
}

// Monday of ISO week N in year Y
function weekMonday(year, week) {
  const jan4 = new Date(year, 0, 4);
  const startOfWeek = new Date(jan4);
  startOfWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const monday = new Date(startOfWeek);
  monday.setDate(startOfWeek.getDate() + (week - 1) * 7);
  return monday;
}

// Stable UUID-shaped ID for an auto watch task. Prefix "c" (for caretaker / watch) is a
// valid hex digit so Postgres accepts it as a UUID; it also still distinguishes from
// Fall Program push tasks ("f") so re-sync cleanup leaves these alone.
function watchTaskId(year, week, type) {
  const str = `watch|${year}|${week}|${type}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `c${hex.slice(0,7)}-${hex.slice(0,4)}-4${hex.slice(1,4)}-a${hex.slice(2,5)}-${hex.padEnd(12, "0").slice(0,12)}`;
}

// Extract the variety name from a prop task title like "🌱 Sow 200 MARIGOLD INCA GOLD — 2 105-cell hex trays (90% germ)"
function extractPropVariety(title) {
  if (!title) return null;
  // strip emoji + verb + qty, capture variety up to the first em-dash or parenthesis
  const m = title.match(/(?:Sow|Stick)\s+[\d,]+\s+(.+?)(?:\s+URCs?)?(?:\s+—|\s+\(|$)/);
  return m ? m[1].trim() : null;
}

// Extract the tray count from "— 2 105-cell …" or "— 2 50-cell …"
function extractTrayCount(title) {
  if (!title) return 0;
  const m = title.match(/—\s*(\d+)\s+\d+-cell/i);
  return m ? parseInt(m[1], 10) : 0;
}

// Alphabetical sort key — for sow/stick tasks use the variety (so "Marigold" doesn't
// land before "Zinnia" because of qty), otherwise use the title with the leading emoji stripped.
function taskSortKey(t) {
  const title = t.title || "";
  const v = extractPropVariety(title);
  if (v) return v.toUpperCase();
  return title.replace(/^[\u{1F300}-\u{1FAFF}\s]+/u, "").toUpperCase();
}

function getWeekInfo(date = new Date()) {
  const year = date.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.ceil((date - s) / (7 * 86400000));
  return { week, year };
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toISODate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Compute a target date from a bucket name based on today
export function bucketToDate(bucket, from = new Date()) {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  if (bucket === "today")          return toISODate(today);
  if (bucket === "tomorrow")       return toISODate(addDays(today, 1));
  if (bucket === "check_tomorrow") return toISODate(addDays(today, 2));
  if (bucket === "this_week") {
    // End of current week (Saturday)
    const day = today.getDay();
    const offset = day === 0 ? 6 : 6 - day;
    return toISODate(addDays(today, offset));
  }
  return toISODate(today);
}

export function formatTargetDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  const short = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diff === 0) return `Today • ${short}`;
  if (diff === 1) return `Tomorrow • ${short}`;
  if (diff === -1) return `Yesterday • ${short}`;
  return short;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MANAGER VIEW ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function ManagerTasksView({ onSwitchMode, onBackToApp, canCreateGrowing = true, defaultCategory, isAsstManager = false }) {
  const { rows: tasks, upsert, remove, refresh } = useManagerTasks();
  const { displayName, isAdmin } = useAuth();

  // Human-readable label for a category code, used on the asst-manager hub
  // "Tasks" card subtitle ("My Tasks · Production · Done").
  function deptLabel(cat) {
    if (cat === "production") return "Production";
    if (cat === "growing") return "Growing";
    if (cat === "maintenance") return "Maintenance";
    if (cat === "sales") return "Sales";
    return "My dept";
  }

  // Any manager-tier user landing in this view can assign or reassign tasks.
  // (The view itself is gated to managers + asst managers + Reese; the assignee
  // dropdown is restricted to managers + asst managers + Paul/Tyler.)
  const canAssign = useMemo(() => !!displayName, [displayName]);

  // Eligible assignees: the manager tier (manager + assistant_manager +
  // operations_manager). Workers and drivers excluded per spec. Pulled live
  // from floor_codes — keyed off the `role` column, which is the source of
  // truth now that all manager-tier rows are tagged consistently.
  const { rows: floorCodesForAssign } = useFloorCodes2();
  const ASSIGNEES = useMemo(() => {
    const eligibleRoles = new Set(["manager", "assistant_manager", "operations_manager"]);
    const seen = new Set();
    const out = [];
    for (const fc of (floorCodesForAssign || [])) {
      if (!fc.active || !fc.workerName) continue;
      if (!eligibleRoles.has((fc.role || "").toLowerCase())) continue;
      const firstName = fc.workerName.split(/\s+/)[0];
      if (seen.has(firstName)) continue;
      seen.add(firstName);
      out.push({ key: firstName, label: firstName, dept: fc.staffGroup || fc.department || null });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }, [floorCodesForAssign]);

  const [assigningTaskId, setAssigningTaskId] = useState(null);

  // Tyler-only priority reorder on the Maintenance All Tasks tab. Swaps
  // priorities with the neighbor in the rendered list (which is already sorted
  // priority-desc). Doesn't reach into other categories or weeks.
  async function reorderTask(task, direction) {
    const peers = visibleTasks.filter(t => t.status !== "completed");
    const idx = peers.findIndex(t => t.id === task.id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= peers.length) return;
    const neighbor = peers[targetIdx];
    const a = task.priority || 0;
    const b = neighbor.priority || 0;
    // Use temp value to avoid unique constraint collisions if any
    await upsert({ ...task, priority: b });
    await upsert({ ...neighbor, priority: a });
    refresh();
  }

  async function assignTaskTo(task, name) {
    // Stamp assignedAt whenever the assignee changes (or is set fresh) so the
    // Done-tab history can show "Assigned May 14 · Done May 18".
    const next = name && name !== task.assignedTo
      ? { ...task, assignedTo: name, assignedAt: new Date().toISOString() }
      : { ...task, assignedTo: name };
    await upsert(next);
    setAssigningTaskId(null);
    refresh();
  }

  const today = useMemo(() => getWeekInfo(), []);
  const [selectedWeek, setSelectedWeek] = useState(today);
  const [category, setCategory] = useState(defaultCategory || (canCreateGrowing ? "growing" : "production")); // production | growing | brehob
  const [statusFilter, setStatusFilter] = useState("pending"); // all | pending | completed
  // Asst-manager tabs: simplified to My Tasks / [Dept] Tasks / Done
  const [asstTab, setAsstTab] = useState("dept");
  // Search box on tasks page — filters visibleTasks by title (current week only).
  const [searchQuery, setSearchQuery] = useState("");
  // Sales sub-tab (Fundraising | Wholesale) when category === "sales"
  const [salesTab, setSalesTab] = useState("fundraising");

  // Tyler is the maintenance task planner. He defaults to the Houses (facility
  // picker) view; everyone else lands on the prioritized All Tasks list and
  // can't reorder.
  const isTyler = useMemo(() => /\btyler\b/i.test(displayName || ""), [displayName]);
  // 'all' | 'houses' | 'done' — maintenance sub-tab. Selected facility (if any)
  // drives the focused list. Reset facility when leaving Houses tab.
  const [maintTab, setMaintTab] = useState(isTyler ? "houses" : "all");
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [locationFilter, setLocationFilter] = useState("all"); // all | bluff | sprague
  const [prodTypeFilter, setProdTypeFilter] = useState(() => {
    try { return localStorage.getItem("gh_mgr_prod_type") || "all"; } catch { return "all"; }
  });
  useEffect(() => {
    try { localStorage.setItem("gh_mgr_prod_type", prodTypeFilter); } catch {}
  }, [prodTypeFilter]);

  // Default task location based on who's logged in
  const defaultLocation = useMemo(() => {
    const name = (displayName || "").toLowerCase();
    if (name.includes("reese") || name.includes("amanda")) return "sprague";
    if (name.includes("paul")) return "bluff";
    return "bluff"; // default for others
  }, [displayName]);

  // Amanda's tasks get tagged for the Houseplants team automatically.
  // The task still lives in its normal production sub-tab (Pot Fill, Planting, etc) — the tag is just a label.
  const defaultTeam = useMemo(() => {
    const name = (displayName || "").toLowerCase();
    return name.includes("amanda") ? "houseplants" : null;
  }, [displayName]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(null);
  const [decliningRequest, setDecliningRequest] = useState(null);
  const [showOverdue, setShowOverdue] = useState(false);
  // Hub-first navigation. "hub" is the mobile home grid; the rest are focused sub-pages.
  const [currentView, setCurrentView] = useState("hub"); // hub | tasks | vacation | messages | today | week | hr-inbox
  const [showHrCompose, setShowHrCompose] = useState(false);
  const [showAssigned, setShowAssigned] = useState(false);
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [showVacationInbox, setShowVacationInbox] = useState(false);
  const [showAnnouncer, setShowAnnouncer] = useState(false);
  const [showDriverRequest, setShowDriverRequest] = useState(false);
  const { rows: vacationReqs } = useVacationRequests();
  const { rows: announcements } = useAnnouncements();
  const { rows: hrMessages } = useHrMessages();
  const { rows: brehobItems } = useBrehobItems();
  const canApproveVacation = isVacationApprover(displayName);
  const canAnnounce = canPostAnnouncement(displayName);
  const isTrish = isHrInboxOwner(displayName);
  const isAnyManager = !!displayName; // every floor-code user gets the Today/Week shortcut
  const pendingVacations = useMemo(() => (vacationReqs || []).filter(v => v.status === "pending"), [vacationReqs]);
  const { rows: driverReqRows } = useDriverRequests();
  const pendingDriverRequests = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (driverReqRows || []).filter(r => r.status === "pending" && r.deliveryDate >= today);
  }, [driverReqRows]);

  // Receiving this week — pull from fall_program_items (where ship_week =
  // "WEEK NN"). The same aggregator the receiving sub-page uses.
  const { rows: fallProgramItemsForReceiving } = useFallProgramItems();
  const receivingThisWeek = useMemo(() => {
    const wk = getCurrentWeek();
    const { totalArriving, lineCount } = aggregateFallReceivingForWeek(fallProgramItemsForReceiving || [], wk);
    return { lineCount, plantTotal: totalArriving };
  }, [fallProgramItemsForReceiving]);
  const activeAnnouncements = useMemo(() => (announcements || []).filter(a => a.active && (!a.expiresAt || new Date(a.expiresAt) > new Date())), [announcements]);
  const unreadHrMessages = useMemo(() => (hrMessages || []).filter(m => !m.archived && !m.readAt), [hrMessages]);
  const announcementPopup = useAnnouncementPopup();
  const driverResponsePopup = useDriverResponsePopup();
  const autoOpenedRef = useRef(false);
  const overdueCheckedRef = useRef(false);
  const assignedCheckedRef = useRef(false);

  const pendingRequests = useMemo(() => tasks.filter(t => t.status === "requested"), [tasks]);

  // Overdue scope: this user's category default + any carryover. Surfaces once per session per user.
  const overdueTasks = useMemo(() =>
    tasks.filter(t =>
      t.status !== "completed" &&
      t.status !== "requested" &&
      t.carriedOver === true &&
      t.year === today.year &&
      t.weekNumber === today.week
    ).sort((a, b) => (b.priority || 0) - (a.priority || 0)),
  [tasks, today]);

  // Tasks assigned to me this week, not finished. Pops every login until they're done.
  const assignedToMe = useMemo(() => {
    if (!displayName) return [];
    const firstName = displayName.split(" ")[0];
    return tasks.filter(t =>
      t.assignedTo === firstName &&
      t.year === today.year &&
      t.weekNumber === today.week &&
      t.status !== "completed" &&
      t.status !== "rejected" &&
      t.status !== "requested"
    ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [tasks, displayName, today]);

  // Auto-open requests modal on first load if there are any
  useEffect(() => {
    if (!autoOpenedRef.current && pendingRequests.length > 0) {
      autoOpenedRef.current = true;
      setShowRequests(true);
    }
  }, [pendingRequests.length]);

  // Auto-open overdue modal once per session if anything is overdue.
  // Waits a tick so the carryover effect has a chance to settle.
  useEffect(() => {
    if (overdueCheckedRef.current) return;
    if (!tasks.length) return;
    const sessionKey = `gh_overdue_seen_${displayName || "anon"}_${today.year}w${today.week}`;
    if (sessionStorage.getItem(sessionKey)) {
      overdueCheckedRef.current = true;
      return;
    }
    const id = setTimeout(() => {
      if (overdueTasks.length > 0) {
        setShowOverdue(true);
        sessionStorage.setItem(sessionKey, "1");
      }
      overdueCheckedRef.current = true;
    }, 500);
    return () => clearTimeout(id);
  }, [tasks.length, overdueTasks.length, displayName, today.year, today.week]);

  // Auto-open "tasks assigned to me" modal once per session. Stays in sessionStorage so it
  // doesn't re-fire on every re-render — but reappears next login until the work is done.
  useEffect(() => {
    if (assignedCheckedRef.current) return;
    if (!tasks.length) return;
    const sessionKey = `gh_assigned_seen_${displayName || "anon"}_${today.year}w${today.week}`;
    if (sessionStorage.getItem(sessionKey)) {
      assignedCheckedRef.current = true;
      return;
    }
    const id = setTimeout(() => {
      if (assignedToMe.length > 0) {
        setShowAssigned(true);
        sessionStorage.setItem(sessionKey, "1");
      }
      assignedCheckedRef.current = true;
    }, 600);
    return () => clearTimeout(id);
  }, [tasks.length, assignedToMe.length, displayName, today.year, today.week]);

  // Filter + sort by priority (higher = more important = on top)
  const visibleTasks = useMemo(() => {
    const firstName = (displayName || "").split(" ")[0];
    let r;
    if (isAsstManager) {
      // Asst managers see a department-scoped view with three tabs:
      //   mine = anything assigned to me in this week (any category)
      //   dept = my department tasks (not completed) this week
      //   done = my department tasks completed this week
      if (asstTab === "mine") {
        r = tasks.filter(t =>
          t.assignedTo === firstName &&
          t.status !== "requested" && t.status !== "rejected" && t.status !== "completed" &&
          t.year === selectedWeek.year && t.weekNumber === selectedWeek.week
        );
      } else if (asstTab === "done") {
        r = tasks.filter(t =>
          (t.category || "production") === (defaultCategory || "production") &&
          t.status === "completed" &&
          t.year === selectedWeek.year && t.weekNumber === selectedWeek.week
        );
      } else {
        r = tasks.filter(t =>
          (t.category || "production") === (defaultCategory || "production") &&
          t.status !== "requested" && t.status !== "rejected" && t.status !== "completed" &&
          t.year === selectedWeek.year && t.weekNumber === selectedWeek.week
        );
      }
    } else if (category === "maintenance") {
      // Maintenance is week-agnostic — Tyler plans repairs as backlog, not by
      // sow-week. Show all open maintenance + filter to the selected facility
      // when drilling in from the Houses tab.
      r = tasks.filter(t => t.status !== "requested" && t.status !== "rejected" && (t.category || "production") === "maintenance");
      if (selectedFacility) r = r.filter(t => t.facility === selectedFacility);
      if (statusFilter === "pending") r = r.filter(t => t.status !== "completed");
      else if (statusFilter === "completed") r = r.filter(t => t.status === "completed");
    } else {
      r = tasks.filter(t => t.status !== "requested" && t.status !== "rejected" && t.year === selectedWeek.year && t.weekNumber === selectedWeek.week && (t.category || "production") === category);
      if (statusFilter === "pending") r = r.filter(t => t.status !== "completed");
      else if (statusFilter === "completed") r = r.filter(t => t.status === "completed");
    }
    if (locationFilter !== "all") r = r.filter(t => (t.location || "").toLowerCase() === locationFilter);
    if (category === "production" && prodTypeFilter !== "all") {
      r = r.filter(t => getProdType(t.title) === prodTypeFilter);
    }
    if (category === "sales") {
      r = r.filter(t => (t.salesType || "fundraising") === salesTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      r = r.filter(t => (t.title || "").toLowerCase().includes(q));
    }
    // Priority desc (manual reorder wins) → variety alphabetical (so sowing Marigold lands before Zinnia regardless of qty)
    return [...r].sort((a, b) =>
      (b.priority || 0) - (a.priority || 0) ||
      taskSortKey(a).localeCompare(taskSortKey(b), undefined, { numeric: true })
    );
  }, [tasks, selectedWeek, statusFilter, category, locationFilter, prodTypeFilter, isAsstManager, asstTab, defaultCategory, displayName, selectedFacility, salesTab, searchQuery]);

  const canCreateInCurrentCategory = category === "production" || category === "sales" || canCreateGrowing;

  async function createTask(title, bucket = "today", location) {
    if (!title.trim()) return;
    const maxPriority = Math.max(0, ...tasks.filter(t => t.year === today.year && t.weekNumber === today.week && (t.category || "production") === category).map(t => t.priority || 0));
    // Maintenance tasks default to Gerry (full-time maintenance role). Other
    // categories auto-assign to the creator — they can reassign via the inline
    // picker. "Manager" stays unassigned (no real creator name yet).
    const firstName = (displayName || "").split(/\s+/)[0];
    let assignedTo = firstName && firstName !== "Manager" ? firstName : null;
    if (category === "maintenance") assignedTo = "Gerry";
    // Amanda's pot-filling requests auto-route to Sam (head of pot filling).
    // Detected by 📦 emoji prefix the VoiceRecorderModal stamps when
    // "Pot Filling" is selected as the task type.
    if (category === "production" && title.trim().startsWith("📦") && /AMANDA/i.test(displayName || "")) {
      assignedTo = "Sam";
    }
    await upsert({
      id: crypto.randomUUID(),
      title: title.trim(),
      priority: maxPriority + 10,
      weekNumber: today.week,
      year: today.year,
      status: "pending",
      category,
      // Auto-tag facility when creating from a focused facility view in Maintenance
      facility: category === "maintenance" && selectedFacility ? selectedFacility : null,
      // Sales sub-tab — stamp fundraising / wholesale so the right tab picks it up
      salesType: category === "sales" ? salesTab : null,
      bucket,
      targetDate: bucketToDate(bucket),
      carriedOver: false,
      createdBy: displayName || "Manager",
      assignedTo,
      assignedAt: assignedTo ? new Date().toISOString() : null,
      location: location || defaultLocation,
      team: defaultTeam,
      photos: [],
    });
    setShowRecorder(false);
    refresh();
    // Notify growers of new task
    fetch("/api/notify-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "task_created", title: title.trim(), category, bucket }),
    }).catch(() => {});
  }

  const [completingTask, setCompletingTask] = useState(null);

  async function toggleComplete(task) {
    const completed = task.status === "completed";
    if (!completed) {
      // Prompt for notes/photo
      setCompletingTask(task);
      return;
    }
    await upsert({
      ...task,
      status: "pending",
      completedBy: null,
      completedAt: null,
    });
    refresh();
  }

  async function approveRequest(request, { bucket, targetDate }) {
    const jan4 = new Date(new Date(targetDate + "T00:00:00").getFullYear(), 0, 4);
    const s = new Date(jan4);
    s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const dt = new Date(targetDate + "T00:00:00");
    const week = Math.ceil((dt - s) / (7 * 86400000));
    const year = dt.getFullYear();
    const maxPriority = Math.max(0, ...tasks.filter(t => t.year === year && t.weekNumber === week && (t.category || "production") === (request.category || "growing")).map(t => t.priority || 0));
    await upsert({
      ...request,
      status: "pending",
      bucket,
      targetDate,
      weekNumber: week,
      year,
      priority: maxPriority + 10,
      declineReason: null,
      decisionSeen: false,
    });
    setApprovingRequest(null);
    refresh();
    // Notify the requester their task was approved
    fetch("/api/notify-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "task_approved", title: request.title, requester: request.createdBy }),
    }).catch(() => {});
  }

  async function declineRequest(request, reason) {
    await upsert({
      ...request,
      status: "rejected",
      declineReason: reason || "(no reason given)",
      decisionSeen: false,
    });
    setDecliningRequest(null);
    refresh();
  }

  async function finishCompletion(notes, photo) {
    if (!completingTask) return;
    const photos = photo ? [...(completingTask.photos || []), photo] : (completingTask.photos || []);
    const combinedNotes = notes ? ((completingTask.notes ? completingTask.notes + "\n" : "") + notes) : completingTask.notes;
    await upsert({
      ...completingTask,
      status: "completed",
      completedBy: displayName || "Manager",
      completedAt: new Date().toISOString(),
      notes: combinedNotes,
      photos,
    });
    setCompletingTask(null);
    refresh();
  }

  // ── CARRYOVER: move pending tasks from prior weeks into current week, refresh target_date ──
  useEffect(() => {
    if (!tasks.length) return;
    const todayISO = new Date().toISOString().slice(0, 10);
    tasks.forEach(t => {
      if (t.status === "completed" || t.status === "requested") return;
      const stale = t.year < today.year || (t.year === today.year && t.weekNumber < today.week);
      const needsTargetDate = !t.targetDate;
      const staleDate = t.targetDate && t.targetDate < todayISO && (t.bucket === "today" || t.bucket === "tomorrow" || t.bucket === "check_tomorrow");
      if (stale || needsTargetDate || staleDate) {
        const patch = { ...t };
        if (stale) { patch.year = today.year; patch.weekNumber = today.week; patch.carriedOver = true; }
        if (needsTargetDate || staleDate) patch.targetDate = bucketToDate(t.bucket || "today");
        upsert(patch).catch(err => console.warn("Carryover upsert failed:", err));
      }
    });
  }, [tasks.length]); // eslint-disable-line

  // ── AUTO WATCH TASK: when all sow/stick tasks for a given week complete, create a
  // Sprague growing task to monitor germination/establishment. Fires once per group
  // (deterministic ID prevents duplicates). Does not re-create if the manager deletes it.
  useEffect(() => {
    if (!tasks.length) return;
    const todayISO = new Date().toISOString().slice(0, 10);

    // Group production sow & stick tasks by (year, week, type)
    const groups = {};
    for (const t of tasks) {
      if ((t.category || "production") !== "production") continue;
      const type = getProdType(t.title);
      if (type !== "sow" && type !== "stick") continue;
      const key = `${t.year}|${t.weekNumber}|${type}`;
      if (!groups[key]) groups[key] = { year: t.year, week: t.weekNumber, type, tasks: [] };
      groups[key].tasks.push(t);
    }

    for (const g of Object.values(groups)) {
      if (g.tasks.length === 0) continue;
      const allDone = g.tasks.every(t => t.status === "completed");
      if (!allDone) continue;

      const id = watchTaskId(g.year, g.week, g.type);
      if (tasks.some(t => t.id === id)) continue; // already created (or kept after deletion if we ever add tombstones)

      const sowMonday = weekMonday(g.year, g.week);
      const dateLabel = sowMonday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const verb = g.type === "sow" ? "sowing" : "URC";
      // Per-variety tray counts (variety order = first appearance in the task list)
      const perVariety = [];
      const seen = new Set();
      let totalTrays = 0;
      for (const t of g.tasks) {
        const v = extractPropVariety(t.title);
        const trays = extractTrayCount(t.title);
        totalTrays += trays;
        if (v && !seen.has(v)) { seen.add(v); perVariety.push({ variety: v, trays }); }
      }
      const trayLabel = `${totalTrays} tray${totalTrays !== 1 ? "s" : ""}`;
      const title = `🔍 Watch ${verb} group — Wk ${g.week} (${dateLabel}) · ${trayLabel}`;
      const verbAction = g.type === "sow"
        ? "Monitor germination, water as needed, check for damping off."
        : "Monitor URC establishment, watch for wilt, mist as needed.";
      const description =
        `Auto-created when all ${verb} tasks for Wk ${g.week} (${dateLabel}) finished.\n` +
        `${verbAction}\n\n` +
        `TOTAL TRAYS: ${totalTrays}\n\n` +
        `VARIETIES (${perVariety.length}):\n${perVariety.map(v => `  • ${v.variety}${v.trays ? ` — ${v.trays} tray${v.trays !== 1 ? "s" : ""}` : ""}`).join("\n")}`;

      upsert({
        id,
        title,
        description,
        category: "growing",
        location: "sprague",
        year: today.year,
        weekNumber: today.week,
        bucket: "today",
        targetDate: todayISO,
        status: "pending",
        priority: 60,
        createdBy: "Sowing Watch (auto)",
        photos: [],
      }).catch(err => console.warn("Watch task upsert failed:", err));
    }
  }, [tasks]); // eslint-disable-line

  async function moveTask(task, direction) {
    const sameWeek = visibleTasks;
    const idx = sameWeek.findIndex(t => t.id === task.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameWeek.length) return;
    const other = sameWeek[swapIdx];
    await upsert({ ...task, priority: other.priority });
    await upsert({ ...other, priority: task.priority });
    refresh();
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await remove(task.id);
    if (selectedTask?.id === task.id) setSelectedTask(null);
  }

  function changeWeek(delta) {
    let w = selectedWeek.week + delta;
    let y = selectedWeek.year;
    if (w < 1) { w = 52; y--; }
    if (w > 52) { w = 1; y++; }
    setSelectedWeek({ week: w, year: y });
  }

  const isCurrentWeek = selectedWeek.week === today.week && selectedWeek.year === today.year;

  if (selectedTask) {
    return <TaskDetail task={selectedTask} onBack={() => setSelectedTask(null)} onSave={async t => { await upsert(t); refresh(); setSelectedTask(null); }} />;
  }

  function renderTaskCard(t, idx) {
    const isDone = t.status === "completed";
    const isOverdue = !!t.carriedOver && !isDone;
    // Pull " · ⚠ {text}" alerts out of the title so they render as a chip instead of inline text
    const alertMatch = (t.title || "").match(/\s·\s⚠\s(.+?)$/);
    const displayTitle = alertMatch ? t.title.replace(alertMatch[0], "") : t.title;
    const alertText = alertMatch ? alertMatch[1] : null;
    return (
      <div key={t.id} style={{
        background: "#fff", borderRadius: 14,
        border: `1.5px solid ${isOverdue ? "#d94f3d" : isDone ? "#c8d8c0" : "#e0ead8"}`,
        boxShadow: isOverdue ? "0 0 0 2px rgba(217,79,61,0.15)" : "none",
        padding: "14px 16px", marginBottom: 10, opacity: isDone ? 0.65 : 1,
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button onClick={() => moveTask(t, "up")} disabled={idx === 0 || isDone}
              style={{ background: "none", border: "none", color: idx === 0 || isDone ? "#d0d8cc" : "#7a8c74", fontSize: 16, cursor: idx === 0 || isDone ? "default" : "pointer", padding: "2px 6px" }}>&#9650;</button>
            <button onClick={() => moveTask(t, "down")} disabled={idx === visibleTasks.length - 1 || isDone}
              style={{ background: "none", border: "none", color: idx === visibleTasks.length - 1 || isDone ? "#d0d8cc" : "#7a8c74", fontSize: 16, cursor: idx === visibleTasks.length - 1 || isDone ? "default" : "pointer", padding: "2px 6px" }}>&#9660;</button>
          </div>
          <button onClick={() => toggleComplete(t)}
            style={{
              width: 28, height: 28, minWidth: 28, borderRadius: 8,
              border: `2px solid #7fb069`, background: isDone ? "#7fb069" : "#fff",
              color: "#1e2d1a", fontSize: 16, fontWeight: 800, cursor: "pointer", padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{isDone ? "✓" : ""}</button>
          <div style={{ flex: 1 }} onClick={() => setSelectedTask(t)}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: isOverdue ? "#d94f3d" : "#1e2d1a", textDecoration: isDone ? "line-through" : "none" }}>{displayTitle}</div>
              {alertText && (
                <span style={{ background: "#fff3c4", color: "#7a5a00", border: "1.5px solid #e89a3a", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>⚠ {alertText}</span>
              )}
              {isOverdue && <span style={{ background: "#d94f3d", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>OVERDUE</span>}
              {(t.createdBy || "").includes("Production Schedule") && (
                <span style={{ background: "#8e44ad", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🍂 Fall Program</span>
              )}
              {(t.createdBy || "").includes("Sowing Watch") && (
                <span style={{ background: "#1a8a8a", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🔍 Auto Watch</span>
              )}
              {t.team === "houseplants" && (
                <span style={{ background: "#7fb069", color: "#1e2d1a", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🪴 Houseplants</span>
              )}
              {t.claimedBy && !isDone && (
                <span style={{ background: "#e89a3a", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🔒 {t.claimedBy}</span>
              )}
              {t.assignedTo && (
                <span style={{ background: "#4a90d9", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>👤 {t.assignedTo}</span>
              )}
            </div>
            {t.targetDate && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2, fontWeight: 600 }}>📅 {formatTargetDate(t.targetDate)}</div>}
            {t.description && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>{t.description}</div>}
            {(t.photos || []).length > 0 && <div style={{ fontSize: 11, color: "#4a90d9", marginTop: 4 }}>📷 {t.photos.length} photo{t.photos.length !== 1 ? "s" : ""}</div>}
            {t.notes && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4, fontStyle: "italic" }}>📝 {t.notes}</div>}
            {isDone && (
              <div style={{ fontSize: 11, color: "#4a7a35", marginTop: 4 }}>
                ✓ {t.completedBy} — {formatTime(t.completedAt)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <button onClick={() => deleteTask(t)}
              style={{ background: "none", border: "none", color: "#8a9a80", fontSize: 18, cursor: "pointer", padding: 4 }} title="Delete task">🗑</button>
            {/* Tyler-only priority reorder on Maintenance All Tasks. Hidden in
                facility-filtered views, Houses tab without facility, or Done. */}
            {isTyler && category === "maintenance" && maintTab === "all" && !isDone && (
              <div style={{ display: "flex", gap: 3 }}>
                <button onClick={(e) => { e.stopPropagation(); reorderTask(t, "up"); }}
                  style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 6, padding: "2px 8px", fontSize: 13, fontWeight: 800, color: "#1e2d1a", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}
                  title="Move up">▲</button>
                <button onClick={(e) => { e.stopPropagation(); reorderTask(t, "down"); }}
                  style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 6, padding: "2px 8px", fontSize: 13, fontWeight: 800, color: "#1e2d1a", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}
                  title="Move down">▼</button>
              </div>
            )}
            {canAssign && !isDone && (
              <button onClick={(e) => { e.stopPropagation(); setAssigningTaskId(prev => prev === t.id ? null : t.id); }}
                style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#4a90d9", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                title="Assign this task to someone">
                👤 Assign
              </button>
            )}
          </div>
        </div>

        {/* Inline assign picker — opens just below this task when "Assign" is tapped */}
        {canAssign && assigningTaskId === t.id && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1.5px dashed #c8d8c0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 4 }}>Assign to:</span>
            {ASSIGNEES.map(a => {
              const isCurrent = (t.assignedTo || "") === a.key;
              return (
                <button key={a.key} onClick={() => assignTaskTo(t, a.key)}
                  style={{
                    background: isCurrent ? "#4a90d9" : "#fff",
                    color: isCurrent ? "#fff" : "#4a90d9",
                    border: `1.5px solid #4a90d9`,
                    borderRadius: 999, padding: "6px 14px",
                    fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {isCurrent ? "✓ " : ""}{a.label}
                </button>
              );
            })}
            {t.assignedTo && (
              <button onClick={() => assignTaskTo(t, null)}
                style={{ background: "#fff", border: "1.5px solid #d94f3d", color: "#d94f3d", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Unassign
              </button>
            )}
            <button onClick={() => setAssigningTaskId(null)}
              style={{ background: "transparent", border: "none", color: "#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
              Close
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        @media (max-width: 640px) {
          .mtv-header-title { font-size: 18px !important; }
          .mtv-header-buttons { gap: 4px !important; }
          .mtv-header-buttons button { padding: 6px 9px !important; font-size: 11px !important; }
          .mtv-header-buttons .label-text { display: none !important; }
          .mtv-category-tabs button { padding: 10px 6px !important; font-size: 12px !important; }
          .mtv-filter-row { padding-left: 14px !important; padding-right: 14px !important; }
          .mtv-filter-row button { padding: 8px 4px !important; font-size: 11px !important; }
          .mtv-week-selector { padding: 8px 14px !important; }
        }
        .hub-card { background: #fff; border-radius: 16px; border: 1.5px solid #e0ead8; padding: 16px; cursor: pointer; transition: transform 0.08s, box-shadow 0.08s; }
        .hub-card:active { transform: scale(0.98); }
        .hub-card .hub-card-emoji { font-size: 28px; line-height: 1; }
        .hub-card .hub-card-title { font-size: 16px; font-weight: 800; color: #1e2d1a; margin-top: 6px; }
        .hub-card .hub-card-sub { font-size: 12px; color: #7a8c74; margin-top: 4px; }
        .hub-card .hub-card-badge { display: inline-block; background: #d94f3d; color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; margin-top: 6px; }
        .hub-card .hub-card-badge.warn { background: #e89a3a; }
        .hub-card .hub-card-badge.ok { background: #7fb069; }
      `}</style>

      {/* ── HUB HOME ─────────────────────────────────────────────────────── */}
      {currentView === "hub" && (() => {
        const todayIso = new Date().toISOString().slice(0,10);
        const tasksToday = (cat) => tasks.filter(t =>
          (t.category || "production") === cat &&
          t.status !== "completed" && t.status !== "requested" && t.status !== "rejected" &&
          (t.targetDate === todayIso || (t.bucket === "today"))
        ).length;
        const overdueIn = (cat) => tasks.filter(t =>
          (t.category || "production") === cat && t.carriedOver && t.status !== "completed"
        ).length;
        const requestsIn = (cat) => tasks.filter(t =>
          (t.category || "production") === cat && t.status === "requested"
        ).length;
        const goToTasks = (cat) => {
          setCategory(cat);
          setSelectedWeek(today); // always reset to current week when entering from the hub
          setSearchQuery("");
          setCurrentView("tasks");
        };
        return (
          <>
            <div style={{ background: "#1e2d1a", padding: "12px 14px", color: "#c8e6b8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Floor View</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hi {(displayName || "").split(" ")[0] || "there"}</div>
                  <div style={{ fontSize: 10, color: "#7a9a6a", marginTop: 2 }}>Week {today.week}, {today.year}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <HeaderIconButton
                    emoji="📥"
                    title={isTrish ? "HR Inbox" : "Requests + announcements"}
                    badge={(isTrish ? unreadHrMessages.length : 0) + pendingRequests.length}
                    onClick={() => setCurrentView(isTrish ? "hr-inbox" : "messages")}
                  />
                  <button onClick={onSwitchMode} title="Log out"
                    style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "8px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↩</button>
                </div>
              </div>
            </div>
            <AnnouncementBanner />
            <OutThisWeekBanner />

            {isAsstManager ? (
              /* ── ASSISTANT MANAGER HUB — simplified, 4 main cards ── */
              <div style={{ padding: "14px 14px 80px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="hub-card" onClick={() => { setCategory(defaultCategory || "production"); setCurrentView("tasks"); }}
                  style={{ gridColumn: "span 2", borderTopColor: "#7fb069", borderTopWidth: 4, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span style={{ fontSize: 32 }}>🌱</span>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>Tasks</div>
                        <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>
                          {assignedToMe.length > 0 ? `${assignedToMe.length} assigned to you` : `My Tasks · ${deptLabel(defaultCategory)} · Done`}
                        </div>
                      </div>
                    </div>
                    {assignedToMe.length > 0 && <span className="hub-card-badge">{assignedToMe.length}</span>}
                  </div>
                </div>

                <div className="hub-card" onClick={() => setShowDriverRequest(true)} style={{ gridColumn: "span 2", borderTopColor: "#4a90d9", borderTopWidth: 4, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <span style={{ fontSize: 28 }}>🚛</span>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a" }}>Driver Request</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>Pick date + driver</div>
                      </div>
                    </div>
                    {pendingDriverRequests.length > 0 && <span className="hub-card-badge warn">{pendingDriverRequests.length} pending</span>}
                  </div>
                </div>

                <div className="hub-card" onClick={() => setCurrentView("vacation")} style={{ borderTopColor: "#7fb069", borderTopWidth: 4, padding: 18 }}>
                  <div className="hub-card-emoji" style={{ fontSize: 28 }}>🌴</div>
                  <div className="hub-card-title" style={{ fontSize: 15 }}>Vacation</div>
                  <div className="hub-card-sub">Request time off</div>
                </div>

                <div className="hub-card" onClick={() => setShowHrCompose(true)} style={{ borderTopColor: "#8e44ad", borderTopWidth: 4, padding: 18 }}>
                  <div className="hub-card-emoji" style={{ fontSize: 28 }}>✉</div>
                  <div className="hub-card-title" style={{ fontSize: 15 }}>Message Trish</div>
                  <div className="hub-card-sub">HR · questions</div>
                </div>
              </div>
            ) : (
              /* ── FULL MANAGER HUB — unchanged ── */
              <div style={{ padding: "14px 14px 80px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {/* Production */}
                <div className="hub-card" onClick={() => goToTasks("production")} style={{ borderTopColor: "#7fb069", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">🌱</div>
                  <div className="hub-card-title">Production</div>
                  <div className="hub-card-sub">{tasksToday("production")} today</div>
                  {overdueIn("production") > 0 && <span className="hub-card-badge">{overdueIn("production")} overdue</span>}
                  {requestsIn("production") > 0 && overdueIn("production") === 0 && <span className="hub-card-badge warn">{requestsIn("production")} request{requestsIn("production") !== 1 ? "s" : ""}</span>}
                </div>

                {/* Growing */}
                <div className="hub-card" onClick={() => goToTasks("growing")} style={{ borderTopColor: "#4a90d9", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">🌿</div>
                  <div className="hub-card-title">Growing</div>
                  <div className="hub-card-sub">{tasksToday("growing")} today</div>
                  {overdueIn("growing") > 0 && <span className="hub-card-badge">{overdueIn("growing")} overdue</span>}
                  {requestsIn("growing") > 0 && overdueIn("growing") === 0 && <span className="hub-card-badge warn">{requestsIn("growing")} request{requestsIn("growing") !== 1 ? "s" : ""}</span>}
                </div>

                {/* Maintenance */}
                <div className="hub-card" onClick={() => goToTasks("maintenance")} style={{ borderTopColor: "#e89a3a", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">🔧</div>
                  <div className="hub-card-title">Maintenance</div>
                  <div className="hub-card-sub">{tasksToday("maintenance")} today</div>
                  {overdueIn("maintenance") > 0 && <span className="hub-card-badge">{overdueIn("maintenance")} overdue</span>}
                </div>

                {/* Sales — Fundraising + Wholesale tabs inside */}
                <div className="hub-card" onClick={() => { setSalesTab("fundraising"); goToTasks("sales"); }} style={{ borderTopColor: "#8e44ad", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">💼</div>
                  <div className="hub-card-title">Sales</div>
                  <div className="hub-card-sub">{tasksToday("sales")} today · Fundraising / Wholesale</div>
                  {overdueIn("sales") > 0 && <span className="hub-card-badge">{overdueIn("sales")} overdue</span>}
                  {requestsIn("sales") > 0 && overdueIn("sales") === 0 && <span className="hub-card-badge warn">{requestsIn("sales")} request{requestsIn("sales") !== 1 ? "s" : ""}</span>}
                </div>

                {/* Vacation */}
                <div className="hub-card" onClick={() => setCurrentView("vacation")} style={{ borderTopColor: "#7fb069", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">🌴</div>
                  <div className="hub-card-title">Vacation</div>
                  <div className="hub-card-sub">{canApproveVacation ? "Approve · request · view" : "Request time off"}</div>
                  {canApproveVacation && pendingVacations.length > 0 && <span className="hub-card-badge warn">{pendingVacations.length} pending</span>}
                </div>

                {/* Company Announcement */}
                <div className="hub-card"
                  onClick={() => canAnnounce ? setShowAnnouncer(true) : setCurrentView("messages")}
                  style={{ borderTopColor: "#7fb069", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">📢</div>
                  <div className="hub-card-title">Company Announcement</div>
                  <div className="hub-card-sub">
                    {canAnnounce
                      ? (activeAnnouncements.length > 0 ? `Post or view (${activeAnnouncements.length} active)` : "Post to all staff")
                      : (activeAnnouncements.length > 0 ? `${activeAnnouncements.length} active` : "No announcements")}
                  </div>
                  {activeAnnouncements.length > 0 && <span className="hub-card-badge ok">{activeAnnouncements.length}</span>}
                </div>

                {/* Message Trish */}
                <div className="hub-card"
                  onClick={() => isTrish ? setCurrentView("hr-inbox") : setShowHrCompose(true)}
                  style={{ borderTopColor: "#8e44ad", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">✉</div>
                  <div className="hub-card-title">{isTrish ? "HR Inbox" : "Message Trish"}</div>
                  <div className="hub-card-sub">
                    {isTrish ? (unreadHrMessages.length > 0 ? `${unreadHrMessages.length} unread` : "HR messages") : "HR · time off · questions"}
                  </div>
                  {isTrish && unreadHrMessages.length > 0 && <span className="hub-card-badge">{unreadHrMessages.length} unread</span>}
                </div>

                {isAnyManager && (
                  <>
                    <div className="hub-card" onClick={() => setCurrentView("today")} style={{ background: "#162212", color: "#c8e6b8" }}>
                      <div className="hub-card-emoji" style={{ color: "#7fb069" }}>📅</div>
                      <div className="hub-card-title" style={{ color: "#c8e6b8" }}>Today</div>
                      <div className="hub-card-sub" style={{ color: "#7a9a6a" }}>All depts</div>
                    </div>
                    <div className="hub-card" onClick={() => setCurrentView("week")} style={{ background: "#162212", color: "#c8e6b8" }}>
                      <div className="hub-card-emoji" style={{ color: "#7fb069" }}>📆</div>
                      <div className="hub-card-title" style={{ color: "#c8e6b8" }}>This Week</div>
                      <div className="hub-card-sub" style={{ color: "#7a9a6a" }}>All depts</div>
                    </div>
                  </>
                )}

                <div style={{ gridColumn: "span 2" }}>
                  <DriverRequestStatusList scope="all" onTapHeader={() => setCurrentView("driver-requests")} />
                </div>

                <div className="hub-card" onClick={() => setShowDriverRequest(true)} style={{ borderTopColor: "#4a90d9", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">🚛</div>
                  <div className="hub-card-title">Request a Driver</div>
                  <div className="hub-card-sub">Pick date + driver · Call/Text</div>
                </div>

                <div className="hub-card" onClick={() => setCurrentView("driver-schedule")} style={{ borderTopColor: "#4a90d9", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">📅</div>
                  <div className="hub-card-title">Driver Schedule</div>
                  <div className="hub-card-sub">See who's booked when</div>
                </div>

                <div className="hub-card" onClick={() => setShowCodes(true)} style={{ borderTopColor: "#8e44ad", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">👥</div>
                  <div className="hub-card-title">Staff Roster</div>
                  <div className="hub-card-sub">Codes · call · text anyone</div>
                </div>

                <div className="hub-card" onClick={() => goToTasks("brehob")} style={{ borderTopColor: "#a86a10", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">🛒</div>
                  <div className="hub-card-title">Brehob List</div>
                  <div className="hub-card-sub">{(brehobItems || []).filter(b => b.status === "on_list").length} items on list</div>
                </div>

                {/* Receiving — standard single-column hub card next to Brehob/Maintenance */}
                <div className="hub-card" onClick={() => setCurrentView("receiving")} style={{ borderTopColor: "#a86a10", borderTopWidth: 4 }}>
                  <div className="hub-card-emoji">📦</div>
                  <div className="hub-card-title">Receiving</div>
                  <div className="hub-card-sub">
                    {receivingThisWeek.lineCount === 0
                      ? "Nothing this week"
                      : `${receivingThisWeek.plantTotal.toLocaleString()} plants this week`}
                  </div>
                  {receivingThisWeek.lineCount > 0 && <span className="hub-card-badge ok">{receivingThisWeek.lineCount}</span>}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* ── TASKS (existing UI) ──────────────────────────────────────────── */}
      {currentView === "tasks" && (
      <>
      {/* Header */}
      <div style={{ background: "#1e2d1a", padding: "12px 16px", color: "#c8e6b8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button onClick={() => setCurrentView("hub")}
            style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            ← Hub
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Floor View</div>
            <div className="mtv-header-title" style={{ fontSize: 19, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {category === "production"  && "🌱 Production"}
              {category === "growing"     && "🌿 Growing"}
              {category === "maintenance" && "🔧 Maintenance"}
              {category === "brehob"      && "🛒 Brehob"}
              {category === "sales"       && "💼 Sales"}
            </div>
          </div>
          <div className="mtv-header-buttons" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setShowRequests(true)}
              title="Requests inbox"
              style={{ position: "relative", background: "#c8e6b8", border: "none", borderRadius: 10, color: "#1e2d1a", padding: "8px 12px", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
              📥
              {pendingRequests.length > 0 && (
                <span style={{ position: "absolute", top: -4, right: -4, background: "#d94f3d", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #1e2d1a" }}>
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <button onClick={onSwitchMode}
              style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "8px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
              ↩
            </button>
          </div>
        </div>
      </div>

      {/* Week selector */}
      <div className="mtv-week-selector" style={{ background: "#162212", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #3a5a35" }}>
        <button onClick={() => changeWeek(-1)} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 18, cursor: "pointer", padding: 6 }}>&larr;</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#c8e6b8" }}>Week {selectedWeek.week}, {selectedWeek.year}</div>
          {!isCurrentWeek && <div style={{ fontSize: 10, color: "#7a9a6a" }}>Historical</div>}
          {isCurrentWeek && <div style={{ fontSize: 10, color: "#7fb069" }}>Current week</div>}
        </div>
        <button onClick={() => changeWeek(1)} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 18, cursor: "pointer", padding: 6 }}>&rarr;</button>
      </div>

      {/* Announcements */}
      <AnnouncementBanner />

      {/* Push notification banner */}
      <div style={{ padding: "12px 20px 0" }}><NotificationBanner /></div>

      {/* Who's out this week */}
      <OutThisWeekBanner />


      {/* Asst-manager 3-tab strip: My Tasks / [Department] / Done.
          Managers no longer see a cross-category strip here — they pick the
          category from the hub. Header title shows what they picked. */}
      {isAsstManager && (
        <div className="mtv-category-tabs" style={{ padding: "12px 20px 0", background: "#fff", display: "flex", gap: 8 }}>
          {[
            { id: "mine", label: `🎯 My Tasks${assignedToMe.length > 0 ? ` (${assignedToMe.length})` : ""}` },
            { id: "dept", label: deptLabel(defaultCategory) },
            { id: "done", label: "✓ Done" },
          ].map(t => (
            <button key={t.id} onClick={() => setAsstTab(t.id)}
              style={{
                flex: 1, padding: "12px 0", borderRadius: "12px 12px 0 0", fontSize: 13, fontWeight: 800,
                background: asstTab === t.id ? "#7fb069" : "#f2f5ef",
                color: asstTab === t.id ? "#1e2d1a" : "#7a8c74",
                border: "1.5px solid #c8d8c0", borderBottom: asstTab === t.id ? "1.5px solid #7fb069" : "1.5px solid #c8d8c0",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {/* Sales sub-tabs: Fundraising · Wholesale */}
      {category === "sales" && (
        <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8", padding: "10px 16px 0", display: "flex", gap: 6 }}>
          {[
            { id: "fundraising", label: "💰 Fundraising" },
            { id: "wholesale",   label: "🚚 Wholesale" },
          ].map(t => (
            <button key={t.id} onClick={() => setSalesTab(t.id)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: "10px 10px 0 0", fontSize: 12, fontWeight: 800,
                background: salesTab === t.id ? "#1e2d1a" : "#f2f5ef",
                color:      salesTab === t.id ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${salesTab === t.id ? "#1e2d1a" : "#c8d8c0"}`,
                borderBottom: "none",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Search box — filters the visible task list within the current category */}
      {!isAsstManager && (category === "production" || category === "growing" || category === "maintenance" || category === "sales") && (
        <div style={{ padding: "10px 16px 0", background: "#fff" }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Search tasks by title…"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", color: "#1e2d1a" }}
          />
        </div>
      )}

      {/* Brehob shopping list — renders in place of tasks when selected */}
      {category === "brehob" && (
        <div style={{ padding: "20px" }}>
          <BrehobManagerView />
        </div>
      )}

      {/* Maintenance sub-tabs: All Tasks · Houses · Done
          Tyler defaults to Houses (task planner); everyone else lands on
          All Tasks (prioritized list). Selected facility (if any) drills in. */}
      {category === "maintenance" && (
        <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8" }}>
          <div style={{ padding: "10px 16px 0", display: "flex", gap: 6 }}>
            {[
              { id: "all",    label: "📋 All Tasks" },
              { id: "houses", label: "🏡 Houses" },
              { id: "done",   label: "✓ Done" },
            ].map(t => (
              <button key={t.id}
                onClick={() => { setMaintTab(t.id); if (t.id !== "houses") setSelectedFacility(null); }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: "10px 10px 0 0", fontSize: 12, fontWeight: 800,
                  background: maintTab === t.id ? "#1e2d1a" : "#f2f5ef",
                  color:      maintTab === t.id ? "#c8e6b8" : "#7a8c74",
                  border: `1.5px solid ${maintTab === t.id ? "#1e2d1a" : "#c8d8c0"}`,
                  borderBottom: "none",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Breadcrumb when a facility is selected from the Houses tab */}
          {maintTab === "houses" && selectedFacility && (
            <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1.5px solid #e0ead8" }}>
              <button onClick={() => setSelectedFacility(null)}
                style={{ background: "transparent", border: "none", color: "#7fb069", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                ← All facilities
              </button>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>
                🔧 {facilityLabel(selectedFacility)}
              </span>
              <span style={{ width: 90 }} />
            </div>
          )}
        </div>
      )}

      {/* Houses tab: render the picker (or filtered task list once a facility is picked) */}
      {category === "maintenance" && maintTab === "houses" && !selectedFacility && (
        <FacilityPicker tasks={tasks} onSelect={(id) => setSelectedFacility(id)} />
      )}

      {/* Done tab: running history grouped by facility, filterable by year */}
      {category === "maintenance" && maintTab === "done" && (
        <FacilityHistoryView tasks={tasks} />
      )}

      {/* House Detail: equipment register + quick actions + new task form.
          Renders above the focused task list when a facility is picked. */}
      {category === "maintenance" && maintTab === "houses" && selectedFacility && (
        <HouseDetail
          facilityId={selectedFacility}
          assignees={ASSIGNEES}
          isTyler={isTyler}
          currentUserName={displayName}
          onBack={() => setSelectedFacility(null)}
        />
      )}

      {/* Status filter — hidden on Brehob, asst managers, and non-list maintenance tabs */}
      {category !== "brehob" && !isAsstManager && !(category === "maintenance" && maintTab !== "all" && !(maintTab === "houses" && selectedFacility)) && (
      <div className="mtv-filter-row" style={{ padding: "12px 20px", background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", gap: 8 }}>
        {[{id:"pending",label:"To Do"},{id:"completed",label:"Done"},{id:"all",label:"All"}].map(f => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: statusFilter === f.id ? "#1e2d1a" : "#f2f5ef",
              color: statusFilter === f.id ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${statusFilter === f.id ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {f.label} ({tasks.filter(t => t.year === selectedWeek.year && t.weekNumber === selectedWeek.week && (t.category || "production") === category && (f.id === "all" || (f.id === "pending" ? t.status !== "completed" : t.status === "completed"))).length})
          </button>
        ))}
      </div>
      )}

      {/* Location filter — Sprague vs Bluff. Hidden on maintenance (facility tagging replaces it). */}
      {category !== "brehob" && category !== "maintenance" && (
      <div className="mtv-filter-row" style={{ padding: "0 20px 12px", background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", gap: 8 }}>
        {[{id:"all",label:"All"},{id:"bluff",label:"🌱 Bluff"},{id:"sprague",label:"🌿 Sprague"}].map(f => (
          <button key={f.id} onClick={() => setLocationFilter(f.id)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: locationFilter === f.id ? "#c8e6b8" : "#f2f5ef",
              color: locationFilter === f.id ? "#1e2d1a" : "#7a8c74",
              border: `1.5px solid ${locationFilter === f.id ? "#7fb069" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {f.label}
          </button>
        ))}
      </div>
      )}

      {/* Production sub-type filter — Sowing / Propagation / Pot Fill / Planting / Tags */}
      {category === "production" && (() => {
        const baseTasks = tasks.filter(t =>
          t.status !== "requested" &&
          t.year === selectedWeek.year &&
          t.weekNumber === selectedWeek.week &&
          (t.category || "production") === "production" &&
          (statusFilter === "all" || (statusFilter === "pending" ? t.status !== "completed" : t.status === "completed")) &&
          (locationFilter === "all" || (t.location || "").toLowerCase() === locationFilter)
        );
        const counts = baseTasks.reduce((acc, t) => {
          const k = getProdType(t.title);
          acc[k] = (acc[k] || 0) + 1;
          acc.all = (acc.all || 0) + 1;
          return acc;
        }, {});
        return (
          <div style={{ padding: "0 20px 12px", background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", gap: 6, overflowX: "auto" }}>
            {PROD_TYPES.map(f => {
              const active = prodTypeFilter === f.id;
              const c = counts[f.id] || 0;
              return (
                <button key={f.id} onClick={() => setProdTypeFilter(f.id)}
                  style={{
                    flexShrink: 0, padding: "8px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: active ? "#1e2d1a" : "#f2f5ef",
                    color: active ? "#c8e6b8" : "#7a8c74",
                    border: `1.5px solid ${active ? "#1e2d1a" : "#c8d8c0"}`,
                    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  }}>
                  {f.emoji && <span style={{ marginRight: 4 }}>{f.emoji}</span>}{f.label} ({c})
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Task list grouped by bucket. Suppressed when:
          - On Brehob tab (shopping list takes over)
          - On Maintenance Houses tab with no facility picked (picker shows)
          - On Maintenance Done tab (history view takes over) */}
      {category !== "brehob" && !(category === "maintenance" && maintTab === "houses" && !selectedFacility) && !(category === "maintenance" && maintTab === "done") && (
      <div style={{ padding: 16 }}>
        {visibleTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#7a8c74" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {statusFilter === "completed" ? "No completed tasks" : "No tasks this week"}
            </div>
            {isCurrentWeek && statusFilter !== "completed" && (
              <div style={{ fontSize: 12, marginTop: 6, color: "#aabba0" }}>Tap the mic button below to add one</div>
            )}
          </div>
        ) : (
          [
            { id: "today",          label: "Today" },
            { id: "tomorrow",       label: "Tomorrow" },
            { id: "check_tomorrow", label: "Day After" },
            { id: "this_week",      label: "This Week" },
          ].map(section => {
            const sectionTasks = visibleTasks.filter(t => (t.bucket || "today") === section.id);
            if (sectionTasks.length === 0) return null;
            return (
              <div key={section.id} style={{ marginBottom: 18 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 12, fontWeight: 800, color: "#1e2d1a", textTransform: "uppercase",
                  letterSpacing: 1.2, margin: "6px 4px 10px",
                }}>
                  <span>{section.label}</span>
                  <div style={{ flex: 1, height: 2, background: "#7fb069", borderRadius: 1 }} />
                  <span style={{ background: "#7fb069", color: "#1e2d1a", borderRadius: 999, padding: "2px 10px", fontSize: 11 }}>{sectionTasks.length}</span>
                </div>
                {sectionTasks.map((t, sIdx) => {
                  const idx = visibleTasks.indexOf(t);
                  return renderTaskCard(t, idx);
                })}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Mic button - only on current week + only if allowed in this category + not brehob.
          Hidden in HouseDetail since it has its own creator with a mic. */}
      {isCurrentWeek && canCreateInCurrentCategory && category !== "brehob"
        && !(category === "maintenance" && (maintTab !== "all" || selectedFacility))
        && (
        <button onClick={() => setShowRecorder(true)}
          style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            width: 70, height: 70, borderRadius: "50%", background: "#7fb069",
            border: "4px solid #fff", color: "#fff", fontSize: 28, cursor: "pointer",
            boxShadow: "0 4px 20px rgba(26, 42, 26, 0.3)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          🎤
        </button>
      )}
      </>
      )}

      {/* ── VACATION sub-page ───────────────────────────────────────────── */}
      {currentView === "vacation" && (
        <VacationSubPage
          onBack={() => setCurrentView("hub")}
          onRequest={() => setShowVacationForm(true)}
          onOpenInbox={() => setShowVacationInbox(true)}
          canApprove={canApproveVacation}
          pendingCount={pendingVacations.length}
          vacationReqs={vacationReqs}
        />
      )}

      {/* ── MESSAGES sub-page ──────────────────────────────────────────── */}
      {currentView === "messages" && (
        <MessagesSubPage
          onBack={() => setCurrentView("hub")}
          canPost={canAnnounce}
          onPost={() => setShowAnnouncer(true)}
          isTrish={isTrish}
          onHrCompose={() => setShowHrCompose(true)}
          onOpenHrInbox={() => setCurrentView("hr-inbox")}
          unreadHrCount={unreadHrMessages.length}
          activeAnnouncements={activeAnnouncements}
        />
      )}

      {/* ── HR INBOX (Trish only) ──────────────────────────────────────── */}
      {currentView === "hr-inbox" && isTrish && (
        <HrInbox onBack={() => setCurrentView("messages")} />
      )}

      {/* ── DRIVER SCHEDULE — 21-day grid across all drivers ───────────── */}
      {currentView === "driver-schedule" && (
        <DriverScheduleView onBack={() => setCurrentView("hub")} />
      )}

      {/* ── DRIVER REQUESTS — full-page list with delete + driver comments ── */}
      {currentView === "driver-requests" && (
        <DriverRequestsSubPage onBack={() => setCurrentView("hub")} />
      )}

      {/* ── RECEIVING — what's coming from suppliers this week ── */}
      {currentView === "receiving" && (
        <ReceivingWeekSummary onBack={() => setCurrentView("hub")} />
      )}

      {/* ── TODAY / THIS WEEK (any manager) ────────────────────────────── */}
      {(currentView === "today" || currentView === "week") && (
        <TodayWeekView
          mode={currentView}
          tasks={tasks}
          today={today}
          onBack={() => setCurrentView("hub")}
          onOpenTask={(t) => { setCategory(t.category || "production"); setCurrentView("tasks"); setSelectedTask(t); }}
        />
      )}

      {showRecorder && <VoiceRecorderModal onSave={createTask} onCancel={() => setShowRecorder(false)} defaultLocation={defaultLocation} />}
      {showCodes && <CodesModal onClose={() => setShowCodes(false)} />}
      {showRequests && (
        <RequestsModal
          requests={pendingRequests}
          onClose={() => setShowRequests(false)}
          onApprove={(r) => { setShowRequests(false); setApprovingRequest(r); }}
          onReject={(r) => { setShowRequests(false); setDecliningRequest(r); }}
        />
      )}
      {approvingRequest && (
        <ApprovalModal
          request={approvingRequest}
          onCancel={() => setApprovingRequest(null)}
          onApprove={(opts) => approveRequest(approvingRequest, opts)}
        />
      )}
      {decliningRequest && (
        <DeclineModal
          request={decliningRequest}
          onCancel={() => setDecliningRequest(null)}
          onDecline={(reason) => declineRequest(decliningRequest, reason)}
        />
      )}
      {completingTask && (
        <CompletionPromptModal
          task={completingTask}
          onCancel={() => setCompletingTask(null)}
          onSave={finishCompletion}
        />
      )}
      {showOverdue && (
        <OverdueModal
          tasks={overdueTasks}
          displayName={displayName}
          onClose={() => setShowOverdue(false)}
          onMarkDone={async (t) => {
            await upsert({
              ...t,
              status: "completed",
              completedBy: displayName || "Manager",
              completedAt: new Date().toISOString(),
            });
            refresh();
          }}
        />
      )}
      {showAssigned && (
        <AssignedToMeModal
          tasks={assignedToMe}
          displayName={displayName}
          onClose={() => setShowAssigned(false)}
          onMarkDone={async (t) => {
            await upsert({
              ...t,
              status: "completed",
              completedBy: displayName || "Manager",
              completedAt: new Date().toISOString(),
            });
            refresh();
          }}
          onOpenTask={(t) => { setShowAssigned(false); setSelectedTask(t); }}
        />
      )}
      {showVacationForm && (
        <VacationRequestModal
          onCancel={() => setShowVacationForm(false)}
          onSaved={() => setShowVacationForm(false)}
        />
      )}
      {showVacationInbox && (
        <VacationRequestsInboxModal onClose={() => setShowVacationInbox(false)} />
      )}
      {showAnnouncer && (
        <AnnouncementComposerModal onClose={() => setShowAnnouncer(false)} />
      )}
      {announcementPopup.open && (
        <AnnouncementPopup unseen={announcementPopup.unseen} onClose={announcementPopup.close} />
      )}
      {showHrCompose && (
        <HrComposeModal onClose={() => setShowHrCompose(false)} onSent={() => setShowHrCompose(false)} />
      )}
      {showDriverRequest && (
        <DriverRequestModal onClose={() => setShowDriverRequest(false)} onSubmitted={() => setShowDriverRequest(false)} />
      )}
      {driverResponsePopup.open && (
        <DriverResponsePopup unseen={driverResponsePopup.unseen} onClose={driverResponsePopup.dismiss} />
      )}
    </div>
  );
}

// ── Vacation sub-page (focused view from hub) ────────────────────────────────
function VacationSubPage({ onBack, onRequest, onOpenInbox, canApprove, pendingCount, vacationReqs }) {
  const week = (() => { const d = new Date(); const dow = (d.getDay()+6)%7; const m = new Date(d); m.setDate(d.getDate()-dow); m.setHours(0,0,0,0); const s = new Date(m); s.setDate(m.getDate()+6); return { mIso: m.toISOString().slice(0,10), sIso: s.toISOString().slice(0,10) }; })();
  const outThisWeek = (vacationReqs || []).filter(v =>
    v.status === "approved" && v.startDate <= week.sIso && v.endDate >= week.mIso
  );
  return (
    <div style={{ ...FONT, background: "#f2f5ef", minHeight: "100vh", paddingBottom: 60 }}>
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Hub
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>🌴 Vacation</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: 16 }}>
        <button onClick={onRequest}
          style={{ width: "100%", padding: "16px", borderRadius: 12, background: "#7fb069", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
          🌴 Request time off
        </button>
        {canApprove && (
          <button onClick={onOpenInbox}
            style={{ width: "100%", padding: "14px", borderRadius: 12, background: pendingCount > 0 ? "#e89a3a" : "#1e2d1a", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
            📥 Inbox — {pendingCount} pending request{pendingCount !== 1 ? "s" : ""}
          </button>
        )}
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 8 }}>Out this week</div>
          {outThisWeek.length === 0 ? (
            <div style={{ fontSize: 13, color: "#7a8c74" }}>Nobody's off this week.</div>
          ) : (
            outThisWeek.map(v => (
              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f5ee" }}>
                <div style={{ fontWeight: 700, color: "#1e2d1a", fontSize: 14 }}>{v.requesterName}{v.isSick ? " 🤒" : ""}</div>
                <div style={{ fontSize: 12, color: "#7a8c74" }}>{v.startDate}{v.endDate !== v.startDate ? ` → ${v.endDate}` : ""}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Messages sub-page (announcements + HR) ───────────────────────────────────
function MessagesSubPage({ onBack, canPost, onPost, isTrish, onHrCompose, onOpenHrInbox, unreadHrCount, activeAnnouncements }) {
  return (
    <div style={{ ...FONT, background: "#f2f5ef", minHeight: "100vh", paddingBottom: 60 }}>
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Hub
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>📢 Messages</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: 16 }}>
        {canPost && (
          <button onClick={onPost}
            style={{ width: "100%", padding: "16px", borderRadius: 12, background: "#1e2d1a", border: "none", color: "#c8e6b8", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
            📢 Post announcement
          </button>
        )}
        {!isTrish && (
          <button onClick={onHrCompose}
            style={{ width: "100%", padding: "16px", borderRadius: 12, background: "#8e44ad", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
            ✉ Message Trish (HR)
          </button>
        )}
        {isTrish && (
          <button onClick={onOpenHrInbox}
            style={{ width: "100%", padding: "16px", borderRadius: 12, background: unreadHrCount > 0 ? "#8e44ad" : "#3a3a3a", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
            📥 HR Inbox{unreadHrCount > 0 ? ` (${unreadHrCount} unread)` : ""}
          </button>
        )}

        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 8 }}>Active announcements</div>
          {activeAnnouncements.length === 0 ? (
            <div style={{ fontSize: 13, color: "#7a8c74" }}>No active announcements.</div>
          ) : (
            activeAnnouncements.map(a => (
              <div key={a.id} style={{ borderLeft: `4px solid ${a.priority === "urgent" ? "#d94f3d" : "#7fb069"}`, padding: "8px 12px", background: a.priority === "urgent" ? "#fff5f3" : "#f8fbf5", borderRadius: 4, marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: "#1e2d1a", whiteSpace: "pre-wrap" }}>{a.priority === "urgent" ? "🚨 " : ""}{a.message}</div>
                <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 4 }}>— {a.postedBy}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Today / This Week aggregated view (any manager) ──────────────────────────
function TodayWeekView({ mode, tasks, today, onBack, onOpenTask }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const inScope = (t) => {
    if (t.status === "completed" || t.status === "requested" || t.status === "rejected") return false;
    if (mode === "today") return t.targetDate === todayIso || t.bucket === "today";
    return t.year === today.year && t.weekNumber === today.week;
  };
  const filtered = (tasks || []).filter(inScope);
  const byCategory = filtered.reduce((m, t) => {
    const k = t.category || "production";
    (m[k] = m[k] || []).push(t);
    return m;
  }, {});
  const order = ["production", "growing", "maintenance"];
  const meta = {
    production: { label: "🌱 Production", color: "#7fb069" },
    growing: { label: "🌿 Growing", color: "#4a90d9" },
    maintenance: { label: "🔧 Maintenance", color: "#e89a3a" },
  };
  return (
    <div style={{ ...FONT, background: "#f2f5ef", minHeight: "100vh", paddingBottom: 60 }}>
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Hub
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          {mode === "today" ? "📅 Today" : "📆 This Week"}
        </div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: 14 }}>
        {order.map(cat => {
          const items = byCategory[cat] || [];
          if (items.length === 0) return null;
          const m = meta[cat];
          return (
            <div key={cat} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{m.label}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>· {items.length} task{items.length !== 1 ? "s" : ""}</div>
              </div>
              {items.map(t => (
                <div key={t.id} onClick={() => onOpenTask(t)}
                  style={{ padding: "8px 4px", borderBottom: "1px solid #f0f5ee", cursor: "pointer" }}>
                  <div style={{ fontSize: 13, color: "#1e2d1a" }}>{t.title}</div>
                  {t.assignedTo && <div style={{ fontSize: 10, color: "#4a90d9", marginTop: 2 }}>👤 {t.assignedTo}</div>}
                </div>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: 40, textAlign: "center", color: "#7a8c74" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a1a" }}>
              {mode === "today" ? "Nothing on the books for today." : "No tasks scheduled this week."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── HEADER ICON BUTTON ──────────────────────────────────────────────────────
// Icon-only round button used in the hub header. Renders a red badge when
// `badge > 0` so unattended driver requests / vacations / HR messages are
// visible from anywhere on the hub.
function HeaderIconButton({ emoji, title, badge = 0, onClick }) {
  return (
    <button onClick={onClick} title={title}
      style={{ position: "relative", background: "#c8e6b8", border: "none", borderRadius: 10, color: "#1e2d1a", padding: "8px 12px", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
      {emoji}
      {badge > 0 && (
        <span style={{ position: "absolute", top: -4, right: -4, background: "#d94f3d", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #1e2d1a", boxSizing: "content-box" }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CODES MODAL ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// Hardcoded staff list removed — CodesModal now pulls live from floor_codes.

// ══════════════════════════════════════════════════════════════════════════════
// ── COMPLETION PROMPT MODAL ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function CompletionPromptModal({ task, onCancel, onSave }) {
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null); // storage path
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview instantly
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const path = await uploadTaskPhoto(file);
      setPhoto(path);
    } catch (err) {
      alert("Upload failed: " + err.message);
      setPreviewUrl(null);
    }
    setUploading(false);
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 22, width: "100%", maxWidth: 500,
      }}>
        <div style={{ fontSize: 11, color: "#7fb069", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Completing</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginBottom: 14 }}>{task.title}</div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74" }}>Any notes? (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. looked healthy, watered well"
          style={{
            width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0",
            fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none",
            marginTop: 6, marginBottom: 12,
          }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74" }}>Take a photo? (optional)</label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
        {previewUrl ? (
          <div style={{ position: "relative", marginTop: 6 }}>
            <img src={previewUrl} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, opacity: uploading ? 0.6 : 1 }} />
            {uploading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, textShadow: "0 0 4px rgba(0,0,0,0.8)" }}>Uploading...</div>}
            {!uploading && (
              <button onClick={() => { setPhoto(null); setPreviewUrl(null); }}
                style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>×</button>
            )}
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{
              width: "100%", padding: "14px", borderRadius: 10, border: "1.5px dashed #c8d8c0",
              background: "#fafcf8", color: "#7a8c74", fontSize: 14, fontWeight: 700, cursor: uploading ? "default" : "pointer",
              fontFamily: "inherit", marginTop: 6,
            }}>
            📷 Take Photo
          </button>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSave(notes.trim() || null, photo)}
            style={{ flex: 2, padding: "13px 0", borderRadius: 10, border: "none", background: "#7fb069", color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Mark Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overdue tasks modal (shown once per session on login when there are overdue items) ──
// "You have N tasks assigned to you" modal. Re-opens every login until the work is done —
// no per-task dismiss because the user wants visibility kept up. "Got it" just hides for this session.
function AssignedToMeModal({ tasks, displayName, onClose, onMarkDone, onOpenTask }) {
  const [busy, setBusy] = useState(null);
  const [doneIds, setDoneIds] = useState(new Set());
  const visible = tasks.filter(t => !doneIds.has(t.id));

  async function handleDone(t) {
    setBusy(t.id);
    try { await onMarkDone(t); }
    finally { setBusy(null); }
    setDoneIds(prev => { const s = new Set(prev); s.add(t.id); return s; });
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 0, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ background: "#4a90d9", color: "#fff", padding: "16px 20px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.9 }}>
              {displayName ? `${displayName.split(" ")[0]} — your week` : "Your week"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
              👤 {tasks.length} task{tasks.length !== 1 ? "s" : ""} assigned to you
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.5)", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Got it
          </button>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a" }}>All done — nice work</div>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 20px 4px", fontSize: 13, color: "#7a8c74" }}>
              These will pop up again next time you open the app until they're marked done.
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              {visible.map(t => (
                <div key={t.id} style={{
                  background: "#fff", borderRadius: 12, border: "1.5px solid #c8dceb",
                  padding: "12px 14px", marginBottom: 10,
                }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onOpenTask?.(t)}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a" }}>{t.title}</div>
                      {t.description && (
                        <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4, whiteSpace: "pre-wrap" }}>{t.description}</div>
                      )}
                      {t.targetDate && (
                        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4, fontWeight: 600 }}>📅 {formatTargetDate(t.targetDate)}</div>
                      )}
                    </div>
                    <button onClick={() => handleDone(t)} disabled={busy === t.id}
                      style={{ background: busy === t.id ? "#b0c8a0" : "#7fb069", border: "none", color: "#1e2d1a", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: busy === t.id ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {busy === t.id ? "Saving..." : "✓ Done"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OverdueModal({ tasks, displayName, onClose, onMarkDone }) {
  const [dismissed, setDismissed] = useState(new Set());
  const [busy, setBusy] = useState(null); // task id while a mark-done is in-flight
  const visible = tasks.filter(t => !dismissed.has(t.id));

  async function handleMarkDone(t) {
    setBusy(t.id);
    try { await onMarkDone(t); }
    finally { setBusy(null); }
    // Auto-remove from visible list after marking done
    setDismissed(prev => { const s = new Set(prev); s.add(t.id); return s; });
  }

  function handleDismiss(t) {
    setDismissed(prev => { const s = new Set(prev); s.add(t.id); return s; });
  }

  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%",
          maxHeight: "85vh", overflow: "auto", padding: 0,
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
        }}>
        <div style={{
          background: "#d94f3d", color: "#fff", padding: "16px 20px",
          borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>
              {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
              ⚠ {tasks.length} Overdue Task{tasks.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.5)", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Dismiss all
          </button>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a" }}>All cleared</div>
            <button onClick={onClose}
              style={{ marginTop: 14, background: "#7fb069", border: "none", color: "#1e2d1a", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 20px 4px", fontSize: 13, color: "#7a8c74" }}>
              These were carried over from a prior week. Mark them done or dismiss to move on.
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              {visible.map(t => (
                <div key={t.id} style={{
                  background: "#fff", borderRadius: 12, border: "1.5px solid #f0b8b0",
                  padding: "12px 14px", marginBottom: 10,
                }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a", flex: 1 }}>{t.title}</div>
                    <span style={{ background: "#d94f3d", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>OVERDUE</span>
                  </div>
                  {t.description && (
                    <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 8, whiteSpace: "pre-wrap" }}>{t.description}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => handleDismiss(t)} disabled={busy === t.id}
                      style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      Dismiss
                    </button>
                    <button onClick={() => handleMarkDone(t)} disabled={busy === t.id}
                      style={{ background: busy === t.id ? "#b0c8a0" : "#7fb069", border: "none", color: "#1e2d1a", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: busy === t.id ? "default" : "pointer", fontFamily: "inherit" }}>
                      {busy === t.id ? "Saving..." : "✓ Mark Done"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Task requests inbox ─────────────────────────────────────────────────────
function RequestsModal({ requests, onClose, onApprove, onReject }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "18px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#e89a3a", textTransform: "uppercase", letterSpacing: 1 }}>Pending Suggestions</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>Grower Task Requests</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 26, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 22 }}>
          {requests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#7a8c74" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>No pending requests</div>
            </div>
          ) : (
            requests.map(r => (
              <div key={r.id} style={{ background: "#fafcf8", borderRadius: 12, border: "1.5px solid #e0ead8", borderLeft: "4px solid #e89a3a", padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>
                  Suggested by <b style={{ color: "#1e2d1a" }}>{r.createdBy || "—"}</b>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", marginTop: 4 }}>{r.title}</div>
                {r.description && <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 6, whiteSpace: "pre-wrap" }}>{r.description}</div>}
                {Array.isArray(r.photos) && r.photos.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {r.photos.map((p, i) => <TaskPhoto key={i} src={p} />)}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => onApprove(r)}
                    style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "#4a7a35", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    ✓ Approve & Schedule
                  </button>
                  <button onClick={() => onReject(r)}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Decline-with-reason modal — replaces the old delete-on-reject path so the requester
// finds out WHY their suggestion didn't make the cut.
function DeclineModal({ request, onCancel, onDecline }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function handle() {
    if (saving) return;
    setSaving(true);
    try { await onDecline(reason.trim()); }
    finally { setSaving(false); }
  }
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 480, width: "100%", padding: 0, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ background: "#d94f3d", color: "#fff", padding: "14px 18px", borderRadius: "16px 16px 0 0" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>Decline Request</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>{request.title}</div>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 6 }}>Tell {request.createdBy || "the requester"} why this was declined (optional but recommended).</div>
          <textarea value={reason} onChange={e => setReason(e.target.value)} autoFocus
            placeholder="e.g. already covered by another task, not needed this season, wrong location…"
            style={{ width: "100%", minHeight: 100, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
            <button onClick={onCancel} disabled={saving}
              style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button onClick={handle} disabled={saving}
              style={{ background: saving ? "#b85a4a" : "#d94f3d", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving..." : "Decline"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalModal({ request, onCancel, onApprove }) {
  const [bucket, setBucket] = useState("today");
  const [customDate, setCustomDate] = useState(bucketToDate("today"));
  const [useCustom, setUseCustom] = useState(false);

  const finalDate = useCustom ? customDate : bucketToDate(bucket);

  function submit() {
    onApprove({ bucket: useCustom ? "this_week" : bucket, targetDate: finalDate });
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, padding: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", letterSpacing: 1 }}>Approving</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#1e2d1a", marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>{request.title}</div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>When</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
            { id: "check_tomorrow", label: "Day After" },
            { id: "this_week", label: "This Week" },
          ].map(b => {
            const active = !useCustom && bucket === b.id;
            return (
              <button key={b.id} onClick={() => { setUseCustom(false); setBucket(b.id); }}
                style={{
                  flex: "1 1 45%", padding: "12px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                  background: active ? "#1e2d1a" : "#f2f5ef",
                  color: active ? "#c8e6b8" : "#7a8c74",
                  border: `1.5px solid ${active ? "#1e2d1a" : "#c8d8c0"}`,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {b.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Or specific date</div>
        <input type="date" value={customDate} onChange={e => { setCustomDate(e.target.value); setUseCustom(true); }}
          style={{
            width: "100%", padding: 12, borderRadius: 10,
            border: `1.5px solid ${useCustom ? "#1e2d1a" : "#c8d8c0"}`,
            fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 6,
          }} />
        <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 16 }}>
          Will appear on: <b style={{ color: "#1e2d1a" }}>{formatTargetDate(finalDate)}</b>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={submit}
            style={{ flex: 2, padding: "13px 0", borderRadius: 10, border: "none", background: "#4a7a35", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Schedule Task
          </button>
        </div>
      </div>
    </div>
  );
}

// Roster modal — pulled live from floor_codes so Trish (and any manager) can
// look up login codes AND one-tap call/text any staff member.
function CodesModal({ onClose }) {
  const { rows: codes } = useFloorCodes2();
  const [query, setQuery] = useState("");

  // Active staff, alphabetized. Searchable across name, title, department, phone digits.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return (codes || [])
      .filter(c => c.active !== false)
      .filter(c => {
        if (!q) return true;
        const hay = [c.workerName, c.title, c.department, c.staffGroup, c.code].filter(Boolean).join(" ").toLowerCase();
        if (hay.includes(q)) return true;
        if (qDigits && (c.phone || "").replace(/\D/g, "").includes(qDigits)) return true;
        return false;
      })
      .sort((a, b) => (a.workerName || "").localeCompare(b.workerName || ""));
  }, [codes, query]);

  function formatPhone(p) {
    if (!p) return "";
    const d = String(p).replace(/\D/g, "");
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return p;
  }
  function tel(p) { const d = String(p || "").replace(/\D/g, ""); return d ? `tel:+1${d.slice(-10)}` : null; }
  function sms(p) { const d = String(p || "").replace(/\D/g, ""); return d ? `sms:+1${d.slice(-10)}` : null; }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: "18px 18px 24px", width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>Staff Roster</div>
            <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{rows.length} of {(codes || []).filter(c => c.active !== false).length} staff</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 26, cursor: "pointer", padding: "0 4px" }}>&times;</button>
        </div>

        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search name, title, department, or phone…"
          autoFocus={false}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box", color: "#1e2d1a" }}
        />

        <div style={{ flex: 1, overflowY: "auto", margin: "0 -4px", padding: "0 4px" }}>
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#7a8c74", fontSize: 14 }}>No matches.</div>
          ) : rows.map(c => (
            <div key={c.id || c.code} style={{
              background: "#f2f5ef", borderRadius: 12, padding: 12, marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: c.phone ? 8 : 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{c.workerName}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                    {c.title}
                    {c.department && c.department !== c.title && <> · {c.department}</>}
                    {c.staffGroup && <> · {c.staffGroup}</>}
                  </div>
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#1e2d1a", fontFamily: "monospace", letterSpacing: 2, flexShrink: 0 }}>{c.code}</div>
              </div>
              {c.phone && (
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={tel(c.phone)}
                    style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e4d2b", color: "#fff", padding: "10px 8px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                    📞 Call {formatPhone(c.phone)}
                  </a>
                  <a href={sms(c.phone)}
                    style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e2d4d", color: "#fff", padding: "10px 8px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                    💬 Text
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VOICE RECORDER MODAL ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// Task type chips shown in the create-task modal. Selecting a type prepends an
// emoji (+ verb for sow/stick) so getProdType() picks it up downstream.
const TASK_TYPE_OPTIONS = [
  { id: "other",    label: "General",      emoji: "",   verb: "" },
  { id: "sow",      label: "Sowing",       emoji: "🌱", verb: "Sow" },
  { id: "stick",    label: "Sticking",     emoji: "🌱", verb: "Stick" },
  { id: "potfill",  label: "Pot Filling",  emoji: "📦", verb: "" },
  { id: "planting", label: "Planting",     emoji: "🌿", verb: "" },
  { id: "tags",     label: "Tags",         emoji: "🏷", verb: "" },
];

function VoiceRecorderModal({ onSave, onCancel, defaultLocation = "bluff" }) {
  const [transcript, setTranscript] = useState("");
  const [bucket, setBucket] = useState("today");
  const [location, setLocation] = useState(defaultLocation);
  const [taskType, setTaskType] = useState("other");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // iOS Safari / PWA: fall back to the system keyboard dictation mic
      setError("Tap the 🎤 on your keyboard to dictate, or type your task below.");
      setTimeout(() => textareaRef.current?.focus(), 150);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text;
        else interim += text;
      }
      if (finalText) setTranscript(prev => (prev + " " + finalText).trim());
    };

    recognition.onerror = (e) => {
      setError("Voice error: " + e.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    // Auto-start
    try {
      recognition.start();
      setIsListening(true);
    } catch {}

    return () => {
      try { recognition.stop(); } catch {}
    };
  }, []);

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
  }

  function save() {
    if (!transcript.trim()) return;
    try { recognitionRef.current?.stop(); } catch {}
    const type = TASK_TYPE_OPTIONS.find(o => o.id === taskType);
    let finalTitle = transcript.trim();
    if (type && type.emoji) {
      finalTitle = type.verb
        ? `${type.emoji} ${type.verb} ${finalTitle}`
        : `${type.emoji} ${finalTitle}`;
    }
    onSave(finalTitle, bucket, location);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 500,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>New Task</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 24, cursor: "pointer" }}>&times;</button>
        </div>

        {error && <div style={{ background: "#fde8e8", color: "#d94f3d", padding: "10px 12px", borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <textarea ref={textareaRef} value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder={isListening ? "Listening... speak now" : "Tap mic to dictate or type here"}
          style={{
            width: "100%", minHeight: 120, padding: "14px", borderRadius: 12,
            border: `2px solid ${isListening ? "#7fb069" : "#c8d8c0"}`, fontSize: 15,
            fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none",
          }} />

        {/* Bucket selection */}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {[
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
            { id: "check_tomorrow", label: "Day After" },
            { id: "this_week", label: "This Week" },
          ].map(b => (
            <button key={b.id} onClick={() => setBucket(b.id)}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                background: bucket === b.id ? "#1e2d1a" : "#f2f5ef",
                color: bucket === b.id ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${bucket === b.id ? "#1e2d1a" : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Location selection */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[
            { id: "bluff", label: "🌱 Bluff" },
            { id: "sprague", label: "🌿 Sprague" },
          ].map(l => (
            <button key={l.id} onClick={() => setLocation(l.id)}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                background: location === l.id ? "#7fb069" : "#f2f5ef",
                color: location === l.id ? "#1e2d1a" : "#7a8c74",
                border: `1.5px solid ${location === l.id ? "#7fb069" : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {l.label}
            </button>
          ))}
        </div>

        {/* Task type selection — prepends emoji/verb to title so sub-tab filter picks it up */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {TASK_TYPE_OPTIONS.map(t => {
            const active = taskType === t.id;
            return (
              <button key={t.id} onClick={() => setTaskType(t.id)}
                style={{
                  padding: "8px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: active ? "#4a90d9" : "#f2f5ef",
                  color: active ? "#fff" : "#7a8c74",
                  border: `1.5px solid ${active ? "#4a90d9" : "#c8d8c0"}`,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}>
                {t.emoji && <span style={{ marginRight: 4 }}>{t.emoji}</span>}{t.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {recognitionRef.current && (
            <button onClick={toggleListening}
              style={{
                padding: "14px 18px", borderRadius: 12, border: "none",
                background: isListening ? "#d94f3d" : "#7fb069", color: "#fff",
                fontSize: 20, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>
              {isListening ? "⏸" : "🎤"}
            </button>
          )}
          <button onClick={save} disabled={!transcript.trim()}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
              background: transcript.trim() ? "#1e2d1a" : "#c8d8c0", color: "#fff",
              fontSize: 15, fontWeight: 800, cursor: transcript.trim() ? "pointer" : "default", fontFamily: "inherit",
            }}>
            Save Task
          </button>
        </div>
        {isListening && <div style={{ textAlign: "center", fontSize: 11, color: "#7fb069", marginTop: 10, fontWeight: 700 }}>● LISTENING</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TASK DETAIL ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function RatingPicker({ value, onChange }) {
  const OPTIONS = [
    { id: "sad",     emoji: "😞", label: "Bad" },
    { id: "neutral", emoji: "😐", label: "OK" },
    { id: "happy",   emoji: "😊", label: "Good" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {OPTIONS.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(active ? null : o.id)}
            style={{
              flex: 1, padding: "12px 6px", borderRadius: 12,
              border: `2px solid ${active ? "#7fb069" : "#c8d8c0"}`,
              background: active ? "#f0f8eb" : "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{o.emoji}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#1e2d1a" : "#7a8c74", marginTop: 4 }}>{o.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function BenchNumbersEditor({ value, onChange }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  const remove = (b) => onChange(value.filter(x => x !== b));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {value.map(b => (
          <span key={b} style={{
            background: "#1e2d1a", color: "#c8e6b8", borderRadius: 999, padding: "6px 12px",
            fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {b}
            <button onClick={() => remove(b)} style={{ background: "none", border: "none", color: "#c8e6b8", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add bench #"
          style={{ flex: 1, padding: 10, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
        <button onClick={add}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#7fb069", color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Add
        </button>
      </div>
    </div>
  );
}

export function TaskViewer({ task, onBack, onAppend, readOnly = true }) {
  const [note, setNote] = useState("");
  const fileRef = useRef(null);
  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onAppend({ photo: ev.target.result });
    reader.readAsDataURL(file);
  }
  function saveNote() {
    if (!note.trim()) return;
    onAppend({ note: note.trim() });
    setNote("");
  }
  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 20px", color: "#c8e6b8", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Task Details</div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Title</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginBottom: 8 }}>{task.title}</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Assigned by <span style={{ fontWeight: 700, color: "#1e2d1a" }}>{task.createdBy || "Manager"}</span></span>
            {(task.createdBy || "").includes("Production Schedule") && (
              <span style={{ background: "#8e44ad", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🍂 Fall Program</span>
            )}
            {task.assignedTo && (
              <span style={{ background: "#4a90d9", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>👤 Assigned to {task.assignedTo}</span>
            )}
            {task.team === "houseplants" && (
              <span style={{ background: "#7fb069", color: "#1e2d1a", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🪴 Houseplants</span>
            )}
          </div>
          {task.description && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Details</div>
            <div style={{ fontSize: 14, color: "#1e2d1a", marginBottom: 12, whiteSpace: "pre-wrap" }}>{task.description}</div>
          </>}
          {task.houseId && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>House</div>
            <div style={{ fontSize: 14, color: "#1e2d1a", marginBottom: 12 }}>{task.houseId}</div>
          </>}
          {(task.benchNumbers || []).length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Benches</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {task.benchNumbers.map(b => (
                <span key={b} style={{ background: "#1e2d1a", color: "#c8e6b8", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{b}</span>
              ))}
            </div>
          </>}
          {task.rating && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Rating</div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{task.rating === "happy" ? "😊" : task.rating === "neutral" ? "😐" : "😞"}</div>
          </>}
          {task.notes && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "#1e2d1a", marginBottom: 12, whiteSpace: "pre-wrap", background: "#f2f5ef", padding: 10, borderRadius: 8 }}>{task.notes}</div>
          </>}
          {(task.photos || []).length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Photos</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {task.photos.map((p, i) => (
                <TaskPhoto key={i} src={p} />
              ))}
            </div>
          </>}
        </div>

        {/* Append-only controls for growers */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", marginBottom: 8 }}>How did it go?</div>
          <RatingPicker value={task.rating || null} onChange={r => onAppend({ rating: r })} />
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", marginBottom: 8 }}>Add your update</div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note…"
            style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveNote} disabled={!note.trim()}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: note.trim() ? "#1e2d1a" : "#c8d8c0", color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: note.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              Save Note
            </button>
            <button onClick={() => fileRef.current?.click()}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fafcf8", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              📷 Add Photo
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
          </div>
        </div>

        <button onClick={onBack}
          style={{ width: "100%", marginTop: 16, padding: "16px 0", borderRadius: 12, border: "none", background: "#7fb069", color: "#1e2d1a", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ✓ Done
        </button>
      </div>
    </div>
  );
}

function TaskDetail({ task, onBack, onSave }) {
  const [t, setT] = useState({ ...task });
  const [dirty, setDirty] = useState(false);
  const upd = (k, v) => { setT(p => ({ ...p, [k]: v })); setDirty(true); };

  const handleBack = () => {
    if (dirty) { onSave(t); return; }
    onBack();
  };

  // Warn on browser close/refresh with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const path = await uploadTaskPhoto(file);
      const photos = [...(t.photos || []), path];
      upd("photos", photos);
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
    setUploadingPhoto(false);
    e.target.value = ""; // allow re-selecting same file
  }

  function removePhoto(idx) {
    const photos = (t.photos || []).filter((_, i) => i !== idx);
    upd("photos", photos);
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 20px", color: "#c8e6b8", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleBack} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Edit Task{dirty ? " •" : ""}</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Assigned by</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a", marginBottom: 14 }}>{t.createdBy || "Manager"}</div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Title</div>
          <input value={t.title || ""} onChange={e => upd("title", e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Details</div>
          <textarea value={t.description || ""} onChange={e => upd("description", e.target.value)}
            placeholder="Add more details..."
            style={{ width: "100%", minHeight: 100, padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 14 }} />

          {t.rating && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Grower Rating</div>
              <div style={{ fontSize: 36, marginBottom: 14 }}>
                {t.rating === "happy" ? "😊" : t.rating === "neutral" ? "😐" : "😞"}
              </div>
            </>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>House ID <span style={{ color: "#aabba0", fontWeight: 400 }}>(optional)</span></div>
          <input value={t.houseId || ""} onChange={e => upd("houseId", e.target.value)}
            placeholder="e.g. H-12"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Bench Numbers <span style={{ color: "#aabba0", fontWeight: 400 }}>(optional)</span></div>
          <BenchNumbersEditor value={t.benchNumbers || []} onChange={v => upd("benchNumbers", v)} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>When</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "today",          label: "Today" },
              { id: "tomorrow",       label: "Tomorrow" },
              { id: "check_tomorrow", label: "Day After" },
              { id: "this_week",      label: "This Week" },
            ].map(b => {
              const active = (t.bucket || "today") === b.id;
              return (
                <button key={b.id} onClick={() => { upd("bucket", b.id); upd("targetDate", bucketToDate(b.id)); }}
                  style={{
                    flex: "1 1 45%", padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                    background: active ? "#1e2d1a" : "#f2f5ef",
                    color: active ? "#c8e6b8" : "#7a8c74",
                    border: `1.5px solid ${active ? "#1e2d1a" : "#c8d8c0"}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {b.label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Photos</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {(t.photos || []).map((p, i) => (
              <TaskPhoto key={i} src={p} onRemove={() => removePhoto(i)} />
            ))}
            <label style={{ width: 90, height: 90, borderRadius: 10, border: "2px dashed #c8d8c0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 24, color: "#7a8c74", background: uploadingPhoto ? "#f0f5ee" : "#fafcf8" }}>
              {uploadingPhoto ? "..." : "+"}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} disabled={uploadingPhoto} />
            </label>
          </div>
        </div>

        <button onClick={() => onSave(t)}
          style={{ width: "100%", marginTop: 16, padding: "16px 0", borderRadius: 12, border: "none", background: "#1e2d1a", color: "#c8e6b8", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Save Changes
        </button>
      </div>
    </div>
  );
}
