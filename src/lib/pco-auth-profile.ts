/**
 * Small, network-free helpers for Planning Center OpenID Connect claims.
 * Keeping this parsing separate makes the church/org boundary easy to test.
 */
export type PlanningCenterIdentity = {
  userId: string;
  organizationId: string;
  organizationName: string | null;
  name: string;
  email: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parsePlanningCenterIdentity(
  profile: Record<string, unknown> | undefined,
): PlanningCenterIdentity | null {
  if (!profile) return null;
  const userId = text(profile.sub);
  const organizationId =
    text(profile.organization_id) ??
    (typeof profile.organization_id === "number"
      ? String(profile.organization_id)
      : null);
  const email = text(profile.email);
  const name = text(profile.name);
  if (!userId || !organizationId || !email || !name) return null;

  return {
    userId,
    organizationId,
    organizationName: text(profile.organization_name),
    name,
    email: normalizeEmail(email),
  };
}

export function belongsToOrganization(
  identity: PlanningCenterIdentity,
  allowedOrganizationId: string,
): boolean {
  return identity.organizationId === allowedOrganizationId.trim();
}
