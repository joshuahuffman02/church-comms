import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import type { Prisma } from "@prisma/client";
import { planEvent, toPrismaDeliverables } from "../src/lib/engine/persist";
import type { ChannelConfig, ChannelType } from "../src/lib/engine/types";
import { atMidnight, addDays } from "../src/lib/engine/dates";
import { DEFAULT_VIDEO_SCRIPT_INTRO, DEFAULT_VIDEO_SCRIPT_OUTRO } from "../src/lib/exports";
import {
  MISSION_TRIP_PLAYBOOK,
  SERMON_SERIES_PLAYBOOK,
  upsertMissionTripPlaybook,
  upsertSermonSeriesPlaybook,
} from "./playbook-seed-data";
import { upsertDefaultTagRules } from "./tag-rules-seed-data";

// Demo channels model a typical church communications mix. Notes on the
// non-obvious fields:
//  - tierEligibility []  → never auto-planned; added per-event via "+ Add output"
//    (opps_table, banner). Any other tier list = auto-plans for those tiers.
//  - frequencyCap        → max EVENTS surfaced per ISO week (the weekly cap +
//    curation; facebook/instagram = 6 each so the feed isn't flooded).
//  - cadence.weekdays    → which days a windowed channel posts (0=Sun … 6=Sat).
//  - active:false        → seeded but off (kept for parity with the live setup).
const CHANNELS = [
  { key: "announcement_video", name: "Announcement Video (Top 3)", type: "dated_instance", defaultPublishOffsetDays: 14, productionLeadDays: 7, lockLeadDays: 7, cadence: { weekdays: [0] }, capacity: 3, tierEligibility: [1,2], color: "#a78bfa", sortOrder: 1 },
  { key: "loop", name: "Sunday Loop", type: "windowed", defaultPublishOffsetDays: 14, productionLeadDays: 7, cadence: { weekdays: [0] }, capacity: 10, tierEligibility: [1,2], color: "#34d399", sortOrder: 2 },
  { key: "app", name: "Church App", type: "one_shot", defaultPublishOffsetDays: 7, productionLeadDays: 1, frequencyCap: 3, tierEligibility: [1,2], color: "#60a5fa", sortOrder: 3 },
  { key: "facebook", name: "Facebook", type: "windowed", defaultPublishOffsetDays: 21, productionLeadDays: 3, cadence: { weekdays: [0,3] }, frequencyCap: 6, tierEligibility: [1,2], color: "#3b82f6", sortOrder: 4 },
  { key: "instagram", name: "Instagram", type: "windowed", defaultPublishOffsetDays: 21, productionLeadDays: 3, cadence: { weekdays: [0,3] }, frequencyCap: 6, tierEligibility: [1,2], color: "#ec4899", sortOrder: 5 },
  { key: "web", name: "Website", type: "windowed", defaultPublishOffsetDays: 28, productionLeadDays: 7, cadence: { weekdays: [1] }, tierEligibility: [1,2], color: "#22d3ee", sortOrder: 6 },
  { key: "email", name: "Weekly Email", type: "windowed", defaultPublishOffsetDays: 21, productionLeadDays: 2, cadence: { weekdays: [4] }, tierEligibility: [1,2], color: "#f59e0b", sortOrder: 7, active: false },
  { key: "restroom_signs", name: "Restroom Signs", type: "windowed", defaultPublishOffsetDays: 14, productionLeadDays: 3, cadence: { weekdays: [0] }, frequencyCap: 8, tierEligibility: [1,2,3], color: "#eab308", sortOrder: 8, active: false },
  { key: "inserts", name: "Bulletin Inserts", type: "windowed", defaultPublishOffsetDays: 21, productionLeadDays: 2, cadence: { weekdays: [0] }, tierEligibility: [1,2,3], color: "#94a3b8", sortOrder: 9 },
  { key: "opps_table", name: "Opportunities Table", type: "windowed", defaultPublishOffsetDays: 14, productionLeadDays: 7, cadence: { weekdays: [0] }, frequencyCap: 1, tierEligibility: [], color: "#14b8a6", sortOrder: 10 },
  { key: "banner", name: "Outdoor Banner", type: "windowed", defaultPublishOffsetDays: 60, productionLeadDays: 21, cadence: { weekdays: [0] }, tierEligibility: [], color: "#f97316", sortOrder: 11 },
] satisfies (ChannelConfig & { color: string; sortOrder: number; capacity?: number; frequencyCap?: number; active?: boolean })[];

const tierFor: Record<string, number> = { whole_church: 1, ministry: 2, small_group: 3, leadership: 3 };

/** Second Sunday on/after `from`: advance to the next getDay()===0, then +7. */
function secondSundayOnOrAfter(from: Date): Date {
  let d = atMidnight(from);
  while (d.getDay() !== 0) d = addDays(d, 1);
  return addDays(d, 7);
}

async function main() {
  // Seed the singleton with the default announcement-video-script templates.
  // On update we backfill ONLY when a template is still null, so an admin's
  // edits in the UI are never clobbered by a re-seed.
  const existingSetting = await db.setting.findUnique({
    where: { id: 1 },
    select: { videoScriptIntro: true, videoScriptOutro: true },
  });
  await db.setting.upsert({
    where: { id: 1 },
    update: {
      videoScriptIntro: existingSetting?.videoScriptIntro ?? DEFAULT_VIDEO_SCRIPT_INTRO,
      videoScriptOutro: existingSetting?.videoScriptOutro ?? DEFAULT_VIDEO_SCRIPT_OUTRO,
    },
    create: {
      id: 1,
      videoScriptIntro: DEFAULT_VIDEO_SCRIPT_INTRO,
      videoScriptOutro: DEFAULT_VIDEO_SCRIPT_OUTRO,
    },
  });

  const adminEmail = "admin@example.church";
  const adminPassword = process.env.ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
    : null;
  const admin = await db.user.upsert({
    where: { email: adminEmail },
    // Only touch the password on update when ADMIN_PASSWORD is set, so a
    // re-seed without it doesn't clobber an out-of-band password.
    update: adminPassword ? { password: adminPassword } : {},
    create: { name: "Demo Admin", email: adminEmail, password: adminPassword, roles: ["admin","triager","designer","publisher"] },
  });
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`No ADMIN_PASSWORD set — run: npx tsx scripts/set-password.ts ${adminEmail} <password> to enable login.`);
  }

  for (const c of CHANNELS) {
    const data = c as unknown as Prisma.ChannelUncheckedCreateInput;
    await db.channel.upsert({ where: { key: c.key }, update: data, create: data });
  }

  // Sensible production-notes reference on a print channel (the "banner /
  // signage" reference text lives on the Mission Trip playbook task; here we
  // seed a general print note so the Outputs page header demonstrates the
  // feature). Only sets it when still blank so an admin's edit isn't clobbered.
  const bulletin = await db.channel.findUnique({ where: { key: "inserts" } });
  if (bulletin && !bulletin.productionNotes) {
    await db.channel.update({
      where: { key: "inserts" },
      data: {
        productionNotes:
          "Submit copy by Wed noon for the coming Sunday. Max ~40 words per item. Print vendor needs final PDF 2 days ahead.",
      },
    });
  }

  // Seed the example Event Playbooks (idempotent by name). Seed BEFORE the tag
  // rules so the tag→playbook suggestion can resolve these templates' ids.
  const missionTrip = await upsertMissionTripPlaybook(db);
  const sermonSeries = await upsertSermonSeriesPlaybook(db);

  const channels = await db.channel.findMany();
  const idByKey = Object.fromEntries(channels.map(c => [c.key, c.id]));
  const cfg: ChannelConfig[] = channels.map(c => ({
    key: c.key, name: c.name, type: c.type as ChannelType,
    defaultPublishOffsetDays: c.defaultPublishOffsetDays, productionLeadDays: c.productionLeadDays,
    lockLeadDays: c.lockLeadDays ?? undefined,
    cadence: (c.cadence as ChannelConfig["cadence"]) ?? undefined,
    capacity: c.capacity ?? undefined, tierEligibility: c.tierEligibility as number[],
  }));

  // --- Sample demo data (idempotent: clear prior demo rows so re-running doesn't duplicate) ---
  // Request cascade removes its deliverables/touches; ministries are recreated fresh.
  // Phase 3 tables: clear approvals before campaigns/rules (approvals also cascade from
  // requests, but being explicit keeps the order obvious and the seed self-contained).
  await db.approval.deleteMany({});
  await db.campaign.deleteMany({});
  await db.approvalRule.deleteMany({});
  await db.request.deleteMany({});
  await db.ministry.deleteMany({});

  const ministries = {
    kids: await db.ministry.create({ data: { name: "Kids", color: "#a7f3d0" } }),
    youth: await db.ministry.create({ data: { name: "Youth", color: "#bae6fd" } }),
    womens: await db.ministry.create({ data: { name: "Women's", color: "#fbcfe8" } }),
    connections: await db.ministry.create({ data: { name: "Connections", color: "#ddd6fe" } }),
    allChurch: await db.ministry.create({ data: { name: "All-Church", color: "#fde68a" } }),
  };

  // Default tag-classification rules (idempotent by tag). Resolves each rule's
  // ministry against whatever ministries exist (these 5 here, or the live DB's
  // fuller set), leaving ministryId null when none matches — tier/controls
  // still apply. See `prisma/tag-rules-seed-data.ts` + `src/lib/tag-rules.ts`.
  const tagRules = await upsertDefaultTagRules(db);

  // Anchor every sample event to the REAL today so the board & calendar are alive on first run.
  const today = atMidnight(new Date());

  type Sample = {
    title: string;
    description?: string;
    ministryId: string;
    whoIsItFor: string;
    tier: number;
    eventStart: Date;
    eventEnd?: Date;
    needsRegistration?: boolean;
    registrationClosesAt?: Date;
    registrationUrl?: string;
    nextStepText: string;
    successMetric?: string;
    requesterName: string;
    requesterEmail: string;
    /** When true, leave as "submitted" with NO deliverables (intake/triage demo data). */
    submitted?: boolean;
  };

  const samples: Sample[] = [
    {
      title: "Vacation Bible School",
      description: "A week of music, games & Bible stories for K–5.",
      ministryId: ministries.kids.id,
      whoIsItFor: "whole_church",
      tier: 1,
      eventStart: addDays(today, 19),
      eventEnd: addDays(today, 23),
      needsRegistration: true,
      registrationClosesAt: addDays(today, 12),
      registrationUrl: "https://church.org/vbs",
      nextStepText: "Register at church.org/vbs",
      successMetric: "75 kids registered",
      requesterName: "Hannah Meyer",
      requesterEmail: "kids@example.church",
    },
    {
      title: "Youth Summer Kickoff",
      description: "Cookout, games, and worship to launch the summer.",
      ministryId: ministries.youth.id,
      whoIsItFor: "ministry",
      tier: 2,
      eventStart: addDays(today, 10),
      nextStepText: "Bring a friend Wednesday at 6pm",
      requesterName: "Tyler Brooks",
      requesterEmail: "youth@example.church",
    },
    {
      title: "Women's Brunch",
      description: "Late-morning brunch and a short teaching.",
      ministryId: ministries.womens.id,
      whoIsItFor: "ministry",
      tier: 2,
      eventStart: addDays(today, 25),
      needsRegistration: true,
      registrationClosesAt: addDays(today, 21),
      nextStepText: "Save your seat at the welcome desk",
      requesterName: "Diane Carlson",
      requesterEmail: "women@example.church",
      submitted: true,
    },
    {
      title: "Membership Lunch",
      description: "Meet the staff and learn what we believe.",
      ministryId: ministries.connections.id,
      whoIsItFor: "small_group",
      tier: 3,
      eventStart: addDays(today, 12),
      nextStepText: "RSVP to the Connections team",
      requesterName: "Mark Ellison",
      requesterEmail: "connections@example.church",
      submitted: true,
    },
    {
      title: "Baptism Sunday",
      description: "Celebrate new commitments with baptisms in both services.",
      ministryId: ministries.allChurch.id,
      whoIsItFor: "whole_church",
      tier: 1,
      eventStart: secondSundayOnOrAfter(today),
      nextStepText: "Sign up to be baptized at church.org/baptism",
      requesterName: "Pastor Greg Sanders",
      requesterEmail: "pastor@example.church",
    },
    {
      title: "Memorial Day Recap",
      description: "Photos and thanks from our Memorial Day weekend.",
      ministryId: ministries.allChurch.id,
      whoIsItFor: "whole_church",
      tier: 1,
      eventStart: addDays(today, -7),
      nextStepText: "See the photo gallery at church.org/photos",
      requesterName: "Karen Whitfield",
      requesterEmail: "office@example.church",
    },
  ];

  let submittedCount = 0;
  let approvedCount = 0;
  let deliverableCount = 0;
  for (const s of samples) {
    // tier must match the whoIsItFor mapping the action uses.
    const tier = tierFor[s.whoIsItFor] ?? s.tier;
    // Submitted samples are fresh intake: no plan/deliverables until approval.
    const plan = s.submitted
      ? []
      : planEvent(
          { eventStart: s.eventStart, promotionEndsAt: s.registrationClosesAt ?? null, tier },
          cfg,
          today,
        );
    deliverableCount += plan.length;
    await db.request.create({
      data: {
        title: s.title,
        description: s.description ?? null,
        ministryId: s.ministryId,
        requesterId: admin.id,
        ownerId: admin.id,
        requesterName: s.requesterName,
        requesterEmail: s.requesterEmail,
        statusToken: crypto.randomUUID(),
        whoIsItFor: s.whoIsItFor,
        tier,
        eventStart: s.eventStart,
        eventEnd: s.eventEnd ?? null,
        needsRegistration: s.needsRegistration ?? false,
        registrationClosesAt: s.registrationClosesAt ?? null,
        registrationUrl: s.registrationUrl ?? null,
        nextStepText: s.nextStepText,
        successMetric: s.successMetric ?? null,
        status: s.submitted ? "submitted" : "approved",
        deliverables: { create: toPrismaDeliverables(plan, idByKey) },
      },
    });
    if (s.submitted) submittedCount++;
    else approvedCount++;
  }

  // One example approval rule — shipped INACTIVE so the solo-admin default
  // experience is unchanged (nothing gets routed for sign-off out of the box).
  await db.approvalRule.create({
    data: {
      name: "All-church email needs pastor sign-off",
      conditionType: "all_church_email",
      approverId: admin.id,
      active: false,
    },
  });

  // One sample sprint (campaign) in the recent PAST so it demonstrates the
  // feature without suppressing any *current* volume guardrails.
  await db.campaign.create({
    data: {
      name: "Easter Push",
      startsAt: addDays(today, -60),
      endsAt: addDays(today, -46),
      suspendsGuardrails: true,
    },
  });

  console.log(
    `Seeded ${CHANNELS.length} channels, ${Object.keys(ministries).length} ministries, ` +
    `${submittedCount + approvedCount} sample requests ` +
    `(${submittedCount} submitted w/o deliverables, ${approvedCount} approved with ${deliverableCount} deliverables), ` +
    `1 inactive approval rule, 1 past sprint (Easter Push), ` +
    `the "${MISSION_TRIP_PLAYBOOK.name}" playbook (${missionTrip.tasksEnsured} tasks), ` +
    `the "${SERMON_SERIES_PLAYBOOK.name}" playbook (${sermonSeries.tasksEnsured} tasks), ` +
    `${tagRules.ensured} tag rules (${tagRules.withMinistry} mapped to a ministry, ${tagRules.withoutMinistry} tier/control-only, ${tagRules.withPlaybook} suggesting a playbook) ` +
    `(anchored to ${today.toISOString().slice(0,10)}).`
  );
}

main().finally(() => db.$disconnect());
