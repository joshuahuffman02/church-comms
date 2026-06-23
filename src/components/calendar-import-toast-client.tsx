"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function CalendarImportToastClient({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const storageKey = `calendar-import-toast:${pendingCount}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(() =>
    typeof window !== "undefined" && window.sessionStorage.getItem(storageKey) === "dismissed"
      ? storageKey
      : null,
  );
  const dismissed = dismissedKey === storageKey;

  if (dismissed || pathname.startsWith("/import/google")) return null;

  function dismiss() {
    window.sessionStorage.setItem(storageKey, "dismissed");
    setDismissedKey(storageKey);
  }

  return (
    <div className="no-print fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-sky-200 bg-white/95 p-4 shadow-float backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">New calendar event{pendingCount === 1 ? "" : "s"} found</div>
          <p className="mt-1 text-sm text-muted">
            {pendingCount} item{pendingCount === 1 ? "" : "s"} waiting for accept or ignore.
          </p>
          <Link href="/import/google" className="mt-3 inline-block text-sm font-semibold text-sky-700 underline">
            Review calendar inbox
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss calendar notification"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sky-bg hover:text-ink"
        >
          x
        </button>
      </div>
    </div>
  );
}
