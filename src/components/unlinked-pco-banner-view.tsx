"use client";
import Link from "next/link";
import { useState } from "react";

/**
 * The dismissible strip itself. Split out as a client component purely so the X
 * can hide it for the session (the count is computed server-side by
 * {@link UnlinkedPcoBanner}). Dismissal is in-memory — it returns on reload,
 * which is what we want: it's a standing nudge until those events are imported.
 */
export function UnlinkedPcoBannerView({ count }: { count: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const noun = count === 1 ? "event isn't" : "events aren't";
  return (
    <div className="card-float mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 px-4 py-3">
      <span className="text-lg">⚠️</span>
      <p className="text-sm text-amber-800 flex-1">
        <span className="font-semibold">
          {count} approved Planning Center {noun} imported yet
        </span>{" "}
        — they have no local event here.{" "}
        <Link
          href="/import/planning-center"
          className="font-semibold underline underline-offset-2"
        >
          Review &amp; import on the Import (PCO) page →
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-full px-2 py-0.5 text-amber-500 hover:bg-amber-100 transition"
      >
        ✕
      </button>
    </div>
  );
}
