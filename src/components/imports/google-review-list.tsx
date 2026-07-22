"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ignoreGoogleEvents, importGoogleEvents } from "@/actions/google-import";

export type GoogleReviewRow = {
  key: string;
  title: string;
  dateLabel: string;
  location: string | null;
  recommendation: "accept" | "ignore" | "review";
  recommendationReason: string | null;
  operationalNoise: boolean;
  match: {
    requestId: string;
    title: string;
    dateLabel: string;
    reason: string;
    confidence: string | null;
  } | null;
};

type PendingDecision = { kind: "import" | "skip"; keys: string[] } | null;

const badge: Record<GoogleReviewRow["recommendation"], { label: string; className: string }> = {
  accept: { label: "Likely import", className: "bg-emerald-100 text-emerald-700" },
  ignore: { label: "Likely skip", className: "bg-slate-100 text-slate-700" },
  review: { label: "Needs a decision", className: "bg-amber-100 text-amber-800" },
};

export function GoogleReviewList({ rows }: { rows: GoogleReviewRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<PendingDecision>(null);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function act() {
    if (!decision) return;
    const current = decision;
    setDecision(null);
    setSummary(null);
    startTransition(async () => {
      if (current.kind === "import") {
        const result = await importGoogleEvents(current.keys);
        setSummary(`${result.created} imported${result.skipped ? ` · ${result.skipped} already handled` : ""}.`);
      } else {
        const result = await ignoreGoogleEvents(current.keys);
        setSummary(`${result.ignored} skipped. Nothing was deleted from Google Calendar.`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center">
        <div className="text-lg font-extrabold text-ink">Nothing matches these filters</div>
        <p className="mt-1 text-sm text-muted">Try another decision filter or clear the search.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card-float mb-3 flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setSelected(new Set(rows.map((row) => row.key)))}
          disabled={pending}
          className="rounded-full border px-3 py-1.5 text-sm font-semibold text-muted hover:bg-sky-bg disabled:opacity-40"
        >
          Select this page
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          disabled={pending || selected.size === 0}
          className="rounded-full border px-3 py-1.5 text-sm font-semibold text-muted hover:bg-sky-bg disabled:opacity-40"
        >
          Clear
        </button>
        <span className="mr-auto text-sm font-semibold text-muted">
          {selected.size ? `${selected.size} selected` : "Choose only the items you want to act on"}
        </span>
        <button
          type="button"
          onClick={() => setDecision({ kind: "skip", keys: [...selected] })}
          disabled={pending || selected.size === 0}
          className="rounded-full border border-rose-200 px-4 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
        >
          Skip selected
        </button>
        <button
          type="button"
          onClick={() => setDecision({ kind: "import", keys: [...selected] })}
          disabled={pending || selected.size === 0}
          className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Import selected
        </button>
      </div>

      {summary && (
        <div aria-live="polite" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <span>{summary}</span>
          <Link href="/requests" className="underline">View events →</Link>
        </div>
      )}

      <div className="card-float overflow-hidden">
        {rows.map((row) => {
          const treatment = badge[row.recommendation];
          return (
            <article key={row.key} className="border-t border-slate-100 px-4 py-4 first:border-t-0 sm:px-5">
              <div className="flex items-start gap-3">
                <label className="mt-0.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-xl hover:bg-sky-bg">
                  <span className="sr-only">Select {row.title} on {row.dateLabel}</span>
                  <input
                    type="checkbox"
                    checked={selected.has(row.key)}
                    onChange={() => toggle(row.key)}
                    disabled={pending}
                    className="h-4 w-4"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-ink">{row.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${treatment.className}`}>
                      {treatment.label}
                    </span>
                    {row.match && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                        Possible duplicate
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{row.dateLabel}</span>
                    {row.location && <span>{row.location}</span>}
                  </div>
                  {row.recommendationReason && <p className="mt-1.5 text-xs text-muted">{row.recommendationReason}</p>}
                  {row.match && (
                    <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-muted">
                      Compare with{" "}
                      <Link href={`/requests/${row.match.requestId}`} className="font-bold text-ink underline">
                        {row.match.title}
                      </Link>{" "}
                      · {row.match.dateLabel} · {row.match.reason}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setDecision({ kind: "skip", keys: [row.key] })}
                    disabled={pending}
                    aria-label={`Do not import ${row.title} on ${row.dateLabel}`}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision({ kind: "import", keys: [row.key] })}
                    disabled={pending}
                    aria-label={`Import ${row.title} on ${row.dateLabel} into Church Comms`}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-bg disabled:opacity-40"
                  >
                    Import
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {decision && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/25 p-4" role="dialog" aria-modal="true" aria-labelledby="import-decision-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="import-decision-title" className="text-lg font-extrabold text-ink">
              {decision.kind === "import" ? "Import into Church Comms?" : "Skip these calendar items?"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {decision.kind === "import"
                ? `${decision.keys.length} selected ${decision.keys.length === 1 ? "event will be created as a submitted event" : "events will be created as submitted events"} with an intake checklist.`
                : `${decision.keys.length} selected ${decision.keys.length === 1 ? "item" : "items"} will leave this inbox. The source Google Calendar will not be changed.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDecision(null)} className="rounded-full border px-4 py-2 text-sm font-semibold text-muted">
                Cancel
              </button>
              <button type="button" onClick={act} className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${decision.kind === "import" ? "bg-ink" : "bg-rose-600"}`}>
                {decision.kind === "import" ? `Import ${decision.keys.length}` : `Skip ${decision.keys.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
