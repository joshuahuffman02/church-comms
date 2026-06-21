import { db } from "@/lib/db";
import { planEvent, toPrismaDeliverables } from "@/lib/engine/persist";
import type { ComputeOptions } from "@/lib/engine/timeline";
import type { ChannelConfig, EventInput } from "@/lib/engine/types";

/** Build the engine channel config from active DB channels. */
export async function activeChannelConfig(): Promise<{ cfg: ChannelConfig[]; idByKey: Record<string,string> }> {
  const channels = await db.channel.findMany({ where: { active: true } });
  const cfg: ChannelConfig[] = channels.map(c => ({
    key: c.key, name: c.name, type: c.type as ChannelConfig["type"],
    defaultPublishOffsetDays: c.defaultPublishOffsetDays, productionLeadDays: c.productionLeadDays,
    lockLeadDays: c.lockLeadDays ?? undefined, cadence: (c.cadence as ChannelConfig["cadence"]) ?? undefined,
    capacity: c.capacity ?? undefined, tierEligibility: c.tierEligibility as number[],
  }));
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

/**
 * Plan + persist deliverables for a request from its current eventStart/tier.
 * Shared by generate (first plan) and replan (rebuild after an edit). Assumes
 * the request currently has no deliverables — callers must clear them first.
 * Returns the count created.
 */
async function buildDeliverablesForRequest(requestId: string, opts?: ComputeOptions): Promise<number> {
  const req = await db.request.findUnique({ where: { id: requestId } });
  if (!req) throw new Error("Request not found");
  const { cfg, idByKey } = await activeChannelConfig();
  const plan = planEvent(planningInputForRequest(req), cfg, new Date(), opts);
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
