"use client";
import { useState } from "react";

/**
 * Tiny shared "did that save?" reassurance. `ping()` shows a brief confirmation
 * that fades on its own, so a silent server-action mutation feels acknowledged.
 */
export function useSaveFlash() {
  const [flash, setFlash] = useState(false);
  const ping = () => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  return { flash, ping };
}

export function SavedTick({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="whitespace-nowrap text-xs font-bold text-emerald-600"
    >
      ✓ Saved
    </span>
  );
}
