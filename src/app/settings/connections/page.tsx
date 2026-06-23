import Link from "next/link";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { pcoConfigured } from "@/lib/pco";
import { activeExternalCalendarConfig } from "@/lib/calendar-settings";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";
import { PcoTestButton } from "@/components/pco-test-button";
import { ExternalCalendarUrlForm } from "@/components/external-calendar-url-form";

export const dynamic = "force-dynamic";

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
      }`}
    >
      {ok ? "Connected" : "Not connected"}
    </span>
  );
}

export default async function ConnectionsSettings() {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="connections" />;
  }

  const pco = pcoConfigured();
  const calendar = await activeExternalCalendarConfig();
  const google = !!calendar.feedUrl;
  const email = !!process.env.SMTP_HOST;
  const ical = !!process.env.ICAL_IMPORT_FILE;

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="text-2xl font-extrabold mb-1">Connections 🔌</h1>
      <p className="text-muted mb-6">
        How this app links to your other tools. Connecting each one is a one-time
        setup. Passwords and API credentials still live on the server, but a
        read-only calendar feed URL can be pasted here.
      </p>

      {/* Planning Center */}
      <div className="card-float p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">🗓️ Planning Center</h2>
          <StatusPill ok={pco} />
        </div>
        <p className="text-muted mt-1 text-sm">
          Pulls your approved events and rooms in automatically (read-only).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {pco && <PcoTestButton />}
          <Link
            href="/import/planning-center"
            className="text-sm font-semibold text-sky-600 hover:underline"
          >
            Go to import →
          </Link>
        </div>
        <details className="mt-3 rounded-2xl border bg-sky-bg/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink select-none">
            Setup details for your tech helper
          </summary>
          <p className="text-muted mt-2">
            Add credentials to the server&apos;s <code className="font-mono">.env</code>{" "}
            and restart the app:
          </p>
          <div className="mt-2 rounded-xl border bg-white px-4 py-3 font-mono text-ink">
            <div># Personal Access Token (HTTP Basic)</div>
            <div>PCO_APP_ID=your-app-id</div>
            <div>PCO_SECRET=your-secret</div>
            <div className="mt-2"># ...or an OAuth bearer token</div>
            <div>PCO_TOKEN=your-token</div>
          </div>
          <p className="text-muted mt-2 text-xs">
            Create credentials at{" "}
            <a
              href="https://developer.planning.center/docs/#/overview/authentication"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              developer.planning.center
            </a>
            .
          </p>
        </details>
      </div>

      {/* Google Calendar */}
      <div className="card-float p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">📆 Google Calendar</h2>
          <StatusPill ok={google} />
        </div>
        <p className="text-muted mt-1 text-sm">
          Pulls events from your church Google Calendar in as tentative entries, each with a setup
          checklist (read-only — a casual front door, not the source of truth).
        </p>
        <div className="mt-4">
          <ExternalCalendarUrlForm currentUrl={calendar.sourceUrl} buttonLabel={google ? "Update URL" : "Connect calendar"} />
        </div>
        <div className="mt-3">
          <Link href="/import/google" className="text-sm font-semibold text-sky-600 hover:underline">
            Go to import →
          </Link>
        </div>
        <details className="mt-3 rounded-2xl border bg-sky-bg/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink select-none">
            Setup details for your tech helper
          </summary>
          <p className="text-muted mt-2">
            In Google Calendar → Settings → Integrate calendar, copy the <b>Secret iCal address</b>, then
            paste it above. Existing server <code className="font-mono">GOOGLE_*</code> settings still work:
          </p>
          <div className="mt-2 rounded-xl border bg-white px-4 py-3 font-mono text-ink">
            <div>GOOGLE_CALENDAR_URL=&quot;https://calendar.google.com/.../basic.ics&quot;</div>
          </div>
        </details>
      </div>

      {/* Email */}
      <div className="card-float p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">✉️ Email notifications</h2>
          <StatusPill ok={email} />
        </div>
        <p className="text-muted mt-1 text-sm">
          Sends the &ldquo;got your request&rdquo; and status emails to requesters.
          Until it&apos;s connected, those emails are skipped (nothing breaks).
        </p>
        <details className="mt-3 rounded-2xl border bg-sky-bg/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink select-none">
            Setup details for your tech helper
          </summary>
          <div className="mt-2 rounded-xl border bg-white px-4 py-3 font-mono text-ink">
            <div>SMTP_HOST=smtp.gmail.com</div>
            <div>SMTP_USER=you@yourchurch.org</div>
            <div>SMTP_PASS=app-password</div>
            <div>SMTP_FROM=comms@yourchurch.org</div>
            <div>APP_URL=https://comms.yourchurch.org</div>
          </div>
        </details>
      </div>

      {/* iCal */}
      <div className="card-float p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">📥 Calendar file (.ics)</h2>
          <StatusPill ok={ical} />
        </div>
        <p className="text-muted mt-1 text-sm">
          An optional one-off way to bring events in from a calendar export.
        </p>
        <div className="mt-3">
          <Link href="/import/ical" className="text-sm font-semibold text-sky-600 hover:underline">
            Go to calendar import →
          </Link>
        </div>
      </div>
    </div>
  );
}
