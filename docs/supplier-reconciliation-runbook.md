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
   Then **record the substitution** so production & tags follow it:
   `node scripts/record-substitution.mjs <order> "<Substitute>" "<Original>" --apply`
   — this stamps `substituted_from`, cancels + zeroes the original, and plant-
   availability nets the coverage.
   **Like-for-like rule:** sub same crop for same crop (a mum for a mum). **Fall/Winter
   = strict;** Spring has a little more flexibility.

6. **Approve & apply.** Clicking "✓ Approve & apply" writes the confirmed
   quantities, **caps production (`qty`) to the confirmed supply** (so you won't
   pot/tag more than arrives), **zeroes any cancelled variety**, and re-verifies the
   order reconciles. It tells you what it did (e.g. "5 updated · 1 cancelled ·
   2 production capped to supply").

7. **Check plant availability.** Run `node scripts/plant-availability.mjs` (or read
   the morning email's "🌱 Plant availability" section). Any variety still
   **producing more than supply** and **not covered by a substitute** → chase it (step 8).

8. **Chase the broker for uncovered shorts.** Run `node scripts/broker-outreach.mjs`
   (or read the email's "📨 Shortages to chase" section). For each shorted order it
   gives you the broker's contact, a ready draft asking for more / a like-for-like
   substitute, and a **higher-graded alternate broker** to backfill. To send:
   `https://ops.hoosierboy.com/api/broker-email?order=<n>` previews it; POST sends it.
   *(Caveat: external delivery needs the Resend domain verified — until then a send
   reaches you, so copy/send the draft manually.)* When the broker offers a sub,
   record it with step 5's command.

9. **Pot & tag off the corrected numbers.** Because production now matches confirmed
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

- **Automatic:** the scan, Claude extraction, proposal creation, the daily email
  (incl. plant-availability + shortages-to-chase), the production-cap-on-approve, the
  availability flagging, and the broker-outreach drafts + alternate-broker suggestion.
- **You:** approve (the human gate), edit substitution quantities, record substitutions
  (`record-substitution.mjs`), and send/copy the broker drafts.
- **Not yet built:** a one-click "mark substitution" + "send broker email" button *in*
  the inbox UI (today: a command / the API endpoint); tag-print integration (tags =
  the confirmed `qty`, printed manually for now); Resend domain verification so broker
  emails reach the broker directly.

---

## Quick reference

| Action | How |
|---|---|
| Trigger a scan for one order | `https://ops.hoosierboy.com/api/recon-scan?order=<n>` |
| Approve / edit proposals | ManagerTasksView (phone) or Planner → Receiving (desktop) |
| "Do we have the plants?" | `node scripts/plant-availability.mjs` |
| Per-order ordered-vs-confirmed | `node scripts/order-recon.mjs <n>` |
| Broker chase drafts (all / one) | `node scripts/broker-outreach.mjs [<n>]` |
| Preview / send a broker email | `GET /api/broker-email?order=<n>` / POST to send |
| Record a substitution | `node scripts/record-substitution.mjs <order> "<Sub>" "<Orig>" --apply` |
| Daily summary | the 7am "🛰 Daily ops check" email (6 sections) |
