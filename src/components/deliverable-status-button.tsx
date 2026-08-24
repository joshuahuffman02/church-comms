"use client";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Undo2, X } from "lucide-react";
import { setDeliverableStatus } from "@/actions/request-status";
import { DELIVERABLE_STATUSES, DELIVERABLE_STATUS_HELP, DELIVERABLE_STATUS_META } from "@/lib/status";
import { useSaveFlash, SavedTick } from "@/components/save-flash";

/**
 * A single status picker: the pill shows the CURRENT status (color-coded);
 * open it to choose a new one. No surprise auto-advance.
 */
export function DeliverableStatusButton({
  id,
  status,
  workLabel,
  eventTitle,
  disabled = false,
  onStatusChange,
}: {
  id: string;
  status: string;
  workLabel: string;
  eventTitle?: string;
  disabled?: boolean;
  onStatusChange?: (status: string, skippedReason?: string) => Promise<void>;
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [error, setError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [pending, start] = useTransition();
  const cancelSkipRef = useRef<HTMLButtonElement>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [lastChange, setLastChange] = useState<{ from: string; to: string } | null>(null);
  const { flash, ping } = useSaveFlash();
  const meta = DELIVERABLE_STATUS_META[optimisticStatus] ?? { label: optimisticStatus, color: "#94a3b8" };
  const fullWorkLabel = eventTitle ? `${workLabel} for ${eventTitle}` : workLabel;

  useEffect(() => {
    if (confirmSkip) cancelSkipRef.current?.focus();
  }, [confirmSkip]);

  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    },
    [],
  );

  function saveStatus(nextStatus: string, reason?: string, recordUndo = true) {
    const previousStatus = optimisticStatus;
    setError(null);
    start(async () => {
      setOptimisticStatus(nextStatus);
      try {
        if (onStatusChange) {
          await onStatusChange(nextStatus, nextStatus === "skipped" ? reason : undefined);
        } else {
          await setDeliverableStatus(id, nextStatus, nextStatus === "skipped" ? reason : undefined);
        }
        ping();
        if (recordUndo && previousStatus !== nextStatus) {
          setLastChange({ from: previousStatus, to: nextStatus });
          if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
          undoTimerRef.current = window.setTimeout(() => setLastChange(null), 7000);
        }
      } catch {
        setError("Not saved");
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <label className="inline-flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Status · {workLabel}</span>
        <select
          aria-label={`Change status for ${fullWorkLabel}`}
          title={`This status tracks the ${fullWorkLabel}. ${DELIVERABLE_STATUS_HELP[optimisticStatus] ?? ""}`}
          value={optimisticStatus}
          disabled={pending || disabled}
          onChange={(event) => {
            const nextStatus = event.target.value;
            if (!nextStatus || nextStatus === optimisticStatus) return;
            if (nextStatus === "skipped") {
              setSkipReason("");
              setConfirmSkip(true);
              return;
            }
            saveStatus(nextStatus);
          }}
          className="min-h-11 rounded-full border px-3 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 transition"
          style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}66` }}
        >
          {DELIVERABLE_STATUSES.filter((deliverableStatus) => deliverableStatus !== "skipped" || optimisticStatus === "skipped").map((deliverableStatus) => (
            <option key={deliverableStatus} value={deliverableStatus} style={{ color: "#334155", background: "#fff" }}>
              {deliverableStatus === "skipped"
                ? "Not needed"
                : DELIVERABLE_STATUS_META[deliverableStatus]?.label ?? deliverableStatus}
            </option>
          ))}
        </select>
      </label>
      {optimisticStatus !== "skipped" && (
        <button
          type="button"
          disabled={pending || disabled}
          onClick={() => {
            setSkipReason("");
            setConfirmSkip(true);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          title={`Mark the ${fullWorkLabel} as not needed`}
          aria-label={`Mark the ${fullWorkLabel} as not needed`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <SavedTick show={flash} />
      {lastChange && !pending && (
        <span role="status" className="inline-flex min-h-9 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
          {DELIVERABLE_STATUS_META[lastChange.to]?.label ?? lastChange.to}
          <button
            type="button"
            onClick={() => {
              const previous = lastChange.from;
              setLastChange(null);
              if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
              saveStatus(previous, undefined, false);
            }}
            className="inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-emerald-900 underline hover:bg-emerald-100"
          >
            <Undo2 className="h-3 w-3" aria-hidden />
            Undo
          </button>
        </span>
      )}
      {error && <span role="alert" className="text-[10px] font-bold text-red-700">{error}</span>}
      {confirmSkip && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4" role="presentation">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`skip-${id}-title`}
            aria-describedby={`skip-${id}-description`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setConfirmSkip(false);
            }}
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-2xl"
          >
            <h2 id={`skip-${id}-title`} className="text-lg font-extrabold text-ink">
              Mark this {workLabel} as not needed?
            </h2>
            <p id={`skip-${id}-description`} className="mt-2 text-sm leading-6 text-muted">
              This removes only the {fullWorkLabel} from active work. It does not cancel the event or change its other channels. You can restore it later from the event page.
            </p>
            <label className="mt-4 block text-sm font-semibold text-ink">
              Why is it not needed? <span className="font-normal text-muted">(optional)</span>
              <textarea
                value={skipReason}
                onChange={(event) => setSkipReason(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="For example: we are not using this channel for this event"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-normal text-ink"
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelSkipRef}
                type="button"
                onClick={() => setConfirmSkip(false)}
                className="min-h-11 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                Keep this piece
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSkip(false);
                  saveStatus("skipped", skipReason);
                }}
                className="min-h-11 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Mark not needed
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
