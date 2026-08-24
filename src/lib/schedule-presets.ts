import { addDays, atMidnight, subDays, weekdaysBetween } from "@/lib/engine/dates";
import type { ChannelConfig, ComputedDeliverable, ComputedTouch, EventInput } from "@/lib/engine/types";

/** Kept as the serialized key so existing tag rules continue to work. */
export const MONTHLY_FIRST_SUNDAY_FULL_RUN = "monthly_first_sunday_full_run";
export const WEEK_OF_ONLY = "week_of_only";
export const STANDARD_MULTI_WEEK = "standard_multi_week";

export const SCHEDULE_PRESETS = [
  {
    key: STANDARD_MULTI_WEEK,
    label: "Standard multi-week promotion",
    description: "Use the normal lead time for special events, registrations, trips, and larger opportunities.",
  },
  {
    key: WEEK_OF_ONLY,
    label: "Week of the event only",
    description: "Keep regular weekly Rise/Thrive gatherings within the final seven days before the event.",
  },
  {
    key: MONTHLY_FIRST_SUNDAY_FULL_RUN,
    label: "Monthly spotlight",
    description:
      "Start on the first day of its named month, use the first Sunday video, and continue recurring channels through month-end—never the month before.",
  },
] as const;

export type SchedulePresetKey = (typeof SCHEDULE_PRESETS)[number]["key"];

type ScheduledChannelPlacement = {
  channel: ChannelConfig;
  scheduledAt: Date;
};

type RecommendationInput = {
  title: string;
  eventStart: Date;
  needsRegistration?: boolean | null;
  registrationClosesAt?: Date | null;
  registrationUrl?: string | null;
};

const SPECIAL_YOUTH_EVENT =
  /\b(love winona|champions?|registration|register|trip|conference|valleyfair|kick[ -]?off|overnight|costume|retreat|camp|mission|tournament|fundraiser)\b/i;

export function isSchedulePresetKey(value: string | null | undefined): value is SchedulePresetKey {
  return SCHEDULE_PRESETS.some((preset) => preset.key === value);
}

export function schedulePresetLabel(key: string | null | undefined): string | null {
  return SCHEDULE_PRESETS.find((preset) => preset.key === key)?.label ?? null;
}

export function schedulePresetDescription(key: string | null | undefined): string | null {
  return SCHEDULE_PRESETS.find((preset) => preset.key === key)?.description ?? null;
}

/**
 * Routine Rise/Thrive gatherings are intentionally light-touch. Anything with
 * registration, or a title that signals a special event, stays on the standard
 * multi-week plan unless staff explicitly chooses another preset.
 */
export function recommendedSchedulePresetForRequest(
  request: RecommendationInput,
): SchedulePresetKey | null {
  const youthTitle = /\b(rise|thrive)\b/i.test(request.title);
  const weekday = atMidnight(request.eventStart).getDay();
  const normalMeetingDay = weekday === 0 || weekday === 3;
  const hasRegistration = Boolean(
    request.needsRegistration || request.registrationClosesAt || request.registrationUrl?.trim(),
  );

  if (!youthTitle || !normalMeetingDay || hasRegistration || SPECIAL_YOUTH_EVENT.test(request.title)) {
    return null;
  }
  return WEEK_OF_ONLY;
}

export function effectiveSchedulePresetsForRequest(
  request: RecommendationInput & { schedulePreset?: string | null },
  tagPresets: (string | null | undefined)[] = [],
): { presets: SchedulePresetKey[]; source: "event" | "tag" | "automatic" | "standard" } {
  if (isSchedulePresetKey(request.schedulePreset)) {
    return { presets: [request.schedulePreset], source: "event" };
  }
  const validTagPresets = uniquePresetKeys(tagPresets);
  if (validTagPresets.length > 0) return { presets: validTagPresets, source: "tag" };
  const automatic = recommendedSchedulePresetForRequest(request);
  return automatic
    ? { presets: [automatic], source: "automatic" }
    : { presets: [], source: "standard" };
}

function firstSundayOfMonth(anchor: Date): Date {
  let day = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  while (day.getDay() !== 0) day = addDays(day, 1);
  return atMidnight(day);
}

function firstDayOfMonth(anchor: Date): Date {
  return atMidnight(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
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

function eligibleChannels(ev: Pick<EventInput, "tier">, channels: ChannelConfig[]): ChannelConfig[] {
  return channels.filter((channel) => channel.tierEligibility.includes(ev.tier));
}

function monthlyPlacements(
  ev: Pick<EventInput, "eventStart" | "tier">,
  channels: ChannelConfig[],
  out: ScheduledChannelPlacement[],
  seen: Set<string>,
) {
  const monthStart = firstDayOfMonth(ev.eventStart);
  const firstSunday = firstSundayOfMonth(ev.eventStart);
  const monthEnd = lastDayOfMonth(ev.eventStart);

  for (const channel of eligibleChannels(ev, channels)) {
    if (channel.key === "announcement_video") {
      addPlacement(out, seen, channel, firstSunday);
      continue;
    }
    if (channel.type === "one_shot") {
      addPlacement(out, seen, channel, monthStart);
      continue;
    }

    const fallback = channel.type === "dated_instance" ? [0] : [monthStart.getDay()];
    for (const day of weekdaysBetween(monthStart, monthEnd, cadenceWeekdays(channel, fallback))) {
      addPlacement(out, seen, channel, day);
    }
  }
}

function weekOfPlacements(
  ev: Pick<EventInput, "eventStart" | "tier">,
  channels: ChannelConfig[],
  out: ScheduledChannelPlacement[],
  seen: Set<string>,
) {
  const eventDay = atMidnight(ev.eventStart);
  const windowStart = subDays(eventDay, 6);

  for (const channel of eligibleChannels(ev, channels)) {
    if (channel.type === "one_shot") {
      const offset = Math.min(6, Math.max(0, channel.defaultPublishOffsetDays));
      addPlacement(out, seen, channel, subDays(eventDay, offset));
      continue;
    }

    const fallback = channel.type === "dated_instance" ? [0] : [eventDay.getDay()];
    const candidates = weekdaysBetween(windowStart, eventDay, cadenceWeekdays(channel, fallback));
    addPlacement(out, seen, channel, candidates.at(-1) ?? eventDay);
  }
}

export function schedulePresetChannelKeys(
  ev: Pick<EventInput, "tier">,
  channels: ChannelConfig[],
  presets: (string | null | undefined)[],
): Set<string> {
  const presetKeys = uniquePresetKeys(presets);
  if (!presetKeys.some((preset) => preset === MONTHLY_FIRST_SUNDAY_FULL_RUN || preset === WEEK_OF_ONLY)) {
    return new Set();
  }
  return new Set(eligibleChannels(ev, channels).map((channel) => channel.key));
}

export function schedulePresetPlacements(
  ev: Pick<EventInput, "eventStart" | "tier">,
  channels: ChannelConfig[],
  presets: (string | null | undefined)[],
): ScheduledChannelPlacement[] {
  const presetKeys = uniquePresetKeys(presets);
  if (presetKeys.length === 0) return [];

  const out: ScheduledChannelPlacement[] = [];
  const seen = new Set<string>();
  for (const preset of presetKeys) {
    if (preset === MONTHLY_FIRST_SUNDAY_FULL_RUN) monthlyPlacements(ev, channels, out, seen);
    if (preset === WEEK_OF_ONLY) weekOfPlacements(ev, channels, out, seen);
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
    if (group.channel.type === "windowed" || group.channel.key === "announcement_video") {
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
  replaceChannelKeys?: Set<string>,
): ComputedDeliverable[] {
  if (placements.length === 0 && (!replaceChannelKeys || replaceChannelKeys.size === 0)) return plan;

  const replaceChannels = replaceChannelKeys ?? new Set(placements.map((placement) => placement.channel.key));
  return [
    ...plan.filter((deliverable) => !replaceChannels.has(deliverable.channelKey)),
    ...schedulePresetDeliverables(placements),
  ];
}
