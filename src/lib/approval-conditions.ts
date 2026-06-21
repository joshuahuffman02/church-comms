/** The five ApprovalRule condition types (shared by the action + settings UI). */
export const APPROVAL_CONDITION_TYPES = [
  "tier1",
  "channel",
  "stage",
  "all_church_email",
  "sensitive",
] as const;

export type ApprovalConditionType = (typeof APPROVAL_CONDITION_TYPES)[number];
