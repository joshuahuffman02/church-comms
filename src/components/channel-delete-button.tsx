"use client";
import { useTransition } from "react";
import { deleteChannel } from "@/actions/channels";

/**
 * Subtle per-row Delete for a channel. Server-action forms can't easily run
 * window.confirm, so this is a tiny client button that confirms first, then
 * fires the action inside a transition.
 */
export function ChannelDeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Delete this channel and all its scheduled items?")) {
          startTransition(() => deleteChannel(id));
        }
      }}
      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 transition disabled:opacity-40"
      title="Delete this channel and everything scheduled on it"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
