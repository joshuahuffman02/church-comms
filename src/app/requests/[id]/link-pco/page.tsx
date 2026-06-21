import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { pcoConfigured, fetchApprovedUpcomingPcoEvents } from "@/lib/pco";
import { AccessRequiredCard } from "@/components/access-required-card";
import { PcoLinkList, type PcoLinkRow } from "@/components/pco-link-list";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  notfound:
    "That Planning Center event couldn't be found — it may no longer be approved or upcoming. Pick another below.",
  alreadylinked:
    "That Planning Center event is already linked to another request. Each PCO event can back only one request.",
};

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

/**
 * Model C link page: attach this manually-created request to its real Planning
 * Center counterpart. Lists the approved PCO events that aren't already linked to
 * some request, each with a "Link this" button. Auth-gated server component.
 */
export default async function LinkPcoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isEditor(me.roles)) {
    return (
      <AccessRequiredCard
        title="Editor access required"
        message="You need editor access to link local events to Planning Center."
      />
    );
  }

  const { id } = await params;
  const { error } = await searchParams;

  const request = await db.request.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      eventStart: true,
      pcoEventId: true,
    },
  });
  if (!request) notFound();

  // Already linked? Send them back to the detail (which shows the linked state).
  if (request.pcoEventId) redirect(`/requests/${request.id}`);

  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  const header = (
    <>
      <Link
        href={`/requests/${request.id}`}
        className="text-sm text-muted hover:underline"
      >
        ← Back to event
      </Link>
      <div className="card-float p-6 mt-2 mb-4">
        <h1 className="text-2xl font-extrabold mb-1">
          🔗 Link to a Planning Center event
        </h1>
        <p className="text-muted">
          Attach <span className="font-semibold text-ink">{request.title}</span>{" "}
          to its real Planning Center event. Linking pulls PCO&apos;s date, room,
          and registration down, and keeps the auto-sync from creating a
          duplicate.
        </p>
        <p className="text-sm text-muted mt-2">
          📅 Current date in the app: {fmtDate(request.eventStart)}
        </p>
      </div>
    </>
  );

  // Unconfigured: soft "connect first" note.
  if (!pcoConfigured()) {
    return (
      <div className="max-w-2xl">
        {header}
        <div className="card-float p-6 bg-sky-bg/40">
          <div className="text-lg font-bold mb-2">Connect Planning Center first</div>
          <p className="text-sm text-muted">
            Add Planning Center API credentials to your <code>.env</code> file and
            restart the app. Once connected, your approved Planning Center events
            will appear here, ready to link.
          </p>
        </div>
      </div>
    );
  }

  // Configured: pull approved events, drop any whose pcoEventId is already used
  // by some request so you can only link to a free PCO event.
  let rows: PcoLinkRow[] = [];
  let fetchError: string | null = null;
  try {
    const approved = await fetchApprovedUpcomingPcoEvents();
    const ids = approved.map((e) => e.pcoEventId);
    const taken = ids.length
      ? await db.request.findMany({
          where: { pcoEventId: { in: ids } },
          select: { pcoEventId: true },
        })
      : [];
    const takenIds = new Set(taken.map((r) => r.pcoEventId));
    rows = approved
      .filter((e) => !takenIds.has(e.pcoEventId))
      .map((e) => ({
        pcoEventId: e.pcoEventId,
        name: e.name,
        startsAtMs: e.startsAt.getTime(),
        rooms: e.rooms,
        needsRegistration: !!e.registrationUrl,
      }));
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Could not load events.";
  }

  return (
    <div className="max-w-2xl">
      {header}

      {errorMessage && (
        <div className="card-float p-4 mb-4 bg-amber-50 border border-amber-200 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="text-sm text-amber-800">{errorMessage}</div>
        </div>
      )}

      {fetchError ? (
        <div className="card-float p-5 bg-rose-50 border border-rose-200">
          <div className="font-bold text-rose-700 mb-1">
            Couldn&apos;t reach Planning Center
          </div>
          <p className="text-sm text-rose-700">{fetchError}</p>
        </div>
      ) : (
        <PcoLinkList requestId={request.id} events={rows} />
      )}
    </div>
  );
}
