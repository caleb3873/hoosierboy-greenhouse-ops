import { useState } from "react";
import { useBrokerCatalogs } from "./supabase";

// ── SHARED HELPERS ────────────────────────────────────────────────────────────
function uid() { return crypto.randomUUID(); }

// ── VARIETY SWAP TAB ─────────────────────────────────────────────────────────
export function VarietySwapTab({ runs, onSaveRun }) {
  const [searchQuery,    setSearchQuery   ] = useState("");
  const [searchField,    setSearchField   ] = useState("all"); // all | cultivar | color | broker | supplier
  const [selectedRuns,   setSelectedRuns  ] = useState(new Set()); // run ids to swap
  const [replacement,    setReplacement   ] = useState(null);  // { cultivar, name, color, broker, supplier, costPerUnit, ballItemNumber }
  const [replaceMode,    setReplaceMode   ] = useState("manual"); // manual | catalog
  const [replForm,       setReplForm      ] = useState({ cultivar: "", name: "", color: "", broker: "", supplier: "", costPerUnit: "", ballItemNumber: "" });
  const [stage,          setStage         ] = useState("search"); // search | select | replace | preview | done
  const [swapping,       setSwapping      ] = useState(false);
  const [swapResult,     setSwapResult    ] = useState(null);
  const [exportFormat,   setExportFormat  ] = useState("xlsx");

  const { rows: catalogs } = useBrokerCatalogs();

  // ── SEARCH ──
  const q = searchQuery.trim().toLowerCase();
  const matchingVarieties = []; // { run, varIdx, variety }
  if (q) {
    runs.forEach(run => {
      (run.varieties || []).forEach((v, idx) => {
        const fields = {
          all:      [v.cultivar, v.name, v.color, v.broker, v.supplier].join(" "),
          cultivar: v.cultivar || "",
          color:    [v.name, v.color].join(" "),
          broker:   v.broker || "",
          supplier: v.supplier || "",
        };
        if ((fields[searchField] || fields.all).toLowerCase().includes(q)) {
          matchingVarieties.push({ run, varIdx: idx, variety: v });
        }
      });
    });
  }

  // Group matches by run
  const matchesByRun = {};
  matchingVarieties.forEach(m => {
    if (!matchesByRun[m.run.id]) matchesByRun[m.run.id] = { run: m.run, matches: [] };
    matchesByRun[m.run.id].matches.push(m);
  });
  const matchedRunGroups = Object.values(matchesByRun);

  function toggleRunSelection(runId) {
    setSelectedRuns(prev => {
      const next = new Set(prev);
      next.has(runId) ? next.delete(runId) : next.add(runId);
      return next;
    });
  }
  function selectAll()   { setSelectedRuns(new Set(matchedRunGroups.map(g => g.run.id))); }
  function selectNone()  { setSelectedRuns(new Set()); }

  // Build preview of what will change
  const previewChanges = [];
  selectedRuns.forEach(runId => {
    const group = matchesByRun[runId];
    if (!group) return;
    group.matches.forEach(m => {
      previewChanges.push({
        runId,
        cropName: m.run.cropName,
        varIdx: m.varIdx,
        from: m.variety,
        to: replacement || replForm,
      });
    });
  });

  async function executeSwap() {
    if (!previewChanges.length) return;
    setSwapping(true);
    const repl = replacement || replForm;
    const changedRuns = {};

    previewChanges.forEach(change => {
      if (!changedRuns[change.runId]) {
        changedRuns[change.runId] = { ...runs.find(r => r.id === change.runId) };
        changedRuns[change.runId].varieties = [...(changedRuns[change.runId].varieties || [])];
      }
      const run = changedRuns[change.runId];
      run.varieties[change.varIdx] = {
        ...run.varieties[change.varIdx],
        cultivar:       repl.cultivar       || run.varieties[change.varIdx].cultivar,
        name:           repl.name           || run.varieties[change.varIdx].name,
        color:          repl.color          !== undefined ? repl.color : run.varieties[change.varIdx].color,
        broker:         repl.broker         || run.varieties[change.varIdx].broker,
        supplier:       repl.supplier       || run.varieties[change.varIdx].supplier,
        costPerUnit:    repl.costPerUnit     || run.varieties[change.varIdx].costPerUnit,
        ballItemNumber: repl.ballItemNumber  || run.varieties[change.varIdx].ballItemNumber,
        _seriesName:    repl._seriesName     || "",
        _catalogColors: repl._catalogColors  || [],
      };
    });

    const results = [];
    for (const run of Object.values(changedRuns)) {
      await onSaveRun(run);
      results.push(run.cropName);
    }

    // Generate Excel change order
    await generateSwapExcel(previewChanges, replacement || replForm);
    setSwapResult(results);
    setStage("done");
    setSwapping(false);
  }

  async function generateSwapExcel(changes, repl) {
    const XLSX = await new Promise((res, rej) => {
      if (window.XLSX) { res(window.XLSX); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res(window.XLSX); s.onerror = rej;
      document.head.appendChild(s);
    });

    const wb = XLSX.utils.book_new();
    const rows = [
      ["VARIETY SWAP ORDER CHANGE", "", "", "", "", "", ""],
      ["Generated:", new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), "", "", "", "", ""],
      ["Search Term:", searchQuery, "", "", "", "", ""],
      [],
      ["CANCELLATIONS", "", "", "", "", "", ""],
      ["Crop Run", "Crop Run Code", "Cultivar", "Color / Variety", "Broker", "Supplier", "Cases"],
      ...changes.map(c => [
        c.cropName,
        runs.find(r => r.id === c.runId)?.cropRunCode || "",
        c.from.cultivar || "",
        [c.from.name, c.from.color].filter(Boolean).join(" · ") || "",
        c.from.broker || "",
        c.from.supplier || "",
        c.from.cases || "",
      ]),
      [],
      ["REPLACEMENTS", "", "", "", "", "", ""],
      ["Crop Run", "Crop Run Code", "Cultivar", "Color / Variety", "Broker", "Supplier", "Cases"],
      ...changes.map(c => [
        c.cropName,
        runs.find(r => r.id === c.runId)?.cropRunCode || "",
        repl.cultivar || c.from.cultivar || "",
        [repl.name || c.from.name, repl.color !== undefined ? repl.color : c.from.color].filter(Boolean).join(" · ") || "",
        repl.broker || c.from.broker || "",
        repl.supplier || c.from.supplier || "",
        c.from.cases || "",
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [25, 18, 18, 22, 18, 18, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Order Change");
    const filename = `VarietySwap_${searchQuery.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const url = URL.createObjectURL(new Blob([wbout], { type: "application/octet-stream" }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setSearchQuery(""); setSelectedRuns(new Set()); setReplacement(null);
    setReplForm({ cultivar: "", name: "", color: "", broker: "", supplier: "", costPerUnit: "", ballItemNumber: "" });
    setStage("search"); setSwapResult(null);
  }

  const IS = (active) => ({ width: "100%", padding: "9px 12px", border: `1.5px solid ${active ? "#7fb069" : "#c8d8c0"}`, borderRadius: 9, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", background: "#fff" });
  const FL = ({ c }) => <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 5 }}>{c}</div>;

  // ── DONE ──
  if (stage === "done") return (
    <div style={{ background: "#f0f8eb", borderRadius: 14, border: "1.5px solid #7fb069", padding: "28px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
      <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a", marginBottom: 8 }}>Swap complete</div>
      <div style={{ fontSize: 13, color: "#2e5c1e", marginBottom: 6 }}>{swapResult?.length} crop run{swapResult?.length !== 1 ? "s" : ""} updated</div>
      <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>Order change Excel file downloaded — send cancellation and replacement lines to your broker</div>
      <button onClick={reset} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Start Another Swap</button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a", marginBottom: 4 }}>Variety Swap</div>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>Search for a variety across all crop runs, select which ones to swap, pick a replacement, and generate an order change Excel for your broker.</div>
      </div>

      {/* Step 1: Search */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 12 }}>Step 1 — Search for Variety to Replace</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <FL c="Search" />
            <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSelectedRuns(new Set()); setStage("search"); }}
              placeholder="e.g. Fantasy Pink, Supertunia, Ball Seed..."
              style={IS(false)} />
          </div>
          <div style={{ width: 160 }}>
            <FL c="Search In" />
            <select value={searchField} onChange={e => setSearchField(e.target.value)} style={IS(false)}>
              <option value="all">All Fields</option>
              <option value="cultivar">Crop / Species</option>
              <option value="color">Color / Variety</option>
              <option value="broker">Broker</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
        </div>

        {/* Results */}
        {q && matchedRunGroups.length === 0 && (
          <div style={{ padding: "16px", textAlign: "center", color: "#aabba0", fontSize: 13 }}>No varieties found matching "{searchQuery}"</div>
        )}
        {matchedRunGroups.length > 0 && (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#7a8c74" }}>
              Found in <strong>{matchedRunGroups.length}</strong> crop run{matchedRunGroups.length !== 1 ? "s" : ""} · <strong>{matchingVarieties.length}</strong> variety row{matchingVarieties.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={selectAll} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Select All</button>
              <button onClick={selectNone} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>None</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matchedRunGroups.map(group => {
              const isSelected = selectedRuns.has(group.run.id);
              return (
                <div key={group.run.id}
                  onClick={() => toggleRunSelection(group.run.id)}
                  style={{ borderRadius: 10, border: `2px solid ${isSelected ? "#7fb069" : "#e0ead8"}`, background: isSelected ? "#f0f8eb" : "#fff", padding: "12px 14px", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? "#7fb069" : "#c8d8c0"}`, background: isSelected ? "#7fb069" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isSelected && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a" }}>{group.run.cropName}</div>
                    {group.run.cropRunCode && <span style={{ fontSize: 10, background: "#1e2d1a", color: "#7fb069", padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontWeight: 800 }}>{group.run.cropRunCode}</span>}
                    {group.run.targetWeek && <span style={{ fontSize: 11, color: "#7a8c74" }}>Wk {group.run.targetWeek}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 30 }}>
                    {group.matches.map((m, i) => (
                      <span key={i} style={{ fontSize: 11, background: "#fff8e8", border: "1px solid #f0d080", borderRadius: 6, padding: "2px 8px", color: "#7a5010" }}>
                        {[m.variety.cultivar, m.variety.name, m.variety.color].filter(Boolean).join(" · ") || "—"}
                        {m.variety.cases ? ` · ${m.variety.cases} cs` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>)}
      </div>

      {/* Step 2: Replacement */}
      {selectedRuns.size > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 12 }}>Step 2 — Replacement Variety</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14 }}>Only fill in fields you want to change — blank fields keep the original value</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            {[
              { key: "cultivar", label: "Crop / Species", placeholder: "e.g. Petunia" },
              { key: "name",     label: "Series / Name",  placeholder: "e.g. Supertunia Vista" },
              { key: "color",    label: "Color",          placeholder: "e.g. Bubblegum Pink" },
              { key: "broker",   label: "Broker",         placeholder: "e.g. Ball Seed" },
              { key: "supplier", label: "Supplier",       placeholder: "e.g. Proven Winners" },
              { key: "costPerUnit", label: "Cost / Unit", placeholder: "e.g. 1.25" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <FL c={label} />
                <input value={replForm[key]} onChange={e => setReplForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder} style={IS(false)} />
              </div>
            ))}
          </div>
          <div>
            <FL c="Item # (optional)" />
            <input value={replForm.ballItemNumber} onChange={e => setReplForm(f => ({ ...f, ballItemNumber: e.target.value }))}
              placeholder="e.g. 123456" style={{ ...IS(false), maxWidth: 200 }} />
          </div>
        </div>
      )}

      {/* Step 3: Preview & Execute */}
      {selectedRuns.size > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 12 }}>
            Step 3 — Preview & Execute ({previewChanges.length} change{previewChanges.length !== 1 ? "s" : ""})
          </div>
          <div style={{ borderRadius: 10, border: "1px solid #e0ead8", overflow: "hidden", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8faf6" }}>
                  {["Crop Run", "Code", "Current", "→ Replacement"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewChanges.map((c, i) => {
                  const repl = replacement || replForm;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #f0f5ee", background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1e2d1a" }}>{c.cropName}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 10, color: "#7fb069", background: "#1e2d1a", borderRadius: 4, whiteSpace: "nowrap" }}>
                        {runs.find(r => r.id === c.runId)?.cropRunCode || "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#c8791a" }}>
                        {[c.from.cultivar, c.from.name, c.from.color].filter(Boolean).join(" · ") || "—"}
                        <div style={{ fontSize: 10, color: "#aabba0" }}>{c.from.broker}{c.from.supplier ? ` / ${c.from.supplier}` : ""}</div>
                      </td>
                      <td style={{ padding: "8px 12px", color: "#2e5c1e" }}>
                        {[repl.cultivar || c.from.cultivar, repl.name || c.from.name, repl.color !== undefined && repl.color !== "" ? repl.color : c.from.color].filter(Boolean).join(" · ") || "—"}
                        <div style={{ fontSize: 10, color: "#aabba0" }}>{repl.broker || c.from.broker}{(repl.supplier || c.from.supplier) ? ` / ${repl.supplier || c.from.supplier}` : ""}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={executeSwap} disabled={swapping}
              style={{ flex: 1, background: swapping ? "#c8d8c0" : "#2e5c1e", color: "#fff", border: "none", borderRadius: 10, padding: 13, fontWeight: 700, fontSize: 14, cursor: swapping ? "default" : "pointer", fontFamily: "inherit" }}>
              {swapping ? "Swapping..." : `✅ Execute Swap + Download Order Change (${previewChanges.length} rows)`}
            </button>
            <button onClick={reset} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ADVANCED SEARCH TAB ───────────────────────────────────────────────────────
export function AdvancedSearchTab({ runs, onSaveRun }) {
  const [filters, setFilters] = useState({
    query: "", broker: "", species: "", weekFrom: "", weekTo: "",
    orderStatus: "", status: "", hasIssues: false,
  });
  const [sortBy,       setSortBy      ] = useState("week");
  const [bulkAction,   setBulkAction  ] = useState("");
  const [selected,     setSelected    ] = useState(new Set());
  const [bulkWorking,  setBulkWorking ] = useState(false);
  const [bulkDone,     setBulkDone    ] = useState(false);

  const upd = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  // Derive filter options from runs
  const brokers  = [...new Set(runs.flatMap(r => (r.varieties||[]).map(v => v.broker).filter(Boolean)))].sort();
  const species  = [...new Set(runs.flatMap(r => (r.varieties||[]).map(v => v.cultivar).filter(Boolean)))].sort();
  const statuses = [...new Set(runs.map(r => r.status).filter(Boolean))];
  const orderStatuses = [...new Set(runs.map(r => r.orderStatus).filter(Boolean))];

  // Filter logic
  const filtered = runs.filter(r => {
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const fields = [r.cropName, ...(r.varieties||[]).flatMap(v => [v.cultivar, v.name, v.color, v.broker])].join(" ").toLowerCase();
      if (!fields.includes(q)) return false;
    }
    if (filters.broker) {
      if (!(r.varieties||[]).some(v => v.broker === filters.broker)) return false;
    }
    if (filters.species) {
      if (!(r.varieties||[]).some(v => v.cultivar === filters.species)) return false;
    }
    if (filters.weekFrom && r.targetWeek && Number(r.targetWeek) < Number(filters.weekFrom)) return false;
    if (filters.weekTo   && r.targetWeek && Number(r.targetWeek) > Number(filters.weekTo))   return false;
    if (filters.orderStatus && r.orderStatus !== filters.orderStatus) return false;
    if (filters.status      && r.status      !== filters.status)      return false;
    if (filters.hasIssues) {
      const noSourcing = !r.materialType;
      const noVarieties = !(r.varieties||[]).length;
      const missingCost = (r.varieties||[]).some(v => !v.costPerUnit);
      if (!noSourcing && !noVarieties && !missingCost) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "week") return (Number(a.targetWeek)||999) - (Number(b.targetWeek)||999);
    if (sortBy === "name") return (a.cropName||"").localeCompare(b.cropName||"");
    if (sortBy === "cases") return (Number(b.cases)||0) - (Number(a.cases)||0);
    return 0;
  });

  const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== false && k !== "query").length + (filters.query ? 1 : 0);

  function clearFilters() {
    setFilters({ query: "", broker: "", species: "", weekFrom: "", weekTo: "", orderStatus: "", status: "", hasIssues: false });
  }

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }

  const BULK_ACTIONS = [
    { id: "mark_ordered",   label: "Mark as Ordered",   color: "#e07b39" },
    { id: "mark_planned",   label: "Mark as Planned",   color: "#7a8c74" },
    { id: "mark_growing",   label: "Mark as Growing",   color: "#4a90d9" },
    { id: "mark_ready",     label: "Mark as Ready",     color: "#7fb069" },
    { id: "export_list",    label: "Export as Excel",   color: "#2e5c1e" },
  ];

  async function executeBulk() {
    if (!bulkAction || !selected.size) return;
    setBulkWorking(true);

    if (bulkAction === "export_list") {
      await exportSearchResults(filtered.filter(r => selected.has(r.id)));
    } else {
      const statusMap = { mark_ordered: { orderStatus: "ordered" }, mark_planned: { status: "planned" }, mark_growing: { status: "growing" }, mark_ready: { status: "ready" } };
      const changes = statusMap[bulkAction];
      if (changes) {
        for (const id of selected) {
          const run = runs.find(r => r.id === id);
          if (run) await onSaveRun({ ...run, ...changes });
        }
      }
    }

    setBulkWorking(false); setBulkDone(true);
    setTimeout(() => setBulkDone(false), 2000);
    setSelected(new Set());
  }

  async function exportSearchResults(targetRuns) {
    const XLSX = await new Promise((res, rej) => {
      if (window.XLSX) { res(window.XLSX); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res(window.XLSX); s.onerror = rej;
      document.head.appendChild(s);
    });
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Crop Run", "Code", "Target Wk", "Cases", "Status", "Order Status", "Broker(s)", "Species", "Colors", "Est. Cost"],
      ...targetRuns.map(r => {
        const brokers = [...new Set((r.varieties||[]).map(v => v.broker).filter(Boolean))].join(", ");
        const sp      = [...new Set((r.varieties||[]).map(v => v.cultivar).filter(Boolean))].join(", ");
        const colors  = (r.varieties||[]).map(v => [v.name, v.color].filter(Boolean).join(" ")).join(", ");
        const cost    = (r.varieties||[]).reduce((s, v) => s + (Number(v.costPerUnit)||0) * (Number(v.cases)||0) * (Number(r.packSize)||10), 0);
        return [r.cropName, r.cropRunCode||"", r.targetWeek||"", r.cases||"", r.status||"", r.orderStatus||"", brokers, sp, colors, cost > 0 ? cost.toFixed(2) : ""];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [25, 14, 10, 8, 14, 14, 20, 18, 30, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Search Results");
    const filename = `CropRunSearch_${new Date().toISOString().split("T")[0]}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const url = URL.createObjectURL(new Blob([wbout], { type: "application/octet-stream" }));
    Object.assign(document.createElement("a"), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  }

  const IS = { padding: "8px 12px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 12, fontFamily: "inherit", background: "#fff", outline: "none" };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a", marginBottom: 4 }}>Advanced Search</div>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>Filter crop runs by any combination of fields, then take bulk actions on the results.</div>
      </div>

      {/* Filter panel */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Filters</div>
          {activeFilters > 0 && (
            <button onClick={clearFilters} style={{ background: "none", border: "none", fontSize: 12, color: "#c8791a", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Clear all ({activeFilters})</button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <input value={filters.query} onChange={e => upd("query", e.target.value)}
              placeholder="🔍 Search crop name, variety, color, broker..."
              style={{ ...IS, width: "100%", boxSizing: "border-box", fontSize: 13 }} />
          </div>

          <select value={filters.broker} onChange={e => upd("broker", e.target.value)} style={IS}>
            <option value="">All Brokers</option>
            {brokers.map(b => <option key={b}>{b}</option>)}
          </select>

          <select value={filters.species} onChange={e => upd("species", e.target.value)} style={IS}>
            <option value="">All Species</option>
            {species.map(s => <option key={s}>{s}</option>)}
          </select>

          <select value={filters.status} onChange={e => upd("status", e.target.value)} style={IS}>
            <option value="">All Statuses</option>
            {["planned","propagating","growing","outside","ready","shipped"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>

          <select value={filters.orderStatus} onChange={e => upd("orderStatus", e.target.value)} style={IS}>
            <option value="">Any Order Status</option>
            <option value="">Not Ordered</option>
            <option value="ordered">Ordered</option>
            <option value="confirmed">Confirmed</option>
          </select>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="number" value={filters.weekFrom} onChange={e => upd("weekFrom", e.target.value)}
              placeholder="Wk from" style={{ ...IS, width: "100%", boxSizing: "border-box" }} />
            <span style={{ fontSize: 11, color: "#aabba0", flexShrink: 0 }}>–</span>
            <input type="number" value={filters.weekTo} onChange={e => upd("weekTo", e.target.value)}
              placeholder="Wk to" style={{ ...IS, width: "100%", boxSizing: "border-box" }} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 12px", border: `1.5px solid ${filters.hasIssues ? "#c8791a" : "#c8d8c0"}`, borderRadius: 9, background: filters.hasIssues ? "#fff4e8" : "#fff" }}>
            <input type="checkbox" checked={filters.hasIssues} onChange={e => upd("hasIssues", e.target.checked)} style={{ accentColor: "#c8791a" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: filters.hasIssues ? "#c8791a" : "#7a8c74" }}>⚠ Has Issues</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#7a8c74" }}>Sort by:</div>
          {[["week","Target Week"],["name","Name"],["cases","Cases"]].map(([id, label]) => (
            <button key={id} onClick={() => setSortBy(id)}
              style={{ padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${sortBy === id ? "#7fb069" : "#c8d8c0"}`, background: sortBy === id ? "#f0f8eb" : "#fff", color: sortBy === id ? "#2e5c1e" : "#7a8c74", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          {selected.size > 0 && <span style={{ color: "#7fb069", marginLeft: 8 }}>{selected.size} selected</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {filtered.length > 0 && (
            <button onClick={toggleAll} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #c8d8c0", background: "#fff", fontSize: 11, fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
          {selected.size > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
                style={{ padding: "5px 10px", border: "1.5px solid #c8d8c0", borderRadius: 7, fontSize: 11, fontFamily: "inherit", background: "#fff" }}>
                <option value="">Bulk Action...</option>
                {BULK_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <button onClick={executeBulk} disabled={!bulkAction || bulkWorking}
                style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: bulkDone ? "#7fb069" : bulkAction ? "#1e2d1a" : "#c8d8c0", color: "#fff", fontSize: 11, fontWeight: 700, cursor: bulkAction ? "pointer" : "default", fontFamily: "inherit" }}>
                {bulkDone ? "✓ Done!" : bulkWorking ? "..." : "Apply"}
              </button>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0", padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#7a8c74" }}>No crop runs match these filters</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(run => {
            const isSelected = selected.has(run.id);
            const issues = [];
            if (!run.materialType) issues.push("Missing sourcing");
            if (!(run.varieties||[]).length) issues.push("No varieties");
            if ((run.varieties||[]).some(v => !v.costPerUnit)) issues.push("Missing cost");
            const totalCost = (run.varieties||[]).reduce((s, v) => s + (Number(v.costPerUnit)||0) * (Number(v.cases)||0) * (Number(run.packSize)||10), 0);
            return (
              <div key={run.id}
                style={{ background: "#fff", borderRadius: 12, border: `2px solid ${isSelected ? "#7fb069" : "#e0ead8"}`, padding: "12px 16px", cursor: "pointer", transition: "border-color .15s", display: "flex", gap: 12, alignItems: "flex-start" }}
                onClick={() => toggleSelect(run.id)}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? "#7fb069" : "#c8d8c0"}`, background: isSelected ? "#7fb069" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  {isSelected && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a" }}>{run.cropName}</span>
                    {run.cropRunCode && <span style={{ fontSize: 10, background: "#1e2d1a", color: "#7fb069", padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontWeight: 800 }}>{run.cropRunCode}</span>}
                    {run.targetWeek && <span style={{ fontSize: 11, background: "#f0f8eb", color: "#2e5c1e", padding: "1px 6px", borderRadius: 5, fontWeight: 700 }}>Wk {run.targetWeek}</span>}
                    {run.cases && <span style={{ fontSize: 11, color: "#7a8c74" }}>{run.cases} cases</span>}
                    {run.status && <span style={{ fontSize: 10, background: "#f4f6f2", color: "#7a8c74", padding: "1px 7px", borderRadius: 10, fontWeight: 700, textTransform: "capitalize" }}>{run.status}</span>}
                    {run.orderStatus && <span style={{ fontSize: 10, background: run.orderStatus === "confirmed" ? "#f0f8eb" : "#fff4e8", color: run.orderStatus === "confirmed" ? "#2e5c1e" : "#c8791a", padding: "1px 7px", borderRadius: 10, fontWeight: 700, border: `1px solid ${run.orderStatus === "confirmed" ? "#c8e0b8" : "#f0c080"}` }}>{run.orderStatus}</span>}
                    {issues.map(issue => <span key={issue} style={{ fontSize: 10, background: "#fff4e8", color: "#c8791a", padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>⚠ {issue}</span>)}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(run.varieties||[]).map((v, i) => (
                      <span key={i} style={{ fontSize: 11, color: "#7a8c74", background: "#f8faf6", border: "1px solid #e8ede4", padding: "1px 7px", borderRadius: 5 }}>
                        {[v.cultivar, v.name, v.color].filter(Boolean).join(" · ") || "—"}
                        {v.broker ? ` · ${v.broker}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                {totalCost > 0 && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: "#aabba0", fontWeight: 700, textTransform: "uppercase" }}>Est. Cost</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#2e5c1e" }}>${totalCost.toFixed(0)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
