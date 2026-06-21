"use client";
import { useTransition } from "react";
import { replanEvent } from "@/actions/edit-event";

/**
 * Re-plan an event's schedule from its current date/tier. Confirms first
 * because it discards the existing deliverables/touches and rebuilds them.
 */
export function ReplanButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (window.confirm("Re-plan this event's schedule from its current date and tier? Existing scheduled items will be rebuilt.")) {
          startTransition(() => replanEvent(id));
        }
      }}
      className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition disabled:opacity-40"
      title="Rebuild the schedule from the current date and tier"
    >
      {pending ? "Re-planning…" : "Re-plan schedule"}
    </button>
  );
}
