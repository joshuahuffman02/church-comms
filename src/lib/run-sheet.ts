import { db } from "@/lib/db";
import { weekRange, loopChangesForSunday } from "@/lib/week";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { activeUpdateAt, type EventUpdateLite } from "@/lib/updates";
import { effectiveEventCap, splitByWeeklyCap, type RankableEvent } from "@/lib/social-curation";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

// ---------------------------------------------------------------------------
// Weekly printable run-sheet builder.
//
// Rebuilds the front office's old "one column per Sunday" spreadsheet: for ONE
// service week it gathers, per active channel, every touch landing in that
// channel's relevant window, plus the Loop add/remove for that Sunday and the
// events physically happening that week. The page renders this; the builder
// stays a clean data shaper (the per-channel grouping is the only logic with
// tests).
//
// Dates here are church-local-midnight (see engine/dates). Never format with
// `.toISOString()` for display — the page uses local getters / toLocaleDateString.
// ---------------------------------------------------------------------------

/**
 * Channels whose run-sheet line is about a SINGLE Sunday service moment (the
 * pre-service loop, the top-3 announcement video, the live stage announcement).
 * For these we want only the touches landing ON that Sunday — not the whole
 * Mon..Sun week — so the sheet reads like "what's on screen / on stage Sunday".
 * Every other active channel (windowed social/web/bulletin/newsletter and the
 * one_shot app/sms/email blasts) uses the Mon..Sun week containing the Sunday.
 */
const ON_SUNDAY_CHANNEL_KEYS = new Set(["loop", "announcement_video", "stage"]);

/** A ministry name + color, for a colored dot. */
export type MinistryRef = { name: string; color: string };

export type RunSheetItem = {
  /** Touch id — stable key for the rendered checkbox row. */
  touchId: string;
  /** Owning event title. */
  eventTitle: string;
  /** Primary ministry name + color (first of the set), if the event has any. */
  ministry: string | null;
  ministryColor: string | null;
  /** Every ministry this event involves (all equal). */
  ministries: MinistryRef[];
  /**
   * What to actually put out: the touch's per-week `content` if set, otherwise
   * the event's next-step text, otherwise the event title. This is the single
   * "what goes on this channel this week" string the sheet shows.
   */
  detail: string;
  /** Deliverable status (to_design|in_progress|proof|ready|scheduled|published|skipped). */
  status: string;
  /** Whether this specific weekly appearance is checked off (touch published). */
  done: boolean;
  /** The touch's scheduled date (church-local midnight). */
  date: Date;
};

export type RunSheetChannel = {
  channelId: string;
  key: string;
  name: string;
  color: string;
  type: string;
  /** True when this channel's window is just the single Sunday, not Mon..Sun. */
  onSundayOnly: boolean;
  items: RunSheetItem[];
};

export type RunSheetLoopChange = {
  touchId: string;
  title: string;
  ministry: string | null;
  done: boolean;
};

export type RunSheetEvent = {
  requestId: string;
  title: string;
  ministry: string | null;
  ministryColor: string | null;
  /** Every ministry this event involves (all equal). */
  ministries: MinistryRef[];
  /** Event start (church-local midnight) and optional location. */
  start: Date;
  location: string | null;
  /**
   * The message-arc phase active as of this sheet's Sunday (latest phase whose
   * scheduledFor ≤ Sunday), if the event has an arc that has started. Lets the
   * run sheet reflect the current message for the event.
   */
  activePhase?: { title: string; body: string | null };
};

/** One message-arc update landing in the sheet's Mon..Sun week. */
export type RunSheetUpdate = {
  /** EventUpdate id — stable key + target for the done toggle. */
  id: string;
  requestId: string;
  eventTitle: string;
  title: string;
  kind: string | null;
  body: string | null;
  scheduledFor: Date;
  done: boolean;
};

export type RunSheet = {
  /** The Sunday this sheet is for (church-local midnight). */
  sunday: Date;
  /** Mon..Sun bounds of the week containing the Sunday. */
  weekStart: Date;
  weekEnd: Date;
  /** Active channels (sortOrder), each with its items for the week. */
  channels: RunSheetChannel[];
  /** Loop slides entering (add) and leaving (remove) the loop this Sunday. */
  loopAdd: RunSheetLoopChange[];
  loopRemove: RunSheetLoopChange[];
  /** Events whose eventStart lands in the Mon..Sun week. */
  events: RunSheetEvent[];
  /** Message-arc updates whose scheduledFor lands in the Mon..Sun week. */
  updatesThisWeek: RunSheetUpdate[];
};

// A touch joined to its channel and its deliverable's request (+ all ministries,
// ordered so the first is the stable "primary" for the compact line).
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

export type LoadedTouch = {
  id: string;
  channelId: string;
  scheduledAt: Date;
  content: string | null;
  status: string;
  deliverable: {
    status: string;
    request: {
      // id/tier/eventStart drive the weekly cap ranking for capped channels.
      id: string;
      tier: number;
      eventStart: Date;
      title: string;
      nextStepText: string | null;
      ministries: { name: string; color: string }[];
    };
  };
};

export type RunSheetChannelMeta = {
  id: string;
  key: string;
  name: string;
  color: string;
  type: string;
  /** Per-instance capacity for dated-instance channels such as Announcement Video. */
  capacity?: number | null;
  /** Weekly event cap (null = uncapped). Capped channels keep only the live set. */
  frequencyCap?: number | null;
};

/** The rankable event behind a loaded touch (for the weekly cap/curation). */
function loadedTouchEvent(t: LoadedTouch): RankableEvent {
  const r = t.deliverable.request;
  return {
    requestId: r.id,
    tier: r.tier,
    eventStartMs: r.eventStart.getTime(),
    title: r.title,
  };
}

/** Reshape a loaded touch into a clean run-sheet row. */
function toItem(t: LoadedTouch): RunSheetItem {
  const req = t.deliverable.request;
  const custom = (t.content ?? "").trim();
  const detail = custom || (req.nextStepText ?? "").trim() || req.title;
  const ministries = req.ministries.map((m) => ({ name: m.name, color: m.color }));
  return {
    touchId: t.id,
    eventTitle: req.title,
    ministry: ministries[0]?.name ?? null,
    ministryColor: ministries[0]?.color ?? null,
    ministries,
    detail,
    status: t.deliverable.status,
    done: t.status === "published",
    date: atMidnight(t.scheduledAt),
  };
}

/**
 * Pure grouping: bucket a week's worth of touches per channel and reshape into
 * run-sheet rows. The on-Sunday channels (loop / announcement video / stage)
 * are narrowed to touches landing ON `sunday`; every other channel keeps the
 * whole Mon..Sun week. No DB access, so this is the unit-tested core.
 *
 * `channels` is assumed already ordered (by sortOrder); `weekTouches` is every
 * touch in the Mon..Sun week. `sunday` must be church-local midnight.
 */
export function groupTouchesByChannel(
  channels: RunSheetChannelMeta[],
  weekTouches: LoadedTouch[],
  sunday: Date
): RunSheetChannel[] {
  const s = atMidnight(sunday);
  const sundayNext = addDays(s, 1); // half-open upper bound for "on Sunday"

  const byChannel = new Map<string, LoadedTouch[]>();
  for (const t of weekTouches) {
    const list = byChannel.get(t.channelId);
    if (list) list.push(t);
    else byChannel.set(t.channelId, [t]);
  }

  return channels.map((c) => {
    const onSundayOnly = ON_SUNDAY_CHANNEL_KEYS.has(c.key);
    const all = byChannel.get(c.id) ?? [];
    const windowed = onSundayOnly
      ? all.filter(
          (t) => atMidnight(t.scheduledAt) >= s && atMidnight(t.scheduledAt) < sundayNext
        )
      : all;
    // Capped channels: the run sheet is the production doc, so only the events
    // that make the cap appear — held items drop off.
    const cap = effectiveEventCap(c);
    const relevant = cap
      ? splitByWeeklyCap(windowed, loadedTouchEvent, cap).live
      : windowed;
    return {
      channelId: c.id,
      key: c.key,
      name: c.name,
      color: c.color,
      type: c.type,
      onSundayOnly,
      items: relevant.map(toItem),
    };
  });
}

/**
 * Build the run-sheet data for ONE service week, given the Sunday it centers on.
 *
 * Queries are kept to a handful: active channels, all touches in the widest
 * needed window (Mon..Sun) bucketed in memory per channel, the loop touches for
 * the add/remove diff, and the events whose start lands in the week.
 */
export async function buildRunSheet(sundayDate: Date): Promise<RunSheet> {
  const sunday = atMidnight(sundayDate);
  // The week containing the Sunday is the Mon..Sun ending on that Sunday.
  const { start: weekStart, end: weekEnd } = weekRange(sunday);
  const sundayNext = addDays(sunday, 1); // half-open upper bound for "on Sunday"
  const weekUpper = addDays(weekEnd, 1); // half-open upper bound for the week

  const channels = await db.channel.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, name: true, color: true, type: true, capacity: true, frequencyCap: true },
  });

  // One query for every touch landing anywhere in the Mon..Sun week. We then
  // bucket per channel in memory, narrowing the on-Sunday channels to the
  // single Sunday. This avoids a query per channel.
  const weekTouches = (await db.touch.findMany({
    where: {
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: { gte: weekStart, lt: weekUpper },
    },
    include: touchInclude,
    orderBy: [
      { deliverable: { request: { tier: "asc" } } },
      { deliverable: { request: { eventStart: "asc" } } },
      { deliverable: { request: { title: "asc" } } },
      { scheduledAt: "asc" },
    ],
  })) as unknown as LoadedTouch[];

  const runChannels = groupTouchesByChannel(channels, weekTouches, sunday);

  // Loop add/remove: the loop channel's touches around this Sunday vs last.
  // loopChangesForSunday compares the touch date to the Sunday (add) and the
  // prior Sunday (remove), so we fetch a two-week window of loop touches.
  const loopChannel = channels.find((c) => c.key === "loop");
  let loopAdd: RunSheetLoopChange[] = [];
  let loopRemove: RunSheetLoopChange[] = [];
  if (loopChannel) {
    const prevSunday = addDays(sunday, -7);
    const loopTouches = (await db.touch.findMany({
      where: {
        channelId: loopChannel.id,
        deliverable: {
          request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
        },
        scheduledAt: { gte: prevSunday, lt: sundayNext },
      },
      include: touchInclude,
      orderBy: { scheduledAt: "asc" },
    })) as unknown as LoadedTouch[];
    const shaped = loopTouches.map((t) => ({
      touchId: t.id,
      scheduledAt: atMidnight(t.scheduledAt),
      done: t.status === "published",
      request: {
        title: t.deliverable.request.title,
        ministry: t.deliverable.request.ministries[0]?.name ?? null,
      },
    }));
    const { add, remove } = loopChangesForSunday(shaped, sunday);
    const flatten = (
      list: typeof shaped
    ): RunSheetLoopChange[] =>
      list.map((t) => ({
        touchId: t.touchId,
        title: t.request.title,
        ministry: t.request.ministry,
        done: t.done,
      }));
    loopAdd = flatten(add);
    loopRemove = flatten(remove);
  }

  // Events physically happening this week (by eventStart within Mon..Sun). We
  // also load each event's message-arc updates so we can show the phase active
  // as of this Sunday.
  const eventRows = await db.request.findMany({
    where: { eventStart: { gte: weekStart, lt: weekUpper } },
    include: {
      ministries: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      updates: true,
    },
    orderBy: { eventStart: "asc" },
  });
  const events: RunSheetEvent[] = eventRows.map((r) => {
    const ministries = r.ministries.map((m) => ({ name: m.name, color: m.color }));
    const active = activeUpdateAt(r.updates as EventUpdateLite[], sunday);
    return {
      requestId: r.id,
      title: r.title,
      ministry: ministries[0]?.name ?? null,
      ministryColor: ministries[0]?.color ?? null,
      ministries,
      start: atMidnight(r.eventStart),
      location: r.location ?? null,
      ...(active ? { activePhase: { title: active.title, body: active.body ?? null } } : {}),
    };
  });

  // Message-arc updates whose phase date lands in this Mon..Sun week.
  const updateRows = await db.eventUpdate.findMany({
    where: { scheduledFor: { gte: weekStart, lt: weekUpper } },
    include: { request: { select: { title: true } } },
    orderBy: [{ scheduledFor: "asc" }, { sortOrder: "asc" }],
  });
  const updatesThisWeek: RunSheetUpdate[] = updateRows.map((u) => ({
    id: u.id,
    requestId: u.requestId,
    eventTitle: u.request.title,
    title: u.title,
    kind: u.kind ?? null,
    body: u.body ?? null,
    scheduledFor: atMidnight(u.scheduledFor),
    done: u.status === "done",
  }));

  return {
    sunday,
    weekStart,
    weekEnd,
    channels: runChannels,
    loopAdd,
    loopRemove,
    events,
    updatesThisWeek,
  };
}
