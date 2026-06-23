"use client";
import { useState } from "react";
import { ChannelRow, type ChannelView } from "@/components/channel-row";

export function ChannelList({ channels, exampleEventKey }: { channels: ChannelView[]; exampleEventKey: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div>
      {channels.map((c) => (
        <ChannelRow
          key={c.id}
          channel={c}
          exampleEventKey={exampleEventKey}
          open={openId === c.id}
          onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
        />
      ))}
    </div>
  );
}
