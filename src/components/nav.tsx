import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { getGuardrails } from "@/lib/guardrails-service";
import { isAdmin, isEditor } from "@/lib/roles";
import { GOOGLE_ICAL_SOURCE } from "@/lib/google-intake";
import { NavLink } from "@/components/nav-link";
import { MobileNav } from "@/components/mobile-nav";
import { logout } from "@/actions/auth";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/command-palette";

type Item = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  editorOnly?: boolean;
  exact?: boolean;
  badge?: "guardrails" | "calendar";
  portal?: boolean;
};
type Section = { heading: string; items: Item[] };

// Grouped so daily drivers, planning, production, and rare admin setup read at
// different weights instead of one flat wall. Routes are unchanged — only the
// labels and grouping are friendlier.
const SECTIONS: Section[] = [
  {
    heading: "Today",
    items: [
      { href: "/", label: "Home", icon: "✨", exact: true },
      { href: "/my-requests", label: "My Requests", icon: "📣", portal: true },
      { href: "/submit", label: "New Request", icon: "➕", portal: true },
      { href: "/run-sheet", label: "Sunday Checklist", icon: "🗒️" },
      { href: "/this-week", label: "This Week", icon: "🗓️" },
      { href: "/my-tasks", label: "My Tasks", icon: "✅" },
    ],
  },
  {
    heading: "Plan",
    items: [
      { href: "/calendar", label: "Calendar", icon: "📅" },
      { href: "/requests", label: "Events", icon: "📋" },
      { href: "/recurring", label: "Recurring", icon: "🔁" },
      { href: "/rooms", label: "Rooms", icon: "🏠" },
    ],
  },
  {
    heading: "Make & send",
    items: [
      { href: "/pipeline", label: "Production", icon: "🗂️" },
      { href: "/assign", label: "Channel plan", icon: "🧲" },
      { href: "/exports", label: "Downloads", icon: "⬇️" },
    ],
  },
  {
    heading: "Checks",
    items: [{ href: "/guardrails", label: "Heads-up", icon: "🛡️", badge: "guardrails" }],
  },
  {
    heading: "Setup",
    items: [
      { href: "/imports", label: "Imports", icon: "📥", adminOnly: true, badge: "calendar" },
      { href: "/settings", label: "Settings", icon: "⚙️", adminOnly: true },
      { href: "/help", label: "Help & how-to", icon: "📖", exact: true },
    ],
  },
];

const sectionHeading =
  "mt-4 px-3 pb-1 pt-3 text-[11px] font-extrabold uppercase text-muted border-t border-slate-100";

export async function Nav() {
  const user = await getSessionUser();
  if (!user) return null;
  const admin = isAdmin(user.roles);
  const editor = isEditor(user.roles);
  const portalOnly =
    !admin && !editor && !user.roles.includes("viewer");
  const [channels, guardrails, calendarImportCount, recentRequests] = await Promise.all([
    portalOnly
      ? Promise.resolve([])
      : db.channel.findMany({
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          select: { key: true, name: true, color: true },
        }),
    portalOnly ? Promise.resolve([]) : getGuardrails(new Date()),
    portalOnly
      ? Promise.resolve(0)
      : db.calendarImportCandidate.count({
          where: { source: GOOGLE_ICAL_SOURCE, status: "pending" },
        }),
    db.request.findMany({
      where: portalOnly
        ? {
            OR: [
              { requesterId: user.id },
              ...(user.email
                ? [
                    {
                      requesterId: null,
                      requesterEmail: user.email,
                      pcoEventId: null,
                      externalCalendarKey: null,
                    },
                  ]
                : []),
            ],
          }
        : undefined,
      orderBy: [{ eventStart: "asc" }, { updatedAt: "desc" }],
      take: 60,
      select: { id: true, title: true, eventStart: true, status: true },
    }),
  ]);
  // Badge counts only ACTIONABLE heads-up items (capacity over-limits, mis-tier) —
  // informational "busy week" density signals don't drive the alert count.
  const guardrailCount = guardrails.filter((g) => g.severity !== "info").length;
  // Sibling Church Hub front door (docs/CHURCH_HUB_INTEGRATION.md step 1).
  // Hidden entirely when unconfigured so the link never dangles.
  const hubUrl = process.env.CHURCH_HUB_URL?.trim().replace(/\/$/, "") || null;

  const visible = (i: Item) =>
    (!portalOnly || i.portal === true) &&
    (!i.adminOnly || admin) &&
    (!i.editorOnly || editor);
  const visibleSections = SECTIONS.map((s) => ({
    heading: s.heading,
    items: s.items.filter(visible),
  })).filter((s) => s.items.length > 0);

  const commandItems: CommandPaletteItem[] = [
    ...visibleSections.flatMap((section) =>
      section.items.map((item) => ({
        href: item.href,
        label: item.label,
        detail: section.heading,
        kind: "page" as const,
        keywords: `${section.heading} ${item.label}`,
      })),
    ),
    ...(!portalOnly
      ? [
          { href: "/outputs", label: "All channels", detail: "Channels", kind: "page" as const },
          ...channels.map((channel) => ({
            href: `/outputs/${channel.key}`,
            label: channel.name,
            detail: "Channel",
            kind: "channel" as const,
          })),
        ]
      : []),
    ...recentRequests.map((request) => ({
      href: portalOnly ? `/my-requests/${request.id}` : `/requests/${request.id}`,
      label: request.title,
      detail: `${request.eventStart.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${request.status.replace(/_/g, " ")}`,
      kind: "event" as const,
      keywords: request.status,
    })),
  ].filter(
    (item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index,
  );

  const renderItem = (i: Item) => (
    <NavLink
      key={i.href}
      href={i.href}
      exact={i.exact}
      className="nav-link flex shrink-0 items-center rounded-2xl py-2 pl-4 pr-3 text-ink/90"
    >
      <span className="mr-2.5 text-base">{i.icon}</span>
      <span className="font-medium leading-tight">{i.label}</span>
      {i.badge === "guardrails" && guardrailCount > 0 && (
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
          {guardrailCount}
        </span>
      )}
      {i.badge === "calendar" && calendarImportCount > 0 && (
        <span
          aria-label={`${calendarImportCount} calendar events pending review`}
          title={`${calendarImportCount} calendar events pending review`}
          className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700"
        >
          {calendarImportCount > 99 ? "99+" : calendarImportCount}
        </span>
      )}
    </NavLink>
  );

  return (
    <>
      {/* Phone / tablet: a top bar + slide-in grouped drawer. */}
      <MobileNav
        sections={visibleSections}
        channels={channels}
        editor={editor}
        guardrailCount={guardrailCount}
        calendarImportCount={calendarImportCount}
        portalOnly={portalOnly}
        hubUrl={hubUrl}
      />

      {/* Desktop sidebar. grid-cols-1 (a minmax(0,1fr) column) clamps every row
          to the card width, so a long label wraps instead of stretching the
          whole column past the card background. */}
      <nav className="no-print card-float sticky top-4 z-20 m-4 hidden h-fit max-h-[calc(100vh-2rem)] w-56 self-start overflow-y-auto overscroll-contain p-3 lg:grid lg:grid-cols-1">
        <div className="mb-1 flex items-center gap-2 px-3 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-sky-200 to-violet-200 text-lg shadow-sm">
            ☁️
          </span>
          <span className="font-extrabold text-lg text-ink">Comms</span>
        </div>

        <CommandPalette items={commandItems} />

        {/* "Do" is separated from "go": create actions live in a prominent button,
            not buried among the navigation links. */}
        {editor && (
          <div className="mb-1 flex flex-col items-stretch gap-2">
            <Link
              href="/requests/new"
              className="btn-primary flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold"
            >
              <span>➕</span>
              <span className="whitespace-nowrap">New event</span>
            </Link>
            <Link
              href="/quick/new"
              className="nav-link flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold text-ink/80"
            >
              <span>⚡</span>
              <span className="whitespace-nowrap">Quick post</span>
            </Link>
          </div>
        )}

        {visibleSections.map((section, si) => (
          <div key={section.heading} className="contents">
            <div className={si === 0 ? "mt-1 px-3 pb-1 pt-1 text-[11px] font-extrabold uppercase text-muted" : sectionHeading}>
              {section.heading}
            </div>
            {section.items.map(renderItem)}
          </div>
        ))}

        {/* Channels: the live list of where things post (was "Outputs"). */}
        {!portalOnly && (
          <>
            <div className={sectionHeading}>Channels</div>
            <NavLink
              href="/outputs"
              exact
              className="nav-link shrink-0 rounded-2xl py-2 pl-4 pr-3 text-sm font-semibold text-muted"
            >
              All channels
            </NavLink>
            {channels.map((c) => (
              <NavLink
                key={c.key}
                href={`/outputs/${c.key}`}
                className="nav-link flex shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-4 pr-3 text-sm text-ink/85"
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: c.color }} />
                <span className="leading-tight">{c.name}</span>
              </NavLink>
            ))}
          </>
        )}

        {/* Sibling Church Hub front door (hidden unless CHURCH_HUB_URL is set). */}
        {hubUrl && (
          <a
            href={hubUrl}
            target="_blank"
            rel="noreferrer"
            className="nav-link mt-3 flex w-full items-center gap-2 rounded-2xl px-4 py-2 text-left text-sm font-semibold text-muted"
          >
            <span>⛪</span> Church Hub
          </a>
        )}

        <form action={logout} className="mt-3 border-t border-slate-100 pt-3">
          <button className="nav-link flex w-full items-center gap-2 rounded-2xl px-4 py-2 text-left text-sm font-semibold text-muted">
            <span>↪</span> Sign out
          </button>
        </form>
      </nav>
    </>
  );
}
