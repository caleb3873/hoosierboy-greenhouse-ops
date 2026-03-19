import { useState, useEffect, useMemo } from "react";
import { useCropRuns, useContainers, useSoilMixes } from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "gh_soil_assignments_v1";
const ACTIVE_STATUSES = ["planned", "propagating", "growing", "outside", "ready"];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function toCuFt(vol, unit) {
  if (!vol) return 0;
  const v = Number(vol);
  if (unit === "cu ft") return v;
  if (unit === "pt")    return v / 51.43;
  if (unit === "qt")    return v / 25.71;
  if (unit === "gal")   return v * 0.134;
  if (unit === "cu in") return v / 1728;
  if (unit === "L")     return v * 0.0353;
  return v;
}

function bagSizeToCuFt(size, unit) {
  if (!size) return 1;
  const v = Number(size);
  if (unit === "cu ft") return v;
  if (unit === "gal")   return v * 0.134;
  if (unit === "L")     return v * 0.0353;
  if (unit === "qt")    return v / 25.71;
  return v;
}

const fmt$ = (n) =>
  Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const fmtNum = (n, dec = 1) => Number(n).toFixed(dec);

function load(key, def) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? def;
  } catch {
    return def;
  }
}

// ── STYLE PRIMITIVES ──────────────────────────────────────────────────────────
const CARD = {
  background: "#fff",
  border: "1.5px solid #e0e8d8",
  borderRadius: 12,
  padding: "20px 22px",
  marginBottom: 20,
};

const SEL = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1.5px solid #c8d8c0",
  background: "#fff",
  fontSize: 13,
  color: "#1e2d1a",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
};

function SectionHeader({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#7fb069",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        borderBottom: "1.5px solid #e0ead8",
        paddingBottom: 8,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function StatPill({ label, value, color = "#7fb069", sub }) {
  return (
    <div
      style={{
        background: color + "14",
        border: `1.5px solid ${color}33`,
        borderRadius: 12,
        padding: "14px 20px",
        minWidth: 130,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, color: "#1e2d1a", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{sub}</div>
      )}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#7a8c74",
          textTransform: "uppercase",
          letterSpacing: 0.7,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SoilCalculator() {
  const { rows: cropRuns }  = useCropRuns();
  const { rows: containers } = useContainers();
  const { rows: soilMixes }  = useSoilMixes();

  // assignments: { [containerId]: soilMixId }
  const [assignments, setAssignments] = useState(() => load(STORAGE_KEY, {}));
  const [defaultMixId, setDefaultMixId] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  // Persist assignments to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  }, [assignments]);

  // ── Filter to active runs ──────────────────────────────────────────────────
  const activeRuns = useMemo(
    () => cropRuns.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [cropRuns]
  );

  // ── Build container lookup ─────────────────────────────────────────────────
  const containerMap = useMemo(() => {
    const m = {};
    containers.forEach((c) => (m[c.id] = c));
    return m;
  }, [containers]);

  // ── Build soil mix lookup ──────────────────────────────────────────────────
  const soilMap = useMemo(() => {
    const m = {};
    soilMixes.forEach((s) => (m[s.id] = s));
    return m;
  }, [soilMixes]);

  // ── Per-run volume calculations ────────────────────────────────────────────
  const enrichedRuns = useMemo(() => {
    return activeRuns.map((run) => {
      const container = containerMap[run.containerId];
      const volPerUnit = container
        ? toCuFt(container.substrateVol, container.substrateUnit)
        : 0;
      const totalUnits = (run.cases || 0) * (run.packSize || 1);
      const totalVolCuFt = volPerUnit * totalUnits;

      // Resolve assigned mix: per container > default > none
      const mixId =
        assignments[run.containerId] ||
        (defaultMixId && !assignments[run.containerId] ? defaultMixId : null);

      return {
        ...run,
        container,
        volPerUnit,
        totalUnits,
        totalVolCuFt,
        assignedMixId: mixId || null,
      };
    });
  }, [activeRuns, containerMap, assignments, defaultMixId]);

  // ── Group by containerId for assignment UI ────────────────────────────────
  const containerGroups = useMemo(() => {
    const groups = {};
    enrichedRuns.forEach((run) => {
      const cid = run.containerId || "__none__";
      if (!groups[cid]) {
        groups[cid] = {
          containerId: cid,
          container: run.container || null,
          runs: [],
          totalUnits: 0,
          totalVolCuFt: 0,
          assignedMixId:
            assignments[cid] ||
            (defaultMixId ? defaultMixId : null),
        };
      }
      groups[cid].runs.push(run);
      groups[cid].totalUnits += run.totalUnits;
      groups[cid].totalVolCuFt += run.totalVolCuFt;
    });
    return Object.values(groups);
  }, [enrichedRuns, assignments, defaultMixId]);

  // ── Aggregate by soil mix for order summary ───────────────────────────────
  const mixSummary = useMemo(() => {
    const byMix = {};
    containerGroups.forEach((grp) => {
      const mixId = grp.assignedMixId;
      if (!mixId) return;
      const mix = soilMap[mixId];
      if (!mix) return;
      if (!byMix[mixId]) {
        byMix[mixId] = {
          mix,
          totalUnits: 0,
          totalVolCuFt: 0,
          assignedContainerCount: 0,
          assignedRunCount: 0,
        };
      }
      byMix[mixId].totalUnits += grp.totalUnits;
      byMix[mixId].totalVolCuFt += grp.totalVolCuFt;
      byMix[mixId].assignedContainerCount += 1;
      byMix[mixId].assignedRunCount += grp.runs.length;
    });

    return Object.values(byMix).map((entry) => {
      const bagSizeCuFt = bagSizeToCuFt(entry.mix.bagSize, entry.mix.bagUnit);
      const bagsNeeded = bagSizeCuFt > 0 ? Math.ceil(entry.totalVolCuFt / bagSizeCuFt) : 0;
      const bagsPerPallet = entry.mix.bagsPerPallet || 1;
      const palletsNeeded = Math.ceil(bagsNeeded / bagsPerPallet);
      const totalCost = bagsNeeded * (entry.mix.costPerBag || 0);
      return { ...entry, bagSizeCuFt, bagsNeeded, palletsNeeded, totalCost };
    });
  }, [containerGroups, soilMap]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalRuns = activeRuns.length;
  const totalUnits = enrichedRuns.reduce((s, r) => s + r.totalUnits, 0);
  const totalVolCuFt = enrichedRuns.reduce((s, r) => s + r.totalVolCuFt, 0);
  const totalCost = mixSummary.reduce((s, m) => s + m.totalCost, 0);
  const unassignedCount = containerGroups.filter((g) => !g.assignedMixId).length;

  // ── Assignment handler ─────────────────────────────────────────────────────
  function setContainerMix(containerId, mixId) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (!mixId) {
        delete next[containerId];
      } else {
        next[containerId] = mixId;
      }
      return next;
    });
  }

  // ── Apply default to all unassigned ──────────────────────────────────────
  function applyDefaultToAll() {
    if (!defaultMixId) return;
    const next = { ...assignments };
    containerGroups.forEach((grp) => {
      if (!next[grp.containerId]) {
        next[grp.containerId] = defaultMixId;
      }
    });
    setAssignments(next);
  }

  // ── Copy order to clipboard ───────────────────────────────────────────────
  function copyOrder() {
    const lines = [
      "SOIL ORDER SUMMARY",
      `Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      "",
    ];
    mixSummary.forEach((entry) => {
      lines.push(`${entry.mix.name} (${entry.mix.vendor || "No vendor"})`);
      lines.push(
        `  Bag: ${entry.mix.bagSize} ${entry.mix.bagUnit}  |  ${fmtNum(entry.totalVolCuFt)} cu ft needed`
      );
      lines.push(
        `  Bags: ${entry.bagsNeeded}  |  Pallets: ${entry.palletsNeeded}  |  Cost: ${fmt$(entry.totalCost)}`
      );
      lines.push("");
    });
    lines.push(`GRAND TOTAL: ${fmt$(totalCost)}`);
    lines.push(`Total Volume: ${fmtNum(totalVolCuFt)} cu ft`);

    const text = lines.join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyMsg("Copied!");
        setTimeout(() => setCopyMsg(""), 2000);
      })
      .catch(() => {
        setCopyMsg("Copy failed");
        setTimeout(() => setCopyMsg(""), 2000);
      });
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: 26,
            color: "#1e2d1a",
            marginBottom: 4,
          }}
        >
          Soil Calculator
        </div>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>
          Auto-calculated substrate needs from active crop runs
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatPill
          label="Active Crop Runs"
          value={totalRuns}
          color="#4a90d9"
        />
        <StatPill
          label="Total Units"
          value={totalUnits.toLocaleString()}
          color="#8e44ad"
        />
        <StatPill
          label="Substrate Needed"
          value={`${fmtNum(totalVolCuFt)} cu ft`}
          color="#7fb069"
        />
        <StatPill
          label="Estimated Cost"
          value={fmt$(totalCost)}
          color="#c8791a"
          sub={unassignedCount > 0 ? `${unassignedCount} container${unassignedCount > 1 ? "s" : ""} unassigned` : undefined}
        />
      </div>

      {/* ── SOIL ASSIGNMENTS ── */}
      <div style={CARD}>
        <SectionHeader>Soil Mix Assignments</SectionHeader>

        {/* Default Mix selector */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
            background: "#f8faf6",
            border: "1.5px solid #e0e8d8",
            borderRadius: 10,
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#7a8c74",
              textTransform: "uppercase",
              letterSpacing: 0.7,
              whiteSpace: "nowrap",
            }}
          >
            Default Mix
          </div>
          <select
            style={{ ...SEL, flex: 1, minWidth: 180 }}
            value={defaultMixId}
            onChange={(e) => setDefaultMixId(e.target.value)}
          >
            <option value="">— None —</option>
            {soilMixes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.vendor ? ` (${m.vendor})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={applyDefaultToAll}
            disabled={!defaultMixId}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "none",
              background: defaultMixId ? "#7fb069" : "#c8d8c0",
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: defaultMixId ? "pointer" : "default",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            Apply to Unassigned
          </button>
          <div style={{ fontSize: 12, color: "#7a8c74" }}>
            Sets all unassigned containers to this mix
          </div>
        </div>

        {/* Container groups table */}
        {containerGroups.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "#aabba0",
              fontSize: 14,
            }}
          >
            No active crop runs found. Add crop runs with status Planned, Propagating, Growing,
            Outside, or Ready.
          </div>
        ) : (
          <div>
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.8fr 0.8fr 1fr 1.2fr 1.8fr",
                gap: 8,
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: "#7a8c74",
                textTransform: "uppercase",
                letterSpacing: 0.7,
                borderBottom: "1.5px solid #e0ead8",
                marginBottom: 4,
              }}
            >
              <div>Container</div>
              <div>Runs</div>
              <div>Units</div>
              <div>Volume (cu ft)</div>
              <div>Assign Mix</div>
            </div>

            {containerGroups.map((grp) => {
              const cid = grp.containerId;
              const currentMixId = assignments[cid] || "";
              const effectiveMixId = currentMixId || defaultMixId || "";
              const isDefault = !currentMixId && !!defaultMixId;

              return (
                <div
                  key={cid}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 0.8fr 1fr 1.2fr 1.8fr",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: effectiveMixId ? "#f8faf6" : "#fffbf8",
                    border: `1px solid ${effectiveMixId ? "#ddeedd" : "#f0e0d0"}`,
                    marginBottom: 4,
                    alignItems: "center",
                  }}
                >
                  {/* Container name */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>
                      {grp.container
                        ? grp.container.name
                        : cid === "__none__"
                        ? "No Container"
                        : `Container #${cid.slice(0, 6)}`}
                    </div>
                    {grp.container && (
                      <div style={{ fontSize: 11, color: "#7a8c74" }}>
                        {grp.container.diameter ? `${grp.container.diameter}"` : ""}
                        {grp.container.substrateVol
                          ? ` · ${grp.container.substrateVol} ${grp.container.substrateUnit}`
                          : ""}
                        {grp.container.substrateVol
                          ? ` (${fmtNum(toCuFt(grp.container.substrateVol, grp.container.substrateUnit), 3)} cu ft/unit)`
                          : ""}
                      </div>
                    )}
                  </div>

                  {/* Run count */}
                  <div style={{ fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>
                    {grp.runs.length}
                  </div>

                  {/* Total units */}
                  <div style={{ fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>
                    {grp.totalUnits.toLocaleString()}
                  </div>

                  {/* Volume */}
                  <div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: grp.totalVolCuFt > 0 ? "#1e2d1a" : "#aabba0",
                      }}
                    >
                      {fmtNum(grp.totalVolCuFt)}
                    </span>
                    {grp.totalVolCuFt === 0 && (
                      <div style={{ fontSize: 10, color: "#c8791a", marginTop: 1 }}>
                        No substrate vol set
                      </div>
                    )}
                  </div>

                  {/* Mix selector */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <select
                      style={{ ...SEL, flex: 1, fontSize: 12 }}
                      value={currentMixId}
                      onChange={(e) => setContainerMix(cid, e.target.value)}
                    >
                      <option value="">
                        {defaultMixId
                          ? `Default: ${soilMap[defaultMixId]?.name || "Unknown"}`
                          : "— Assign Mix —"}
                      </option>
                      {soilMixes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    {isDefault && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#7a8c74",
                          fontStyle: "italic",
                          whiteSpace: "nowrap",
                        }}
                      >
                        default
                      </span>
                    )}
                    {currentMixId && (
                      <button
                        onClick={() => setContainerMix(cid, "")}
                        title="Clear override"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          border: "1px solid #e0e0e0",
                          background: "#f5f5f5",
                          color: "#7a8c74",
                          fontSize: 13,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MIX BREAKDOWN ── */}
      {mixSummary.length > 0 && (
        <div style={CARD}>
          <SectionHeader>Mix Breakdown</SectionHeader>
          <div>
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 0.8fr 1fr 1fr 0.8fr 0.9fr 1fr",
                gap: 8,
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: "#7a8c74",
                textTransform: "uppercase",
                letterSpacing: 0.7,
                borderBottom: "1.5px solid #e0ead8",
                marginBottom: 4,
              }}
            >
              <div>Mix</div>
              <div>Runs</div>
              <div>Units</div>
              <div>Volume (cu ft)</div>
              <div>Bags</div>
              <div>Pallets</div>
              <div>Cost</div>
            </div>

            {mixSummary.map((entry) => (
              <div
                key={entry.mix.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 0.8fr 1fr 1fr 0.8fr 0.9fr 1fr",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#f8faf6",
                  border: "1px solid #e0e8d8",
                  marginBottom: 4,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>
                    {entry.mix.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>
                    {entry.mix.vendor || ""}
                    {entry.mix.bagSize
                      ? `${entry.mix.vendor ? " · " : ""}${entry.mix.bagSize} ${entry.mix.bagUnit} bags`
                      : ""}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>
                  {entry.assignedRunCount}
                </div>
                <div style={{ fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>
                  {entry.totalUnits.toLocaleString()}
                </div>
                <div style={{ fontSize: 13, color: "#1e2d1a", fontWeight: 700 }}>
                  {fmtNum(entry.totalVolCuFt)}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>
                  {entry.bagsNeeded.toLocaleString()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#4a90d9" }}>
                  {entry.palletsNeeded}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#7fb069" }}>
                  {fmt$(entry.totalCost)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ORDER SUMMARY ── */}
      <div style={CARD}>
        <SectionHeader>Order Summary</SectionHeader>

        {mixSummary.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "#aabba0",
              fontSize: 14,
            }}
          >
            Assign soil mixes to containers above to generate an order summary.
          </div>
        ) : (
          <div>
            {/* Per-mix rows */}
            {mixSummary.map((entry) => (
              <div
                key={entry.mix.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1.5px solid #e0e8d8",
                  marginBottom: 10,
                  background: "#fff",
                }}
              >
                {/* Mix info */}
                <div style={{ flex: "1 1 180px", minWidth: 140 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>
                    {entry.mix.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                    {entry.mix.vendor || "No vendor"} ·{" "}
                    {entry.mix.bagSize} {entry.mix.bagUnit}/bag ·{" "}
                    {fmt$(entry.mix.costPerBag || 0)}/bag
                  </div>
                </div>

                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    flex: "2 1 300px",
                  }}
                >
                  <StatChip label="Volume" value={`${fmtNum(entry.totalVolCuFt)} cu ft`} />
                  <StatChip label="Bags to Order" value={entry.bagsNeeded.toLocaleString()} accent />
                  <StatChip
                    label={`Pallets (${entry.mix.bagsPerPallet || 1}/plt)`}
                    value={entry.palletsNeeded}
                    color="#4a90d9"
                  />
                  <StatChip label="Cost" value={fmt$(entry.totalCost)} color="#c8791a" />
                </div>
              </div>
            ))}

            {/* Grand Total */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                background: "#1e2d1a",
                borderRadius: 10,
                marginTop: 4,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ color: "#c8e6b8", fontSize: 14, fontWeight: 700 }}>
                Grand Total
                <span style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 400, marginLeft: 8 }}>
                  {mixSummary.reduce((s, e) => s + e.bagsNeeded, 0).toLocaleString()} bags ·{" "}
                  {mixSummary.reduce((s, e) => s + e.palletsNeeded, 0)} pallets ·{" "}
                  {fmtNum(totalVolCuFt)} cu ft
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#7fb069" }}>
                  {fmt$(totalCost)}
                </div>
                <button
                  onClick={copyOrder}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: copyMsg === "Copied!" ? "#4a90d9" : "#7fb069",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background .2s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copyMsg || "Copy Order"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── STAT CHIP ─────────────────────────────────────────────────────────────────
function StatChip({ label, value, accent, color }) {
  const c = color || (accent ? "#7fb069" : "#7a8c74");
  return (
    <div
      style={{
        background: c + "12",
        border: `1px solid ${c}30`,
        borderRadius: 8,
        padding: "6px 12px",
        textAlign: "center",
        minWidth: 70,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{value}</div>
      <div
        style={{
          fontSize: 10,
          color: "#7a8c74",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 1,
        }}
      >
        {label}
      </div>
    </div>
  );
}
