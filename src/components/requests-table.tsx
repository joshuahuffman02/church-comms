"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { REQUEST_STATUS_META } from "@/lib/status";
import { cancelEvent } from "@/actions/events";
import { MinistryDots, type MinistryDot } from "@/components/ministry-dots";

export type RequestRow = {
  id: string;
  title: string;
  status: string;
  tier: number;
  /** Every ministry this event involves (all equal). Empty = none. */
  ministries: MinistryDot[];
  eventStartMs: number;
  nextProductionDueMs: number | null;
  location: string | null;
  isSeries: boolean;
  /** True when this event is backed by a Planning Center event (has pcoEventId). */
  pcoLinked: boolean;
  /** True when the linked PCO event carries any tags (shows a subtle 🏷️). */
  hasTags: boolean;
  /** True when a "Room Only" tag marked this as not-for-promotion (shows 🚫). */
  noPromo: boolean;
};

export type RequestFilters = {
  q: string;
  status: string;
  tier: string;
  ministry: string;
  pco: string;
};

const DEFAULT_FILTERS: RequestFilters = {
  q: "",
  status: "all",
  tier: "all",
  ministry: "all",
  pco: "all",
};

const fmt = (ms: number | null) =>
  ms === null
    ? "—"
    : new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function StatusChip({ status }: { status: string }) {
  const meta = REQUEST_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: number }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
      Tier {tier}
    </span>
  );
}

function CancelButton({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  if (status === "cancelled") {
    return <span className="text-xs text-muted">cancelled</span>;
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Cancel this event? Its scheduled items will be removed (the event stays as a record).")) {
          start(() => cancelEvent(id));
        }
      }}
      className="rounded-full border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition"
    >
      {pending ? "…" : "Cancel"}
    </button>
  );
}

const selectCls = "rounded-2xl border px-3 py-2 text-sm";
const GRID = "md:grid-cols-[2fr_1.1fr_0.7fr_1fr_1fr_1fr_0.8fr]";

function filtersFromSearchParams(params: URLSearchParams): RequestFilters {
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "all",
    tier: params.get("tier") ?? "all",
    ministry: params.get("ministry") ?? "all",
    pco: params.get("pco") ?? "all",
  };
}

function sanitizeFilters(filters: RequestFilters, rows: RequestRow[]): RequestFilters {
  const statuses = new Set(rows.map((r) => r.status));
  const tiers = new Set(rows.map((r) => String(r.tier)));
  const ministries = new Set(rows.flatMap((r) => r.ministries.map((m) => m.name)));
  const pco = filters.pco === "linked" || filters.pco === "unlinked" ? filters.pco : "all";

  return {
    q: filters.q,
    status: filters.status === "all" || statuses.has(filters.status) ? filters.status : "all",
    tier: filters.tier === "all" || tiers.has(filters.tier) ? filters.tier : "all",
    ministry: filters.ministry === "all" || ministries.has(filters.ministry) ? filters.ministry : "all",
    pco,
  };
}

function writeFiltersToUrl(filters: RequestFilters) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.tier !== "all") params.set("tier", filters.tier);
  if (filters.ministry !== "all") params.set("ministry", filters.ministry);
  if (filters.pco !== "all") params.set("pco", filters.pco);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function RequestsTable({
  rows,
  initialFilters = DEFAULT_FILTERS,
  canEdit,
}: {
  rows: RequestRow[];
  initialFilters?: RequestFilters;
  canEdit: boolean;
}) {
  const [filters, setFilters] = useState<RequestFilters>(() => sanitizeFilters(initialFilters, rows));

  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))], [rows]);
  const tiers = useMemo(() => [...new Set(rows.map((r) => r.tier))].sort((a, b) => a - b), [rows]);
  // The ministry filter offers every ministry that appears in ANY event's set.
  const ministries = useMemo(
    () => [...new Set(rows.flatMap((r) => r.ministries.map((m) => m.name)))].sort(),
    [rows]
  );

  useEffect(() => {
    const onPopState = () => {
      setFilters(sanitizeFilters(filtersFromSearchParams(new URLSearchParams(window.location.search)), rows));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [rows]);

  function updateFilter<K extends keyof RequestFilters>(key: K, value: RequestFilters[K]) {
    const next = sanitizeFilters({ ...filters, [key]: value }, rows);
    writeFiltersToUrl(next);
    setFilters(next);
  }

  function clearFilters() {
    const next = DEFAULT_FILTERS;
    writeFiltersToUrl(next);
    setFilters(next);
  }

  const needle = filters.q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (needle === "" ||
        r.title.toLowerCase().includes(needle) ||
        // Search matches any of the event's ministry names.
        r.ministries.some((m) => m.name.toLowerCase().includes(needle))) &&
      (filters.status === "all" || r.status === filters.status) &&
      (filters.tier === "all" || String(r.tier) === filters.tier) &&
      // Ministry filter matches when the picked ministry is anywhere in the set.
      (filters.ministry === "all" || r.ministries.some((m) => m.name === filters.ministry)) &&
      // PCO link filter: isolate events with / without a Planning Center event.
      (filters.pco === "all" ||
        (filters.pco === "linked" && r.pcoLinked) ||
        (filters.pco === "unlinked" && !r.pcoLinked))
  );

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-1">Events 📋</h1>
      <p className="text-muted mb-5">{rows.length} requests · all events at a glance</p>

      <div className="card-float p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔍</span>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => updateFilter("q", e.target.value)}
            placeholder="Search events by name or ministry…"
            className="w-full rounded-full border pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <label className="text-sm text-muted">
          Status
          <select className={`${selectCls} ml-2`} value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="all">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {REQUEST_STATUS_META[s]?.label ?? s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Tier
          <select className={`${selectCls} ml-2`} value={filters.tier} onChange={(e) => updateFilter("tier", e.target.value)}>
            <option value="all">All</option>
            {tiers.map((t) => (
              <option key={t} value={String(t)}>
                Tier {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Ministry
          <select className={`${selectCls} ml-2`} value={filters.ministry} onChange={(e) => updateFilter("ministry", e.target.value)}>
            <option value="all">All</option>
            {ministries.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          PCO
          <select className={`${selectCls} ml-2`} value={filters.pco} onChange={(e) => updateFilter("pco", e.target.value)}>
            <option value="all">All</option>
            <option value="linked">🔗 Linked</option>
            <option value="unlinked">⚠️ Not linked</option>
          </select>
        </label>
        {(filters.q || filters.status !== "all" || filters.tier !== "all" || filters.ministry !== "all" || filters.pco !== "all") && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full px-3 py-2 text-sm font-semibold text-sky-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-muted mb-2 ml-1">
        {filtered.length === rows.length ? `${rows.length} events` : `${filtered.length} of ${rows.length} events`}
      </p>

      <div className="card-float overflow-hidden">
        <div className={`hidden md:grid ${GRID} gap-3 px-5 py-3 text-xs font-bold text-muted border-b border-slate-100`}>
          <div>Event</div>
          <div>Ministry</div>
          <div>Tier</div>
          <div>Event date</div>
          <div>Status</div>
          <div>Next make-by</div>
          <div></div>
        </div>
        {filtered.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">No events match your search.</div>
        )}
        {filtered.map((r) => (
          <div
            key={r.id}
            className={`grid grid-cols-2 ${GRID} gap-3 px-5 py-3 border-t border-slate-100 text-sm items-center hover:bg-sky-bg transition`}
          >
            <Link href={`/requests/${r.id}`} className="contents">
              <div className="col-span-2 md:col-span-1">
                {r.isSeries && (
                  <span className="mr-1 text-xs" title="Part of a recurring series">
                    🔁
                  </span>
                )}
                <span className="font-semibold">{r.title}</span>
                {r.location && (
                  <span className="ml-1.5 text-xs text-muted" title={r.location}>
                    📍
                  </span>
                )}
                {r.hasTags && (
                  <span className="ml-1.5 text-xs text-muted" title="Has Planning Center tags">
                    🏷️
                  </span>
                )}
                {r.noPromo && (
                  <span
                    className="ml-1.5 text-xs"
                    title="No promo — a “Room Only” tag keeps this out of the comms queue"
                  >
                    🚫
                  </span>
                )}
                {r.pcoLinked ? (
                  <span className="ml-1.5 text-xs text-muted" title="Linked to a Planning Center event">
                    🔗
                  </span>
                ) : (
                  <span
                    className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 align-middle"
                    title="No Planning Center event behind this — local only"
                  >
                    no PCO
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted">
                <MinistryDots ministries={r.ministries} showNames />
              </div>
              <div>
                <TierBadge tier={r.tier} />
              </div>
              <div className="text-muted">{fmt(r.eventStartMs)}</div>
              <div>
                <StatusChip status={r.status} />
              </div>
              <div className="text-muted">{fmt(r.nextProductionDueMs)}</div>
            </Link>
            <div className="text-right">
              <CancelButton id={r.id} status={r.status} canEdit={canEdit} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
