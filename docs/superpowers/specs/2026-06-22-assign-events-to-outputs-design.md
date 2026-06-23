# Assign events to outputs — design

**Date:** 2026-06-22
**Status:** Approved (pending spec review)

## Summary

Give staff a fast, visual way to control **which channels (outputs) an event
appears on** — without hand-editing dates. Two views of the same
event↔channel relationship, sharing one backend:

1. **Assign board** (`/assign`) — drag events across channel columns
   (cross-event planning).
2. **Event page — "Where it's going"** — see each channel + the week it
   publishes, and click chips to add/remove channels (per-event placement).

Both reuse the existing `attachChannel` / `removeDeliverable` actions, so they
always agree, and the scheduling engine handles timing.

## Goals / non-goals

**Goals**
- See, at a glance, what advertising pieces an event will be in and what week.
- Add/remove a channel on an event with a single gesture (drag on the board;
  click-toggle on the event page).
- Allow **manual override of tier** (put any event on any channel).
- Reuse existing scheduling so a placed channel auto-schedules.

**Non-goals (YAGNI)**
- Changing the auto-plan / tier-eligibility engine.
- Editing individual touch dates from the board (that stays on the event +
  per-output pages).
- Bulk multi-select drag, undo stacks, drag-on-the-event-page.
- Any schema/migration change.

## Surface 1 — the Assign board (`/assign`)

**Layout.** A horizontally-scrolling board (same shell as the Production board):
- Leftmost **"All events"** column — every upcoming event listed once.
- One column per **active channel** (Announcement Video, Sunday Loop, Bulletin
  Inserts, Church App, Facebook, …), each listing the events currently on it.
- A **"Remove" drop zone** (a slim drop target, e.g. a header strip or a
  trash column).
- A **search box** filters the event cards (keeps "all upcoming" manageable).

**Cards.** Event title, event date, audience (tier label), ministry dots. In a
channel column the card also shows the **publish week** and a **✕**.

**Interactions** (optimistic UI + server action + revalidate, like Production):
- Drag **All events → channel** = add (auto-scheduled at the channel's normal
  lead). Card now also appears in that channel column; it stays in All events.
- Drag **channel → channel** = move (add target + remove source).
- Remove = the **✕** on a placed card **or** drag it into the **Remove** zone.
- Drop on a channel the event is already on = **no-op**.

**Scope.** All upcoming events (`eventStart >= today`), **excluding `noPromo`
("room only") events**. Inactive channels are not shown as columns.

**Tech.** `@dnd-kit/core` (already a dependency, used by `pipeline-board.tsx`).

## Surface 2 — event page "Where it's going"

On `requests/[id]` (enhancing the existing "Pieces to make" area):
- **"Where it's going"** — each channel the event is on, with the **week it
  publishes** (e.g. "📺 Announcement Video · week of Jul 5").
- **Channel picker** — every active channel as a toggle chip:
  - **On** = filled, shows its week, has a **✕** to remove.
  - **Off** = outlined; **click to add** (auto-scheduled).
- Gesture is **click-to-toggle, not drag** (better on a detail page / iPad).

## Backend (reuse + thin additions)

- **`attachChannel(requestId, fd)`** (`src/actions/quick-items.ts`) already
  bypasses tier and creates a deliverable + a single scheduled touch given a
  `date`. **Refactor:** extract its create-core into a shared helper so a new
  action can call it without a `FormData`/date round-trip.
- **New `assignChannel(requestId, channelId)`** — computes the default publish
  date (`eventStart − channel.defaultPublishOffsetDays`, church-local midnight),
  then calls the shared create-core. No-op if the event already has a
  non-skipped deliverable on that channel.
- **`removeDeliverable(deliverableId)`** (`src/actions/events.ts`) — remove.
- **Move** = `assignChannel(target)` + `removeDeliverable(source)`.
- Both new/changed actions are `requireEditor`-guarded and revalidate
  `/assign`, `/requests/[id]`, `/outputs`, `/this-week`.

## Data model

**No schema change.** "On a channel" = a `Deliverable` for `(request, channel)`
whose `status !== "skipped"`. A board-added channel starts as a single
scheduled placement (the channel's normal publish date); auto-planned channels
may already carry a richer multi-touch schedule — both coexist fine.

## Pure, unit-tested logic

- `buildBoardModel(events, deliverables, channels)` →
  `{ allEvents: Card[]; byChannel: Map<channelId, Card[]> }`, excluding
  `noPromo`, ignoring skipped deliverables.
- `canAssign(requestId, channelId, deliverables)` → false if a non-skipped
  deliverable already exists (dedup / no-op guard).
- `defaultPublishDate(eventStart, channel)` =
  `eventStart − channel.defaultPublishOffsetDays` at church-local midnight.

## Components

- `src/app/assign/page.tsx` (server) — load upcoming events + their
  deliverables + active channels; build the board model; render.
- `src/components/assign-board.tsx` (client) — the @dnd-kit board.
- `src/components/channel-picker.tsx` (client) — the event-page toggle chips +
  "Where it's going" list (reused by `requests/[id]`).
- `src/actions/assign.ts` (or extend `quick-items.ts`) — `assignChannel`,
  shared create-core.
- `src/lib/assign.ts` — the pure helpers above.
- Nav: add **"Assign"** under *Make & send* (route `/assign`).

## Edge cases

- Drop on an already-present channel → no-op.
- Event on zero channels → only in "All events".
- Published/scheduled deliverable → still removable via ✕ (shows its status; no
  hard confirm in v1 to keep it light).
- `noPromo` events → excluded everywhere on the board.
- Volume (all upcoming × ~10 channels) → horizontal column scroll + per-column
  vertical scroll + the event search filter.

## Testing

- Unit (vitest): `buildBoardModel`, `canAssign`, `defaultPublishDate`.
- Verification: `lint`, `tsc`, `vitest`, `next build`; manual drag/click smoke.

## Naming

- Nav label: **"Assign"**; route `/assign`; page title "Assign to channels".
