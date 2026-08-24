import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { atMidnight } from "@/lib/engine/dates";
import { requesterStatus } from "@/lib/requester-portal";

const formatDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatShortDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=%2Fmy-requests");
  const { view: rawView } = await searchParams;
  const view = ["upcoming", "past", "all"].includes(rawView ?? "")
    ? rawView!
    : "upcoming";
  const today = atMidnight(new Date());

  const requests = await db.request.findMany({
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
    include: {
      deliverables: {
        where: { status: { not: "skipped" } },
        select: {
          status: true,
          channel: { select: { name: true, color: true } },
          touches: {
            select: { scheduledAt: true, status: true },
            orderBy: { scheduledAt: "asc" },
          },
        },
      },
    },
    orderBy: [{ eventStart: "asc" }, { createdAt: "desc" }],
  });

  const upcomingCount = requests.filter(
    (request) => atMidnight(request.eventStart) >= today,
  ).length;
  const activeCount = requests.filter(
    (request) =>
      !["archived", "cancelled", "declined"].includes(request.status),
  ).length;
  const visible = requests
    .filter((request) => {
      if (view === "all") return true;
      const upcoming = atMidnight(request.eventStart) >= today;
      return view === "upcoming" ? upcoming : !upcoming;
    })
    .sort((a, b) =>
      view === "past"
        ? b.eventStart.getTime() - a.eventStart.getTime()
        : a.eventStart.getTime() - b.eventStart.getTime(),
    );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">
            Your communications
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">My Requests</h1>
          <p className="mt-1 text-muted">
            Track what you have requested, where it will be advertised, and what
            the team is working on.
          </p>
        </div>
        <Link
          href="/submit"
          className="btn-primary inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold"
        >
          ＋ New request
        </Link>
      </header>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card-float p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">All time</p>
          <p className="mt-1 text-2xl font-extrabold">{requests.length}</p>
        </div>
        <div className="card-float p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Upcoming</p>
          <p className="mt-1 text-2xl font-extrabold">{upcomingCount}</p>
        </div>
        <div className="card-float p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Still active</p>
          <p className="mt-1 text-2xl font-extrabold">{activeCount}</p>
        </div>
      </section>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Request history">
        {[
          ["upcoming", "Upcoming"],
          ["past", "Past"],
          ["all", "All requests"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/my-requests?view=${key}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              view === key
                ? "bg-ink text-white shadow-sm"
                : "border bg-white/60 text-muted hover:bg-white"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <section className="card-float p-9 text-center">
          <div className="text-4xl">📣</div>
          <h2 className="mt-3 text-xl font-extrabold">
            {requests.length === 0
              ? "No requests yet"
              : view === "past"
                ? "No past requests"
                : "Nothing upcoming"}
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
            {requests.length === 0
              ? "Your first request will appear here immediately after you submit it."
              : "Use All requests to see your complete history."}
          </p>
          {requests.length === 0 && (
            <Link
              href="/submit"
              className="btn-primary mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-bold"
            >
              Make a request
            </Link>
          )}
        </section>
      ) : (
        <div className="grid gap-3">
          {visible.map((request) => {
            const status = requesterStatus(request.status);
            const channels = Array.from(
              new Map(
                request.deliverables.map((deliverable) => [
                  deliverable.channel.name,
                  deliverable.channel,
                ]),
              ).values(),
            );
            const nextPlacement = request.deliverables
              .flatMap((deliverable) => deliverable.touches)
              .filter(
                (touch) =>
                  touch.status !== "skipped" &&
                  atMidnight(touch.scheduledAt) >= today,
              )
              .sort(
                (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
              )[0];

            return (
              <Link
                key={request.id}
                href={`/my-requests/${request.id}`}
                className="card-float card-lift block p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold">{request.title}</h2>
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{
                          color: status.color,
                          background: `${status.color}16`,
                        }}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      📅 {formatDate(request.eventStart)}
                    </p>
                    {request.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        {request.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-sky-700">
                    View details →
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {channels.length > 0 ? (
                    channels.slice(0, 5).map((channel) => (
                      <span
                        key={channel.name}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-white/70 px-2.5 py-1 text-xs font-semibold text-muted"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: channel.color }}
                        />
                        {channel.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-muted">
                      Advertising plan is being reviewed
                    </span>
                  )}
                  {channels.length > 5 && (
                    <span className="text-xs font-semibold text-muted">
                      +{channels.length - 5} more
                    </span>
                  )}
                  {nextPlacement && (
                    <span className="ml-auto text-xs font-semibold text-muted">
                      Next placement {formatShortDate(nextPlacement.scheduledAt)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
