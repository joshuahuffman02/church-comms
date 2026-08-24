"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { buildCopyStarters } from "@/lib/smart-workflow";

export function EventCopyStarters({
  title,
  description,
  nextStep,
  channels,
}: {
  title: string;
  description: string | null;
  nextStep: string | null;
  channels: Array<{ key: string; name: string; color: string }>;
}) {
  const [open, setOpen] = useState(false);
  const starters = useMemo(
    () => buildCopyStarters({ title, description, nextStep, channels }),
    [title, description, nextStep, channels],
  );

  if (starters.length === 0) return null;

  return (
    <section className="card-float mb-4 p-5" aria-labelledby="copy-starters-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Copy studio</p>
          <h2 id="copy-starters-heading" className="mt-1 font-bold text-ink">Channel-ready starters</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Built from the approved event details. Nothing is published or saved until you choose to use it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-bold text-sky-700 hover:bg-sky-bg"
        >
          {open ? "Hide starters" : `Draft ${starters.length} channel ${starters.length === 1 ? "version" : "versions"}`}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3">
          {starters.map((starter) => {
            const channel = channels.find((candidate) => candidate.key === starter.key);
            return (
              <article
                key={starter.key}
                className="rounded-2xl border border-slate-200 bg-white/70 p-4"
                style={{ borderLeft: `5px solid ${channel?.color ?? "#93c5fd"}` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">{starter.channelName}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {starter.content.length} characters
                      {starter.recommendedLimit ? ` · suggested maximum ${starter.recommendedLimit}` : ""}
                    </p>
                  </div>
                  <CopyButton
                    text={starter.content}
                    accent={channel?.color ?? "#0369a1"}
                    label={`Copy ${starter.channelName}`}
                  />
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-ink">
                  {starter.content}
                </p>
                {starter.warning && (
                  <p className="mt-2 text-xs font-bold text-amber-800">{starter.warning}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
