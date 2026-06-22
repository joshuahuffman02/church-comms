"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

/**
 * App-wide error boundary. Wraps every page (but not the root layout/nav), so a
 * thrown server action or render error shows this gentle note instead of a blank
 * white screen. `unstable_retry` (Next 16.2+) re-runs the segment in place.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface to the server/console log for whoever maintains the install.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="card-float p-8">
        <div className="mb-3 text-4xl">☁️</div>
        <h1 className="text-xl font-extrabold">That didn&apos;t go through</h1>
        <p className="text-muted mt-2 text-sm">
          Something went wrong on that last step — nothing was lost. Give it another try.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={() => unstable_retry()} className="btn-primary px-5 py-2 text-sm font-semibold">
            Try again
          </button>
          <Link
            href="/this-week"
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:text-ink"
          >
            Back to This Week
          </Link>
        </div>
      </div>
    </div>
  );
}
