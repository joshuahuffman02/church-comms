import { DELIVERABLE_STATUS_META } from "@/lib/status";
import { DeliverableStatusButton } from "@/components/deliverable-status-button";
import { DeliverableRemoveButton } from "@/components/deliverable-remove-button";
import { DeliverableOwner } from "@/components/deliverable-owner";
import { DeliverableArtLink } from "@/components/deliverable-art-link";
import { ProofActions } from "@/components/proof-actions";
import { ScheduleLockButton } from "@/components/schedule-lock-button";
import type { ActiveUser } from "@/components/owner-assign";
import { channelWorkLabel } from "@/lib/labels";

export type DeliverableRow = {
  id: string;
  status: string;
  channelName: string;
  channelColor: string;
  channelType: string;
  productionDueAt: Date | null;
  instanceDate: Date | null;
  windowStart: Date | null;
  lockLeadDays: number | null;
  skippedReason: string | null;
  touchCount: number;
  firstTouchId: string | null;
  firstTouchAt: Date | null;
  firstTouchLockId: string | null;
  assetLink: string | null;
  effectiveOwnerId: string | null;
  effectiveOwnerName: string | null;
  explicitOwner: boolean;
};

const fmt = (d: Date | null) =>
  d
    ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "—";

function DStatusChip({ status }: { status: string }) {
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

export function DeliverableList({
  rows,
  users,
  currentUserId,
  eventTitle,
  canEdit = true,
}: {
  rows: DeliverableRow[];
  users: ActiveUser[];
  currentUserId: string;
  eventTitle: string;
  canEdit?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="card-float p-5 mb-4">
        <h2 className="font-bold mb-2">Pieces to make</h2>
        <p className="text-muted text-sm">Not planned yet — approve the event to build the plan.</p>
      </div>
    );
  }

  return (
    <div className="card-float p-5 mb-4">
      <h2 className="font-bold">
        Pieces to make <span className="text-muted font-normal">· {rows.length}</span>
      </h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        Each row is one concrete output. Its piece owner and status apply only to that output—not to the whole event.
      </p>
      <div className="grid gap-2">
        {rows.map((d) => {
          const workLabel = channelWorkLabel(d.channelName);
          return (
            <div
              key={d.id}
              className="rounded-2xl border border-slate-100 p-3"
              style={{ borderLeft: `5px solid ${d.channelColor}` }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold" style={{ color: d.channelColor }}>
                    {workLabel}
                    {!canEdit && <DStatusChip status={d.status} />}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">Channel: {d.channelName}</p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {d.status !== "skipped" && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Piece owner</span>
                        <DeliverableOwner
                          deliverableId={d.id}
                          effectiveOwnerId={d.effectiveOwnerId}
                          effectiveOwnerName={d.effectiveOwnerName}
                          explicit={d.explicitOwner}
                          currentUserId={currentUserId}
                          users={users}
                          workLabel={workLabel}
                          eventTitle={eventTitle}
                        />
                      </span>
                    )}
                    {d.status !== "skipped" && (
                      <ProofActions id={d.id} status={d.status} workLabel={workLabel} eventTitle={eventTitle} />
                    )}
                    <DeliverableStatusButton
                      id={d.id}
                      status={d.status}
                      workLabel={workLabel}
                      eventTitle={eventTitle}
                    />
                    <DeliverableRemoveButton id={d.id} channelName={d.channelName} workLabel={workLabel} />
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
                <span>make by {fmt(d.productionDueAt)}</span>
                <span>publishes {fmt(d.firstTouchAt)}</span>
                {canEdit && d.status !== "skipped" && d.firstTouchId && (
                  <ScheduleLockButton
                    touchId={d.firstTouchId}
                    lockId={d.firstTouchLockId}
                    channelName={d.channelName}
                  />
                )}
                {d.channelType === "dated_instance" && d.instanceDate && (
                  <span>
                    instance {fmt(d.instanceDate)}
                    {d.lockLeadDays != null ? ` · locks ${fmt(d.productionDueAt)}` : ""}
                  </span>
                )}
                <span>appears {d.touchCount}×</span>
                {canEdit && d.status !== "skipped" && (
                  <DeliverableArtLink deliverableId={d.id} assetLink={d.assetLink} />
                )}
                {!canEdit && d.assetLink && (
                  <a
                    href={d.assetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-700 hover:underline"
                  >
                    asset ↗
                  </a>
                )}
                {d.status === "skipped" && d.skippedReason && (
                  <span className="text-slate-500">Why skipped: {d.skippedReason}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
