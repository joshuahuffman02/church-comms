import {
  buildLoopList,
  buildBulletinCopy,
  buildVideoRunOfShow,
  buildVideoScript,
  loadLoopForComingSunday,
  loadBulletinThisWeek,
  loadVideoThisWeek,
  loadVideoScriptThisWeek,
} from "@/lib/exports";

// These previews reflect live DB state, so render them fresh each request.
export const dynamic = "force-dynamic";

function ExportCard({
  title,
  blurb,
  href,
  filename,
  text,
  accent,
}: {
  title: string;
  blurb: string;
  href: string;
  filename: string;
  text: string;
  accent: string;
}) {
  const empty = text.split("\n").filter(Boolean).length <= 1;
  return (
    <section className="card-float p-5" style={{ borderLeft: `5px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-bold text-lg" style={{ color: accent }}>
            {title}
          </h2>
          <p className="text-muted text-sm mt-0.5">{blurb}</p>
        </div>
        <a
          href={href}
          download={filename}
          className="shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
          style={{ background: accent }}
        >
          ⬇️ Download
        </a>
      </div>
      <pre className="rounded-2xl bg-sky-bg p-4 text-sm whitespace-pre-wrap break-words font-mono text-ink overflow-x-auto">
        {empty ? `${text}\n\n(Nothing scheduled for this export yet.)` : text}
      </pre>
    </section>
  );
}

export default async function ExportsPage() {
  const today = new Date();
  const [loop, bulletin, video, script] = await Promise.all([
    loadLoopForComingSunday(today),
    loadBulletinThisWeek(today),
    loadVideoThisWeek(today),
    loadVideoScriptThisWeek(today),
  ]);

  const loopText = buildLoopList(loop.items, loop.sunday);
  const bulletinText = buildBulletinCopy(bulletin.items);
  const videoText = buildVideoRunOfShow(video.items, video.sunday);
  const scriptText = buildVideoScript(script.items, script.sunday, script.intro, script.outro);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">Exports ⬇️</h1>
      <p className="text-muted mb-5">
        This week&apos;s ready-to-use outputs · preview, then download or copy.
      </p>

      <div className="grid gap-4">
        <ExportCard
          title="Pre-Service Loop"
          blurb="ProPresenter slide list for the coming Sunday — one slide per line."
          href="/exports/loop"
          filename="pre-service-loop.txt"
          text={loopText}
          accent="#34d399"
        />
        <ExportCard
          title="Bulletin Copy"
          blurb="Printed-bulletin blurbs for this week — paste straight in."
          href="/exports/bulletin"
          filename="bulletin-copy.txt"
          text={bulletinText}
          accent="#9ca3af"
        />
        <ExportCard
          title="Announcement Video — Run of Show"
          blurb="Top-3 announcements in tier order for this week's video."
          href="/exports/video"
          filename="announcement-video-run-of-show.txt"
          text={videoText}
          accent="#a78bfa"
        />
        <ExportCard
          title="Announcement Video Script"
          blurb="Ready-to-read script — intro, the week's top-3, and an outro. Edit templates in Settings."
          href="/exports/video-script"
          filename="announcement-script.txt"
          text={scriptText}
          accent="#818cf8"
        />
      </div>
    </div>
  );
}
