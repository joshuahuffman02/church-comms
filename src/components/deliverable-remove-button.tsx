"use client";
import { useState, useTransition } from "react";
import { removeDeliverable } from "@/actions/events";

/** Removes one deliverable (this event off one output) after confirmation. */
export function DeliverableRemoveButton({
  id,
  channelName,
  workLabel,
}: {
  id: string;
  channelName: string;
  workLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm(
            `Remove the ${workLabel} from ${channelName}?\n\nThis removes the channel and all of its scheduled appearances from the event. If you only do not need this one piece, choose “Skip this piece” in its status instead.`,
          )) {
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
        className="min-h-11 rounded-full px-2 py-2 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
        title={`Remove ${channelName} from this event entirely`}
        aria-label={`Remove ${channelName} from this event entirely`}
      >
        {pending ? "Removing…" : "Remove channel"}
      </button>
      {error && <span role="alert" className="block text-[11px] text-rose-700">{error}</span>}
    </div>
  );
}
