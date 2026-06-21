"use client";
import { useState, useTransition } from "react";
import { toggleTask } from "@/actions/playbooks";

/**
 * A real, persisted checkbox for an admin EventTask. Optimistically toggles
 * between "todo" and "done", then persists via {@link toggleTask}. Shared by the
 * This Week board's "Admin tasks this week" section (mirrors the
 * `UpdateDoneButton` pattern used for message updates).
 */
export function TaskDoneButton({ id, done }: { id: string; done: boolean }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Mark admin task done"
      onChange={(e) => {
        const v = e.target.checked;
        setChecked(v); // optimistic
        start(() => toggleTask(id));
      }}
      className="rs-checkbox mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500 disabled:opacity-50"
    />
  );
}
