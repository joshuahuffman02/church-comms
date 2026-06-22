import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { getGuardrails } from "@/lib/guardrails-service";
import { isAdmin, isEditor } from "@/lib/roles";
import { NavLink } from "@/components/nav-link";
import { MobileNav } from "@/components/mobile-nav";

type Item = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  editorOnly?: boolean;
  exact?: boolean;
  badge?: "guardrails";
};
type Section = { heading: string; items: Item[] };

// Grouped so daily drivers, planning, production, and rare admin setup read at
// different weights instead of one flat wall. Routes are unchanged — only the
// labels and grouping are friendlier.
const SECTIONS: Section[] = [
  {
    heading: "Today",
    items: [
      { href: "/this-week", label: "This Week", icon: "🗓️" },
      { href: "/my-tasks", label: "My Tasks", icon: "✅" },
      { href: "/run-sheet", label: "Sunday Checklist", icon: "🗒️" },
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
      { href: "/assign", label: "Assign", icon: "🧲" },
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
      { href: "/import/planning-center", label: "Import from Planning Center", icon: "🗓️", adminOnly: true },
      { href: "/import/google", label: "Import from Google", icon: "📆", adminOnly: true },
      { href: "/import/ical", label: "Import a calendar (.ics)", icon: "📥", adminOnly: true },
      { href: "/settings", label: "Settings", icon: "⚙️", adminOnly: true },
      { href: "/help", label: "Help & how-to", icon: "📖", exact: true },
    ],
  },
];

const sectionHeading =
  "mt-4 px-3 pb-1 pt-3 text-[11px] font-extrabold uppercase text-muted border-t border-slate-100";

export async function Nav() {
  const [user, channels, guardrails] = await Promise.all([
    getSessionUser(),
    db.channel.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { key: true, name: true, color: true },
    }),
    getGuardrails(new Date()),
  ]);
  if (!user) return null;
  const admin = isAdmin(user.roles);
  const editor = isEditor(user.roles);
  // Badge counts only ACTIONABLE heads-up items (capacity over-limits, mis-tier) —
  // informational "busy week" density signals don't drive the alert count.
  const guardrailCount = guardrails.filter((g) => g.severity !== "info").length;

  const visible = (i: Item) => (!i.adminOnly || admin) && (!i.editorOnly || editor);
  const visibleSections = SECTIONS.map((s) => ({
    heading: s.heading,
    items: s.items.filter(visible),
  })).filter((s) => s.items.length > 0);

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
      />

      {/* Desktop sidebar. grid-cols-1 (a minmax(0,1fr) column) clamps every row
          to the card width, so a long label wraps instead of stretching the
          whole column past the card background. */}
      <nav className="no-print card-float sticky top-4 z-20 m-4 hidden h-fit w-56 self-start p-3 lg:grid lg:grid-cols-1">
        <div className="mb-1 flex items-center gap-2 px-3 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-sky-200 to-violet-200 text-lg shadow-sm">
            ☁️
          </span>
          <span className="font-extrabold text-lg text-ink">Comms</span>
        </div>

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
      </nav>
    </>
  );
}
