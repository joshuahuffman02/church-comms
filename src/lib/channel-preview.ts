import { atMidnight, subDays, weekdaysBetween } from "@/lib/engine/dates";

export interface PreviewInput {
  type: string;
  offset: number;
  lead: number;
  lockLeadDays?: number | null;
  weekdays: number[];
}

export interface PreviewResult {
  goesOut: Date | null;
  assetDue: Date | null;
}

/**
 * Resolve a channel's relative timing into real dates for one example event,
 * mirroring src/lib/engine/timeline.ts so the preview can't drift from the
 * real scheduler. windowed = first posting day in the window; dated_instance =
 * last posting day (and lockLeadDays overrides the production lead); one_shot =
 * straight offset from the event.
 */
export function previewSchedule(input: PreviewInput, exampleEvent: Date): PreviewResult {
  const event = atMidnight(exampleEvent);
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const lead = Math.max(0, Math.floor(input.lead || 0));
  const weekdays = input.weekdays.length ? input.weekdays : [0];

  let goesOut: Date | null;
  let effLead = lead;

  if (input.type === "one_shot") {
    goesOut = subDays(event, offset);
  } else if (input.type === "dated_instance") {
    const days = weekdaysBetween(subDays(event, offset), event, weekdays);
    goesOut = days.length ? days[days.length - 1] : null;
    effLead = input.lockLeadDays ?? lead;
  } else {
    const days = weekdaysBetween(subDays(event, offset), event, weekdays);
    goesOut = days.length ? days[0] : null;
  }

  return { goesOut, assetDue: goesOut ? subDays(goesOut, effLead) : null };
}
