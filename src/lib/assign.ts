// src/lib/assign.ts
import { subDays, atMidnight } from "@/lib/engine/dates";
import { tierLabel } from "@/lib/labels";

export type AssignEvent = { id: string; title: string; eventStartMs: number; tier: number; noPromo: boolean };
export type AssignDeliverable = { id: string; requestId: string; channelId: string; status: string; publishMs: number | null };
export type AssignChannel = { id: string; key: string; name: string; color: string };
export type EventCard = { id: string; title: string; eventStartMs: number; tierLabel: string };
export type Placement = { deliverableId: string; requestId: string; title: string; eventStartMs: number; publishMs: number | null };

export type AssignSchedule = {
  id: string;
  requestId: string;
  channelId: string;
  status: string;
  publishDatesMs: number[];
};

export type ProtectedPlacement = {
  requestId: string;
  channelId: string;
  scheduledAtMs: number;
  kind: "locked" | "featured";
};

export type ChannelAssignment = {
  channelId: string;
  deliverableIds: string[];
  futureDatesMs: number[];
  pastDatesMs: number[];
  duplicateDatesMs: number[];
  undatedCount: number;
  lockedDatesMs: number[];
  featuredDatesMs: number[];
  needsAttention: boolean;
};

export type AssignmentEvent = {
  id: string;
  title: string;
  eventStartMs: number;
  tierLabel: string;
  assignments: ChannelAssignment[];
  futureChannelCount: number;
  futureAppearanceCount: number;
  needsChannel: boolean;
  needsAttention: boolean;
};

export type AssignmentOverview = {
  events: AssignmentEvent[];
  summary: {
    upcomingCount: number;
    attentionEventCount: number;
    needsChannelCount: number;
    pastOnlyCount: number;
    duplicateCount: number;
    futureAppearanceCount: number;
    lockedCount: number;
    featuredCount: number;
  };
};

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

/**
 * Build the event-first Assign view. A channel only counts as current when it
 * has a non-skipped appearance today or later. Old deliverables remain visible
 * as cleanup work instead of quietly making an event look assigned.
 */
export function buildAssignmentOverview(
  events: AssignEvent[],
  schedules: AssignSchedule[],
  channels: AssignChannel[],
  protectedPlacements: ProtectedPlacement[],
  todayMs: number,
): AssignmentOverview {
  const promotable = events
    .filter((event) => !event.noPromo)
    .slice()
    .sort((a, b) => a.eventStartMs - b.eventStartMs || a.title.localeCompare(b.title));
  const channelIds = new Set(channels.map((channel) => channel.id));
  const schedulesByEvent = new Map<string, AssignSchedule[]>();
  for (const schedule of schedules) {
    if (schedule.status === "skipped" || !channelIds.has(schedule.channelId)) continue;
    const current = schedulesByEvent.get(schedule.requestId) ?? [];
    current.push(schedule);
    schedulesByEvent.set(schedule.requestId, current);
  }

  const protectedByPair = new Map<string, ProtectedPlacement[]>();
  for (const placement of protectedPlacements) {
    const key = `${placement.requestId}:${placement.channelId}`;
    const current = protectedByPair.get(key) ?? [];
    current.push(placement);
    protectedByPair.set(key, current);
  }

  const overviewEvents: AssignmentEvent[] = promotable.map((event) => {
    const byChannel = new Map<string, AssignSchedule[]>();
    for (const schedule of schedulesByEvent.get(event.id) ?? []) {
      const current = byChannel.get(schedule.channelId) ?? [];
      current.push(schedule);
      byChannel.set(schedule.channelId, current);
    }

    const assignments = channels.flatMap((channel): ChannelAssignment[] => {
      const channelSchedules = byChannel.get(channel.id) ?? [];
      const protectedForPair = protectedByPair.get(`${event.id}:${channel.id}`) ?? [];
      if (channelSchedules.length === 0 && protectedForPair.length === 0) return [];

      const dates = channelSchedules.flatMap((schedule) => schedule.publishDatesMs).sort((a, b) => a - b);
      const dateCounts = new Map<number, number>();
      for (const date of dates) dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
      const duplicateDatesMs = [...dateCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([date]) => date)
        .sort((a, b) => a - b);
      const undatedCount = channelSchedules.filter((schedule) => schedule.publishDatesMs.length === 0).length;
      const lockedDatesMs = [...new Set(protectedForPair
        .filter((placement) => placement.kind === "locked" && placement.scheduledAtMs >= todayMs)
        .map((placement) => placement.scheduledAtMs))].sort((a, b) => a - b);
      const featuredDatesMs = [...new Set(protectedForPair
        .filter((placement) => placement.kind === "featured" && placement.scheduledAtMs >= todayMs)
        .map((placement) => placement.scheduledAtMs))].sort((a, b) => a - b);
      // A lock or featured pick is intentional schedule data even if a rebuild
      // has not yet recreated its Deliverable/Touch. Include it once here so
      // protected work never looks unassigned or invites an accidental add.
      const uniqueDates = [...new Set([...dateCounts.keys(), ...lockedDatesMs, ...featuredDatesMs])].sort((a, b) => a - b);
      const futureDatesMs = uniqueDates.filter((date) => date >= todayMs);
      const pastDatesMs = uniqueDates.filter((date) => date < todayMs);
      return [{
        channelId: channel.id,
        deliverableIds: channelSchedules.map((schedule) => schedule.id),
        futureDatesMs,
        pastDatesMs,
        duplicateDatesMs,
        undatedCount,
        lockedDatesMs,
        featuredDatesMs,
        needsAttention: futureDatesMs.length === 0 || duplicateDatesMs.length > 0 || undatedCount > 0,
      }];
    });
    const futureChannelCount = assignments.filter((assignment) => assignment.futureDatesMs.length > 0).length;
    const futureAppearanceCount = assignments.reduce((total, assignment) => total + assignment.futureDatesMs.length, 0);
    const needsChannel = futureChannelCount === 0;
    return {
      id: event.id,
      title: event.title,
      eventStartMs: event.eventStartMs,
      tierLabel: tierLabel(event.tier),
      assignments,
      futureChannelCount,
      futureAppearanceCount,
      needsChannel,
      needsAttention: needsChannel || assignments.some((assignment) => assignment.needsAttention),
    };
  });

  const allAssignments = overviewEvents.flatMap((event) => event.assignments);
  return {
    events: overviewEvents,
    summary: {
      upcomingCount: overviewEvents.length,
      attentionEventCount: overviewEvents.filter((event) => event.needsAttention).length,
      needsChannelCount: overviewEvents.filter((event) => event.needsChannel).length,
      pastOnlyCount: allAssignments.filter((assignment) => assignment.pastDatesMs.length > 0 && assignment.futureDatesMs.length === 0).length,
      duplicateCount: allAssignments.reduce((total, assignment) => total + assignment.duplicateDatesMs.length, 0),
      futureAppearanceCount: overviewEvents.reduce((total, event) => total + event.futureAppearanceCount, 0),
      lockedCount: allAssignments.reduce((total, assignment) => total + assignment.lockedDatesMs.length, 0),
      featuredCount: allAssignments.reduce((total, assignment) => total + assignment.featuredDatesMs.length, 0),
    },
  };
}
