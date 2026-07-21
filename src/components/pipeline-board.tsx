"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { setDeliverableStatus } from "@/actions/request-status";
import { assignDeliverableOwner } from "@/actions/tasks";
import { DELIVERABLE_STATUS_META } from "@/lib/status";
import { MinistryDots, type MinistryDot } from "@/components/ministry-dots";
import type { ActiveUser } from "@/components/owner-assign";
import { tierLabel, tierTitle } from "@/lib/labels";
import { focusProductionItems } from "@/lib/production";
import { atMidnight } from "@/lib/engine/dates";

export type DeliverableCard = {
  id: string;
  status: string;
  requestId: string;
  title: string;
  tier: number;
  eventStartMs: number;
  productionDueAtMs: number | null;
  nextScheduledAtMs: number | null;
  channelName: string;
  channelColor: string;
  ministries: MinistryDot[];
  ownerId: string | null;
  ownerName: string | null;
  explicitOwner: boolean;
  eventOwnerId: string | null;
  eventOwnerName: string | null;
};

const BOARD_COLUMNS = [
  "to_design",
  "in_progress",
  "proof",
  "ready",
  "scheduled",
  "published",
] as const;

type PipelineView = "focus" | "board" | "backlog" | "later";
const PIPELINE_VIEWS = new Set<PipelineView>(["focus", "board", "backlog", "later"]);
const UNASSIGNED = "__unassigned__";
const EVENT_OWNER = "__event_owner__";

export type PipelineFilters = {
  q: string;
  channel: string;
  owner: string;
  status: string;
  view: string;
};

const DEFAULT_FILTERS: PipelineFilters = {
  q: "",
  channel: "",
  owner: "",
  status: "",
  view: "focus",
};

type EventGroup = {
  requestId: string;
  title: string;
  eventStartMs: number;
  tier: number;
  ministries: MinistryDot[];
  cards: DeliverableCard[];
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function calendarDayNumber(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function dueLabel(ms: number | null, todayMs: number): { text: string; className: string } {
  if (ms == null) return { text: "No make-by date", className: "bg-slate-100 text-slate-700" };
  const days = calendarDayNumber(ms) - calendarDayNumber(todayMs);
  if (days < 0) {
    const late = Math.abs(days);
    return {
      text: `${fmt(ms)} · ${late} ${late === 1 ? "day" : "days"} late`,
      className: "bg-rose-100 text-rose-800",
    };
  }
  if (days === 0) return { text: "Due today", className: "bg-amber-100 text-amber-800" };
  if (days === 1) return { text: "Due tomorrow", className: "bg-violet-100 text-violet-800" };
  return { text: `Due ${fmt(ms)}`, className: "bg-slate-100 text-slate-700" };
}

function groupByEvent(cards: DeliverableCard[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const card of cards) {
    const group = groups.get(card.requestId) ?? {
      requestId: card.requestId,
      title: card.title,
      eventStartMs: card.eventStartMs,
      tier: card.tier,
      ministries: card.ministries,
      cards: [],
    };
    group.cards.push(card);
    groups.set(card.requestId, group);
  }
  return [...groups.values()].sort((a, b) => {
    const firstDueA = a.cards[0]?.productionDueAtMs ?? Number.MAX_SAFE_INTEGER;
    const firstDueB = b.cards[0]?.productionDueAtMs ?? Number.MAX_SAFE_INTEGER;
    return firstDueA - firstDueB || a.eventStartMs - b.eventStartMs || a.title.localeCompare(b.title);
  });
}

function ProductionOwnerSelect({
  card,
  users,
  disabled,
  onAssign,
}: {
  card: DeliverableCard;
  users: ActiveUser[];
  disabled: boolean;
  onAssign: (card: DeliverableCard, ownerId: string | null) => void;
}) {
  const value = card.explicitOwner ? card.ownerId ?? EVENT_OWNER : EVENT_OWNER;
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onAssign(card, event.target.value === EVENT_OWNER ? null : event.target.value)}
      aria-label={`Assign ${card.title}, ${card.channelName}`}
      title={card.explicitOwner ? "This channel has its own owner" : "Using the event owner"}
      className="min-h-11 max-w-48 rounded-full border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
    >
      <option value={EVENT_OWNER}>
        {card.eventOwnerName ? `Event owner: ${card.eventOwnerName}` : "Unassigned"}
      </option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>{user.name}</option>
      ))}
    </select>
  );
}

function ProductionRow({
  card,
  todayMs,
  canEdit,
  users,
  saving,
  onMove,
  onAssign,
}: {
  card: DeliverableCard;
  todayMs: number;
  canEdit: boolean;
  users: ActiveUser[];
  saving: boolean;
  onMove: (id: string, status: string) => void;
  onAssign: (card: DeliverableCard, ownerId: string | null) => void;
}) {
  const due = dueLabel(card.productionDueAtMs, todayMs);
  return (
    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: card.channelColor }} />
          <span className="font-semibold text-ink">{card.channelName.replace(/\s*\(Top 3\)$/i, "")}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${due.className}`}>{due.text}</span>
          {card.nextScheduledAtMs != null && (
            <span className="text-xs font-medium text-muted">Goes out {fmt(card.nextScheduledAtMs)}</span>
          )}
        </div>
        {!canEdit && (
          <p className="mt-1 text-xs text-muted">{card.ownerName ? `Owned by ${card.ownerName}` : "Unassigned"}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <ProductionOwnerSelect card={card} users={users} disabled={saving} onAssign={onAssign} />
          <select
            value={card.status}
            disabled={saving}
            onChange={(event) => onMove(card.id, event.target.value)}
            aria-label={`Change status for ${card.title}, ${card.channelName}`}
            className="min-h-11 rounded-full border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {BOARD_COLUMNS.map((status) => (
              <option key={status} value={status}>{DELIVERABLE_STATUS_META[status]?.label ?? status}</option>
            ))}
            <option value="skipped">Skipped</option>
          </select>
        </div>
      )}
    </div>
  );
}

function EventTaskGroup({
  group,
  todayMs,
  canEdit,
  users,
  savingIds,
  onMove,
  onAssign,
}: {
  group: EventGroup;
  todayMs: number;
  canEdit: boolean;
  users: ActiveUser[];
  savingIds: Set<string>;
  onMove: (id: string, status: string) => void;
  onAssign: (card: DeliverableCard, ownerId: string | null) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <Link href={`/requests/${group.requestId}`} className="font-bold text-ink hover:text-sky-700 hover:underline">
          {group.title}
        </Link>
        <span className="text-xs text-muted">Event {fmt(group.eventStartMs)}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-muted" title={tierTitle(group.tier)}>
          {tierLabel(group.tier)}
        </span>
        <span className="ml-auto"><MinistryDots ministries={group.ministries} /></span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-muted">
          {group.cards.length} {group.cards.length === 1 ? "piece" : "pieces"}
        </span>
      </header>
      <div className="divide-y divide-slate-100">
        {group.cards.map((card) => (
          <ProductionRow
            key={card.id}
            card={card}
            todayMs={todayMs}
            canEdit={canEdit}
            users={users}
            saving={savingIds.has(card.id)}
            onMove={onMove}
            onAssign={onAssign}
          />
        ))}
      </div>
    </article>
  );
}

const SECTION_STYLE = {
  proof: { border: "border-l-amber-400", badge: "bg-amber-100 text-amber-800", eyebrow: "text-amber-800" },
  ready: { border: "border-l-emerald-500", badge: "bg-emerald-100 text-emerald-800", eyebrow: "text-emerald-800" },
  progress: { border: "border-l-orange-400", badge: "bg-orange-100 text-orange-800", eyebrow: "text-orange-800" },
  overdue: { border: "border-l-rose-500", badge: "bg-rose-100 text-rose-800", eyebrow: "text-rose-800" },
  week: { border: "border-l-violet-500", badge: "bg-violet-100 text-violet-800", eyebrow: "text-violet-800" },
  upcoming: { border: "border-l-sky-500", badge: "bg-sky-100 text-sky-800", eyebrow: "text-sky-800" },
  quiet: { border: "border-l-slate-400", badge: "bg-slate-100 text-slate-700", eyebrow: "text-slate-700" },
} as const;

function ProductionSection({
  title,
  description,
  cards,
  tone,
  initialEvents = 5,
  todayMs,
  canEdit,
  users,
  savingIds,
  onMove,
  onAssign,
}: {
  title: string;
  description: string;
  cards: DeliverableCard[];
  tone: keyof typeof SECTION_STYLE;
  initialEvents?: number;
  todayMs: number;
  canEdit: boolean;
  users: ActiveUser[];
  savingIds: Set<string>;
  onMove: (id: string, status: string) => void;
  onAssign: (card: DeliverableCard, ownerId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (cards.length === 0) return null;
  const groups = groupByEvent(cards);
  const shown = expanded ? groups : groups.slice(0, initialEvents);
  const hiddenGroups = groups.length - shown.length;
  const hiddenPieces = groups.slice(shown.length).reduce((total, group) => total + group.cards.length, 0);
  const style = SECTION_STYLE[tone];

  return (
    <section className={`card-float border-l-[5px] p-5 ${style.border}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${style.eyebrow}`}>Team work</p>
          <h2 className="mt-0.5 text-xl font-extrabold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${style.badge}`}>
          {cards.length} {cards.length === 1 ? "piece" : "pieces"} · {groups.length} {groups.length === 1 ? "event" : "events"}
        </span>
      </div>
      <div className="grid gap-3">
        {shown.map((group) => (
          <EventTaskGroup
            key={group.requestId}
            group={group}
            todayMs={todayMs}
            canEdit={canEdit}
            users={users}
            savingIds={savingIds}
            onMove={onMove}
            onAssign={onAssign}
          />
        ))}
      </div>
      {hiddenGroups > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg"
        >
          Show {hiddenPieces} more {hiddenPieces === 1 ? "piece" : "pieces"} across {hiddenGroups} {hiddenGroups === 1 ? "event" : "events"}
        </button>
      )}
      {expanded && groups.length > initialEvents && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-4 inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg"
        >
          Show fewer
        </button>
      )}
    </section>
  );
}

function BoardCard({
  card,
  canEdit,
  users,
  saving,
  onMove,
  onAssign,
}: {
  card: DeliverableCard;
  canEdit: boolean;
  users: ActiveUser[];
  saving: boolean;
  onMove: (id: string, status: string) => void;
  onAssign: (card: DeliverableCard, ownerId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !canEdit });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.4 : 1 }}
      className={`card-float mb-3 p-3 select-none ${canEdit ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div {...(canEdit ? listeners : {})} {...(canEdit ? attributes : {})}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-snug">{card.title}</span>
          <MinistryDots ministries={card.ministries} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: card.channelColor }} />
          <span className="font-semibold" style={{ color: card.channelColor }}>{card.channelName}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{card.productionDueAtMs == null ? "No deadline" : `Make by ${fmt(card.productionDueAtMs)}`}</span>
        <Link href={`/requests/${card.requestId}`} onPointerDown={(event) => event.stopPropagation()} className="font-semibold text-sky-700 hover:underline">
          Open →
        </Link>
      </div>
      {canEdit && (
        <div className="mt-3 grid gap-2" onPointerDown={(event) => event.stopPropagation()}>
          <ProductionOwnerSelect card={card} users={users} disabled={saving} onAssign={onAssign} />
          <select
            value={card.status}
            disabled={saving}
            onChange={(event) => onMove(card.id, event.target.value)}
            aria-label={`Move ${card.title}, ${card.channelName} to another status`}
            className="min-h-11 w-full rounded-full border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
          >
            {BOARD_COLUMNS.map((status) => (
              <option key={status} value={status}>{DELIVERABLE_STATUS_META[status]?.label ?? status}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  status,
  cards,
  canEdit,
  users,
  savingIds,
  onMove,
  onAssign,
}: {
  status: string;
  cards: DeliverableCard[];
  canEdit: boolean;
  users: ActiveUser[];
  savingIds: Set<string>;
  onMove: (id: string, status: string) => void;
  onAssign: (card: DeliverableCard, ownerId: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <section
      ref={setNodeRef}
      className="w-72 shrink-0 rounded-3xl p-3 transition"
      style={{ background: isOver ? `${meta.color}18` : "rgba(255,255,255,0.28)" }}
      aria-label={`${meta.label} production column`}
    >
      <header className="flex items-center justify-between px-2 pb-3">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted">{cards.length}</span>
      </header>
      {cards.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-muted">No pieces here</div>}
      {cards.map((card) => (
        <BoardCard
          key={card.id}
          card={card}
          canEdit={canEdit}
          users={users}
          saving={savingIds.has(card.id)}
          onMove={onMove}
          onAssign={onAssign}
        />
      ))}
    </section>
  );
}

function filtersFromSearchParams(params: URLSearchParams): PipelineFilters {
  return {
    q: params.get("q") ?? "",
    channel: params.get("channel") ?? "",
    owner: params.get("owner") ?? "",
    status: params.get("status") ?? "",
    view: params.get("view") ?? "focus",
  };
}

function sanitizeFilters(filters: PipelineFilters, cards: DeliverableCard[]): PipelineFilters {
  const channels = new Set(cards.map((card) => card.channelName));
  const owners = new Set(cards.map((card) => card.ownerName).filter((name): name is string => !!name));
  const statuses = new Set(cards.map((card) => card.status));
  const owner = filters.owner === UNASSIGNED || owners.has(filters.owner) ? filters.owner : "";
  const view = PIPELINE_VIEWS.has(filters.view as PipelineView) ? filters.view : "focus";
  return {
    q: filters.q,
    channel: filters.channel === "" || channels.has(filters.channel) ? filters.channel : "",
    owner,
    status: filters.status === "" || statuses.has(filters.status) ? filters.status : "",
    view,
  };
}

function writeFiltersToUrl(filters: PipelineFilters) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.status) params.set("status", filters.status);
  if (filters.view && filters.view !== "focus") params.set("view", filters.view);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function SummaryCard({ label, value, detail, tone }: {
  label: string;
  value: number;
  detail: string;
  tone: "rose" | "violet" | "amber" | "sky";
}) {
  const toneClass = {
    rose: "bg-rose-50 text-rose-800",
    violet: "bg-violet-50 text-violet-800",
    amber: "bg-amber-50 text-amber-800",
    sky: "bg-sky-50 text-sky-800",
  }[tone];
  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-medium opacity-80">{detail}</p>
    </div>
  );
}

export function PipelineBoard({
  cards,
  totalCurrent,
  expiredHidden,
  cap,
  initialFilters = DEFAULT_FILTERS,
  canEdit,
  users,
}: {
  cards: DeliverableCard[];
  totalCurrent: number;
  expiredHidden: number;
  cap: number;
  initialFilters?: PipelineFilters;
  canEdit: boolean;
  users: ActiveUser[];
}) {
  const [items, setItems] = useState(cards);
  const [filters, setFilters] = useState<PipelineFilters>(() => sanitizeFilters(initialFilters, cards));
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const todayMs = useMemo(() => atMidnight(new Date()).getTime(), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const channels = useMemo(() => Array.from(new Set(items.map((card) => card.channelName))).sort(), [items]);
  const owners = useMemo(
    () => Array.from(new Set(items.map((card) => card.ownerName).filter((name): name is string => !!name))).sort(),
    [items],
  );
  const statuses = useMemo(() => Array.from(new Set(items.map((card) => card.status))).sort(), [items]);

  const visible = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return items.filter((card) => {
      if (filters.channel && card.channelName !== filters.channel) return false;
      if (filters.owner === UNASSIGNED ? card.ownerId != null : filters.owner && card.ownerName !== filters.owner) return false;
      if (filters.status && card.status !== filters.status) return false;
      if (query && !card.title.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, filters]);

  const focus = useMemo(() => focusProductionItems(visible, new Date(todayMs)), [visible, todayMs]);
  const allFocus = useMemo(() => focusProductionItems(items, new Date(todayMs)), [items, todayMs]);
  const filtered = visible.length !== items.length;
  const capped = totalCurrent > cap;
  const view = filters.view as PipelineView;

  useEffect(() => {
    const onPopState = () => setFilters(sanitizeFilters(filtersFromSearchParams(new URLSearchParams(window.location.search)), cards));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cards]);

  function updateFilter<K extends keyof PipelineFilters>(key: K, value: PipelineFilters[K]) {
    const next = sanitizeFilters({ ...filters, [key]: value }, items);
    writeFiltersToUrl(next);
    setFilters(next);
  }

  function clearFilters() {
    const next = { ...DEFAULT_FILTERS, view: filters.view };
    writeFiltersToUrl(next);
    setFilters(next);
  }

  function setSaving(id: string, saving: boolean) {
    setSavingIds((previous) => {
      const next = new Set(previous);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function moveCard(id: string, targetStatus: string) {
    if (!canEdit) return;
    const original = items.find((card) => card.id === id);
    if (!original || original.status === targetStatus) return;
    setSaveError(null);
    setSaving(id, true);
    setItems((previous) => previous.map((card) => card.id === id ? { ...card, status: targetStatus } : card));
    startTransition(async () => {
      try {
        await setDeliverableStatus(id, targetStatus);
        if (targetStatus === "published" || targetStatus === "skipped") {
          setItems((previous) => previous.filter((card) => card.id !== id));
        }
      } catch {
        setItems((previous) => previous.map((card) => card.id === id ? original : card));
        setSaveError(`Could not move ${original.title}. Try again.`);
      } finally {
        setSaving(id, false);
      }
    });
  }

  function assignOwner(card: DeliverableCard, explicitOwnerId: string | null) {
    if (!canEdit) return;
    const original = card;
    const explicitOwner = users.find((user) => user.id === explicitOwnerId) ?? null;
    const ownerId = explicitOwner?.id ?? card.eventOwnerId;
    const ownerName = explicitOwner?.name ?? card.eventOwnerName;
    setSaveError(null);
    setSaving(card.id, true);
    setItems((previous) => previous.map((item) => item.id === card.id ? {
      ...item,
      ownerId,
      ownerName,
      explicitOwner: explicitOwnerId != null,
    } : item));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", explicitOwnerId ?? "");
      try {
        await assignDeliverableOwner(card.id, formData);
      } catch {
        setItems((previous) => previous.map((item) => item.id === card.id ? original : item));
        setSaveError(`Could not assign ${card.title}. Try again.`);
      } finally {
        setSaving(card.id, false);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    moveCard(String(event.active.id), String(event.over.id));
  }

  const sectionProps = { todayMs, canEdit, users, savingIds, onMove: moveCard, onAssign: assignOwner };

  return (
    <div className="mx-auto max-w-7xl">
      <header className="card-float mb-5 overflow-hidden p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Team production control room</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">Production</h1>
            <p className="mt-1 max-w-3xl text-muted">
              {allFocus.actionTotal} {allFocus.actionTotal === 1 ? "piece needs" : "pieces need"} team attention now. Work is grouped by event so the team can assign it, make it, and move it forward without losing context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/this-week" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">This Week →</Link>
            <Link href="/my-tasks" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">My Tasks →</Link>
            {canEdit && <Link href="/assign" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Assign channels →</Link>}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Needs attention" value={focus.actionTotal} detail={filtered ? "Matching filters" : "Now through Sunday"} tone="rose" />
          <SummaryCard label="Unassigned" value={focus.unassignedActionTotal} detail="Inside this focus" tone="amber" />
          <SummaryCard label="Proof review" value={focus.proof.length} detail="Waiting for a decision" tone="violet" />
          <SummaryCard label="Current queue" value={visible.length} detail={filtered ? `of ${items.length} matching` : "Non-expired pieces"} tone="sky" />
        </div>
        <p className="mt-3 text-xs font-medium text-muted">
          {expiredHidden} expired {expiredHidden === 1 ? "placement is" : "placements are"} hidden automatically.
          {capped ? ` Showing the ${cap} soonest of ${totalCurrent} current pieces.` : ` ${totalCurrent} current pieces remain available.`}
        </p>
      </header>

      {!canEdit && (
        <p className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-muted">Read-only view. Ask an editor to assign or move production work.</p>
      )}
      {saveError && <p role="alert" className="mb-4 rounded-2xl bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">{saveError}</p>}

      <section className="card-float mb-5 p-4" aria-label="Production views and filters">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
          {([
            ["focus", "Focus now", allFocus.actionTotal],
            ["board", "Workflow board", items.length],
            ["backlog", "Older backlog", allFocus.oldBacklog.length],
            ["later", "Later work", allFocus.later.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => updateFilter("view", key)}
              aria-pressed={view === key}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${view === key ? "bg-ink text-white" : "border text-ink hover:bg-sky-bg"}`}
            >
              {label}<span className={`rounded-full px-2 py-0.5 text-xs ${view === key ? "bg-white/20" : "bg-slate-100 text-muted"}`}>{count}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(10rem,auto))_auto]">
          <label className="sr-only" htmlFor="production-search">Search events</label>
          <input
            id="production-search"
            type="search"
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Search event…"
            className="min-h-11 rounded-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          <select value={filters.channel} onChange={(event) => updateFilter("channel", event.target.value)} aria-label="Filter by channel" className="min-h-11 rounded-full border px-4 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
          </select>
          <select value={filters.owner} onChange={(event) => updateFilter("owner", event.target.value)} aria-label="Filter by owner" className="min-h-11 rounded-full border px-4 py-2 text-sm">
            <option value="">All owners</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} aria-label="Filter by status" className="min-h-11 rounded-full border px-4 py-2 text-sm">
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{DELIVERABLE_STATUS_META[status]?.label ?? status}</option>)}
          </select>
          {(filters.q || filters.channel || filters.owner || filters.status) && (
            <button type="button" onClick={clearFilters} className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">Clear filters</button>
          )}
        </div>
        <p className="mt-3 text-xs font-medium text-muted">Showing {visible.length}{filtered ? ` of ${items.length}` : ""} current pieces.</p>
      </section>

      {view === "focus" && (
        <div className="grid gap-4">
          <ProductionSection title="Proofs needing a decision" description="Approve these or move them back with a clear status change." cards={focus.proof} tone="proof" {...sectionProps} />
          <ProductionSection title="Ready to schedule" description="The creative work is approved; finish the publishing handoff." cards={focus.ready} tone="ready" {...sectionProps} />
          <ProductionSection title="Already in progress" description="Keep active work moving before taking on more." cards={focus.inProgress} tone="progress" {...sectionProps} />
          <ProductionSection title="Recently overdue" description="Still useful, but its make-by date passed within the last two weeks." cards={focus.recentOverdue} tone="overdue" initialEvents={5} {...sectionProps} />
          <ProductionSection title="Due this week" description="Everything the team still needs to make by Sunday." cards={focus.thisWeek} tone="week" initialEvents={5} {...sectionProps} />
          <ProductionSection title="Coming next" description="A short look ahead through the next 30 days." cards={focus.nearTerm} tone="upcoming" initialEvents={4} {...sectionProps} />
          <ProductionSection title="Already scheduled" description="Prepared work with a future placement, kept visible for confidence." cards={focus.scheduled} tone="quiet" initialEvents={3} {...sectionProps} />
          {focus.actionTotal === 0 && focus.nearTerm.length === 0 && focus.scheduled.length === 0 && (
            <div className="card-float p-8 text-center"><h2 className="text-lg font-extrabold">No matching work needs attention</h2><p className="mt-1 text-muted">Try clearing a filter or review later work.</p></div>
          )}
          {(allFocus.oldBacklog.length > 0 || allFocus.later.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-2">
              {allFocus.oldBacklog.length > 0 && <button type="button" onClick={() => updateFilter("view", "backlog")} className="card-float p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Separated from today</p><p className="mt-1 text-xl font-extrabold text-ink">{allFocus.oldBacklog.length} older assignments</p><p className="mt-1 text-sm text-muted">More than two weeks late. Review backlog →</p></button>}
              {allFocus.later.length > 0 && <button type="button" onClick={() => updateFilter("view", "later")} className="card-float p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kept out of the daily queue</p><p className="mt-1 text-xl font-extrabold text-ink">{allFocus.later.length} later assignments</p><p className="mt-1 text-sm text-muted">Due more than 30 days from now. Plan later work →</p></button>}
            </section>
          )}
        </div>
      )}

      {view === "backlog" && (
        <ProductionSection title="Older production backlog" description="Finish, reassign, reschedule, or skip work whose useful placement has not yet passed." cards={focus.oldBacklog} tone="quiet" initialEvents={8} {...sectionProps} />
      )}

      {view === "later" && (
        <ProductionSection title="Later production work" description="Current placements due more than 30 days from now or without a make-by date." cards={focus.later} tone="upcoming" initialEvents={8} {...sectionProps} />
      )}

      {view === "board" && (
        <DndContext id="pipeline-board" sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-5" aria-label="Production workflow board">
            {BOARD_COLUMNS.map((status) => (
              <BoardColumn key={status} status={status} cards={visible.filter((card) => card.status === status)} canEdit={canEdit} users={users} savingIds={savingIds} onMove={moveCard} onAssign={assignOwner} />
            ))}
          </div>
        </DndContext>
      )}

      <p className="mt-5 text-center text-xs text-muted">Signed in as the current team member · personal assignments are in <Link href="/my-tasks" className="font-semibold text-sky-700 hover:underline">My Tasks</Link>.</p>
    </div>
  );
}
