import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateMyRequest } from "@/actions/requester-portal";
import { RegistrationFields } from "@/components/registration-fields";
import { getSessionUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { REQUESTER_EDIT_BLOCKED_STATUSES } from "@/lib/requester-portal";

function dateValue(date: Date | null | undefined): string {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function EditMyRequest({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=%2Fmy-requests");
  const { id } = await params;
  const { error } = await searchParams;

  const request = await db.request.findFirst({
    where: {
      id,
      OR: [
        { requesterId: user.id },
        ...(user.email
          ? [
              {
                requesterId: null,
                requesterEmail: user.email,
                pcoEventId: null,
                externalCalendarKey: null,
              },
            ]
          : []),
      ],
    },
  });
  if (!request) notFound();
  if (REQUESTER_EDIT_BLOCKED_STATUSES.has(request.status)) {
    redirect(`/my-requests/${id}?error=closed`);
  }

  const action = updateMyRequest.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">
            Help us advertise it well
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Improve request details</h1>
        </div>
        <Link
          href={`/my-requests/${id}`}
          className="shrink-0 text-sm font-bold text-muted hover:text-sky-700"
        >
          Cancel
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          Please add an event title and date.
        </div>
      )}

      <form action={action} className="card-float grid gap-6 p-6">
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-extrabold text-muted">
            The essentials
          </legend>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-muted">Event title *</span>
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={request.title}
              className="rounded-2xl border px-4 py-2.5"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-muted">
              Description people should see
            </span>
            <textarea
              name="description"
              maxLength={5000}
              rows={5}
              defaultValue={request.description ?? ""}
              placeholder="What is happening, why should someone care, and what can they expect?"
              className="rounded-2xl border px-4 py-2.5"
            />
            <span className="text-xs text-muted">
              Write this as public-facing information, not an internal note.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-muted">Event date *</span>
              <input
                name="eventStart"
                type="date"
                required
                defaultValue={dateValue(request.eventStart)}
                className="rounded-2xl border px-4 py-2.5"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-muted">Location</span>
              <input
                name="location"
                maxLength={500}
                defaultValue={request.location ?? ""}
                placeholder="Room, address, or online"
                className="rounded-2xl border px-4 py-2.5"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-muted">Who is it for?</span>
            <select
              name="whoIsItFor"
              defaultValue={request.whoIsItFor}
              className="rounded-2xl border px-4 py-2.5"
            >
              <option value="whole_church">Whole church</option>
              <option value="ministry">A specific ministry</option>
              <option value="small_group">A small group or team</option>
              <option value="leadership">Leadership</option>
            </select>
          </label>
        </fieldset>

        <RegistrationFields
          defaultNeeds={request.needsRegistration}
          defaultUrl={request.registrationUrl ?? ""}
          defaultCost={request.cost ?? ""}
          defaultClosesAt={dateValue(request.registrationClosesAt)}
        />

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-extrabold text-muted">
            The action you want people to take
          </legend>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-muted">Next step</span>
            <input
              name="nextStepText"
              maxLength={500}
              defaultValue={request.nextStepText ?? ""}
              placeholder="Register, visit the table, contact Cindy…"
              className="rounded-2xl border px-4 py-2.5"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-muted">
              Next-step link
            </span>
            <input
              name="nextStepUrl"
              type="url"
              maxLength={1000}
              defaultValue={request.nextStepUrl ?? ""}
              placeholder="https://..."
              className="rounded-2xl border px-4 py-2.5"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-muted">
              Anything the communications team should know
            </span>
            <textarea
              name="requesterNotes"
              maxLength={5000}
              rows={3}
              defaultValue={request.requesterNotes ?? ""}
              placeholder="Helpful context, emphasis, special wording, childcare details…"
              className="rounded-2xl border px-4 py-2.5"
            />
            <span className="text-xs text-muted">
              This stays separate from the team&apos;s internal production notes.
            </span>
          </label>
        </fieldset>

        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900">
          If advertising work has already started, your changes will be saved
          without erasing that work and the communications team will review the
          affected placements.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-full bg-ink px-6 py-2.5 font-bold text-white">
            Save changes
          </button>
          <Link
            href={`/my-requests/${id}`}
            className="rounded-full border bg-white/60 px-6 py-2.5 font-bold text-muted hover:bg-white"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
