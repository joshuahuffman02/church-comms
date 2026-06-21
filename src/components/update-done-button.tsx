"use client";
import { useState, useTransition } from "react";
import { setUpdateStatus } from "@/actions/updates";

/**
 * A real, persisted checkbox for a message-arc update. Optimistically toggles
 * between "planned" and "done", then saves via {@link setUpdateStatus}. Shared
 * by the This Week board and the Run Sheet so a phase can be ticked off as the
 * message goes out.
 */
export function UpdateDoneButton({ id, done }: { id: string; done: boolean }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Mark message update done"
      onChange={(e) => {
        const v = e.target.checked;
        setChecked(v); // optimistic
        start(() => setUpdateStatus(id, v ? "done" : "planned"));
      }}
      className="rs-checkbox mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500 disabled:opacity-50"
    />
  );
}
