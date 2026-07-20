"use client";
import { useOptimistic, useState, useTransition } from "react";
import { setLoopRemovalDone, setTouchDone } from "@/actions/run-sheet-actions";

/**
 * A real, persisted checkbox for a run-sheet line. Optimistically toggles, then
 * saves the touch's done-state to the DB. Used for each channel item and the
 * loop add/remove rows so the team can tick things off as they go.
 */
export function RunSheetCheckbox({
  touchId,
  done,
  label,
  kind = "touch",
}: {
  touchId: string;
  done: boolean;
  label: string;
  kind?: "touch" | "loop-removal";
}) {
  const [checked, setChecked] = useOptimistic(done);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex shrink-0 flex-col items-center">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        aria-label={`${checked ? "Mark not done" : "Mark done"}: ${label}`}
        onChange={(e) => {
          const next = e.target.checked;
          setError(null);
          start(async () => {
            setChecked(next);
            try {
              if (kind === "loop-removal") await setLoopRemovalDone(touchId, next);
              else await setTouchDone(touchId, next);
            } catch {
              setError("Not saved");
            }
          });
        }}
        className="rs-checkbox mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-emerald-600 disabled:opacity-50"
      />
      {error && (
        <span role="alert" className="mt-0.5 text-[9px] font-bold text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
