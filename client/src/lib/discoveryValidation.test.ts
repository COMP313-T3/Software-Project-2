import { describe, expect, it } from "vitest";
import { EMPTY_DISCOVERY_FILTERS, discoverySearch, readDiscoveryFilters } from "./discoveryApi.ts";
import { validateDiscoveryFilters } from "./discoveryValidation.ts";

describe("US025 discovery query validation", () => {
  it("accepts defaults and decimal distances within the supported range", () => {
    expect(validateDiscoveryFilters(EMPTY_DISCOVERY_FILTERS)).toEqual({});
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, radiusKm: "1.5", from: "2028-02-29", to: "2028-03-01" })).toEqual({});
  });
  it.each([
    ["q", "x".repeat(101)], ["q", "one two three four five six"], ["gymId", "bad-id"],
    ["from", "2027-02-29"], ["to", "2026-13-01"], ["registration", "closed"],
    ["radiusKm", "0"], ["radiusKm", "201"], ["radiusKm", "NaN"], ["radiusKm", "Infinity"],
  ])("rejects invalid %s filter %s", (field, value) => {
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, [field]: value })).toHaveProperty(field);
  });
  it("validates date order and uses the server's radius limit", () => {
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, from: "2026-12-01", to: "2026-11-01" })).toHaveProperty("to");
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, radiusKm: "51" }, 50)).toHaveProperty("radiusKm");
  });
  it("retains only supported filters and resets pagination for a new search", () => {
    const filters = readDiscoveryFilters(new URLSearchParams("q=+Toronto+&registration=open&page=9&role=ADMIN"));
    expect(discoverySearch(filters).toString()).toBe("q=Toronto&registration=open");
    expect(discoverySearch(filters, 2).get("page")).toBe("2");
    expect(discoverySearch(EMPTY_DISCOVERY_FILTERS).toString()).toBe("");
  });
});
