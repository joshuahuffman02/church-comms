# Channels settings page — redesign

**Date:** 2026-06-23
**Status:** Approved design, pre-implementation
**Route:** `/settings/channels` (admin-only)

## Problem

The Channels settings page is confusing and *feels* broken. Three root causes, all confirmed against the code:

1. **Most of a channel's rules can't be edited.** `updateChannel` (`src/actions/channels.ts:38-71`) only writes `defaultPublishOffsetDays`, `productionLeadDays`, `frequencyCap`, `active`, `productionNotes`. The remaining fields — `name`, `type`, `cadence` (posting weekdays), `capacity`, `color`, `tierEligibility` — are written **only** by `createChannel`, so they cannot be changed after a channel exists. `lockLeadDays` is written by *neither* create nor update (seed-only). This is why "I can't change what days it posts" — there is no control for it.
2. **Saving is silent.** `updateChannel` returns `void` and only calls `revalidatePath`, so a successful save re-renders identical-looking values with no acknowledgement (NN/g "Visibility of system status" anti-pattern). With 8 stacked per-row forms, it is also easy to edit one row and click another row's Save. The timing-day edits the user tried *do* save — there is **no actual save bug** — but nothing confirms it.
3. **It's dense and hard to read.** Every channel is one cramped `flex-wrap` row, and timing is expressed as chained relative math ("X days before it goes out, which is Y days before the event") with no real dates shown.

`contentSpec` and `autoApprove` are dead fields (zero consumers) and stay out of scope.

## Goals

- Make **every safe channel rule editable** after creation.
- **Confirm every save** and prevent the "did it work?" confusion.
- Reduce cognitive load: plain-language labels, grouped sections, and **relative offsets resolved to real dates**.
- Match the existing house aesthetic and reuse existing components — invent nothing new where a primitive exists.

Non-goals: editing `contentSpec`/`autoApprove`; changing the scheduling engine; redesigning the "Add a channel" flow (kept as-is); changing the Prisma schema.

## Chosen approach: expand-in-place accordion

A single `/settings/channels` page. The dense rows become a **single-open accordion list** of channels. Each row is collapsed by default and expands into a grouped, plain-language edit form; opening one row collapses any other. This keeps everything on one URL (no navigation), keeps the collapsed rows scannable for comparison, and makes **collapse-after-save** an intrinsic confirmation.

(Alternatives considered and rejected for this scale of ~8 channels: **master–detail** with a per-channel `[id]` page — more scalable but adds click-in/click-back navigation; **flat grouped** — smallest change but every channel always fully expanded makes the page very long.)

### Page shell (unchanged conventions)
`export const dynamic = "force-dynamic"`, admin gate returning `<AdminOnlyCard area="outputs and channels" />`, `<div className="max-w-3xl">`, `<SettingsNav />`, `<h1 className="text-2xl font-extrabold">Channels ⚙️</h1>`, the intro paragraph (rewritten in plain language), then the channel list, then the existing `＋ Add a channel` `<details>` form at the bottom.

### Collapsed row
Colour dot (`c.color`) · channel name · On/Off pill (connections-style: `bg-emerald-100 text-emerald-700` vs `bg-slate-100 text-muted`) · a one-line resolved timing summary ("goes out 21 days before · artwork due 28 days before") · chevron. Sorted by `sortOrder`.

### Expanded edit form — grouped sections
The form posts to the (extended) `updateChannel` server action. Sections, with the section shown only when relevant to the channel `type`:

- **What this channel is** — `name` (text), `type` (select: "Runs over a span of days" / "Happens once on a date" / "Sent once"), accent `color` (`input[type=color]`), `active` toggle.
- **Timing rules** — *Start promoting* = `defaultPublishOffsetDays`, *Artwork ready* = `productionLeadDays`. Followed by the **live real-date preview** + mini-timeline (see below).
- **Posting** *(windowed + dated_instance — types that use cadence)* — *Posts on* = `cadence.weekdays` as toggle chips; *Max per week* = `frequencyCap` *(windowed only)*.
- **Advanced** (collapsed `<details>`) — *Who it's for* = `tierEligibility` (tier checkboxes via `tierLabel`); *Capacity* = `capacity`; *Stop accepting changes* = `lockLeadDays` *(dated_instance only)*; *Production notes* = `productionNotes`.

Type → which timing fields apply (from `src/lib/engine/timeline.ts:33-65`):
- `windowed`: offset (window start), lead, cadence weekdays, frequency cap.
- `dated_instance`: offset (search window), cadence weekdays (picks the instance), lead **and** `lockLeadDays` (lock lead overrides production lead for the due date).
- `one_shot`: offset, lead. (No cadence / cap.)

### Weekday chips
Styled `<label>`s each wrapping a visually-hidden `<input type="checkbox" name="weekday" value={0..6}>` (same field contract `createChannel` already parses). This keeps the form **server-action-native and accessible** with no JS required to submit; the client wrapper only manages expand / dirty / feedback.

## Components & files

### New
- **`src/components/channel-row.tsx`** (`"use client"`) — the per-channel accordion row. Responsibilities: expand/collapse (single-open coordinated by the parent or via a shared controller), dirty-state tracking (compare current field values to the initial saved values), submit via the `updateChannel` server action using the React 19 action-state hook for pending + result, fire `useSaveFlash().ping()` + render `<SavedTick>` on success, render returned errors inline, and collapse back on success. Receives a serialisable channel object + the bound `updateChannel` action.
- **`src/lib/channel-preview.ts`** — a pure helper `previewSchedule({ type, offset, lead, lockLeadDays, weekdays }, exampleEvent)` → `{ goesOut, assetDue }`. Mirrors engine semantics by reusing `subDays` / `weekdaysBetween` / last-weekday logic from `src/lib/engine/dates.ts` so it cannot drift from the real scheduler. Example event = the next Sunday (computed once, passed in for testability).

### Changed
- **`src/app/settings/channels/page.tsx`** — replace the dense per-row forms with a list of `<ChannelRow>`; rewrite the intro in plain language; keep the `＋ Add a channel` `<details>` form. Compute the example-event date server-side and pass it down (avoids client clock nondeterminism).
- **`src/actions/channels.ts`** — extend `updateChannel`:
  - Additionally write `name`, `type` (validated against `CHANNEL_TYPES`), `cadence` (`{ weekdays }` from `weekday` checkboxes), `capacity`, `color`, `tierEligibility` (from `tier` checkboxes), and `lockLeadDays` — each using the **existing `typeof`-guarded conditional-write pattern** so a form that omits a field never clobbers it.
  - Gentle validation: offsets/leads coerced to non-negative integers; invalid `type` ignored; empty numeric → sensible null/skip (matching the current `frequencyCap` handling).
  - **Return a result** (`{ ok: true }` | `{ ok: false, error: string }`) so the client can confirm/!error. Keep `revalidatePath("/settings/channels")` + `revalidatePath("/outputs")`.

### Reused (no change)
`useSaveFlash` / `SavedTick` (`src/components/save-flash.tsx`), `ChannelDeleteButton`, `tierLabel` (`src/lib/labels.ts`), the connections `StatusPill` style, `AdminOnlyCard`, and house classes (`card-float`, `bg-ink`, `rounded-full`/`rounded-2xl`, `text-muted`/`text-ink`, `bg-sky-bg`).

## Legibility details
- Numeric inputs become `type="text" inputmode="numeric"`, width-constrained (~2–3 chars), unit **in the `<label>`** and shown as a visible suffix (GOV.UK guidance — avoids `type=number` scroll/spinner pitfalls).
- The Timing section renders a live sentence ("For an event on Sun Jul 26 — artwork due Sun Jun 28, goes out Sun Jul 5") plus a compact horizontal mini-timeline with Artwork-due / Goes-out / Event markers, recomputed as the offsets change.

## Save & feedback flow
1. Row pristine → Save disabled.
2. User edits a field → row marked dirty, Save enabled.
3. Submit → "Saving…" pending state (action-state hook).
4. Success → `revalidatePath` refreshes server data; row shows "✓ Saved" then collapses; dirty baseline resets.
5. Failure → inline rose banner on the row (`rounded-2xl bg-rose-50 border border-rose-200 text-rose-700`); row stays open.

## Error handling
- Server: invalid `type` ignored (keeps prior value); non-numeric/negative day fields coerced; unknown channel id → returned `{ ok: false }`.
- Client: render the action's error inline; never leave the user without acknowledgement.

## Testing
- **Unit (`updateChannel`)**: writes each newly-editable field; a partial form (omitting a field) does **not** clobber the existing value; invalid `type` is rejected; weekday/tier checkbox arrays parse correctly; empty `frequencyCap`/`capacity` clear appropriately.
- **Unit (`previewSchedule`)**: agrees with `computeDeliverable` (`src/lib/engine/timeline.ts`) for representative `windowed`, `dated_instance`, and `one_shot` inputs (goesOut + assetDue dates).
- **Manual walkthrough**: edit Facebook's posting weekdays + timing days, confirm "✓ Saved", confirm persistence after reload, confirm the live date preview matches.

## Implementation caveat
Per `AGENTS.md`, this is Next.js 16 with non-standard conventions. **Before writing `channel-row.tsx`**, read the relevant server-actions / forms guide under `node_modules/next/dist/docs/01-app/` to confirm the exact action-state + `<form action>` usage for this version, rather than assuming the API from memory.
