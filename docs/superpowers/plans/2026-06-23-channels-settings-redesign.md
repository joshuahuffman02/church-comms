# Channels Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/settings/channels` so every channel rule is editable, saves are confirmed, and timing is shown as real dates — without changing the Prisma schema or the scheduling engine.

**Architecture:** A single page renders a single-open accordion list of channels (client `ChannelList` → `ChannelRow`). Each row's grouped, plain-language form posts to a refactored `updateChannel` server action (now `(prevState, formData)` via `useActionState`) that writes the full safe field set. Two pure, unit-tested helpers do the heavy lifting: `parseChannelUpdate` (FormData → Prisma update input) and `previewSchedule` (relative offsets → real dates, mirroring the engine).

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19 (`useActionState`), Prisma, Tailwind v4 (CSS-first `@theme`), Vitest.

## Global Constraints

- Next.js 16.2.7 / React 19.2.4 — use `useActionState(action, initialState) → [state, formAction, pending]`; action signature is `(prevState, formData)`.
- Do NOT change `prisma/schema.prisma`. Editable fields map to existing columns only.
- Out of scope (confirmed dead): `contentSpec`, `autoApprove`.
- Dates are CHURCH-LOCAL midnight (`new Date(y,m,d)` via `@/lib/engine/dates`). NEVER `toISOString()` for display — use `toLocaleDateString`.
- Match house style: `card-float`, `bg-ink` pill buttons, `rounded-full`/`rounded-2xl`, `text-muted`/`text-ink`, `bg-sky-bg`. Reuse `useSaveFlash`/`SavedTick`, `ChannelDeleteButton`, `tierLabel`, `AdminOnlyCard`, `SettingsNav`.
- Plain-language UI labels: *Start promoting* (offset), *Artwork ready* (lead), *Posts on* (weekdays), *Max per week* (frequencyCap), *Who it's for* (tiers), *Stop accepting changes* (lockLeadDays).
- Tests: `npx vitest run <file>`. Import via `@/` alias. Style mirrors `tests/google-intake.test.ts`.

---

## File Structure

- Create `src/lib/channel-form.ts` — pure `parseChannelUpdate(fd) → {ok,data}|{ok:false,error}`.
- Create `src/lib/channel-preview.ts` — pure `previewSchedule(input, exampleEvent) → {goesOut, assetDue}`.
- Create `src/components/channel-row.tsx` — `"use client"` accordion row + grouped form + feedback; exports `ChannelView` type.
- Create `src/components/channel-list.tsx` — `"use client"` single-open list wrapper.
- Modify `src/actions/channels.ts` — refactor `updateChannel` to `(prevState, fd)`, use `parseChannelUpdate`, return `ChannelActionState`.
- Modify `src/app/settings/channels/page.tsx` — render `ChannelList`; plain-language intro; keep the `＋ Add a channel` form.
- Create `tests/channel-form.test.ts`, `tests/channel-preview.test.ts`.

---

### Task 1: `parseChannelUpdate` pure helper

**Files:**
- Create: `src/lib/channel-form.ts`
- Test: `tests/channel-form.test.ts`

**Interfaces:**
- Produces: `CHANNEL_TYPES: readonly ["windowed","dated_instance","one_shot"]`; `parseChannelUpdate(fd: FormData): { ok: true; data: Prisma.ChannelUpdateInput } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/channel-form.test.ts
import { describe, it, expect } from "vitest";
import { parseChannelUpdate } from "@/lib/channel-form";

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("parseChannelUpdate", () => {
  it("parses a full windowed form", () => {
    const r = parseChannelUpdate(fd([
      ["type", "windowed"], ["name", "Facebook"], ["offset", "21"], ["lead", "7"],
      ["active", "on"], ["color", "#378add"], ["weekday", "0"], ["weekday", "3"],
      ["tier", "1"], ["tier", "2"], ["cap", "3"], ["capacity", ""], ["productionNotes", " hi "],
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name).toBe("Facebook");
    expect(r.data.type).toBe("windowed");
    expect(r.data.defaultPublishOffsetDays).toBe(21);
    expect(r.data.productionLeadDays).toBe(7);
    expect(r.data.active).toBe(true);
    expect(r.data.color).toBe("#378add");
    expect(r.data.cadence).toEqual({ weekdays: [0, 3] });
    expect(r.data.tierEligibility).toEqual([1, 2]);
    expect(r.data.frequencyCap).toBe(3);
    expect(r.data.capacity).toBeNull();
    expect(r.data.productionNotes).toBe("hi");
  });

  it("rejects an unknown type and a blank name", () => {
    expect(parseChannelUpdate(fd([["type", "nope"], ["name", "x"]])).ok).toBe(false);
    expect(parseChannelUpdate(fd([["type", "windowed"], ["name", "  "]])).ok).toBe(false);
  });

  it("does not write cadence/cap/lockLead when their fields are absent (no clobber)", () => {
    const r = parseChannelUpdate(fd([["type", "one_shot"], ["name", "Bulletin"], ["offset", "5"], ["lead", "2"]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("cadence" in r.data).toBe(false);
    expect("frequencyCap" in r.data).toBe(false);
    expect("lockLeadDays" in r.data).toBe(false);
  });

  it("defaults empty tiers to all three and empty weekdays to Sunday", () => {
    const r = parseChannelUpdate(fd([["type", "windowed"], ["name", "X"], ["offset", "1"], ["lead", "1"]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.tierEligibility).toEqual([1, 2, 3]);
    expect(r.data.cadence).toEqual({ weekdays: [0] });
  });

  it("clears optional numbers to null and reads lockLead for dated_instance", () => {
    const r = parseChannelUpdate(fd([
      ["type", "dated_instance"], ["name", "Service slide"], ["offset", "21"], ["lead", "7"],
      ["weekday", "0"], ["lockLead", ""], ["capacity", "3"], ["cap", ""],
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.lockLeadDays).toBeNull();
    expect(r.data.capacity).toBe(3);
    expect(r.data.frequencyCap).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/channel-form.test.ts`
Expected: FAIL — cannot find module `@/lib/channel-form`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/channel-form.ts
import type { Prisma } from "@prisma/client";

export const CHANNEL_TYPES = ["windowed", "dated_instance", "one_shot"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

function isChannelType(v: string): v is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(v);
}

/** Non-negative integer; blank/NaN -> 0. */
function nonNegInt(v: FormDataEntryValue | null): number {
  const n = Math.floor(Number(typeof v === "string" ? v.trim() : v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Optional non-negative int from a present field; blank/invalid -> null. */
function optNonNegInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type ParseResult =
  | { ok: true; data: Prisma.ChannelUpdateInput }
  | { ok: false; error: string };

/**
 * FormData -> a Prisma Channel update. Pure + DB-free so it is unit-testable.
 * Fields are written CONDITIONALLY: a field whose form control isn't rendered for
 * this channel type (cadence for one_shot, cap unless windowed, lockLead unless
 * dated_instance) is omitted so a partial form never clobbers a stored value.
 */
export function parseChannelUpdate(fd: FormData): ParseResult {
  const typeRaw = String(fd.get("type") ?? "");
  if (!isChannelType(typeRaw)) return { ok: false, error: "Unknown channel type." };
  const type = typeRaw;

  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name can’t be blank." };

  const data: Prisma.ChannelUpdateInput = {
    name,
    type,
    defaultPublishOffsetDays: nonNegInt(fd.get("offset")),
    productionLeadDays: nonNegInt(fd.get("lead")),
    active: fd.get("active") === "on",
  };

  const color = String(fd.get("color") ?? "").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) data.color = color;

  const tiers = fd.getAll("tier").map(Number).filter((n) => n === 1 || n === 2 || n === 3);
  data.tierEligibility = tiers.length ? tiers : [1, 2, 3];

  if (type !== "one_shot") {
    const weekdays = fd.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    data.cadence = { weekdays: weekdays.length ? weekdays : [0] };
  }

  const capRaw = fd.get("cap");
  if (typeof capRaw === "string") {
    const n = optNonNegInt(capRaw);
    data.frequencyCap = n && n > 0 ? n : null;
  }

  const capacityRaw = fd.get("capacity");
  if (typeof capacityRaw === "string") data.capacity = optNonNegInt(capacityRaw);

  const lockRaw = fd.get("lockLead");
  if (typeof lockRaw === "string") data.lockLeadDays = optNonNegInt(lockRaw);

  const notesRaw = fd.get("productionNotes");
  if (typeof notesRaw === "string") data.productionNotes = notesRaw.trim().slice(0, 4000) || null;

  return { ok: true, data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/channel-form.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/channel-form.ts tests/channel-form.test.ts
git commit -m "feat(channels): pure parseChannelUpdate helper for the edit form"
```

---

### Task 2: `previewSchedule` pure helper

**Files:**
- Create: `src/lib/channel-preview.ts`
- Test: `tests/channel-preview.test.ts`

**Interfaces:**
- Consumes: `subDays`, `weekdaysBetween`, `atMidnight` from `@/lib/engine/dates`.
- Produces: `previewSchedule(input: PreviewInput, exampleEvent: Date): { goesOut: Date | null; assetDue: Date | null }` where `PreviewInput = { type: string; offset: number; lead: number; lockLeadDays?: number | null; weekdays: number[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/channel-preview.test.ts
import { describe, it, expect } from "vitest";
import { previewSchedule } from "@/lib/channel-preview";

const event = new Date(2026, 6, 26); // Sun Jul 26 2026
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

describe("previewSchedule", () => {
  it("one_shot counts straight back from the event", () => {
    const r = previewSchedule({ type: "one_shot", offset: 21, lead: 7, weekdays: [] }, event);
    expect(ymd(r.goesOut)).toBe("2026-7-5");
    expect(ymd(r.assetDue)).toBe("2026-6-28");
  });

  it("windowed uses the FIRST posting day in the window", () => {
    const r = previewSchedule({ type: "windowed", offset: 21, lead: 7, weekdays: [0] }, event);
    expect(ymd(r.goesOut)).toBe("2026-7-5");
    expect(ymd(r.assetDue)).toBe("2026-6-28");
  });

  it("dated_instance uses the LAST posting day and prefers lockLeadDays", () => {
    const r = previewSchedule({ type: "dated_instance", offset: 21, lead: 7, lockLeadDays: 14, weekdays: [0] }, event);
    expect(ymd(r.goesOut)).toBe("2026-7-26");
    expect(ymd(r.assetDue)).toBe("2026-7-12");
  });

  it("dated_instance falls back to lead when no lockLeadDays", () => {
    const r = previewSchedule({ type: "dated_instance", offset: 21, lead: 7, lockLeadDays: null, weekdays: [0] }, event);
    expect(ymd(r.assetDue)).toBe("2026-7-19");
  });

  it("returns nulls when no posting day lands in the window", () => {
    const r = previewSchedule({ type: "windowed", offset: 2, lead: 7, weekdays: [3] }, event);
    expect(r.goesOut).toBeNull();
    expect(r.assetDue).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/channel-preview.test.ts`
Expected: FAIL — cannot find module `@/lib/channel-preview`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/channel-preview.ts
import { atMidnight, subDays, weekdaysBetween } from "@/lib/engine/dates";

export interface PreviewInput {
  type: string;
  offset: number;
  lead: number;
  lockLeadDays?: number | null;
  weekdays: number[];
}

export interface PreviewResult {
  goesOut: Date | null;
  assetDue: Date | null;
}

/**
 * Resolve a channel's relative timing into real dates for one example event,
 * mirroring src/lib/engine/timeline.ts so the preview can't drift from the
 * real scheduler. windowed = first posting day in the window; dated_instance =
 * last posting day (and lockLeadDays overrides the production lead); one_shot =
 * straight offset from the event.
 */
export function previewSchedule(input: PreviewInput, exampleEvent: Date): PreviewResult {
  const event = atMidnight(exampleEvent);
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const lead = Math.max(0, Math.floor(input.lead || 0));
  const weekdays = input.weekdays.length ? input.weekdays : [0];

  let goesOut: Date | null;
  let effLead = lead;

  if (input.type === "one_shot") {
    goesOut = subDays(event, offset);
  } else if (input.type === "dated_instance") {
    const days = weekdaysBetween(subDays(event, offset), event, weekdays);
    goesOut = days.length ? days[days.length - 1] : null;
    effLead = input.lockLeadDays ?? lead;
  } else {
    const days = weekdaysBetween(subDays(event, offset), event, weekdays);
    goesOut = days.length ? days[0] : null;
  }

  return { goesOut, assetDue: goesOut ? subDays(goesOut, effLead) : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/channel-preview.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/channel-preview.ts tests/channel-preview.test.ts
git commit -m "feat(channels): previewSchedule helper resolving offsets to real dates"
```

---

### Task 3: Refactor `updateChannel` to a result-returning action

**Files:**
- Modify: `src/actions/channels.ts:38-71` (replace the `updateChannel` body) + add import + export `ChannelActionState`.

**Interfaces:**
- Consumes: `parseChannelUpdate` from `@/lib/channel-form`.
- Produces: `ChannelActionState = { ok: boolean; error?: string; savedAt?: number }`; `updateChannel(prev: ChannelActionState, fd: FormData): Promise<ChannelActionState>`.

- [ ] **Step 1: Replace the `updateChannel` function and add the import/type**

At the top of `src/actions/channels.ts`, add after the existing imports:

```ts
import { parseChannelUpdate } from "@/lib/channel-form";

export interface ChannelActionState {
  ok: boolean;
  error?: string;
  savedAt?: number;
}
```

Replace the whole current `updateChannel` (the JSDoc block + function, lines ~29-71) with:

```ts
/**
 * Edit an existing channel. Used via React `useActionState`, so the signature is
 * `(prevState, formData)` and it RETURNS a result the row can confirm/​surface.
 * All field parsing lives in the pure `parseChannelUpdate` (unit-tested); fields
 * whose controls aren't rendered for the channel's type are omitted, never
 * clobbered. Auth-guarded.
 */
export async function updateChannel(
  _prev: ChannelActionState,
  fd: FormData,
): Promise<ChannelActionState> {
  await requireAdmin();

  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing channel id." };

  const parsed = parseChannelUpdate(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await db.channel.update({ where: { id }, data: parsed.data });
  } catch {
    return { ok: false, error: "Couldn’t save — that channel may no longer exist." };
  }

  revalidatePath("/settings/channels");
  revalidatePath("/outputs");
  return { ok: true, savedAt: Date.now() };
}
```

Leave `createChannel` and `deleteChannel` unchanged. (The old `CHANNEL_TYPES` Set used by `createChannel` stays.)

- [ ] **Step 2: Typecheck the action compiles against its callers (none yet broken)**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/app/settings/channels/page.tsx` (still calls the old `<form action={updateChannel}>`). That file is rewritten in Task 5. No errors in `channels.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/actions/channels.ts
git commit -m "refactor(channels): updateChannel returns a result for useActionState + writes all safe fields"
```

---

### Task 4: `ChannelRow` + `ChannelList` client components

**Files:**
- Create: `src/components/channel-row.tsx`
- Create: `src/components/channel-list.tsx`

**Interfaces:**
- Consumes: `updateChannel`, `ChannelActionState` from `@/actions/channels`; `useSaveFlash`, `SavedTick`; `ChannelDeleteButton`; `previewSchedule` from `@/lib/channel-preview`; `parseDateInput`, `atMidnight` from `@/lib/engine/dates`; `tierLabel` from `@/lib/labels`.
- Produces: `ChannelView` type + `ChannelRow` (from `channel-row.tsx`); `ChannelList({ channels: ChannelView[]; exampleEventKey: string })` (from `channel-list.tsx`).

- [ ] **Step 1: Create `channel-row.tsx`**

```tsx
// src/components/channel-row.tsx
"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { updateChannel, type ChannelActionState } from "@/actions/channels";
import { useSaveFlash, SavedTick } from "@/components/save-flash";
import { ChannelDeleteButton } from "@/components/channel-delete-button";
import { previewSchedule } from "@/lib/channel-preview";
import { parseDateInput, atMidnight } from "@/lib/engine/dates";
import { tierLabel } from "@/lib/labels";

export interface ChannelView {
  id: string;
  name: string;
  type: string;
  color: string;
  active: boolean;
  offset: number;
  lead: number;
  lockLeadDays: number | null;
  weekdays: number[];
  capacity: number | null;
  frequencyCap: number | null;
  tiers: number[];
  notes: string;
}

const WEEKDAYS = [
  { value: 0, label: "Su" }, { value: 1, label: "Mo" }, { value: 2, label: "Tu" },
  { value: 3, label: "We" }, { value: 4, label: "Th" }, { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
];
const TYPE_LABELS: Record<string, string> = {
  windowed: "Runs over a span of days",
  dated_instance: "Happens once on a date",
  one_shot: "Sent once",
};
const initialState: ChannelActionState = { ok: false };
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
const daysBefore = (event: Date, d: Date | null) =>
  d ? Math.round((event.getTime() - d.getTime()) / 86400000) : null;

export function ChannelRow({
  channel, exampleEventKey, open, onToggle,
}: {
  channel: ChannelView; exampleEventKey: string; open: boolean; onToggle: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateChannel, initialState);
  const { flash, ping } = useSaveFlash();

  const [name, setName] = useState(channel.name);
  const [type, setType] = useState(channel.type);
  const [active, setActive] = useState(channel.active);
  const [color, setColor] = useState(channel.color);
  const [offset, setOffset] = useState(String(channel.offset));
  const [lead, setLead] = useState(String(channel.lead));
  const [weekdays, setWeekdays] = useState<number[]>(channel.weekdays);
  const [cap, setCap] = useState(channel.frequencyCap == null ? "" : String(channel.frequencyCap));
  const [capacity, setCapacity] = useState(channel.capacity == null ? "" : String(channel.capacity));
  const [lockLead, setLockLead] = useState(channel.lockLeadDays == null ? "" : String(channel.lockLeadDays));
  const [tiers, setTiers] = useState<number[]>(channel.tiers);
  const [notes, setNotes] = useState(channel.notes);

  const snapshot = () => JSON.stringify({
    name, type, active, color, offset, lead, weekdays: [...weekdays].sort(),
    cap, capacity, lockLead, tiers: [...tiers].sort(), notes,
  });
  const baseline = useRef(snapshot());
  const dirty = snapshot() !== baseline.current;

  useEffect(() => {
    if (state.ok) { ping(); baseline.current = snapshot(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const event = parseDateInput(exampleEventKey) ?? atMidnight(new Date());
  const preview = previewSchedule(
    { type, offset: num(offset), lead: num(lead), lockLeadDays: lockLead.trim() === "" ? null : num(lockLead), weekdays },
    event,
  );
  const gDays = daysBefore(event, preview.goesOut);
  const aDays = daysBefore(event, preview.assetDue);

  const toggleIn = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const summary = preview.goesOut
    ? `goes out ${gDays} days before · artwork due ${aDays} days before`
    : "no posting day in the window — check the weekdays";

  return (
    <div className={`card-float mb-3 overflow-hidden ${open ? "ring-2 ring-sky-200" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="h-3 w-3 flex-none rounded-full" style={{ background: channel.color }} />
        <span className="font-semibold text-ink">{name}</span>
        <span className="hidden flex-1 text-xs text-muted sm:block">{summary}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
        }`}>{active ? "On" : "Off"}</span>
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <form action={formAction} className="border-t border-slate-100 px-4 py-4">
          <input type="hidden" name="id" value={channel.id} />

          <section className="mb-5">
            <h3 className="mb-1 text-sm font-bold text-ink">What this channel is</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <label className="grid gap-1">
                <span className="font-semibold">Name</span>
                <input name="name" value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-2xl border px-3 py-1.5" />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Type</span>
                <select name="type" value={type} onChange={(e) => setType(e.target.value)}
                  className="rounded-2xl border px-3 py-1.5">
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Accent colour</span>
                <input type="color" name="color" value={color} onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 rounded border align-middle" />
              </label>
              <label className="mt-5 flex items-center gap-2">
                <input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span className="font-semibold">Active</span>
              </label>
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-1 text-sm font-bold text-ink">Timing rules</h3>
            <p className="mb-3 text-xs text-muted">How early this channel starts, and how much lead time the team needs.</p>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <label className="flex items-center gap-2">
                <span className="w-44 text-ink">Start promoting</span>
                <input name="offset" inputMode="numeric" value={offset} onChange={(e) => setOffset(e.target.value)}
                  className="w-14 rounded-full border px-2 py-1 text-center" />
                <span>days before the event</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-44 text-ink">Artwork must be ready</span>
                <input name="lead" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value)}
                  className="w-14 rounded-full border px-2 py-1 text-center" />
                <span>days before it starts</span>
              </label>
            </div>
            <div className="rounded-2xl bg-sky-bg px-4 py-3 text-xs text-ink/80">
              {preview.goesOut
                ? <>For the next event, <b>{fmt(event)}</b> — artwork due <b>{fmt(preview.assetDue)}</b>, goes out <b>{fmt(preview.goesOut)}</b>.</>
                : <>No posting day falls inside the promotion window — adjust the weekdays or “start promoting”.</>}
              {preview.goesOut && (
                <div className="relative mt-3 h-2">
                  <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-slate-300" />
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-amber-500" style={{ left: 0 }} title={`Artwork due ${fmt(preview.assetDue)}`} />
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500"
                    style={{ left: `${aDays ? Math.round(((aDays - (gDays ?? 0)) / aDays) * 100) : 0}%` }} title={`Goes out ${fmt(preview.goesOut)}`} />
                  <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-emerald-500" title={`Event ${fmt(event)}`} />
                </div>
              )}
            </div>
          </section>

          {type !== "one_shot" && (
            <section className="mb-5">
              <h3 className="mb-1 text-sm font-bold text-ink">Posting</h3>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="w-24 font-semibold">Posts on</span>
                {WEEKDAYS.map((d) => (
                  <label key={d.value}
                    className={`cursor-pointer rounded-xl border px-2.5 py-1 text-xs font-semibold transition ${
                      weekdays.includes(d.value) ? "border-sky-300 bg-sky-100 text-sky-700" : "text-muted hover:bg-sky-bg"
                    }`}>
                    <input type="checkbox" name="weekday" value={d.value} checked={weekdays.includes(d.value)}
                      onChange={() => setWeekdays((w) => toggleIn(w, d.value))} className="sr-only" />
                    {d.label}
                  </label>
                ))}
              </div>
              {type === "windowed" && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span className="w-24 font-semibold">Max per week</span>
                  <input name="cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="—"
                    className="w-14 rounded-full border px-2 py-1 text-center" />
                  <span>times (blank = no limit)</span>
                </label>
              )}
            </section>
          )}

          <details className="mb-4 rounded-2xl border bg-sky-bg/40 px-4 py-3 text-sm">
            <summary className="cursor-pointer select-none font-semibold text-ink">Advanced — who it’s for, capacity{type === "dated_instance" ? ", change cut-off" : ""}, production notes</summary>
            <div className="mt-3 grid gap-3 text-muted">
              <fieldset>
                <legend className="mb-1 font-semibold">Who it’s for</legend>
                <div className="flex gap-4">
                  {[1, 2, 3].map((t) => (
                    <label key={t} className="flex items-center gap-1">
                      <input type="checkbox" name="tier" value={t} checked={tiers.includes(t)}
                        onChange={() => setTiers((ts) => toggleIn(ts, t))} />
                      {tierLabel(t)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2">
                <span className="w-48 font-semibold">How many can share a slot</span>
                <input name="capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="—"
                  className="w-14 rounded-full border px-2 py-1 text-center" />
              </label>
              {type === "dated_instance" && (
                <label className="flex items-center gap-2">
                  <span className="w-48 font-semibold">Stop accepting changes</span>
                  <input name="lockLead" inputMode="numeric" value={lockLead} onChange={(e) => setLockLead(e.target.value)} placeholder="—"
                    className="w-14 rounded-full border px-2 py-1 text-center" />
                  <span>days before it goes out</span>
                </label>
              )}
              <label className="grid gap-1">
                <span className="font-semibold">Production notes</span>
                <textarea name="productionNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="e.g. Banner is 3'x8' vinyl; submit art 3 weeks ahead"
                  className="rounded-2xl border px-3 py-2" />
              </label>
            </div>
          </details>

          {state.error && (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{state.error}</div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!dirty || pending}
              className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              {pending ? "Saving…" : "Save changes"}
            </button>
            <SavedTick show={flash} />
            <span className="ml-auto"><ChannelDeleteButton id={channel.id} /></span>
          </div>
          {!dirty && !flash && <p className="mt-2 text-xs text-muted">Save lights up when you change something.</p>}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `channel-list.tsx`**

```tsx
// src/components/channel-list.tsx
"use client";
import { useState } from "react";
import { ChannelRow, type ChannelView } from "@/components/channel-row";

export function ChannelList({ channels, exampleEventKey }: { channels: ChannelView[]; exampleEventKey: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div>
      {channels.map((c) => (
        <ChannelRow
          key={c.id}
          channel={c}
          exampleEventKey={exampleEventKey}
          open={openId === c.id}
          onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY remaining in `src/app/settings/channels/page.tsx` (rewritten next). No errors inside the two new components.

- [ ] **Step 4: Commit**

```bash
git add src/components/channel-row.tsx src/components/channel-list.tsx
git commit -m "feat(channels): expand-in-place ChannelRow/ChannelList with live date preview + save feedback"
```

---

### Task 5: Rewrite the page to use `ChannelList`

**Files:**
- Modify: `src/app/settings/channels/page.tsx` (full rewrite of the channel-listing portion; keep the Add form).

**Interfaces:**
- Consumes: `ChannelList`, `ChannelView` from the Task 4 components; `createChannel`, `tierLabel`, `AdminOnlyCard`, `SettingsNav`; `atMidnight`, `addDays` from `@/lib/engine/dates`.

- [ ] **Step 1: Replace the file**

```tsx
// src/app/settings/channels/page.tsx
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { createChannel } from "@/actions/channels";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";
import { ChannelList, type /* re-exported */ } from "@/components/channel-list";
import type { ChannelView } from "@/components/channel-row";
import { tierLabel } from "@/lib/labels";
import { atMidnight, addDays } from "@/lib/engine/dates";

export const dynamic = "force-dynamic";

const WEEKDAYS = [
  { value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" },
  { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** The upcoming Sunday (today if today is Sunday) — a stable example event for the preview. */
function exampleEventKey(): string {
  const d = atMidnight(new Date());
  const ev = addDays(d, (7 - d.getDay()) % 7);
  return `${ev.getFullYear()}-${pad(ev.getMonth() + 1)}-${pad(ev.getDate())}`;
}

function toView(c: Awaited<ReturnType<typeof db.channel.findMany>>[number]): ChannelView {
  const weekdays = Array.isArray((c.cadence as { weekdays?: unknown })?.weekdays)
    ? ((c.cadence as { weekdays: number[] }).weekdays.filter((n) => Number.isInteger(n)))
    : [];
  const tiers = Array.isArray(c.tierEligibility) ? (c.tierEligibility as number[]).filter((n) => n === 1 || n === 2 || n === 3) : [1, 2, 3];
  return {
    id: c.id, name: c.name, type: c.type, color: c.color, active: c.active,
    offset: c.defaultPublishOffsetDays, lead: c.productionLeadDays, lockLeadDays: c.lockLeadDays,
    weekdays, capacity: c.capacity, frequencyCap: c.frequencyCap, tiers, notes: c.productionNotes ?? "",
  };
}

export default async function Channels() {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="outputs and channels" />;
  }

  const channels = await db.channel.findMany({ orderBy: { sortOrder: "asc" } });
  const views = channels.map(toView);

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="mb-2 text-2xl font-extrabold">Channels ⚙️</h1>
      <p className="mb-5 leading-relaxed text-muted">
        Each channel decides <b className="text-ink">when</b> an event starts showing up and{" "}
        <b className="text-ink">how early</b> the team needs the artwork ready. Tap a channel to
        change its rules — the dates update as you type, and <b className="text-ink">Save</b> turns
        on once you’ve changed something.
      </p>

      <ChannelList channels={views} exampleEventKey={exampleEventKey()} />

      {/* ---- Add a new channel (unchanged) -------------------------------- */}
      <details className="card-float mt-6 p-4">
        <summary className="cursor-pointer select-none font-semibold text-ink">＋ Add a channel</summary>
        <form action={createChannel} className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold">Name
              <input name="name" required placeholder="e.g. Instagram" className="ml-2 rounded-full border px-3 py-1 text-sm font-normal" />
            </label>
            <label className="text-sm font-semibold">Type
              <select name="type" defaultValue="windowed" className="ml-2 rounded-full border px-3 py-1 text-sm font-normal">
                <option value="windowed">Runs for a while (over a span of days)</option>
                <option value="dated_instance">Happens once on a date</option>
                <option value="one_shot">Sent once</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Color
              <input name="color" type="color" defaultValue="#93c5fd" className="ml-2 h-8 w-12 rounded border align-middle" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <label>Goes out:
              <input name="offset" type="number" defaultValue={14} className="mx-1 w-16 rounded-full border px-2 py-1" /> days before the event
            </label>
            <label>Asset due:
              <input name="lead" type="number" defaultValue={7} className="mx-1 w-16 rounded-full border px-2 py-1" /> days before it goes out
            </label>
            <label>Capacity (optional):
              <input name="capacity" type="number" placeholder="—" className="mx-1 w-16 rounded-full border px-2 py-1" />
            </label>
          </div>
          <fieldset className="text-sm">
            <legend className="mb-1 font-semibold">Who can use it (tiers)</legend>
            <div className="flex gap-4 text-muted">
              {[1, 2, 3].map((t) => (
                <label key={t}><input type="checkbox" name="tier" value={t} defaultChecked className="mr-1" />{tierLabel(t)}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm">
            <legend className="mb-1 font-semibold">Which days does it post? (for &ldquo;runs for a while&rdquo; channels)</legend>
            <div className="flex flex-wrap gap-3 text-muted">
              {WEEKDAYS.map((d) => (
                <label key={d.value}><input type="checkbox" name="weekday" value={d.value} defaultChecked={d.value === 0} className="mr-1" />{d.label}</label>
              ))}
            </div>
          </fieldset>
          <div>
            <button className="rounded-full bg-ink px-5 py-1.5 text-sm font-semibold text-white">Add output</button>
          </div>
        </form>
      </details>
    </div>
  );
}
```

> Note: the `import { ChannelList, type /* re-exported */ }` line is a placeholder reminder — the actual import is `import { ChannelList } from "@/components/channel-list";` plus `import type { ChannelView } from "@/components/channel-row";`. Use exactly those two lines.

- [ ] **Step 2: Typecheck the whole project is clean**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/channels/page.tsx
git commit -m "feat(channels): expand-in-place page with plain-language intro, real-date preview, full editability"
```

---

### Task 6: Full verification

- [ ] **Step 1: Lint + tests + build**

Run: `npm run check`
Expected: eslint clean; all vitest pass (including the two new files); `next build` succeeds.

- [ ] **Step 2: Live walkthrough (dev server on :3000)**

Log in as admin, open `/settings/channels`, expand Facebook, change posting weekdays + a timing number, confirm: the date preview updates live, Save enables only after a change, clicking Save shows "✓ Saved", and the value persists after reload. Confirm a one_shot channel hides the weekday/cap section and a dated_instance shows "Stop accepting changes".

- [ ] **Step 3: Final commit (if any walkthrough fixes were needed)**

```bash
git add -A && git commit -m "fix(channels): walkthrough polish"
```

---

## Self-Review

- **Spec coverage:** editability of all safe fields (Task 1+3+4), save feedback via `useSaveFlash`/`SavedTick` + dirty-gate + inline error (Task 4), plain-language labels + `type=text inputmode=numeric` + real-date preview & timeline (Task 4), grouped type-branched sections (Task 4), reuse of house components (all tasks), tests for `updateChannel` parsing and the preview helper (Task 1, 2). The Add form is preserved (Task 5).
- **Deviation from spec, intentional:** on a successful save the row does NOT auto-collapse; instead it shows "✓ Saved" and disables Save (resets the dirty baseline). This keeps the confirmation visible (an auto-collapse would hide the tick) — clearer feedback, same goal.
- **Placeholder scan:** the only `/* re-exported */` token is called out explicitly in a note with the exact replacement; no TBD/TODO.
- **Type consistency:** `ChannelActionState` (with optional `savedAt`) is defined in Task 3 and consumed in Task 4; `ChannelView` defined in Task 4 (`channel-row.tsx`) and consumed in Task 4 (`channel-list.tsx`) + Task 5; `previewSchedule`/`parseChannelUpdate` signatures match their tests.
