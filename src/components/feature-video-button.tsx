"use client";
import { useState, useTransition } from "react";
import { featureOnComingVideo } from "@/actions/video-top3";

/**
 * One-click "put this event on this coming Sunday's announcement video" — it
 * schedules the slide AND features it in the Top-3, so it shows on the output
 * page, the Sunday Checklist, and the run-of-show.
 */
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
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
        ⭐ On this Sunday&apos;s video ({sundayLabel})
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await featureOnComingVideo(requestId); setDone(true); })}
      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink/80 transition hover:bg-sky-bg disabled:opacity-50"
    >
      {pending ? "Adding…" : `⭐ Feature on this Sunday's video (${sundayLabel})`}
    </button>
  );
}
