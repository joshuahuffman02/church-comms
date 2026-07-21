"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignChannelPlacement } from "@/actions/assign";
import { removeChannelFromRequest } from "@/actions/events";
import type {
  AssignChannel,
  AssignmentEvent,
  AssignmentOverview,
  ChannelAssignment,
} from "@/lib/assign";

type View = "attention" | "all";

const eventDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function displayChannelName(name: string): string {
  return name.replace(/\s*\(Top 3\)$/i, "");
}

function SummaryCard({ label, value, detail, tone = "slate" }: {
  label: string;
  value: number;
  detail: string;
  tone?: "slate" | "amber" | "rose" | "sky";
}) {
  const tones = {
    slate: "border-slate-200 bg-white",
    amber: "border-amber-200 bg-amber-50/70",
    rose: "border-rose-200 bg-rose-50/70",
    sky: "border-sky-200 bg-sky-50/70",
  };
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-ink">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted">{detail}</div>
    </div>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "amber" | "rose" | "sky" | "violet" | "slate" }) {
  const tones = {
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    sky: "bg-sky-100 text-sky-800",
    violet: "bg-violet-100 text-violet-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

function AssignmentRow({
  assignment,
  channel,
  pending,
  busyChannelId,
  onReschedule,
  onRemove,
}: {
  assignment: ChannelAssignment;
  channel: AssignChannel;
  pending: boolean;
  busyChannelId: string | null;
  onReschedule: (channel: AssignChannel) => void;
  onRemove: (channel: AssignChannel) => void;
}) {
  const nextDate = assignment.futureDatesMs[0];
  const lastPastDate = assignment.pastDatesMs.at(-1);
  const isPastOnly = assignment.futureDatesMs.length === 0 && assignment.pastDatesMs.length > 0;
  const isUndated = assignment.futureDatesMs.length === 0 && assignment.pastDatesMs.length === 0;
  const busy = pending && busyChannelId === channel.id;

  return (
    <div className={`rounded-2xl border px-4 py-3 ${assignment.needsAttention ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: channel.color }} aria-hidden="true" />
        <div className="min-w-52 flex-1">
          <div className="font-semibold text-ink">{displayChannelName(channel.name)}</div>
          <div className={`mt-0.5 text-xs ${assignment.needsAttention ? "font-semibold text-amber-800" : "text-muted"}`}>
            {nextDate
              ? `Next appearance ${shortDate(nextDate)}${assignment.futureDatesMs.length > 1 ? ` · ${assignment.futureDatesMs.length} upcoming dates` : ""}`
              : isPastOnly
                ? `Past dates only · last appeared ${shortDate(lastPastDate!)}`
                : "No appearance date is scheduled"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {assignment.lockedDatesMs.length > 0 && <StatusBadge tone="sky">{assignment.lockedDatesMs.length} locked</StatusBadge>}
          {assignment.featuredDatesMs.length > 0 && <StatusBadge tone="violet">Featured</StatusBadge>}
          {assignment.duplicateDatesMs.length > 0 && (
            <StatusBadge tone="rose">{assignment.duplicateDatesMs.length} duplicate {assignment.duplicateDatesMs.length === 1 ? "date" : "dates"}</StatusBadge>
          )}
          {assignment.undatedCount > 0 && <StatusBadge tone="amber">Undated</StatusBadge>}
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {(isPastOnly || isUndated) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onReschedule(channel)}
              className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50 sm:col-span-1"
            >
              {busy ? "Scheduling…" : "Schedule next date"}
            </button>
          )}
          <Link
            href={`/outputs/${channel.key}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-bg"
          >
            View channel
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => onRemove(channel)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {busy ? "Working…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventAssignmentCard({ event, channels }: { event: AssignmentEvent; channels: AssignChannel[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyChannelId, setBusyChannelId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const channelById = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
  const assignedIds = useMemo(() => new Set(event.assignments.map((assignment) => assignment.channelId)), [event.assignments]);
  const available = channels.filter((channel) => !assignedIds.has(channel.id));
  const selected = available.find((channel) => channel.id === selectedChannelId) ?? available[0];
  const staleCount = event.assignments.filter((assignment) => assignment.futureDatesMs.length === 0).length;

  function addOrReschedule(channel: AssignChannel, verb: "add" | "reschedule") {
    if (pending) return;
    setBusyChannelId(channel.id);
    setMessage(null);
    start(async () => {
      try {
        const result = await assignChannelPlacement(event.id, channel.id);
        if (!result) throw new Error("That channel could not be scheduled.");
        setMessage({
          kind: "success",
          text: `${displayChannelName(channel.name)} ${verb === "add" ? "was added" : "now has a current date"}: ${shortDate(result.scheduledAtMs)}.`,
        });
        setSelectedChannelId("");
        router.refresh();
      } catch (error) {
        setMessage({
          kind: "error",
          text: error instanceof Error ? error.message : `Could not schedule ${displayChannelName(channel.name)}.`,
        });
      } finally {
        setBusyChannelId(null);
      }
    });
  }

  function remove(channel: AssignChannel) {
    if (pending) return;
    const protection = event.assignments.find((assignment) => assignment.channelId === channel.id);
    const protectedText = protection && (protection.lockedDatesMs.length > 0 || protection.featuredDatesMs.length > 0)
      ? " This also removes its locked or featured dates."
      : "";
    if (!window.confirm(`Remove ${event.title} from ${displayChannelName(channel.name)}? This clears every appearance on that channel.${protectedText}`)) {
      return;
    }
    setBusyChannelId(channel.id);
    setMessage(null);
    start(async () => {
      try {
        await removeChannelFromRequest(event.id, channel.id);
        setMessage({ kind: "success", text: `${displayChannelName(channel.name)} was removed from this event.` });
        router.refresh();
      } catch (error) {
        setMessage({
          kind: "error",
          text: error instanceof Error ? error.message : `Could not remove ${displayChannelName(channel.name)}.`,
        });
      } finally {
        setBusyChannelId(null);
      }
    });
  }

  return (
    <article className={`card-float overflow-hidden ${event.needsAttention ? "border border-amber-200" : ""}`}>
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/requests/${event.id}`} className="text-lg font-extrabold text-ink hover:text-sky-700 hover:underline">
              {event.title}
            </Link>
            <div className="mt-1 text-sm text-muted">Event {eventDate(event.eventStartMs)} · {event.tierLabel}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {event.needsChannel ? (
              <StatusBadge tone="rose">No current channels</StatusBadge>
            ) : (
              <StatusBadge tone="slate">{event.futureChannelCount} current {event.futureChannelCount === 1 ? "channel" : "channels"}</StatusBadge>
            )}
            {staleCount > 0 && <StatusBadge tone="amber">{staleCount} {staleCount === 1 ? "channel needs" : "channels need"} a date</StatusBadge>}
          </div>
        </div>
      </div>

      <div className="space-y-2 p-4 sm:p-5">
        {event.assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-800">
            This event is not scheduled on any channel yet.
          </div>
        ) : event.assignments.map((assignment) => {
          const channel = channelById.get(assignment.channelId);
          return channel ? (
            <AssignmentRow
              key={assignment.channelId}
              assignment={assignment}
              channel={channel}
              pending={pending}
              busyChannelId={busyChannelId}
              onReschedule={(target) => addOrReschedule(target, "reschedule")}
              onRemove={remove}
            />
          ) : null;
        })}

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
          {available.length > 0 ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-bold text-muted">
                Add another channel
                <select
                  value={selected?.id ?? ""}
                  onChange={(event) => setSelectedChannelId(event.target.value)}
                  disabled={pending}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-ink disabled:opacity-50"
                >
                  {available.map((channel) => <option key={channel.id} value={channel.id}>{displayChannelName(channel.name)}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || !selected}
                onClick={() => selected && addOrReschedule(selected, "add")}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50"
              >
                {pending && busyChannelId === selected?.id ? "Adding…" : "Add channel"}
              </button>
            </div>
          ) : <div className="text-sm text-muted">Every active channel has been assigned.</div>}
          <Link
            href={`/requests/${event.id}/attach`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-bg"
          >
            Choose an exact date
          </Link>
        </div>

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm font-semibold ${message.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </article>
  );
}

export function AssignBoard({ channels, overview }: { channels: AssignChannel[]; overview: AssignmentOverview }) {
  const [view, setView] = useState<View>("attention");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEvents = overview.events.filter((event) => {
    if (view === "attention" && !event.needsAttention) return false;
    return !normalizedQuery || event.title.toLowerCase().includes(normalizedQuery);
  });
  const protectedCount = overview.summary.lockedCount + overview.summary.featuredCount;

  return (
    <div>
      <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Assignment summary">
        <SummaryCard
          label="Needs attention"
          value={overview.summary.attentionEventCount}
          detail="Events with no current channel, an old date, or a duplicate."
          tone={overview.summary.attentionEventCount > 0 ? "amber" : "slate"}
        />
        <SummaryCard
          label="Needs a channel"
          value={overview.summary.needsChannelCount}
          detail="Upcoming events with nothing scheduled today or later."
          tone={overview.summary.needsChannelCount > 0 ? "rose" : "slate"}
        />
        <SummaryCard
          label="Upcoming appearances"
          value={overview.summary.futureAppearanceCount}
          detail={`Across ${overview.summary.upcomingCount} upcoming events.`}
          tone="sky"
        />
        <SummaryCard
          label="Protected dates"
          value={protectedCount}
          detail="Locked dates and featured announcement-video spots."
        />
      </section>

      <section className="card-float mb-4 p-4" aria-label="Assignment filters">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Events to show">
            <button
              type="button"
              role="tab"
              aria-selected={view === "attention"}
              onClick={() => setView("attention")}
              className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold transition ${view === "attention" ? "bg-ink text-white" : "border border-slate-200 text-ink hover:bg-sky-bg"}`}
            >
              Needs action · {overview.summary.attentionEventCount}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "all"}
              onClick={() => setView("all")}
              className={`min-h-11 rounded-full px-4 py-2 text-sm font-bold transition ${view === "all" ? "bg-ink text-white" : "border border-slate-200 text-ink hover:bg-sky-bg"}`}
            >
              All upcoming · {overview.summary.upcomingCount}
            </button>
          </div>
          <label className="min-w-0 text-xs font-bold text-muted lg:w-80">
            Search events
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by event name"
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-ink"
            />
          </label>
        </div>
        {(overview.summary.pastOnlyCount > 0 || overview.summary.duplicateCount > 0) && (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Attention includes {overview.summary.pastOnlyCount} channel {overview.summary.pastOnlyCount === 1 ? "assignment" : "assignments"} with only past dates
            {overview.summary.duplicateCount > 0 ? ` and ${overview.summary.duplicateCount} duplicate ${overview.summary.duplicateCount === 1 ? "date" : "dates"}` : ""}.
          </p>
        )}
      </section>

      <div className="space-y-4">
        {visibleEvents.length > 0 ? visibleEvents.map((event) => (
          <EventAssignmentCard key={event.id} event={event} channels={channels} />
        )) : (
          <div className="card-float p-8 text-center">
            <div className="font-bold text-ink">No events match this view.</div>
            <p className="mt-1 text-sm text-muted">Try the other tab or clear your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
