import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { normalizeEmail } from "@/lib/pco-auth-profile";
import {
  REQUESTER_EDIT_BLOCKED_STATUSES,
  requesterDeliverableStatus,
  requesterStatus,
} from "@/lib/requester-portal";

const formatDate = (date: Date | null | undefined) =>
  date?.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }) ?? "—";

const formatShortDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function uniqueDates(dates: Date[]) {
  return Array.from(
    new Map(
      dates
        .sort((a, b) => a.getTime() - b.getTime())
        .map((date) => [
          `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
          date,
        ]),
    ).values(),
  );
}

export default async function MyRequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; saved?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=%2Fmy-requests");
  const { id } = await params;
  const message = await searchParams;

  const request = await db.request.findFirst({
    where: {
      id,
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
    include: {
      deliverables: {
        where: { status: { not: "skipped" } },
        include: {
          channel: {
            select: { name: true, color: true, type: true },
          },
          touches: {
            where: { status: { not: "skipped" } },
            orderBy: { scheduledAt: "asc" },
          },
        },
        orderBy: [{ productionDueAt: "asc" }, { instanceDate: "asc" }],
      },
      tasks: {
        where: { source: "requester_change", status: "todo" },
        select: { id: true },
      },
    },
  });

  if (!request) notFound();
  // Claim a legacy email-only request the first time its owner opens it.
  if (
    request.requesterId == null &&
    request.requesterEmail &&
    request.pcoEventId == null &&
    request.externalCalendarKey == null &&
    user.email &&
    normalizeEmail(request.requesterEmail) === normalizeEmail(user.email)
  ) {
    await db.request.update({
      where: { id: request.id },
      data: { requesterId: user.id },
    });
  }

  const status = requesterStatus(request.status);
  const canEdit = !REQUESTER_EDIT_BLOCKED_STATUSES.has(request.status);
  const needsReview = request.tasks.length > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/my-requests"
        className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-sky-700"
      >
        ← My Requests
      </Link>

      {(message.new === "1" || message.saved === "1") && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message.new === "1"
            ? "Your request is in. It is saved here automatically—no tracking link or email is required."
            : "Your changes are saved."}
        </div>
      )}
      {message.saved === "review" && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Your changes are saved.</b> Some advertising work had already
          started, so the existing placements were preserved and the
          communications team was asked to review the schedule.
        </div>
      )}
      {message.error === "closed" && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-semibold text-muted">
          This request is closed and can no longer be edited.
        </div>
      )}

      <section className="card-float p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-xs font-extrabold"
                style={{
                  color: status.color,
                  background: `${status.color}16`,
                }}
              >
                {status.label}
              </span>
              {needsReview && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
                  Updated details under review
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold">{request.title}</h1>
            <p className="mt-1 text-sm text-muted">{status.description}</p>
          </div>
          {canEdit && (
            <Link
              href={`/my-requests/${request.id}/edit`}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border bg-white/70 px-4 py-2 text-sm font-bold text-ink hover:bg-white"
            >
              ✏️ Improve details
            </Link>
          )}
        </div>

        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">Event date</dt>
            <dd className="mt-1 font-semibold">{formatDate(request.eventStart)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">Location</dt>
            <dd className="mt-1 font-semibold">{request.location || "Not added yet"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">Audience</dt>
            <dd className="mt-1 font-semibold">
              {{
                whole_church: "Whole church",
                ministry: "A specific ministry",
                small_group: "A small group or team",
                leadership: "Leadership",
              }[request.whoIsItFor] ?? "Church community"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">Last updated</dt>
            <dd className="mt-1 font-semibold">{formatDate(request.updatedAt)}</dd>
          </div>
        </dl>

        {request.description && (
          <div className="mt-5 rounded-2xl border bg-white/55 p-4">
            <h2 className="text-sm font-extrabold">Event description</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {request.description}
            </p>
          </div>
        )}

        {(request.needsRegistration ||
          request.nextStepText ||
          request.nextStepUrl) && (
          <div className="mt-4 rounded-2xl border bg-white/55 p-4">
            <h2 className="text-sm font-extrabold">How people respond</h2>
            <div className="mt-2 grid gap-1 text-sm text-muted">
              {request.nextStepText && <p>{request.nextStepText}</p>}
              {(request.nextStepUrl || request.registrationUrl) && (
                <a
                  href={request.nextStepUrl || request.registrationUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-sky-700 underline"
                >
                  Open registration or next-step link ↗
                </a>
              )}
              {request.cost && <p>Cost: {request.cost}</p>}
              {request.registrationClosesAt && (
                <p>Registration closes {formatDate(request.registrationClosesAt)}</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-4">
        <div className="mb-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">
            Advertising plan
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">
            Where and when it will be shared
          </h2>
          <p className="mt-1 text-sm text-muted">
            Proposed placements can change while the team reviews capacity and
            the best timing for your event.
          </p>
        </div>

        {request.deliverables.length === 0 ? (
          <div className="card-float p-6 text-center">
            <div className="text-3xl">🗓️</div>
            <h3 className="mt-2 font-extrabold">The plan is being reviewed</h3>
            <p className="mt-1 text-sm text-muted">
              Channels and dates will appear here as soon as they are planned.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {request.deliverables.map((deliverable) => {
              const placementStatus = requesterDeliverableStatus(
                deliverable.status,
              );
              const dates = uniqueDates(
                deliverable.touches.map((touch) => touch.scheduledAt),
              );
              return (
                <article key={deliverable.id} className="card-float p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ background: deliverable.channel.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold">
                          {deliverable.channel.name}
                        </h3>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                          style={{
                            color: placementStatus.color,
                            background: `${placementStatus.color}16`,
                          }}
                        >
                          {placementStatus.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {placementStatus.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {dates.length > 0 ? (
                          dates.map((date) => (
                            <time
                              key={date.getTime()}
                              className="rounded-full border bg-white/70 px-2.5 py-1 text-xs font-semibold"
                            >
                              {formatShortDate(date)}
                            </time>
                          ))
                        ) : deliverable.windowStart || deliverable.instanceDate ? (
                          <span className="rounded-full border bg-white/70 px-2.5 py-1 text-xs font-semibold">
                            {deliverable.windowStart &&
                            deliverable.windowEnd &&
                            deliverable.windowStart.getTime() !==
                              deliverable.windowEnd.getTime()
                              ? `${formatShortDate(deliverable.windowStart)} – ${formatShortDate(deliverable.windowEnd)}`
                              : formatShortDate(
                                  deliverable.instanceDate ??
                                    deliverable.windowStart!,
                                )}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-muted">
                            Date being finalized
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
