import { addDays, atMidnight, subDays, weekdaysBetween } from "@/lib/engine/dates";
import type { ChannelConfig, ComputedDeliverable, ComputedTouch, EventInput } from "@/lib/engine/types";

export const MONTHLY_FIRST_SUNDAY_FULL_RUN = "monthly_first_sunday_full_run";

export const SCHEDULE_PRESETS = [
  {
    key: MONTHLY_FIRST_SUNDAY_FULL_RUN,
    label: "First Sunday video + weekly loop/email/website",
    description:
      "For monthly awareness items: put it in the announcement video on the first Sunday, then keep it in the loop, weekly email, and website each week that month.",
  },
] as const;

export type SchedulePresetKey = (typeof SCHEDULE_PRESETS)[number]["key"];

type ScheduledChannelPlacement = {
  channel: ChannelConfig;
  scheduledAt: Date;
};

type MonthlyChannelRule = {
  key: string;
  placement: "first_sunday" | "weekly";
  fallbackWeekdays: number[];
};

const MONTHLY_FIRST_SUNDAY_RULES: MonthlyChannelRule[] = [
  { key: "announcement_video", placement: "first_sunday", fallbackWeekdays: [0] },
  { key: "loop", placement: "weekly", fallbackWeekdays: [0] },
  { key: "email", placement: "weekly", fallbackWeekdays: [4] },
  { key: "web", placement: "weekly", fallbackWeekdays: [1] },
];

export function isSchedulePresetKey(value: string | null | undefined): value is SchedulePresetKey {
  return SCHEDULE_PRESETS.some((preset) => preset.key === value);
}

export function schedulePresetLabel(key: string | null | undefined): string | null {
  return SCHEDULE_PRESETS.find((preset) => preset.key === key)?.label ?? null;
}

function firstSundayOfMonth(anchor: Date): Date {
  let day = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  while (day.getDay() !== 0) day = addDays(day, 1);
  return atMidnight(day);
}

function lastDayOfMonth(anchor: Date): Date {
  return atMidnight(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
}

function cadenceWeekdays(channel: ChannelConfig, fallback: number[]): number[] {
  const weekdays = channel.cadence?.weekdays?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return weekdays && weekdays.length > 0 ? weekdays : fallback;
}

function uniquePresetKeys(presets: (string | null | undefined)[]): SchedulePresetKey[] {
  const out: SchedulePresetKey[] = [];
  const seen = new Set<SchedulePresetKey>();
  for (const preset of presets) {
    if (!isSchedulePresetKey(preset) || seen.has(preset)) continue;
    seen.add(preset);
    out.push(preset);
  }
  return out;
}

function addPlacement(
  out: ScheduledChannelPlacement[],
  seen: Set<string>,
  channel: ChannelConfig,
  scheduledAt: Date,
) {
  const date = atMidnight(scheduledAt);
  const key = `${channel.key}:${date.getTime()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ channel, scheduledAt: date });
}

export function schedulePresetChannelKeys(presets: (string | null | undefined)[]): Set<string> {
  const keys = new Set<string>();
  for (const preset of uniquePresetKeys(presets)) {
    if (preset === MONTHLY_FIRST_SUNDAY_FULL_RUN) {
      MONTHLY_FIRST_SUNDAY_RULES.forEach((rule) => keys.add(rule.key));
    }
  }
  return keys;
}

export function schedulePresetPlacements(
  ev: Pick<EventInput, "eventStart">,
  channels: ChannelConfig[],
  presets: (string | null | undefined)[],
): ScheduledChannelPlacement[] {
  const presetKeys = uniquePresetKeys(presets);
  if (presetKeys.length === 0) return [];

  const channelByKey = new Map(channels.map((channel) => [channel.key, channel]));
  const out: ScheduledChannelPlacement[] = [];
  const seen = new Set<string>();

  for (const preset of presetKeys) {
    if (preset !== MONTHLY_FIRST_SUNDAY_FULL_RUN) continue;

    const firstSunday = firstSundayOfMonth(ev.eventStart);
    const monthEnd = lastDayOfMonth(ev.eventStart);

    for (const rule of MONTHLY_FIRST_SUNDAY_RULES) {
      const channel = channelByKey.get(rule.key);
      if (!channel) continue;

      if (rule.placement === "first_sunday") {
        addPlacement(out, seen, channel, firstSunday);
        continue;
      }

      for (const day of weekdaysBetween(firstSunday, monthEnd, cadenceWeekdays(channel, rule.fallbackWeekdays))) {
        addPlacement(out, seen, channel, day);
      }
    }
  }

  return out.sort((a, b) => {
    const byChannel = a.channel.key.localeCompare(b.channel.key);
    return byChannel || a.scheduledAt.getTime() - b.scheduledAt.getTime();
  });
}

function leadDays(channel: ChannelConfig): number {
  return channel.type === "dated_instance"
    ? channel.lockLeadDays ?? channel.productionLeadDays
    : channel.productionLeadDays;
}

function awarenessTouch(scheduledAt: Date): ComputedTouch {
  return { scheduledAt: atMidnight(scheduledAt), purposeLabel: "awareness" };
}

function fixedDeliverable(channel: ChannelConfig, touches: ComputedTouch[]): ComputedDeliverable {
  const sorted = [...touches].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const productionDueAt = subDays(first.scheduledAt, leadDays(channel));
  const base = {
    channelKey: channel.key,
    productionDueAt,
    phase: "awareness" as const,
    status: "to_design" as const,
    touches: sorted,
  };

  if (channel.type === "dated_instance") return { ...base, instanceDate: first.scheduledAt };
  if (channel.type === "windowed") {
    return { ...base, windowStart: first.scheduledAt, windowEnd: last.scheduledAt };
  }
  return base;
}

export function schedulePresetDeliverables(placements: ScheduledChannelPlacement[]): ComputedDeliverable[] {
  const byChannel = new Map<string, { channel: ChannelConfig; touches: ComputedTouch[] }>();
  for (const placement of placements) {
    const group = byChannel.get(placement.channel.key) ?? { channel: placement.channel, touches: [] };
    group.touches.push(awarenessTouch(placement.scheduledAt));
    byChannel.set(placement.channel.key, group);
  }

  const out: ComputedDeliverable[] = [];
  for (const group of byChannel.values()) {
    if (group.channel.type === "windowed") {
      out.push(fixedDeliverable(group.channel, group.touches));
      continue;
    }
    for (const touch of group.touches) out.push(fixedDeliverable(group.channel, [touch]));
  }
  return out;
}

export function applySchedulePresetPlacementsToPlan(
  plan: ComputedDeliverable[],
  placements: ScheduledChannelPlacement[],
): ComputedDeliverable[] {
  if (placements.length === 0) return plan;

  const replaceChannels = new Set(placements.map((placement) => placement.channel.key));
  return [
    ...plan.filter((deliverable) => !replaceChannels.has(deliverable.channelKey)),
    ...schedulePresetDeliverables(placements),
  ];
}
