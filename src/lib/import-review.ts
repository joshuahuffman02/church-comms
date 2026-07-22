export type ImportRecommendation = "accept" | "ignore" | "review";

export type ImportPatternRow = {
  key: string;
  title: string;
  recommendation: ImportRecommendation;
};

export type ImportPattern = {
  id: string;
  title: string;
  count: number;
  keys: string[];
  recommendation: ImportRecommendation;
};

/** Stable, human-readable grouping key for repeated calendar occurrences. */
export function normalizeImportPatternTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Summarize repeated titles without silently acting on an entire series. */
export function buildImportPatterns(
  rows: readonly ImportPatternRow[],
  minimumOccurrences = 2,
): ImportPattern[] {
  const groups = new Map<string, ImportPatternRow[]>();
  for (const row of rows) {
    const id = normalizeImportPatternTitle(row.title);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length >= minimumOccurrences)
    .map(([id, group]) => {
      const recommendationCounts = group.reduce(
        (counts, row) => {
          counts[row.recommendation] += 1;
          return counts;
        },
        { accept: 0, ignore: 0, review: 0 },
      );
      const recommendation = (["review", "accept", "ignore"] as ImportRecommendation[]).sort(
        (a, b) => recommendationCounts[b] - recommendationCounts[a],
      )[0] ?? "review";
      return {
        id,
        title: group[0].title,
        count: group.length,
        keys: group.map((row) => row.key),
        recommendation,
      };
    })
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export type PcoReviewEvent = {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  registrationUrl: string | null;
  approvalStatus: string;
};

export type ExistingPcoReviewEvent = {
  title: string;
  eventStart: Date;
  eventEnd: Date | null;
  location: string | null;
  registrationUrl: string | null;
  pcoApprovalStatus: string | null;
};

function dayKey(value: Date | null): string | null {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function clean(value: string | null): string {
  return (value ?? "").trim();
}

/** Explain only the Planning Center-owned fields that changed. */
export function describePcoChanges(
  incoming: PcoReviewEvent,
  existing: ExistingPcoReviewEvent,
): string[] {
  const changes: string[] = [];
  if (clean(incoming.name) !== clean(existing.title)) changes.push("title");
  if (dayKey(incoming.startsAt) !== dayKey(existing.eventStart)) changes.push("start date");
  if (dayKey(incoming.endsAt) !== dayKey(existing.eventEnd)) changes.push("end date");
  if (clean(incoming.location) !== clean(existing.location)) changes.push("room or location");
  if (clean(incoming.registrationUrl) !== clean(existing.registrationUrl)) changes.push("registration link");
  if (incoming.approvalStatus !== (existing.pcoApprovalStatus ?? "")) changes.push("approval status");
  return changes;
}
