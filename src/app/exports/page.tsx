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
  ListVideo,
  Mail,
  Megaphone,
  MonitorPlay,
  PanelTop,
  PencilLine,
  Radio,
  Settings2,
  Smartphone,
  TableProperties,
} from "lucide-react";
import {
  buildChannelHandoff,
  buildLoopList,
  buildVideoRunOfShow,
  buildVideoScript,
  exportSundayFromParam,
  loadActiveExportChannels,
  loadChannelHandoffs,
  loadLoopForComingSunday,
  loadVideoThisWeek,
  loadVideoScriptThisWeek,
  type ActiveExportChannel,
  ymd,
} from "@/lib/exports";
import { CopyButton } from "@/components/copy-button";
import { addDays } from "@/lib/engine/dates";
import { comingSunday } from "@/lib/week";

// These previews reflect live DB state, so render them fresh each request.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ExportFile = {
  title: string;
  purpose: string;
  count: number;
  itemLabel: string;
  href: string;
  filename: string;
  text: string;
  copyLabel: string;
};

type ChannelCardData = {
  channel: ActiveExportChannel;
  icon: LucideIcon;
  purpose: string;
  scheduledCount: number;
  scheduledLabel: string;
  files: ExportFile[];
  secondaryHref?: string;
  secondaryLabel?: string;
};

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  announcement_video: ListVideo,
  loop: MonitorPlay,
  app: Smartphone,
  facebook: Megaphone,
  email: Mail,
  opps_table: TableProperties,
  banner: PanelTop,
};

const CHANNEL_PURPOSES: Record<string, string> = {
  announcement_video: "Final Sunday lineup and ready-to-read speaker script",
  loop: "Sunday slides for the pre-service ProPresenter loop",
  app: "Scheduled copy for the Church App",
  facebook: "Scheduled social copy for Facebook",
  email: "Copy blocks for the weekly PV Update email",
  opps_table: "Current items for the Opportunities Table",
  banner: "Copy and production notes for the outdoor banner",
};

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

function countLabel(count: number, itemLabel: string): string {
  return `${count} ${count === 1 ? itemLabel : `${itemLabel}s`}`;
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

function FileHandoff({ file, color }: { file: ExportFile; color: string }) {
  const empty = file.count === 0;
  const items = countLabel(file.count, file.itemLabel);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-ink">{file.title}</h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
              {items}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{file.purpose}</p>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">{file.filename}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CopyButton text={file.text} accent={color} label={file.copyLabel} disabled={empty} />
          {!empty && (
            <a
              href={file.href}
              download={file.filename}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: color }}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Download .txt
            </a>
          )}
        </div>
      </div>
      {!empty && (
        <details className="group mt-3 rounded-xl border border-slate-200 bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-bold text-ink marker:content-none">
            <span>Preview {items}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <pre className="max-h-96 overflow-auto border-t border-slate-200 px-4 py-4 font-sans text-sm leading-6 whitespace-pre-wrap break-words text-ink">
            {file.text}
          </pre>
        </details>
      )}
    </div>
  );
}

function ChannelCard({ data }: { data: ChannelCardData }) {
  const { channel, icon: Icon, scheduledCount, scheduledLabel, files } = data;
  const empty = scheduledCount === 0;

  return (
    <article className="card-float overflow-hidden border-l-[5px]" style={{ borderLeftColor: channel.color }}>
      <div className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
              style={{ backgroundColor: `${channel.color}1f`, color: channel.color }}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink">{channel.name}</h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${empty ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                  {empty ? <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {empty ? "Nothing scheduled" : "Ready"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{data.purpose}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{countLabel(scheduledCount, scheduledLabel)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{files.length} {files.length === 1 ? "handoff" : "handoffs"}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Built from the live channel</span>
              </div>
            </div>
          </div>
          <Link
            href={`/outputs/${channel.key}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold text-ink hover:bg-sky-bg"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" /> Open channel
          </Link>
        </div>

        {empty ? (
          <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-4">
            <p className="font-bold text-amber-950">There is no handoff for this channel yet.</p>
            <p className="mt-0.5 text-sm text-amber-900/75">Schedule an item in this channel for the selected week and it will appear here automatically.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {files.map((file) => <FileHandoff key={file.href} file={file} color={channel.color} />)}
          </div>
        )}

        {!empty && data.secondaryHref && data.secondaryLabel && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Link href={data.secondaryHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50">
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> {data.secondaryLabel}
            </Link>
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

  const [channels, loop, video, script] = await Promise.all([
    loadActiveExportChannels(),
    loadLoopForComingSunday(selectedSunday),
    loadVideoThisWeek(selectedSunday),
    loadVideoScriptThisWeek(selectedSunday),
  ]);
  const genericChannels = channels.filter((channel) => channel.key !== "loop" && channel.key !== "announcement_video");
  const genericHandoffs = await loadChannelHandoffs(genericChannels, selectedSunday);

  const loopText = buildLoopList(loop.items, loop.sunday);
  const videoText = buildVideoRunOfShow(video.items, video.sunday);
  const scriptText = buildVideoScript(script.items, script.sunday, script.intro, script.outro);

  const cards: ChannelCardData[] = channels.map((channel) => {
    const icon = CHANNEL_ICONS[channel.key] ?? Radio;
    const purpose = CHANNEL_PURPOSES[channel.key] ?? "Weekly copy and production handoff for this active channel";

    if (channel.key === "loop") {
      return {
        channel,
        icon,
        purpose,
        scheduledCount: loop.items.length,
        scheduledLabel: "slide",
        files: [{
          title: "Pre-Service Loop",
          purpose: "One Sunday slide per line for ProPresenter",
          count: loop.items.length,
          itemLabel: "slide",
          href: downloadHref("/exports/loop", selectedSunday),
          filename: `pre-service-loop-${selectedKey}.txt`,
          text: loopText,
          copyLabel: "Copy loop list",
        }],
      };
    }

    if (channel.key === "announcement_video") {
      return {
        channel,
        icon,
        purpose,
        scheduledCount: video.items.length,
        scheduledLabel: "announcement",
        files: [
          {
            title: "Run of show",
            purpose: "The final top-three order for the video team",
            count: video.items.length,
            itemLabel: "announcement",
            href: downloadHref("/exports/video", selectedSunday),
            filename: `announcement-video-run-of-show-${selectedKey}.txt`,
            text: videoText,
            copyLabel: "Copy run of show",
          },
          {
            title: "Speaker script",
            purpose: "Intro, final top three, and outro in read-aloud format",
            count: script.items.length,
            itemLabel: "section",
            href: downloadHref("/exports/video-script", selectedSunday),
            filename: `announcement-script-${selectedKey}.txt`,
            text: scriptText,
            copyLabel: "Copy video script",
          },
        ],
        secondaryHref: "/settings/video-script",
        secondaryLabel: "Edit video intro and outro",
      };
    }

    const handoff = genericHandoffs.get(channel.key) ?? { sunday: selectedSunday, items: [] };
    const text = buildChannelHandoff(channel.name, handoff.items, handoff.sunday);
    return {
      channel,
      icon,
      purpose,
      scheduledCount: handoff.items.length,
      scheduledLabel: "placement",
      files: [{
        title: "Weekly channel copy",
        purpose: "Scheduled dates, copy, next steps, assets, and notes",
        count: handoff.items.length,
        itemLabel: "placement",
        href: downloadHref(`/exports/channel/${channel.key}`, selectedSunday),
        filename: `${channel.key}-${selectedKey}.txt`,
        text,
        copyLabel: `Copy ${channel.name}`,
      }],
    };
  });

  const readyChannelCount = cards.filter((card) => card.scheduledCount > 0).length;
  const totalPlacements = cards.reduce((count, card) => count + card.scheduledCount, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="card-float mb-5 overflow-hidden p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Weekly handoff workspace</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">Downloads</h1>
            <p className="mt-1 max-w-3xl text-muted">
              Every active channel for {fullSunday(selectedSunday)}, in the same order as your channel settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pipeline" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">Production →</Link>
            <Link href="/assign" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Channel plan →</Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Active channels" value={String(channels.length)} detail="Synced from channel settings" />
          <SummaryCard label="Ready channels" value={`${readyChannelCount} of ${channels.length}`} detail={readyChannelCount === channels.length ? "Every channel has a handoff" : `${channels.length - readyChannelCount} have nothing scheduled`} />
          <SummaryCard label="Scheduled work" value={String(totalPlacements)} detail="Across this export week" />
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
          {!isCurrent && <Link href={sundayHref(currentSunday)} className="mt-1 inline-flex text-xs font-bold text-sky-700 hover:underline">Return to coming Sunday</Link>}
        </div>
        <Link href={sundayHref(nextSunday)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">
          Next Sunday <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </nav>

      <section className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between" aria-labelledby="handoff-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Current active channels</p>
          <h2 id="handoff-heading" className="mt-0.5 text-2xl font-extrabold text-ink">One place for every channel handoff</h2>
        </div>
        <Link href="/settings/channels" className="text-sm font-bold text-sky-700 hover:underline">Manage active channels →</Link>
      </section>

      <div className="grid gap-4">
        {cards.map((card) => <ChannelCard key={card.channel.id} data={card} />)}
      </div>
    </div>
  );
}
