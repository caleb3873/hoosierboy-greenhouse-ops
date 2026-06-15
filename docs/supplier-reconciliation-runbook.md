# Supplier Acknowledgement Reconciliation — Runbook

**Goal:** turn a broker's order acknowledgement (Ball/EHR confirming, shorting, or
substituting varieties) into *corrected production numbers* — so you never pot or
tag for plants you won't receive, and substitutes carry the right tags.

**The chain:** acknowledgement PDF → Claude reads it → proposed changes → you
review & approve → order + **production capped to confirmed supply** → the
plant-availability view shows any remaining shortfalls to chase.

---

## Prerequisites (already set up)
- Anthropic API credits funded (Claude reads the PDF).
- The acknowledgement PDF lives in the `order-confirmations` storage bucket,
  named **`<orderNumber>.pdf`** (the Receiving upload puts it there).

---

## Step-by-step

1. **Get the PDF into the system.** Upload the acknowledgement in the Receiving
   page as you do today (it saves to the bucket as `<orderNumber>.pdf`).

2. **Let the loop catch it — or trigger it now.**
   - *Automatic:* the nightly scan finds PDFs uploaded in the last ~4 days and it
     shows up in the next **7am email** under "📥 Supplier acknowledgements to approve."
   - *Right now:* open `https://ops.hoosierboy.com/api/recon-scan?order=<orderNumber>`

3. **Open the approval inbox.**
   - *Phone:* ManagerTasksView — it appears as a "📥 Acknowledgements to approve"
     alert at the top whenever something's pending.
   - *Desktop:* Planner → **Receiving** page (always shown at top).

4. **Review the proposed changes** — per variety: updated / cancelled / inserted,
   with the before→after quantities and any ⚠ risk flags.

5. **Edit if it's a substitution.** Adjust the numbers in the inbox: set the
   shorted variety to its confirmed amount (or cancel it) and bump the substitute.
   *(Current limit: the inbox edits the ordered quantity; the formal
   substitution link — `substituted_from` — is recorded separately for now. Jot the
   substitution in the row note so it's documented.)*

6. **Approve & apply.** Clicking "✓ Approve & apply" writes the confirmed
   quantities, **caps production (`qty`) to the confirmed supply** (so you won't
   pot/tag more than arrives), **zeroes any cancelled variety**, and re-verifies the
   order reconciles. It tells you what it did (e.g. "5 updated · 1 cancelled ·
   2 production capped to supply").

7. **Check plant availability.** Run `node scripts/plant-availability.mjs` (or read
   the morning email's "🌱 Plant availability" section). Any variety still
   **producing more than supply** and **not covered by a substitute** → source it
   elsewhere (broker) or cut the production.

8. **Pot & tag off the corrected numbers.** Because production now matches confirmed
   supply, your tag counts and pot fills are accurate — print the substitute's tags
   (not the shorted variety's) in the right quantity.

---

## Worked example — order 9429649 (Paradiso garden mums)

- Supplier **deleted Paradiso Pink** (160 → 0, "production quality") and **bumped
  Paradiso Bronze** (160 → 320) to cover the gap.
- The updated confirmation PDF showed **Bronze 320, Pink 0**.
- In the inbox you'd set **Bronze → 320** and **Pink → cancel**.
- On approve: Bronze production capped to **320 (= supply)**, Pink **zeroed** (not
  potted/tagged), Bronze recorded as substituting for Pink.
- **Result:** pot & tag **320 Bronze, 0 Pink** — the plan stays whole (still 320
  mums), with the *right* tags. No pots filled or tags printed for plants that
  aren't coming.

---

## What's automatic vs. you vs. not-yet-built

- **Automatic:** the scan, Claude extraction, proposal creation, the daily email,
  the production-cap-on-approve, and the availability flagging.
- **You:** approve (the human gate), edit substitution quantities, and decide what
  to do about uncovered shorts.
- **Not yet built (next ideas):** a one-click "mark as substitution" control in the
  inbox; **broker outreach** to chase/backfill uncovered shorts (email the order's
  broker, or an alternate from `what_they_sell` + reliability grades — the DGI→D S
  Cole pattern); tag-print integration (tags = the confirmed `qty`, printed manually
  for now).

---

## Quick reference

| Action | How |
|---|---|
| Trigger a scan for one order | `https://ops.hoosierboy.com/api/recon-scan?order=<n>` |
| Approve / edit proposals | ManagerTasksView (phone) or Planner → Receiving (desktop) |
| "Do we have the plants?" | `node scripts/plant-availability.mjs` |
| Per-order ordered-vs-confirmed | `node scripts/order-recon.mjs <n>` |
| Daily summary | the 7am "🛰 Daily ops check" email |
