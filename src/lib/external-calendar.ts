import { readFile } from "node:fs/promises";
import { addDays, atMidnight } from "@/lib/engine/dates";

export const LOCAL_ICAL_SOURCE = "local-ics";

export type ExternalCalendarEvent = {
  uid: string;
  key: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  dateKey: string;
  location: string | null;
  description: string | null;
  source: "single" | "rrule" | "override";
  operationalNoise: boolean;
};

export type ExistingCalendarEvent = {
  id: string;
  title: string;
  eventStart: Date;
  location: string | null;
  pcoEventId: string | null;
  externalCalendarKey?: string | null;
};

export type ExternalEventMatch = {
  id: string;
  title: string;
  eventStart: Date;
  location: string | null;
  pcoEventId: string | null;
  titleScore: number;
  dateDistanceDays: number;
};

export type ExternalEventPreview = {
  event: ExternalCalendarEvent;
  status: "missing" | "possible_match" | "already_in_system";
  matches: ExternalEventMatch[];
};

export function configuredExternalCalendarUrl(): string | null {
  const explicitFeed =
    process.env.GOOGLE_EVENTS_ICAL_URL ?? process.env.GOOGLE_CALENDAR_ICAL_URL;
  const source = explicitFeed ?? configuredExternalCalendarSourceUrl();
  return source ? calendarUrlToIcsUrl(source) : null;
}

export function configuredExternalCalendarSourceUrl(): string | null {
  return process.env.GOOGLE_EVENTS_CALENDAR_URL ?? process.env.GOOGLE_CALENDAR_URL ?? null;
}

export function configuredLocalIcalPath(): string | null {
  return process.env.ICAL_IMPORT_FILE ?? null;
}

export function calendarUrlToIcsUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const src = url.searchParams.get("src");
    if (url.hostname === "calendar.google.com" && url.pathname.includes("/calendar/embed") && src) {
      return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export async function fetchExternalCalendarEvents(
  calendarUrl = configuredExternalCalendarUrl(),
): Promise<ExternalCalendarEvent[]> {
  if (!calendarUrl) return [];

  let res: Response;
  try {
    res = await fetch(calendarUrl, { cache: "no-store" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach external calendar: ${detail}`);
  }

  if (!res.ok) {
    throw new Error(`External calendar error (${res.status} ${res.statusText}).`);
  }

  const start = atMidnight(new Date());
  return expandIcsEvents(await res.text(), start, addDays(start, 180));
}

export async function loadLocalIcalEvents(
  filePath = configuredLocalIcalPath(),
  today = new Date(),
  horizonDays = 180,
): Promise<ExternalCalendarEvent[]> {
  if (!filePath) return [];

  const ics = await readFile(filePath, "utf8");
  return expandIcsEvents(ics, atMidnight(today), addDays(atMidnight(today), horizonDays));
}

export function parseIcsEvents(ics: string): ExternalCalendarEvent[] {
  return parseIcsComponents(ics)
    .map((event, index) => {
      const info = baseInfo(event, index);
      if (!info || info.status === "CANCELLED") return null;
      return toExternalEvent(info, info.start.date, info.start.dateKey, "single");
    })
    .filter((event): event is ExternalCalendarEvent => event !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title));
}

export function expandIcsEvents(
  ics: string,
  start: Date,
  end: Date,
): ExternalCalendarEvent[] {
  const events = parseIcsComponents(ics);
  const overrideKeys = new Set<string>();
  const cancelledOverrideKeys = new Set<string>();

  events.forEach((event, index) => {
    const info = baseInfo(event, index);
    const recurrence = parseIcsDate(first(event, "RECURRENCE-ID"));
    if (!info || !recurrence) return;
    const key = occurrenceKey(info.uid, recurrence);
    overrideKeys.add(key);
    if (info.status === "CANCELLED") cancelledOverrideKeys.add(key);
  });

  const out: ExternalCalendarEvent[] = [];
  events.forEach((event, index) => {
    const info = baseInfo(event, index);
    if (!info || info.status === "CANCELLED") return;

    const recurrence = parseIcsDate(first(event, "RECURRENCE-ID"));
    const rrule = parseRRule(first(event, "RRULE")?.value);
    const emit = (date: Date, dateParts: ParsedIcsDate, source: ExternalCalendarEvent["source"]) => {
      if (!dateWithin(date, start, end)) return;
      out.push(toExternalEvent(info, date, dateParts.dateKey, source));
    };

    if (recurrence) {
      emit(info.start.date, info.start, "override");
      return;
    }

    if (!rrule.FREQ) {
      emit(info.start.date, info.start, "single");
      return;
    }

    const until = rruleUntil(rrule);
    const count = rrule.COUNT ? Number(rrule.COUNT) : null;
    const exdates = parseExdates(event);
    let emittedTotal = 0;

    for (let day = atMidnight(info.start.date); day <= end; day = addDays(day, 1)) {
      if (until && day > atMidnight(until)) break;
      if (!matchesRRuleDay(day, atMidnight(info.start.date), rrule)) continue;

      emittedTotal += 1;
      if (count && emittedTotal > count) break;

      const occurrence = addTimeOfDay(day, info.start.date);
      const dateParts: ParsedIcsDate = {
        date: occurrence,
        dateKey: localDateKey(occurrence),
        timeKey: info.start.timeKey,
      };
      const shortKey = `${dateParts.dateKey}|${dateParts.timeKey}`;
      const fullKey = occurrenceKey(info.uid, dateParts);
      if (exdates.has(shortKey) || overrideKeys.has(fullKey) || cancelledOverrideKeys.has(fullKey)) {
        continue;
      }

      emit(occurrence, dateParts, "rrule");
    }
  });

  const deduped = new Map<string, ExternalCalendarEvent>();
  for (const event of out) {
    deduped.set(event.key, event);
  }
  return [...deduped.values()].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title),
  );
}

export function buildExternalEventPreview(
  externalEvents: ExternalCalendarEvent[],
  existingEvents: ExistingCalendarEvent[],
  today = new Date(),
  horizonDays = 180,
): ExternalEventPreview[] {
  const start = atMidnight(today);
  const end = addDays(start, horizonDays);
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);

  return externalEvents
    .filter((event) => event.dateKey >= startKey && event.dateKey <= endKey)
    .map((event) => {
      const hasExternalKey = existingEvents.some((existing) => existing.externalCalendarKey === event.key);
      const scored = existingEvents
        .map((existing) => scoreExistingMatch(event, existing))
        .filter(
          (match) =>
            (match.dateDistanceDays === 0 && match.titleScore >= 0.2) ||
            (match.dateDistanceDays <= 1 && match.titleScore >= 0.45) ||
            (match.dateDistanceDays <= 7 && match.titleScore >= 0.75),
        )
        .sort((a, b) => {
          if (a.dateDistanceDays !== b.dateDistanceDays) {
            return a.dateDistanceDays - b.dateDistanceDays;
          }
          return b.titleScore - a.titleScore;
        })
        .slice(0, 3);

      const exact = hasExternalKey || scored.some(
        (match) => match.dateDistanceDays === 0 && match.titleScore >= 0.5,
      );

      return {
        event,
        status: exact
          ? "already_in_system"
          : scored.length > 0
            ? "possible_match"
            : "missing",
        matches: scored,
      };
    });
}

type IcsEvent = Record<string, IcsProperty[]>;
type IcsProperty = {
  name: string;
  params: Record<string, string>;
  value: string;
};
type ParsedIcsDate = { date: Date; dateKey: string; timeKey: string };
type RRule = Record<string, string>;
type BaseInfo = {
  uid: string;
  title: string;
  start: ParsedIcsDate;
  end: ParsedIcsDate | null;
  status: string;
  location: string | null;
  description: string | null;
};

function parseIcsComponents(ics: string): IcsEvent[] {
  const lines = unfoldIcsLines(ics);
  const events: IcsEvent[] = [];
  let current: IcsEvent | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseIcsProperty(line);
    if (!prop) continue;
    current[prop.name] ??= [];
    current[prop.name].push(prop);
  }
  return events;
}

function unfoldIcsLines(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsProperty(line: string): IcsProperty | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const rawName = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [namePart, ...paramParts] = rawName.split(";");
  const name = namePart.toUpperCase();
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name, params, value };
}

function first(event: IcsEvent, key: string): IcsProperty | undefined {
  return event[key]?.[0];
}

function textValue(value: string | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

function parseIcsDate(prop: IcsProperty | undefined): ParsedIcsDate | null {
  if (!prop) return null;
  const raw = prop.value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return { date, dateKey: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, timeKey: "000000" };
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(raw);
  if (!dt) return null;

  const seconds = dt[6] ?? "00";
  if (dt[7] === "Z") {
    const date = new Date(
      Date.UTC(
        Number(dt[1]),
        Number(dt[2]) - 1,
        Number(dt[3]),
        Number(dt[4]),
        Number(dt[5]),
        Number(seconds),
      ),
    );
    return {
      date,
      dateKey: localDateKey(date),
      timeKey: `${dt[4]}${dt[5]}${seconds}`,
    };
  }

  return {
    date: new Date(
      Number(dt[1]),
      Number(dt[2]) - 1,
      Number(dt[3]),
      Number(dt[4]),
      Number(dt[5]),
      Number(seconds),
    ),
    dateKey: `${dt[1]}-${dt[2]}-${dt[3]}`,
    timeKey: `${dt[4]}${dt[5]}${seconds}`,
  };
}

function baseInfo(event: IcsEvent, index: number): BaseInfo | null {
  const start = parseIcsDate(first(event, "DTSTART"));
  if (!start) return null;
  const title = textValue(first(event, "SUMMARY")?.value) ?? "Untitled event";
  return {
    uid: textValue(first(event, "UID")?.value) ?? `${title}-${start.dateKey}-${index}`,
    title,
    start,
    end: parseIcsDate(first(event, "DTEND")),
    status: textValue(first(event, "STATUS")?.value) ?? "CONFIRMED",
    location: textValue(first(event, "LOCATION")?.value),
    description: textValue(first(event, "DESCRIPTION")?.value),
  };
}

function toExternalEvent(
  info: BaseInfo,
  startsAt: Date,
  dateKey: string,
  source: ExternalCalendarEvent["source"],
): ExternalCalendarEvent {
  const dateParts = { date: startsAt, dateKey, timeKey: info.start.timeKey };
  return {
    uid: info.uid,
    key: occurrenceKey(info.uid, dateParts),
    title: info.title,
    startsAt,
    endsAt: source === "rrule" ? null : info.end?.date ?? null,
    dateKey,
    location: info.location,
    description: info.description,
    source,
    operationalNoise: isOperationalNoise(info.title, info.location),
  };
}

function occurrenceKey(uid: string, parsed: ParsedIcsDate): string {
  return `${uid}|${parsed.dateKey}|${parsed.timeKey}`;
}

function parseRRule(value: string | undefined): RRule {
  const out: RRule = {};
  if (!value) return out;
  for (const part of value.split(";")) {
    const [key, val] = part.split("=");
    if (key && val != null) out[key.toUpperCase()] = val;
  }
  return out;
}

function rruleUntil(rrule: RRule): Date | null {
  return parseIcsDate(rrule.UNTIL ? { name: "UNTIL", params: {}, value: rrule.UNTIL } : undefined)?.date ?? null;
}

function parseExdates(event: IcsEvent): Set<string> {
  const out = new Set<string>();
  for (const prop of event.EXDATE ?? []) {
    for (const part of prop.value.split(",")) {
      const parsed = parseIcsDate({ ...prop, value: part });
      if (parsed) out.add(`${parsed.dateKey}|${parsed.timeKey}`);
    }
  }
  return out;
}

function dateWithin(date: Date, start: Date, end: Date): boolean {
  const day = atMidnight(date);
  return day >= atMidnight(start) && day <= atMidnight(end);
}

function addTimeOfDay(day: Date, timeSource: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
  );
}

function matchesRRuleDay(candidate: Date, start: Date, rrule: RRule): boolean {
  const interval = Number(rrule.INTERVAL ?? "1");
  const freq = rrule.FREQ ?? "DAILY";
  const byDay = parseByDay(rrule.BYDAY);
  const byMonth = rrule.BYMONTH ? new Set(rrule.BYMONTH.split(",").map(Number)) : null;
  const byMonthDay = rrule.BYMONTHDAY ? new Set(rrule.BYMONTHDAY.split(",").map(Number)) : null;

  if (candidate < atMidnight(start)) return false;
  if (byMonth && !byMonth.has(candidate.getMonth() + 1)) return false;
  if (byMonthDay && !byMonthDay.has(candidate.getDate())) return false;
  if (!matchesByDay(candidate, byDay)) return false;

  if (freq === "DAILY") {
    return daysBetweenDateKeys(localDateKey(start), localDateKey(candidate)) % interval === 0;
  }
  if (freq === "WEEKLY") {
    const weeks = Math.floor(daysBetweenDateKeys(localDateKey(start), localDateKey(candidate)) / 7);
    const weekdayOk = byDay.length > 0 ? matchesByDay(candidate, byDay) : candidate.getDay() === start.getDay();
    return weeks % interval === 0 && weekdayOk;
  }
  if (freq === "MONTHLY") {
    const months = monthsBetween(start, candidate);
    if (months % interval !== 0) return false;
    if (!rrule.BYMONTHDAY && !rrule.BYDAY) return candidate.getDate() === start.getDate();
    return true;
  }
  if (freq === "YEARLY") {
    const years = candidate.getFullYear() - start.getFullYear();
    if (years % interval !== 0) return false;
    if (!rrule.BYMONTH && candidate.getMonth() !== start.getMonth()) return false;
    if (!rrule.BYMONTHDAY && !rrule.BYDAY) return candidate.getDate() === start.getDate();
    return true;
  }
  return false;
}

const dayIndex: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseByDay(value: string | undefined): { ord: number | null; day: string }[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => {
      const m = /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(part);
      return m ? { ord: m[1] ? Number(m[1]) : null, day: m[2] } : null;
    })
    .filter((part): part is { ord: number | null; day: string } => part !== null);
}

function matchesByDay(date: Date, rules: { ord: number | null; day: string }[]): boolean {
  if (rules.length === 0) return true;
  return rules.some((rule) => {
    if (dayIndex[rule.day] !== date.getDay()) return false;
    if (rule.ord === null) return true;
    if (rule.ord > 0) return nthWeekdayOfMonth(date) === rule.ord;
    return lastWeekdayOrdinal(date) === rule.ord;
  });
}

function nthWeekdayOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function lastWeekdayOrdinal(date: Date): number {
  let ordinal = 0;
  for (let day = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); day >= 1; day--) {
    const cur = new Date(date.getFullYear(), date.getMonth(), day);
    if (cur.getDay() === date.getDay()) ordinal -= 1;
    if (day === date.getDate()) return ordinal;
  }
  return ordinal;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function scoreExistingMatch(
  event: ExternalCalendarEvent,
  existing: ExistingCalendarEvent,
): ExternalEventMatch {
  const titleScore = titleSimilarity(event.title, existing.title);
  const dateDistanceDays = Math.abs(
    daysBetweenDateKeys(event.dateKey, localDateKey(existing.eventStart)),
  );
  return {
    id: existing.id,
    title: existing.title,
    eventStart: existing.eventStart,
    location: existing.location,
    pcoEventId: existing.pcoEventId,
    titleScore,
    dateDistanceDays,
  };
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const aTokens = new Set(na.split(" "));
  const bTokens = new Set(nb.split(" "));
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isOperationalNoise(title: string, location: string | null): boolean {
  const text = `${title} ${location ?? ""}`.toLowerCase();
  return [
    /\bpin schedule\b/,
    /\bpin:/,
    /\bkey card\b/,
    /front desk/,
    /\bworking\b/,
    /\boff\b/,
    /office closed/,
    /accountant/,
    /indoor playground open to public/,
    /worship team practice/,
    /video announcement filming/,
    /sail live class/,
    /\bworship service\b/,
    /kids'? church/,
    /\bcommunion\b/,
    /staff chapel/,
    /staff meeting/,
    /fmt prep/,
    /recycling/,
    /facilities/,
    /volunteering in the office/,
    /chapel- randy/,
    /carpet clean/,
    /cleaning/,
    /setup|set up/,
    /room reserved/,
    /macro office doors/,
    /interval.*doors/,
    /using.*parking lot/,
    /counters- chapel/,
    /flag half-staff/,
  ].some((pattern) => pattern.test(text));
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetweenDateKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((aUtc - bUtc) / 86400000);
}
