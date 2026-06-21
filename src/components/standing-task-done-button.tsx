"use client";
import { useState, useTransition } from "react";
import { toggleStandingTask } from "@/actions/standing-tasks";

/**
 * Per-week checkbox for a standing weekly chore. Optimistically toggles, then
 * persists this week's completion via {@link toggleStandingTask}. Mirrors
 * `TaskDoneButton`; the chore resets next week on its own.
 */
export function StandingTaskDoneButton({ id, done }: { id: string; done: boolean }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Mark standing task done this week"
      onChange={(e) => {
        const v = e.target.checked;
        setChecked(v); // optimistic
        start(() => toggleStandingTask(id));
      }}
      className="rs-checkbox mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500 disabled:opacity-50"
    />
  );
}
