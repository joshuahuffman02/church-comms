// Example Event Playbook seed data + an idempotent upsert helper, in a module
// with NO top-level side effects so it can be imported by both the full seed
// (`prisma/seed.ts`) and the standalone seed scripts (`prisma/seed-mission-trip.ts`,
// `prisma/seed-sermon-series.ts`) without triggering a full re-seed.
import type { PrismaClient } from "@prisma/client";

/** The shape of a playbook definition we upsert (template + its tasks). */
export type PlaybookSeed = {
  name: string;
  description: string;
  tasks: ReadonlyArray<{
    title: string;
    offsetDays: number | null;
    category: string | null;
    notes: string | null;
  }>;
};

// An example Event Playbook (admin checklist template). `offsetDays` = days
// BEFORE the event the task is due. See the playbooks feature in
// `src/lib/playbooks.ts`.
export const MISSION_TRIP_PLAYBOOK = {
  name: "Mission Trip",
  description:
    "Far-out admin runway for a mission trip — approvals, giving, registration, signage, and the final info meeting.",
  tasks: [
    {
      title: "Get board approval",
      offsetDays: 120,
      category: "approval",
      notes: "Present scope + budget to the board.",
    },
    {
      title: "Turn on the giving platform + create a giving dashboard",
      offsetDays: 90,
      category: "giving",
      notes: null as string | null,
    },
    {
      title: "Open registration in Church Center",
      offsetDays: 60,
      category: "registration",
      notes: null as string | null,
    },
    {
      title: "Order the outdoor banner",
      offsetDays: 60,
      category: "logistics",
      notes:
        "Banner is 3'x8' vinyl; submit art 3 weeks ahead; past lesson: order 2 in case of weather.",
    },
    {
      title: "Final info meeting",
      offsetDays: 14,
      category: "logistics",
      notes: null as string | null,
    },
  ],
} as const;

// A sermon series is NOT promoted across ad channels (it carries the noPromo
// flag) — instead its launch fires a brand/asset checklist: get the look made
// once, then push it into every surface (stage, web, social, channel art). The
// offsets are days BEFORE the series start; categories group the work by where
// it lands (Graphics / Stage / Digital).
export const SERMON_SERIES_PLAYBOOK = {
  name: "Sermon Series",
  description:
    "Brand/asset launch checklist for a new sermon series — build the look once, then push it into ProPresenter, the lobby, the web/app, social, and channel art. Not an ad campaign: one announce post, no reverse-timeline fan-out.",
  tasks: [
    {
      title: "Design the series title graphic + key art",
      offsetDays: 21,
      category: "Graphics",
      notes:
        "Title, bumper, social sizes — establishes the look for everything else.",
    },
    {
      title: "Update ProPresenter — sermon slide template, lower thirds, backgrounds",
      offsetDays: 14,
      category: "Stage",
      notes: "Swap the series look into the live slide environment.",
    },
    {
      title: "Create the sermon slide / scripture template for the series",
      offsetDays: 14,
      category: "Stage",
      notes: null as string | null,
    },
    {
      title: "Update the Facebook cover photo",
      offsetDays: 7,
      category: "Digital",
      notes: "820x312; safe area centered.",
    },
    {
      title: "Update the YouTube channel art / thumbnail template",
      offsetDays: 7,
      category: "Digital",
      notes:
        "Thumbnail 1280x720; keep series branding consistent.",
    },
    {
      title: "Update the website + app/Church Center series image",
      offsetDays: 7,
      category: "Digital",
      notes: null as string | null,
    },
    {
      title: "Set the lobby/welcome screens to the series art",
      offsetDays: 3,
      category: "Stage",
      notes: null as string | null,
    },
    {
      title: "Schedule the series-announcement social post",
      offsetDays: 7,
      category: "Graphics",
      notes: "One announce post — this is NOT a full ad campaign.",
    },
  ],
} as const;

/**
 * Idempotently upsert a playbook (matched by name): create the template if
 * missing (else refresh its description + reactivate), and ensure each task
 * exists (matched by title within the template), keeping notes/offset/category/
 * sortOrder in sync. Safe to run repeatedly — never duplicates the template or
 * its tasks.
 */
export async function upsertPlaybook(
  prisma: PrismaClient,
  playbook: PlaybookSeed,
): Promise<{ templateId: string; tasksEnsured: number }> {
  const existing = await prisma.eventTemplate.findFirst({
    where: { name: playbook.name },
    select: { id: true },
  });
  const template = existing
    ? await prisma.eventTemplate.update({
        where: { id: existing.id },
        data: { description: playbook.description, active: true },
      })
    : await prisma.eventTemplate.create({
        data: {
          name: playbook.name,
          description: playbook.description,
          active: true,
        },
      });

  let ensured = 0;
  for (let i = 0; i < playbook.tasks.length; i++) {
    const t = playbook.tasks[i];
    const found = await prisma.eventTemplateTask.findFirst({
      where: { templateId: template.id, title: t.title },
      select: { id: true },
    });
    const data = {
      title: t.title,
      notes: t.notes ?? null,
      offsetDays: t.offsetDays,
      category: t.category ?? null,
      sortOrder: i,
    };
    if (found) {
      await prisma.eventTemplateTask.update({ where: { id: found.id }, data });
    } else {
      await prisma.eventTemplateTask.create({
        data: { templateId: template.id, ...data },
      });
    }
    ensured++;
  }
  return { templateId: template.id, tasksEnsured: ensured };
}

/** Idempotently upsert the Mission Trip playbook. Thin wrapper over upsertPlaybook. */
export async function upsertMissionTripPlaybook(
  prisma: PrismaClient,
): Promise<{ templateId: string; tasksEnsured: number }> {
  return upsertPlaybook(prisma, MISSION_TRIP_PLAYBOOK);
}

/** Idempotently upsert the Sermon Series playbook. Thin wrapper over upsertPlaybook. */
export async function upsertSermonSeriesPlaybook(
  prisma: PrismaClient,
): Promise<{ templateId: string; tasksEnsured: number }> {
  return upsertPlaybook(prisma, SERMON_SERIES_PLAYBOOK);
}
