import { describe, it, expect } from "vitest";
import {
  buildLoopList,
  buildBulletinCopy,
  buildVideoRunOfShow,
  buildVideoScript,
  type LoopItem,
  type BulletinItem,
  type VideoItem,
  type VideoScriptItem,
} from "../src/lib/exports";
import { atMidnight } from "../src/lib/engine/dates";

const sunday = atMidnight(new Date("2026-06-07"));

describe("buildLoopList", () => {
  const items: LoopItem[] = [
    { title: "Youth Summer Kickoff", nextStepText: "Bring a friend Wednesday at 6pm", ministry: "Youth" },
    { title: "Baptism Sunday", nextStepText: null, ministry: "All-Church" },
  ];

  it("has a header line naming the Sunday and is ProPresenter-friendly", () => {
    const out = buildLoopList(items, sunday);
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^Pre-Service Loop — Sunday /);
    // header carries a human-readable date
    expect(lines[0]).toContain("2026");
  });

  it("numbers one slide per line, falling back to ministry when no next step", () => {
    const out = buildLoopList(items, sunday);
    const lines = out.split("\n").filter(Boolean);
    // header + 2 slide lines
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("1. Youth Summer Kickoff — Bring a friend Wednesday at 6pm");
    expect(lines[2]).toBe("2. Baptism Sunday — All-Church");
  });

  it("still returns a header when there are no items", () => {
    const out = buildLoopList([], sunday);
    expect(out.split("\n")[0]).toMatch(/^Pre-Service Loop — Sunday /);
  });

  it("uses per-touch content when present, replacing the title + next-step line", () => {
    const withContent: LoopItem[] = [
      {
        title: "Youth Summer Kickoff",
        nextStepText: "Bring a friend Wednesday at 6pm",
        ministry: "Youth",
        content: "🔥 Summer Kickoff THIS Friday — meet at the lake!",
      },
      // no content → falls back to title + ministry
      { title: "Baptism Sunday", nextStepText: null, ministry: "All-Church" },
    ];
    const lines = buildLoopList(withContent, sunday).split("\n").filter(Boolean);
    expect(lines[1]).toBe("1. 🔥 Summer Kickoff THIS Friday — meet at the lake!");
    // the custom line does NOT include the event title or its next step
    expect(lines[1]).not.toContain("Youth Summer Kickoff");
    expect(lines[1]).not.toContain("Bring a friend");
    // empty content still falls back
    expect(lines[2]).toBe("2. Baptism Sunday — All-Church");
  });

  it("squashes multi-line touch content into one slide line", () => {
    const out = buildLoopList(
      [{ title: "X", nextStepText: null, ministry: null, content: "line one\nline two" }],
      sunday
    );
    const slide = out.split("\n").filter(Boolean)[1];
    expect(slide).toBe("1. line one line two");
  });
});

describe("buildBulletinCopy", () => {
  const items: BulletinItem[] = [
    { title: "Vacation Bible School", nextStepText: "Register at church.org/vbs", description: "A week of music, games & Bible stories for K–5." },
    { title: "Youth Summer Kickoff", nextStepText: "Bring a friend Wednesday at 6pm", description: null },
  ];

  it("formats a bold title and a one-line blurb per item", () => {
    const out = buildBulletinCopy(items);
    expect(out).toContain("**Vacation Bible School**");
    expect(out).toContain("**Youth Summer Kickoff**");
    // blurb present for the first item (next step preferred / description fallback)
    expect(out).toContain("Register at church.org/vbs");
  });

  it("separates items into their own blocks", () => {
    const out = buildBulletinCopy(items);
    const blocks = out.trim().split(/\n\s*\n/);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startsWith("**Vacation Bible School**")).toBe(true);
  });

  it("collapses any newlines in the blurb to keep it one line", () => {
    const out = buildBulletinCopy([
      { title: "X", nextStepText: "line one\nline two", description: null },
    ]);
    const blurb = out.trim().split("\n")[1];
    expect(blurb).toBe("line one line two");
  });
});

describe("buildVideoRunOfShow", () => {
  const sun = atMidnight(new Date("2026-06-14"));
  const items: VideoItem[] = [
    { title: "Baptism Sunday", nextStepText: "Sign up at church.org/baptism", tier: 1 },
    { title: "Vacation Bible School", nextStepText: "Register at church.org/vbs", tier: 1 },
    { title: "Women's Brunch", nextStepText: "Save your seat", tier: 2 },
    { title: "Membership Lunch", nextStepText: "RSVP to Connections", tier: 3 },
  ];

  it("has a header naming the Sunday and caps at 3 numbered lines", () => {
    const out = buildVideoRunOfShow(items, sun);
    const lines = out.split("\n").filter(Boolean);
    expect(lines[0]).toMatch(/^Announcement Video — Sunday /);
    // header + at most 3 numbered lines
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("1. Baptism Sunday — Sign up at church.org/baptism");
    expect(lines[3]).toBe("3. Women's Brunch — Save your seat");
    // the 4th (tier 3) item is dropped by the cap
    expect(out).not.toContain("Membership Lunch");
  });

  it("returns a header even with no items", () => {
    const out = buildVideoRunOfShow([], sun);
    expect(out.split("\n")[0]).toMatch(/^Announcement Video — Sunday /);
  });
});

describe("buildVideoScript", () => {
  const sun = atMidnight(new Date("2026-06-07"));
  it("wraps the top-3 items in the intro and outro, capping at 3", () => {
    const items: VideoScriptItem[] = [
      { title: "VBS", content: null, description: "A week of fun for kids.", nextStepText: "Register at church.org/vbs" },
      { title: "Baptism", content: null, description: null, nextStepText: "Sign up to be baptized" },
      { title: "Picnic", content: "Bring a dish to share!", description: null, nextStepText: null },
      { title: "Fourth item", content: null, description: "should be dropped", nextStepText: null },
    ];
    const out = buildVideoScript(items, sun, "INTRO LINE", "OUTRO LINE");
    expect(out).toContain("INTRO LINE");
    expect(out).toContain("OUTRO LINE");
    expect(out).toContain("1. VBS");
    expect(out).toContain("A week of fun for kids.");
    expect(out).toContain("Bring a dish to share!"); // per-touch content wins
    expect(out).not.toContain("Fourth item"); // capped at 3
    expect(out.split("\n")[0]).toMatch(/^Announcement Video Script — Sunday /);
  });
});
