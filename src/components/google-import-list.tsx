"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { importGoogleEvents, ignoreGoogleEvents } from "@/actions/google-import";

export type GoogleImportRow = {
  key: string;
  title: string;
  dateLabel: string;
  status: "missing" | "possible_match" | "already_in_system";
  location: string | null;
  recommendation: "accept" | "ignore" | "review";
  recommendationReason: string | null;
  match: {
    requestId: string;
    title: string;
    dateLabel: string;
    reason: string;
    confidence: "exact" | "strong" | "possible" | null;
    score: number | null;
  } | null;
};

const recommendationLabel: Record<GoogleImportRow["recommendation"], string> = {
  accept: "Suggested accept",
  ignore: "Suggested ignore",
  review: "Needs review",
};

const recommendationClass: Record<GoogleImportRow["recommendation"], string> = {
  accept: "bg-emerald-100 text-emerald-700",
  ignore: "bg-slate-100 text-slate-700",
  review: "bg-amber-100 text-amber-700",
};

export function GoogleImportList({ rows }: { rows: GoogleImportRow[] }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Record<string, "imported" | "ignored">>({});

  const act = (keys: string[], kind: "import" | "ignore") =>
    start(async () => {
      if (kind === "import") await importGoogleEvents(keys);
      else await ignoreGoogleEvents(keys);
      setDone((d) => ({
        ...d,
        ...Object.fromEntries(keys.map((k) => [k, kind === "import" ? "imported" : "ignored"] as const)),
      }));
    });

  const fresh = rows.filter((r) => !done[r.key]);
  const justActed = rows.filter((r) => done[r.key]);
  const suggestedAcceptKeys = fresh.filter((r) => r.recommendation === "accept").map((r) => r.key);
  const suggestedIgnoreKeys = fresh.filter((r) => r.recommendation === "ignore").map((r) => r.key);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-muted text-sm">
          {fresh.length} new event{fresh.length === 1 ? "" : "s"} from Google Calendar
        </span>
        {suggestedAcceptKeys.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(suggestedAcceptKeys, "import")}
            className="btn-primary rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            Import suggested {suggestedAcceptKeys.length}
          </button>
        )}
        {suggestedIgnoreKeys.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(suggestedIgnoreKeys, "ignore")}
            className="rounded-full border px-4 py-1.5 text-sm font-semibold text-muted hover:bg-slate-50 disabled:opacity-50"
          >
            Ignore suggested {suggestedIgnoreKeys.length}
          </button>
        )}
      </div>

      {fresh.length === 0 ? (
        <div className="card-float p-5 text-muted text-sm">
          Nothing new to bring in — everything on the calendar is already in the system. ✨
        </div>
      ) : (
        <div className="card-float divide-y divide-slate-100 overflow-hidden">
          {fresh.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">{r.title}</div>
                <div className="text-muted text-xs">
                  {r.dateLabel}
                  {r.location ? ` · ${r.location}` : ""}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 font-semibold ${recommendationClass[r.recommendation]}`}
                  >
                    {recommendationLabel[r.recommendation]}
                  </span>
                  {r.status === "possible_match" && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                      might already exist
                    </span>
                  )}
                  {r.status === "already_in_system" && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                      already in Church Comms
                    </span>
                  )}
                </div>
                {r.recommendationReason && (
                  <div className="mt-1 text-xs text-muted">{r.recommendationReason}</div>
                )}
                {r.match && (
                  <div className="mt-2 rounded-lg bg-sky-bg/50 px-3 py-2 text-xs text-muted">
                    <div className="font-bold text-ink">
                      {r.match.confidence === "exact" ? "Existing event match" : "Possible duplicate"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/requests/${r.match.requestId}`} className="font-semibold text-ink underline">
                        {r.match.title}
                      </Link>
                      <span>{r.match.dateLabel}</span>
                      <span>{r.match.reason}</span>
                      {r.match.score != null && <span>score {r.match.score.toFixed(2)}</span>}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act([r.key], "import")}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-bg disabled:opacity-50"
                >
                  Import
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act([r.key], "ignore")}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {justActed.length > 0 && (
        <div className="mt-3 text-xs text-emerald-700">
          {justActed.filter((r) => done[r.key] === "imported").length} imported ·{" "}
          {justActed.filter((r) => done[r.key] === "ignored").length} ignored.
        </div>
      )}

    </div>
  );
}
