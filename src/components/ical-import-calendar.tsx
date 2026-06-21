"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { confirmIcalMatch, ignoreIcalEvents, importIcalEvents } from "@/actions/ical-import";

export type IcalImportRow = {
  key: string;
  title: string;
  dateKey: string;
  startsAtMs: number;
  location: string | null;
  description: string | null;
  status: "missing" | "possible_match" | "already_in_system";
  operationalNoise: boolean;
  matches: {
    id: string;
    title: string;
    eventStartMs: number;
    titleScore: number;
    dateDistanceDays: number;
  }[];
};

type Props = {
  rows: IcalImportRow[];
  filePath: string;
  windowStartMs: number;
  windowEndMs: number;
  ignoredCount: number;
};

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function IcalImportCalendar({
  rows,
  filePath,
  windowStartMs,
  windowEndMs,
  ignoredCount,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("review");
  const [noise, setNoise] = useState("likely");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        needle === "" ||
        row.title.toLowerCase().includes(needle) ||
        (row.location ?? "").toLowerCase().includes(needle);
      const matchesStatus =
        status === "all" ||
        (status === "review" && row.status !== "already_in_system") ||
        row.status === status;
      const matchesNoise =
        noise === "all" ||
        (noise === "likely" && !row.operationalNoise) ||
        (noise === "noise" && row.operationalNoise);
      return matchesQuery && matchesStatus && matchesNoise;
    });
  }, [noise, query, rows, status]);

  const selectableVisible = visibleRows.filter((row) => row.status !== "already_in_system");
  const visibleKeys = new Set(visibleRows.map((row) => row.key));
  const selectedVisibleCount = [...selected].filter((key) => visibleKeys.has(key)).length;
  const byDay = useMemo(() => {
    const map = new Map<string, IcalImportRow[]>();
    for (const row of visibleRows) {
      map.set(row.dateKey, [...(map.get(row.dateKey) ?? []), row]);
    }
    return map;
  }, [visibleRows]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectVisible() {
    setSelected(new Set(selectableVisible.map((row) => row.key)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function importSelected() {
    const keys = [...selected];
    if (keys.length === 0) return;
    setMessage(null);
    startTransition(async () => {
      const result = await importIcalEvents(keys);
      setMessage(
        result.created === 1
          ? "Made 1 event live."
          : `Made ${result.created} events live.`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  function deleteSelected() {
    const keys = [...selected];
    if (keys.length === 0) return;
    if (!confirm("Delete these from the import preview? This hides them here; it does not delete the source calendar.")) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await ignoreIcalEvents(keys);
      setMessage(
        result.ignored === 1
          ? "Deleted 1 item from the preview."
          : `Deleted ${result.ignored} items from the preview.`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold mb-1">iCal import preview</h1>
        <p className="text-sm text-muted">
          {formatDate(windowStartMs)} through {formatDate(windowEndMs)} from{" "}
          <code className="font-mono">{filePath}</code>
        </p>
      </div>

      <div className="card-float mb-4 grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-[1.2fr_auto_auto]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or location..."
            className="rounded-full border px-4 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-full border px-4 py-2 text-sm"
          >
            <option value="review">Needs review</option>
            <option value="missing">Missing only</option>
            <option value="possible_match">Possible matches</option>
            <option value="already_in_system">Already in app</option>
            <option value="all">All</option>
          </select>
          <select
            value={noise}
            onChange={(e) => setNoise(e.target.value)}
            className="rounded-full border px-4 py-2 text-sm"
          >
            <option value="likely">Likely events</option>
            <option value="all">Include everything</option>
            <option value="noise">Operational/noise only</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectVisible}
            disabled={pending || selectableVisible.length === 0}
            className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg disabled:opacity-40"
          >
            Select visible
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={pending || selected.size === 0}
            className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={importSelected}
            disabled={pending || selected.size === 0}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Working..." : `Make live (${selected.size})`}
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={pending || selected.size === 0}
            className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            Delete selected
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        <Metric label="Visible" value={visibleRows.length} />
        <Metric label="Selected" value={selectedVisibleCount} />
        <Metric label="Missing" value={rows.filter((row) => row.status === "missing").length} />
        <Metric label="Possible" value={rows.filter((row) => row.status === "possible_match").length} />
        <Metric label="Deleted" value={ignoredCount} />
      </div>

      {message && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4">
          {monthRange(new Date(windowStartMs), new Date(windowEndMs)).map((month) => (
            <MonthPanel
              key={`${month.getFullYear()}-${month.getMonth()}`}
              month={month}
              byDay={byDay}
              selected={selected}
              onToggle={toggle}
            />
          ))}
        </div>

        <div className="card-float h-fit overflow-hidden xl:sticky xl:top-4">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-extrabold text-ink">Review list</div>
            <div className="text-xs text-muted">{visibleRows.length} visible items</div>
          </div>
          <div className="max-h-[760px] overflow-auto">
            {visibleRows.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">No items match these filters.</div>
            ) : (
              visibleRows.map((row) => (
                <EventRow
                  key={row.key}
                  row={row}
                  selected={selected.has(row.key)}
                  onToggle={() => toggle(row.key)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-float px-4 py-3">
      <div className="text-2xl font-extrabold text-ink">{value}</div>
      <div className="text-xs font-bold uppercase text-muted">{label}</div>
    </div>
  );
}

function MonthPanel({
  month,
  byDay,
  selected,
  onToggle,
}: {
  month: Date;
  byDay: Map<string, IcalImportRow[]>;
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const grid = monthGrid(month);
  return (
    <section className="card-float overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-extrabold text-ink">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-100">
        {WD.map((day) => (
          <div key={day} className="bg-slate-50 px-2 py-2 text-xs font-bold text-muted">
            {day}
          </div>
        ))}
        {grid.flat().map((day) => {
          const dayKey = dateKey(day);
          const items = byDay.get(dayKey) ?? [];
          return (
            <div
              key={dayKey}
              className={`min-h-32 bg-white p-2 ${day.getMonth() !== month.getMonth() ? "opacity-40" : ""}`}
            >
              <div className="mb-1 text-xs font-bold text-muted">{day.getDate()}</div>
              <div className="grid gap-1">
                {items.slice(0, 4).map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    disabled={row.status === "already_in_system"}
                    onClick={() => onToggle(row.key)}
                    className={`rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition ${
                      selected.has(row.key)
                        ? "border-ink bg-ink text-white"
                        : statusClass(row.status)
                    } ${row.status === "already_in_system" ? "cursor-default opacity-70" : "hover:border-ink"}`}
                    title={row.title}
                  >
                    <span className="block truncate">{row.title}</span>
                  </button>
                ))}
                {items.length > 4 && (
                  <div className="text-[11px] font-semibold text-muted">+{items.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EventRow({
  row,
  selected,
  onToggle,
}: {
  row: IcalImportRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [confirmPending, startConfirm] = useTransition();
  const disabled = row.status === "already_in_system";

  function confirmMatch(requestId: string) {
    startConfirm(async () => {
      await confirmIcalMatch(row.key, requestId);
      router.refresh();
    });
  }

  return (
    <div
      className={`block border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 ${
        disabled ? "opacity-65" : "hover:bg-sky-bg"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 h-4 w-4"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{row.title}</span>
            <StatusPill status={row.status} />
            {row.operationalNoise && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">
                operational
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{formatDate(row.startsAtMs)}</span>
            {row.location && <span>{row.location}</span>}
          </div>
          {row.matches.length > 0 && (
            <div className="mt-2 rounded-lg bg-sky-bg/50 px-3 py-2 text-xs text-muted">
              <div className="font-bold text-ink">Possible app match</div>
              {row.matches.map((match) => (
                <div key={match.id} className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <Link href={`/requests/${match.id}`} className="font-semibold text-ink underline">
                      {match.title}
                    </Link>{" "}
                    <span>
                      {formatDate(match.eventStartMs)} · score {match.titleScore.toFixed(2)}
                    </span>
                  </span>
                  {row.status === "possible_match" && (
                    <button
                      type="button"
                      disabled={confirmPending}
                      onClick={() => confirmMatch(match.id)}
                      className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      {confirmPending ? "Confirming..." : "Confirm"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: IcalImportRow["status"] }) {
  const label =
    status === "missing"
      ? "Missing"
      : status === "possible_match"
        ? "Possible"
        : "Already live";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(status)}`}>
      {label}
    </span>
  );
}

function statusClass(status: IcalImportRow["status"]): string {
  if (status === "missing") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "possible_match") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function monthRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push(d);
  }
  return out;
}

function monthGrid(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const weeks: Date[][] = [];
  let cur = start;
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => addDaysLocal(cur, i));
    weeks.push(week);
    cur = addDaysLocal(cur, 7);
  }
  return weeks;
}

function addDaysLocal(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
