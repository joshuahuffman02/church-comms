import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Inbox,
  ListChecks,
  Sparkles,
  UserRoundX,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin, isEditor } from "@/lib/roles";
import { myTasks } from "@/lib/tasks";
import { FocusQueueActions } from "@/components/focus-queue-actions";
import { getGuardrails } from "@/lib/guardrails-service";
import { buildRunSheet } from "@/lib/run-sheet";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { comingSunday, DONE_DELIVERABLE_STATUSES, weekRange } from "@/lib/week";
import { PROMOTABLE_REQUEST_STATUSES, REQUEST_STATUS_META } from "@/lib/status";
import {
  visibleFocusCandidates,
  type FocusCandidate,
} from "@/lib/focus-queue";
import {
  describeRequestProvenance,
  requestAttentionLabel,
} from "@/lib/provenance";
import { productionNeeds } from "@/lib/production-needs";

export const dynamic = "force-dynamic";

const formatLong = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

const formatShort = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function SundayFavorite({
  sunday,
  remaining,
  total,
  isSunday,
}: {
  sunday: Date;
  remaining: number;
  total: number;
  isSunday: boolean;
}) {
  return (
    <section
      className={`card-float relative overflow-hidden border-l-[6px] p-6 ${
        isSunday ? "border-l-violet-500" : "border-l-sky-400"
      }`}
      aria-labelledby="sunday-favorite-heading"
    >
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-200/35 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-3xl ${isSunday ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
          <CalendarCheck2 className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-extrabold uppercase tracking-wide ${isSunday ? "text-violet-700" : "text-sky-700"}`}>
            {isSunday ? "It’s Sunday" : "Your Sunday favorite"}
          </p>
          <h2 id="sunday-favorite-heading" className="mt-1 text-2xl font-extrabold text-ink">
            Sunday Checklist
          </h2>
          <p className="mt-1 text-sm text-muted">
            {formatLong(sunday)}
            {" · "}
            {total === 0
              ? "Nothing is scheduled yet"
              : remaining === 0
                ? `All ${total} checklist items are complete`
                : `${remaining} of ${total} checklist items left`}
          </p>
        </div>
        <Link
          href="/run-sheet"
          className="btn-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold"
        >
          Open checklist
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function FocusCard({ candidate }: { candidate: FocusCandidate }) {
  const tone = {
    rose: {
      shell: "border-l-rose-500",
      eyebrow: "text-rose-800",
      icon: <Clock3 className="h-4 w-4" aria-hidden />,
    },
    amber: {
      shell: "border-l-amber-500",
      eyebrow: "text-amber-900",
      icon: <Inbox className="h-4 w-4" aria-hidden />,
    },
    violet: {
      shell: "border-l-violet-500",
      eyebrow: "text-violet-800",
      icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
    },
    sky: {
      shell: "border-l-sky-500",
      eyebrow: "text-sky-800",
      icon: <UserRoundX className="h-4 w-4" aria-hidden />,
    },
  }[candidate.tone];
  const shownNeeds = candidate.productionNeeds.slice(0, 4);
  const hiddenNeedCount = Math.max(0, candidate.productionNeeds.length - shownNeeds.length);
  const needsHeadingId = `needs-${candidate.entityType}-${candidate.entityId}`;

  return (
    <article className={`card-float flex min-h-72 flex-col border-l-[5px] p-5 ${tone.shell}`}>
      <div className={`flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide ${tone.eyebrow}`}>
        {tone.icon}
        {candidate.eyebrow}
      </div>
      <h3 className="mt-3 text-xl font-extrabold text-ink">{candidate.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{candidate.detail}</p>

      <dl className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white/65 p-3 text-xs">
        <div className="flex items-start justify-between gap-3">
          <dt className="font-bold text-muted">Source</dt>
          <dd className="text-right font-semibold text-ink">{candidate.sourceLabel}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="font-bold text-muted">Requester</dt>
          <dd className="text-right font-semibold text-ink">{candidate.requesterLabel}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="font-bold text-muted">Owner</dt>
          <dd className={`text-right font-semibold ${candidate.ownerLabel === "Unassigned" ? "text-amber-800" : "text-ink"}`}>
            {candidate.ownerLabel}
          </dd>
        </div>
      </dl>

      {shownNeeds.length > 0 && (
        <section
          className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/65 p-3"
          aria-labelledby={needsHeadingId}
        >
          <h4
            id={needsHeadingId}
            className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-violet-800"
          >
            <ListChecks className="h-4 w-4" aria-hidden />
            Needs now
          </h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shownNeeds.map((need) => (
              <Link
                key={need.key}
                href={need.href}
                className="inline-flex min-h-9 items-center rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-900 hover:border-violet-300 hover:bg-violet-100"
              >
                {need.label}
              </Link>
            ))}
            {hiddenNeedCount > 0 && (
              <span className="inline-flex min-h-9 items-center rounded-full px-2.5 py-1.5 text-xs font-bold text-violet-700">
                +{hiddenNeedCount} more
              </span>
            )}
          </div>
        </section>
      )}

      <Link
        href={candidate.href}
        className={`mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 py-2 text-sm font-extrabold ${tone.eyebrow} hover:bg-white/70`}
      >
        {candidate.actionLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <FocusQueueActions candidate={candidate} />
    </article>
  );
}

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = isAdmin(user.roles);
  const editor = isEditor(user.roles);
  const portalOnly = !admin && !editor && !user.roles.includes("viewer");
  if (portalOnly) redirect("/my-requests");

  const now = new Date();
  const today = atMidnight(now);
  const sunday = comingSunday(today);
  const { end: weekEnd } = weekRange(today);

  const [
    personalTasks,
    attentionRequests,
    proofCount,
    overdueCount,
    unassignedCount,
    guardrails,
    sheet,
    upcomingEvents,
    overduePieces,
    unassignedPieces,
    focusActivities,
  ] = await Promise.all([
    myTasks(user.id, today),
    db.request.findMany({
      where: {
        status: { in: ["submitted", "triaged", "needs_info"] },
      },
      orderBy: [{ createdAt: "asc" }, { eventStart: "asc" }],
      take: 15,
      select: {
        id: true,
        title: true,
        status: true,
        eventStart: true,
        ownerId: true,
        updatedAt: true,
        pcoEventId: true,
        externalCalendarKey: true,
        description: true,
        nextStepText: true,
        nextStepUrl: true,
        needsRegistration: true,
        registrationUrl: true,
        requesterName: true,
        requesterEmail: true,
        requester: { select: { name: true } },
        owner: { select: { name: true } },
        approvals: {
          where: { status: "pending" },
          select: { id: true },
        },
        _count: {
          select: { deliverables: true },
        },
      },
    }),
    db.deliverable.count({
      where: {
        status: "proof",
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
    }),
    db.deliverable.count({
      where: {
        productionDueAt: { lt: today },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
    }),
    db.deliverable.count({
      where: {
        ownerId: null,
        request: {
          ownerId: null,
          status: { in: PROMOTABLE_REQUEST_STATUSES },
          noPromo: false,
        },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
      },
    }),
    getGuardrails(today),
    buildRunSheet(sunday),
    db.request.findMany({
      where: {
        eventStart: { gte: today, lt: addDays(today, 15) },
        status: { in: ["approved", "in_production", "proof", "scheduled", "published"] },
        noPromo: false,
      },
      orderBy: [{ eventStart: "asc" }, { title: "asc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        eventStart: true,
        status: true,
        pcoEventId: true,
        externalCalendarKey: true,
        requesterName: true,
        requesterEmail: true,
        requester: { select: { name: true } },
        owner: { select: { name: true } },
      },
    }),
    db.deliverable.findMany({
      where: {
        productionDueAt: { lt: today },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      orderBy: { productionDueAt: "asc" },
      take: 15,
      select: {
        id: true,
        status: true,
        productionDueAt: true,
        assetLink: true,
        notes: true,
        ownerId: true,
        owner: { select: { name: true } },
        channel: { select: { name: true } },
        touches: {
          select: {
            content: true,
            assetLink: true,
          },
        },
        request: {
          select: {
            id: true,
            title: true,
            ownerId: true,
            pcoEventId: true,
            externalCalendarKey: true,
            description: true,
            nextStepText: true,
            nextStepUrl: true,
            needsRegistration: true,
            registrationUrl: true,
            requesterName: true,
            requesterEmail: true,
            requester: { select: { name: true } },
            owner: { select: { name: true } },
            assets: {
              where: { isFinal: true },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    }),
    db.deliverable.findMany({
      where: {
        ownerId: null,
        request: {
          ownerId: null,
          status: { in: PROMOTABLE_REQUEST_STATUSES },
          noPromo: false,
        },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
      },
      orderBy: [{ productionDueAt: "asc" }, { request: { eventStart: "asc" } }],
      take: 15,
      select: {
        id: true,
        status: true,
        productionDueAt: true,
        assetLink: true,
        notes: true,
        ownerId: true,
        owner: { select: { name: true } },
        channel: { select: { name: true } },
        touches: {
          select: {
            content: true,
            assetLink: true,
          },
        },
        request: {
          select: {
            id: true,
            title: true,
            ownerId: true,
            pcoEventId: true,
            externalCalendarKey: true,
            description: true,
            nextStepText: true,
            nextStepUrl: true,
            needsRegistration: true,
            registrationUrl: true,
            requesterName: true,
            requesterEmail: true,
            requester: { select: { name: true } },
            owner: { select: { name: true } },
            assets: {
              where: { isFinal: true },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    }),
    db.activityLog.findMany({
      where: {
        actorId: user.id,
        action: { in: ["focus_done", "focus_snoozed", "focus_not_mine"] },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  const actionableSheetItems = sheet.channels
    .filter((channel) => channel.key !== "loop")
    .flatMap((channel) => channel.items)
    .filter((item) => item.touchId);
  const sundayTotal =
    actionableSheetItems.length +
    sheet.loopAdd.length +
    sheet.loopRemove.length +
    sheet.updatesThisWeek.length;
  const sundayComplete =
    actionableSheetItems.filter((item) => item.done).length +
    sheet.loopAdd.filter((item) => item.done).length +
    sheet.loopRemove.filter((item) => item.done).length +
    sheet.updatesThisWeek.filter((item) => item.done).length;
  const sundayRemaining = Math.max(0, sundayTotal - sundayComplete);
  const actionableGuardrails = guardrails.filter((guardrail) => guardrail.severity !== "info");
  const personalActionTotal =
    personalTasks.overdue.length +
    personalTasks.thisWeek.length +
    personalTasks.awaitingProof.length;

  const focusPool: FocusCandidate[] = [];

  function addPersonalTask(
    task: (typeof personalTasks.awaitingProof)[number] | undefined,
    kind: "proof" | "overdue" | "this_week",
  ) {
    if (!task) return;
    const fingerprint = [
      "deliverable",
      task.id,
      task.status,
      task.productionDueAt?.toISOString() ?? "",
      task.ownerLabel,
      task.productionNeeds.map((need) => need.key).join(","),
    ].join("|");
    const copy = {
      proof: {
        eyebrow: `${task.channelName} · Proof review`,
        detail: "The creative is ready for your decision before it can be scheduled.",
        actionLabel: "Review proof",
        tone: "violet" as const,
      },
      overdue: {
        eyebrow: `${task.channelName} · Timing risk`,
        detail: task.productionDueAt
          ? `This piece passed its ${formatShort(task.productionDueAt)} make-by date. Finish, reassign, or reschedule it.`
          : "This production piece needs a clear next date.",
        actionLabel: "Resolve piece",
        tone: "rose" as const,
      },
      this_week: {
        eyebrow: `${task.channelName} · Due this week`,
        detail: task.productionDueAt
          ? `This is assigned to you and due ${formatShort(task.productionDueAt)}.`
          : "This is assigned to you and ready to move forward.",
        actionLabel: "Move it forward",
        tone: "sky" as const,
      },
    }[kind];
    focusPool.push({
      key: `deliverable:${task.id}`,
      entityType: "deliverable",
      entityId: task.id,
      fingerprint,
      eyebrow: copy.eyebrow,
      title: task.requestTitle,
      detail: copy.detail,
      href: `/requests/${task.requestId}#pieces`,
      actionLabel: copy.actionLabel,
      tone: copy.tone,
      sourceLabel: task.sourceLabel,
      requesterLabel: task.requesterLabel,
      ownerLabel: task.ownerLabel,
      productionNeeds: task.productionNeeds,
    });
  }

  function addAttentionRequest(
    request: (typeof attentionRequests)[number] | undefined,
  ) {
    if (!request) return;
    const provenance = describeRequestProvenance(request);
    const label = requestAttentionLabel(request.status);
    const needs = productionNeeds({
      requestId: request.id,
      ownerReady: Boolean(request.ownerId),
      description: request.description,
      nextStepText: request.nextStepText,
      nextStepUrl: request.nextStepUrl,
      needsRegistration: request.needsRegistration,
      registrationUrl: request.registrationUrl,
      hasChannelPlan: request._count.deliverables > 0,
      pendingApprovalCount: request.approvals.length,
    });
    focusPool.push({
      key: `request:${request.id}`,
      entityType: "request",
      entityId: request.id,
      fingerprint: [
        "request",
        request.id,
        request.status,
        request.ownerId ?? "",
        request.updatedAt.toISOString(),
        needs.map((need) => need.key).join(","),
      ].join("|"),
      eyebrow: `Intake · ${label}`,
      title: request.title,
      detail:
        request.status === "needs_info"
          ? "The plan is paused until the missing event details are collected."
          : request.status === "triaged"
            ? "The audience and channel plan need a final team decision."
            : "This request has arrived and needs its first communication decision.",
      href: `/requests/${request.id}`,
      actionLabel: request.status === "needs_info" ? "Collect details" : "Review request",
      tone: "amber",
      sourceLabel: provenance.sourceLabel,
      requesterLabel: provenance.requesterLabel,
      ownerLabel: provenance.ownerLabel,
      productionNeeds: needs,
    });
  }

  function addTeamPiece(
    piece: (typeof overduePieces)[number] | undefined,
    kind: "overdue" | "unassigned",
  ) {
    if (!piece) return;
    const provenance = describeRequestProvenance(
      piece.request,
      piece.owner?.name ?? piece.request.owner?.name,
    );
    const needs = productionNeeds({
      requestId: piece.request.id,
      channelName: piece.channel.name,
      pieceStatus: piece.status,
      ownerReady: Boolean(piece.ownerId ?? piece.request.ownerId),
      description: piece.request.description,
      nextStepText: piece.request.nextStepText,
      nextStepUrl: piece.request.nextStepUrl,
      needsRegistration: piece.request.needsRegistration,
      registrationUrl: piece.request.registrationUrl,
      hasChannelCopy:
        Boolean(piece.notes?.trim()) ||
        piece.touches.some((touch) => Boolean(touch.content?.trim())),
      hasCreativeAsset:
        Boolean(piece.assetLink?.trim()) ||
        piece.touches.some((touch) => Boolean(touch.assetLink?.trim())) ||
        piece.request.assets.length > 0,
    });
    focusPool.push({
      key: `deliverable:${piece.id}`,
      entityType: "deliverable",
      entityId: piece.id,
      fingerprint: [
        "deliverable",
        piece.id,
        piece.status,
        piece.productionDueAt?.toISOString() ?? "",
        piece.ownerId ?? "",
        piece.request.ownerId ?? "",
        needs.map((need) => need.key).join(","),
      ].join("|"),
      eyebrow:
        kind === "overdue"
          ? `${piece.channel.name} · Timing risk`
          : `${piece.channel.name} · Ownership`,
      title: piece.request.title,
      detail:
        kind === "overdue"
          ? `This team piece passed its ${piece.productionDueAt ? formatShort(piece.productionDueAt) : "planned"} make-by date.`
          : "No event or piece owner is assigned, so this work has no clear next person.",
      href: `/requests/${piece.request.id}#pieces`,
      actionLabel: kind === "overdue" ? "Resolve piece" : "Assign an owner",
      tone: kind === "overdue" ? "rose" : "sky",
      sourceLabel: provenance.sourceLabel,
      requesterLabel: provenance.requesterLabel,
      ownerLabel: provenance.ownerLabel,
      productionNeeds: needs,
    });
  }

  // Start with a balanced trio, then let more work fill any spots the person
  // has completed, snoozed, or marked as belonging to someone else.
  addPersonalTask(personalTasks.awaitingProof[0], "proof");
  addAttentionRequest(attentionRequests[0]);
  if (personalTasks.overdue[0]) {
    addPersonalTask(personalTasks.overdue[0], "overdue");
  } else {
    addTeamPiece(overduePieces[0], "overdue");
  }
  addPersonalTask(personalTasks.thisWeek[0], "this_week");
  addTeamPiece(unassignedPieces[0], "unassigned");
  personalTasks.awaitingProof.slice(1).forEach((task) => addPersonalTask(task, "proof"));
  attentionRequests.slice(1).forEach(addAttentionRequest);
  personalTasks.overdue.slice(1).forEach((task) => addPersonalTask(task, "overdue"));
  overduePieces.slice(1).forEach((piece) => addTeamPiece(piece, "overdue"));
  personalTasks.thisWeek.slice(1).forEach((task) => addPersonalTask(task, "this_week"));
  unassignedPieces.slice(1).forEach((piece) => addTeamPiece(piece, "unassigned"));

  const shownPriorities = visibleFocusCandidates(focusPool, focusActivities, now, 3);
  const allClear = shownPriorities.length === 0;
  const firstName = user.name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Today</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-1 max-w-2xl text-muted">
            {personalActionTotal === 0
              ? "Here’s the clearest view of what the team should protect and move forward."
              : `${personalActionTotal} ${personalActionTotal === 1 ? "piece needs" : "pieces need"} your attention this week.`}
          </p>
        </div>
        {editor && (
          <div className="flex flex-wrap gap-2">
            <Link href="/quick/new" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-bold text-ink hover:bg-sky-bg">
              ⚡ Quick post
            </Link>
            <Link href="/requests/new" className="btn-primary inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-bold">
              ＋ New event
            </Link>
          </div>
        )}
      </header>

      <SundayFavorite
        sunday={sunday}
        remaining={sundayRemaining}
        total={sundayTotal}
        isSunday={today.getDay() === 0}
      />

      <section className="mt-6" aria-labelledby="priorities-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Recommended next</p>
            <h2 id="priorities-heading" className="mt-1 text-2xl font-extrabold text-ink">
              Do these three things next
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              A short, stable queue. Done, Snooze, and Not mine only adjust your view—they never change the event itself.
            </p>
          </div>
          <Link href="/this-week" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-sky-700 hover:bg-sky-bg">
            See the full week
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {allClear ? (
          <div className="card-float border-l-[5px] border-l-emerald-500 p-7 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
            <h3 className="mt-3 text-xl font-extrabold text-emerald-900">The urgent queue is clear</h3>
            <p className="mt-1 text-sm text-muted">
              Nothing needs an immediate decision. Use the look-ahead below to stay comfortably ahead.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {shownPriorities.map((candidate) => (
              <FocusCard key={candidate.key} candidate={candidate} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <section className="card-float p-5" aria-labelledby="coming-up-heading">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Next two weeks</p>
              <h2 id="coming-up-heading" className="mt-1 text-xl font-extrabold text-ink">Coming up</h2>
            </div>
            <Link href="/calendar" className="text-sm font-bold text-sky-700 hover:underline">Calendar →</Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed p-5 text-sm text-muted">
              No active events are scheduled in the next two weeks.
            </p>
          ) : (
            <div className="mt-4 grid gap-2">
              {upcomingEvents.map((event) => {
                const status = REQUEST_STATUS_META[event.status];
                const provenance = describeRequestProvenance(event);
                return (
                  <Link
                    key={event.id}
                    href={`/requests/${event.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white/65 px-4 py-3 hover:border-sky-200 hover:bg-sky-50/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{event.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatShort(event.eventStart)}
                        {` · ${provenance.ownerLabel}`}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {provenance.sourceLabel} · {provenance.requesterLabel}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{ color: status?.color ?? "#64748b", background: `${status?.color ?? "#64748b"}16` }}
                    >
                      {status?.label ?? event.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <aside className="card-float p-5" aria-labelledby="shortcuts-heading">
          <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Jump back in</p>
          <h2 id="shortcuts-heading" className="mt-1 text-xl font-extrabold text-ink">Useful views</h2>
          <div className="mt-4 grid gap-2">
            {[
              ["/my-tasks", "My Tasks", `${personalActionTotal} need attention`],
              ["/pipeline", "Production", `${proofCount} proofs · ${overdueCount} overdue · ${unassignedCount} unassigned`],
              ["/requests?view=focus", "Request triage", `${attentionRequests.length} need a decision`],
              ["/guardrails", "Planning heads-up", `${actionableGuardrails.length} need a decision`],
              ["/this-week", "This Week", `Through ${formatShort(weekEnd)}`],
            ].map(([href, label, detail]) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 hover:bg-sky-bg"
              >
                <span>
                  <span className="block font-bold text-ink">{label}</span>
                  <span className="block text-xs text-muted">{detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Tip: press <kbd className="rounded border bg-white px-1.5 py-0.5 font-bold text-ink">⌘ K</kbd> to find any page or recent event.
          </p>
        </aside>
      </div>
    </div>
  );
}
