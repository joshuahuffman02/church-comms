import Link from "next/link";
import { ArrowLeft, CalendarPlus, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { AccessRequiredCard } from "@/components/access-required-card";
import {
  QuickItemForm,
  type QuickDateShortcut,
} from "@/components/quick-item-form";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { comingSunday } from "@/lib/week";
import { ymd } from "@/lib/exports";

export default async function NewQuickItem() {
  const me = await getSessionUser();
  if (!me || !isEditor(me.roles)) {
    return (
      <AccessRequiredCard
        title="Editor access required"
        message="You need editor access to add standalone communication items."
      />
    );
  }

  const [channels, owners] = await Promise.all([
    db.channel.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        productionLeadDays: true,
        productionNotes: true,
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const today = atMidnight(new Date());
  const shortcuts: QuickDateShortcut[] = [
    { label: "Today", value: ymd(today) },
    { label: "Tomorrow", value: ymd(addDays(today, 1)) },
    { label: "This Sunday", value: ymd(comingSunday(today)) },
  ].filter(
    (shortcut, index, all) =>
      all.findIndex((candidate) => candidate.value === shortcut.value) === index,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/outputs"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All channels
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            One channel · one date
          </p>
          <h1 className="text-3xl font-extrabold text-ink">Quick post</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Add a standalone communication job without creating a full event. You’ll
            choose the exact work, owner, and date before anything is saved.
          </p>
        </div>
        <Link
          href="/requests/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink hover:border-sky-300 hover:bg-sky-50"
        >
          <CalendarPlus className="h-4 w-4 text-sky-700" aria-hidden="true" />
          This is an event instead
        </Link>
      </header>

      <div className="mb-5 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm text-violet-950">
        <b>Use Quick Post for:</b> a website correction, one social post, an app
        notice, a one-off slide, or another single-channel task. If it has an event
        date, registration, or needs several channels, create an event instead.
      </div>

      {channels.length === 0 ? (
        <section className="card-float p-6">
          <h2 className="font-extrabold text-ink">No active channels are available</h2>
          <p className="mt-1 text-sm text-muted">
            An administrator needs to activate or create a channel before a quick
            communication can be added.
          </p>
          <Link href="/settings/channels" className="mt-3 inline-flex font-bold text-sky-700 hover:underline">
            Open channel settings →
          </Link>
        </section>
      ) : (
        <QuickItemForm
          channels={channels}
          owners={owners}
          currentUserId={me.id}
          todayKey={ymd(today)}
          dateShortcuts={shortcuts}
        />
      )}
    </div>
  );
}
