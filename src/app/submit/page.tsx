import { submitIntake } from "@/actions/intake";
import { RegistrationFields } from "@/components/registration-fields";

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-5 text-center">
        <h1 className="text-3xl font-extrabold">Request church communications ✨</h1>
        <p className="text-muted mt-1">
          Tell us about your event and we&apos;ll help get the word out. The comms team
          reviews new requests Mon &amp; Thu.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          Please add a title, a valid email, and an event date, then try again.
        </div>
      )}

      <form action={submitIntake} className="card-float p-6 grid gap-5">
        {/* The basics */}
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold text-muted mb-1">About you</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-muted">Your name</span>
              <input
                name="requesterName"
                placeholder="Jane Doe"
                className="rounded-2xl border px-4 py-2"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-muted">Email *</span>
              <input
                name="requesterEmail"
                type="email"
                required
                placeholder="you@example.com"
                className="rounded-2xl border px-4 py-2"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Ministry / team</span>
            <input
              name="ministry"
              placeholder="e.g. Youth, Worship, Missions"
              className="rounded-2xl border px-4 py-2"
            />
          </label>
        </fieldset>

        {/* Event details */}
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold text-muted mb-1">The event</legend>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Event title *</span>
            <input
              name="title"
              required
              maxLength={200}
              placeholder="Summer VBS Kickoff"
              className="rounded-2xl border px-4 py-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-muted">What&apos;s happening?</span>
            <textarea
              name="description"
              maxLength={5000}
              rows={3}
              placeholder="A short description of the event"
              className="rounded-2xl border px-4 py-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-muted">Who is it for?</span>
              <select name="whoIsItFor" className="rounded-2xl border px-4 py-2">
                <option value="whole_church">Whole church</option>
                <option value="ministry">A specific ministry</option>
                <option value="small_group">A small group / team</option>
                <option value="leadership">Leadership</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-muted">Event date *</span>
              <input
                name="eventStart"
                type="date"
                required
                className="rounded-2xl border px-4 py-2"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Location</span>
            <input
              name="location"
              placeholder="Fellowship Hall"
              className="rounded-2xl border px-4 py-2"
            />
          </label>
        </fieldset>

        {/* Registration (fields reveal only when sign-ups are needed) */}
        <RegistrationFields />

        {/* The message */}
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold text-muted mb-1">The message</legend>
          <label className="grid gap-1">
            <span className="text-sm text-muted">One next step</span>
            <input
              name="nextStep"
              maxLength={500}
              placeholder="Register at church.org/vbs"
              className="rounded-2xl border px-4 py-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Anything else?</span>
            <textarea
              name="notes"
              maxLength={5000}
              rows={3}
              placeholder="Notes for the comms team"
              className="rounded-2xl border px-4 py-2"
            />
          </label>
        </fieldset>

        <button className="rounded-full bg-ink text-white py-2.5 font-semibold">
          Send it to the comms team →
        </button>
      </form>
    </div>
  );
}
