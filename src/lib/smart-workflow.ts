const FINISHED_PIECE_STATUSES = new Set(["ready", "scheduled", "published", "skipped"]);
const SCHEDULED_PIECE_STATUSES = new Set(["scheduled", "published", "skipped"]);

export type ReadinessPiece = {
  status: string;
  ownerId?: string | null;
};

export type ReadinessInput = {
  status: string;
  description?: string | null;
  nextStepText?: string | null;
  ownerId?: string | null;
  noPromo?: boolean;
  approvals: { status: string }[];
  pieces: ReadinessPiece[];
  guardrailCount: number;
  hasFinalAsset: boolean;
};

export type ReadinessCheck = {
  key: string;
  label: string;
  detail: string;
  complete: boolean;
  href: string;
};

export type NextAction = {
  title: string;
  detail: string;
  href: string;
  tone: "urgent" | "attention" | "steady" | "ready";
};

export type RequestReadiness = {
  checks: ReadinessCheck[];
  complete: number;
  total: number;
  percent: number;
  label: string;
  nextAction: NextAction;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Turn the event's existing workflow signals into one honest, explainable
 * summary. The score is deliberately a checklist—not an opaque prediction.
 */
export function requestReadiness(input: ReadinessInput): RequestReadiness {
  const pieces = input.pieces.filter((piece) => piece.status !== "skipped");
  const pendingApprovals = input.approvals.filter((approval) => approval.status === "pending");
  const proofPieces = pieces.filter((piece) => piece.status === "proof");
  const unfinishedPieces = pieces.filter((piece) => !FINISHED_PIECE_STATUSES.has(piece.status));
  const readyToSchedule = pieces.filter((piece) => piece.status === "ready");
  const ownerCoversPieces = Boolean(input.ownerId) || pieces.every((piece) => Boolean(piece.ownerId));

  const checks: ReadinessCheck[] = [
    {
      key: "details",
      label: "Message is clear",
      detail: "An event description and one public next step are present.",
      complete: hasText(input.description) && (hasText(input.nextStepText) || Boolean(input.noPromo)),
      href: "#event-overview",
    },
    {
      key: "owner",
      label: "Someone owns the plan",
      detail: "The event or each individual piece has an owner.",
      complete: Boolean(input.noPromo) || ownerCoversPieces,
      href: "#event-owner",
    },
    {
      key: "approval",
      label: "Approvals are clear",
      detail: "No approval decisions are waiting.",
      complete: pendingApprovals.length === 0,
      href: "#approvals",
    },
    {
      key: "channels",
      label: "Channels are chosen",
      detail: "The event has a concrete channel plan.",
      complete: Boolean(input.noPromo) || pieces.length > 0,
      href: "#channels",
    },
    {
      key: "creative",
      label: "Creative is ready",
      detail: "Every piece is ready or finished, or final artwork is attached.",
      complete:
        Boolean(input.noPromo) ||
        (pieces.length > 0 &&
          (input.hasFinalAsset || pieces.every((piece) => FINISHED_PIECE_STATUSES.has(piece.status)))),
      href: "#pieces",
    },
    {
      key: "schedule",
      label: "Placements are scheduled",
      detail: "Every planned piece is scheduled or complete.",
      complete:
        Boolean(input.noPromo) ||
        (pieces.length > 0 && pieces.every((piece) => SCHEDULED_PIECE_STATUSES.has(piece.status))),
      href: "#timeline",
    },
  ];

  let nextAction: NextAction;
  if (input.noPromo) {
    nextAction = {
      title: "No promotion is needed",
      detail: "This event is intentionally kept out of the communications queue.",
      href: "#event-overview",
      tone: "ready",
    };
  } else if (input.status === "needs_info") {
    nextAction = {
      title: "Collect the missing event details",
      detail: "The request is paused until the requester or team fills in what is missing.",
      href: "#event-overview",
      tone: "urgent",
    };
  } else if (pendingApprovals.length > 0) {
    nextAction = {
      title: `Resolve ${pendingApprovals.length} pending ${pendingApprovals.length === 1 ? "approval" : "approvals"}`,
      detail: "The request cannot move forward until these decisions are made.",
      href: "#approvals",
      tone: "urgent",
    };
  } else if (["submitted", "triaged"].includes(input.status)) {
    nextAction = {
      title: input.status === "submitted" ? "Review and triage this request" : "Approve the communication plan",
      detail: "Confirm the audience, timing, and scope before production begins.",
      href: "#status",
      tone: "attention",
    };
  } else if (!ownerCoversPieces) {
    nextAction = {
      title: "Assign an owner",
      detail: "Give the event one coordinator so its channel work has a clear home.",
      href: "#event-owner",
      tone: "attention",
    };
  } else if (input.guardrailCount > 0) {
    nextAction = {
      title: `Resolve ${input.guardrailCount} ${input.guardrailCount === 1 ? "heads-up" : "heads-up items"}`,
      detail: "A capacity, timing, or audience rule needs a team decision.",
      href: "#heads-up",
      tone: "urgent",
    };
  } else if (pieces.length === 0) {
    nextAction = {
      title: "Choose the communication channels",
      detail: "Build the concrete plan for where this event should appear.",
      href: "#channels",
      tone: "attention",
    };
  } else if (proofPieces.length > 0) {
    nextAction = {
      title: `Review ${proofPieces.length} ${proofPieces.length === 1 ? "proof" : "proofs"}`,
      detail: "Approve the work or send it back with a clear status change.",
      href: "#pieces",
      tone: "urgent",
    };
  } else if (unfinishedPieces.length > 0) {
    nextAction = {
      title: `Move ${unfinishedPieces.length} ${unfinishedPieces.length === 1 ? "piece" : "pieces"} forward`,
      detail: "Production work is ready to be started or completed.",
      href: "#pieces",
      tone: "attention",
    };
  } else if (readyToSchedule.length > 0) {
    nextAction = {
      title: `Schedule ${readyToSchedule.length} ready ${readyToSchedule.length === 1 ? "piece" : "pieces"}`,
      detail: "The creative is approved; finish the publishing handoff.",
      href: "#pieces",
      tone: "steady",
    };
  } else {
    nextAction = {
      title: "Everything is moving",
      detail: "The plan is scheduled or complete. Keep an eye on the remaining dates.",
      href: "#timeline",
      tone: "ready",
    };
  }

  const complete = checks.filter((check) => check.complete).length;
  const total = checks.length;
  const percent = Math.round((complete / total) * 100);
  const label =
    complete === total
      ? "Ready to go"
      : complete >= total - 1
        ? "Almost ready"
        : complete >= Math.ceil(total / 2)
          ? "In motion"
          : "Getting started";

  return { checks, complete, total, percent, label, nextAction };
}

export type IntakePreviewChannel = {
  key: string;
  name: string;
  tierEligibility: number[];
  defaultPublishOffsetDays: number;
  productionLeadDays: number;
};

export type IntakePlanPreview = {
  tier: number;
  audienceLabel: string;
  channels: IntakePreviewChannel[];
  reason: string;
  timing: string;
  leadWarning: string | null;
};

export function audienceTier(audience: string): number {
  if (audience === "whole_church") return 1;
  if (audience === "ministry") return 2;
  return 3;
}

function localDateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDaysBetween(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.ceil((endDay - startDay) / 86_400_000);
}

export function buildIntakePlanPreview({
  audience,
  eventDate,
  registrationCloseDate,
  needsRegistration,
  channels,
  today = new Date(),
}: {
  audience: string;
  eventDate: string;
  registrationCloseDate: string;
  needsRegistration: boolean;
  channels: IntakePreviewChannel[];
  today?: Date;
}): IntakePlanPreview {
  const tier = audienceTier(audience);
  const audienceLabel =
    tier === 1 ? "Whole church" : tier === 2 ? "Ministry audience" : "Focused audience";
  const eligible = channels.filter((channel) => channel.tierEligibility.includes(tier));
  const event = localDateFromInput(eventDate);
  const registrationClose = needsRegistration
    ? localDateFromInput(registrationCloseDate)
    : null;
  const deadline = registrationClose ?? event;
  const longestLead = eligible.reduce(
    (longest, channel) =>
      Math.max(longest, channel.defaultPublishOffsetDays + channel.productionLeadDays),
    0,
  );

  let timing = "Add the event date to see the suggested lead time.";
  let leadWarning: string | null = null;
  if (deadline) {
    const days = calendarDaysBetween(today, deadline);
    timing = registrationClose
      ? "The promotion schedule will work backward from registration close."
      : "The promotion schedule will work backward from the event date.";
    if (days < 0) {
      leadWarning = "This deadline has passed. The team will need a catch-up plan.";
    } else if (days < 7) {
      leadWarning = "Less than one week remains. Expect a small, focused catch-up plan.";
    } else if (days < longestLead) {
      leadWarning = `Some channels normally need about ${longestLead} days of lead time. The team may trim or re-time this plan.`;
    }
  }

  const reason =
    tier === 1
      ? "A whole-church audience qualifies for the broadest active channel plan."
      : tier === 2
        ? "A ministry audience keeps the plan focused on channels configured for ministry events."
        : "A focused audience uses the smallest channel set so the message stays relevant.";

  return {
    tier,
    audienceLabel,
    channels: eligible,
    reason,
    timing,
    leadWarning,
  };
}

export type CopyStarter = {
  key: string;
  channelName: string;
  content: string;
  recommendedLimit: number | null;
  warning: string | null;
};

function joinCopy(parts: Array<string | null | undefined>, separator = "\n\n"): string {
  const clean: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value || clean.includes(value)) continue;
    clean.push(value);
  }
  return clean.join(separator);
}

/** Practical, deterministic channel starters that never publish automatically. */
export function buildCopyStarters({
  title,
  description,
  nextStep,
  channels,
}: {
  title: string;
  description?: string | null;
  nextStep?: string | null;
  channels: Array<{ key: string; name: string }>;
}): CopyStarter[] {
  return channels.map((channel) => {
    const normalized = `${channel.key} ${channel.name}`.toLowerCase();
    let content: string;
    let recommendedLimit: number | null = null;

    if (normalized.includes("instagram") || normalized.includes("facebook") || normalized.includes("social")) {
      content = joinCopy([title, description, nextStep ? `Next step: ${nextStep}` : null]);
      recommendedLimit = 500;
    } else if (normalized.includes("video") || normalized.includes("stage")) {
      content = joinCopy([title, nextStep, description], " — ");
      recommendedLimit = 180;
    } else if (normalized.includes("loop") || normalized.includes("sign") || normalized.includes("display")) {
      content = joinCopy([title, nextStep], "\n");
      recommendedLimit = 120;
    } else if (normalized.includes("email") || normalized.includes("bulletin")) {
      content = joinCopy([title, description, nextStep ? `Next step: ${nextStep}` : null]);
      recommendedLimit = 700;
    } else {
      content = joinCopy([title, description, nextStep ? `Next step: ${nextStep}` : null]);
    }

    return {
      key: channel.key,
      channelName: channel.name.replace(/\s*\(Top 3\)$/i, ""),
      content,
      recommendedLimit,
      warning:
        recommendedLimit && content.length > recommendedLimit
          ? `This starter is ${content.length - recommendedLimit} characters over the recommended length.`
          : null,
    };
  });
}
