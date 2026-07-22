import { describe, expect, it } from "vitest";
import { channelWorkLabel } from "../src/lib/labels";

describe("channelWorkLabel", () => {
  it("names the concrete production work for standard channels", () => {
    expect(channelWorkLabel("Announcement Video (Top 3)")).toBe("Video announcement segment");
    expect(channelWorkLabel("Sunday Loop")).toBe("Sunday Loop slide");
    expect(channelWorkLabel("Facebook")).toBe("Facebook post");
    expect(channelWorkLabel("PV Update Email")).toBe("PV Update Email item");
    expect(channelWorkLabel("Opportunities Table")).toBe("Opportunities Table display");
  });

  it("falls back to a clear piece label for custom channels", () => {
    expect(channelWorkLabel("Lobby TV")).toBe("Lobby TV piece");
  });
});
