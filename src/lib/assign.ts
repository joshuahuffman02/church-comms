// src/lib/assign.ts
import { subDays, atMidnight } from "@/lib/engine/dates";
import { tierLabel } from "@/lib/labels";

export type AssignEvent = { id: string; title: string; eventStartMs: number; tier: number; noPromo: boolean };
export type AssignDeliverable = { id: string; requestId: string; channelId: string; status: string; publishMs: number | null };
export type AssignChannel = { id: string; key: string; name: string; color: string };
export type EventCard = { id: string; title: string; eventStartMs: number; tierLabel: string };
export type Placement = { deliverableId: string; requestId: string; title: string; eventStartMs: number; publishMs: number | null };

/** Channel's normal publish date for an event: eventStart − offset, at midnight. */
export function defaultPublishDate(eventStart: Date, offsetDays: number): Date {
  return atMidnight(subDays(atMidnight(eventStart), offsetDays));
}

/** True when the event is NOT already on this channel (no non-skipped deliverable). */
export function canAssign(deliverables: AssignDeliverable[], requestId: string, channelId: string): boolean {
  return !deliverables.some(
    (d) => d.requestId === requestId && d.channelId === channelId && d.status !== "skipped",
  );
}

/** Map events + deliverables + channels into the board's columns. noPromo events
 * are excluded entirely; skipped deliverables are ignored. */
export function buildBoardModel(
  events: AssignEvent[],
  deliverables: AssignDeliverable[],
  channels: AssignChannel[],
): { allEvents: EventCard[]; byChannel: Record<string, Placement[]> } {
  const promotable = events.filter((e) => !e.noPromo);
  const eventById = new Map(promotable.map((e) => [e.id, e]));

  const allEvents: EventCard[] = promotable
    .slice()
    .sort((a, b) => a.eventStartMs - b.eventStartMs)
    .map((e) => ({ id: e.id, title: e.title, eventStartMs: e.eventStartMs, tierLabel: tierLabel(e.tier) }));

  const byChannel: Record<string, Placement[]> = {};
  for (const ch of channels) byChannel[ch.id] = [];
  for (const d of deliverables) {
    if (d.status === "skipped") continue;
    const ev = eventById.get(d.requestId); // skips noPromo + unknown events
    if (!ev || !byChannel[d.channelId]) continue;
    byChannel[d.channelId].push({
      deliverableId: d.id,
      requestId: ev.id,
      title: ev.title,
      eventStartMs: ev.eventStartMs,
      publishMs: d.publishMs,
    });
  }
  for (const id of Object.keys(byChannel)) {
    byChannel[id].sort((a, b) => (a.publishMs ?? a.eventStartMs) - (b.publishMs ?? b.eventStartMs));
  }
  return { allEvents, byChannel };
}
