import { describe, expect, it } from "vitest";
import {
  channelProductionRequirements,
  productionNeeds,
} from "../src/lib/production-needs";

describe("channel production requirements", () => {
  it("uses channel-specific production language", () => {
    expect(channelProductionRequirements("Announcement Video (Top 3)")).toEqual({
      copy: "Video script",
      visual: "Video segment",
    });
    expect(channelProductionRequirements("Sunday Loop")).toEqual({
      copy: "Slide copy",
      visual: "Slide graphic",
    });
    expect(channelProductionRequirements("Facebook")).toEqual({
      copy: "Post copy",
      visual: "Graphic or photo",
    });
  });
});

describe("production needs", () => {
  it("directs a new request toward the missing brief, action, owner, and plan", () => {
    expect(productionNeeds({
      requestId: "request-1",
      ownerReady: false,
      description: "",
      nextStepText: "",
      nextStepUrl: "",
      hasChannelPlan: false,
    })).toEqual([
      { key: "owner", label: "Owner", href: "/requests/request-1#event-owner" },
      { key: "blurb", label: "Short blurb", href: "/requests/request-1#event-overview" },
      { key: "call-to-action", label: "Call to action", href: "/requests/request-1#event-overview" },
      { key: "channel-plan", label: "Channel plan", href: "/requests/request-1#channels" },
    ]);
  });

  it("names the missing ingredients for a video piece", () => {
    expect(productionNeeds({
      requestId: "request-2",
      channelName: "Announcement Video (Top 3)",
      pieceStatus: "to_design",
      ownerReady: true,
      description: "A useful event description that is not yet a video script.",
      hasChannelCopy: false,
      hasCreativeAsset: false,
      nextStepText: "Visit the welcome desk",
    })).toEqual([
      { key: "copy", label: "Video script", href: "/requests/request-2#message-plan" },
      { key: "visual", label: "Video segment", href: "/requests/request-2#pieces" },
    ]);
  });

  it("asks for proof approval instead of claiming finished creative is missing", () => {
    expect(productionNeeds({
      requestId: "request-3",
      channelName: "Facebook",
      pieceStatus: "proof",
      ownerReady: true,
      hasChannelCopy: false,
      hasCreativeAsset: false,
      nextStepText: "Register",
      registrationUrl: "https://example.com/register",
      needsRegistration: true,
    })).toEqual([
      { key: "proof", label: "Proof approval", href: "/requests/request-3#pieces" },
    ]);
  });

  it("uses registration as the actionable destination when it is required", () => {
    expect(productionNeeds({
      requestId: "request-4",
      channelName: "Church App",
      pieceStatus: "in_progress",
      ownerReady: true,
      hasChannelCopy: true,
      hasCreativeAsset: true,
      needsRegistration: true,
      registrationUrl: "",
    })).toContainEqual({
      key: "registration-link",
      label: "Registration link",
      href: "/requests/request-4#event-overview",
    });
  });
});
