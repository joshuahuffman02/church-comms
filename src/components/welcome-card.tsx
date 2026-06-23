"use client";
import Link from "next/link";
import { useState } from "react";

type Step = { href: string; icon: string; label: string; show: boolean };

/**
 * First-run orientation shown on This Week when the install has no events yet.
 * Self-hides for good once an event exists (the parent only renders it when the
 * install is empty); Dismiss hides it for the rest of this session.
 */
export function WelcomeCard({ admin, editor }: { admin: boolean; editor: boolean }) {
  const [show, setShow] = useState(true);
  if (!show) return null;

  const steps: Step[] = [
    { href: "/requests/new", icon: "➕", label: "Add your first event", show: editor },
    { href: "/import/planning-center", icon: "🗓️", label: "Connect Planning Center", show: admin },
    { href: "/settings/channels", icon: "📣", label: "Review your channels", show: admin },
    { href: "/settings/users", icon: "👥", label: "Add your team", show: admin },
    { href: "/help", icon: "📖", label: "Read the 2-minute how-to", show: true },
  ].filter((s) => s.show);

  return (
    <div className="card-float mb-4 p-6" style={{ borderLeft: "5px solid #a78bfa" }}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-extrabold">Welcome to Comms ☁️</h2>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="text-sm font-semibold text-muted hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      <p className="text-muted mt-1 text-sm">
        This is your communications planning brain — it turns each event into a per-channel
        schedule and tracks it. A few things to get set up:
      </p>
      <div className="mt-4 grid gap-2">
        {steps.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="nav-link flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-2.5 text-sm font-semibold text-ink/90"
          >
            <span className="text-base">{s.icon}</span>
            <span>{s.label}</span>
            <span className="ml-auto text-muted">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
