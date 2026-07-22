import { db } from "@/lib/db";
import { weekRange, comingSunday } from "@/lib/week";
import { addDays, parseDateInput } from "@/lib/engine/dates";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { loadAnnouncementVideoLineup } from "@/lib/announcement-video";
import { effectiveEventCap, splitByWeeklyCap } from "@/lib/social-curation";

// ---------------------------------------------------------------------------
// Pure builders
//
// Each builder takes already-fetched, plain rows and returns a formatted
// string. They never touch the DB so they're trivially unit-testable. The thin
// DB loaders below fetch the rows and reshape them into these item types.
//
// Dates are formatted with `toLocaleDateString` (local getters) — never
// `toISOString()` — per the church-local-midnight invariant in engine/dates.
// ---------------------------------------------------------------------------

/**
 * Human-readable Sunday for an export header, e.g. "June 7, 2026". The headers
 * already say "Sunday", so the weekday is intentionally omitted here.
 */
function formatSunday(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Squash a multi-line value into a single tidy line for paste-friendly output. */
function oneLine(s: string): string {
  return s.replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * `YYYY-MM-DD` from local getters (NOT toISOString — that would shift a
 * church-local-midnight date back a day on UTC-behind hosts). For filenames.
 */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Resolve an optional YYYY-MM-DD query value to the Sunday it belongs to. */
export function exportSundayFromParam(value: string | null | undefined, fallback: Date): Date {
  const parsed = value ? parseDateInput(value) : null;
  return comingSunday(parsed ?? fallback);
}

export type LoopItem = {
  title: string;
  nextStepText: string | null;
  ministry: string | null;
  /**
   * Per-week custom slide copy for THIS touch. When set it replaces the whole
   * `<Title> — <next step / ministry>` line, so each weekly appearance can read
   * differently. Empty/null falls back to the title + next-step/ministry.
   */
  content?: string | null;
};

/**
 * ProPresenter pre-service loop: a plain-text, one-slide-per-line numbered
 * list. When a touch carries custom `content` for that week, the line is just
 * `N. <content>` (squashed to one line); otherwise it's
 * `N. <Title> — <next step or ministry>`. Falls back to the ministry name when
 * there's no next step, and to the title alone if neither.
 */
export function buildLoopList(items: LoopItem[], sunday: Date): string {
  const header = `Pre-Service Loop — Sunday ${formatSunday(sunday)}`;
  const lines = items.map((it, i) => {
    const custom = (it.content ?? "").trim();
    if (custom) return `${i + 1}. ${oneLine(custom)}`;
    const detail = (it.nextStepText ?? "").trim() || (it.ministry ?? "").trim();
    return detail ? `${i + 1}. ${it.title} — ${detail}` : `${i + 1}. ${it.title}`;
  });
  return [header, ...lines].join("\n");
}

export type BulletinItem = {
  title: string;
  nextStepText: string | null;
  description: string | null;
};

/**
 * Printed-bulletin copy block: one block per item, a bold title then a single
 * blurb line (next step preferred, description as fallback). Blocks are
 * separated by a blank line so the whole thing pastes cleanly into the bulletin.
 */
export function buildBulletinCopy(items: BulletinItem[]): string {
  return items
    .map((it) => {
      const raw = (it.nextStepText ?? "").trim() || (it.description ?? "").trim();
      const blurb = oneLine(raw);
      return blurb ? `**${it.title}**\n${blurb}\n` : `**${it.title}**\n`;
    })
    .join("\n");
}

export type VideoItem = {
  title: string;
  nextStepText: string | null;
  tier: number;
};

/**
 * Announcement-video run-of-show: a header naming the Sunday, then up to 3
 * numbered `N. <Title> — <next step>` lines. Items are assumed pre-sorted in
 * tier order by the loader; the cap is enforced here so the builder is the
 * single source of truth for the top-3 rule.
 */
export function buildVideoRunOfShow(items: VideoItem[], sunday: Date): string {
  const header = `Announcement Video — Sunday ${formatSunday(sunday)}`;
  const lines = items.slice(0, 3).map((it, i) => {
    const detail = (it.nextStepText ?? "").trim();
    return detail ? `${i + 1}. ${it.title} — ${detail}` : `${i + 1}. ${it.title}`;
  });
  return [header, ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Announcement Video Script
//
// A ready-to-read script: a template INTRO, then up to 3 numbered read-aloud
// blocks auto-filled from the week's top-3 announcement-video items, then a
// template OUTRO. The intro/outro live on the Setting singleton and are
// editable in /settings/video-script; these constants are the fallback when a
// template is null (and the seed defaults).
// ---------------------------------------------------------------------------

export const DEFAULT_VIDEO_SCRIPT_INTRO =
  "Good morning! Here are a few things happening around the church this week.";

export const DEFAULT_VIDEO_SCRIPT_OUTRO =
  "That's it for this week — check the church app or website for details and sign-ups. Have a great week!";

export type VideoScriptItem = {
  title: string;
  /** Per-week custom blurb for this touch; when set it's preferred over description. */
  content?: string | null;
  description: string | null;
  nextStepText: string | null;
};

/**
 * Announcement Video Script. Read-aloud friendly: a header naming the Sunday,
 * the template intro, up to 3 numbered blocks (event title header, a blurb, and
 * a "Next step:" CTA line when there's a next step), then the template outro.
 *
 * Blurb precedence per item: per-touch `content` → event `description` →
 * `nextStepText` (so there's always something to read). The CTA line is only
 * added when `nextStepText` is present AND it wasn't already used as the blurb,
 * to avoid reading the same sentence twice. Blocks are separated by blank lines.
 * The cap of 3 is enforced here so the builder owns the top-3 rule.
 */
export function buildVideoScript(
  items: VideoScriptItem[],
  sunday: Date,
  intro: string,
  outro: string,
): string {
  const header = `Announcement Video Script — Sunday ${formatSunday(sunday)}`;
  const introLine = oneLine(intro || DEFAULT_VIDEO_SCRIPT_INTRO);
  const outroLine = oneLine(outro || DEFAULT_VIDEO_SCRIPT_OUTRO);

  const blocks = items.slice(0, 3).map((it, i) => {
    const nextStep = (it.nextStepText ?? "").trim();
    const custom = (it.content ?? "").trim();
    const description = (it.description ?? "").trim();
    // Blurb: per-touch content, else description, else the next step.
    const blurb = oneLine(custom || description || nextStep);
    const lines = [`${i + 1}. ${it.title}`];
    if (blurb) lines.push(blurb);
    // Only add a CTA line when the next step isn't already the blurb.
    if (nextStep && oneLine(nextStep) !== blurb) lines.push(`Next step: ${nextStep}`);
    return lines.join("\n");
  });

  return [header, "", introLine, "", ...interleaveBlocks(blocks), outroLine].join("\n");
}

export type ActiveExportChannel = {
  id: string;
  key: string;
  name: string;
  type: string;
  color: string;
  capacity: number | null;
  frequencyCap: number | null;
};

export type ChannelHandoffItem = {
  title: string;
  scheduledAt: Date;
  content: string | null;
  description: string | null;
  nextStepText: string | null;
  assetLink: string | null;
  note: string | null;
  purposeLabel: string | null;
};

function formatScheduledDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Paste-ready weekly copy for any active channel that does not have a more
 * specialized handoff. Each scheduled placement stays visible because a
 * windowed channel may intentionally use different copy on different days.
 */
export function buildChannelHandoff(
  channelName: string,
  items: ChannelHandoffItem[],
  sunday: Date,
): string {
  const header = `${channelName} — Week ending Sunday ${formatSunday(sunday)}`;
  const blocks = items.map((item, index) => {
    const custom = (item.content ?? "").trim();
    const description = (item.description ?? "").trim();
    const nextStep = (item.nextStepText ?? "").trim();
    const copy = oneLine(custom || description || nextStep);
    const lines = [`${index + 1}. ${formatScheduledDate(item.scheduledAt)} · ${item.title}`];
    if (item.purposeLabel?.trim()) lines.push(`Purpose: ${oneLine(item.purposeLabel)}`);
    if (copy) lines.push(copy);
    if (nextStep && oneLine(nextStep) !== copy) lines.push(`Next step: ${oneLine(nextStep)}`);
    if (item.assetLink?.trim()) lines.push(`Asset: ${oneLine(item.assetLink)}`);
    if (item.note?.trim()) lines.push(`Note: ${oneLine(item.note)}`);
    return lines.join("\n");
  });
  return [header, "", ...interleaveBlocks(blocks)].join("\n").trimEnd();
}

/** Join read-aloud blocks with a blank line between each, trailed by a blank line. */
function interleaveBlocks(blocks: string[]): string[] {
  if (blocks.length === 0) return [];
  const out: string[] = [];
  for (const b of blocks) {
    out.push(b, "");
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB loaders
// ---------------------------------------------------------------------------

const touchInclude = {
  deliverable: { include: { request: { include: { ministry: true } } } },
} as const;

async function channelIdByKey(key: string): Promise<string | null> {
  const ch = await db.channel.findUnique({ where: { key }, select: { id: true } });
  return ch?.id ?? null;
}

/** The exact channel list configured as active in Settings, in display order. */
export function loadActiveExportChannels(): Promise<ActiveExportChannel[]> {
  return db.channel.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      type: true,
      color: true,
      capacity: true,
      frequencyCap: true,
    },
  });
}

/**
 * Resolve the same live/capped placements shown on a channel page for a
 * selected week, then shape them for the generic text handoff.
 */
export async function loadChannelHandoffs(
  channels: ActiveExportChannel[],
  selectedSunday: Date,
): Promise<Map<string, { sunday: Date; items: ChannelHandoffItem[] }>> {
  const { start, end } = weekRange(selectedSunday);
  const sunday = comingSunday(selectedSunday);
  const channelIds = channels.map((channel) => channel.id);
  const output = new Map<string, { sunday: Date; items: ChannelHandoffItem[] }>();
  if (channelIds.length === 0) return output;

  const [touches, locks] = await Promise.all([
    db.touch.findMany({
      where: {
        channelId: { in: channelIds },
        deliverable: {
          request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
        },
        scheduledAt: { gte: start, lt: addDays(end, 1) },
      },
      include: touchInclude,
      orderBy: [
        { scheduledAt: "asc" },
        { deliverable: { request: { tier: "asc" } } },
        { deliverable: { request: { eventStart: "asc" } } },
        { deliverable: { request: { title: "asc" } } },
      ],
    }),
    db.scheduleLock.findMany({
      where: {
        channelId: { in: channelIds },
        scheduledAt: { gte: start, lt: addDays(end, 1) },
      },
      select: { channelId: true, requestId: true },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const touchesByChannel = new Map<string, typeof touches>();
  for (const touch of touches) {
    touchesByChannel.set(touch.channelId, [...(touchesByChannel.get(touch.channelId) ?? []), touch]);
  }
  const preferredByChannel = new Map<string, string[]>();
  for (const lock of locks) {
    const preferred = preferredByChannel.get(lock.channelId) ?? [];
    if (!preferred.includes(lock.requestId)) preferred.push(lock.requestId);
    preferredByChannel.set(lock.channelId, preferred);
  }

  for (const channel of channels) {
    const channelTouches = touchesByChannel.get(channel.id) ?? [];
    const { live } = splitByWeeklyCap(
      channelTouches,
      (touch) => ({
        requestId: touch.deliverable.request.id,
        tier: touch.deliverable.request.tier,
        eventStartMs: touch.deliverable.request.eventStart.getTime(),
        title: touch.deliverable.request.title,
      }),
      effectiveEventCap(channel),
      preferredByChannel.get(channel.id),
    );
    output.set(channel.key, {
      sunday,
      items: live.map((touch) => ({
        title: touch.deliverable.request.title,
        scheduledAt: touch.scheduledAt,
        content: touch.content,
        description: touch.deliverable.request.description,
        nextStepText: touch.deliverable.request.nextStepText,
        assetLink: touch.assetLink ?? touch.deliverable.assetLink,
        note: touch.note,
        purposeLabel: touch.purposeLabel,
      })),
    });
  }
  return output;
}

export async function loadChannelHandoff(
  channel: ActiveExportChannel,
  selectedSunday: Date,
): Promise<{ sunday: Date; items: ChannelHandoffItem[] }> {
  const handoffs = await loadChannelHandoffs([channel], selectedSunday);
  return handoffs.get(channel.key) ?? { sunday: comingSunday(selectedSunday), items: [] };
}

/** Loop touches scheduled on the coming Sunday, shaped for buildLoopList. */
export async function loadLoopForComingSunday(today: Date): Promise<{
  sunday: Date;
  items: LoopItem[];
}> {
  const sunday = comingSunday(today);
  const channelId = await channelIdByKey("loop");
  if (!channelId) return { sunday, items: [] };
  const touches = await db.touch.findMany({
    where: {
      channelId,
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: { gte: sunday, lt: addDays(sunday, 1) },
    },
    include: touchInclude,
    orderBy: [{ deliverable: { request: { tier: "asc" } } }, { scheduledAt: "asc" }],
  });
  const items: LoopItem[] = touches.map((t) => ({
    title: t.deliverable.request.title,
    nextStepText: t.deliverable.request.nextStepText,
    ministry: t.deliverable.request.ministry?.name ?? null,
    content: t.content,
  }));
  return { sunday, items };
}

/** Bulletin touches active during the current church-local week. */
export async function loadBulletinThisWeek(today: Date): Promise<{
  sunday: Date;
  items: BulletinItem[];
}> {
  const { start, end } = weekRange(today);
  const sunday = comingSunday(today);
  const channelId = await channelIdByKey("inserts");
  if (!channelId) return { sunday, items: [] };
  const touches = await db.touch.findMany({
    where: {
      channelId,
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
      scheduledAt: { gte: start, lt: addDays(end, 1) },
    },
    include: touchInclude,
    orderBy: [{ deliverable: { request: { tier: "asc" } } }, { scheduledAt: "asc" }],
  });
  // De-dupe by request: a windowed channel can emit several touches per event
  // within a single week, but the bulletin copy wants one block per event.
  const seen = new Set<string>();
  const items: BulletinItem[] = [];
  for (const t of touches) {
    const req = t.deliverable.request;
    if (seen.has(req.id)) continue;
    seen.add(req.id);
    items.push({
      title: req.title,
      nextStepText: req.nextStepText,
      description: req.description,
    });
  }
  return { sunday, items };
}

/**
 * The canonical Announcement Video lineup for the coming Sunday. This is the
 * same resolved set and order shown on Sunday Checklist and the output page.
 */
export async function loadVideoThisWeek(today: Date): Promise<{
  sunday: Date;
  items: VideoItem[];
}> {
  const sunday = comingSunday(today);
  const lineup = await loadAnnouncementVideoLineup(sunday);
  return {
    sunday: lineup.sunday,
    items: lineup.entries.map((entry) => ({
      title: entry.title,
      nextStepText: entry.nextStepText,
      tier: entry.tier,
    })),
  };
}

/**
 * Announcement Video Script for the coming Sunday: the same top-3
 * announcement-video deliverables as {@link loadVideoThisWeek}, but selecting
 * the richer fields the script needs (description + any per-week touch content),
 * plus the editable intro/outro templates from the Setting singleton (falling
 * back to the in-code defaults when null). The builder caps the list at 3.
 */
export async function loadVideoScriptThisWeek(today: Date): Promise<{
  sunday: Date;
  items: VideoScriptItem[];
  intro: string;
  outro: string;
}> {
  const sunday = comingSunday(today);
  const [setting, lineup] = await Promise.all([
    db.setting.findUnique({
      where: { id: 1 },
      select: { videoScriptIntro: true, videoScriptOutro: true },
    }),
    loadAnnouncementVideoLineup(sunday),
  ]);
  const intro = setting?.videoScriptIntro ?? DEFAULT_VIDEO_SCRIPT_INTRO;
  const outro = setting?.videoScriptOutro ?? DEFAULT_VIDEO_SCRIPT_OUTRO;
  const items: VideoScriptItem[] = lineup.entries.map((entry) => ({
    title: entry.title,
    content: entry.content,
    description: entry.description,
    nextStepText: entry.nextStepText,
  }));
  return { sunday: lineup.sunday, items, intro, outro };
}
