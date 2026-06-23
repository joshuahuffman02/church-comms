import { NextResponse, type NextRequest } from "next/server";
import { pcoConfigured } from "@/lib/pco";
import { syncApprovedPcoEvents } from "@/actions/pco";
import { syncRooms, type SyncRoomsResult } from "@/lib/pco-rooms-sync";
import { generateAllSeries } from "@/actions/recurring";
import { syncGoogleCalendar, type GoogleSyncResult } from "@/lib/google-intake";

// Scheduled auto-sync endpoint. The middleware (src/proxy.ts) lets `api/cron`
// through without a user session, so this route guards ITSELF with CRON_SECRET.
// Drive it from a system crontab, e.g.:
//   0 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//       http://localhost:3000/api/cron/sync-events
export const dynamic = "force-dynamic";

/**
 * True when the caller presented the configured CRON_SECRET, via either an
 * `Authorization: Bearer <secret>` header or a `?key=<secret>` query fallback.
 * Returns false when CRON_SECRET is unset (the endpoint is then closed to all).
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const key = req.nextUrl.searchParams.get("key");

  return bearer === secret || key === secret;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Always roll the recurring series forward (safe/idempotent — it only
    // creates dates that don't already have an occurrence). Runs whether or not
    // PCO is configured, so standing items keep generating on their own.
    const series = await generateAllSeries();

    // Google Calendar intake — independent of PCO and isolated, so a Google
    // fetch failure can't fail the rest of the sync. This only refreshes the
    // review inbox; admins still accept/ignore each calendar event manually.
    let google: GoogleSyncResult | { error: string };
    try {
      google = await syncGoogleCalendar();
    } catch (err) {
      google = { error: err instanceof Error ? err.message : "Google sync failed" };
    }

    // PCO sync only when wired up — skip quietly otherwise so the cron job
    // doesn't alarm.
    if (!pcoConfigured()) {
      return NextResponse.json({ ok: true, series, google, pco: "not configured" });
    }
    const counts = await syncApprovedPcoEvents();

    // Also mirror Rooms/Resources + their future bookings. Isolated so a rooms
    // failure (its own endpoints / rate limit) can't fail the event sync — we
    // report the error inline instead.
    let rooms: SyncRoomsResult | { error: string };
    try {
      rooms = await syncRooms();
    } catch (err) {
      rooms = { error: err instanceof Error ? err.message : "Rooms sync failed" };
    }

    return NextResponse.json({ ok: true, series, google, ...counts, rooms });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
