"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeDuplicateEvents } from "@/actions/events";
import { turnEventsIntoRecurringSeries } from "@/actions/recurring";
import { MinistryDots, type MinistryDot } from "@/components/ministry-dots";
import { tierLabel, tierTitle } from "@/lib/labels";
import { REQUEST_SIDE_STATUSES, REQUEST_STATUSES, REQUEST_STATUS_META } from "@/lib/status";
import {
  buildEventsFocus,
  groupRepeatedEventTitles,
  type EventDuplicateGroup,
  type EventRepeatGroup,
} from "@/lib/events-overview";

export type EventSource = "pco" | "calendar" | "local";
export type EventView = "focus" | "upcoming" | "repeating" | "archive";

export type RequestRow = {
  id: string;
  title: string;
  status: string;
  tier: number;
  ministries: MinistryDot[];
  eventStartMs: number;
  nextProductionDueMs: number | null;
  nextScheduledAtMs: number | null;
  plannedChannelCount: number;
  location: string | null;
  noPromo: boolean;
  needsRegistration: boolean;
  ownerName: string | null;
  source: EventSource;
  seriesId: string | null;
};

export type RequestFilters = {
  q: string;
  status: string;
  tier: string;
  ministry: string;
  source: string;
  view: string;
};

const DEFAULT_FILTERS: RequestFilters = {
  q: "",
  status: "active",
  tier: "all",
  ministry: "all",
  source: "all",
  view: "focus",
};

const EVENT_VIEWS = new Set<EventView>(["focus", "upcoming", "repeating", "archive"]);
const ACTIVE_STATUSES = new Set([
  "submitted",
  "triaged",
  "approved",
  "in_production",
  "proof",
  "scheduled",
  "published",
  "needs_info",
]);

const STATUS_CLASSES: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700",
  triaged: "bg-sky-100 text-sky-800",
  approved: "bg-violet-100 text-violet-800",
  in_production: "bg-orange-100 text-orange-800",
  proof: "bg-amber-100 text-amber-800",
  scheduled: "bg-emerald-100 text-emerald-800",
  published: "bg-emerald-100 text-emerald-800",
  needs_info: "bg-amber-100 text-amber-800",
  cancelled: "bg-slate-100 text-slate-600",
  declined: "bg-rose-100 text-rose-800",
  archived: "bg-slate-100 text-slate-600",
};

const SOURCE_META: Record<EventSource, { label: string; className: string }> = {
  pco: { label: "Planning Center", className: "bg-indigo-50 text-indigo-800" },
  calendar: { label: "Calendar import", className: "bg-cyan-50 text-cyan-800" },
  local: { label: "Added here", className: "bg-slate-100 text-slate-700" },
};

const SECTION_STYLE = {
  attention: { border: "border-l-amber-400", badge: "bg-amber-100 text-amber-800", eyebrow: "text-amber-800" },
  duplicate: { border: "border-l-rose-400", badge: "bg-rose-100 text-rose-800", eyebrow: "text-rose-800" },
  active: { border: "border-l-violet-500", badge: "bg-violet-100 text-violet-800", eyebrow: "text-violet-800" },
  repeating: { border: "border-l-sky-500", badge: "bg-sky-100 text-sky-800", eyebrow: "text-sky-800" },
} as const;

const fullDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function formatDate(ms: number): string {
  return fullDate.format(new Date(ms));
}

function calendarDayNumber(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status] ?? "bg-slate-100 text-slate-700"}`}>
      {REQUEST_STATUS_META[status]?.label ?? status}
    </span>
  );
}

function TierBadge({ tier }: { tier: number }) {
  return (
    <span title={tierTitle(tier)} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
      {tierLabel(tier)}
    </span>
  );
}

function SourceBadge({ source }: { source: EventSource }) {
  const meta = SOURCE_META[source];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
}

function deadlineLabel(ms: number | null, todayMs: number) {
  if (ms === null) return { text: "No production deadline", className: "text-muted" };
  const days = calendarDayNumber(ms) - calendarDayNumber(todayMs);
  if (days < 0) return { text: `Make-by ${shortDate.format(ms)} · overdue`, className: "font-semibold text-rose-700" };
  if (days === 0) return { text: "Make-by today", className: "font-semibold text-amber-800" };
  if (days === 1) return { text: "Make-by tomorrow", className: "font-semibold text-violet-800" };
  return { text: `Next make-by ${shortDate.format(ms)}`, className: "text-muted" };
}

function EventRow({ row, todayMs, duplicate = false }: { row: RequestRow; todayMs: number; duplicate?: boolean }) {
  const deadline = deadlineLabel(row.nextProductionDueMs, todayMs);
  return (
    <Link
      href={`/requests/${row.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-sky-200 hover:bg-sky-50/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink group-hover:text-sky-800 group-hover:underline">{row.title}</h3>
            <StatusChip status={row.status} />
            {duplicate && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">Possible duplicate</span>}
            {row.noPromo && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Promotion off</span>}
            {row.needsRegistration && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Registration</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            <time dateTime={new Date(row.eventStartMs).toISOString()} className="font-semibold text-ink">{formatDate(row.eventStartMs)}</time>
            <MinistryDots ministries={row.ministries} showNames />
            {row.location && <span>{row.location}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <TierBadge tier={row.tier} />
            <SourceBadge source={row.source} />
            <span className={deadline.className}>{deadline.text}</span>
            {row.nextScheduledAtMs !== null && <span className="text-muted">Next ad {shortDate.format(row.nextScheduledAtMs)}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          <p>{row.plannedChannelCount} {row.plannedChannelCount === 1 ? "channel" : "channels"} planned</p>
          <p className={row.ownerName ? "mt-1" : "mt-1 font-semibold text-amber-800"}>
            {row.ownerName ? `Owner: ${row.ownerName}` : "Owner unassigned"}
          </p>
          <p className="mt-2 font-semibold text-sky-700">Open event →</p>
        </div>
      </div>
    </Link>
  );
}

function EventSection({
  title,
  eyebrow,
  description,
  rows,
  tone,
  todayMs,
  initialRows = 6,
}: {
  title: string;
  eyebrow: string;
  description: string;
  rows: RequestRow[];
  tone: keyof typeof SECTION_STYLE;
  todayMs: number;
  initialRows?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;
  const shown = expanded ? rows : rows.slice(0, initialRows);
  const hidden = rows.length - shown.length;
  const style = SECTION_STYLE[tone];
  return (
    <section className={`card-float border-l-[5px] p-5 ${style.border}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${style.eyebrow}`}>{eyebrow}</p>
          <h2 className="mt-0.5 text-xl font-extrabold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${style.badge}`}>{rows.length} events</span>
      </div>
      <div className="grid gap-3">{shown.map((row) => <EventRow key={row.id} row={row} todayMs={todayMs} />)}</div>
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="mt-4 min-h-11 rounded-full border px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">
          Show {hidden} more events
        </button>
      )}
      {expanded && rows.length > initialRows && (
        <button type="button" onClick={() => setExpanded(false)} className="mt-4 min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">
          Show fewer
        </button>
      )}
    </section>
  );
}

function MergeCopiesButton({ group }: { group: EventDuplicateGroup<RequestRow> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function merge() {
    if (!window.confirm(
      `Merge ${group.rows.length} copies of “${group.title}”?\n\nThe best source-linked copy will be kept. Channels, tasks, ownership, and notes will be combined; extra source records will be archived so sync cannot recreate them.`,
    )) return;
    setMessage(null);
    startTransition(async () => {
      const result = await mergeDuplicateEvents(group.rows.map((row) => row.id));
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={merge}
        disabled={pending}
        className="min-h-11 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Merging…" : "Merge copies"}
      </button>
      {message && <p role="alert" className="mt-2 max-w-xs text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
}

function DuplicateSection({
  groups,
  todayMs,
  canEdit,
}: {
  groups: EventDuplicateGroup<RequestRow>[];
  todayMs: number;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (groups.length === 0) return null;
  const style = SECTION_STYLE.duplicate;
  const shown = expanded ? groups : groups.slice(0, 2);
  const hidden = groups.length - shown.length;
  return (
    <section className={`card-float border-l-[5px] p-5 ${style.border}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${style.eyebrow}`}>Cleanup</p>
          <h2 className="mt-0.5 text-xl font-extrabold text-ink">Possible duplicates</h2>
          <p className="mt-1 text-sm text-muted">The same title and event date came in more than once. Compare these before approving either copy.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${style.badge}`}>{groups.length} dates</span>
      </div>
      <div className="grid gap-4">
        {shown.map((group) => (
          <article key={group.key} className="rounded-2xl border border-rose-200 bg-rose-50/35 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h3 className="font-bold text-ink">{group.title}</h3>
                <p className="text-sm text-muted">{formatDate(group.eventStartMs)} · {group.rows.length} copies</p>
              </div>
              {canEdit ? (
                <MergeCopiesButton group={group} />
              ) : (
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">Review copies</span>
              )}
            </div>
            <div className="grid gap-2">{group.rows.map((row) => <EventRow key={row.id} row={row} todayMs={todayMs} duplicate />)}</div>
          </article>
        ))}
      </div>
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="mt-4 min-h-11 rounded-full border px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50">
          Show {hidden} more duplicate dates
        </button>
      )}
      {expanded && groups.length > 2 && (
        <button type="button" onClick={() => setExpanded(false)} className="mt-4 min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50">
          Show fewer
        </button>
      )}
    </section>
  );
}

function TurnIntoSeriesButton({ group }: { group: EventRepeatGroup<RequestRow> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const hasOverlap = group.duplicateDateCount > 0;

  function convert() {
    setMessage(null);
    startTransition(async () => {
      const result = await turnEventsIntoRecurringSeries(group.rows.map((row) => row.id));
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.push(`/recurring?created=${encodeURIComponent(result.seriesId)}`);
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={convert}
        disabled={pending || hasOverlap}
        title={hasOverlap ? "Merge the duplicate dates above before creating a series." : undefined}
        className="min-h-11 rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        {pending ? "Creating series…" : "Turn into recurring series"}
      </button>
      {hasOverlap && <p className="mt-1 text-xs font-semibold text-rose-700">Merge overlapping dates first</p>}
      {message && <p role="alert" className="mt-2 max-w-xs text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
}

function RepeatGroupCard({ group, canEdit }: { group: EventRepeatGroup<RequestRow>; canEdit: boolean }) {
  const sources = [...new Set(group.rows.map((row) => SOURCE_META[row.source].label))];
  const query = new URLSearchParams({ view: "repeating", q: group.title, status: "active" }).toString();
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">{group.title}</h3>
          <p className="mt-1 text-sm text-muted">
            {group.rows.length} occurrences · {shortDate.format(group.firstEventMs)} – {shortDate.format(group.lastEventMs)}
          </p>
          <p className="mt-1 text-xs text-muted">Sources: {sources.join(" + ")}</p>
        </div>
        <div className="text-right">
          {group.duplicateDateCount > 0 && (
            <p className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
              {group.duplicateDateCount} {group.duplicateDateCount === 1 ? "date has" : "dates have"} overlap
            </p>
          )}
          <Link href={`/requests?${query}`} className="mt-2 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-sky-700 hover:bg-sky-bg">
            Review occurrences →
          </Link>
          {canEdit && <TurnIntoSeriesButton group={group} />}
        </div>
      </div>
    </article>
  );
}

function RepeatSection({ groups, canEdit }: { groups: EventRepeatGroup<RequestRow>[]; canEdit: boolean }) {
  if (groups.length === 0) return null;
  const style = SECTION_STYLE.repeating;
  return (
    <section className={`card-float border-l-[5px] p-5 ${style.border}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${style.eyebrow}`}>Grouped for clarity</p>
          <h2 className="mt-0.5 text-xl font-extrabold text-ink">Recurring imports</h2>
          <p className="mt-1 text-sm text-muted">Repeated titles are summarized once here so routine calendar events do not take over the page.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${style.badge}`}>{groups.length} patterns</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{groups.map((group) => <RepeatGroupCard key={group.key} group={group} canEdit={canEdit} />)}</div>
    </section>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "amber" | "violet" | "rose" | "slate" }) {
  const className = {
    amber: "bg-amber-50 text-amber-900",
    violet: "bg-violet-50 text-violet-900",
    rose: "bg-rose-50 text-rose-900",
    slate: "bg-slate-100 text-slate-800",
  }[tone];
  return (
    <div className={`rounded-2xl px-4 py-3 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-medium opacity-80">{detail}</p>
    </div>
  );
}

function filtersFromSearchParams(params: URLSearchParams): RequestFilters {
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? (params.get("view") === "archive" ? "all" : "active"),
    tier: params.get("tier") ?? "all",
    ministry: params.get("ministry") ?? "all",
    source: params.get("source") ?? (params.get("pco") === "linked" ? "pco" : "all"),
    view: params.get("past") === "1" ? "archive" : params.get("view") ?? "focus",
  };
}

function sanitizeFilters(filters: RequestFilters, rows: RequestRow[]): RequestFilters {
  const statuses = new Set(rows.map((row) => row.status));
  const tiers = new Set(rows.map((row) => String(row.tier)));
  const ministries = new Set(rows.flatMap((row) => row.ministries.map((ministry) => ministry.name)));
  const sources = new Set(rows.map((row) => row.source));
  return {
    q: filters.q,
    status: filters.status === "all" || filters.status === "active" || statuses.has(filters.status) ? filters.status : "active",
    tier: filters.tier === "all" || tiers.has(filters.tier) ? filters.tier : "all",
    ministry: filters.ministry === "all" || ministries.has(filters.ministry) ? filters.ministry : "all",
    source: filters.source === "all" || sources.has(filters.source as EventSource) ? filters.source : "all",
    view: EVENT_VIEWS.has(filters.view as EventView) ? filters.view : "focus",
  };
}

function filtersToQuery(filters: RequestFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status !== "active") params.set("status", filters.status);
  if (filters.tier !== "all") params.set("tier", filters.tier);
  if (filters.ministry !== "all") params.set("ministry", filters.ministry);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.view !== "focus") params.set("view", filters.view);
  return params.toString();
}

function writeFiltersToUrl(filters: RequestFilters) {
  if (typeof window === "undefined") return;
  const query = filtersToQuery(filters);
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function groupByMonth(rows: RequestRow[], descending = false) {
  const groups = new Map<string, RequestRow[]>();
  for (const row of rows) {
    const date = new Date(row.eventStartMs);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => descending ? b.localeCompare(a) : a.localeCompare(b))
    .map(([key, group]) => ({ key, label: monthName.format(group[0].eventStartMs), rows: descending ? [...group].reverse() : group }));
}

export function RequestsTable({ rows, initialFilters = DEFAULT_FILTERS, canEdit }: { rows: RequestRow[]; initialFilters?: RequestFilters; canEdit: boolean }) {
  const [filters, setFilters] = useState<RequestFilters>(() => sanitizeFilters(initialFilters, rows));
  const todayMs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const statuses = useMemo(() => {
    const present = new Set(rows.map((row) => row.status));
    return [...REQUEST_STATUSES, ...REQUEST_SIDE_STATUSES].filter((status) => present.has(status));
  }, [rows]);
  const tiers = useMemo(() => [...new Set(rows.map((row) => row.tier))].sort((a, b) => a - b), [rows]);
  const ministries = useMemo(() => [...new Set(rows.flatMap((row) => row.ministries.map((ministry) => ministry.name)))].sort(), [rows]);

  useEffect(() => {
    const onPopState = () => setFilters(sanitizeFilters(filtersFromSearchParams(new URLSearchParams(window.location.search)), rows));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [rows]);

  function setNextFilters(next: RequestFilters) {
    const clean = sanitizeFilters(next, rows);
    writeFiltersToUrl(clean);
    setFilters(clean);
  }

  function updateFilter<K extends keyof RequestFilters>(key: K, value: RequestFilters[K]) {
    setNextFilters({ ...filters, [key]: value });
  }

  function updateView(view: EventView) {
    const leavingArchive = filters.view === "archive" && filters.status === "all";
    const status = view === "archive" && filters.status === "active" ? "all" : leavingArchive && view !== "archive" ? "active" : filters.status;
    setNextFilters({ ...filters, view, status });
  }

  function clearFilters() {
    setNextFilters({ ...DEFAULT_FILTERS, view: filters.view, status: filters.view === "archive" ? "all" : "active" });
  }

  const query = filters.q.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    if (query && !row.title.toLocaleLowerCase().includes(query) && !row.ministries.some((ministry) => ministry.name.toLocaleLowerCase().includes(query))) return false;
    if (filters.status === "active" ? !ACTIVE_STATUSES.has(row.status) : filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.tier !== "all" && String(row.tier) !== filters.tier) return false;
    if (filters.ministry !== "all" && !row.ministries.some((ministry) => ministry.name === filters.ministry)) return false;
    if (filters.source !== "all" && row.source !== filters.source) return false;
    return true;
  });

  const overview = useMemo(() => buildEventsFocus(rows, new Date(todayMs)), [rows, todayMs]);
  const visibleFocus = useMemo(() => buildEventsFocus(filtered, new Date(todayMs)), [filtered, todayMs]);
  const upcoming = filtered.filter((row) => row.eventStartMs >= todayMs);
  const archive = filtered.filter((row) => row.eventStartMs < todayMs);
  const repeating = groupRepeatedEventTitles(upcoming, 2);
  const upcomingGroups = groupByMonth(upcoming);
  const archiveGroups = groupByMonth(archive, true);
  const pastCount = rows.filter((row) => row.eventStartMs < todayMs).length;
  const upcomingCount = rows.length - pastCount;
  const filtersActive = filters.q || filters.status !== (filters.view === "archive" ? "all" : "active") || filters.tier !== "all" || filters.ministry !== "all" || filters.source !== "all";

  const viewTabs: { id: EventView; label: string; count?: number }[] = [
    { id: "focus", label: "Focus now" },
    { id: "upcoming", label: "All upcoming", count: overview.activeUpcoming.length },
    { id: "repeating", label: "Repeating & duplicates", count: overview.repeatedGroups.length + overview.duplicateGroups.length },
    { id: "archive", label: "Past events", count: pastCount },
  ];

  return (
    <div className="max-w-6xl">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Event control center</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">Events</h1>
          <p className="mt-2 max-w-2xl text-muted">Decide what needs promotion, catch duplicate imports, and keep the full church calendar easy to find.</p>
          <p className="mt-2 text-sm text-muted">{upcomingCount} upcoming · {pastCount} past events kept in the archive</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link href="/import/planning-center" className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-ink hover:bg-white">Import events</Link>
            <Link href="/requests/new" className="btn-primary inline-flex min-h-11 items-center rounded-full px-5 py-2 text-sm font-semibold">Add event</Link>
          </div>
        )}
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Needs review" value={overview.reviewTotal} detail="Submitted or waiting on details" tone="amber" />
        <SummaryCard label="Promotion active" value={overview.promotingTotal} detail="Approved and moving forward" tone="violet" />
        <SummaryCard label="Possible duplicates" value={overview.duplicateGroups.length} detail="Same title and date" tone="rose" />
        <SummaryCard label="Cancelled hidden" value={overview.cancelledUpcoming.length} detail="Available through the status filter" tone="slate" />
      </div>

      <div className="card-float mb-5 p-2">
        <div role="tablist" aria-label="Event views" className="flex flex-wrap gap-1">
          {viewTabs.map((tab) => {
            const active = filters.view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => updateView(tab.id)}
                className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-ink text-white shadow-sm" : "text-slate-700 hover:bg-sky-bg"}`}
              >
                {tab.label}{tab.count !== undefined ? ` · ${tab.count}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-float mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_repeat(4,minmax(135px,0.7fr))]">
          <label className="text-xs font-bold text-slate-700">
            Search
            <input type="search" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Event or ministry name" className="mt-1 min-h-11 w-full rounded-2xl border px-3 py-2 text-sm font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Status
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border px-3 py-2 text-sm font-normal">
              <option value="active">Active only</option>
              <option value="all">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{REQUEST_STATUS_META[status]?.label ?? status}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Audience
            <select value={filters.tier} onChange={(event) => updateFilter("tier", event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border px-3 py-2 text-sm font-normal">
              <option value="all">All audiences</option>
              {tiers.map((tier) => <option key={tier} value={String(tier)}>{tierLabel(tier)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Ministry
            <select value={filters.ministry} onChange={(event) => updateFilter("ministry", event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border px-3 py-2 text-sm font-normal">
              <option value="all">All ministries</option>
              {ministries.map((ministry) => <option key={ministry} value={ministry}>{ministry}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Source
            <select value={filters.source} onChange={(event) => updateFilter("source", event.target.value)} className="mt-1 min-h-11 w-full rounded-2xl border px-3 py-2 text-sm font-normal">
              <option value="all">All sources</option>
              <option value="pco">Planning Center</option>
              <option value="calendar">Calendar import</option>
              <option value="local">Added here</option>
            </select>
          </label>
        </div>
        {filtersActive && <button type="button" onClick={clearFilters} className="mt-3 min-h-11 rounded-full px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">Clear filters</button>}
      </div>

      {filters.view === "focus" && (
        <div className="grid gap-5">
          <DuplicateSection groups={visibleFocus.duplicateGroups} todayMs={todayMs} canEdit={canEdit} />
          <EventSection title="Needs a decision" eyebrow="Review next" description="One-off events in the next 60 days that still need approval or more information." rows={visibleFocus.needsDecision} tone="attention" todayMs={todayMs} />
          <EventSection title="Promotion is active" eyebrow="Moving forward" description="Approved one-off events in the next 60 days. Open an event to adjust channels, timing, or ownership." rows={visibleFocus.promotingNow} tone="active" todayMs={todayMs} initialRows={8} />
          <RepeatSection groups={visibleFocus.repeatedGroups} canEdit={canEdit} />
          {visibleFocus.later.length > 0 && (
            <section className="card-float border-l-[5px] border-l-slate-400 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Safely out of the way</p>
                  <h2 className="mt-0.5 text-xl font-extrabold text-ink">{visibleFocus.later.length} later events</h2>
                  <p className="mt-1 text-sm text-muted">These are more than 60 days away. They remain in All upcoming without crowding today’s decisions.</p>
                </div>
                <button type="button" onClick={() => updateView("upcoming")} className="min-h-11 rounded-full border px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">See all upcoming →</button>
              </div>
            </section>
          )}
          {visibleFocus.duplicateGroups.length === 0 && visibleFocus.needsDecision.length === 0 && visibleFocus.promotingNow.length === 0 && visibleFocus.repeatedGroups.length === 0 && (
            <div className="card-float p-8 text-center"><p className="font-bold text-ink">Nothing matches this focus view.</p><p className="mt-1 text-sm text-muted">Clear filters or open All upcoming to browse the full schedule.</p></div>
          )}
        </div>
      )}

      {filters.view === "upcoming" && (
        <div className="grid gap-6">
          <p className="text-sm text-muted">{upcoming.length} events match this view. Cancelled events stay hidden unless you choose them in Status.</p>
          {upcomingGroups.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex items-center gap-3"><h2 className="text-xl font-extrabold text-ink">{group.label}</h2><span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-muted">{group.rows.length}</span></div>
              <div className="grid gap-3">{group.rows.map((row) => <EventRow key={row.id} row={row} todayMs={todayMs} />)}</div>
            </section>
          ))}
          {upcoming.length === 0 && <div className="card-float p-8 text-center text-sm text-muted">No upcoming events match these filters.</div>}
        </div>
      )}

      {filters.view === "repeating" && (
        <div className="grid gap-5">
          <DuplicateSection groups={visibleFocus.duplicateGroups} todayMs={todayMs} canEdit={canEdit} />
          <RepeatSection groups={repeating} canEdit={canEdit} />
          {visibleFocus.duplicateGroups.length === 0 && repeating.length === 0 && <div className="card-float p-8 text-center text-sm text-muted">No repeating or duplicate events match these filters.</div>}
        </div>
      )}

      {filters.view === "archive" && (
        <div className="grid gap-6">
          <p className="text-sm text-muted">Past events stay searchable here and never crowd the default Events view.</p>
          {archiveGroups.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex items-center gap-3"><h2 className="text-xl font-extrabold text-ink">{group.label}</h2><span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-muted">{group.rows.length}</span></div>
              <div className="grid gap-3">{group.rows.map((row) => <EventRow key={row.id} row={row} todayMs={todayMs} />)}</div>
            </section>
          ))}
          {archive.length === 0 && <div className="card-float p-8 text-center text-sm text-muted">No past events match these filters.</div>}
        </div>
      )}
    </div>
  );
}
