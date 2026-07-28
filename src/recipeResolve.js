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

export async function resolveRecipeId(sb, cropName, containerId) {
  if (!sb || !cropName) return null;
  const { data: recs } = await sb.from("crop_recipes").select("id,size_label").eq("crop_name", cropName);
  if (!recs?.length) return null;
  if (recs.length === 1) return recs[0].id;
  if (containerId) {
    const { data: c } = await sb.from("containers").select("name,kind,type,diameter_in").eq("id", containerId).single();
    const lbl = sizeLabelForContainer(c);
    const hit = lbl && recs.find(r => r.size_label === lbl);
    if (hit) return hit.id;
  }
  return null;   // ambiguous — better recipe-less than wrong-family
}
