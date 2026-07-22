"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  LoaderCircle,
  Radio,
  UserRound,
} from "lucide-react";
import { createQuickItem } from "@/actions/quick-items";
import { channelWorkDateLabel, channelWorkLabel } from "@/lib/labels";
import {
  QUICK_ITEM_INITIAL_STATE,
  quickItemProductionDueAt,
  type QuickItemField,
} from "@/lib/quick-items";
import { parseDateInput } from "@/lib/engine/dates";

export type QuickItemChannelOption = {
  id: string;
  name: string;
  color: string;
  productionLeadDays: number;
  productionNotes: string | null;
};

export type QuickItemOwnerOption = {
  id: string;
  name: string;
};

export type QuickDateShortcut = {
  label: string;
  value: string;
};

function displayDate(value: string): string {
  const date = parseDateInput(value);
  return date
    ? date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Choose a date";
}

function FieldError({
  field,
  errors,
}: {
  field: QuickItemField;
  errors: Partial<Record<QuickItemField, string>>;
}) {
  const error = errors[field];
  return error ? (
    <p id={`${field}-error`} className="mt-1.5 text-sm font-semibold text-rose-700">
      {error}
    </p>
  ) : null;
}

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-100 text-xs font-extrabold text-sky-800">
        {number}
      </span>
      <h2 className="font-extrabold text-ink">{title}</h2>
    </div>
  );
}

export function QuickItemForm({
  channels,
  owners,
  currentUserId,
  todayKey,
  dateShortcuts,
}: {
  channels: QuickItemChannelOption[];
  owners: QuickItemOwnerOption[];
  currentUserId: string;
  todayKey: string;
  dateShortcuts: QuickDateShortcut[];
}) {
  const [state, formAction, pending] = useActionState(
    createQuickItem,
    QUICK_ITEM_INITIAL_STATE,
  );
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState("");
  const [date, setDate] = useState(todayKey);
  const [ownerId, setOwnerId] = useState(currentUserId);

  const channel = useMemo(
    () => channels.find((option) => option.id === channelId) ?? null,
    [channelId, channels],
  );
  const owner = owners.find((option) => option.id === ownerId) ?? null;
  const workLabel = channel ? channelWorkLabel(channel.name) : "communication piece";
  const dateLabel = channel ? channelWorkDateLabel(channel.name) : "Goes live on";
  const liveDate = parseDateInput(date);
  const today = parseDateInput(todayKey);
  const productionDue =
    channel && liveDate && today
      ? quickItemProductionDueAt(liveDate, channel.productionLeadDays, today)
      : null;
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid gap-4">
        {state.status === "error" && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {state.message}
          </div>
        )}

        <section className="card-float p-5 sm:p-6" aria-labelledby="quick-item-action-heading">
          <StepHeading number={1} title="Name the actual work" />
          <label id="quick-item-action-heading" htmlFor="title" className="text-sm font-bold text-ink">
            What needs to happen?
          </label>
          <p className="mt-1 text-xs leading-5 text-muted">
            Start with an action, not only a topic. For example: “Replace the
            homepage banner with the August service times.”
          </p>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={180}
            autoFocus
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "title-error" : undefined}
            placeholder="What should someone make, write, post, or update?"
            className={`mt-3 min-h-12 w-full rounded-2xl border bg-white px-4 py-3 text-ink outline-none transition focus:ring-2 focus:ring-sky-200 ${
              errors.title ? "border-rose-400" : "border-slate-200 focus:border-sky-400"
            }`}
          />
          <div className="mt-1 flex justify-between gap-3 text-xs text-muted">
            <span>One clear action works best.</span>
            <span>{title.length}/180</span>
          </div>
          <FieldError field="title" errors={errors} />
        </section>

        <section className="card-float p-5 sm:p-6" aria-labelledby="quick-item-channel-heading">
          <StepHeading number={2} title="Choose where it belongs" />
          <label id="quick-item-channel-heading" htmlFor="channelId" className="text-sm font-bold text-ink">
            Channel
          </label>
          <p className="mt-1 text-xs leading-5 text-muted">
            This creates exactly one piece of work in exactly one channel.
          </p>
          <select
            id="channelId"
            name="channelId"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            required
            aria-invalid={!!errors.channelId}
            aria-describedby={errors.channelId ? "channelId-error" : undefined}
            className={`mt-3 min-h-12 w-full rounded-2xl border bg-white px-4 py-3 font-semibold text-ink outline-none transition focus:ring-2 focus:ring-sky-200 ${
              errors.channelId ? "border-rose-400" : "border-slate-200 focus:border-sky-400"
            }`}
          >
            <option value="">Choose a channel…</option>
            {channels.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {channelWorkLabel(option.name)}
              </option>
            ))}
          </select>
          <FieldError field="channelId" errors={errors} />

          {channel && (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: channel.color }} />
                <div>
                  <p className="text-sm font-extrabold text-ink">This means: {workLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Its starting status will be <b className="text-ink">Not started</b>.
                    The assigned person can later mark this specific {workLabel} in
                    progress, ready, complete, or skipped.
                  </p>
                </div>
              </div>
              {channel.productionNotes && (
                <details className="mt-3 border-t border-sky-200 pt-3">
                  <summary className="cursor-pointer text-xs font-bold text-sky-900">
                    Show {channel.name} production notes
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-sky-950/75">
                    {channel.productionNotes}
                  </p>
                </details>
              )}
            </div>
          )}
        </section>

        <section className="card-float p-5 sm:p-6" aria-labelledby="quick-item-timing-heading">
          <StepHeading number={3} title="Set the handoff" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label id="quick-item-timing-heading" htmlFor="date" className="text-sm font-bold text-ink">
                {dateLabel}
              </label>
              <input
                id="date"
                name="date"
                type="date"
                value={date}
                min={todayKey}
                onChange={(event) => setDate(event.target.value)}
                required
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? "date-error" : undefined}
                className={`mt-2 min-h-12 w-full rounded-2xl border bg-white px-4 py-3 text-ink outline-none transition focus:ring-2 focus:ring-sky-200 ${
                  errors.date ? "border-rose-400" : "border-slate-200 focus:border-sky-400"
                }`}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {dateShortcuts.map((shortcut) => (
                  <button
                    key={shortcut.value}
                    type="button"
                    onClick={() => setDate(shortcut.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      date === shortcut.value
                        ? "border-sky-300 bg-sky-100 text-sky-900"
                        : "border-slate-200 bg-white text-muted hover:border-sky-300"
                    }`}
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
              <FieldError field="date" errors={errors} />
            </div>

            <div>
              <label htmlFor="ownerId" className="text-sm font-bold text-ink">
                Who owns this {workLabel}?
              </label>
              <select
                id="ownerId"
                name="ownerId"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                aria-invalid={!!errors.ownerId}
                aria-describedby={errors.ownerId ? "ownerId-error" : undefined}
                className={`mt-2 min-h-12 w-full rounded-2xl border bg-white px-4 py-3 text-ink outline-none transition focus:ring-2 focus:ring-sky-200 ${
                  errors.ownerId ? "border-rose-400" : "border-slate-200 focus:border-sky-400"
                }`}
              >
                <option value="">Leave unassigned</option>
                {owners.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}{option.id === currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-muted">
                This person owns the {workLabel} itself—not the event, graphic, or
                copy for any other channel.
              </p>
              <FieldError field="ownerId" errors={errors} />
            </div>
          </div>
        </section>

        <section className="card-float p-5 sm:p-6" aria-labelledby="quick-item-details-heading">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-600" aria-hidden="true" />
            <h2 id="quick-item-details-heading" className="font-extrabold text-ink">
              Helpful details <span className="font-normal text-muted">(optional)</span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="assetLink" className="text-sm font-bold text-ink">
                Existing asset or working file
              </label>
              <div className="relative mt-2">
                <Link2 className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" aria-hidden="true" />
                <input
                  id="assetLink"
                  name="assetLink"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  aria-invalid={!!errors.assetLink}
                  aria-describedby={errors.assetLink ? "assetLink-error" : undefined}
                  className={`min-h-12 w-full rounded-2xl border bg-white py-3 pl-10 pr-4 text-ink outline-none transition focus:ring-2 focus:ring-sky-200 ${
                    errors.assetLink ? "border-rose-400" : "border-slate-200 focus:border-sky-400"
                  }`}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">Canva, Google Drive, Dropbox, or another working link.</p>
              <FieldError field="assetLink" errors={errors} />
            </div>
            <div>
              <label htmlFor="note" className="text-sm font-bold text-ink">
                Instructions for the person doing it
              </label>
              <textarea
                id="note"
                name="note"
                rows={3}
                maxLength={1000}
                placeholder="Copy direction, dimensions, approvals, or anything easy to miss…"
                aria-invalid={!!errors.note}
                aria-describedby={errors.note ? "note-error" : undefined}
                className={`mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-ink outline-none transition focus:ring-2 focus:ring-sky-200 ${
                  errors.note ? "border-rose-400" : "border-slate-200 focus:border-sky-400"
                }`}
              />
              <FieldError field="note" errors={errors} />
            </div>
          </div>
        </section>
      </div>

      <aside className="card-float overflow-hidden lg:sticky lg:top-4">
        <div className="border-b border-slate-100 bg-gradient-to-br from-sky-50 to-violet-50 p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-700">
            Review before creating
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-ink">
            {title.trim() || "Your quick communication"}
          </h2>
        </div>
        <div className="grid gap-4 p-5 text-sm">
          <div className="flex gap-3">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Work created</p>
              <p className="mt-0.5 font-bold text-ink">{workLabel}</p>
              <p className="text-muted">{channel?.name ?? "Choose a channel"}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{dateLabel}</p>
              <p className="mt-0.5 font-bold text-ink">{displayDate(date)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Work due</p>
              <p className="mt-0.5 font-bold text-ink">
                {productionDue
                  ? productionDue.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "Choose a channel"}
              </p>
              {channel && productionDue && today && productionDue <= today && (
                <p className="text-xs text-amber-700">This starts as due today—not overdue.</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Owner</p>
              <p className="mt-0.5 font-bold text-ink">{owner?.name ?? "Unassigned"}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Starting status</p>
              <p className="mt-0.5 font-bold text-ink">Not started</p>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/70 p-5">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating…
              </>
            ) : (
              <>Create {workLabel}</>
            )}
          </button>
          <Link
            href="/outputs"
            className="mt-2 flex min-h-11 items-center justify-center rounded-2xl text-sm font-semibold text-muted hover:bg-white hover:text-ink"
          >
            Cancel
          </Link>
          <p className="mt-2 text-center text-xs leading-5 text-muted">
            You’ll land on the selected channel where you can edit, complete, or
            skip this specific piece.
          </p>
        </div>
      </aside>
    </form>
  );
}
