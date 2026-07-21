"use client";
import { useOptimistic, useState, useTransition } from "react";
import { toggleTask } from "@/actions/playbooks";

/**
 * A real, persisted checkbox for an admin EventTask. Optimistically toggles
 * between "todo" and "done", then persists via {@link toggleTask}. Shared by the
 * This Week board's "Admin tasks this week" section (mirrors the
 * `UpdateDoneButton` pattern used for message updates).
 */
export function TaskDoneButton({ id, done, label }: { id: string; done: boolean; label: string }) {
  const [checked, setChecked] = useOptimistic(done);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 flex-col items-center">
      <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl hover:bg-emerald-50">
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
                await toggleTask(id);
              } catch {
                setError("Not saved");
              }
            });
          }}
          className="rs-checkbox h-5 w-5 cursor-pointer accent-emerald-600 disabled:opacity-50"
        />
      </label>
      {error && <span role="alert" className="text-[9px] font-bold text-red-700">{error}</span>}
    </span>
  );
}
