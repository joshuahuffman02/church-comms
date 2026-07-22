"use client";
import { useState } from "react";
import { ChannelRow, type ChannelView } from "@/components/channel-row";

export function ChannelList({
  channels, exampleEventKey, exampleEventLabel,
}: {
  channels: ChannelView[];
  exampleEventKey: string;
  exampleEventLabel: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const activeChannels = channels.filter((channel) => channel.active);
  const pausedChannels = channels.filter((channel) => !channel.active);

  const renderChannel = (channel: ChannelView) => (
    <ChannelRow
      key={channel.id}
      channel={channel}
      exampleEventKey={exampleEventKey}
      exampleEventLabel={exampleEventLabel}
      open={openId === channel.id}
      onToggle={() => setOpenId((id) => (id === channel.id ? null : channel.id))}
    />
  );

  return (
    <div className="grid gap-7">
      <section aria-labelledby="active-channels-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">In the live workflow</p>
            <h2 id="active-channels-heading" className="mt-0.5 text-xl font-extrabold text-ink">Active channels</h2>
            <p className="mt-1 text-sm text-muted">These appear in Channel Plan, weekly handoffs, and scheduling.</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{activeChannels.length} active</span>
        </div>
        <div className="grid gap-3">{activeChannels.map(renderChannel)}</div>
      </section>

      <section aria-labelledby="paused-channels-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kept for later</p>
            <h2 id="paused-channels-heading" className="mt-0.5 text-xl font-extrabold text-ink">Paused channels</h2>
            <p className="mt-1 text-sm text-muted">Their rules are saved, but they do not create new scheduled work.</p>
          </div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">{pausedChannels.length} paused</span>
        </div>
        <div className="grid gap-3">{pausedChannels.map(renderChannel)}</div>
      </section>
    </div>
  );
}
