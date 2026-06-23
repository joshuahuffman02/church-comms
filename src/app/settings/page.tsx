import Link from "next/link";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { AdminOnlyCard } from "@/components/admin-only-card";

type Tile = { href: string; icon: string; title: string; blurb: string };
type Group = { heading: string; tiles: Tile[] };

const GROUPS: Group[] = [
  {
    heading: "Everyday",
    tiles: [
      { href: "/settings/channels", icon: "📣", title: "Channels", blurb: "Where things post, and how far ahead each one goes out." },
      { href: "/settings/ministries", icon: "🎨", title: "Ministries", blurb: "The teams that request communications, and their colors." },
      { href: "/settings/users", icon: "👥", title: "Team & access", blurb: "Who can sign in, and what each person is allowed to do." },
      { href: "/settings/connections", icon: "🔌", title: "Connections", blurb: "Link Planning Center, email, and calendar files — and test them." },
      { href: "/settings/updates", icon: "⬆️", title: "Updates", blurb: "Check GitHub and run safe app updates on trusted installs." },
    ],
  },
  {
    heading: "Automation",
    tiles: [
      { href: "/settings/sprints", icon: "🏃", title: "Big pushes", blurb: "Briefly lift the everyday limits for Easter, Christmas, VBS." },
      { href: "/settings/approvals", icon: "✅", title: "Approvals", blurb: "Require a sign-off before certain events go out. Off by default." },
      { href: "/settings/tag-rules", icon: "🏷️", title: "Tag rules", blurb: "Auto-tag and set the audience for events as they come in." },
    ],
  },
  {
    heading: "Templates",
    tiles: [
      { href: "/settings/playbooks", icon: "📋", title: "Event checklists", blurb: "Dated task templates for big events (board approval, banners…)." },
      { href: "/settings/video-script", icon: "🎬", title: "Video script", blurb: "The intro and outro wording for the announcement video." },
    ],
  },
];

export default async function SettingsHome() {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="settings" />;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">Settings ⚙️</h1>
      <p className="text-muted mb-6">Set up how the app plans and tracks your communications.</p>

      {GROUPS.map((group) => (
        <div key={group.heading} className="mb-6">
          <div className="mb-2 text-[11px] font-extrabold uppercase text-muted">{group.heading}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tiles.map((t) => (
              <Link key={t.href} href={t.href} className="card-float card-lift block p-4">
                <div className="flex items-center gap-2 font-bold">
                  <span className="text-lg">{t.icon}</span>
                  {t.title}
                </div>
                <p className="text-muted mt-1 text-sm">{t.blurb}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
