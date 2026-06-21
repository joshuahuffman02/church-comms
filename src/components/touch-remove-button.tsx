"use client";
import { useTransition } from "react";
import { removeTouch } from "@/actions/events";

/** Removes one touch (one output, one week) after confirmation. */
export function TouchRemoveButton({
  id,
  channelName,
}: {
  id: string;
  channelName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Remove this from ${channelName} for this week?`)) {
          startTransition(() => removeTouch(id));
        }
      }}
      className="rounded-full border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition disabled:opacity-40"
      title={`Remove from ${channelName} this week`}
      aria-label={`Remove from ${channelName} this week`}
    >
      ✕
    </button>
  );
}
