import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
  Cable,
  Clapperboard,
  ClipboardCheck,
  Palette,
  RadioTower,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { db } from "@/lib/db";

type Tile = {
  href: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  impact: string;
  tone: "sky" | "violet" | "emerald" | "amber" | "slate";
};

type Group = {
  heading: string;
  description: string;
  tiles: Tile[];
};

const GROUPS: Group[] = [
  {
    heading: "Plan and publish",
    description: "The names, templates, and teams people see in everyday work.",
    tiles: [
      {
        href: "/settings/ministries",
        icon: Palette,
        title: "Ministries",
        blurb: "Manage the teams attached to events and their identifying colors.",
        impact: "Event organization",
        tone: "violet",
      },
      {
        href: "/settings/video-script",
        icon: Clapperboard,
        title: "Video script",
        blurb: "Set the reusable intro and outro for Sunday announcement scripts.",
        impact: "Content template",
        tone: "sky",
      },
    ],
  },
  {
    heading: "Automation and rules",
    description: "Control what the app suggests, schedules, and asks the team to approve.",
    tiles: [
      {
        href: "/settings/sprints",
        icon: Rocket,
        title: "Big pushes",
        blurb: "Temporarily lift normal limits for Easter, Christmas, VBS, and campaigns.",
        impact: "Scheduling capacity",
        tone: "amber",
      },
      {
        href: "/settings/approvals",
        icon: BadgeCheck,
        title: "Approvals",
        blurb: "Require sign-off before selected events or deliverables can move ahead.",
        impact: "Workflow control",
        tone: "emerald",
      },
      {
        href: "/settings/tag-rules",
        icon: Tags,
        title: "Tag rules",
        blurb: "Classify imported events and suggest their audience, ministry, or checklist.",
        impact: "Import automation",
        tone: "sky",
      },
      {
        href: "/settings/playbooks",
        icon: ClipboardCheck,
        title: "Event checklists",
        blurb: "Build reusable, dated task plans for larger events and campaigns.",
        impact: "Task templates",
        tone: "violet",
      },
    ],
  },
  {
    heading: "People and system",
    description: "Access, integrations, and maintenance for the app itself.",
    tiles: [
      {
        href: "/settings/users",
        icon: Users,
        title: "Team and access",
        blurb: "Choose who can sign in and what each person is allowed to change.",
        impact: "Access control",
        tone: "slate",
      },
      {
        href: "/settings/connections",
        icon: Cable,
        title: "Connections",
        blurb: "Link Planning Center, email, and calendars, then verify each connection.",
        impact: "External services",
        tone: "emerald",
      },
      {
        href: "/settings/updates",
        icon: RefreshCw,
        title: "App updates",
        blurb: "Check GitHub and run trusted app updates from this installation.",
        impact: "System maintenance",
        tone: "slate",
      },
    ],
  },
];

const TONES = {
  sky: "bg-sky-100 text-sky-700",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-100 text-slate-700",
} as const;

function SettingsTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <Link href={tile.href} className="card-float card-lift group flex min-h-44 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-2xl ${TONES[tile.tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight className="mt-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-extrabold text-ink">{tile.title}</h3>
      <p className="mt-1 flex-1 text-sm leading-6 text-muted">{tile.blurb}</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{tile.impact}</p>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-slate-100">
      <p className="text-xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </div>
  );
}

export default async function SettingsHome() {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) return <AdminOnlyCard area="settings" />;

  const [activeChannels, totalChannels, activeMinistries, activeUsers] = await Promise.all([
    db.channel.count({ where: { active: true } }),
    db.channel.count(),
    db.ministry.count({ where: { active: true } }),
    db.user.count({ where: { active: true } }),
  ]);
  const pausedChannels = totalChannels - activeChannels;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="card-float overflow-hidden p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">App configuration</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">Settings</h1>
            <p className="mt-2 max-w-2xl leading-7 text-muted">
              Choose how events are scheduled, organized, approved, and handed off. Changes here affect the whole communications workflow.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin controls
          </span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={String(activeChannels)} label="active channels" />
          <Stat value={String(pausedChannels)} label="paused channels" />
          <Stat value={String(activeMinistries)} label="active ministries" />
          <Stat value={String(activeUsers)} label="active teammates" />
        </div>
      </header>

      <section className="mt-6" aria-labelledby="channels-setting-heading">
        <div className="card-float overflow-hidden border-l-[5px] border-l-sky-500 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700">
                <RadioTower className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Most-used setting</p>
                <h2 id="channels-setting-heading" className="mt-0.5 text-xl font-extrabold text-ink">Channels and timing</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  Turn channels on or off, set promotion timing, and control capacity. Saving recalculates future placements and keeps Channel Plan, This Week, Sunday Checklist, and Downloads aligned.
                </p>
              </div>
            </div>
            <Link href="/settings/channels" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
              Manage channels <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.heading} className="mt-7" aria-labelledby={`settings-${group.heading.replaceAll(" ", "-")}`}>
          <div className="mb-3">
            <h2 id={`settings-${group.heading.replaceAll(" ", "-")}`} className="text-lg font-extrabold text-ink">{group.heading}</h2>
            <p className="mt-0.5 text-sm text-muted">{group.description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile) => <SettingsTile key={tile.href} tile={tile} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
