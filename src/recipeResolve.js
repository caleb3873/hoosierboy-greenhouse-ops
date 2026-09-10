// Resolve which crop recipe (crop × size) a new plan row belongs to — used by every
// creation path so nothing lands recipe-less. Size derivation mirrors the seed
// (scripts/seed_crop_recipes.js sizeOf): container diameter + form tag, name fallback.
export function sizeLabelForContainer(c) {
  if (!c || c.diameter_in == null || c.diameter_in === "") return null;
  const s = `${c.name || ""} ${c.kind || ""} ${c.type || ""}`.toUpperCase();
  const tag = /HANG|\bHB\b|BASKET/.test(s) ? "HB"
    : /\bPAN\b/.test(s) ? "Pan"
    : /BOWL/.test(s) ? "Bowl"
    : /FIBER/.test(s) ? "Fiber"
    : /TRAY|CELL|PLUG|FLAT/.test(s) ? "Tray"
    : "Pot";
  const d = Math.round(+c.diameter_in * 2) / 2;
  return `${d.toString().replace(/\.0$/, "")}" ${tag}`;
}

// Seed and vegetative material never share a family (Caleb 9/10/2026: "seed variety
// osteos are mixed with vegetative osteos which we shouldn't do"). Seed families are a
// separate recipe named "<Crop> (seed)" (crop_name+size is unique, so the name carries
// the split). `hint` = { form, varietyType } — a SEED form, or a variety whose library
// type is "seed", resolves to the seed family when one exists.
export const SEED_FAMILY_SUFFIX = " (seed)";
export function isSeedHint(hint) {
  if (!hint) return false;
  return /^SEED/i.test(hint.form || "") || /^seed$/i.test(hint.varietyType || "");
}

export async function resolveRecipeId(sb, cropName, containerId, hint) {
  if (!sb || !cropName) return null;
  const seed = isSeedHint(hint);
  const baseName = String(cropName).replace(/ \(seed\)$/i, "");
  const names = seed ? [baseName + SEED_FAMILY_SUFFIX, baseName] : [baseName];
  const { data: all } = await sb.from("crop_recipes").select("id,size_label,crop_name").in("crop_name", names);
  if (!all?.length) return null;
  // seed hint: prefer the "(seed)" family whenever it exists; otherwise fall back to the crop
  const recs = seed && all.some(r => r.crop_name !== baseName) ? all.filter(r => r.crop_name !== baseName) : all.filter(r => r.crop_name === baseName);
  if (!recs.length) return null;
  if (recs.length === 1) return recs[0].id;
  if (containerId) {
    const { data: c } = await sb.from("containers").select("name,kind,type,diameter_in").eq("id", containerId).single();
    const lbl = sizeLabelForContainer(c);
    const hit = lbl && recs.find(r => r.size_label === lbl);
    if (hit) return hit.id;
  }
  return null;   // ambiguous — better recipe-less than wrong-family
}
