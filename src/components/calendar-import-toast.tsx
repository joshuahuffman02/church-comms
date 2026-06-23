import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { GOOGLE_ICAL_SOURCE } from "@/lib/google-intake";
import { CalendarImportToastClient } from "@/components/calendar-import-toast-client";

export async function CalendarImportToast() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.roles)) return null;

  const pendingCount = await db.calendarImportCandidate.count({
    where: { source: GOOGLE_ICAL_SOURCE, status: "pending" },
  });
  if (pendingCount === 0) return null;

  return <CalendarImportToastClient pendingCount={pendingCount} />;
}
