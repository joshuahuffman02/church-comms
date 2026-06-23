"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/ministries", label: "Ministries" },
  { href: "/settings/users", label: "Team & access" },
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/updates", label: "Updates" },
  { href: "/settings/sprints", label: "Big pushes" },
  { href: "/settings/approvals", label: "Approvals" },
  { href: "/settings/tag-rules", label: "Tag rules" },
  { href: "/settings/playbooks", label: "Event checklists" },
  { href: "/settings/video-script", label: "Video script" },
];

/** Consistent header for every settings page: a way back to the hub + tabs. */
export function SettingsNav() {
  const path = usePathname();
  return (
    <div className="no-print mb-5">
      <Link href="/settings" className="text-sm font-semibold text-muted hover:text-ink">
        ← All settings
      </Link>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                active ? "bg-ink text-white" : "text-muted hover:bg-sky-bg"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
