import { db } from "@/lib/db";
import { planEvent, toPrismaDeliverables } from "@/lib/engine/persist";
import { atMidnight, maxDate, minDate, phaseFor, subDays } from "@/lib/engine/dates";
import { applySchedulePresetPlacementsToPlan, schedulePresetPlacements } from "@/lib/schedule-presets";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { schedulePresetsForTags } from "@/lib/tag-rules";
import type { ComputeOptions } from "@/lib/engine/timeline";
import type { ChannelConfig, ComputedDeliverable, ComputedTouch, EventInput } from "@/lib/engine/types";

type ChannelConfigRow = {
  key: string;
  name: string;
  type: string;
  defaultPublishOffsetDays: number;
  productionLeadDays: number;
  lockLeadDays: number | null;
  cadence: unknown;
  capacity: number | null;
  tierEligibility: unknown;
};

type ScheduleLockPlanInput = {
  scheduledAt: Date;
  channel: ChannelConfig;
};

function channelConfigFromRow(c: ChannelConfigRow): ChannelConfig {
  return {
    key: c.key,
    name: c.name,
    type: c.type as ChannelConfig["type"],
    defaultPublishOffsetDays: c.defaultPublishOffsetDays,
    productionLeadDays: c.productionLeadDays,
    lockLeadDays: c.lockLeadDays ?? undefined,
    cadence: (c.cadence as ChannelConfig["cadence"]) ?? undefined,
    capacity: c.capacity ?? undefined,
    tierEligibility: c.tierEligibility as number[],
  };
}

function tagNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
}

/** Build the engine channel config from active DB channels. */
export async function activeChannelConfig(): Promise<{ cfg: ChannelConfig[]; idByKey: Record<string,string> }> {
  const channels = await db.channel.findMany({ where: { active: true } });
  const cfg: ChannelConfig[] = channels.map(channelConfigFromRow);
  return { cfg, idByKey: Object.fromEntries(channels.map(c => [c.key, c.id])) };
}

export function planningInputForRequest(req: {
  eventStart: Date;
  registrationClosesAt: Date | null;
  tier: number;
}): EventInput {
  return {
    eventStart: req.eventStart,
    promotionEndsAt: req.registrationClosesAt,
    tier: req.tier,
  };
}

function lockedLeadDays(ch: ChannelConfig): number {
  return ch.type === "dated_instance"
    ? ch.lockLeadDays ?? ch.productionLeadDays
    : ch.productionLeadDays;
}

function sortTouches(touches: ComputedTouch[]): ComputedTouch[] {
  return [...touches].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

function lockedTouch(ev: EventInput, scheduledAt: Date): ComputedTouch {
  const date = atMidnight(scheduledAt);
  return { scheduledAt: date, purposeLabel: phaseFor(date, ev.eventStart) };
}

function lockedDeliverable(
  ev: EventInput,
  ch: ChannelConfig,
  scheduledAt: Date,
): ComputedDeliverable {
  const touch = lockedTouch(ev, scheduledAt);
  const productionDueAt = subDays(touch.scheduledAt, lockedLeadDays(ch));
  const base = {
    channelKey: ch.key,
    productionDueAt,
    phase: touch.purposeLabel,
    status: "to_design" as const,
    touches: [touch],
  };

  if (ch.type === "dated_instance") {
    return { ...base, instanceDate: touch.scheduledAt };
  }
  if (ch.type === "windowed") {
    return { ...base, windowStart: touch.scheduledAt, windowEnd: touch.scheduledAt };
  }
  return base;
}

function lockedWindowedDeliverable(
  ev: EventInput,
  ch: ChannelConfig,
  locks: ScheduleLockPlanInput[],
): ComputedDeliverable {
  const touches = sortTouches(locks.map((lock) => lockedTouch(ev, lock.scheduledAt)));
  const firstTouch = touches[0];
  const lastTouch = touches[touches.length - 1];
  return {
    channelKey: ch.key,
    windowStart: firstTouch.scheduledAt,
    windowEnd: lastTouch.scheduledAt,
    productionDueAt: subDays(firstTouch.scheduledAt, lockedLeadDays(ch)),
    phase: firstTouch.purposeLabel,
    status: "to_design",
    touches,
  };
}

function mergeWindowedLocks(
  ev: EventInput,
  d: ComputedDeliverable,
  locks: ScheduleLockPlanInput[],
): ComputedDeliverable {
  const touchByDay = new Map(d.touches.map((touch) => [atMidnight(touch.scheduledAt).getTime(), touch]));
  for (const lock of locks) {
    const touch = lockedTouch(ev, lock.scheduledAt);
    touchByDay.set(touch.scheduledAt.getTime(), touch);
  }

  const touches = sortTouches([...touchByDay.values()]);
  const firstTouch = touches[0] ?? d.touches[0];
  const lastTouch = touches[touches.length - 1] ?? d.touches[d.touches.length - 1];
  const firstLockDue = subDays(
    atMidnight(locks[0].scheduledAt),
    lockedLeadDays(locks[0].channel),
  );

  return {
    ...d,
    windowStart: firstTouch ? minDate(d.windowStart ?? firstTouch.scheduledAt, firstTouch.scheduledAt) : d.windowStart,
    windowEnd: lastTouch ? maxDate(d.windowEnd ?? lastTouch.scheduledAt, lastTouch.scheduledAt) : d.windowEnd,
    productionDueAt: minDate(d.productionDueAt, firstLockDue),
    phase: touches[0]?.purposeLabel ?? d.phase,
    status: "to_design",
    skippedReason: undefined,
    touches,
  };
}

/**
 * Reapply staff locks to a freshly computed plan.
 *
 * Single-placement channels (one_shot, single_weekday, dated_instance) are
 * replaced by one locked deliverable per locked date. Windowed channels keep
 * their generated window and get the locked dates inserted into it.
 */
export function applyScheduleLocksToPlan(
  ev: EventInput,
  plan: ComputedDeliverable[],
  locks: ScheduleLockPlanInput[],
): ComputedDeliverable[] {
  if (locks.length === 0) return plan;

  const locksByChannel = new Map<string, ScheduleLockPlanInput[]>();
  for (const lock of locks) {
    const key = lock.channel.key;
    const existing = locksByChannel.get(key) ?? [];
    existing.push({ ...lock, scheduledAt: atMidnight(lock.scheduledAt) });
    locksByChannel.set(key, existing);
  }
  for (const group of locksByChannel.values()) {
    group.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  const out: ComputedDeliverable[] = [];
  const handledWindowed = new Set<string>();

  for (const d of plan) {
    const channelLocks = locksByChannel.get(d.channelKey);
    if (!channelLocks || channelLocks.length === 0) {
      out.push(d);
      continue;
    }

    const channel = channelLocks[0].channel;
    if (channel.type === "windowed") {
      out.push(mergeWindowedLocks(ev, d, channelLocks));
      handledWindowed.add(channel.key);
    }
    // Non-windowed locked channels intentionally replace the generated date.
  }

  for (const channelLocks of locksByChannel.values()) {
    const channel = channelLocks[0].channel;
    if (channel.type === "windowed") {
      if (!handledWindowed.has(channel.key)) {
        out.push(lockedWindowedDeliverable(ev, channel, channelLocks));
      }
      continue;
    }

    for (const lock of channelLocks) {
      out.push(lockedDeliverable(ev, channel, lock.scheduledAt));
    }
  }

  return out;
}

/**
 * Plan + persist deliverables for a request from its current eventStart/tier.
 * Shared by generate (first plan) and replan (rebuild after an edit). Assumes
 * the request currently has no deliverables — callers must clear them first.
 * Returns the count created.
 */
async function buildDeliverablesForRequest(requestId: string, opts?: ComputeOptions): Promise<number> {
  const req = await db.request.findUnique({ where: { id: requestId } });
  if (!req) throw new Error("Request not found");
  const [{ cfg, idByKey }, locks, presetRules] = await Promise.all([
    activeChannelConfig(),
    db.scheduleLock.findMany({
      where: { requestId, channel: { active: true } },
      include: { channel: true },
      orderBy: { scheduledAt: "asc" },
    }),
    db.eventTagRule.findMany({
      where: { schedulePreset: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { tag: true, schedulePreset: true },
    }),
  ]);
  const input = planningInputForRequest(req);
  const presets = schedulePresetsForTags(tagNames(req.pcoTags), presetRules);
  const presetPlan = applySchedulePresetPlacementsToPlan(
    planEvent(input, cfg, new Date(), opts),
    schedulePresetPlacements(input, cfg, presets),
  );
  const plan = applyScheduleLocksToPlan(
    input,
    presetPlan,
    locks.map((lock) => ({
      scheduledAt: lock.scheduledAt,
      channel: channelConfigFromRow(lock.channel),
    })),
  );
  await db.request.update({
    where: { id: requestId },
    data: { deliverables: { create: toPrismaDeliverables(plan, idByKey) } },
  });
  return plan.length;
}

/** Generate + persist deliverables for a request if it has none. Returns count created. */
export async function generateDeliverablesForRequest(requestId: string): Promise<number> {
  const existing = await db.deliverable.count({ where: { requestId } });
  if (existing > 0) return 0; // already planned
  return buildDeliverablesForRequest(requestId);
}

/**
 * Re-plan a request: delete its existing deliverables (cascades touches) then
 * rebuild from the current eventStart/tier. Use after editing an event's date
 * or tier so its schedule reflects the new values instead of going stale.
 *
 * Pass `{ catchUp: true }` for events imported mid-stream (their promo window
 * already started in the past): the schedule is re-based to start from today
 * instead of being marked "skipped". Omitting opts keeps the default behavior.
 * Returns the count created.
 */
export async function replanRequest(requestId: string, opts?: ComputeOptions): Promise<number> {
  await db.deliverable.deleteMany({ where: { requestId } });
  return buildDeliverablesForRequest(requestId, opts);
}

/**
 * Re-plan all upcoming events whose status means they should have scheduled
 * work. Use after channel settings change so newly enabled channels backfill
 * existing approved events, and disabled/timing-changed channels are removed or
 * recalculated without touching already-past event history.
 */
export async function replanUpcomingPromotableRequests(
  opts?: ComputeOptions,
): Promise<{ requests: number; deliverables: number }> {
  const today = atMidnight(new Date());
  const requests = await db.request.findMany({
    where: {
      status: { in: PROMOTABLE_REQUEST_STATUSES },
      noPromo: false,
      eventStart: { gte: today },
    },
    orderBy: { eventStart: "asc" },
    select: { id: true },
  });

  let deliverables = 0;
  for (const request of requests) {
    deliverables += await replanRequest(request.id, opts);
  }
  return { requests: requests.length, deliverables };
}
