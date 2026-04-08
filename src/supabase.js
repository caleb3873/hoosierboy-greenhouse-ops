import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── CLIENT ────────────────────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.REACT_APP_SUPABASE_URL     || "";
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

let _client = null;
export function getSupabase() {
  if (!_client && SUPABASE_URL && SUPABASE_ANON_KEY) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
// Convert snake_case DB row to camelCase app object
function toCamel(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      toCamel(v),
    ])
  );
}

// Convert camelCase app object to snake_case for DB
// Manual overrides for keys that don't convert cleanly via regex
const SNAKE_OVERRIDES = {
  isHBTagged: "is_hb_tagged",
  tagCostPerUnit: "tag_cost_per_unit",
};

function toSnake(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(toSnake);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      SNAKE_OVERRIDES[k] || k.replace(/([A-Z])/g, "_$1").toLowerCase(),
      // Don't recurse into jsonb fields — keep them as-is
      typeof v === "object" && v !== null && !Array.isArray(v) &&
        !["varieties","indoorAssignments","outsideAssignments","zones","sections","stages","items","spacing","details","priceHistory","inventoryHistory","formatConfig","availability","benchNumbers"].includes(k)
        ? toSnake(v)
        : v,
    ])
  );
}

// ── GENERIC TABLE HOOK ────────────────────────────────────────────────────────
// useTable("crop_runs") → { rows, loading, error, insert, update, remove, refresh }
export function useTable(tableName, { orderBy = "created_at", ascending = false, localKey = null } = {}) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const mounted = useRef(true);

  const db = getSupabase();
  const hasDb = !!db;

  // Load from localStorage fallback if no Supabase
  useEffect(() => {
    if (!hasDb && localKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(localKey) || "[]");
        setRows(stored);
      } catch {}
      setLoading(false);
    }
  }, [hasDb, localKey]);

  // Fetch from Supabase
  const refresh = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await db
        .from(tableName)
        .select("*")
        .order(orderBy, { ascending });
      if (err) throw err;
      if (mounted.current) setRows(toCamel(data || []));
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [db, tableName, orderBy, ascending]);

  useEffect(() => {
    if (hasDb) refresh();
    return () => { mounted.current = false; };
  }, [hasDb, refresh]);

  // Real-time subscription
  useEffect(() => {
    if (!db) return;
    const channel = db
      .channel(`rt-${tableName}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName }, () => {
        refresh();
      })
      .subscribe();
    return () => db.removeChannel(channel);
  }, [db, tableName, refresh]);

  const insert = useCallback(async (row) => {
    const { id, ...rest } = row;
    const snaked = toSnake(rest);
    if (!db) {
      // localStorage fallback
      const newRow = { ...row, id: row.id || Date.now().toString(36) };
      setRows(prev => {
        const updated = [newRow, ...prev];
        if (localKey) localStorage.setItem(localKey, JSON.stringify(updated));
        return updated;
      });
      return newRow;
    }
    const { data, error: err } = await db.from(tableName).insert(snaked).select().single();
    if (err) throw err;
    const converted = toCamel(data);
    setRows(prev => [converted, ...prev]);
    return converted;
  }, [db, tableName, localKey]);

  const update = useCallback(async (id, changes) => {
    const snaked = toSnake(changes);
    if (!db) {
      setRows(prev => {
        const updated = prev.map(r => r.id === id ? { ...r, ...changes } : r);
        if (localKey) localStorage.setItem(localKey, JSON.stringify(updated));
        return updated;
      });
      return;
    }
    const { error: err } = await db.from(tableName).update(snaked).eq("id", id);
    if (err) throw err;
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r));
  }, [db, tableName, localKey]);

  const remove = useCallback(async (id) => {
    if (!db) {
      setRows(prev => {
        const updated = prev.filter(r => r.id !== id);
        if (localKey) localStorage.setItem(localKey, JSON.stringify(updated));
        return updated;
      });
      return;
    }
    const { error: err } = await db.from(tableName).delete().eq("id", id);
    if (err) throw err;
    setRows(prev => prev.filter(r => r.id !== id));
  }, [db, tableName]);

  const upsert = useCallback(async (row) => {
    const snaked = toSnake(row);
    if (!db) {
      setRows(prev => {
        const exists = prev.find(r => r.id === row.id);
        const updated = exists
          ? prev.map(r => r.id === row.id ? { ...r, ...row } : r)
          : [row, ...prev];
        if (localKey) localStorage.setItem(localKey, JSON.stringify(updated));
        return updated;
      });
      return row;
    }
    const { data, error: err } = await db.from(tableName).upsert(snaked).select().single();
    if (err) throw err;
    const converted = toCamel(data);
    setRows(prev => {
      const exists = prev.find(r => r.id === converted.id);
      return exists
        ? prev.map(r => r.id === converted.id ? converted : r)
        : [converted, ...prev];
    });
    return converted;
  }, [db, tableName, localKey]);

  return { rows, loading, error, insert, update, remove, upsert, refresh, hasDb };
}

// ── TABLE-SPECIFIC HOOKS ──────────────────────────────────────────────────────
export const useCropRuns      = () => useTable("crop_runs",       { orderBy: "created_at", localKey: "gh_crop_runs_v1" });
export const useHouses        = () => useTable("houses",          { orderBy: "name",       localKey: "gh_houses_v3" });
export const usePads          = () => useTable("pads",            { orderBy: "name",       localKey: "gh_pads_v2" });
export const useManualTasks   = () => useTable("manual_tasks",    { orderBy: "created_at", localKey: "gh_tasks_v1" });
export const useVarieties     = () => useTable("variety_library", { orderBy: "crop_name",  localKey: "gh_variety_library" });
export const useContainers    = () => useTable("containers",      { orderBy: "name",       localKey: "gh_containers_v1" });
export const useSpacingProfiles = () => useTable("spacing_profiles", { orderBy: "name",   localKey: "gh_spacing_v1" });
export const useBrokerCatalogs = () => useTable("broker_catalogs", { orderBy: "created_at", localKey: "gh_broker_catalogs_v1" });
export const useSoilMixes     = () => useTable("soil_mixes",      { orderBy: "name",       localKey: "gh_soil_mixes_v1" });
export const useInputProducts  = () => useTable("inputs",         { orderBy: "name",       localKey: "gh_inputs_v1" });
export const useFlags         = () => useTable("flags",           { orderBy: "created_at", localKey: "gh_flags_v1" });
export const useTaskCompletions = () => useTable("task_completions", { orderBy: "completed_at", localKey: "gh_task_completions_v1" });
export const useCombos = () => useTable("combo_lots", { orderBy: "created_at", localKey: "gh_combos_v1" });
export const useMaintenanceRequests = () => useTable("maintenance_requests", { orderBy: "created_at", localKey: "gh_maintenance_v1" });
export const useCropRunTemplates2 = () => useTable("crop_run_templates", { orderBy: "saved_at", localKey: "gh_crop_run_templates_v1" });

// ── CROP RUN CODE GENERATOR ───────────────────────────────────────────────────
// Calls the atomic Supabase RPC to get a never-repeating sequence number
// Returns a code like "CR2026-0001" 
export async function getNextCropRunCode(year) {
  const db = getSupabase();
  if (!db) {
    // Fallback for localStorage mode — use timestamp-based number
    const fallback = Date.now() % 9999 + 1;
    return `CR${year}-${String(fallback).padStart(4, "0")}`;
  }
  try {
    const { data, error } = await db.rpc("next_crop_run_seq");
    if (error) throw error;
    return `CR${year}-${String(data).padStart(4, "0")}`;
  } catch (e) {
    console.error("Failed to get crop run sequence:", e);
    // Fallback: use timestamp
    const fallback = Date.now() % 9999 + 1;
    return `CR${year}-${String(fallback).padStart(4, "0")}`;
  }
}

// ── BROKER SUB-CODE ───────────────────────────────────────────────────────────
// Given a crop run code and a broker name, returns the deterministic sub-code
// Brokers sorted alphabetically → -01, -02, etc.
export function getBrokerSubCode(cropRunCode, broker, allBrokers) {
  if (!cropRunCode || !broker) return null;
  const sorted = [...allBrokers].sort();
  const idx = sorted.indexOf(broker);
  if (idx === -1) return `${cropRunCode}-01`;
  return `${cropRunCode}-${String(idx + 1).padStart(2, "0")}`;
}
export const useComboTags = () => useTable("combo_tags", { orderBy: "name", localKey: "gh_tags_v1" });
export const useOrderMeta = () => useTable("order_meta", { orderBy: "created_at", localKey: "gh_order_meta_v1" });
export const useReceiving = () => useTable("receiving_records", { orderBy: "week_key", localKey: "gh_receiving_v1" });
export const useBrokerProfiles   = () => useTable("broker_profiles",   { orderBy: "name", localKey: "gh_broker_profiles_v1" });
export const useSupplierProfiles = () => useTable("supplier_profiles", { orderBy: "name", localKey: "gh_supplier_profiles_v1" });
export const useBreederProfiles  = () => useTable("breeder_profiles",  { orderBy: "name", localKey: "gh_breeder_profiles_v1" });
export const useGrowerProfiles   = () => useTable("grower_profiles",   { orderBy: "name", localKey: "gh_grower_profiles_v1" });
export const useWateringPlans = () => useTable("watering_plans", { orderBy: "plan_date", localKey: "gh_watering_plans_v1" });
export const useWateringTasks = () => useTable("watering_tasks", { orderBy: "sort_order", localKey: "gh_watering_tasks_v1" });
export const useSprayRecords = () => useTable("spray_records", { orderBy: "applied_at", localKey: "gh_spray_records_v1" });
export const useSeasonTargets = () => useTable("season_targets", { orderBy: "target_date", localKey: "gh_season_targets_v1" });
export const usePlanningEods  = () => useTable("planning_eods",  { orderBy: "due_date",    localKey: "gh_planning_eods_v1" });
// ── Audit logging ─────────────────────────────────────────────────────────────
// Records significant actions for security/troubleshooting
export async function auditLog(action, { table, recordId, details } = {}) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData?.session?.user || null;
    await sb.from("audit_log").insert({
      user_id: user?.id || null,
      user_email: user?.email || "anon",
      action,
      table_name: table || null,
      record_id: recordId || null,
      details: details || null,
    });
  } catch { /* logging is best-effort */ }
}

// ── Authenticated fetch helper ────────────────────────────────────────────────
// Adds the current user's Supabase JWT to API requests
export async function authFetch(url, options = {}) {
  const sb = getSupabase();
  let token = null;
  if (sb) {
    const { data } = await sb.auth.getSession();
    token = data?.session?.access_token || null;
  }
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// Fall program (mums, asters, kale, fall annuals)
export const useFallProgramItems = () => useTable("fall_program_items", { orderBy: "created_at", localKey: "gh_fall_program_v1" });

// Manager tasks (voice-created tasks)
export const useManagerTasks = () => useTable("manager_tasks", { orderBy: "priority", localKey: "gh_manager_tasks_v1" });

// Owner dashboard hooks
export const useOwnerProjects = () => useTable("owner_projects", { orderBy: "created_at", localKey: "gh_owner_projects_v1" });
export const useOwnerBills    = () => useTable("owner_bills",    { orderBy: "due_date",   localKey: "gh_owner_bills_v1" });
export const useOwnerNotes    = () => useTable("owner_notes",    { orderBy: "created_at", localKey: "gh_owner_notes_v1" });
export const useAppUsers      = () => useTable("app_users",      { orderBy: "email",       localKey: "gh_app_users_v1" });

export const useHpSuppliers    = () => useTable("hp_suppliers",    { orderBy: "name",        localKey: "gh_hp_suppliers_v1" });
export const useHpAvailability = () => useTable("hp_availability", { orderBy: "plant_name",  localKey: "gh_hp_availability_v1" });
export const useHpPricing        = () => useTable("hp_pricing",        { orderBy: "plant_name",  localKey: "gh_hp_pricing_v1" });
export const useHpOrderItems     = () => useTable("hp_order_items",    { orderBy: "created_at",  localKey: "gh_hp_order_items_v1" });
export const useHpSales          = () => useTable("hp_sales",          { orderBy: "total_sales", localKey: "gh_hp_sales_v1" });
export const useHpProductLines   = () => useTable("hp_product_lines",  { orderBy: "name",        localKey: "gh_hp_product_lines_v1" });
export const useHpCultureGuides  = () => useTable("hp_culture_guides", { orderBy: "genus",       localKey: "gh_hp_culture_guides_v1" });
export const useHpCompetitorPrices = () => useTable("hp_competitor_prices", { orderBy: "plant_name", localKey: "gh_hp_competitor_v1" });

// ── SHIPPING ──────────────────────────────────────────────────────────────────
export const useShippingCustomers = () => useTable("shipping_customers", { orderBy: "company_name", ascending: true, localKey: "gh_shipping_customers_v1" });
export const useDrivers     = () => useTable("drivers",     { orderBy: "name", ascending: true, localKey: "gh_drivers_v1" });
export const useTrucks      = () => useTable("trucks",      { orderBy: "name", ascending: true, localKey: "gh_trucks_v1" });
export const useDeliveries  = () => useTable("deliveries",  { orderBy: "delivery_date", ascending: true, localKey: "gh_deliveries_v1" });
export const useDeliveryClaims = () => useTable("delivery_claims", { orderBy: "reported_at", localKey: "gh_delivery_claims_v1" });
export const useFuelFills      = () => useTable("fuel_fills",      { orderBy: "fill_date", localKey: "gh_fuel_fills_v1" });
export const useDriverAttendance = () => useTable("driver_attendance", { orderBy: "attendance_date", localKey: "gh_driver_attendance_v1" });

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
export async function sendPasswordReset(email) {
  const sb = getSupabase();
  if (!sb) return { error: { message: "No connection" } };
  return sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
}

export async function updatePassword(newPassword) {
  const sb = getSupabase();
  if (!sb) return { error: { message: "No connection" } };
  return sb.auth.updateUser({ password: newPassword });
}
