import { REQUEST_STATUSES, REQUEST_STATUS_META } from "@/lib/status";
import { StatusActions } from "@/components/status-actions";

export function StatusPipeline({
  id,
  status,
  canEdit = true,
}: {
  id: string;
  status: string;
  canEdit?: boolean;
}) {
  const currentIndex = REQUEST_STATUSES.indexOf(status as (typeof REQUEST_STATUSES)[number]);
  const sideMeta = currentIndex < 0 ? REQUEST_STATUS_META[status] : null;

  return (
    <div className="card-float p-5 mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold">Status</h2>
        {sideMeta && (
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: `${sideMeta.color}22`, color: sideMeta.color }}
          >
            {sideMeta.label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4">
        {REQUEST_STATUSES.map((s, i) => {
          const meta = REQUEST_STATUS_META[s];
          const isPast = currentIndex >= 0 && i < currentIndex;
          const isCurrent = i === currentIndex;
          const filled = isPast || isCurrent;
          return (
            <div key={s} className="flex items-center shrink-0">
              <div className="flex flex-col items-center" style={{ minWidth: 76 }}>
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{
                    background: filled ? meta.color : "#e2e8f0",
                    color: filled ? "#fff" : "#94a3b8",
                    boxShadow: isCurrent ? `0 0 0 4px ${meta.color}33` : "none",
                  }}
                >
                  {isPast ? "✓" : i + 1}
                </div>
                <span
                  className="mt-1 text-[10px] text-center font-semibold"
                  style={{ color: isCurrent ? meta.color : "#94a3b8" }}
                >
                  {meta.label}
                </span>
              </div>
              {i < REQUEST_STATUSES.length - 1 && (
                <div
                  className="h-0.5 w-5 shrink-0"
                  style={{ background: i < currentIndex ? meta.color : "#e2e8f0" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {canEdit && <StatusActions id={id} status={status} />}
    </div>
  );
}
