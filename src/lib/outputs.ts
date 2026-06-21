import { db } from "@/lib/db";
import { weekRange } from "@/lib/week";
import { addDays } from "@/lib/engine/dates";
import { effectiveEventCap, splitByWeeklyCap, type RankableEvent } from "@/lib/social-curation";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

export const DEFAULT_OUTPUT_UPCOMING_WEEKS = 16;

type ScheduledOutputItem = { scheduledAt: Date };

export type OutputWeekGroup<T extends ScheduledOutputItem> = {
  sunday: Date;
  items: T[];
};

// Shared include shape: a touch carries its channel and its deliverable's
// request (+ all ministries, ordered) so callers can render the event
// title/link, the full ministry set, and deliverable status without extra
// queries.
const touchInclude = {
  channel: true,
  deliverable: {
    include: {
      request: {
        include: { ministries: { orderBy: { sortOrder: "asc" } } },
      },
    },
  },
} as const;

export type OutputTouch = Awaited<
  ReturnType<typeof touchesThisWeekForChannel>
>[number];

/**
 * Touches scheduled on `channelId` during the current church-local week
 * (Mon..Sun of `today`). Uses a half-open upper bound — `addDays(weekEnd, 1)` —
 * so the whole of Sunday is included regardless of stored time-of-day.
 */
export function touchesThisWeekForChannel(channelId: string, today: Date) {
  const { start, end } = weekRange(today);
  return db.touch.findMany({
    where: {
      channelId,
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: { gte: start, lt: addDays(end, 1) },
    },
    include: touchInclude,
    orderBy: [
      { scheduledAt: "asc" },
      { deliverable: { request: { tier: "asc" } } },
      { deliverable: { request: { eventStart: "asc" } } },
      { deliverable: { request: { title: "asc" } } },
    ],
  });
}

/** Upcoming output preview window: starts after this week and spans `weeks`. */
export function outputUpcomingRange(today: Date, weeks = DEFAULT_OUTPUT_UPCOMING_WEEKS) {
  const { start, end } = weekRange(today);
  return {
    start: addDays(end, 1),
    end: addDays(start, 7 * weeks + 7),
  };
}

/**
 * Touches scheduled on `channelId` after this week through the upcoming preview
 * window. Useful for the "coming up" list below the live-this-week list.
 */
export function upcomingTouchesForChannel(
  channelId: string,
  today: Date,
  weeks = DEFAULT_OUTPUT_UPCOMING_WEEKS
) {
  const range = outputUpcomingRange(today, weeks);
  return db.touch.findMany({
    where: {
      channelId,
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: {
        gte: range.start,
        lt: range.end,
      },
    },
    include: touchInclude,
    orderBy: [
      { scheduledAt: "asc" },
      { deliverable: { request: { tier: "asc" } } },
      { deliverable: { request: { eventStart: "asc" } } },
      { deliverable: { request: { title: "asc" } } },
    ],
  });
}

export function upcomingTouchesForActiveChannels(
  today: Date,
  weeks = DEFAULT_OUTPUT_UPCOMING_WEEKS
) {
  const range = outputUpcomingRange(today, weeks);
  return db.touch.findMany({
    where: {
      channel: { active: true },
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: {
        gte: range.start,
        lt: range.end,
      },
    },
    include: touchInclude,
    orderBy: { scheduledAt: "asc" },
  });
}

export function groupOutputTouchesBySunday<T extends ScheduledOutputItem>(
  touches: readonly T[]
): OutputWeekGroup<T>[] {
  const groups = new Map<string, OutputWeekGroup<T>>();
  for (const touch of touches) {
    const sunday = weekRange(touch.scheduledAt).end;
    const key = localDateKey(sunday);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(touch);
    } else {
      groups.set(key, { sunday, items: [touch] });
    }
  }
  return [...groups.values()].sort((a, b) => a.sunday.getTime() - b.sunday.getTime());
}

function localDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The rankable event behind an output touch (for the weekly cap/curation). */
function touchEventOf(t: OutputTouch): RankableEvent {
  const r = t.deliverable.request;
  return {
    requestId: r.id,
    tier: r.tier,
    eventStartMs: r.eventStart.getTime(),
    title: r.title,
  };
}

export type CuratedWeek = {
  /** Touches of the events that make this week's cap (or all, when uncapped). */
  live: OutputTouch[];
  /** Touches of events over the cap — shown muted, not counted as live. */
  held: OutputTouch[];
  /** Distinct LIVE events this week (≤ cap when capped). */
  liveEventCount: number;
  /** The channel's weekly event cap, or null when uncapped. */
  cap: number | null;
};

type CuratableChannel = {
  id: string;
  type: string;
  capacity: number | null;
  frequencyCap: number | null;
};

export type CuratedOutputWeekGroup<T extends ScheduledOutputItem> = OutputWeekGroup<T> & {
  /** Touches over this channel's cap for the week. */
  held: T[];
  /** Distinct live events in this week. */
  liveEventCount: number;
  /** Effective event cap for this channel, or null when uncapped. */
  cap: number | null;
};

function distinctRequestCount(touches: readonly OutputTouch[]) {
  return new Set(touches.map((t) => t.deliverable.request.id)).size;
}

export function groupCuratedOutputTouchesBySunday(
  touches: readonly OutputTouch[],
  channel: Pick<CuratableChannel, "type" | "capacity" | "frequencyCap">,
): CuratedOutputWeekGroup<OutputTouch>[] {
  const cap = effectiveEventCap(channel);
  return groupOutputTouchesBySunday(touches).map((group) => {
    const { live, held } = splitByWeeklyCap(group.items, touchEventOf, cap);
    return {
      ...group,
      items: live,
      held,
      liveEventCount: distinctRequestCount(live),
      cap,
    };
  });
}

/**
 * This week's touches for a channel, split by its weekly cap. For a capped
 * channel (e.g. Facebook/Instagram with a `frequencyCap`) only the top-cap
 * events by importance are `live`; the rest are `held`. For an uncapped channel
 * everything is live and `held` is empty — so existing channels are unchanged.
 */
export async function curatedTouchesThisWeekForChannel(
  channel: CuratableChannel,
  today: Date
): Promise<CuratedWeek> {
  const touches = await touchesThisWeekForChannel(channel.id, today);
  const cap = effectiveEventCap(channel);
  const { live, held } = splitByWeeklyCap(touches, touchEventOf, cap);
  const liveEventCount = distinctRequestCount(live);
  return { live, held, liveEventCount, cap };
}

export type ChannelWithCount = {
  id: string;
  key: string;
  name: string;
  type: string;
  color: string;
  count: number;
  /** True when `count` reflects a weekly cap (live events), not raw touches. */
  capped: boolean;
};

/**
 * Active channels (by sortOrder) each annotated with how many are "live" on them
 * this week. Capped channels (a `frequencyCap`) report their LIVE event count
 * (≤ cap) so the badge matches the curated channel page; uncapped channels keep
 * reporting raw touch counts. One touch query, tallied in memory.
 */
export async function channelsWithWeekCounts(
  today: Date
): Promise<ChannelWithCount[]> {
  const { start, end } = weekRange(today);
  const channels = await db.channel.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      type: true,
      color: true,
      capacity: true,
      frequencyCap: true,
    },
  });
  const touches = await db.touch.findMany({
    where: {
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: { gte: start, lt: addDays(end, 1) },
    },
    select: { channelId: true, deliverable: { select: { requestId: true } } },
  });
  // Per channel: total touches AND distinct events (for capped channels).
  const tally = new Map<string, { touches: number; events: Set<string> }>();
  for (const t of touches) {
    let e = tally.get(t.channelId);
    if (!e) {
      e = { touches: 0, events: new Set() };
      tally.set(t.channelId, e);
    }
    e.touches += 1;
    e.events.add(t.deliverable.requestId);
  }
  return channels.map((c) => {
    const e = tally.get(c.id);
    const cap = effectiveEventCap(c);
    const capped = cap != null;
    const count = capped
      ? Math.min(e ? e.events.size : 0, cap as number)
      : e
        ? e.touches
        : 0;
    return {
      id: c.id,
      key: c.key,
      name: c.name,
      type: c.type,
      color: c.color,
      count,
      capped,
    };
  });
}
