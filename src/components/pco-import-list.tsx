"use client";
import { useState, useTransition } from "react";
import { importPcoEvents } from "@/actions/pco";

export type PcoEventRow = {
  pcoEventId: string;
  name: string;
  startsAtMs: number;
  location: string | null;
  needsRegistration: boolean;
  alreadyImported: boolean;
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function PcoImportList({ events }: { events: PcoEventRow[] }) {
  const importable = events.filter((e) => !e.alreadyImported);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(importable.map((e) => e.pcoEventId)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function doImport() {
    if (selected.size === 0) return;
    const ids = [...selected];
    setResult(null);
    startTransition(async () => {
      try {
        const count = await importPcoEvents(ids);
        setResult(
          count === 1 ? "Imported 1 event." : `Imported ${count} events.`,
        );
        setSelected(new Set());
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import failed.";
        setResult(msg);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={doImport}
          disabled={pending || selected.size === 0}
          className="rounded-full bg-ink text-white px-5 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {pending
            ? "Importing…"
            : `Import selected${selected.size ? ` (${selected.size})` : ""}`}
        </button>
        {importable.length > 0 && (
          <>
            <button
              onClick={selectAll}
              disabled={pending}
              className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition"
            >
              Select all
            </button>
            <button
              onClick={clearAll}
              disabled={pending || selected.size === 0}
              className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition disabled:opacity-40"
            >
              Clear
            </button>
          </>
        )}
        {result && <span className="text-sm font-semibold text-muted">{result}</span>}
      </div>

      <div className="card-float overflow-hidden">
        <div className="px-5 py-3 text-xs font-bold text-muted border-b border-slate-100">
          Approved Planning Center events
        </div>
        {events.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">
            No approved upcoming events found in Planning Center.
          </div>
        )}
        {events.map((e) => {
          const checked = selected.has(e.pcoEventId);
          return (
            <label
              key={e.pcoEventId}
              className={`flex items-start gap-3 px-5 py-3 border-t border-slate-100 text-sm first:border-t-0 ${
                e.alreadyImported ? "opacity-60" : "cursor-pointer hover:bg-sky-bg transition"
              }`}
            >
              <input
                type="checkbox"
                disabled={e.alreadyImported || pending}
                checked={checked}
                onChange={() => toggle(e.pcoEventId)}
                className="h-4 w-4 mt-0.5"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-muted">{fmt(e.startsAtMs)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted mt-0.5">
                  <span>{e.location ? `📍 ${e.location}` : "📍 No room booked"}</span>
                  {e.needsRegistration && <span>🎟️ Registration</span>}
                </div>
              </div>
              {e.alreadyImported && (
                <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Imported
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
