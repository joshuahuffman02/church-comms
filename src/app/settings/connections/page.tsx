import Link from "next/link";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { pcoConfigured } from "@/lib/pco";
import { activeExternalCalendarConfig } from "@/lib/calendar-settings";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";
import { PcoTestButton } from "@/components/pco-test-button";
import { ExternalCalendarUrlForm } from "@/components/external-calendar-url-form";
import {
  planningCenterAuthEnabled,
  planningCenterAuthMissing,
} from "@/lib/pco-auth";

export const dynamic = "force-dynamic";

function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
      }`}
    >
      {label ?? (ok ? "Connected" : "Not connected")}
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
            href="/imports?source=planning-center"
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

      {/* Planning Center staff login */}
      <div className="card-float p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">👤 Planning Center staff sign-in</h2>
          <StatusPill
            ok={planningCenterAuthEnabled}
            label={planningCenterAuthEnabled ? "Ready" : "Needs setup"}
          />
        </div>
        <p className="text-muted mt-1 text-sm">
          Lets staff sign in with Planning Center, creates their local requester
          profile automatically, and gives them a private My Requests history.
          It does not create a hosted database account.
        </p>
        <details className="mt-3 rounded-2xl border bg-violet-50/50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink select-none">
            OAuth application setup
          </summary>
          <ol className="mt-3 grid gap-2 text-muted">
            <li>
              1. Create an OAuth application in the{" "}
              <a
                href="https://api.planningcenteronline.com/oauth/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sky-700 underline"
              >
                Planning Center developer console
              </a>
              .
            </li>
            <li>
              2. Add{" "}
              <code className="font-mono text-ink">
                {(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}
                /api/auth/callback/planning-center
              </code>{" "}
              as an authorization callback.
            </li>
            <li>
              3. Add the following values to <code className="font-mono text-ink">.env</code>{" "}
              and restart the app.
            </li>
          </ol>
          <div className="mt-3 rounded-xl border bg-white px-4 py-3 font-mono text-xs text-ink">
            <div>PLANNING_CENTER_OAUTH_CLIENT_ID=...</div>
            <div>PLANNING_CENTER_OAUTH_CLIENT_SECRET=...</div>
            <div>PLANNING_CENTER_OAUTH_ORGANIZATION_ID=...</div>
          </div>
          {!planningCenterAuthEnabled && (
            <p className="mt-2 text-xs text-amber-800">
              Missing: {planningCenterAuthMissing.join(", ")}
            </p>
          )}
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
          <ExternalCalendarUrlForm
            configured={google}
            canClear={calendar.source === "setting"}
            buttonLabel={google ? "Save replacement" : "Connect calendar"}
          />
        </div>
        <div className="mt-3">
          <Link href="/imports?source=google" className="text-sm font-semibold text-sky-600 hover:underline">
            Open review inbox →
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
          Optionally sends request and status emails. My Requests works without
          email, so leaving this disconnected does not prevent staff tracking.
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
          <StatusPill ok label="Ready" />
        </div>
        <p className="text-muted mt-1 text-sm">
          Upload a one-off calendar export without saving it or changing a connection.
        </p>
        <div className="mt-3">
          <Link href="/imports?source=ical" className="text-sm font-semibold text-sky-600 hover:underline">
            Upload a calendar file →
          </Link>
        </div>
      </div>
    </div>
  );
}
