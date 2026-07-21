"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeTouch } from "@/actions/events";
import { addTop3Item } from "@/actions/video-top3";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "That change was not saved. Please try again.";
}

function dateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function GuardrailEventActions({
  requestId,
  title,
  channelName,
  whenISO,
  touchId,
  featured,
  canFeature,
}: {
  requestId: string;
  title: string;
  channelName: string;
  whenISO: string;
  touchId: string;
  featured: boolean;
  canFeature: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scheduledDate = dateLabel(whenISO);

  const feature = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("sunday", whenISO);
      try {
        await addTop3Item(formData);
        router.refresh();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  };

  const remove = () => {
    const featuredNote = featured
      ? " This also releases its featured spot and date lock."
      : "";
    const confirmed = window.confirm(
      `Remove ${title} from ${channelName} on ${scheduledDate}? This removes only this dated appearance; its other scheduled channels and dates stay in place.${featuredNote}`,
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      try {
        await removeTouch(touchId);
        router.refresh();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  };

  return (
    <div className="border-t border-slate-200/70 px-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        {canFeature && !featured && (
          <button
            type="button"
            disabled={pending}
            onClick={feature}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-50"
            aria-label={`Feature ${title} for ${scheduledDate}`}
            title="Protect this event so automatic selection cannot replace it"
          >
            {pending ? "Saving…" : "Feature"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
          aria-label={`Remove ${title} from ${channelName} on ${scheduledDate}`}
          title={`Remove only the ${scheduledDate} appearance`}
        >
          {pending ? "Saving…" : "Remove from this date"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
