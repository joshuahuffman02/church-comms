import { describe, expect, it } from "vitest";
import {
  buildCopyStarters,
  buildIntakePlanPreview,
  requestReadiness,
} from "../src/lib/smart-workflow";

describe("requestReadiness", () => {
  it("prioritizes pending approvals before production work", () => {
    const result = requestReadiness({
      status: "triaged",
      description: "A church-wide gathering.",
      nextStepText: "Register online.",
      ownerId: "user-1",
      approvals: [{ status: "pending" }],
      pieces: [{ status: "to_design" }],
      guardrailCount: 0,
      hasFinalAsset: false,
    });

    expect(result.nextAction.title).toContain("approval");
    expect(result.nextAction.href).toBe("#approvals");
    expect(result.checks.find((check) => check.key === "approval")?.complete).toBe(false);
  });

  it("reports a fully scheduled event as ready", () => {
    const result = requestReadiness({
      status: "scheduled",
      description: "A church-wide gathering.",
      nextStepText: "Register online.",
      ownerId: "user-1",
      approvals: [{ status: "approved" }],
      pieces: [{ status: "scheduled" }, { status: "published" }],
      guardrailCount: 0,
      hasFinalAsset: true,
    });

    expect(result.complete).toBe(result.total);
    expect(result.label).toBe("Ready to go");
    expect(result.nextAction.tone).toBe("ready");
  });
});

describe("buildIntakePlanPreview", () => {
  const channels = [
    {
      key: "email",
      name: "Weekly Email",
      tierEligibility: [1, 2],
      defaultPublishOffsetDays: 21,
      productionLeadDays: 7,
    },
    {
      key: "stage",
      name: "Stage Announcement",
      tierEligibility: [1],
      defaultPublishOffsetDays: 7,
      productionLeadDays: 3,
    },
  ];

  it("explains the channel set from the selected audience", () => {
    const preview = buildIntakePlanPreview({
      audience: "ministry",
      eventDate: "2026-08-30",
      registrationCloseDate: "",
      needsRegistration: false,
      channels,
      today: new Date(2026, 6, 26),
    });

    expect(preview.audienceLabel).toBe("Ministry audience");
    expect(preview.channels.map((channel) => channel.key)).toEqual(["email"]);
    expect(preview.reason).toContain("ministry");
  });

  it("warns when normal channel lead time is no longer available", () => {
    const preview = buildIntakePlanPreview({
      audience: "whole_church",
      eventDate: "2026-08-05",
      registrationCloseDate: "",
      needsRegistration: false,
      channels,
      today: new Date(2026, 6, 26),
    });

    expect(preview.leadWarning).toContain("normally need");
  });
});

describe("buildCopyStarters", () => {
  it("keeps short display copy focused on the title and next step", () => {
    const [starter] = buildCopyStarters({
      title: "Summer Picnic",
      description: "Food, games, and time together after service.",
      nextStep: "Bring a side dish.",
      channels: [{ key: "loop", name: "Sunday Loop" }],
    });

    expect(starter.content).toBe("Summer Picnic\nBring a side dish.");
    expect(starter.recommendedLimit).toBe(120);
  });
});
