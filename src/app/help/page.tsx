import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata = { title: "How-To · Church Comms" };

function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-float p-6 mb-5">
      <h2 className="text-lg font-extrabold mb-3 flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}

export default async function Help() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold mb-1">How-To 📖</h1>
      <p className="text-muted mb-6">
        A friendly guide to how this app helps you plan and produce church
        communications. Skim it once; come back to any section when you need it.
      </p>

      <Card icon="💡" title="The big idea">
        <p>
          An event comes in — you enter it, or it syncs from Planning Center.
          You set <b>who it&apos;s for</b> (its tier). The app then{" "}
          <b>auto-builds a per-channel schedule</b>: when each piece gets made
          and when it goes out. You make the assets, mark them done, and
          everything is tracked on the calendar and your{" "}
          <Link href="/this-week" className="underline">
            This Week
          </Link>{" "}
          board.
        </p>
      </Card>

      <Card icon="📣" title="Your Outputs (channels)">
        <p>
          Each <b>channel</b> is one place things go — for example the
          Announcement Video (Top 3), Sunday Loop, the App, Facebook, Instagram,
          the Website, the Weekly Email, Restroom Signs, Bulletin Inserts,
          or the Opportunities Table. Manage them in{" "}
          <Link href="/settings/channels" className="underline">
            Settings → Channels
          </Link>
          : add new ones, edit their timings, or delete the ones you don&apos;t
          use.
        </p>
      </Card>

      <Card icon="⏱️" title="“Goes out” vs “Asset due” (make vs publish)">
        <p>
          Every output has two timings:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>Goes out</b> = how many days before the event it starts appearing
            on that channel.
          </li>
          <li>
            <b>Asset due</b> = how many days before <i>that</i> the finished
            graphic/video must be ready.
          </li>
        </ul>
        <p>
          <span className="text-muted">Example:</span> a loop slide that{" "}
          <i>goes out</i> 2 weeks before an event with an <i>asset due</i> of 1
          week means the slide must be designed about <b>3 weeks</b> before the
          event. The{" "}
          <Link href="/this-week" className="underline">
            Make / Design this week
          </Link>{" "}
          board lists assets whose <i>Asset due</i> date lands this week.
        </p>
      </Card>

      <Card icon="🎯" title="Tiers">
        <p>The tier decides which channels an event is allowed on.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>Tier 1 — church-wide</b> (everyone): can use all channels.
          </li>
          <li>
            <b>Tier 2 — one ministry</b>: targeted channels only.
          </li>
          <li>
            <b>Tier 3 — niche</b>: direct channels only.
          </li>
        </ul>
      </Card>

      <Card icon="🧭" title="The views">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link href="/this-week" className="underline">
              This Week
            </Link>{" "}
            — what to make or change this week.
          </li>
          <li>
            <Link href="/calendar" className="underline">
              Calendar
            </Link>{" "}
            — everything by date.
          </li>
          <li>
            <Link href="/requests" className="underline">
              Events
            </Link>{" "}
            — all events and their statuses.
          </li>
          <li>
            <Link href="/outputs" className="underline">
              Outputs
            </Link>{" "}
            — what&apos;s on each channel this week.
          </li>
          <li>
            <Link href="/pipeline" className="underline">
              Pipeline
            </Link>{" "}
            — drag events through their stages.
          </li>
        </ul>
      </Card>

      <Card icon="🚦" title="Statuses">
        <p>An event request moves through:</p>
        <p className="text-sm font-semibold text-muted">
          Submitted → Triaged → Approved → In Production → Proof → Scheduled →
          Published
        </p>
        <p>Each deliverable (one asset for one channel) moves through:</p>
        <p className="text-sm font-semibold text-muted">
          To-design → In progress → Ready → Published
        </p>
      </Card>

      <Card icon="🛡️" title="Guardrails">
        <p>
          The everyday “less is more” limits that keep your communications from
          overwhelming people: top-3 on the announcement video, no more than ~10
          loop slides, the 1-in-5 promo cap, and reach checks. The{" "}
          <Link href="/guardrails" className="underline">
            Guardrails
          </Link>{" "}
          page flags overload so you can trim before it ships.
        </p>
      </Card>

      <Card icon="🏃" title="Sprints">
        <p>
          A <b>sprint</b> is a temporary, all-out promotion window for a BIG
          event — Christmas, Easter, VBS — that <b>suspends the guardrail
          limits</b> for 1–2 weeks. Use them only a few times a year for your
          biggest pushes; each one is tracked against an annual quota so they
          stay special.
        </p>
        <p className="text-muted text-sm">
          Quick contrast: <b>Tier</b> = audience size, <b>Guardrails</b> =
          everyday limits, <b>Sprint</b> = a deliberate, temporary override.
        </p>
      </Card>

      <Card icon="✅" title="Approvals (optional)">
        <p>
          Rules that require a sign-off before an event is approved — for
          example, an all-church email needing the pastor. They&apos;re{" "}
          <b>off by default</b>; configure them in{" "}
          <Link href="/settings/approvals" className="underline">
            Settings → Approvals
          </Link>
          .
        </p>
      </Card>

      <Card icon="🗓️" title="Planning Center">
        <p>
          Events and rooms are requested and approved in Planning Center. This
          app pulls in <b>approved</b> events automatically once credentials are
          set. You can&apos;t file new Planning Center requests from here — that
          stays in Church Center.
        </p>
      </Card>

      <Card icon="⬇️" title="Exports">
        <p>
          From the{" "}
          <Link href="/exports" className="underline">
            Exports
          </Link>{" "}
          page you can download the pre-service loop list, the bulletin copy, and
          the announcement-video run-of-show.
        </p>
      </Card>

      <Card icon="📚" title="Glossary">
        <dl className="grid gap-2">
          <div>
            <dt className="font-semibold inline">Output / Channel — </dt>
            <dd className="inline text-ink/90">one place things go.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Deliverable — </dt>
            <dd className="inline text-ink/90">
              the asset for one channel.
            </dd>
          </div>
          <div>
            <dt className="font-semibold inline">Touch — </dt>
            <dd className="inline text-ink/90">one scheduled appearance.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Tier — </dt>
            <dd className="inline text-ink/90">
              the audience size, which decides allowed channels.
            </dd>
          </div>
          <div>
            <dt className="font-semibold inline">Sprint — </dt>
            <dd className="inline text-ink/90">
              a temporary override of the everyday limits for a big push.
            </dd>
          </div>
          <div>
            <dt className="font-semibold inline">Guardrail — </dt>
            <dd className="inline text-ink/90">an everyday “less is more” limit.</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
