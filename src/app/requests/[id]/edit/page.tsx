import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { updateEvent } from "@/actions/edit-event";
import { AccessRequiredCard } from "@/components/access-required-card";

/**
 * `YYYY-MM-DD` for a <input type="date"> default value, using local getters so
 * a church-local-midnight date isn't shifted a day (never toISOString here).
 */
function dateValue(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me || !isEditor(me.roles)) {
    return (
      <AccessRequiredCard
        title="Editor access required"
        message="You need editor access to edit event details and re-plan schedules."
      />
    );
  }

  const [request, ministries] = await Promise.all([
    db.request.findUnique({
      where: { id },
      include: { ministries: { select: { id: true } } },
    }),
    // Active ministries to choose from, plus any inactive ones already attached
    // to this event (so we never silently drop an existing selection).
    db.ministry.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  if (!request) notFound();

  const selectedIds = new Set(request.ministries.map((m) => m.id));
  // Show active ministries, plus inactive ones that are currently selected.
  const ministryOptions = ministries.filter((m) => m.active || selectedIds.has(m.id));

  // Bind the request id so the server action has it without a hidden field.
  const action = updateEvent.bind(null, id);

  return (
    <form action={action} className="card-float p-6 max-w-xl grid gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Edit Event ✏️</h1>
        <Link href={`/requests/${id}`} className="text-sm font-semibold text-muted hover:underline">
          ← Back
        </Link>
      </div>

      <label className="text-sm text-muted">Title</label>
      <input
        name="title"
        required
        defaultValue={request.title}
        placeholder="Event title"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Description</label>
      <textarea
        name="description"
        defaultValue={request.description ?? ""}
        placeholder="What's happening?"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Ministries (pick all that apply — they&apos;re all equal)</label>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border px-4 py-3">
        {ministryOptions.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="ministryId"
              value={m.id}
              defaultChecked={selectedIds.has(m.id)}
              className="h-4 w-4"
            />
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: m.color }} />
            {m.name}
            {!m.active && <span className="text-xs text-muted">(inactive)</span>}
          </label>
        ))}
      </div>

      <label className="text-sm text-muted">Who is it for?</label>
      <select
        name="whoIsItFor"
        defaultValue={request.whoIsItFor}
        className="rounded-2xl border px-4 py-2"
      >
        <option value="whole_church">Whole church</option>
        <option value="ministry">A specific ministry</option>
        <option value="small_group">A small group / team</option>
        <option value="leadership">Leadership</option>
      </select>

      <label className="text-sm text-muted">Audience — changing this rebuilds the promo schedule</label>
      <select name="tier" defaultValue={String(request.tier)} className="rounded-2xl border px-4 py-2">
        <option value="1">Whole church</option>
        <option value="2">Ministry</option>
        <option value="3">Small group / leadership</option>
      </select>

      <label className="text-sm text-muted">Event date — changing this redoes all the promo deadlines</label>
      <input
        name="eventStart"
        type="date"
        required
        defaultValue={dateValue(request.eventStart)}
        className="rounded-2xl border px-4 py-2"
      />

      <details className="rounded-2xl border px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-semibold text-muted">
          More details (optional)
        </summary>
        <div className="mt-3 grid gap-3">
      <label className="text-sm text-muted">End date (optional)</label>
      <input
        name="eventEnd"
        type="date"
        defaultValue={dateValue(request.eventEnd)}
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Location (optional)</label>
      <input
        name="location"
        defaultValue={request.location ?? ""}
        placeholder="Where is it?"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          name="needsRegistration"
          type="checkbox"
          defaultChecked={request.needsRegistration}
          className="h-4 w-4"
        />
        Needs registration
      </label>

      <label className="text-sm text-muted">Registration URL (optional)</label>
      <input
        name="registrationUrl"
        defaultValue={request.registrationUrl ?? ""}
        placeholder="church.org/register"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Cost (optional)</label>
      <input
        name="cost"
        defaultValue={request.cost ?? ""}
        placeholder="$25 / free"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">
        Registration closes (optional — promo counts down to this date)
      </label>
      <input
        name="registrationClosesAt"
        type="date"
        defaultValue={dateValue(request.registrationClosesAt)}
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Next step (optional)</label>
      <input
        name="nextStepText"
        defaultValue={request.nextStepText ?? ""}
        placeholder="One next step (e.g. Register at church.org/vbs)"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Notes (optional)</label>
      <textarea
        name="notes"
        defaultValue={request.notes ?? ""}
        placeholder="Internal notes"
        className="rounded-2xl border px-4 py-2"
      />
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button className="rounded-full bg-ink text-white py-2 px-6 font-semibold">
          Save changes →
        </button>
        <Link
          href={`/requests/${id}`}
          className="rounded-full border px-6 py-2 font-semibold text-muted hover:bg-sky-bg transition"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
