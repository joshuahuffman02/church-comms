import { subDays, weekdaysBetween, phaseFor, atMidnight, maxDate, minDate } from "./dates";
import type { ChannelConfig, EventInput, ComputedDeliverable, ComputedTouch } from "./types";

/**
 * Engine options.
 *
 * `catchUp` enables "catch-up planning" for events imported MID-STREAM — events
 * whose normal promo window already started in the past. Instead of marking the
 * schedule "skipped — not enough lead time", the schedule is RE-BASED to start
 * from today: windows/touches/instances are clamped to be on/after today (and
 * on/before the event), productionDueAt is clamped to be >= today (so the import
 * never reads as "at risk" purely from being late), and status is never "skipped".
 *
 * When `catchUp` is falsy/absent the output follows the standard planner,
 * except for rolling listing channels (currently PV Update Email) that should
 * keep showing every remaining weekly instance once an event is inside its
 * promotion window.
 */
export interface ComputeOptions {
  catchUp?: boolean;
}

const ROLLING_WINDOWED_CHANNEL_KEYS = new Set(["email"]);
const RECURRING_DATED_CHANNEL_KEYS = new Set(["announcement_video"]);

export function computeDeliverable(
  ch: ChannelConfig, ev: EventInput, today: Date, opts?: ComputeOptions
): ComputedDeliverable {
  const event = atMidnight(ev.eventStart);
  const scheduleEnd = ev.promotionEndsAt ? minDate(ev.promotionEndsAt, event) : event;
  const todayM = atMidnight(today);
  const catchUp =
    opts?.catchUp === true ||
    (ch.type === "windowed" && ROLLING_WINDOWED_CHANNEL_KEYS.has(ch.key));
  let touches: ComputedTouch[] = [];
  let windowStart: Date | undefined;
  let windowEnd: Date | undefined;
  let instanceDate: Date | undefined;

  if (ch.type === "one_shot") {
    // Default: publish offset days before the promotion deadline (event date
    // unless a registration close date is supplied).
    // Catch-up: clamp the publish date up to today, but never after that end.
    const offsetAt = subDays(scheduleEnd, ch.defaultPublishOffsetDays);
    const at = catchUp ? minDate(maxDate(offsetAt, todayM), scheduleEnd) : offsetAt;
    touches = [{ scheduledAt: at, purposeLabel: phaseFor(at, event) }];
  } else if (ch.type === "windowed") {
    // Default: window = [promotion deadline - offset, promotion deadline].
    // Catch-up: clamp windowStart up to today; if the event is already past so
    // windowStart > windowEnd, yield no touches.
    windowStart = catchUp
      ? maxDate(subDays(scheduleEnd, ch.defaultPublishOffsetDays), todayM)
      : subDays(scheduleEnd, ch.defaultPublishOffsetDays);
    windowEnd = scheduleEnd;
    const weekdays = ch.cadence?.weekdays ?? [0];
    const days = windowStart > windowEnd ? [] : weekdaysBetween(windowStart, windowEnd, weekdays);
    touches = days.map(at => ({ scheduledAt: at, purposeLabel: phaseFor(at, event) }));
  } else if (ch.type === "dated_instance") {
    // Announcement Video is a recurring weekly eligibility window: an event may
    // be considered for every service from the start of promotion through the
    // promotion deadline. Other dated-instance channels remain one-time and use
    // the final matching service inside the window.
    //
    // Catch-up rebases the start to today, so a late-added event becomes
    // eligible for every remaining service without manufacturing past work.
    const start = catchUp
      ? maxDate(subDays(scheduleEnd, ch.defaultPublishOffsetDays), todayM)
      : subDays(scheduleEnd, ch.defaultPublishOffsetDays);
    const matchingDays = weekdaysBetween(start, scheduleEnd, ch.cadence?.weekdays ?? [0]);
    if (RECURRING_DATED_CHANNEL_KEYS.has(ch.key)) {
      touches = matchingDays.map((scheduledAt) => ({
        scheduledAt,
        purposeLabel: phaseFor(scheduledAt, event),
      }));
      instanceDate = touches[0]?.scheduledAt;
    } else {
      instanceDate = matchingDays.at(-1);
      touches = instanceDate ? [{ scheduledAt: instanceDate, purposeLabel: phaseFor(instanceDate, event) }] : [];
    }
  } else if (ch.type === "single_weekday") {
    // One post, on the chosen weekday (default Friday) on/before the "offset days
    // before the deadline" mark — so it always lands on that weekday no matter
    // what day the event falls on, with >= offset days of lead.
    // Catch-up: if that weekday is already past, use the next chosen weekday
    // on/after today (and on/before the deadline).
    const weekdays = ch.cadence?.weekdays ?? [5];
    const anchor = subDays(scheduleEnd, ch.defaultPublishOffsetDays);
    let post = lastWeekday(subDays(anchor, 6), anchor, weekdays);
    if (catchUp && (!post || post < todayM)) {
      post = weekdaysBetween(todayM, scheduleEnd, weekdays)[0];
    }
    touches = post ? [{ scheduledAt: post, purposeLabel: phaseFor(post, event) }] : [];
  }

  const firstTouch = touches[0]?.scheduledAt ?? scheduleEnd;
  const lockBase = ch.type === "dated_instance" && instanceDate ? instanceDate : firstTouch;
  const lead = ch.type === "dated_instance" ? (ch.lockLeadDays ?? ch.productionLeadDays) : ch.productionLeadDays;

  if (catchUp) {
    // Re-based schedule: productionDueAt clamped to >= today (today itself when
    // there are no touches), and the deliverable is never "skipped".
    const base = touches.length ? subDays(lockBase, lead) : todayM;
    const productionDueAt = maxDate(base, todayM);
    return {
      channelKey: ch.key,
      instanceDate, windowStart, windowEnd,
      productionDueAt,
      phase: touches[0]?.purposeLabel ?? "awareness",
      status: "to_design",
      touches,
    };
  }

  const productionDueAt = subDays(lockBase, lead);
  const late = productionDueAt < todayM;
  return {
    channelKey: ch.key,
    instanceDate, windowStart, windowEnd,
    productionDueAt,
    phase: touches[0]?.purposeLabel ?? "awareness",
    status: late ? "skipped" : "to_design",
    skippedReason: late ? `Not enough lead time (due ${productionDueAt.toISOString().slice(0,10)})` : undefined,
    touches,
  };
}

function lastWeekday(start: Date, end: Date, weekdays: number[]): Date | undefined {
  if (atMidnight(start) > atMidnight(end)) return undefined;
  return weekdaysBetween(start, end, weekdays).at(-1);
}

export function enforceCapacity(
  deliverables: { requestId: string; tier: number; d: ComputedDeliverable }[],
  capacity: number
): { kept: typeof deliverables; bumped: typeof deliverables } {
  const sorted = [...deliverables].sort((a, b) => a.tier - b.tier); // Tier 1 first
  return { kept: sorted.slice(0, capacity), bumped: sorted.slice(capacity) };
}
