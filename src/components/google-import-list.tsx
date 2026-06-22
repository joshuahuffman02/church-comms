"use client";
import { useState, useTransition } from "react";
import { importGoogleEvents, ignoreGoogleEvents } from "@/actions/google-import";

export type GoogleImportRow = {
  key: string;
  title: string;
  dateLabel: string;
  status: "missing" | "possible_match" | "already_in_system";
  location: string | null;
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

  const fresh = rows.filter((r) => r.status !== "already_in_system" && !done[r.key]);
  const already = rows.filter((r) => r.status === "already_in_system");
  const justActed = rows.filter((r) => done[r.key]);
  const importableKeys = fresh.map((r) => r.key);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-muted text-sm">
          {fresh.length} new event{fresh.length === 1 ? "" : "s"} from Google Calendar
        </span>
        {importableKeys.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(importableKeys, "import")}
            className="btn-primary rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            Import all {importableKeys.length}
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
                  {r.status === "possible_match" && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                      might already exist
                    </span>
                  )}
                </div>
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
          {justActed.filter((r) => done[r.key] === "ignored").length} ignored — they&apos;ll show on This Week with their setup checklist.
        </div>
      )}

      {already.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-muted select-none">
            Already in the system · {already.length}
          </summary>
          <div className="mt-2 card-float divide-y divide-slate-100 overflow-hidden opacity-80">
            {already.map((r) => (
              <div key={r.key} className="px-5 py-2 text-sm">
                <span className="font-semibold">{r.title}</span>
                <span className="text-muted text-xs"> · {r.dateLabel}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
