"use client";
import { useState, useTransition } from "react";
import { setTouchDone } from "@/actions/run-sheet-actions";

/**
 * A real, persisted checkbox for a run-sheet line. Optimistically toggles, then
 * saves the touch's done-state to the DB. Used for each channel item and the
 * loop add/remove rows so the team can tick things off as they go.
 */
export function RunSheetCheckbox({ touchId, done }: { touchId: string; done: boolean }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Mark done"
      onChange={(e) => {
        const v = e.target.checked;
        setChecked(v); // optimistic
        start(() => setTouchDone(touchId, v));
      }}
      className="rs-checkbox mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500 disabled:opacity-50"
    />
  );
}
