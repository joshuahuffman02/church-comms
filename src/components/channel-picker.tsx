"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { assignChannel } from "@/actions/assign";
import { removeChannelFromRequest } from "@/actions/events";

export type PickerChannel = { id: string; name: string; color: string };
export type PickerPlacement = { channelId: string; deliverableId: string; publishMs: number | null };

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function initialPlacements(placements: PickerPlacement[]): Record<string, PickerPlacement | undefined> {
  const out: Record<string, PickerPlacement | undefined> = {};
  for (const placement of placements) {
    const current = out[placement.channelId];
    if (!current || (placement.publishMs != null && (current.publishMs == null || placement.publishMs < current.publishMs))) {
      out[placement.channelId] = placement;
    }
  }
  return out;
}

export function ChannelPicker({ channels, placements, requestId, canEdit }: {
  channels: PickerChannel[];
  placements: PickerPlacement[];
  requestId: string;
  canEdit: boolean;
}) {
  const [onMap, setOnMap] = useState<Record<string, PickerPlacement | undefined>>(
    () => initialPlacements(placements),
  );
  const [busyChannelId, setBusyChannelId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const active = useMemo(() => channels.filter((channel) => onMap[channel.id]), [channels, onMap]);
  const available = useMemo(() => channels.filter((channel) => !onMap[channel.id]), [channels, onMap]);

  function add(channel: PickerChannel) {
    if (!canEdit || pending) return;
    setBusyChannelId(channel.id);
    setMessage(null);
    start(async () => {
      try {
        const id = await assignChannel(requestId, channel.id);
        if (!id) throw new Error("The channel could not be scheduled.");
        setOnMap((current) => ({
          ...current,
          [channel.id]: { channelId: channel.id, deliverableId: id, publishMs: null },
        }));
        setMessage({ kind: "success", text: `${channel.name} was added.` });
      } catch (error) {
        setMessage({
          kind: "error",
          text: error instanceof Error ? error.message : `Could not add ${channel.name}.`,
        });
      } finally {
        setBusyChannelId(null);
      }
    });
  }

  function remove(channel: PickerChannel) {
    if (!canEdit || pending) return;
    if (!window.confirm(`Remove this event from ${channel.name}? This removes every scheduled appearance on that channel.`)) {
      return;
    }
    setBusyChannelId(channel.id);
    setMessage(null);
    start(async () => {
      try {
        await removeChannelFromRequest(requestId, channel.id);
        setOnMap((current) => ({ ...current, [channel.id]: undefined }));
        setMessage({ kind: "success", text: `${channel.name} was removed.` });
      } catch (error) {
        setMessage({
          kind: "error",
          text: error instanceof Error ? error.message : `Could not remove ${channel.name}.`,
        });
      } finally {
        setBusyChannelId(null);
      }
    });
  }

  return (
    <section className="card-float mb-4 p-5" aria-labelledby="event-channels-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="event-channels-heading" className="font-bold">Channels</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Add or remove the event from a channel here. Removing a channel clears every date on it.
          </p>
        </div>
        {canEdit && (
          <Link
            href={`/requests/${requestId}/attach`}
            className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-bg"
          >
            Add on a specific date →
          </Link>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        {active.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted">No channels are scheduled yet.</p>
        ) : active.map((channel) => {
          const placement = onMap[channel.id];
          const busy = pending && busyChannelId === channel.id;
          return (
            <div key={channel.id} className="flex min-h-14 flex-wrap items-center gap-3 rounded-2xl border border-slate-200 px-4 py-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: channel.color }} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">{channel.name.replace(/\s*\(Top 3\)$/i, "")}</div>
                <div className="text-xs text-muted">
                  {placement?.publishMs ? `First appearance ${fmt(placement.publishMs)}` : "Scheduled automatically"}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(channel)}
                  className="inline-flex min-h-11 items-center rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && available.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-ink">Add another channel</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {available.map((channel) => {
              const busy = pending && busyChannelId === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  disabled={pending}
                  onClick={() => add(channel)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sky-bg disabled:opacity-50"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: channel.color }} />
                  {busy ? "Adding…" : `+ Add ${channel.name.replace(/\s*\(Top 3\)$/i, "")}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-3 text-sm font-semibold ${message.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
