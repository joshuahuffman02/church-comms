import { describe, it, expect } from "vitest";
import { parseChannelUpdate } from "@/lib/channel-form";

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("parseChannelUpdate", () => {
  it("parses a full windowed form", () => {
    const r = parseChannelUpdate(fd([
      ["type", "windowed"], ["name", "Facebook"], ["offset", "21"], ["lead", "7"],
      ["active", "on"], ["color", "#378add"], ["weekday", "0"], ["weekday", "3"],
      ["tier", "1"], ["tier", "2"], ["cap", "3"], ["capacity", ""], ["productionNotes", " hi "],
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name).toBe("Facebook");
    expect(r.data.type).toBe("windowed");
    expect(r.data.defaultPublishOffsetDays).toBe(21);
    expect(r.data.productionLeadDays).toBe(7);
    expect(r.data.active).toBe(true);
    expect(r.data.color).toBe("#378add");
    expect(r.data.cadence).toEqual({ weekdays: [0, 3] });
    expect(r.data.tierEligibility).toEqual([1, 2]);
    expect(r.data.frequencyCap).toBe(3);
    expect(r.data.capacity).toBeNull();
    expect(r.data.productionNotes).toBe("hi");
  });

  it("rejects an unknown type and a blank name", () => {
    expect(parseChannelUpdate(fd([["type", "nope"], ["name", "x"]])).ok).toBe(false);
    expect(parseChannelUpdate(fd([["type", "windowed"], ["name", "  "]])).ok).toBe(false);
  });

  it("does not write cadence/cap/lockLead when their fields are absent (no clobber)", () => {
    const r = parseChannelUpdate(fd([["type", "one_shot"], ["name", "Bulletin"], ["offset", "5"], ["lead", "2"]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("cadence" in r.data).toBe(false);
    expect("frequencyCap" in r.data).toBe(false);
    expect("lockLeadDays" in r.data).toBe(false);
  });

  it("defaults empty tiers to all three and empty weekdays to Sunday", () => {
    const r = parseChannelUpdate(fd([["type", "windowed"], ["name", "X"], ["offset", "1"], ["lead", "1"]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.tierEligibility).toEqual([1, 2, 3]);
    expect(r.data.cadence).toEqual({ weekdays: [0] });
  });

  it("accepts single_weekday and writes its weekday cadence (no cap/lockLead)", () => {
    const r = parseChannelUpdate(fd([
      ["type", "single_weekday"], ["name", "Facebook"], ["offset", "14"], ["lead", "3"],
      ["weekday", "5"], ["tier", "1"], ["capacity", ""],
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.type).toBe("single_weekday");
    expect(r.data.cadence).toEqual({ weekdays: [5] });
    expect("frequencyCap" in r.data).toBe(false);
    expect("lockLeadDays" in r.data).toBe(false);
  });

  it("clears optional numbers to null and reads lockLead for dated_instance", () => {
    const r = parseChannelUpdate(fd([
      ["type", "dated_instance"], ["name", "Service slide"], ["offset", "21"], ["lead", "7"],
      ["weekday", "0"], ["lockLead", ""], ["capacity", "3"], ["cap", ""],
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.lockLeadDays).toBeNull();
    expect(r.data.capacity).toBe(3);
    expect(r.data.frequencyCap).toBeNull();
  });
});
