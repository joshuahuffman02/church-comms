import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import {
  GuidedIntakeForm,
  type RecentRequestTemplate,
} from "@/components/guided-intake-form";
import type { IntakePreviewChannel } from "@/lib/smart-workflow";

const dateInputValue = (date: Date | null): string => {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

function tierEligibility(value: unknown): number[] {
  if (!Array.isArray(value)) return [1, 2, 3];
  return value.filter(
    (tier): tier is number =>
      typeof tier === "number" && Number.isInteger(tier) && tier >= 1 && tier <= 3,
  );
}

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, user, channelRows] = await Promise.all([
    searchParams,
    getSessionUser(),
    db.channel.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        key: true,
        name: true,
        tierEligibility: true,
        defaultPublishOffsetDays: true,
        productionLeadDays: true,
      },
    }),
  ]);

  const recentRows = user
    ? await db.request.findMany({
        where: {
          OR: [
            { requesterId: user.id },
            ...(user.email
              ? [
                  {
                    requesterId: null,
                    requesterEmail: user.email,
                    pcoEventId: null,
                    externalCalendarKey: null,
                  },
                ]
              : []),
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          description: true,
          whoIsItFor: true,
          eventStart: true,
          location: true,
          needsRegistration: true,
          registrationUrl: true,
          cost: true,
          registrationClosesAt: true,
          nextStepText: true,
          ministries: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            take: 1,
            select: { name: true },
          },
        },
      })
    : [];

  const channels: IntakePreviewChannel[] = channelRows.map((channel) => ({
    key: channel.key,
    name: channel.name,
    tierEligibility: tierEligibility(channel.tierEligibility),
    defaultPublishOffsetDays: channel.defaultPublishOffsetDays,
    productionLeadDays: channel.productionLeadDays,
  }));

  const recentRequests: RecentRequestTemplate[] = recentRows.map((request) => ({
    id: request.id,
    title: request.title,
    description: request.description ?? "",
    ministry: request.ministries[0]?.name ?? "",
    whoIsItFor: request.whoIsItFor,
    eventStart: dateInputValue(request.eventStart),
    location: request.location ?? "",
    needsRegistration: request.needsRegistration,
    registrationUrl: request.registrationUrl ?? "",
    cost: request.cost ?? "",
    registrationClosesAt: dateInputValue(request.registrationClosesAt),
    nextStep: request.nextStepText ?? "",
  }));

  return (
    <div className="mx-auto max-w-4xl py-3 sm:py-6">
      <header className="mb-6 text-center">
        <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Communication request</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">
          Tell us once. We’ll shape the plan. ✨
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-muted">
          About three minutes. Your answers create an explainable starting plan, and the
          comms team reviews new requests Mon &amp; Thu.
        </p>
        {user && (
          <Link
            href="/my-requests"
            className="mt-3 inline-flex text-sm font-bold text-sky-700 hover:underline"
          >
            ← Back to My Requests
          </Link>
        )}
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          A few required details were missing. Your on-device draft may still be available below.
        </div>
      )}

      <GuidedIntakeForm
        user={user?.email ? { name: user.name ?? null, email: user.email } : null}
        canImport={Boolean(user && isEditor(user.roles))}
        channels={channels}
        recentRequests={recentRequests}
      />

      <p className="mt-4 text-center text-xs leading-relaxed text-muted">
        Nothing is published automatically. The communication team reviews and can adjust every suggested channel and date.
      </p>
    </div>
  );
}
