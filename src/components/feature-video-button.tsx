"use client";

import { useState, useTransition } from "react";
import { featureOnComingVideo } from "@/actions/video-top3";

export function FeatureVideoButton({
  requestId,
  sundayLabel,
  alreadyFeatured,
}: {
  requestId: string;
  sundayLabel: string;
  alreadyFeatured: boolean;
}) {
  const [done, setDone] = useState(alreadyFeatured);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
        ✓ In the {sundayLabel} video lineup
      </span>
    );
  }
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          start(async () => {
            try {
              const result = await featureOnComingVideo(requestId);
              if (result.ok) setDone(true);
              else setMessage(result.message);
            } catch {
              setMessage("The event could not be added. Please try again.");
            }
          });
        }}
        className="min-h-11 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink/80 transition hover:bg-sky-bg disabled:opacity-50"
      >
        {pending ? "Adding to video…" : `+ Add to the ${sundayLabel} video`}
      </button>
      {message && <p role="alert" className="mt-1 max-w-md text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
}
