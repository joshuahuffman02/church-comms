import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StatusPipeline } from "@/components/status-pipeline";
import { DeliverableList, type DeliverableRow } from "@/components/deliverable-list";
import { GuardrailList } from "@/components/guardrail-list";
import { getGuardrailsForRequest } from "@/lib/guardrails-service";
import { ApprovalActions } from "@/components/approval-actions";
import { EventActions } from "@/components/event-actions";
import { ReplanButton } from "@/components/replan-button";
import { TouchContentEditor } from "@/components/touch-content-editor";
import { EventUpdates, type EventUpdateRow, type ChannelLite } from "@/components/event-updates";
import { EventTasks, type EventTaskRow, type TemplateOption } from "@/components/event-tasks";
import { sortTasks } from "@/lib/playbooks";
import type { ChannelCopyMap } from "@/lib/updates";
import { OwnerAssign } from "@/components/owner-assign";
import { AssetAttach, type AssetRow } from "@/components/asset-attach";
import { PcoUnlinkButton } from "@/components/pco-unlink-button";
import { MinistryDots } from "@/components/ministry-dots";
import { getSessionUser } from "@/lib/authz";
import { effectiveOwnerId } from "@/lib/tasks";
import { isEditor } from "@/lib/roles";
import { classifyByTags, type TagRule } from "@/lib/tag-rules";
import { SuggestedPlaybook } from "@/components/suggested-playbook";
import Link from "next/link";

const APPROVAL_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700" },
};

const PRE_APPROVED = new Set(["submitted", "triaged", "needs_info"]);

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : null;

const fmtShort = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const fmtActivityTime = (d: Date) =>
  d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, activeUsers, activeChannels, activeTemplates, me, tagRuleRows, activityRows] = await Promise.all([
    db.request.findUnique({
      where: { id },
      include: {
        ministry: true,
        ministries: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        owner: { select: { id: true, name: true } },
        series: { select: { id: true, title: true } },
        assets: true,
        deliverables: {
          include: { channel: true, touches: true, owner: { select: { id: true, name: true } } },
          orderBy: { productionDueAt: "asc" },
        },
        approvals: {
          include: { rule: true, approver: true },
          orderBy: { createdAt: "asc" },
        },
        updates: {
          orderBy: [{ scheduledFor: "asc" }, { sortOrder: "asc" }],
        },
        tasks: {
          orderBy: [{ dueAt: "asc" }, { sortOrder: "asc" }],
        },
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.channel.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { key: true, name: true, color: true },
    }),
    db.eventTemplate.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getSessionUser(),
    db.eventTagRule.findMany({
      select: {
        tag: true,
        ministryId: true,
        tierSuggestion: true,
        noPromo: true,
        missionTrip: true,
        suggestedTemplateId: true,
      },
    }),
    db.activityLog.findMany({
      where: { entityType: "request", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        summary: true,
        actorName: true,
        actorEmail: true,
        createdAt: true,
      },
    }),
  ]);

  if (!request) notFound();
  const canEdit = isEditor(me?.roles ?? []);

  const approvals = request.approvals;
  const hasPendingApproval = approvals.some((a) => a.status === "pending");
  const awaitingApproval = hasPendingApproval && PRE_APPROVED.has(request.status);

  // PCO tags arrive as a Json? column (a string[]); narrow defensively to strings.
  const pcoTags: string[] = Array.isArray(request.pcoTags)
    ? request.pcoTags.filter((t): t is string => typeof t === "string")
    : [];

  // Suggested-playbook hint: classify this event's tags against the live rules
  // and offer any playbook a matching tag-rule points at (generic replacement
  // for the old mission-trip-specific hint — any tag can suggest any playbook).
  // Resolve each suggested id to an active template name; skip inactive/missing.
  const tagRules: TagRule[] = tagRuleRows;
  const templatesById = new Map(activeTemplates.map((t) => [t.id, t.name]));
  const suggestedPlaybooks = classifyByTags(pcoTags, tagRules)
    .suggestedTemplateIds.map((tid) => ({ id: tid, name: templatesById.get(tid) }))
    .filter((p): p is { id: string; name: string } => p.name != null);

  const guardrails = await getGuardrailsForRequest(id);

  const rows: DeliverableRow[] = request.deliverables.map((d) => {
    const sortedTouches = [...d.touches].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
    );
    // Effective owner: the deliverable's own owner, else the request's owner.
    const ownerId = effectiveOwnerId(d, request);
    const ownerName = d.owner?.name ?? request.owner?.name ?? null;
    return {
      id: d.id,
      status: d.status,
      channelName: d.channel.name,
      channelColor: d.channel.color,
      channelType: d.channel.type,
      productionDueAt: d.productionDueAt,
      instanceDate: d.instanceDate,
      windowStart: d.windowStart,
      lockLeadDays: d.channel.lockLeadDays,
      skippedReason: d.skippedReason,
      touchCount: d.touches.length,
      firstTouchAt: sortedTouches[0]?.scheduledAt ?? null,
      assetLink: d.assetLink,
      effectiveOwnerId: ownerId,
      effectiveOwnerName: ownerName,
      explicitOwner: d.ownerId != null,
    };
  });

  const assetRows: AssetRow[] = request.assets.map((a) => ({
    id: a.id,
    url: a.url,
    label: a.filename,
    isFinal: a.isFinal,
  }));

  // Promotion timeline: all touches across deliverables sorted by date. Each
  // row carries its per-week content so it can expand into an inline editor.
  const timeline = request.deliverables
    .flatMap((d) =>
      d.touches.map((t) => ({
        id: t.id,
        date: t.scheduledAt,
        channel: d.channel.name,
        purpose: t.purposeLabel ?? "",
        content: t.content,
        assetLink: t.assetLink,
        note: t.note,
      }))
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Message-arc phases for the timeline. `channelCopy` is stored as opaque JSON;
  // narrow it to the typed per-channel map for the client component.
  const channelLite: ChannelLite[] = activeChannels;
  const updateRows: EventUpdateRow[] = request.updates.map((u) => ({
    id: u.id,
    scheduledFor: u.scheduledFor,
    title: u.title,
    kind: u.kind,
    body: u.body,
    channelCopy: (u.channelCopy as ChannelCopyMap | null) ?? null,
    status: u.status,
    sortOrder: u.sortOrder,
  }));

  // Admin checklist: sort by due date (nulls last), then sortOrder, with the
  // shared pure helper so the order matches the rest of the playbooks feature.
  const taskRows: EventTaskRow[] = sortTasks(request.tasks).map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueAt: t.dueAt,
    status: t.status,
    source: t.source,
    category: t.category,
    sortOrder: t.sortOrder,
  }));
  const templateOptions: TemplateOption[] = activeTemplates;

  const eventLine = [fmtDate(request.eventStart), fmtDate(request.eventEnd ?? null)]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(" – ");
  const registrationCloseLine = fmtDate(request.registrationClosesAt);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="card-float p-6 mb-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {request.ministries.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {request.ministries.map((m) => (
                <MinistryDots key={m.id} ministries={[{ name: m.name, color: m.color }]} showNames />
              ))}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
            Tier {request.tier}
          </span>
          {/* Advisory tag-suggested tier — only when it differs from the
              working tier (so a confirmed/edited tier doesn't show noise). */}
          {request.suggestedTier != null && request.suggestedTier !== request.tier && (
            <span
              className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-600"
              title="Suggested by the event's Planning Center tags — confirm at triage"
            >
              🏷️ suggests tier {request.suggestedTier}
            </span>
          )}
          {/* Room-Only routing: this event is kept out of the comms queue. */}
          {request.noPromo && (
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
              title="A “Room Only” tag marked this event as not for promotion"
            >
              🚫 No promo
            </span>
          )}
          {canEdit && (
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Link
                href={`/requests/${request.id}/edit`}
                className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition"
              >
                Edit
              </Link>
              <Link
                href={`/requests/${request.id}/attach`}
                className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition"
              >
                + Add output
              </Link>
              <ReplanButton id={request.id} />
              <EventActions id={request.id} status={request.status} />
            </div>
          )}
        </div>
        <h1 className="text-2xl font-extrabold">{request.title}</h1>
        {request.series && (
          <Link
            href="/recurring"
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-sky-700 transition"
          >
            🔁 part of &ldquo;{request.series.title}&rdquo;
          </Link>
        )}
        {request.description && <p className="text-muted mt-1">{request.description}</p>}
        <div className="mt-3 grid gap-1 text-sm text-muted sm:grid-cols-2">
          <div>📅 {eventLine || "—"}</div>
          {request.location && <div>📍 {request.location}</div>}
          {request.roomBooked === "yes" && (
            <div>🚪 Room booked in Planning Center</div>
          )}
          {(request.requesterName || request.requesterEmail) && (
            <div>
              🙋 {request.requesterName ?? "—"}
              {request.requesterEmail ? ` · ${request.requesterEmail}` : ""}
            </div>
          )}
          {request.nextStepText && <div>👉 {request.nextStepText}</div>}
          {registrationCloseLine && <div>📝 Signups close {registrationCloseLine}</div>}
          {registrationCloseLine && (
            <div>📣 Ad schedule runs back from signup close</div>
          )}
        </div>

        {/* Owner: who's driving this event's comms. */}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">👤 Owner:</span>
          <span className="font-semibold">{request.owner?.name ?? "Unassigned"}</span>
          {canEdit && (
            <OwnerAssign
              requestId={request.id}
              ownerId={request.ownerId}
              users={activeUsers}
            />
          )}
        </div>

        {/* Planning Center link state (Model C). When linked to a PCO event we
            show the linked badge + approval + Church Center link + Unlink; when
            not, a subtle link to attach this request to a real PCO event. */}
        {request.pcoEventId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              ✅ Linked to Planning Center
            </span>
            {request.pcoApprovalStatus && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  request.pcoApprovalStatus === "A"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {request.pcoApprovalStatus === "A"
                  ? "✅ Approved in PCO"
                  : `PCO status: ${request.pcoApprovalStatus}`}
              </span>
            )}
            {/* Publish state in Church Center (read-only PCO signal). */}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                request.pcoVisibleInChurchCenter
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-muted"
              }`}
            >
              {request.pcoVisibleInChurchCenter
                ? "📣 Published in Church Center"
                : "Not yet published"}
            </span>
            {request.pcoFeatured && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                ⭐ Featured
              </span>
            )}
            {/* Room-request approval status (the pending-room triage signal). */}
            {request.pcoRoomStatus && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  request.pcoRoomStatus === "approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : request.pcoRoomStatus === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-700"
                }`}
              >
                {request.pcoRoomStatus === "approved"
                  ? "🚪 Rooms: approved"
                  : request.pcoRoomStatus === "pending"
                    ? "🚪 Rooms: pending"
                    : "🚪 Rooms: rejected"}
              </span>
            )}
            {request.pcoChurchCenterUrl && (
              <a
                href={request.pcoChurchCenterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold underline text-sky-700"
              >
                View on Church Center →
              </a>
            )}
            {canEdit && <PcoUnlinkButton requestId={request.id} />}
          </div>
        ) : canEdit ? (
          <div className="mt-3">
            <Link
              href={`/requests/${request.id}/link-pco`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-sky-700 transition"
            >
              🔗 Link to a Planning Center event
            </Link>
          </div>
        ) : null}

        {/* PCO tags (category/ministry/campus labels) as small chips. */}
        {pcoTags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pcoTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700"
              >
                🏷️ {tag}
              </span>
            ))}
          </div>
        )}

        {/* Suggested-playbook hint — a tag rule points at a playbook; offer to
            apply it (one affordance per suggested playbook). Generic: works for
            Mission Trip, Sermon Series, or any tag→playbook mapping. */}
        {canEdit && suggestedPlaybooks.map((p) => (
          <SuggestedPlaybook
            key={p.id}
            requestId={request.id}
            templateId={p.id}
            templateName={p.name}
          />
        ))}

        {/* PCO owner contact — who owns the event in Planning Center. */}
        {(request.pcoOwnerName || request.pcoOwnerEmail) && (
          <div className="mt-2 text-xs text-muted">
            <span className="font-semibold">PCO owner:</span>{" "}
            {request.pcoOwnerName ?? "—"}
            {request.pcoOwnerEmail ? (
              <>
                {" · "}
                <a
                  href={`mailto:${request.pcoOwnerEmail}`}
                  className="underline hover:text-sky-700"
                >
                  {request.pcoOwnerEmail}
                </a>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Awaiting approval: pending approvals while still pre-approved */}
      {awaitingApproval && (
        <div className="card-float p-4 mb-4 bg-amber-50 border border-amber-200 flex items-center gap-3">
          <span className="text-xl">⏳</span>
          <div className="text-sm text-amber-800">
            <b>Awaiting approval.</b> This request can&apos;t move to Approved
            until the pending approval{approvals.filter((a) => a.status === "pending").length > 1 ? "s are" : " is"} signed off below.
          </div>
        </div>
      )}

      {/* Heads-up: guardrails involving this request */}
      {guardrails.length > 0 && (
        <div className="card-float p-5 mb-4 bg-amber-50/40">
          <h2 className="font-bold mb-3">⚠️ Heads-up</h2>
          <GuardrailList guardrails={guardrails} />
        </div>
      )}

      {/* Status pipeline + actions */}
      <StatusPipeline id={request.id} status={request.status} canEdit={canEdit} />

      {/* Approvals */}
      {approvals.length > 0 && (
        <div className="card-float p-5 mb-4">
          <h2 className="font-bold mb-3">Approvals</h2>
          <div className="grid gap-2">
            {approvals.map((a) => {
              const meta =
                APPROVAL_STATUS_META[a.status] ?? {
                  label: a.status,
                  cls: "bg-slate-100 text-muted",
                };
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 py-2 border-t border-slate-100 text-sm first:border-t-0 flex-wrap"
                >
                  <span className="font-semibold">
                    {a.rule?.name ?? "Approval"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  {a.approver && (
                    <span className="text-muted text-xs">
                      {a.status === "pending" ? "→" : "·"} {a.approver.name}
                    </span>
                  )}
                  {a.note && (
                    <span className="text-muted text-xs italic">“{a.note}”</span>
                  )}
                  {canEdit && a.status === "pending" && (
                    <div className="ml-auto">
                      <ApprovalActions approvalId={a.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Message Arc / Updates: the dated timeline of message phases */}
      <EventUpdates requestId={request.id} updates={updateRows} channels={channelLite} canEdit={canEdit} />

      {/* Admin Checklist: dated admin tasks from playbooks + manual tasks */}
      <EventTasks requestId={request.id} tasks={taskRows} templates={templateOptions} canEdit={canEdit} />

      {/* Deliverables */}
      <DeliverableList rows={rows} users={activeUsers} currentUserId={me?.id ?? ""} canEdit={canEdit} />

      {/* Assets / finished art */}
      <AssetAttach requestId={request.id} assets={assetRows} canEdit={canEdit} />

      {/* Promotion timeline */}
      <div className="card-float p-5 mb-4">
        <h2 className="font-bold mb-3">Promotion timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-muted text-sm">No promotion touches scheduled yet.</p>
        ) : (
          <div className="grid gap-1">
            {timeline.map((t) => (
              <div
                key={t.id}
                className="py-1.5 border-t border-slate-100 text-sm first:border-t-0"
              >
                <div className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-muted">{fmtShort(t.date)}</span>
                  <span className="font-semibold">{t.channel}</span>
                  {t.purpose && <span className="text-muted">· {t.purpose}</span>}
                </div>
                <div className="pl-32">
                  <TouchContentEditor
                    id={t.id}
                    scheduledAt={t.date}
                    channelName={t.channel}
                    content={t.content}
                    assetLink={t.assetLink}
                    note={t.note}
                    collapsible
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Durable history */}
      <div className="card-float p-5 mb-4">
        <h2 className="font-bold mb-3">History</h2>
        {activityRows.length === 0 ? (
          <p className="text-muted text-sm">No logged changes yet.</p>
        ) : (
          <div className="grid gap-2">
            {activityRows.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 border-t border-slate-100 py-2 text-sm first:border-t-0"
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-skyblue" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">
                    {activity.summary ?? activity.action.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-muted">
                    {fmtActivityTime(activity.createdAt)}
                    {" · "}
                    {activity.actorName ?? activity.actorEmail ?? "System"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
