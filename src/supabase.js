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
        !["varieties","indoorAssignments","outsideAssignments","zones","sections","stages","items","spacing","details","priceHistory","inventoryHistory"].includes(k)
        ? toSnake(v)
        : v,
    ])
  );
}

// ── GENERIC TABLE HOOK ────────────────────────────────────────────────────────
// useTable("crop_runs") → { rows, loading, error, insert, update, remove, refresh }
export function useTable(tableName, { orderBy = "created_at", localKey = null } = {}) {
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
        .order(orderBy, { ascending: false });
      if (err) throw err;
      if (mounted.current) setRows(toCamel(data || []));
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [db, tableName, orderBy]);

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
