// Emit a single UPDATE ... CASE SQL statement to push all phones into floor_codes
// via the admin CLI. The anon-key backfill silently no-op'd because of RLS.
import { readFileSync } from "node:fs";
const phones = JSON.parse(readFileSync(new URL("./phones.json", import.meta.url), "utf8"));
const cases = phones.map(({ name, phone }) =>
  `WHEN worker_name = '${name.replace(/'/g, "''")}' THEN '${phone}'`
).join("\n    ");
const names = phones.map(({ name }) => `'${name.replace(/'/g, "''")}'`).join(", ");
const sql = `UPDATE floor_codes SET phone = CASE
    ${cases}
END
WHERE worker_name IN (${names});`;
console.log(sql);
