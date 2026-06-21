export const REQUEST_STATUSES = [
  "submitted","triaged","approved","in_production","proof","scheduled","published","archived",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PROMOTABLE_REQUEST_STATUSES: string[] = [
  "approved",
  "in_production",
  "proof",
  "scheduled",
  "published",
];

// side states outside the linear flow:
export const REQUEST_SIDE_STATUSES = ["needs_info","declined","cancelled"] as const;

export const REQUEST_STATUS_META: Record<string, { label: string; color: string }> = {
  submitted:     { label: "Submitted",     color: "#94a3b8" },
  triaged:       { label: "Triaged",       color: "#38bdf8" },
  approved:      { label: "Approved",      color: "#a78bfa" },
  in_production: { label: "In Production",  color: "#fb923c" },
  proof:         { label: "Proof",         color: "#fbbf24" },
  scheduled:     { label: "Scheduled",     color: "#34d399" },
  published:     { label: "Published",     color: "#10b981" },
  archived:      { label: "Archived",      color: "#cbd5e1" },
  needs_info:    { label: "Needs Info",    color: "#f59e0b" },
  declined:      { label: "Declined",      color: "#ef4444" },
  cancelled:     { label: "Cancelled",     color: "#9ca3af" },
};

export function nextRequestStatus(s: string): RequestStatus | null {
  const i = REQUEST_STATUSES.indexOf(s as RequestStatus);
  return i >= 0 && i < REQUEST_STATUSES.length - 1 ? REQUEST_STATUSES[i + 1] : null;
}
export function prevRequestStatus(s: string): RequestStatus | null {
  const i = REQUEST_STATUSES.indexOf(s as RequestStatus);
  return i > 0 ? REQUEST_STATUSES[i - 1] : null;
}

export const DELIVERABLE_STATUSES = [
  "to_design","in_progress","proof","ready","scheduled","published","skipped",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const DELIVERABLE_STATUS_META: Record<string, { label: string; color: string }> = {
  to_design:   { label: "To design",   color: "#94a3b8" },
  in_progress: { label: "In progress", color: "#fb923c" },
  proof:       { label: "Proof",       color: "#fbbf24" },
  ready:       { label: "Ready",       color: "#34d399" },
  scheduled:   { label: "Scheduled",   color: "#38bdf8" },
  published:   { label: "Published",   color: "#10b981" },
  skipped:     { label: "Skipped",     color: "#cbd5e1" },
};
// linear non-skipped progression for the "advance" toggle:
export const DELIVERABLE_FLOW = ["to_design","in_progress","ready","published"] as const;
export function nextDeliverableStatus(s: string): string | null {
  const i = DELIVERABLE_FLOW.indexOf(s as (typeof DELIVERABLE_FLOW)[number]);
  return i >= 0 && i < DELIVERABLE_FLOW.length - 1 ? DELIVERABLE_FLOW[i + 1] : null;
}
