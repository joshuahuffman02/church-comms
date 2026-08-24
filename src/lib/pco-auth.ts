import type { OIDCConfig } from "@auth/core/providers";
import type { Profile } from "next-auth";
import { db } from "@/lib/db";
import {
  belongsToOrganization,
  normalizeEmail,
  parsePlanningCenterIdentity,
  type PlanningCenterIdentity,
} from "@/lib/pco-auth-profile";
import { parseRoles } from "@/lib/roles";

const clientId = process.env.PLANNING_CENTER_OAUTH_CLIENT_ID?.trim() ?? "";
const clientSecret = process.env.PLANNING_CENTER_OAUTH_CLIENT_SECRET?.trim() ?? "";
const allowedOrganizationId =
  process.env.PLANNING_CENTER_OAUTH_ORGANIZATION_ID?.trim() ?? "";

export const planningCenterAuthEnabled = Boolean(
  clientId && clientSecret && allowedOrganizationId,
);

export const planningCenterAuthMissing = [
  !clientId ? "PLANNING_CENTER_OAUTH_CLIENT_ID" : null,
  !clientSecret ? "PLANNING_CENTER_OAUTH_CLIENT_SECRET" : null,
  !allowedOrganizationId ? "PLANNING_CENTER_OAUTH_ORGANIZATION_ID" : null,
].filter((value): value is string => value != null);

/**
 * Planning Center supports standards-based OIDC discovery. `openid` alone is
 * enough for the verified identity + organization claims used by this app; no
 * People, Calendar, or other product scope is requested for login.
 */
export const planningCenterProvider: OIDCConfig<Profile> | null =
  planningCenterAuthEnabled
    ? {
        id: "planning-center",
        name: "Planning Center",
        type: "oidc",
        issuer: "https://api.planningcenteronline.com",
        clientId,
        clientSecret,
        authorization: {
          params: {
            scope: "openid",
            prompt: "select_account",
          },
        },
        checks: ["pkce", "state", "nonce"],
        profile(profile) {
          const identity = parsePlanningCenterIdentity(profile);
          return {
            id: identity?.userId ?? String(profile.sub ?? ""),
            name: identity?.name ?? null,
            email: identity?.email ?? null,
          };
        },
      }
    : null;

export type ProvisionedPlanningCenterUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

async function claimMatchingRequests(userId: string, email: string): Promise<void> {
  // SQLite's Prisma string filters do not expose case-insensitive mode. The
  // unclaimed set is small and this one-time JS comparison safely reconnects
  // submissions made before staff login existed. Imported calendar/PCO events
  // are source records, not requester submissions, even when their source
  // contact happens to use the same email.
  const unclaimed = await db.request.findMany({
    where: {
      requesterId: null,
      requesterEmail: { not: null },
      pcoEventId: null,
      externalCalendarKey: null,
    },
    select: { id: true, requesterEmail: true },
  });
  const ids = unclaimed
    .filter(
      (request) =>
        request.requesterEmail != null &&
        normalizeEmail(request.requesterEmail) === email,
    )
    .map((request) => request.id);
  if (ids.length > 0) {
    await db.request.updateMany({
      where: { id: { in: ids }, requesterId: null },
      data: { requesterId: userId },
    });
  }
}

/**
 * Just-in-time local profile provisioning. Existing password users are linked
 * by verified email and keep their roles; brand-new PCO staff receive only the
 * requester role. A deactivated or cross-organization identity fails closed.
 */
export async function provisionPlanningCenterUser(
  identity: PlanningCenterIdentity,
): Promise<ProvisionedPlanningCenterUser | null> {
  if (
    !allowedOrganizationId ||
    !belongsToOrganization(identity, allowedOrganizationId)
  ) {
    return null;
  }

  const email = normalizeEmail(identity.email);
  const byPcoId = await db.user.findUnique({
    where: { pcoUserId: identity.userId },
  });

  let localUser = byPcoId;
  if (!localUser) {
    const byEmail = await db.user.findUnique({ where: { email } });
    if (byEmail?.pcoUserId && byEmail.pcoUserId !== identity.userId) {
      return null;
    }
    localUser = byEmail;
  }

  if (localUser && !localUser.active) return null;
  if (
    localUser?.pcoOrganizationId &&
    localUser.pcoOrganizationId !== identity.organizationId
  ) {
    return null;
  }

  // Do not take over another local user's email if a PCO user changes theirs.
  const emailOwner = await db.user.findUnique({ where: { email } });
  const safeEmail =
    emailOwner && emailOwner.id !== localUser?.id ? localUser?.email : email;

  const saved = localUser
    ? await db.user.update({
        where: { id: localUser.id },
        data: {
          name: identity.name,
          email: safeEmail ?? localUser.email,
          pcoUserId: identity.userId,
          pcoOrganizationId: identity.organizationId,
          lastLoginAt: new Date(),
        },
      })
    : await db.user.create({
        data: {
          name: identity.name,
          email,
          pcoUserId: identity.userId,
          pcoOrganizationId: identity.organizationId,
          lastLoginAt: new Date(),
          roles: ["requester"],
          active: true,
        },
      });

  await claimMatchingRequests(saved.id, normalizeEmail(saved.email));

  return {
    id: saved.id,
    name: saved.name,
    email: saved.email,
    roles: parseRoles(saved.roles),
  };
}
