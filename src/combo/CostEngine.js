// ── COST ENGINE ──────────────────────────────────────────────────────────────
// Single source of truth for all combo cost calculations.
// Pure functions — no React, no JSX.

/**
 * Soil cost per cubic foot from a soil mix record.
 */
export function soilCostPerCuFt(mix) {
  if (!mix?.costPerBag || !mix?.bagSize) return null;
  const cost = Number(mix.costPerBag), size = Number(mix.bagSize);
  if (!cost || !size) return null;
  if (mix.bagUnit === "cu ft") return cost / size;
  if (mix.bagUnit === "gal")   return cost / (size * 0.134);
  if (mix.bagUnit === "L")     return cost / (size * 0.0353);
  if (mix.bagUnit === "qt")    return cost / (size * 0.0334);
  return null;
}

/**
 * Convert container substrate volume to cubic feet.
 */
export function substrateVolCuFt(container) {
  if (!container?.substrateVol) return null;
  const vol = Number(container.substrateVol);
  const unit = container.substrateUnit;
  if (unit === "pt")    return vol / 51.43;
  if (unit === "qt")    return vol / 25.71;
  if (unit === "gal")   return vol * 0.134;
  if (unit === "cu in") return vol / 1728;
  if (unit === "L")     return vol * 0.0353;
  return vol; // assume cu ft
}

/**
 * Total plant material cost for a combo's plants array.
 */
export function calcPlantCost(plants) {
  return (plants || []).reduce((s, p) => s + (Number(p.costPerPlant || 0) * (p.qty || 1)), 0);
}

/**
 * Container cost per unit.
 */
export function calcContainerCost(container) {
  return container?.costPerUnit ? Number(container.costPerUnit) : 0;
}

/**
 * Accessory costs from container (tray, wire, saucer, sleeve, HB tag).
 */
export function calcAccessoryCost(container) {
  if (!container) return 0;
  const tray   = container.hasCarrier ? (Number(container.carrierCost) || 0) / Math.max(Number(container.potsPerCarrier) || 1, 1) : 0;
  const wire   = container.hasWire    ? (Number(container.wireCost) || 0) : 0;
  const saucer = container.hasSaucer  ? (Number(container.saucerCost) || 0) : 0;
  const sleeve = container.hasSleeve  ? (Number(container.sleeveCost) || 0) : 0;
  const hbTag  = container.isHBTagged ? (Number(container.tagCostPerUnit) || 0) : 0;
  return tray + wire + saucer + sleeve + hbTag;
}

/**
 * Tag cost per unit.
 */
export function calcTagCost(tag) {
  return tag?.costPerUnit ? Number(tag.costPerUnit) : 0;
}

/**
 * Soil cost per unit (needs both soil mix and container for volume).
 */
export function calcSoilCostPerUnit(soil, container) {
  const cpf = soilCostPerCuFt(soil);
  const vol = substrateVolCuFt(container);
  return (cpf && vol) ? cpf * vol : 0;
}

/**
 * Full per-unit cost breakdown for a single combo.
 * Returns an object with each cost component and the total.
 */
export function calcUnitBreakdown(plants, container, soil, tag) {
  const plantCost     = calcPlantCost(plants);
  const containerCost = calcContainerCost(container);
  const soilCost      = calcSoilCostPerUnit(soil, container);
  const tagCost       = calcTagCost(tag);
  const accessoryCost = calcAccessoryCost(container);
  const totalPerUnit  = plantCost + containerCost + soilCost + tagCost + accessoryCost;

  return { plantCost, containerCost, soilCost, tagCost, accessoryCost, totalPerUnit };
}

/**
 * Accessory cost breakdown (for detailed display).
 */
export function calcAccessoryBreakdown(container) {
  if (!container) return {};
  return {
    tray:   container.hasCarrier ? (Number(container.carrierCost) || 0) / Math.max(Number(container.potsPerCarrier) || 1, 1) : 0,
    wire:   container.hasWire    ? (Number(container.wireCost) || 0) : 0,
    saucer: container.hasSaucer  ? (Number(container.saucerCost) || 0) : 0,
    sleeve: container.hasSleeve  ? (Number(container.sleeveCost) || 0) : 0,
    hbTag:  container.isHBTagged ? (Number(container.tagCostPerUnit) || 0) : 0,
  };
}

/**
 * Cost line items for display (filters to non-zero items).
 */
export function getCostLineItems(plants, container, soil, tag) {
  const breakdown = calcUnitBreakdown(plants, container, soil, tag);
  const accBreakdown = calcAccessoryBreakdown(container);

  return [
    { label: "Plants",    value: breakdown.plantCost,     color: "#7fb069" },
    { label: "Container", value: breakdown.containerCost, color: "#4a90d9" },
    { label: "Tray",      value: accBreakdown.tray,       color: "#2e7d9e" },
    { label: "Wire",      value: accBreakdown.wire,       color: "#5a5a40" },
    { label: "Saucer",    value: accBreakdown.saucer,     color: "#7b3fa0" },
    { label: "Sleeve",    value: accBreakdown.sleeve,     color: "#2a6a20" },
    { label: "Soil",      value: breakdown.soilCost,      color: "#c8791a" },
    { label: "Tag",       value: breakdown.tagCost,       color: "#8e44ad" },
    { label: "HB Tag",    value: accBreakdown.hbTag,      color: "#1e2d1a" },
  ].filter(i => i.value > 0);
}

/**
 * Grand total across all combos in a lot.
 */
export function calcLotGrandTotal(combos, totalQty, containers, soilMixes, tags) {
  return (combos || []).reduce((sum, combo) => {
    const qty = combo.qty || totalQty || 0;
    const container = containers.find(c => c.id === combo.containerId);
    const soil = soilMixes.find(s => s.id === combo.soilId);
    const tag = tags.find(t => t.id === combo.tagId);
    const { totalPerUnit } = calcUnitBreakdown(combo.plants || [], container, soil, tag);
    return sum + totalPerUnit * qty;
  }, 0);
}
