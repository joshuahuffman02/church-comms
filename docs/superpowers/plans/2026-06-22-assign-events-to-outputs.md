# Assign Events to Outputs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff a drag-and-drop board (`/assign`) and an event-page channel picker to control which channels each event appears on, reusing the existing scheduling backend.

**Architecture:** Two client surfaces over one backend. A pure mapper (`src/lib/assign.ts`) turns events+deliverables+channels into board columns. A thin `assignChannel(requestId, channelId)` server action computes the channel's default publish date and delegates to the existing `attachChannel`; removal reuses the existing `removeDeliverable`. The board uses `@dnd-kit` (as the Production board does); the event page uses click-to-toggle chips.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), Prisma 7/SQLite, `@dnd-kit/core`, Tailwind v4, vitest.

## Global Constraints

- This is a modified Next.js — read `node_modules/next/dist/docs/` before new patterns. Server-component pages `await searchParams`/`params`.
- No database migration. "On a channel" = a `Deliverable` for `(requestId, channelId)` with `status !== "skipped"`.
- Dates are church-local midnight via `atMidnight`/`subDays` from `@/lib/engine/dates` — never `toISOString()` for date keys.
- `"use server"` files may only export async functions. Shared pure helpers live in `@/lib/*`.
- Reuse, do not reimplement: `attachChannel(requestId, fd)` (`src/actions/quick-items.ts`), `removeDeliverable(id)` (`src/actions/events.ts`), `tierLabel` (`@/lib/labels`), `PROMOTABLE_REQUEST_STATUSES` (`@/lib/status`).
- Scope: all upcoming events (`eventStart >= today`), excluding `noPromo`. Tier is overridden (any event → any channel — `attachChannel` already bypasses tier).

---

## File Structure

- Create `src/lib/assign.ts` — pure helpers: `defaultPublishDate`, `canAssign`, `buildBoardModel` + input/output types.
- Create `tests/assign.test.ts` — unit tests for the pure helpers.
- Create `src/actions/assign.ts` — `assignChannel(requestId, channelId)` server action (dedup + default date + delegate to `attachChannel`).
- Create `src/app/assign/page.tsx` — server page: load data, build model, render board.
- Create `src/components/assign-board.tsx` — `@dnd-kit` board client component.
- Create `src/components/channel-picker.tsx` — event-page "Where it's going" + toggle chips client component.
- Modify `src/app/requests/[id]/page.tsx` — render `<ChannelPicker>` in the deliverables area.
- Modify `src/components/nav.tsx` — add "Assign" under *Make & send*.

---

### Task 1: Pure board helpers (`src/lib/assign.ts`)

**Files:**
- Create: `src/lib/assign.ts`
- Test: `tests/assign.test.ts`

**Interfaces:**
- Consumes: `subDays`, `atMidnight` from `@/lib/engine/dates`; `tierLabel` from `@/lib/labels`.
- Produces:
  - `type AssignEvent = { id: string; title: string; eventStartMs: number; tier: number; noPromo: boolean }`
  - `type AssignDeliverable = { id: string; requestId: string; channelId: string; status: string; publishMs: number | null }`
  - `type AssignChannel = { id: string; key: string; name: string; color: string }`
  - `type EventCard = { id: string; title: string; eventStartMs: number; tierLabel: string }`
  - `type Placement = { deliverableId: string; requestId: string; title: string; eventStartMs: number; publishMs: number | null }`
  - `defaultPublishDate(eventStart: Date, offsetDays: number): Date`
  - `canAssign(deliverables: AssignDeliverable[], requestId: string, channelId: string): boolean`
  - `buildBoardModel(events: AssignEvent[], deliverables: AssignDeliverable[], channels: AssignChannel[]): { allEvents: EventCard[]; byChannel: Record<string, Placement[]> }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/assign.test.ts
import { describe, it, expect } from "vitest";
import { defaultPublishDate, canAssign, buildBoardModel } from "@/lib/assign";
import type { AssignDeliverable } from "@/lib/assign";

describe("defaultPublishDate", () => {
  it("is eventStart minus the channel's publish offset, at midnight", () => {
    const d = defaultPublishDate(new Date(2026, 6, 11, 9, 30), 7); // Jul 11 → Jul 4
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(0);
  });
});

describe("canAssign", () => {
  const dels: AssignDeliverable[] = [
    { id: "d1", requestId: "r1", channelId: "c1", status: "to_design", publishMs: 1 },
    { id: "d2", requestId: "r1", channelId: "c2", status: "skipped", publishMs: 2 },
  ];
  it("is false when a non-skipped deliverable already exists for the pair", () => {
    expect(canAssign(dels, "r1", "c1")).toBe(false);
  });
  it("is true when the only deliverable for the pair is skipped", () => {
    expect(canAssign(dels, "r1", "c2")).toBe(true);
  });
  it("is true when there is no deliverable for the pair", () => {
    expect(canAssign(dels, "r1", "c3")).toBe(true);
  });
});

describe("buildBoardModel", () => {
  const channels = [
    { id: "c1", key: "loop", name: "Sunday Loop", color: "#000" },
    { id: "c2", key: "fb", name: "Facebook", color: "#111" },
  ];
  const events = [
    { id: "r1", title: "VBS", eventStartMs: 100, tier: 1, noPromo: false },
    { id: "r2", title: "Room Only", eventStartMs: 200, tier: 2, noPromo: true },
  ];
  const dels: AssignDeliverable[] = [
    { id: "d1", requestId: "r1", channelId: "c1", status: "to_design", publishMs: 50 },
    { id: "d2", requestId: "r1", channelId: "c2", status: "skipped", publishMs: 60 },
    { id: "d3", requestId: "r2", channelId: "c1", status: "to_design", publishMs: 70 },
  ];
  it("lists non-noPromo events once and places non-skipped deliverables under their channel", () => {
    const model = buildBoardModel(events, dels, channels);
    expect(model.allEvents.map((e) => e.id)).toEqual(["r1"]); // r2 is noPromo
    expect(model.byChannel.c1.map((p) => p.requestId)).toEqual(["r1"]); // r2 excluded (noPromo)
    expect(model.byChannel.c2).toEqual([]); // d2 is skipped
  });
  it("labels the tier in plain words", () => {
    const model = buildBoardModel(events, dels, channels);
    expect(model.allEvents[0].tierLabel).toBe("Whole church");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/assign.test.ts`
Expected: FAIL — cannot find module `@/lib/assign`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/assign.ts
import { subDays, atMidnight } from "@/lib/engine/dates";
import { tierLabel } from "@/lib/labels";

export type AssignEvent = { id: string; title: string; eventStartMs: number; tier: number; noPromo: boolean };
export type AssignDeliverable = { id: string; requestId: string; channelId: string; status: string; publishMs: number | null };
export type AssignChannel = { id: string; key: string; name: string; color: string };
export type EventCard = { id: string; title: string; eventStartMs: number; tierLabel: string };
export type Placement = { deliverableId: string; requestId: string; title: string; eventStartMs: number; publishMs: number | null };

/** Channel's normal publish date for an event: eventStart − offset, at midnight. */
export function defaultPublishDate(eventStart: Date, offsetDays: number): Date {
  return atMidnight(subDays(atMidnight(eventStart), offsetDays));
}

/** True when the event is NOT already on this channel (no non-skipped deliverable). */
export function canAssign(deliverables: AssignDeliverable[], requestId: string, channelId: string): boolean {
  return !deliverables.some(
    (d) => d.requestId === requestId && d.channelId === channelId && d.status !== "skipped",
  );
}

/** Map events + deliverables + channels into the board's columns. noPromo events
 * are excluded entirely; skipped deliverables are ignored. */
export function buildBoardModel(
  events: AssignEvent[],
  deliverables: AssignDeliverable[],
  channels: AssignChannel[],
): { allEvents: EventCard[]; byChannel: Record<string, Placement[]> } {
  const promotable = events.filter((e) => !e.noPromo);
  const eventById = new Map(promotable.map((e) => [e.id, e]));

  const allEvents: EventCard[] = promotable
    .slice()
    .sort((a, b) => a.eventStartMs - b.eventStartMs)
    .map((e) => ({ id: e.id, title: e.title, eventStartMs: e.eventStartMs, tierLabel: tierLabel(e.tier) }));

  const byChannel: Record<string, Placement[]> = {};
  for (const ch of channels) byChannel[ch.id] = [];
  for (const d of deliverables) {
    if (d.status === "skipped") continue;
    const ev = eventById.get(d.requestId); // skips noPromo + unknown events
    if (!ev || !byChannel[d.channelId]) continue;
    byChannel[d.channelId].push({
      deliverableId: d.id,
      requestId: ev.id,
      title: ev.title,
      eventStartMs: ev.eventStartMs,
      publishMs: d.publishMs,
    });
  }
  for (const id of Object.keys(byChannel)) {
    byChannel[id].sort((a, b) => (a.publishMs ?? a.eventStartMs) - (b.publishMs ?? b.eventStartMs));
  }
  return { allEvents, byChannel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/assign.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assign.ts tests/assign.test.ts
git commit -m "feat(assign): pure board-model + scheduling helpers"
```

---

### Task 2: `assignChannel` server action (`src/actions/assign.ts`)

**Files:**
- Create: `src/actions/assign.ts`

**Interfaces:**
- Consumes: `attachChannel(requestId, fd)` (`@/actions/quick-items`), `defaultPublishDate`/`canAssign` (`@/lib/assign`), `db`, `requireEditor`.
- Produces: `assignChannel(requestId: string, channelId: string): Promise<void>`

This action computes the channel's normal publish date and delegates to the existing, tier-bypassing `attachChannel` (which creates the deliverable+touch, logs, and revalidates). It dedups first so a repeat drop is a no-op. Removal on the board/picker uses the existing `removeDeliverable(id)` directly — no new action needed.

- [ ] **Step 1: Write the implementation** (no unit test — thin DB delegation; covered by build + manual smoke)

```ts
// src/actions/assign.ts
"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { attachChannel } from "@/actions/quick-items";
import { canAssign, defaultPublishDate, type AssignDeliverable } from "@/lib/assign";

/** Local YYYY-MM-DD (church-local), to feed attachChannel's date field. */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Put an event on a channel at that channel's normal publish lead. Dedups
 * (no-op if already on the channel), then delegates to attachChannel — which
 * bypasses tier (manual override), schedules the touch, logs, and revalidates.
 */
export async function assignChannel(requestId: string, channelId: string): Promise<void> {
  await requireEditor();

  const [request, channel, dels] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { eventStart: true } }),
    db.channel.findUnique({ where: { id: channelId }, select: { defaultPublishOffsetDays: true } }),
    db.deliverable.findMany({ where: { requestId }, select: { id: true, requestId: true, channelId: true, status: true } }),
  ]);
  if (!request || !channel) return;

  const existing: AssignDeliverable[] = dels.map((d) => ({ ...d, publishMs: null }));
  if (!canAssign(existing, requestId, channelId)) return; // already on this channel

  const date = defaultPublishDate(request.eventStart, channel.defaultPublishOffsetDays);
  const fd = new FormData();
  fd.set("channelId", channelId);
  fd.set("date", isoDay(date));
  await attachChannel(requestId, fd);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/assign.ts
git commit -m "feat(assign): assignChannel action (dedup + default date + delegate)"
```

---

### Task 3: The Assign board (`/assign`)

**Files:**
- Create: `src/components/assign-board.tsx`
- Create: `src/app/assign/page.tsx`

**Interfaces:**
- Consumes: `buildBoardModel`, types (`@/lib/assign`); `assignChannel` (`@/actions/assign`); `removeDeliverable` (`@/actions/events`); `@dnd-kit/core`.
- Produces: page at `/assign`.

- [ ] **Step 1: Write the board client component**

```tsx
// src/components/assign-board.tsx
"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { assignChannel } from "@/actions/assign";
import { removeDeliverable } from "@/actions/events";
import type { AssignChannel, EventCard, Placement } from "@/lib/assign";

type Model = { allEvents: EventCard[]; byChannel: Record<string, Placement[]> };
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const REMOVE = "__remove__";

function EventChip({ card }: { card: EventCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `evt:${card.id}` });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`card-float mb-2 cursor-grab p-2.5 text-sm active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}>
      <div className="font-semibold">{card.title}</div>
      <div className="text-muted text-xs">{fmt(card.eventStartMs)} · {card.tierLabel}</div>
    </div>
  );
}

function PlacementChip({ p, onRemove }: { p: Placement; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `del:${p.deliverableId}:${p.requestId}` });
  return (
    <div ref={setNodeRef}
      className={`card-float mb-2 flex items-center justify-between gap-2 p-2.5 text-sm ${isDragging ? "opacity-40" : ""}`}>
      <span {...listeners} {...attributes} className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
        <span className="font-semibold">{p.title}</span>
        <span className="text-muted text-xs"> · {p.publishMs ? `on ${fmt(p.publishMs)}` : "no date"}</span>
      </span>
      <button onClick={onRemove} aria-label={`Remove ${p.title}`} className="shrink-0 text-muted hover:text-rose-600">✕</button>
    </div>
  );
}

function Column({ id, title, children, tint }: { id: string; title: string; children: React.ReactNode; tint?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="w-60 shrink-0 rounded-3xl p-2 transition" style={{ background: isOver ? (tint ?? "#93c5fd") + "22" : "transparent" }}>
      <div className="px-2 pb-2 text-sm font-bold">{title}</div>
      {children}
    </div>
  );
}

export function AssignBoard({ channels, model }: { channels: AssignChannel[]; model: Model }) {
  const [data, setData] = useState(model);
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const allEvents = useMemo(
    () => data.allEvents.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase())),
    [data.allEvents, q],
  );
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "";

  function add(requestId: string, channelId: string) {
    const card = data.allEvents.find((e) => e.id === requestId);
    if (!card || data.byChannel[channelId]?.some((p) => p.requestId === requestId)) return;
    const optimistic: Placement = { deliverableId: `tmp:${requestId}:${channelId}`, requestId, title: card.title, eventStartMs: card.eventStartMs, publishMs: null };
    setData((d) => ({ ...d, byChannel: { ...d.byChannel, [channelId]: [...(d.byChannel[channelId] ?? []), optimistic] } }));
    start(() => assignChannel(requestId, channelId));
  }
  function remove(channelId: string, deliverableId: string) {
    setData((d) => ({ ...d, byChannel: { ...d.byChannel, [channelId]: d.byChannel[channelId].filter((p) => p.deliverableId !== deliverableId) } }));
    if (!deliverableId.startsWith("tmp:")) start(() => removeDeliverable(deliverableId));
  }

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id ? String(e.over.id) : null;
    const active = String(e.active.id);
    if (!over) return;
    if (active.startsWith("evt:")) {
      if (over === REMOVE || over === "all") return;
      add(active.slice(4), over);
    } else if (active.startsWith("del:")) {
      const [, deliverableId, requestId] = active.split(":");
      const sourceId = Object.keys(data.byChannel).find((cid) => data.byChannel[cid].some((p) => p.deliverableId === deliverableId));
      if (!sourceId) return;
      if (over === REMOVE || over === "all") { remove(sourceId, deliverableId); return; }
      if (over !== sourceId) { add(requestId, over); remove(sourceId, deliverableId); }
    }
  }

  return (
    <DndContext id="assign-board" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-4">
        <Column id="all" title={`All events · ${allEvents.length}`}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" className="mb-2 w-full rounded-full border px-3 py-1.5 text-sm" />
          {allEvents.map((c) => <EventChip key={c.id} card={c} />)}
        </Column>
        {channels.map((ch) => (
          <Column key={ch.id} id={ch.id} title={`${ch.name} · ${data.byChannel[ch.id]?.length ?? 0}`} tint={ch.color}>
            {(data.byChannel[ch.id] ?? []).map((p) => (
              <PlacementChip key={p.deliverableId} p={p} onRemove={() => remove(ch.id, p.deliverableId)} />
            ))}
          </Column>
        ))}
        <Column id={REMOVE} title="🗑️ Remove">
          <div className="text-muted px-2 text-xs">Drag a card here to take it off its channel.</div>
        </Column>
      </div>
      <p className="text-muted text-xs">Drag an event onto a channel to add it (auto-scheduled). Drag a card between channels to move it; ✕ or the Remove column to take it off. <Link href="/this-week" className="underline">This Week</Link> reflects changes.</p>
    </DndContext>
  );
}
```

- [ ] **Step 2: Write the server page**

```tsx
// src/app/assign/page.tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { atMidnight } from "@/lib/engine/dates";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { buildBoardModel, type AssignEvent, type AssignDeliverable, type AssignChannel } from "@/lib/assign";
import { AssignBoard } from "@/components/assign-board";

export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isEditor(user.roles)) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold mb-2">Assign to channels</h1>
        <div className="card-float border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Editor access is required.</div>
      </div>
    );
  }

  const today = atMidnight(new Date());
  const [requests, channels] = await Promise.all([
    db.request.findMany({
      where: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false, eventStart: { gte: today } },
      select: { id: true, title: true, eventStart: true, tier: true, noPromo: true,
        deliverables: { select: { id: true, channelId: true, status: true, touches: { select: { scheduledAt: true }, orderBy: { scheduledAt: "asc" }, take: 1 } } } },
      orderBy: { eventStart: "asc" },
    }),
    db.channel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, key: true, name: true, color: true } }),
  ]);

  const events: AssignEvent[] = requests.map((r) => ({ id: r.id, title: r.title, eventStartMs: r.eventStart.getTime(), tier: r.tier, noPromo: r.noPromo }));
  const deliverables: AssignDeliverable[] = requests.flatMap((r) =>
    r.deliverables.map((d) => ({ id: d.id, requestId: r.id, channelId: d.channelId, status: d.status, publishMs: d.touches[0]?.scheduledAt.getTime() ?? null })),
  );
  const chans: AssignChannel[] = channels;
  const model = buildBoardModel(events, deliverables, chans);

  return (
    <div className="max-w-full">
      <h1 className="text-2xl font-extrabold mb-1">Assign to channels 🧲</h1>
      <p className="text-muted mb-4">Drag any upcoming event onto the channels it should appear on.</p>
      <AssignBoard channels={chans} model={model} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean; `/assign` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add src/components/assign-board.tsx src/app/assign/page.tsx
git commit -m "feat(assign): drag-and-drop assign board at /assign"
```

---

### Task 4: Event-page channel picker

**Files:**
- Create: `src/components/channel-picker.tsx`
- Modify: `src/app/requests/[id]/page.tsx` (render the picker in the deliverables area)

**Interfaces:**
- Consumes: `assignChannel`, `removeDeliverable`; props built by the event page.
- Produces: `<ChannelPicker channels=... placements=... requestId=... canEdit=... />`

- [ ] **Step 1: Write the picker client component**

```tsx
// src/components/channel-picker.tsx
"use client";
import { useState, useTransition } from "react";
import { assignChannel } from "@/actions/assign";
import { removeDeliverable } from "@/actions/events";

export type PickerChannel = { id: string; name: string; color: string };
export type PickerPlacement = { channelId: string; deliverableId: string; publishMs: number | null };

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ChannelPicker({ channels, placements, requestId, canEdit }: {
  channels: PickerChannel[]; placements: PickerPlacement[]; requestId: string; canEdit: boolean;
}) {
  const [onMap, setOnMap] = useState<Record<string, PickerPlacement | undefined>>(
    Object.fromEntries(placements.map((p) => [p.channelId, p])),
  );
  const [, start] = useTransition();

  function toggle(channelId: string) {
    if (!canEdit) return;
    const current = onMap[channelId];
    if (current) {
      setOnMap((m) => ({ ...m, [channelId]: undefined }));
      if (!current.deliverableId.startsWith("tmp:")) start(() => removeDeliverable(current.deliverableId));
    } else {
      setOnMap((m) => ({ ...m, [channelId]: { channelId, deliverableId: `tmp:${channelId}`, publishMs: null } }));
      start(() => assignChannel(requestId, channelId));
    }
  }

  return (
    <div className="card-float mb-4 p-5">
      <h2 className="font-bold mb-1">Where it&apos;s going</h2>
      <p className="text-muted mb-3 text-xs">{canEdit ? "Tap a channel to add it; tap ✕ to take it off." : "The channels this event appears on."}</p>
      <div className="flex flex-wrap gap-2">
        {channels.map((ch) => {
          const on = onMap[ch.id];
          return (
            <button key={ch.id} type="button" disabled={!canEdit} onClick={() => toggle(ch.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${on ? "text-white" : "border border-slate-200 text-ink/70 hover:bg-sky-bg"} disabled:opacity-60`}
              style={on ? { background: ch.color } : undefined}>
              <span>{ch.name}</span>
              {on?.publishMs && <span className="opacity-90">· {fmt(on.publishMs)}</span>}
              {on && canEdit && <span aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the event page**

In `src/app/requests/[id]/page.tsx`: load active channels, map this request's non-skipped deliverables (with earliest touch) to `PickerPlacement[]`, and render `<ChannelPicker channels={...} placements={...} requestId={request.id} canEdit={canEdit} />` directly above the existing `<DeliverableList .../>`. (The query already loads `request.deliverables` with `touches`; add `db.channel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } })`.)

```tsx
// import at top:
import { ChannelPicker, type PickerPlacement } from "@/components/channel-picker";
// after loading `request` and active `channels`:
const placements: PickerPlacement[] = request.deliverables
  .filter((d) => d.status !== "skipped")
  .map((d) => ({ channelId: d.channelId, deliverableId: d.id, publishMs: d.touches?.[0]?.scheduledAt.getTime() ?? null }));
// in JSX, just before <DeliverableList ...>:
<ChannelPicker channels={channels} placements={placements} requestId={request.id} canEdit={canEdit} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (Confirm `request.deliverables` includes `channelId`, `status`, and `touches.scheduledAt`; add to the select if missing.)

- [ ] **Step 4: Commit**

```bash
git add src/components/channel-picker.tsx "src/app/requests/[id]/page.tsx"
git commit -m "feat(assign): event-page channel picker (Where it's going)"
```

---

### Task 5: Nav entry + full verification

**Files:**
- Modify: `src/components/nav.tsx` (the "Make & send" section's `items` array)

- [ ] **Step 1: Add the nav item**

In `src/components/nav.tsx`, inside the `Make & send` section's `items`, add after Production:
```ts
{ href: "/assign", label: "Assign", icon: "🧲" },
```

- [ ] **Step 2: Full verification**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: lint clean; tsc clean; all tests pass; build succeeds with `/assign` in the route list.

- [ ] **Step 3: Manual smoke (dev server)**

Open `/assign`: drag an event from "All events" onto a channel → a card appears; reload → it persisted. Drag it to "Remove" → gone. Open an event page → "Where it's going" chips reflect its channels; tap one → adds; tap ✕ → removes.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav.tsx
git commit -m "feat(assign): add Assign to the nav"
```

---

## Self-Review

- **Spec coverage:** Board (Task 3), event-page picker (Task 4), all-upcoming/noPromo-excluded/tier-override (Tasks 1+3), auto-schedule via default date (Tasks 1+2), reuse attach/remove (Task 2), pure helpers tested (Task 1), nav (Task 5). ✓
- **Out of scope (per spec):** AV/Top-3 reconciliation is NOT in this plan — it was raised after the spec and needs its own design (how picking the Top-3 prunes other AV slides). Track separately.
- **Type consistency:** `AssignEvent/AssignDeliverable/AssignChannel/EventCard/Placement` defined in Task 1 and consumed unchanged in Tasks 2-4. `assignChannel(requestId, channelId)` / `removeDeliverable(id)` used consistently.
- **Placeholders:** none — full code in each code step.
