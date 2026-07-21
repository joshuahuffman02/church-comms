"use client";
import { useState, useTransition } from "react";
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
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove this scheduled ${channelName} item?`)) {
            setError(null);
            startTransition(async () => {
              try {
                await removeDeliverable(id);
              } catch {
                setError("Could not remove");
              }
            });
          }
        }}
        className="min-h-11 rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
        title={`Remove this ${channelName} item`}
        aria-label={`Remove this ${channelName} item`}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && <span role="alert" className="block text-[11px] text-rose-700">{error}</span>}
    </div>
  );
}
