"use client";
import { useTransition } from "react";
import { cancelEvent, deleteEvent } from "@/actions/events";

/** Event-level destructive controls: cancel (keeps the record) or delete. */
export function EventActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const isCancelled = status === "cancelled";

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending || isCancelled}
        onClick={() => {
          if (window.confirm("Cancel this event? Its scheduled items will be removed.")) {
            startTransition(() => cancelEvent(id));
          }
        }}
        className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition disabled:opacity-40"
        title={isCancelled ? "Already cancelled" : "Cancel event"}
      >
        {isCancelled ? "Cancelled" : "Cancel event"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm("Permanently delete this event? This cannot be undone.")) {
            startTransition(() => deleteEvent(id));
          }
        }}
        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
        title="Permanently delete event"
      >
        Delete
      </button>
      {pending && <span className="text-xs text-muted">Saving…</span>}
    </div>
  );
}
