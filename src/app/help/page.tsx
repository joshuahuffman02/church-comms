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
      <h1 className="text-2xl font-extrabold mb-1">Help &amp; how-to 📖</h1>
      <p className="text-muted mb-6">
        A friendly guide to how this app helps you plan and produce church
        communications. Skim it once; come back to any section when you need it.
      </p>

      <Card icon="💡" title="The big idea">
        <p>
          An event comes in — you enter it, or it syncs from Planning Center.
          You set <b>who it&apos;s for</b> (its audience). The app then{" "}
          <b>auto-builds a per-channel schedule</b>: when each piece gets made
          and when it goes out. You make the assets, mark them done, and
          everything is tracked on the calendar and your{" "}
          <Link href="/this-week" className="underline">
            This Week
          </Link>{" "}
          board.
        </p>
      </Card>

      <Card icon="📣" title="Your channels">
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
            Make this week
          </Link>{" "}
          board lists assets whose <i>Asset due</i> date lands this week.
        </p>
      </Card>

      <Card icon="🎯" title="Audience (tier)">
        <p>Who an event is for decides which channels it&apos;s allowed on.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>Whole church</b> (Tier 1): can use all channels.
          </li>
          <li>
            <b>Ministry</b> (Tier 2): targeted channels only.
          </li>
          <li>
            <b>Small group</b> (Tier 3): direct channels only.
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
              Channels
            </Link>{" "}
            — what&apos;s on each channel this week.
          </li>
          <li>
            <Link href="/pipeline" className="underline">
              Production
            </Link>{" "}
            — drag each piece through its stages.
          </li>
        </ul>
      </Card>

      <Card icon="🚦" title="Statuses">
        <p>An event request moves through:</p>
        <p className="text-sm font-semibold text-muted">
          Submitted → Triaged → Approved → In Production → Proof → Scheduled →
          Published
        </p>
        <p>Each piece to make (one asset for one channel) moves through:</p>
        <p className="text-sm font-semibold text-muted">
          To design → In progress → Ready → Published
        </p>
      </Card>

      <Card icon="🛡️" title="Heads-up">
        <p>
          The everyday “less is more” limits that keep your communications from
          overwhelming people: top-3 on the announcement video, no more than ~10
          loop slides, the 1-in-5 promo cap, and reach checks. The{" "}
          <Link href="/guardrails" className="underline">
            Heads-up
          </Link>{" "}
          page flags overload so you can trim before it ships.
        </p>
      </Card>

      <Card icon="🏃" title="Big pushes">
        <p>
          A <b>big push</b> is a temporary, all-out promotion window for a BIG
          event — Christmas, Easter, VBS — that <b>suspends the everyday limits</b>{" "}
          for 1–2 weeks. Use them only a few times a year for your biggest pushes;
          each one is tracked against an annual quota so they stay special.
        </p>
        <p className="text-muted text-sm">
          Quick contrast: <b>Audience</b> = who it&apos;s for, <b>Heads-up</b> =
          everyday limits, <b>Big push</b> = a deliberate, temporary override.
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

      <Card icon="⬇️" title="Downloads">
        <p>
          From the{" "}
          <Link href="/exports" className="underline">
            Downloads
          </Link>{" "}
          page you can copy or download the pre-service loop list, the bulletin
          copy, and the announcement-video run-of-show.
        </p>
      </Card>

      <Card icon="📚" title="Word list">
        <p className="text-muted text-sm">
          A few words you&apos;ll see, in plain terms (with the older name in
          parentheses):
        </p>
        <dl className="grid gap-2">
          <div>
            <dt className="font-semibold inline">Channel — </dt>
            <dd className="inline text-ink/90">one place things go.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Piece to make (deliverable) — </dt>
            <dd className="inline text-ink/90">the asset for one channel.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Appears N× (touches) — </dt>
            <dd className="inline text-ink/90">how many times it&apos;s scheduled to post.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Audience (tier) — </dt>
            <dd className="inline text-ink/90">
              who it&apos;s for, which decides allowed channels.
            </dd>
          </div>
          <div>
            <dt className="font-semibold inline">Big push (sprint) — </dt>
            <dd className="inline text-ink/90">
              a temporary override of the everyday limits for a big event.
            </dd>
          </div>
          <div>
            <dt className="font-semibold inline">Heads-up (guardrail) — </dt>
            <dd className="inline text-ink/90">an everyday “less is more” limit.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Sunday Checklist (run sheet) — </dt>
            <dd className="inline text-ink/90">the printable list for the production team.</dd>
          </div>
          <div>
            <dt className="font-semibold inline">Production (pipeline) — </dt>
            <dd className="inline text-ink/90">the board of every piece moving through its stages.</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
