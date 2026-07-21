export type EventOverviewItem = {
  id: string;
  title: string;
  status: string;
  eventStartMs: number;
};

export type EventDuplicateGroup<T extends EventOverviewItem> = {
  key: string;
  title: string;
  eventStartMs: number;
  rows: T[];
};

export type EventRepeatGroup<T extends EventOverviewItem> = {
  key: string;
  title: string;
  firstEventMs: number;
  lastEventMs: number;
  duplicateDateCount: number;
  rows: T[];
};

const TERMINAL_STATUSES = new Set(["archived", "cancelled", "declined"]);
const REVIEW_STATUSES = new Set(["submitted", "triaged", "needs_info"]);
const PROMOTING_STATUSES = new Set([
  "approved",
  "in_production",
  "proof",
  "scheduled",
  "published",
]);

export function normalizeEventTitle(title: string): string {
  return title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function eventLocalDateKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMidnightMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function sortEvents<T extends EventOverviewItem>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => a.eventStartMs - b.eventStartMs || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

export function groupExactEventDuplicates<T extends EventOverviewItem>(rows: T[]): EventDuplicateGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const titleKey = normalizeEventTitle(row.title);
    if (!titleKey) continue;
    const key = `${titleKey}|${eventLocalDateKey(row.eventStartMs)}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const sorted = sortEvents(group);
      return {
        key,
        title: sorted[0].title,
        eventStartMs: sorted[0].eventStartMs,
        rows: sorted,
      };
    })
    .sort((a, b) => a.eventStartMs - b.eventStartMs || a.title.localeCompare(b.title));
}

export function groupRepeatedEventTitles<T extends EventOverviewItem>(
  rows: T[],
  minimumOccurrences = 3,
): EventRepeatGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeEventTitle(row.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length >= minimumOccurrences)
    .map(([key, group]) => {
      const sorted = sortEvents(group);
      const dates = new Map<string, number>();
      for (const row of sorted) {
        const dateKey = eventLocalDateKey(row.eventStartMs);
        dates.set(dateKey, (dates.get(dateKey) ?? 0) + 1);
      }
      return {
        key,
        title: sorted[0].title,
        firstEventMs: sorted[0].eventStartMs,
        lastEventMs: sorted[sorted.length - 1].eventStartMs,
        duplicateDateCount: [...dates.values()].filter((count) => count > 1).length,
        rows: sorted,
      };
    })
    .sort((a, b) => a.firstEventMs - b.firstEventMs || a.title.localeCompare(b.title));
}

export function buildEventsFocus<T extends EventOverviewItem>(
  rows: T[],
  today = new Date(),
  horizonDays = 60,
) {
  const todayMs = localMidnightMs(today);
  const horizonMs = todayMs + horizonDays * 86_400_000;
  const upcoming = sortEvents(rows.filter((row) => row.eventStartMs >= todayMs));
  const activeUpcoming = upcoming.filter((row) => !TERMINAL_STATUSES.has(row.status));
  const cancelledUpcoming = upcoming.filter((row) => row.status === "cancelled");
  const nearTerm = activeUpcoming.filter((row) => row.eventStartMs <= horizonMs);
  const duplicateGroups = groupExactEventDuplicates(nearTerm);
  const duplicateIds = new Set(duplicateGroups.flatMap((group) => group.rows.map((row) => row.id)));
  const repeatedGroups = groupRepeatedEventTitles(activeUpcoming);
  const repeatedIds = new Set(repeatedGroups.flatMap((group) => group.rows.map((row) => row.id)));

  const needsDecision = nearTerm.filter(
    (row) => REVIEW_STATUSES.has(row.status) && !duplicateIds.has(row.id) && !repeatedIds.has(row.id),
  );
  const promotingNow = nearTerm.filter(
    (row) => PROMOTING_STATUSES.has(row.status) && !duplicateIds.has(row.id) && !repeatedIds.has(row.id),
  );
  const later = activeUpcoming.filter((row) => row.eventStartMs > horizonMs);

  return {
    activeUpcoming,
    cancelledUpcoming,
    duplicateGroups,
    repeatedGroups,
    needsDecision,
    promotingNow,
    later,
    reviewTotal: activeUpcoming.filter((row) => REVIEW_STATUSES.has(row.status)).length,
    promotingTotal: activeUpcoming.filter((row) => PROMOTING_STATUSES.has(row.status)).length,
  };
}
