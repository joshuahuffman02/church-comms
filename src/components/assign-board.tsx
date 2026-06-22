"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { assignChannel } from "@/actions/assign";
import { removeDeliverable } from "@/actions/events";
import type { AssignChannel, EventCard, Placement } from "@/lib/assign";

type Model = { allEvents: EventCard[]; byChannel: Record<string, Placement[]> };
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const REMOVE = "__remove__";

function EventChip({ card }: { card: EventCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `evt:${card.id}` });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`card-float mb-2 cursor-grab p-2.5 text-sm active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}>
      <div className="font-semibold">{card.title}</div>
      <div className="text-muted text-xs">{fmt(card.eventStartMs)} · {card.tierLabel}</div>
    </div>
  );
}

function PlacementChip({ p, onRemove }: { p: Placement; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `del:${p.deliverableId}:${p.requestId}` });
  return (
    <div ref={setNodeRef}
      className={`card-float mb-2 flex items-center justify-between gap-2 p-2.5 text-sm ${isDragging ? "opacity-40" : ""}`}>
      <span {...listeners} {...attributes} className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
        <span className="font-semibold">{p.title}</span>
        <span className="text-muted text-xs"> · {p.publishMs ? `on ${fmt(p.publishMs)}` : "no date"}</span>
      </span>
      <button onClick={onRemove} aria-label={`Remove ${p.title}`} className="shrink-0 text-muted hover:text-rose-600">✕</button>
    </div>
  );
}

function Column({ id, title, children, tint }: { id: string; title: string; children: React.ReactNode; tint?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="w-60 shrink-0 rounded-3xl p-2 transition" style={{ background: isOver ? (tint ?? "#93c5fd") + "22" : "transparent" }}>
      <div className="px-2 pb-2 text-sm font-bold">{title}</div>
      {children}
    </div>
  );
}

export function AssignBoard({ channels, model }: { channels: AssignChannel[]; model: Model }) {
  const [data, setData] = useState(model);
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const allEvents = useMemo(
    () => data.allEvents.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase())),
    [data.allEvents, q],
  );
  function add(requestId: string, channelId: string) {
    const card = data.allEvents.find((e) => e.id === requestId);
    if (!card || data.byChannel[channelId]?.some((p) => p.requestId === requestId)) return;
    const optimistic: Placement = { deliverableId: `tmp:${requestId}:${channelId}`, requestId, title: card.title, eventStartMs: card.eventStartMs, publishMs: null };
    setData((d) => ({ ...d, byChannel: { ...d.byChannel, [channelId]: [...(d.byChannel[channelId] ?? []), optimistic] } }));
    start(() => assignChannel(requestId, channelId));
  }
  function remove(channelId: string, deliverableId: string) {
    setData((d) => ({ ...d, byChannel: { ...d.byChannel, [channelId]: d.byChannel[channelId].filter((p) => p.deliverableId !== deliverableId) } }));
    if (!deliverableId.startsWith("tmp:")) start(() => removeDeliverable(deliverableId));
  }

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id ? String(e.over.id) : null;
    const active = String(e.active.id);
    if (!over) return;
    if (active.startsWith("evt:")) {
      if (over === REMOVE || over === "all") return;
      add(active.slice(4), over);
    } else if (active.startsWith("del:")) {
      const [, deliverableId, requestId] = active.split(":");
      const sourceId = Object.keys(data.byChannel).find((cid) => data.byChannel[cid].some((p) => p.deliverableId === deliverableId));
      if (!sourceId) return;
      if (over === REMOVE || over === "all") { remove(sourceId, deliverableId); return; }
      if (over !== sourceId) { add(requestId, over); remove(sourceId, deliverableId); }
    }
  }

  return (
    <DndContext id="assign-board" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-4">
        <Column id="all" title={`All events · ${allEvents.length}`}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" className="mb-2 w-full rounded-full border px-3 py-1.5 text-sm" />
          {allEvents.map((c) => <EventChip key={c.id} card={c} />)}
        </Column>
        {channels.map((ch) => (
          <Column key={ch.id} id={ch.id} title={`${ch.name} · ${data.byChannel[ch.id]?.length ?? 0}`} tint={ch.color}>
            {(data.byChannel[ch.id] ?? []).map((p) => (
              <PlacementChip key={p.deliverableId} p={p} onRemove={() => remove(ch.id, p.deliverableId)} />
            ))}
          </Column>
        ))}
        <Column id={REMOVE} title="🗑️ Remove">
          <div className="text-muted px-2 text-xs">Drag a card here to take it off its channel.</div>
        </Column>
      </div>
      <p className="text-muted text-xs">Drag an event onto a channel to add it (auto-scheduled). Drag a card between channels to move it; ✕ or the Remove column to take it off. <Link href="/this-week" className="underline">This Week</Link> reflects changes.</p>
    </DndContext>
  );
}
