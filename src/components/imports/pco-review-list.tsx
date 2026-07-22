"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importPcoEvents } from "@/actions/pco";

export type PcoReviewRow = {
  pcoEventId: string;
  name: string;
  startsAtMs: number;
  location: string | null;
  needsRegistration: boolean;
  state: "new" | "changed";
  changes: string[];
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function PcoReviewList({ events }: { events: PcoReviewRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function importSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setConfirming(false);
    setSummary(null);
    startTransition(async () => {
      const result = await importPcoEvents(ids);
      setSummary(`${result.created} new · ${result.updated} refreshed${result.skipped ? ` · ${result.skipped} no longer available` : ""}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  if (events.length === 0) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 px-5 py-8 text-center">
        <div className="text-lg font-extrabold text-emerald-900">Planning Center is up to date</div>
        <p className="mt-1 text-sm text-emerald-800">Imported events are hidden here unless Planning Center details change.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card-float mb-3 flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={() => setSelected(new Set(events.map((event) => event.pcoEventId)))} disabled={pending} className="rounded-full border px-3 py-1.5 text-sm font-semibold text-muted hover:bg-sky-bg disabled:opacity-40">
          Select all actionable
        </button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={pending || selected.size === 0} className="rounded-full border px-3 py-1.5 text-sm font-semibold text-muted hover:bg-sky-bg disabled:opacity-40">
          Clear
        </button>
        <span className="mr-auto text-sm font-semibold text-muted">{selected.size ? `${selected.size} selected` : `${events.length} need attention`}</span>
        <button type="button" onClick={() => setConfirming(true)} disabled={pending || selected.size === 0} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          Apply selected
        </button>
      </div>

      {summary && (
        <div aria-live="polite" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <span>{summary}</span>
          <Link href="/requests" className="underline">View events →</Link>
        </div>
      )}

      <div className="card-float overflow-hidden">
        {events.map((event) => (
          <label key={event.pcoEventId} className="flex cursor-pointer items-start gap-3 border-t border-slate-100 px-4 py-4 first:border-t-0 hover:bg-sky-bg sm:px-5">
            <input type="checkbox" checked={selected.has(event.pcoEventId)} onChange={() => toggle(event.pcoEventId)} disabled={pending} className="mt-1 h-4 w-4" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-ink">{event.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${event.state === "new" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-800"}`}>
                  {event.state === "new" ? "New in Planning Center" : "Details changed"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <span>{fmt(event.startsAtMs)}</span>
                <span>{event.location || "No room booked"}</span>
                {event.needsRegistration && <span>Registration</span>}
              </div>
              {event.changes.length > 0 && <p className="mt-1.5 text-xs text-amber-800">Changed: {event.changes.join(", ")}</p>}
            </div>
          </label>
        ))}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/25 p-4" role="dialog" aria-modal="true" aria-labelledby="pco-confirm-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="pco-confirm-title" className="text-lg font-extrabold text-ink">Apply Planning Center updates?</h2>
            <p className="mt-2 text-sm text-muted">
              {selected.size} selected {selected.size === 1 ? "event" : "events"} will be created or refreshed. Your local communication choices stay intact.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full border px-4 py-2 text-sm font-semibold text-muted">Cancel</button>
              <button type="button" onClick={importSelected} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Apply {selected.size}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
