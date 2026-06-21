"use client";
import { useState, useTransition } from "react";
import { regenerate, setSeriesActive, deleteSeries, endSeries } from "@/actions/recurring";

/** "Generate now": extend this series to the default horizon. Shows the count created. */
export function GenerateNowButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const n = await regenerate(id);
            setMsg(n === 0 ? "Up to date" : `+${n} added`);
          })
        }
        className="rounded-full bg-ink text-white px-3 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {pending ? "…" : "Generate now"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

/** Toggle a series active/inactive. Inactive series stop spawning new occurrences. */
export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setSeriesActive(id, !active))}
      className={
        active
          ? "rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition"
          : "rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition"
      }
    >
      {pending ? "…" : active ? "Pause" : "Activate"}
    </button>
  );
}

/**
 * "Mark filled / End" (editor). Ends an open-ended series today and strips its
 * future, not-yet-published occurrences. Past/published ones are kept. Hidden
 * once the series is already ended (inactive) to avoid a no-op.
 */
export function MarkFilledButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            confirm(
              "End this series and remove its future scheduled items? Past ones are kept."
            )
          ) {
            start(async () => {
              const n = await endSeries(id);
              setMsg(n === 0 ? "Ended" : `Ended · ${n} upcoming removed`);
            });
          }
        }}
        className="rounded-full border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50 disabled:opacity-50 transition"
      >
        {pending ? "…" : "Mark filled / End"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

/** Admin-only delete. Occurrences already generated stay as normal events. */
export function DeleteSeriesButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          confirm(
            "Delete this series? Events it already generated stay as normal events — only the template is removed."
          )
        ) {
          start(() => deleteSeries(id));
        }
      }}
      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
