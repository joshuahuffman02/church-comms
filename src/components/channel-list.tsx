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
  return (
    <div>
      {channels.map((c) => (
        <ChannelRow
          key={c.id}
          channel={c}
          exampleEventKey={exampleEventKey}
          exampleEventLabel={exampleEventLabel}
          open={openId === c.id}
          onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
        />
      ))}
    </div>
  );
}
