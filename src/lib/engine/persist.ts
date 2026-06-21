import { computeDeliverable, type ComputeOptions } from "./timeline";
import type { ChannelConfig, EventInput, ComputedDeliverable } from "./types";

export function planEvent(
  ev: EventInput, channels: ChannelConfig[], today: Date, opts?: ComputeOptions
): ComputedDeliverable[] {
  return channels
    .filter(c => c.tierEligibility.includes(ev.tier))
    .map(c => computeDeliverable(c, ev, today, opts));
}

/** Map engine output to Prisma nested-create data for a Request's deliverables. */
export function toPrismaDeliverables(
  plan: ComputedDeliverable[],
  channelIdByKey: Record<string, string>
) {
  return plan.map(d => ({
    channelId: channelIdByKey[d.channelKey],
    instanceDate: d.instanceDate ?? null,
    windowStart: d.windowStart ?? null,
    windowEnd: d.windowEnd ?? null,
    productionDueAt: d.productionDueAt,
    phase: d.phase,
    status: d.status,
    skippedReason: d.skippedReason ?? null,
    touches: {
      create: d.touches.map(t => ({
        channelId: channelIdByKey[d.channelKey],
        scheduledAt: t.scheduledAt,
        purposeLabel: t.purposeLabel,
      })),
    },
  }));
}
