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
import { DELIVERABLE_STATUS_META } from "@/lib/status";
import { MinistryDots, type MinistryDot } from "@/components/ministry-dots";
import { tierLabel, tierTitle } from "@/lib/labels";

/** One per-channel piece of work — the unit the board now tracks. */
export type DeliverableCard = {
  id: string;
  status: string;
  /** Parent request (for the "open" link + the event title shown on the card). */
  requestId: string;
  title: string;
  tier: number;
  eventStartMs: number;
  /** Make-by date (productionDueAt); null when the channel has no lead time. */
  productionDueAtMs: number | null;
  channelName: string;
  channelColor: string;
  /** Every ministry the parent event involves (all equal). */
  ministries: MinistryDot[];
  ownerName: string | null;
  ownerInitials: string;
};

/** The columns shown on the board — the linear production flow. "skipped" is a
 * side state and is intentionally omitted (skipped work is filtered out at the
 * query level too). */
const BOARD_COLUMNS = [
  "to_design",
  "in_progress",
  "proof",
  "ready",
  "scheduled",
  "published",
] as const;

const UNASSIGNED = "__unassigned__";

export type PipelineFilters = {
  q: string;
  channel: string;
  owner: string;
};

const DEFAULT_FILTERS: PipelineFilters = {
  q: "",
  channel: "",
  owner: "",
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Card({
  card,
  onMove,
  canEdit,
}: {
  card: DeliverableCard;
  onMove: (id: string, status: string) => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !canEdit,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.4 : 1 }}
      className={`card-float p-3 mb-3 select-none ${canEdit ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
    >
      {/* Drag handle = the whole body except the "open" link below. */}
      <div {...(canEdit ? listeners : {})} {...(canEdit ? attributes : {})}>
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm leading-snug">{card.title}</span>
          <span className="mt-0.5 shrink-0">
            <MinistryDots ministries={card.ministries} />
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: card.channelColor }}
          />
          <span className="font-semibold" style={{ color: card.channelColor }}>
            {card.channelName}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 text-muted">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold" title={tierTitle(card.tier)}>
            {tierLabel(card.tier)}
          </span>
          {card.productionDueAtMs != null ? (
            <span title="Make by">make by {fmt(card.productionDueAtMs)}</span>
          ) : (
            <span className="text-muted">No deadline</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {card.ownerInitials && (
            <span
              title={card.ownerName ?? undefined}
              className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700"
            >
              {card.ownerInitials}
            </span>
          )}
          <Link
            href={`/requests/${card.requestId}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="font-semibold text-sky-600 hover:underline"
          >
            open ↗
          </Link>
        </span>
      </div>
      {canEdit && (
        <label className="mt-3 grid gap-1 text-xs font-semibold text-muted">
          Move to
          <select
            value={card.status}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onMove(card.id, e.target.value)}
            aria-label={`Move ${card.title} to another status`}
            className="w-full rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-ink"
          >
            {BOARD_COLUMNS.map((status) => (
              <option key={status} value={status}>
                {DELIVERABLE_STATUS_META[status]?.label ?? status}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function Column({
  status,
  cards,
  onMove,
  canEdit,
}: {
  status: string;
  cards: DeliverableCard[];
  onMove: (id: string, status: string) => void;
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };

  return (
    <div
      ref={setNodeRef}
      className="w-64 shrink-0 rounded-3xl p-3 transition"
      style={{ background: isOver ? `${meta.color}18` : "transparent" }}
    >
      <div className="flex items-center justify-between px-2 pb-3">
        <span className="flex items-center gap-2 font-bold text-sm">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: meta.color }}
          />
          {meta.label}
        </span>
        <span className="text-xs font-semibold text-muted">{cards.length}</span>
      </div>
      {cards.length === 0 && <div className="text-muted text-xs px-2 py-4">—</div>}
      {cards.map((c) => (
        <Card key={c.id} card={c} onMove={onMove} canEdit={canEdit} />
      ))}
    </div>
  );
}

function filtersFromSearchParams(params: URLSearchParams): PipelineFilters {
  return {
    q: params.get("q") ?? "",
    channel: params.get("channel") ?? "",
    owner: params.get("owner") ?? "",
  };
}

function sanitizeFilters(filters: PipelineFilters, cards: DeliverableCard[]): PipelineFilters {
  const channels = new Set(cards.map((c) => c.channelName));
  const owners = new Set(cards.map((c) => c.ownerName).filter((n): n is string => !!n));
  const owner =
    filters.owner === UNASSIGNED || owners.has(filters.owner) ? filters.owner : "";

  return {
    q: filters.q,
    channel: filters.channel === "" || channels.has(filters.channel) ? filters.channel : "",
    owner,
  };
}

function writeFiltersToUrl(filters: PipelineFilters) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.owner) params.set("owner", filters.owner);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function PipelineBoard({
  cards,
  totalActive,
  cap,
  initialFilters = DEFAULT_FILTERS,
  canEdit,
}: {
  cards: DeliverableCard[];
  totalActive: number;
  cap: number;
  initialFilters?: PipelineFilters;
  canEdit: boolean;
}) {
  const [items, setItems] = useState(cards);
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useState<PipelineFilters>(() => sanitizeFilters(initialFilters, cards));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Distinct channels / owners present in the loaded set, for the dropdowns.
  const channels = useMemo(
    () => Array.from(new Set(items.map((c) => c.channelName))).sort(),
    [items]
  );
  const owners = useMemo(
    () =>
      Array.from(new Set(items.map((c) => c.ownerName).filter((n): n is string => !!n))).sort(),
    [items]
  );

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return items.filter((c) => {
      if (filters.channel && c.channelName !== filters.channel) return false;
      if (filters.owner === UNASSIGNED) {
        if (c.ownerName) return false;
      } else if (filters.owner && c.ownerName !== filters.owner) {
        return false;
      }
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filters]);

  useEffect(() => {
    const onPopState = () => {
      setFilters(sanitizeFilters(filtersFromSearchParams(new URLSearchParams(window.location.search)), cards));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cards]);

  function updateFilter<K extends keyof PipelineFilters>(key: K, value: PipelineFilters[K]) {
    const next = sanitizeFilters({ ...filters, [key]: value }, cards);
    writeFiltersToUrl(next);
    setFilters(next);
  }

  function clearFilters() {
    writeFiltersToUrl(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  }

  function moveCard(id: string, targetStatus: string) {
    if (!canEdit) return;
    const card = items.find((c) => c.id === id);
    if (!card || card.status === targetStatus) return;

    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: targetStatus } : c))
    );
    startTransition(() => setDeliverableStatus(id, targetStatus));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetStatus = String(over.id);
    moveCard(String(active.id), targetStatus);
  }

  const filtered = visible.length !== items.length;
  const capped = totalActive > cap;

  return (
    <div className="max-w-full">
      <h1 className="text-2xl font-extrabold mb-1">Production 🗂️</h1>
      <p className="text-muted mb-1">
        A board of every piece to make — one card per channel. Drag it as it moves
        from To design → In progress → Proof → Ready → Scheduled → Published.
      </p>
      {!canEdit && (
        <p className="mb-3 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-muted">
          Read-only view. Ask an editor to move production work.
        </p>
      )}
      <p className="text-muted text-sm mb-4">
        Showing {visible.length}
        {filtered ? ` of ${items.length}` : ""} piece
        {visible.length === 1 ? "" : "s"} to make
        {capped ? ` · ${totalActive} in production (capped at ${cap} soonest)` : ""}
      </p>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.q}
          onChange={(e) => updateFilter("q", e.target.value)}
          placeholder="Search event…"
          aria-label="Search by event title"
          className="rounded-full border border-slate-200 px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
        />
        <select
          value={filters.channel}
          onChange={(e) => updateFilter("channel", e.target.value)}
          aria-label="Filter by channel"
          className="rounded-full border border-slate-200 px-4 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-200"
        >
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filters.owner}
          onChange={(e) => updateFilter("owner", e.target.value)}
          aria-label="Filter by owner"
          className="rounded-full border border-slate-200 px-4 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-200"
        >
          <option value="">All owners</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {(filters.channel || filters.owner || filters.q) && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-sky-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-2 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              cards={visible.filter((c) => c.status === status)}
              onMove={moveCard}
              canEdit={canEdit}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
