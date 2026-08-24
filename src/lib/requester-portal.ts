export const REQUESTER_STATUS: Record<
  string,
  { label: string; description: string; color: string }
> = {
  submitted: {
    label: "Received",
    description: "The communications team has your request.",
    color: "#64748b",
  },
  triaged: {
    label: "Being reviewed",
    description: "The team is checking the details and advertising plan.",
    color: "#0284c7",
  },
  approved: {
    label: "Approved",
    description: "The request is approved and its channel plan is taking shape.",
    color: "#7c3aed",
  },
  in_production: {
    label: "In preparation",
    description: "Copy, graphics, video, or scheduling work is underway.",
    color: "#ea580c",
  },
  proof: {
    label: "Final check",
    description: "The team is reviewing the work before it is shared.",
    color: "#ca8a04",
  },
  scheduled: {
    label: "Scheduled",
    description: "Advertising placements are scheduled.",
    color: "#059669",
  },
  published: {
    label: "Being advertised",
    description: "Advertising is live or has been shared.",
    color: "#047857",
  },
  archived: {
    label: "Complete",
    description: "This request is complete and kept here for your records.",
    color: "#64748b",
  },
  needs_info: {
    label: "Needs information",
    description: "The communications team needs another detail before continuing.",
    color: "#d97706",
  },
  declined: {
    label: "Not moving forward",
    description: "The communications team was unable to take on this request.",
    color: "#dc2626",
  },
  cancelled: {
    label: "Cancelled",
    description: "This request is no longer active.",
    color: "#64748b",
  },
};

export function requesterStatus(status: string) {
  return (
    REQUESTER_STATUS[status] ?? {
      label: "In progress",
      description: "The communications team is working on this request.",
      color: "#64748b",
    }
  );
}

export function requesterDeliverableStatus(status: string): {
  label: string;
  description: string;
  color: string;
} {
  switch (status) {
    case "published":
      return {
        label: "Advertised",
        description: "This placement has been shared.",
        color: "#047857",
      };
    case "scheduled":
      return {
        label: "Scheduled",
        description: "This placement is scheduled to go out.",
        color: "#0284c7",
      };
    case "ready":
      return {
        label: "Ready",
        description: "The content is ready to be scheduled or shared.",
        color: "#059669",
      };
    case "proof":
      return {
        label: "Final check",
        description: "The team is reviewing this placement.",
        color: "#ca8a04",
      };
    case "in_progress":
      return {
        label: "In preparation",
        description: "The team is preparing this placement.",
        color: "#ea580c",
      };
    default:
      return {
        label: "Planned",
        description: "This channel is included in the proposed plan.",
        color: "#64748b",
      };
  }
}

export const REQUESTER_EDIT_BLOCKED_STATUSES = new Set([
  "archived",
  "cancelled",
  "declined",
]);
