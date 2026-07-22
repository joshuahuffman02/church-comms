import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Download,
  FilePlus2,
  Import,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Megaphone,
  RadioTower,
  RefreshCw,
  Route,
  Settings2,
  ShieldAlert,
  Sparkles,
  UserRoundCheck,
  WandSparkles,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";

export const metadata = { title: "Help & how-to · Church Comms" };

type Tone = "sky" | "violet" | "emerald" | "amber" | "rose" | "slate";

type HelpCard = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  tone: Tone;
};

const TONES: Record<Tone, string> = {
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
  sky: "bg-sky-100 text-sky-700",
  slate: "bg-slate-100 text-slate-700",
  violet: "bg-violet-100 text-violet-700",
};

const EVERYDAY_STARTS: HelpCard[] = [
  {
    href: "/this-week",
    icon: LayoutDashboard,
    title: "See the whole week",
    description: "Check what must be made, reviewed, scheduled, or used in the current week.",
    action: "Open This Week",
    tone: "sky",
  },
  {
    href: "/my-tasks",
    icon: UserRoundCheck,
    title: "See only my work",
    description: "Focus on the event tasks and channel pieces assigned specifically to you.",
    action: "Open My Tasks",
    tone: "emerald",
  },
  {
    href: "/run-sheet",
    icon: ClipboardCheck,
    title: "Run Sunday morning",
    description: "Use the Sunday Checklist during service prep. Checked items stay visible for reference.",
    action: "Open Sunday Checklist",
    tone: "violet",
  },
];

const COMMON_JOBS: HelpCard[] = [
  {
    href: "/requests/new",
    icon: FilePlus2,
    title: "Add a new event",
    description: "Enter the event facts once. The app plans eligible channels automatically when you save.",
    action: "Create an event",
    tone: "sky",
  },
  {
    href: "/imports",
    icon: Import,
    title: "Review imported events",
    description: "Accept, link, or ignore events from Planning Center and connected calendars in one inbox.",
    action: "Open Imports",
    tone: "emerald",
  },
  {
    href: "/quick/new",
    icon: Zap,
    title: "Post one quick announcement",
    description: "Create a one-off item for one channel without setting up a full promotional campaign.",
    action: "Create a quick post",
    tone: "amber",
  },
  {
    href: "/requests",
    icon: Megaphone,
    title: "Change an event’s channels",
    description: "Open the event, then add or remove channel pieces. Removing one does not cancel the event.",
    action: "Find the event",
    tone: "violet",
  },
  {
    href: "/pipeline",
    icon: WandSparkles,
    title: "Make or review a piece",
    description: "Production names the exact output—slide, post, email item, or video segment—and who owns it.",
    action: "Open Production",
    tone: "rose",
  },
  {
    href: "/outputs",
    icon: RadioTower,
    title: "Arrange a channel lineup",
    description: "Choose what a channel will carry, feature important items, or lock placements that must not move.",
    action: "Open Channels",
    tone: "sky",
  },
  {
    href: "/calendar",
    icon: CalendarDays,
    title: "Plan farther ahead",
    description: "Switch between events, advertising dates, and production deadlines in the monthly calendar.",
    action: "Open Calendar",
    tone: "emerald",
  },
  {
    href: "/exports",
    icon: Download,
    title: "Hand off Sunday files",
    description: "Copy or download the current channel lists, Sunday Loop plan, and announcement-video script.",
    action: "Open Downloads",
    tone: "slate",
  },
];

const FLOW_STEPS = [
  {
    title: "Add or import",
    description: "Start with accurate event dates, audience, registration needs, and a clear description.",
    href: "/imports",
    link: "Review intake",
  },
  {
    title: "Approve and plan",
    description: "The app builds the channel schedule and deadlines; staff can adjust the event when needed.",
    href: "/requests",
    link: "Review events",
  },
  {
    title: "Make and review",
    description: "Each channel piece has its own owner and status so everyone knows exactly what is being made.",
    href: "/pipeline",
    link: "Open Production",
  },
  {
    title: "Schedule and use",
    description: "Final pieces appear on weekly views, channel lineups, Downloads, and the Sunday Checklist.",
    href: "/this-week",
    link: "See this week",
  },
];

function HelpLinkCard({ card }: { card: HelpCard }) {
  const Icon = card.icon;
  return (
    <Link href={card.href} className="card-float card-lift group flex min-h-52 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-2xl ${TONES[card.tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight
          className="mt-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700"
          aria-hidden="true"
        />
      </div>
      <h3 className="mt-4 font-extrabold text-ink">{card.title}</h3>
      <p className="mt-1 flex-1 text-sm leading-6 text-muted">{card.description}</p>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-sky-700">{card.action}</p>
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-extrabold text-ink">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function Tip({
  icon: Icon,
  title,
  children,
  tone = "sky",
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <article className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm">
      <span className={`grid h-10 w-10 place-items-center rounded-2xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 font-extrabold text-ink">{title}</h3>
      <div className="mt-1 text-sm leading-6 text-muted">{children}</div>
    </article>
  );
}

export default async function HelpPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const activeChannels = await db.channel.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { color: true, key: true, name: true },
  });
  const canConfigure = isAdmin(user.roles);

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-12">
      <header className="card-float overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Help center</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink sm:text-4xl">What are you trying to do?</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              Start with the job in front of you. Each guide opens the exact page where that work happens and explains what the controls change.
            </p>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-sky-100 to-violet-100 p-5 lg:w-80">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-sky-700 shadow-sm">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Best daily starting point</p>
                <p className="font-extrabold text-ink">This Week</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              It brings deadlines, scheduled appearances, and Sunday work into one current-week view.
            </p>
            <Link href="/this-week" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Open This Week <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <nav aria-label="Help topics" className="mt-7 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {[
            ["#start", "Daily starting points"],
            ["#jobs", "Common jobs"],
            ["#workflow", "How work flows"],
            ["#scheduling", "Scheduling rules"],
            ["#troubleshooting", "When something looks wrong"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-300 hover:bg-sky-50">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section id="start" className="scroll-mt-6" aria-labelledby="start-heading">
        <div id="start-heading">
          <SectionHeading
            eyebrow="Most days"
            title="Choose the view that matches your job"
            description="You do not need to understand the whole system to get useful work done. These three views cover the normal weekly rhythm."
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {EVERYDAY_STARTS.map((card) => <HelpLinkCard key={card.href} card={card} />)}
        </div>
      </section>

      <section id="jobs" className="scroll-mt-6" aria-labelledby="jobs-heading">
        <div id="jobs-heading">
          <SectionHeading
            eyebrow="Common jobs"
            title="Go straight to the right workspace"
            description="Pick the result you need. The wording here matches the buttons and controls you will see after opening the page."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COMMON_JOBS.map((card) => <HelpLinkCard key={card.href} card={card} />)}
        </div>
      </section>

      <section id="workflow" className="scroll-mt-6" aria-labelledby="workflow-heading">
        <div id="workflow-heading">
          <SectionHeading
            eyebrow="The big picture"
            title="One event, four clear stages"
            description="Event status describes the whole event. Each channel piece has its own owner and status underneath it."
          />
        </div>
        <div className="card-float overflow-hidden p-5 sm:p-6">
          <ol className="grid gap-4 lg:grid-cols-4">
            {FLOW_STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-3xl bg-white/70 p-5 ring-1 ring-inset ring-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-extrabold text-white">{index + 1}</span>
                <h3 className="mt-4 font-extrabold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{step.description}</p>
                <Link href={step.href} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-sky-700 hover:underline">
                  {step.link} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>

          <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <summary className="cursor-pointer font-bold text-ink">What do the statuses mean?</summary>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="font-bold text-ink">Whole event</p>
                <p className="mt-1 leading-6 text-muted">Submitted → Triaged → Approved → In Production → Proof → Scheduled → Published</p>
              </div>
              <div>
                <p className="font-bold text-ink">One channel piece</p>
                <p className="mt-1 leading-6 text-muted">Not started → In progress → Needs review → Ready to use → Scheduled → Complete</p>
              </div>
              <p className="sm:col-span-2 leading-6 text-muted">
                <strong className="text-ink">Skip</strong> means one piece is intentionally not needed and can be restored. <strong className="text-ink">Remove channel</strong> removes that channel from the event. <strong className="text-ink">Cancel event</strong> stops the whole event.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="scheduling" className="scroll-mt-6" aria-labelledby="scheduling-heading">
        <div id="scheduling-heading">
          <SectionHeading
            eyebrow="Scheduling rules"
            title="What the app handles automatically"
            description="The schedule updates from the event information and channel settings, while still leaving room for deliberate staff choices."
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Tip icon={Route} title="New events plan themselves">
            Saving or importing an eligible event creates its channel pieces and dates. You do not need a separate manual sync.
          </Tip>
          <Tip icon={LockKeyhole} title="Locks protect decisions" tone="violet">
            Lock a channel placement when it must stay put. Future replanning respects that decision instead of kicking it out.
          </Tip>
          <Tip icon={CheckCircle2} title="Promotion length matches the event" tone="emerald">
            Routine weekly events use a short week-of plan. Registration and special events can use longer promotion presets.
          </Tip>
          <Tip icon={CalendarDays} title="Only useful dates stay active" tone="amber">
            Past advertising dates leave active work lists. Month-specific promotions appear only inside their configured month.
          </Tip>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <div className="card-float p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Current setup</p>
                <h3 className="mt-1 text-xl font-extrabold text-ink">Active channels</h3>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">{activeChannels.length} active</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">This list comes from Settings, so the guide stays aligned when channels are added, renamed, paused, or removed.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeChannels.map((channel) => (
                <Link key={channel.key} href={`/outputs/${channel.key}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: channel.color }} aria-hidden="true" />
                  {channel.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="card-float p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Announcement Video</p>
            <h3 className="mt-1 text-xl font-extrabold text-ink">Feature and remove mean different things</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
              <p><strong className="text-ink">Feature</strong> reserves one of the highlighted Top 3 positions for that Sunday.</p>
              <p><strong className="text-ink">Not featured</strong> can still remain in the regular video lineup if capacity allows.</p>
              <p><strong className="text-ink">Remove</strong> takes that event out of the Announcement Video only; the event and its other channels stay intact.</p>
            </div>
            <Link href="/outputs/announcement_video" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-100 px-4 py-2 text-sm font-bold text-violet-800 hover:bg-violet-200">
              Open video lineup <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section id="troubleshooting" className="scroll-mt-6" aria-labelledby="troubleshooting-heading">
        <div id="troubleshooting-heading">
          <SectionHeading
            eyebrow="When something looks wrong"
            title="Start with the smallest fix"
            description="Most surprises come from a date, channel choice, promotion preset, or duplicate import—not from lost work."
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Tip icon={CircleHelp} title="An event is missing from a work page">
            Past channel dates are hidden from active lists. Open the event and check its date, promotion preset, channel pieces, and whether promotion is turned off.
          </Tip>
          <Tip icon={Megaphone} title="An event is on the wrong channel" tone="rose">
            Remove that channel from the event or use the small remove control on the channel page. This changes one channel, not the whole event.
          </Tip>
          <Tip icon={LockKeyhole} title="A planned item keeps moving" tone="violet">
            Lock the event’s placement on that channel. The next automatic replan will preserve the locked date and position.
          </Tip>
          <Tip icon={RefreshCw} title="Two imported events are really one" tone="amber">
            Use Recurring and Possible duplicates to merge matching copies or turn repeated dates into one recurrence pattern.
            <Link href="/recurring" className="ml-1 font-bold text-sky-700 hover:underline">Review recurring imports</Link>.
          </Tip>
          <Tip icon={ShieldAlert} title="A channel feels overloaded" tone="rose">
            Heads-up shows capacity, Top 3, loop-length, and repetition risks before the schedule ships.
            <Link href="/guardrails" className="ml-1 font-bold text-sky-700 hover:underline">Review Heads-up</Link>.
          </Tip>
          <Tip icon={ListChecks} title="The same week looks different on two pages" tone="slate">
            Confirm both pages are showing the same Sunday or week. Channel Plan, This Week, Sunday Checklist, and Downloads now use the same saved schedule.
          </Tip>
        </div>
      </section>

      {canConfigure ? (
        <section aria-labelledby="admin-help-heading" className="card-float overflow-hidden p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                <Settings2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Admin setup</p>
                <h2 id="admin-help-heading" className="mt-1 text-xl font-extrabold text-ink">Change the rules behind the workflow</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Settings controls channels and timing, users, connections, recurring tag rules, approvals, checklists, and trusted app updates.</p>
              </div>
            </div>
            <Link href="/settings" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
              Open Settings <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}

      <details className="card-float p-5 sm:p-6">
        <summary className="cursor-pointer text-lg font-extrabold text-ink">Plain-language word list</summary>
        <p className="mt-2 text-sm text-muted">Open this when an older or technical term appears in a note or conversation.</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Channel", "One place communication appears, such as Sunday Loop, email, or Facebook."],
            ["Piece", "The concrete slide, post, email item, video segment, or other work made for one channel."],
            ["Appearance", "A date when a channel piece is scheduled to be posted, sent, shown, or used."],
            ["Event owner", "The person responsible for the whole event’s facts and overall progress."],
            ["Piece owner", "The person responsible for making or placing one specific channel output."],
            ["Feature", "A highlighted Announcement Video Top 3 position for one Sunday."],
            ["Lock", "A protected placement that automatic replanning is not allowed to move."],
            ["Skip", "Mark one piece as intentionally not needed while keeping it recoverable."],
            ["Cancel", "Stop the whole event and its active communication work."],
            ["Big push", "A temporary exception that gives a major event more promotional room."],
            ["Heads-up", "A warning about overload, repetition, capacity, or another scheduling risk."],
            ["Promotion preset", "The reusable timing pattern that decides how early and how often an event is advertised."],
          ].map(([term, definition]) => (
            <div key={term} className="rounded-2xl bg-white/70 p-4 ring-1 ring-inset ring-slate-100">
              <dt className="font-bold text-ink">{term}</dt>
              <dd className="mt-1 leading-6 text-muted">{definition}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
