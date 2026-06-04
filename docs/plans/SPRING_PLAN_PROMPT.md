# Spring Plan — Mobile Prompt

**Paste the block below into Claude Code web (claude.ai/code) with the `hoosierboy-greenhouse-ops` repo selected to build the spring production plan by talking it through on your phone. Re-paste it each session — a fresh cloud session remembers nothing but what's in the repo.**

---

```
You're helping me build Schlegel Greenhouse's SPRING production plan by talking it through on my phone. Keep replies SHORT and ask ONE focused question at a time — no long dumps. Read CLAUDE.md in this repo first for context.

Context:
- Spring = the late-Feb-through-~June-1 sale season.
- Approach: replay last spring as the starting point, then adjust per variety based on how it sold. Don't cross-check order acknowledgments yet.
- Brokers we use: Ball Seed (Jason Adams), EHR (David Jones), Express Seed (Sarah Gibbs), Foremost (Alice Tomasello).

How the plan is captured — EMERGENT SCHEMA, not a fixed form:
- Maintain one JSON file at docs/plans/spring-plan.json.
- Start with only this minimal seed and add fields ONLY when a real decision in our conversation produces one:
  {
    "plan": { "name": "Spring 2027", "season": "spring", "year": 2027, "notes": "" },
    "field_log": [],
    "items": []
  }
- Each item starts as just { "variety": "", "pot_size": "", "target_qty": 0 }. Don't invent fields ahead of time.
- When I say something that needs a NEW field (e.g. "this one I'm sowing, not dropping liners" → sow_week), do all of this ONCE:
    1. Add the field to that item.
    2. Append one entry to field_log: { "field": "sow_week", "means": "...", "added_at_item": <n>, "backfill": "null for earlier items" }.
    3. Backfill the field as null on existing items so the shape stays consistent.
    4. Tell me in one line: "Added field `sow_week` (…), backfilled earlier items as null."
- Reuse existing field names — check field_log before naming a new one so we don't end up with both `location` and `area`.

Working rules:
- Interview me section by section (area → pot size → variety) and capture every decision into the JSON as we go.
- Create branch `spring-plan-draft` at the first commit; reuse it for all later pushes.
- COMMIT AND PUSH docs/plans/spring-plan.json at every natural breakpoint (after each area/pot size, or every ~10 items) — not just at the end — so nothing is lost if I drop off. Pushes are the save points; a commit that isn't pushed is lost when the session ends.
- After each chunk, show a quick running total (items + qty by pot size) so I can sanity-check.
- The JSON is the source of truth. We'll map whatever fields emerged to Supabase later on my Mac — do NOT write any apply/DB script now.
- When I say we're done, do a final commit + push and open a PR titled "Spring plan (draft from mobile)".

Start by asking which area or pot size to begin with.
```

---

## Notes to self

- The cloud session reads `CLAUDE.md` from the repo but **not** your `~/.claude` memory files — that's why broker names and the spring-window context are baked into the prompt above.
- **Resuming a session:** a new cloud session re-clones the repo and only sees progress that was *pushed*. Before putting the phone down mid-section, say "commit and push now." Then re-paste this prompt next time to restore the behavior; the JSON + field_log carry the data forward.
- **Back at the Mac:** say "apply the spring plan JSON." I'll pull `spring-plan-draft`, read `field_log` to see what emerged, strip it as metadata (not a column), map the rest to `production_plans` / `scheduled_crops`, show a dry-run summary, and write only after you confirm.
