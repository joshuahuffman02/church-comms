import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  FileText,
  ListVideo,
  MonitorPlay,
  Newspaper,
  PencilLine,
  Settings2,
} from "lucide-react";
import {
  buildLoopList,
  buildBulletinCopy,
  buildVideoRunOfShow,
  buildVideoScript,
  exportSundayFromParam,
  loadLoopForComingSunday,
  loadBulletinThisWeek,
  loadVideoThisWeek,
  loadVideoScriptThisWeek,
  ymd,
} from "@/lib/exports";
import { CopyButton } from "@/components/copy-button";
import { addDays } from "@/lib/engine/dates";
import { comingSunday } from "@/lib/week";

// These previews reflect live DB state, so render them fresh each request.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ExportTone = "emerald" | "slate" | "violet" | "indigo";

const TONE = {
  emerald: {
    border: "border-l-emerald-400",
    icon: "bg-emerald-100 text-emerald-800",
    action: "bg-emerald-600 hover:bg-emerald-700",
    accent: "#059669",
  },
  slate: {
    border: "border-l-slate-400",
    icon: "bg-slate-100 text-slate-700",
    action: "bg-slate-700 hover:bg-slate-800",
    accent: "#475569",
  },
  violet: {
    border: "border-l-violet-400",
    icon: "bg-violet-100 text-violet-800",
    action: "bg-violet-600 hover:bg-violet-700",
    accent: "#7c3aed",
  },
  indigo: {
    border: "border-l-indigo-400",
    icon: "bg-indigo-100 text-indigo-800",
    action: "bg-indigo-600 hover:bg-indigo-700",
    accent: "#4f46e5",
  },
} as const;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function fullSunday(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function sundayHref(date: Date): string {
  return `/exports?sunday=${ymd(date)}`;
}

function downloadHref(path: string, date: Date): string {
  return `${path}?sunday=${ymd(date)}`;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-slate-100">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-medium text-muted">{detail}</p>
    </div>
  );
}

function ExportCard({
  title,
  purpose,
  count,
  itemLabel,
  href,
  filename,
  text,
  tone,
  icon: Icon,
  copyLabel,
  sourceHref,
  sourceLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  purpose: string;
  count: number;
  itemLabel: string;
  href: string;
  filename: string;
  text: string;
  tone: ExportTone;
  icon: LucideIcon;
  copyLabel: string;
  sourceHref: string;
  sourceLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const style = TONE[tone];
  const empty = count === 0;
  const countText = `${count} ${count === 1 ? itemLabel : `${itemLabel}s`}`;

  return (
    <article className={`card-float overflow-hidden border-l-[5px] ${style.border}`}>
      <div className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${style.icon}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink">{title}</h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${empty ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                  {empty ? <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {empty ? "Nothing scheduled" : "Ready"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{purpose}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{countText}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Plain text · .txt</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Built from the live schedule</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
            <CopyButton text={text} accent={style.accent} label={copyLabel} disabled={empty} />
            {!empty && (
              <a
                href={href}
                download={filename}
                aria-label={`Download ${title} as a text file`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition ${style.action}`}
              >
                <Download className="h-4 w-4" aria-hidden="true" /> Download .txt
              </a>
            )}
          </div>
        </div>

        {empty ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-amber-950">There is no file to hand off yet.</p>
              <p className="mt-0.5 text-sm text-amber-900/75">Add or schedule an item in the source channel, then this export will fill itself.</p>
            </div>
            <Link href={sourceHref} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-amber-300 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100">
              <PencilLine className="h-4 w-4" aria-hidden="true" /> {sourceLabel}
            </Link>
          </div>
        ) : (
          <details className="group mt-4 rounded-2xl border border-slate-200 bg-slate-50/70">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-ink marker:content-none">
              <span>Preview {countText}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <pre className="max-h-96 overflow-auto border-t border-slate-200 bg-white px-4 py-4 font-sans text-sm leading-6 whitespace-pre-wrap break-words text-ink">
              {text}
            </pre>
          </details>
        )}

        {!empty && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Something looks wrong?</span>
            <Link href={sourceHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50">
              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> {sourceLabel}
            </Link>
            {secondaryHref && secondaryLabel && (
              <Link href={secondaryHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50">
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> {secondaryLabel}
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const currentSunday = comingSunday(new Date());
  const selectedSunday = exportSundayFromParam(firstParam(params.sunday), new Date());
  const previousSunday = addDays(selectedSunday, -7);
  const nextSunday = addDays(selectedSunday, 7);
  const selectedKey = ymd(selectedSunday);
  const isCurrent = selectedSunday.getTime() === currentSunday.getTime();

  const [loop, bulletin, video, script] = await Promise.all([
    loadLoopForComingSunday(selectedSunday),
    loadBulletinThisWeek(selectedSunday),
    loadVideoThisWeek(selectedSunday),
    loadVideoScriptThisWeek(selectedSunday),
  ]);

  const loopText = buildLoopList(loop.items, loop.sunday);
  const bulletinText = buildBulletinCopy(bulletin.items);
  const videoText = buildVideoRunOfShow(video.items, video.sunday);
  const scriptText = buildVideoScript(script.items, script.sunday, script.intro, script.outro);
  const counts = [loop.items.length, bulletin.items.length, video.items.length, script.items.length];
  const readyCount = counts.filter((count) => count > 0).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="card-float mb-5 overflow-hidden p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Weekly handoff workspace</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">Downloads</h1>
            <p className="mt-1 max-w-3xl text-muted">
              Review the final copy for {fullSunday(selectedSunday)}, then copy it or download a clearly named text file.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pipeline" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">Production →</Link>
            <Link href="/assign" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Channel plan →</Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Ready files" value={`${readyCount} of 4`} detail={readyCount === 4 ? "Every handoff is ready" : `${4 - readyCount} still empty`} />
          <SummaryCard label="Loop slides" value={String(loop.items.length)} detail="For ProPresenter" />
          <SummaryCard label="Video lineup" value={`${video.items.length} of 3`} detail="Final announcement order" />
          <SummaryCard label="File format" value=".txt" detail="Easy to copy or open anywhere" />
        </div>
      </header>

      <nav className="card-float mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Choose export Sunday">
        <Link href={sundayHref(previousSunday)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Previous Sunday
        </Link>
        <div className="text-center">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-700">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Export week
          </p>
          <p className="mt-0.5 font-extrabold text-ink">{fullSunday(selectedSunday)}</p>
          {!isCurrent && (
            <Link href={sundayHref(currentSunday)} className="mt-1 inline-flex text-xs font-bold text-sky-700 hover:underline">Return to coming Sunday</Link>
          )}
        </div>
        <Link href={sundayHref(nextSunday)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">
          Next Sunday <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </nav>

      <section className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between" aria-labelledby="handoff-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Four focused handoffs</p>
          <h2 id="handoff-heading" className="mt-0.5 text-2xl font-extrabold text-ink">Choose what you are sending</h2>
        </div>
        <p className="text-sm text-muted">Previews stay compact until you open them.</p>
      </section>

      <div className="grid gap-4">
        <ExportCard
          title="Pre-Service Loop"
          purpose="For ProPresenter · one Sunday slide per line"
          count={loop.items.length}
          itemLabel="slide"
          href={downloadHref("/exports/loop", selectedSunday)}
          filename={`pre-service-loop-${selectedKey}.txt`}
          text={loopText}
          tone="emerald"
          icon={MonitorPlay}
          copyLabel="Copy loop list"
          sourceHref="/outputs/loop"
          sourceLabel="Edit Sunday Loop"
        />
        <ExportCard
          title="Bulletin Copy"
          purpose="For the printed bulletin · paste-ready announcement blurbs"
          count={bulletin.items.length}
          itemLabel="announcement"
          href={downloadHref("/exports/bulletin", selectedSunday)}
          filename={`bulletin-copy-${selectedKey}.txt`}
          text={bulletinText}
          tone="slate"
          icon={Newspaper}
          copyLabel="Copy bulletin copy"
          sourceHref="/outputs/inserts"
          sourceLabel="Edit Bulletin channel"
        />
        <ExportCard
          title="Announcement Video — Run of Show"
          purpose="For the video team · the final top-three order"
          count={video.items.length}
          itemLabel="announcement"
          href={downloadHref("/exports/video", selectedSunday)}
          filename={`announcement-video-run-of-show-${selectedKey}.txt`}
          text={videoText}
          tone="violet"
          icon={ListVideo}
          copyLabel="Copy run of show"
          sourceHref="/outputs/announcement_video"
          sourceLabel="Edit video lineup"
        />
        <ExportCard
          title="Announcement Video Script"
          purpose="For the speaker · intro, final top three, and outro"
          count={script.items.length}
          itemLabel="script section"
          href={downloadHref("/exports/video-script", selectedSunday)}
          filename={`announcement-script-${selectedKey}.txt`}
          text={scriptText}
          tone="indigo"
          icon={FileText}
          copyLabel="Copy video script"
          sourceHref="/outputs/announcement_video"
          sourceLabel="Edit weekly script copy"
          secondaryHref="/settings/video-script"
          secondaryLabel="Edit intro and outro"
        />
      </div>
    </div>
  );
}
