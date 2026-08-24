export type RequestSource = "pco" | "calendar" | "request" | "local";

export type RequestProvenanceInput = {
  pcoEventId?: string | null;
  externalCalendarKey?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requester?: { name: string | null } | null;
  owner?: { name: string | null } | null;
};

export type RequestProvenance = {
  source: RequestSource;
  sourceLabel: string;
  requesterLabel: string;
  ownerLabel: string;
};

export function requestSource(input: RequestProvenanceInput): RequestSource {
  if (input.pcoEventId) return "pco";
  if (input.externalCalendarKey) return "calendar";
  if (input.requester?.name || input.requesterName || input.requesterEmail) return "request";
  return "local";
}

export function sourceLabel(source: RequestSource): string {
  if (source === "pco") return "Planning Center";
  if (source === "calendar") return "Calendar import";
  if (source === "request") return "Request form";
  return "Added here";
}

export function describeRequestProvenance(
  input: RequestProvenanceInput,
  effectiveOwnerName?: string | null,
): RequestProvenance {
  const source = requestSource(input);
  const requesterName = input.requester?.name?.trim() || input.requesterName?.trim();
  const imported = source === "pco" || source === "calendar";

  return {
    source,
    sourceLabel: sourceLabel(source),
    requesterLabel:
      requesterName ||
      (imported ? "Imported — no requester" : "No requester recorded"),
    ownerLabel:
      effectiveOwnerName?.trim() || input.owner?.name?.trim() || "Unassigned",
  };
}

export function requestAttentionLabel(status: string): string {
  if (status === "submitted") return "Needs triage";
  if (status === "needs_info") return "Missing details";
  if (status === "triaged") return "Plan decision";
  if (status === "proof") return "Proof review";
  if (status === "approved" || status === "in_production") return "Production moving";
  if (status === "scheduled") return "Scheduled";
  if (status === "published") return "Published";
  return "Review the event";
}
