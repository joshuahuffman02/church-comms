import { db } from "@/lib/db";
import { weekRange, comingSunday } from "@/lib/week";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

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
 * Announcement-video instance touches whose instanceDate falls within this week
 * or on the coming Sunday, in tier order. The builder caps the list at 3.
 */
export async function loadVideoThisWeek(today: Date): Promise<{
  sunday: Date;
  items: VideoItem[];
}> {
  const { start } = weekRange(today);
  const sunday = comingSunday(today);
  // Window: Monday of this week through the coming Sunday (inclusive).
  const upper = addDays(sunday, 1);
  const channelId = await channelIdByKey("announcement_video");
  if (!channelId) return { sunday, items: [] };
  const deliverables = await db.deliverable.findMany({
    where: {
      channelId,
      request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      instanceDate: { gte: start, lt: upper },
    },
    include: { request: { include: { ministry: true } } },
    orderBy: [
      { request: { tier: "asc" } },
      { request: { eventStart: "asc" } },
      { request: { title: "asc" } },
      { instanceDate: "asc" },
    ],
  });
  const items: VideoItem[] = deliverables.map((d) => ({
    title: d.request.title,
    nextStepText: d.request.nextStepText,
    tier: d.request.tier,
  }));
  return { sunday: atMidnight(sunday), items };
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
  const { start } = weekRange(today);
  const sunday = comingSunday(today);
  const upper = addDays(sunday, 1);
  const channelId = await channelIdByKey("announcement_video");

  const [setting, deliverables] = await Promise.all([
    db.setting.findUnique({
      where: { id: 1 },
      select: { videoScriptIntro: true, videoScriptOutro: true },
    }),
    channelId
      ? db.deliverable.findMany({
          where: {
            channelId,
            request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
            instanceDate: { gte: start, lt: upper },
          },
          include: {
            request: true,
            // Per-week copy for THIS instance, if an editor set it on the touch.
            touches: { orderBy: { scheduledAt: "asc" }, take: 1, select: { content: true } },
          },
          orderBy: [
            { request: { tier: "asc" } },
            { request: { eventStart: "asc" } },
            { request: { title: "asc" } },
            { instanceDate: "asc" },
          ],
        })
      : Promise.resolve([]),
  ]);

  const items: VideoScriptItem[] = deliverables.map((d) => ({
    title: d.request.title,
    content: d.touches[0]?.content ?? null,
    description: d.request.description,
    nextStepText: d.request.nextStepText,
  }));

  return {
    sunday: atMidnight(sunday),
    items,
    intro: setting?.videoScriptIntro ?? DEFAULT_VIDEO_SCRIPT_INTRO,
    outro: setting?.videoScriptOutro ?? DEFAULT_VIDEO_SCRIPT_OUTRO,
  };
}
