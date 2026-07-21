"use client";
import { useTransition } from "react";
import { removeTouch } from "@/actions/events";

/** Removes one touch (one output, one week) after confirmation. */
export function TouchRemoveButton({
  id,
  channelName,
  eventTitle,
  scheduledAt,
}: {
  id: string;
  channelName: string;
  eventTitle: string;
  scheduledAt: Date;
}) {
  const [pending, startTransition] = useTransition();
  const dateLabel = scheduledAt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const controlLabel = `Remove ${eventTitle} from ${channelName} on ${dateLabel}`;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`${controlLabel}?`)) {
          startTransition(() => removeTouch(id));
        }
      }}
      className="min-h-9 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
      title={controlLabel}
      aria-label={controlLabel}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
