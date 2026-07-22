"use client";
import { useTransition } from "react";
import { setRequestStatus } from "@/actions/request-status";
import { cancelEvent } from "@/actions/events";
import {
  REQUEST_STATUSES,
  REQUEST_SIDE_STATUSES,
  REQUEST_STATUS_META,
} from "@/lib/status";

/**
 * Single status picker for a request: shows the current status (color-coded);
 * open it to move the event to any stage. No surprise auto-advance.
 */
export function StatusActions({ id, status, eventTitle }: { id: string; status: string; eventTitle: string }) {
  const [pending, start] = useTransition();
  const meta = REQUEST_STATUS_META[status] ?? { label: status, color: "#94a3b8" };

  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted">
      Status:
      <select
        aria-label="Change event status"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (!v || v === status) return;
          if (v === "cancelled") {
            if (!window.confirm(
              `Cancel ${eventTitle}?\n\nThis cancels the whole event and removes all of its scheduled channel appearances. To stop only one output, use “Skip this piece” on that piece instead.`,
            )) return;
            start(() => cancelEvent(id));
            return;
          }
          start(() => setRequestStatus(id, v));
        }}
        className="rounded-full border px-4 py-1.5 text-sm font-semibold cursor-pointer disabled:opacity-50 transition"
        style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}66` }}
      >
        {[...REQUEST_STATUSES, ...REQUEST_SIDE_STATUSES].map((s) => (
          <option key={s} value={s} style={{ color: "#334155", background: "#fff" }}>
            {s === "cancelled" && status !== "cancelled"
              ? "Cancel event…"
              : REQUEST_STATUS_META[s]?.label ?? s}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs">Saving…</span>}
    </label>
  );
}
