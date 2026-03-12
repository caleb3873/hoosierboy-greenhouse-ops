import { useState, useEffect } from "react";
import {
  useCropRuns, useContainers, useHouses, usePads,
  useVarieties, useSoilMixes, useInputProducts,
  useSpacingProfiles, useBrokerCatalogs, useFlags,
  useManualTasks, useOrderMeta, useReceiving
} from "./supabase";

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function weekToDate(week, year) {
  if (!week || !year) return "";
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function subtractWeeks(week, year, n) {
  let w = week - n, y = year;
  while (w < 1) { w += 52; y--; }
  return { week: w, year: y };
}

function scheduleFor(run) {
  const tw = Number(run.targetWeek), ty = Number(run.targetYear);
  if (!tw || !ty) return null;
  const totalFinish = (Number(run.weeksIndoor) || 0) + (Number(run.weeksOutdoor) || 0);
  const propWks = Number(run.weeksProp) || 0;
  const transplant = subtractWeeks(tw, ty, totalFinish);
  const seed = propWks > 0 ? subtractWeeks(transplant.week, transplant.year, propWks) : null;
  const moveOut = run.weeksOutdoor > 0 ? subtractWeeks(tw, ty, Number(run.weeksOutdoor)) : null;
  return { transplant, seed, moveOut, ready: { week: tw, year: ty } };
}

function ensureXLSX() {
  return new Promise((resolve) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    document.head.appendChild(script);
  });
}

function downloadXLSX(wb, filename) {
  const wbout = window.XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Style helpers for SheetJS cell objects
function hdrCell(v) { return { v, t: "s", s: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E2D1A" } }, alignment: { horizontal: "center" } } }; }
function cell(v, fmt)  { return { v: v ?? "", t: typeof v === "number" ? "n" : "s", z: fmt || undefined }; }
function dateCell(v)   { return { v: v || "", t: "s", s: { alignment: { horizontal: "center" } } }; }

function setColWidths(ws, widths) {
  ws["!cols"] = widths.map(w => ({ wch: w }));
}

// ── SHEET BUILDERS ────────────────────────────────────────────────────────────

function buildCropRunsSheet(runs, containers, houses, pads) {
  const headers = [
    "Crop Name", "Group #", "Status", "Container",
    "Cases", "Pack Size", "Total Units",
    "Material Type", "Broker", "Supplier", "Unit Cost",
    "Prop Weeks", "Indoor Weeks", "Outdoor Weeks",
    "Seed/Order Wk", "Seed/Order Date",
    "Transplant Wk", "Transplant Date",
    "Move Out Wk", "Move Out Date",
    "Ready Wk", "Ready Date",
    "House / Zone", "Sensitivity", "Notes",
    "Varieties"
  ];

  const rows = [headers.map(hdrCell)];

  for (const run of runs) {
    const sched   = scheduleFor(run);
    const cont    = containers.find(c => c.id === run.containerId);
    const cases   = Number(run.cases) || 0;
    const pack    = Number(run.packSize) || 10;
    const total   = cases * pack;

    // Resolve space assignments
    const spaces = [
      ...(run.indoorAssignments || []).map(a => {
        const h = houses.find(h => h.id === a.houseId);
        return h ? `${h.name}${a.zoneName ? ` / ${a.zoneName}` : ""}` : "";
      }),
      ...(run.outsideAssignments || []).map(a => {
        const p = pads.find(p => p.id === a.padId);
        return p ? p.name : "";
      }),
    ].filter(Boolean).join(", ");

    const varieties = (run.varieties || []).map(v =>
      [v.cultivar, v.name || v.color].filter(Boolean).join(" ") +
      (v.cases ? ` (${v.cases} cs)` : "")
    ).join(" | ");

    rows.push([
      cell(run.cropName),
      cell(run.groupNumber),
      cell(run.status),
      cell(cont?.name || ""),
      cell(cases, "#,##0"),
      cell(pack, "#,##0"),
      cell(total, "#,##0"),
      cell(run.materialType?.toUpperCase() || ""),
      cell(run.sourcingBroker || ""),
      cell(run.sourcingSupplier || ""),
      cell(run.unitCost ? Number(run.unitCost) : "", "$#,##0.0000"),
      cell(run.weeksProp ? Number(run.weeksProp) : ""),
      cell(run.weeksIndoor ? Number(run.weeksIndoor) : ""),
      cell(run.weeksOutdoor ? Number(run.weeksOutdoor) : ""),
      cell(sched?.seed ? `Wk ${sched.seed.week}` : ""),
      dateCell(sched?.seed ? weekToDate(sched.seed.week, sched.seed.year) : ""),
      cell(sched?.transplant ? `Wk ${sched.transplant.week}` : ""),
      dateCell(sched?.transplant ? weekToDate(sched.transplant.week, sched.transplant.year) : ""),
      cell(sched?.moveOut ? `Wk ${sched.moveOut.week}` : ""),
      dateCell(sched?.moveOut ? weekToDate(sched.moveOut.week, sched.moveOut.year) : ""),
      cell(sched?.ready ? `Wk ${sched.ready.week}` : ""),
      dateCell(sched?.ready ? weekToDate(sched.ready.week, sched.ready.year) : ""),
      cell(spaces),
      cell(run.sensitivity || ""),
      cell(run.notes || ""),
      cell(varieties),
    ]);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [20, 8, 12, 16, 8, 8, 10, 10, 18, 16, 10, 8, 8, 8, 10, 16, 10, 16, 10, 16, 10, 16, 24, 12, 30, 40]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildVarietiesSheet(runs) {
  const headers = ["Crop Run", "Status", "Cultivar", "Variety / Color", "Cases", "Cost/Unit", "Broker Item #", "Broker", "Notes"];
  const rows = [headers.map(hdrCell)];

  for (const run of runs) {
    for (const v of (run.varieties || [])) {
      rows.push([
        cell(run.cropName),
        cell(run.status),
        cell(v.cultivar || ""),
        cell(v.name || v.color || ""),
        cell(v.cases ? Number(v.cases) : "", "#,##0"),
        cell(v.costPerUnit ? Number(v.costPerUnit) : "", "$#,##0.0000"),
        cell(v.ballItemNumber || v.itemNumber || ""),
        cell(v.broker || run.sourcingBroker || ""),
        cell(v.notes || ""),
      ]);
    }
  }

  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [22, 12, 18, 20, 8, 10, 14, 16, 30]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildOrdersSheet(runs, containers) {
  // Group by broker — only planned/propagating runs that haven't been ordered
  const headers = ["Broker", "Crop", "Cultivar / Color", "Item #", "Form", "Qty (units)", "Cases", "Cost/Unit", "Total Est. Cost", "Need By Wk", "Need By Date", "Status"];
  const rows = [headers.map(hdrCell)];

  const orderRows = [];
  for (const run of runs) {
    if (["shipped", "ready"].includes(run.status)) continue;
    const sched = scheduleFor(run);
    const needByWk = sched?.seed || sched?.transplant;
    for (const v of (run.varieties || [])) {
      const cases = Number(v.cases) || 0;
      const pack  = Number(run.packSize) || 10;
      const units = cases * pack;
      const cost  = v.costPerUnit ? Number(v.costPerUnit) : (run.unitCost ? Number(run.unitCost) : null);
      orderRows.push({
        broker:  v.broker || run.sourcingBroker || "",
        crop:    run.cropName,
        variety: [v.cultivar, v.name || v.color].filter(Boolean).join(" ") || "—",
        itemNum: v.ballItemNumber || v.itemNumber || "",
        form:    run.materialType?.toUpperCase() || "",
        units, cases,
        costPerUnit: cost,
        totalCost: cost && units ? cost * units : null,
        needByWk: needByWk ? `Wk ${needByWk.week}` : "",
        needByDate: needByWk ? weekToDate(needByWk.week, needByWk.year) : "",
        status: run.status,
      });
    }
  }

  // Sort by broker then need-by week
  orderRows.sort((a, b) => a.broker.localeCompare(b.broker) || a.needByWk.localeCompare(b.needByWk));

  for (const r of orderRows) {
    rows.push([
      cell(r.broker), cell(r.crop), cell(r.variety), cell(r.itemNum),
      cell(r.form), cell(r.units, "#,##0"), cell(r.cases, "#,##0"),
      cell(r.costPerUnit ?? "", "$#,##0.0000"),
      cell(r.totalCost ?? "", "$#,##0.00"),
      cell(r.needByWk), dateCell(r.needByDate), cell(r.status),
    ]);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [18, 20, 24, 12, 8, 10, 8, 10, 12, 10, 16, 12]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildWeeklyCalSheet(runs) {
  // All key dates in week order — good for a wall-calendar overview
  const events = [];
  for (const run of runs) {
    const sched = scheduleFor(run);
    if (!sched) continue;
    if (sched.seed) events.push({ week: sched.seed.week, year: sched.seed.year, type: "Order / Seed", crop: run.cropName, status: run.status });
    events.push({ week: sched.transplant.week, year: sched.transplant.year, type: "Transplant", crop: run.cropName, status: run.status });
    if (sched.moveOut) events.push({ week: sched.moveOut.week, year: sched.moveOut.year, type: "Move Outside", crop: run.cropName, status: run.status });
    events.push({ week: sched.ready.week, year: sched.ready.year, type: "Ready / Ship", crop: run.cropName, status: run.status });
  }
  events.sort((a, b) => (a.year - b.year) * 100 + (a.week - b.week));

  const headers = ["Week #", "Week Of", "Event Type", "Crop", "Status"];
  const rows = [headers.map(hdrCell)];
  for (const e of events) {
    rows.push([
      cell(`Wk ${e.week}`),
      dateCell(weekToDate(e.week, e.year)),
      cell(e.type),
      cell(e.crop),
      cell(e.status),
    ]);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [8, 18, 16, 22, 12]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildSpaceSheet(houses, pads) {
  const headers = ["Name", "Type", "Dimensions", "Sq Ft", "Active", "Notes"];
  const rows = [headers.map(hdrCell)];

  for (const h of houses) {
    rows.push([
      cell(h.name), cell("Greenhouse"),
      cell(h.width && h.length ? `${h.width}' × ${h.length}'` : ""),
      cell(h.sqft ? Number(h.sqft) : "", "#,##0"),
      cell(h.active !== false ? "Yes" : "No"),
      cell(h.notes || ""),
    ]);
    for (const z of (h.zones || [])) {
      rows.push([
        cell(`  └ ${z.name}`), cell("Zone / Bench"),
        cell(z.width && z.length ? `${z.width}' × ${z.length}'` : ""),
        cell(z.sqft ? Number(z.sqft) : "", "#,##0"),
        cell(""), cell(z.notes || ""),
      ]);
    }
  }
  for (const p of pads) {
    rows.push([
      cell(p.name), cell("Outdoor Pad"),
      cell(p.width && p.length ? `${p.width}' × ${p.length}'` : ""),
      cell(p.sqft ? Number(p.sqft) : "", "#,##0"),
      cell(p.active !== false ? "Yes" : "No"),
      cell(p.notes || ""),
    ]);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [28, 14, 16, 10, 8, 30]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildContainersSheet(containers) {
  const headers = ["Name", "Type", "Diameter (in)", "Volume", "Cells/Flat", "Supplier", "Cost/Unit", "Stock Qty", "Notes"];
  const rows = [headers.map(hdrCell)];
  for (const c of containers) {
    rows.push([
      cell(c.name), cell(c.type || c.kind || ""),
      cell(c.diameterIn ? Number(c.diameterIn) : "", "#,##0.0"),
      cell(c.volumeVal ? `${c.volumeVal} ${c.volumeUnit || ""}`.trim() : ""),
      cell(c.cellsPerFlat ? Number(c.cellsPerFlat) : ""),
      cell(c.supplier || ""),
      cell(c.costPerUnit ? Number(c.costPerUnit) : "", "$#,##0.0000"),
      cell(c.stockQty ? Number(c.stockQty) : ""),
      cell(c.notes || ""),
    ]);
  }
  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [24, 14, 12, 12, 10, 16, 10, 10, 30]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildVarietyLibSheet(varieties) {
  const headers = ["Crop Name", "Variety", "Breeder", "Type", "Prop Tray", "Prop Weeks", "Finish Weeks", "Light", "Spacing", "Notes"];
  const rows = [headers.map(hdrCell)];
  for (const v of varieties) {
    rows.push([
      cell(v.cropName || v.crop_name || ""),
      cell(v.variety || ""),
      cell(v.breeder || ""),
      cell(v.type || ""),
      cell(v.propTraySize || v.prop_tray_size || ""),
      cell(v.propWeeks ?? v.prop_weeks ?? ""),
      cell(v.finishWeeks ?? v.finish_weeks ?? ""),
      cell(v.lightRequirement || v.light_requirement || ""),
      cell(v.spacing || ""),
      cell(v.generalNotes || v.notes || ""),
    ]);
  }
  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [20, 22, 16, 12, 10, 10, 10, 12, 10, 40]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildFlagsSheet(flags) {
  const headers = ["Date", "Title", "Category", "Location", "Notes", "Resolved"];
  const rows = [headers.map(hdrCell)];
  for (const f of flags) {
    rows.push([
      dateCell(f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""),
      cell(f.title || f.description || ""),
      cell(f.category || ""),
      cell(f.location || ""),
      cell(f.notes || ""),
      cell(f.resolved ? "Yes" : "No"),
    ]);
  }
  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [14, 30, 14, 20, 40, 10]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

// ── EXPORT ENGINE ─────────────────────────────────────────────────────────────

function buildAccessoriesSheet(runs, containers) {
  // Build accessory order totals grouped by supplier
  const lines = {}; // key: "supplier|item" → {supplier, item, sku, costEach, qty, totalCost}

  function addLine(supplier, item, sku, costEach, qty) {
    if (!qty || qty <= 0) return;
    const key = `${supplier}||${item}`;
    if (!lines[key]) lines[key] = { supplier: supplier || "Unknown", item, sku: sku || "", costEach: costEach || 0, qty: 0 };
    lines[key].qty += qty;
  }

  for (const run of runs) {
    const cont = containers.find(c => c.id === run.containerId);
    if (!cont) continue;
    const cases  = Number(run.cases) || 0;
    const pack   = Number(run.packSize) || 10;
    const units  = cases * pack;
    if (units <= 0) continue;

    // Tray
    if (cont.hasTray && cont.trayCost) {
      const potsPerTray = Number(cont.traysPerCase) || 1;
      const traysNeeded = Math.ceil(units / potsPerTray);
      addLine(cont.traySupplier || cont.supplier, cont.trayName || `Tray for ${cont.name}`, cont.traySku, Number(cont.trayCost), traysNeeded);
    }
    // Wire
    if (cont.hasWire && cont.wireCost) {
      addLine(cont.wireSupplier || cont.supplier, `Wire Hanger for ${cont.name}`, cont.wireSku, Number(cont.wireCost), units);
    }
    // Saucer
    if (cont.hasSaucer && cont.saucerCost) {
      addLine(cont.saucerSupplier || cont.supplier, cont.saucerName || `Saucer for ${cont.name}`, cont.saucerSku, Number(cont.saucerCost), units);
    }
    // Sleeve
    if (cont.hasSleeve && cont.sleeveCost) {
      addLine(cont.sleeveSupplier, `${cont.diameterIn || ""}${cont.diameterIn ? '"' : ""} Sleeve`, cont.sleeveSku, Number(cont.sleeveCost), units);
    }
    // HB Tag
    if (cont.isHBTagged && cont.tagCostPerUnit) {
      addLine(cont.tagSupplier, "Hoosier Boy Branded Tag", cont.tagSku, Number(cont.tagCostPerUnit), units);
    }
  }

  const rows = Object.values(lines).sort((a,b) => a.supplier.localeCompare(b.supplier) || a.item.localeCompare(b.item));

  const headers = ["Supplier", "Item", "SKU", "Qty Needed", "Cost Each", "Total Est. Cost"];
  const sheetRows = [headers.map(hdrCell)];

  let currentSupplier = null;
  let supplierTotal = 0;
  const supplierStartRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.supplier !== currentSupplier) {
      if (currentSupplier !== null) {
        sheetRows.push([cell(""), cell(""), cell(""), cell(""), cell("SUBTOTAL →"), cell(supplierTotal, "$#,##0.00")]);
        supplierTotal = 0;
      }
      currentSupplier = r.supplier;
    }
    const lineCost = r.costEach * r.qty;
    supplierTotal += lineCost;
    sheetRows.push([
      cell(r.supplier), cell(r.item), cell(r.sku),
      cell(r.qty, "#,##0"),
      cell(r.costEach, "$#,##0.0000"),
      cell(lineCost, "$#,##0.00"),
    ]);
  }

  // Final subtotal
  if (currentSupplier) {
    sheetRows.push([cell(""), cell(""), cell(""), cell(""), cell("SUBTOTAL →"), cell(supplierTotal, "$#,##0.00")]);
  }

  // Grand total
  const grandTotal = Object.values(lines).reduce((s,r) => s + r.costEach * r.qty, 0);
  sheetRows.push([cell(""), cell(""), cell(""), cell(""), cell("GRAND TOTAL →"), cell(grandTotal, "$#,##0.00")]);

  const ws = window.XLSX.utils.aoa_to_sheet(sheetRows);
  setColWidths(ws, [22, 30, 14, 12, 12, 14]);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

async function runExport({ runs, containers, houses, pads, varieties, flags, options }) {
  await ensureXLSX();
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Cover / summary sheet
  const summaryData = [
    [{ v: "Hoosier Boy Greenhouse — Production Backup", t: "s", s: { font: { bold: true, sz: 16 } } }],
    [{ v: `Exported: ${dateStr}`, t: "s" }],
    [[]],
    [hdrCell("Sheet"), hdrCell("Description"), hdrCell("Record Count")],
  ];
  if (options.cropRuns)    summaryData.push([cell("Crop Runs"),     cell("All production runs with schedule dates"), cell(runs.length, "#,##0")]);
  if (options.varieties)   summaryData.push([cell("Varieties"),     cell("All varieties broken out by crop run"),   cell(runs.reduce((n,r) => n + (r.varieties?.length||0), 0), "#,##0")]);
  if (options.orders)      summaryData.push([cell("Order List"),    cell("Pending orders grouped by broker"),       cell(runs.filter(r => !["shipped","ready"].includes(r.status)).length, "#,##0")]);
  if (options.calendar)    summaryData.push([cell("Weekly Calendar"),cell("All key dates in week order"),          cell(runs.filter(r => r.targetWeek).length * 3, "#,##0")]);
  if (options.space)       summaryData.push([cell("Space"),         cell("Houses, zones, and outdoor pads"),       cell(houses.length + pads.length, "#,##0")]);
  if (options.containers)  summaryData.push([cell("Containers"),    cell("Container library"),                      cell(containers.length, "#,##0")]);
  if (options.varLib)      summaryData.push([cell("Variety Library"),cell("Variety culture guide library"),        cell(varieties.length, "#,##0")]);
  if (options.flags)       summaryData.push([cell("Flags"),         cell("Floor flags log"),                       cell(flags.length, "#,##0")]);
  if (options.accessories) summaryData.push([cell("Accessories Order"), cell("Pre-order list grouped by supplier"), cell("—")]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  setColWidths(summaryWs, [20, 40, 14]);
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  if (options.cropRuns)   XLSX.utils.book_append_sheet(wb, buildCropRunsSheet(runs, containers, houses, pads), "Crop Runs");
  if (options.varieties)  XLSX.utils.book_append_sheet(wb, buildVarietiesSheet(runs), "Varieties");
  if (options.orders)     XLSX.utils.book_append_sheet(wb, buildOrdersSheet(runs, containers), "Order List");
  if (options.calendar)   XLSX.utils.book_append_sheet(wb, buildWeeklyCalSheet(runs), "Weekly Calendar");
  if (options.space)      XLSX.utils.book_append_sheet(wb, buildSpaceSheet(houses, pads), "Space");
  if (options.containers) XLSX.utils.book_append_sheet(wb, buildContainersSheet(containers), "Containers");
  if (options.varLib)     XLSX.utils.book_append_sheet(wb, buildVarietyLibSheet(varieties), "Variety Library");
  if (options.flags)       XLSX.utils.book_append_sheet(wb, buildFlagsSheet(flags), "Flags");
  if (options.accessories) XLSX.utils.book_append_sheet(wb, buildAccessoriesSheet(runs, containers), "Accessories Order");

  const season = runs[0]?.targetYear || now.getFullYear();
  downloadXLSX(wb, `HoosierBoy_Production_Backup_${season}_${now.toISOString().slice(0,10)}.xlsx`);
}

// ── UI ────────────────────────────────────────────────────────────────────────
const EXPORT_OPTIONS = [
  { id: "cropRuns",    label: "Crop Runs",       desc: "All runs with full schedule (order, transplant, ready dates)", icon: "🌱", default: true },
  { id: "varieties",   label: "Varieties",        desc: "Every variety broken out by crop run with costs", icon: "🌸", default: true },
  { id: "orders",      label: "Order List",       desc: "Pending orders grouped by broker — ready to hand off", icon: "📋", default: true },
  { id: "calendar",    label: "Weekly Calendar",  desc: "All key dates sorted by week number", icon: "📅", default: true },
  { id: "space",       label: "Space",            desc: "Houses, zones, outdoor pads", icon: "🏗️", default: false },
  { id: "containers",  label: "Containers",       desc: "Container library with sizing and costs", icon: "🪴", default: false },
  { id: "varLib",      label: "Variety Library",  desc: "Culture guide data for all saved varieties", icon: "📚", default: false },
  { id: "flags",       label: "Floor Flags",      desc: "All flags logged from the operator side", icon: "🚩", default: false },
  { id: "accessories", label: "Accessories Order", desc: "Pre-order list for trays, wires, saucers, sleeves, tags — grouped by supplier", icon: "📦", default: true },
];

export default function Export() {
  const { rows: runs }       = useCropRuns();
  const { rows: containers } = useContainers();
  const { rows: houses }     = useHouses();
  const { rows: pads }       = usePads();
  const { rows: varieties }  = useVarieties();
  const { rows: flags }      = useFlags();

  const defaultOpts = Object.fromEntries(EXPORT_OPTIONS.map(o => [o.id, o.default]));
  const [options, setOptions]   = useState(defaultOpts);
  const [exporting, setExporting] = useState(false);
  const [done, setDone]         = useState(false);
  const [statusFilter, setStatusFilter] = useState("active"); // all | active | planned

  const LAST_EXPORT_KEY = "gh_last_export_date_v1";
  const [lastExport, setLastExport] = useState(() => {
    try { return localStorage.getItem(LAST_EXPORT_KEY) || null; } catch { return null; }
  });
  const daysSinceExport = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / (1000 * 60 * 60 * 24)) : null;
  const exportOverdue = daysSinceExport === null || daysSinceExport >= 14;

  const toggle = (id) => setOptions(o => ({ ...o, [id]: !o[id] }));

  const filteredRuns = runs.filter(r => {
    if (statusFilter === "active")  return !["shipped"].includes(r.status);
    if (statusFilter === "planned") return r.status === "planned";
    return true;
  });

  const selectedCount = Object.values(options).filter(Boolean).length;

  async function doExport() {
    setExporting(true);
    setDone(false);
    try {
      await runExport({ runs: filteredRuns, containers, houses, pads, varieties, flags, options });
      const now = new Date().toISOString();
      localStorage.setItem(LAST_EXPORT_KEY, now);
      setLastExport(now);
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
    setExporting(false);
  }

  const cardStyle = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 14 };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", maxWidth: 700 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1e2d1a", marginBottom: 4 }}>Export & Backup</div>
        <div style={{ fontSize: 14, color: "#7a8c74" }}>Download your entire season as an Excel file — always have a local copy</div>
      </div>

      {/* Overdue backup warning */}
      {exportOverdue && (
        <div style={{ background: daysSinceExport === null ? "#fff8e8" : "#fde8e8", border: `1.5px solid ${daysSinceExport === null ? "#f0d080" : "#f0c0c0"}`, borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>{daysSinceExport === null ? "📋" : "⚠️"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: daysSinceExport === null ? "#7a5a10" : "#c03030" }}>
              {daysSinceExport === null ? "No backup on record" : `Last backup was ${daysSinceExport} days ago`}
            </div>
            <div style={{ fontSize: 12, color: daysSinceExport === null ? "#a07830" : "#d04040", marginTop: 2 }}>
              {daysSinceExport === null ? "Export your season data so you always have a local copy" : "It's been over 2 weeks — run an export to stay protected"}
            </div>
          </div>
        </div>
      )}
      {!exportOverdue && lastExport && (
        <div style={{ background: "#f0f8eb", border: "1.5px solid #b8d8a0", borderRadius: 12, padding: "10px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#2e5c1e" }}>
            Last backup {daysSinceExport === 0 ? "today" : `${daysSinceExport} day${daysSinceExport === 1 ? "" : "s"} ago`} — {new Date(lastExport).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ background: "#1e2d1a", borderRadius: 14, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap" }}>
        {[
          { label: "Crop Runs", value: runs.length, icon: "🌱" },
          { label: "Active Runs", value: runs.filter(r => !["shipped"].includes(r.status)).length, icon: "⚡" },
          { label: "Houses", value: houses.length, icon: "🏗️" },
          { label: "Varieties", value: runs.reduce((n,r) => n + (r.varieties?.length||0), 0), icon: "🌸" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#7fb069" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#6a8a5a", textTransform: "uppercase", letterSpacing: .8 }}>{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {/* Crop run filter */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>Which Crop Runs to Include</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "active",  label: "Active (all except shipped)", count: runs.filter(r => r.status !== "shipped").length },
            { id: "planned", label: "Planned only",                count: runs.filter(r => r.status === "planned").length },
            { id: "all",     label: "All (including shipped)",     count: runs.length },
          ].map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${statusFilter === f.id ? "#7fb069" : "#c8d8c0"}`, background: statusFilter === f.id ? "#f0f8eb" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: statusFilter === f.id ? "#2e5c1e" : "#7a8c74" }}>{f.count}</div>
              <div style={{ fontSize: 11, color: statusFilter === f.id ? "#4a7a35" : "#aabba0", marginTop: 2 }}>{f.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Sheet options */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase" }}>Sheets to Include</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => setOptions(Object.fromEntries(EXPORT_OPTIONS.map(o => [o.id, true])))}
              style={{ padding: "3px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>All</button>
            <button onClick={() => setOptions(defaultOpts)}
              style={{ padding: "3px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {EXPORT_OPTIONS.map(opt => (
            <div key={opt.id} onClick={() => toggle(opt.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${options[opt.id] ? "#b8d8a0" : "#e0ead8"}`, background: options[opt.id] ? "#f0f8eb" : "#fafcf8", cursor: "pointer", transition: "all .1s" }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${options[opt.id] ? "#7fb069" : "#c8d8c0"}`, background: options[opt.id] ? "#7fb069" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {options[opt.id] && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
              </div>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 1 }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export button */}
      <button onClick={doExport} disabled={exporting || selectedCount === 0}
        style={{ width: "100%", padding: "16px 0", borderRadius: 12, border: "none", background: done ? "#4a7a35" : exporting ? "#7a8c74" : "#1e2d1a", color: "#fff", fontWeight: 800, fontSize: 16, cursor: exporting ? "wait" : "pointer", fontFamily: "inherit", transition: "background .2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        {done
          ? <><span>✓</span> Downloaded!</>
          : exporting
            ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Building Excel file...</>
            : <><span>⬇</span> Export {selectedCount} Sheet{selectedCount !== 1 ? "s" : ""} to Excel</>
        }
      </button>

      <div style={{ marginTop: 16, fontSize: 12, color: "#aabba0", textAlign: "center", lineHeight: 1.6 }}>
        File saves to your Downloads folder · Works offline · Open in Excel, Google Sheets, or Numbers<br />
        <strong style={{ color: "#7a8c74" }}>Tip:</strong> Run this export weekly during active season and keep the file somewhere safe
      </div>
    </div>
  );
}
