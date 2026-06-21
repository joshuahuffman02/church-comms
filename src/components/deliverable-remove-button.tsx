"use client";
import { useTransition } from "react";
import { removeDeliverable } from "@/actions/events";

/** Removes one deliverable (this event off one output) after confirmation. */
export function DeliverableRemoveButton({
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
        if (window.confirm(`Remove this from ${channelName} for this event?`)) {
          startTransition(() => removeDeliverable(id));
        }
      }}
      className="rounded-full border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 transition disabled:opacity-40"
      title={`Remove from ${channelName}`}
      aria-label={`Remove from ${channelName}`}
    >
      ✕
    </button>
  );
}
