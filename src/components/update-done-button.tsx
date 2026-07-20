"use client";
import { useOptimistic, useState, useTransition } from "react";
import { setUpdateStatus } from "@/actions/updates";

/**
 * A real, persisted checkbox for a message-arc update. Optimistically toggles
 * between "planned" and "done", then saves via {@link setUpdateStatus}. Shared
 * by the This Week board and the Run Sheet so a phase can be ticked off as the
 * message goes out.
 */
export function UpdateDoneButton({ id, done, label }: { id: string; done: boolean; label: string }) {
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
              await setUpdateStatus(id, next ? "done" : "planned");
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
