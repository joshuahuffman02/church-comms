import type { ProductionNeed } from "./production-needs";

export type FocusEntityType = "request" | "deliverable";
export type FocusDisposition = "done" | "snoozed" | "not_mine";

export type FocusCandidate = {
  key: string;
  entityType: FocusEntityType;
  entityId: string;
  fingerprint: string;
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: "rose" | "amber" | "violet" | "sky";
  sourceLabel: string;
  requesterLabel: string;
  ownerLabel: string;
  productionNeeds: ProductionNeed[];
};

export type FocusActivity = {
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
};

type FocusMetadata = {
  fingerprint?: string;
  snoozedUntil?: string;
};

function metadataObject(value: unknown): FocusMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as FocusMetadata;
}

export function focusActionName(disposition: FocusDisposition): string {
  return `focus_${disposition}`;
}

export function visibleFocusCandidates(
  candidates: FocusCandidate[],
  activities: FocusActivity[],
  now: Date,
  limit = 3,
): FocusCandidate[] {
  const latest = new Map<string, FocusActivity>();
  for (const activity of activities) {
    if (!activity.entityId) continue;
    const key = `${activity.entityType}:${activity.entityId}`;
    if (!latest.has(key)) latest.set(key, activity);
  }

  const visible: FocusCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);

    const activity = latest.get(candidate.key);
    if (activity) {
      const metadata = metadataObject(activity.metadata);
      const sameState = metadata.fingerprint === candidate.fingerprint;
      if (sameState && (activity.action === "focus_done" || activity.action === "focus_not_mine")) {
        continue;
      }
      if (sameState && activity.action === "focus_snoozed") {
        const until = metadata.snoozedUntil ? new Date(metadata.snoozedUntil) : null;
        if (until && !Number.isNaN(until.getTime()) && until > now) continue;
      }
    }

    visible.push(candidate);
    if (visible.length >= limit) break;
  }
  return visible;
}
