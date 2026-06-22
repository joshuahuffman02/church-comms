"use client";
import { useState, useTransition } from "react";
import { assignChannel } from "@/actions/assign";
import { removeDeliverable } from "@/actions/events";

export type PickerChannel = { id: string; name: string; color: string };
export type PickerPlacement = { channelId: string; deliverableId: string; publishMs: number | null };

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ChannelPicker({ channels, placements, requestId, canEdit }: {
  channels: PickerChannel[]; placements: PickerPlacement[]; requestId: string; canEdit: boolean;
}) {
  const [onMap, setOnMap] = useState<Record<string, PickerPlacement | undefined>>(
    Object.fromEntries(placements.map((p) => [p.channelId, p])),
  );
  const [, start] = useTransition();

  function toggle(channelId: string) {
    if (!canEdit) return;
    const current = onMap[channelId];
    if (current) {
      setOnMap((m) => ({ ...m, [channelId]: undefined }));
      if (!current.deliverableId.startsWith("tmp:")) start(() => removeDeliverable(current.deliverableId));
    } else {
      setOnMap((m) => ({ ...m, [channelId]: { channelId, deliverableId: `tmp:${channelId}`, publishMs: null } }));
      start(async () => {
        const realId = await assignChannel(requestId, channelId);
        if (realId) {
          setOnMap((m) => {
            const cur = m[channelId];
            if (!cur) return m;
            return { ...m, [channelId]: { ...cur, deliverableId: realId } };
          });
        }
      });
    }
  }

  return (
    <div className="card-float mb-4 p-5">
      <h2 className="font-bold mb-1">Where it&apos;s going</h2>
      <p className="text-muted mb-3 text-xs">{canEdit ? "Tap a channel to add it; tap ✕ to take it off." : "The channels this event appears on."}</p>
      <div className="flex flex-wrap gap-2">
        {channels.map((ch) => {
          const on = onMap[ch.id];
          return (
            <button key={ch.id} type="button" disabled={!canEdit} onClick={() => toggle(ch.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${on ? "text-white" : "border border-slate-200 text-ink/70 hover:bg-sky-bg"} disabled:opacity-60`}
              style={on ? { background: ch.color } : undefined}>
              <span>{ch.name}</span>
              {on?.publishMs && <span className="opacity-90">· {fmt(on.publishMs)}</span>}
              {on && canEdit && <span aria-hidden>✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
