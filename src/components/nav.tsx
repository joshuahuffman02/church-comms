import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { getGuardrails } from "@/lib/guardrails-service";
import { isAdmin, isEditor } from "@/lib/roles";
import { NavLink } from "@/components/nav-link";

const items = [
  { href: "/this-week", label: "This Week", icon: "🗓️" },
  { href: "/my-tasks", label: "My Tasks", icon: "✅" },
  { href: "/run-sheet", label: "Run Sheet", icon: "🗒️" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/rooms", label: "Rooms", icon: "🏠" },
  { href: "/requests", label: "Events", icon: "📋" },
  { href: "/recurring", label: "Recurring", icon: "🔁" },
  { href: "/pipeline", label: "Pipeline", icon: "🗂️" },
  { href: "/guardrails", label: "Guardrails", icon: "🛡️" },
  { href: "/exports", label: "Exports", icon: "⬇️" },
  { href: "/import/planning-center", label: "Import (PCO)", icon: "🗓️", adminOnly: true },
  { href: "/import/ical", label: "Import (iCal)", icon: "📥", adminOnly: true },
  { href: "/requests/new", label: "New Request", icon: "➕", editorOnly: true },
  { href: "/quick/new", label: "Quick Item", icon: "⚡", editorOnly: true },
];

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
  // Badge counts only ACTIONABLE guardrails (capacity over-limits, mis-tier) —
  // informational "busy week" density signals don't drive the alert count.
  const guardrailCount = guardrails.filter((g) => g.severity !== "info").length;
  const visibleItems = items.filter((i) => (!i.adminOnly || admin) && (!i.editorOnly || editor));

  return (
    <nav className="no-print card-float sticky top-2 z-20 m-3 flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto p-2 lg:top-4 lg:m-4 lg:grid lg:h-fit lg:w-56 lg:max-w-none lg:self-start lg:overflow-visible lg:p-3">
      <div className="mr-1 flex shrink-0 items-center gap-2 px-3 py-2 lg:mb-1 lg:mr-0 lg:py-3">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-sky-200 to-violet-200 text-lg shadow-sm">
          ☁️
        </span>
        <span className="font-extrabold text-lg text-ink">Comms</span>
      </div>

      {visibleItems.map((i) => (
        <NavLink
          key={i.href}
          href={i.href}
          exact={i.href === "/requests/new" || i.href === "/quick/new"}
          className="nav-link flex shrink-0 items-center rounded-2xl py-2 pl-4 pr-3 text-ink/90"
        >
          <span className="mr-2.5 text-base">{i.icon}</span>
          <span className="whitespace-nowrap font-medium">{i.label}</span>
          {i.href === "/guardrails" && guardrailCount > 0 && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              {guardrailCount}
            </span>
          )}
        </NavLink>
      ))}

      <div className="hidden lg:block mt-4 px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase text-muted border-t border-slate-100">
        Outputs
      </div>
      <NavLink
        href="/outputs"
        exact
        className="nav-link shrink-0 rounded-2xl py-2 pl-4 pr-3 text-sm font-semibold text-muted"
      >
        All outputs
      </NavLink>
      {channels.map((c) => (
        <NavLink
          key={c.key}
          href={`/outputs/${c.key}`}
          className="nav-link flex shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-4 pr-3 text-sm text-ink/85"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ background: c.color }} />
          <span className="whitespace-nowrap">{c.name}</span>
        </NavLink>
      ))}

      <NavLink
        href="/help"
        exact
        className="nav-link shrink-0 rounded-2xl py-2 pl-4 pr-3 text-ink/90 lg:mt-4 lg:border-t lg:border-slate-100 lg:pt-3"
      >
        <span className="mr-2.5 text-base">📖</span>
        <span className="whitespace-nowrap font-medium">How-To</span>
      </NavLink>
      {admin && (
        <NavLink
          href="/settings/channels"
          className="nav-link flex shrink-0 items-center rounded-2xl py-2 pl-4 pr-3 text-ink/90"
        >
          <span className="mr-2.5 text-base">⚙️</span>
          <span className="whitespace-nowrap font-medium">Settings</span>
        </NavLink>
      )}
    </nav>
  );
}
