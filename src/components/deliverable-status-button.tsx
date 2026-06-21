"use client";
import { useTransition } from "react";
import { setDeliverableStatus } from "@/actions/request-status";
import { DELIVERABLE_STATUSES, DELIVERABLE_STATUS_META } from "@/lib/status";

/**
 * A single status picker: the pill shows the CURRENT status (color-coded);
 * open it to choose a new one. No surprise auto-advance.
 */
export function DeliverableStatusButton({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };

  return (
    <select
      aria-label="Change status"
      title="Change status"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        if (v && v !== status) start(() => setDeliverableStatus(id, v));
      }}
      className="rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer disabled:opacity-50 transition"
      style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}66` }}
    >
      {DELIVERABLE_STATUSES.map((s) => (
        <option key={s} value={s} style={{ color: "#334155", background: "#fff" }}>
          {DELIVERABLE_STATUS_META[s]?.label ?? s}
        </option>
      ))}
    </select>
  );
}
