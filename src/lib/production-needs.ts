const CREATIVE_READY_STATUSES = new Set(["proof", "ready", "scheduled", "published"]);

export type ProductionNeed = {
  key: string;
  label: string;
  href: string;
};

export type ProductionNeedsInput = {
  requestId: string;
  channelName?: string | null;
  pieceStatus?: string | null;
  ownerReady: boolean;
  description?: string | null;
  nextStepText?: string | null;
  nextStepUrl?: string | null;
  needsRegistration?: boolean;
  registrationUrl?: string | null;
  hasChannelPlan?: boolean;
  hasChannelCopy?: boolean;
  hasCreativeAsset?: boolean;
  pendingApprovalCount?: number;
};

type ChannelRequirements = {
  copy: string;
  visual: string;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Name the concrete ingredients a channel needs in the language the team uses
 * while producing it. These are deliberately content requirements, not channel
 * names, so Home can answer "what do I need to make?".
 */
export function channelProductionRequirements(channelName: string): ChannelRequirements {
  const channel = channelName.replace(/\s*\(Top 3\)$/i, "").trim().toLowerCase();

  if (channel.includes("announcement video") || channel === "video") {
    return { copy: "Video script", visual: "Video segment" };
  }
  if (channel.includes("loop")) {
    return { copy: "Slide copy", visual: "Slide graphic" };
  }
  if (channel.includes("facebook") || channel.includes("instagram")) {
    return { copy: "Post copy", visual: "Graphic or photo" };
  }
  if (channel.includes("church app") || channel === "app") {
    return { copy: "Short blurb", visual: "Graphic or photo" };
  }
  if (channel.includes("email")) {
    return { copy: "Email blurb", visual: "Email graphic" };
  }
  if (channel.includes("banner")) {
    return { copy: "Headline", visual: "Print artwork" };
  }
  if (channel.includes("opportunities table") || channel.includes("display")) {
    return { copy: "Display copy", visual: "Display graphic" };
  }
  if (channel.includes("stage")) {
    return { copy: "Talking points", visual: "Stage slide" };
  }
  if (channel.includes("website") || channel === "web") {
    return { copy: "Web blurb", visual: "Web image" };
  }

  return { copy: "Short blurb", visual: "Graphic or photo" };
}

/**
 * Build a short, honest list of what is still missing for an event or a single
 * channel piece. The caller supplies existing workflow signals; this function
 * only translates those facts into stable, actionable labels and anchors.
 */
export function productionNeeds(input: ProductionNeedsInput): ProductionNeed[] {
  const base = `/requests/${input.requestId}`;
  const needs: ProductionNeed[] = [];
  const seen = new Set<string>();

  function add(key: string, label: string, href: string) {
    if (seen.has(key)) return;
    seen.add(key);
    needs.push({ key, label, href });
  }

  if ((input.pendingApprovalCount ?? 0) > 0) {
    add("approval", "Approval decision", `${base}#approvals`);
  }
  if (!input.ownerReady) {
    add("owner", "Owner", `${base}#event-owner`);
  }

  const hasAction =
    hasText(input.nextStepText) ||
    hasText(input.nextStepUrl) ||
    hasText(input.registrationUrl);

  if (!input.channelName) {
    if (!hasText(input.description)) {
      add("blurb", "Short blurb", `${base}#event-overview`);
    }
    if (input.needsRegistration && !hasText(input.registrationUrl)) {
      add("registration-link", "Registration link", `${base}#event-overview`);
    } else if (!hasAction) {
      add("call-to-action", "Call to action", `${base}#event-overview`);
    }
    if (input.hasChannelPlan === false) {
      add("channel-plan", "Channel plan", `${base}#channels`);
    }
    return needs;
  }

  if (input.pieceStatus === "proof") {
    add("proof", "Proof approval", `${base}#pieces`);
  }

  const requirements = channelProductionRequirements(input.channelName);
  const creativeReady = input.pieceStatus
    ? CREATIVE_READY_STATUSES.has(input.pieceStatus)
    : false;

  // The event description is useful source material, but it is not the same as
  // channel-ready post copy, slide copy, or a video script.
  if (!creativeReady && !input.hasChannelCopy) {
    add("copy", requirements.copy, `${base}#message-plan`);
  }
  if (!creativeReady && !input.hasCreativeAsset) {
    add("visual", requirements.visual, `${base}#pieces`);
  }
  if (input.needsRegistration && !hasText(input.registrationUrl)) {
    add("registration-link", "Registration link", `${base}#event-overview`);
  } else if (!hasAction) {
    add("call-to-action", "Call to action", `${base}#event-overview`);
  }

  return needs;
}
