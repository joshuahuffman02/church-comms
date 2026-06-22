"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type MobileNavItem = { href: string; label: string; icon: string; badge?: "guardrails" };
export type MobileNavSection = { heading: string; items: MobileNavItem[] };

/**
 * Phone/tablet navigation: a slim sticky top bar (wordmark + New + Menu) with the
 * full grouped menu in a slide-in drawer — instead of one thin horizontal-scroll
 * strip where section labels were hidden and items ran off-screen.
 */
export function MobileNav({
  sections,
  channels,
  editor,
  guardrailCount,
}: {
  sections: MobileNavSection[];
  channels: { key: string; name: string; color: string }[];
  editor: boolean;
  guardrailCount: number;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const close = () => setOpen(false);
  const isActive = (href: string) => path === href || path.startsWith(`${href}/`);

  const linkCls = (href: string) =>
    `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-ink/90 ${
      isActive(href) ? "nav-active" : "hover:bg-sky-bg"
    }`;

  return (
    <div className="no-print lg:hidden">
      <div className="card-float sticky top-2 z-30 m-3 flex items-center gap-2 p-2">
        <Link href="/this-week" onClick={close} className="flex items-center gap-2 px-2 py-1">
          <span className="grid h-8 w-8 place-items-center rounded-2xl bg-gradient-to-br from-sky-200 to-violet-200 text-base shadow-sm">
            ☁️
          </span>
          <span className="font-extrabold text-ink">Comms</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {editor && (
            <Link
              href="/requests/new"
              onClick={close}
              className="btn-primary rounded-2xl px-3 py-2 text-sm font-semibold"
            >
              ＋ New
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Open menu"
            className="relative grid h-11 w-11 place-items-center rounded-2xl text-xl text-ink hover:bg-sky-bg"
          >
            ☰
            {guardrailCount > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-900">
                {guardrailCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
          />
          <div className="absolute right-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto bg-cloud/95 p-4 shadow-2xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-extrabold text-ink">Menu</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="grid h-11 w-11 place-items-center rounded-2xl text-xl hover:bg-sky-bg"
              >
                ✕
              </button>
            </div>

            {sections.map((section) => (
              <div key={section.heading} className="mt-3">
                <div className="px-2 pb-1 text-[11px] font-extrabold uppercase text-muted">
                  {section.heading}
                </div>
                {section.items.map((i) => (
                  <Link key={i.href} href={i.href} onClick={close} className={linkCls(i.href)}>
                    <span className="text-base">{i.icon}</span>
                    <span className="font-medium">{i.label}</span>
                    {i.badge === "guardrails" && guardrailCount > 0 && (
                      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        {guardrailCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}

            <div className="mt-3">
              <div className="px-2 pb-1 text-[11px] font-extrabold uppercase text-muted">Channels</div>
              <Link
                href="/outputs"
                onClick={close}
                className="flex min-h-11 items-center rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-sky-bg"
              >
                All channels
              </Link>
              {channels.map((c) => (
                <Link
                  key={c.key}
                  href={`/outputs/${c.key}`}
                  onClick={close}
                  className="flex min-h-11 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm text-ink/85 hover:bg-sky-bg"
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </Link>
              ))}
            </div>

            {editor && (
              <Link
                href="/quick/new"
                onClick={close}
                className="mt-3 flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2.5 font-medium text-ink/90 hover:bg-sky-bg"
              >
                <span>⚡</span> Quick post
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
