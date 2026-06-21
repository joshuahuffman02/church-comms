"use client";
import { useState, useTransition, useRef } from "react";
import { attachChannel } from "@/actions/quick-items";

type ChannelOption = { id: string; name: string };

/**
 * Compact "+ Add output" disclosure for manually attaching a channel/output to
 * an existing event (e.g. the Opportunities Table or an extra Loop week the
 * auto-scheduler skipped). Pick a channel + date and Add — tier eligibility is
 * bypassed server-side.
 */
export function AttachChannel({
  requestId,
  channels,
}: {
  requestId: string;
  channels: ChannelOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition"
      >
        + Add output
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) => startTransition(() => attachChannel(requestId, fd))}
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <div className="grid gap-1">
        <label className="text-xs font-semibold text-muted">Output</label>
        <select
          name="channelId"
          required
          className="rounded-2xl border px-4 py-2 text-sm"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <label className="text-xs font-semibold text-muted">Date</label>
        <input
          name="date"
          type="date"
          required
          className="rounded-2xl border px-4 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          className="rounded-full bg-ink text-white px-5 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
