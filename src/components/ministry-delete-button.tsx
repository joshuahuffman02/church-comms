"use client";
import { useTransition } from "react";
import { deleteMinistry } from "@/actions/ministries";

/**
 * Subtle per-row Delete for a ministry. A ministry that's in use is deactivated
 * server-side rather than deleted (events keep their dot), so the confirm copy
 * reflects that. Server-action forms can't run window.confirm, hence this tiny
 * client button that confirms first then fires the action in a transition.
 */
export function MinistryDeleteButton({ id, inUse }: { id: string; inUse: boolean }) {
  const [pending, startTransition] = useTransition();
  const msg = inUse
    ? "This ministry is used by events. It will be DEACTIVATED (hidden from new pickers) rather than deleted. Continue?"
    : "Delete this ministry?";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(msg)) {
          startTransition(() => deleteMinistry(id));
        }
      }}
      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 transition disabled:opacity-40"
      title={inUse ? "Deactivate this ministry (in use)" : "Delete this ministry"}
    >
      {pending ? "…" : inUse ? "Deactivate" : "Delete"}
    </button>
  );
}
