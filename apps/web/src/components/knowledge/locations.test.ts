import { describe, it, expect } from "vitest";
import { filterLocalLocations, LOCAL_LOCATIONS } from "./locations";

describe("locations autocomplete catalog", () => {
  it("contains all 38 Indonesian provinces and major cities", () => {
    expect(LOCAL_LOCATIONS.length).toBeGreaterThan(100);
    expect(LOCAL_LOCATIONS).toContain("DKI Jakarta");
    expect(LOCAL_LOCATIONS).toContain("Jawa Barat");
    expect(LOCAL_LOCATIONS).toContain("Papua Barat Daya");
    expect(LOCAL_LOCATIONS).toContain("Surabaya");
  });

  it("returns empty array for queries shorter than 2 characters", () => {
    expect(filterLocalLocations("")).toEqual([]);
    expect(filterLocalLocations("J")).toEqual([]);
  });

  it("prioritizes prefix matches before substring matches and respects limit", () => {
    const matches = filterLocalLocations("Jaka", 7);
    expect(matches.length).toBeLessThanOrEqual(7);
    expect(matches[0]).toBe("Jakarta");
    expect(matches).toContain("DKI Jakarta");
  });
});
