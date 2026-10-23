import { describe, expect, it } from "vitest";
import { EMPTY_DISCOVERY_FILTERS, discoverySearch, readDiscoveryFilters } from "./discoveryApi.ts";
import { validateDiscoveryFilters } from "./discoveryValidation.ts";

describe("US025 discovery query validation", () => {
  it("accepts defaults and decimal distances within the supported range", () => {
    expect(validateDiscoveryFilters(EMPTY_DISCOVERY_FILTERS)).toEqual({});
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, near: "saved", radiusKm: "1.5", from: "2028-02-29", to: "2028-03-01" })).toEqual({});
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
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, near: "current", radiusKm: "51" }, 50)).toEqual({ radiusKm: "Choose a distance from 1 to 50 km." });
  });
  it("needs a starting point for a distance and for closest first", () => {
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, near: "", radiusKm: "10" })).toEqual({ radiusKm: "Choose a starting point first." });
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, sort: "closest" })).toEqual({ sort: "Choose a starting point to sort by distance." });
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, near: "current", radiusKm: "10", sort: "closest" })).toEqual({});
  });
  it.each([
    ["a starting point it doesn't know", { near: "home" }, "near", "Choose a starting point."],
    ["a place without its point", { near: "place", place: "Union Station" }, "near", "Choose a place from the suggestions or on the map."],
    ["a place with a point off the map", { near: "place", lat: "91", lng: "-79.38" }, "near", "Choose a place from the suggestions or on the map."],
    ["an order it doesn't offer", { sort: "nearest" }, "sort", "Choose an order from the list."],
  ])("rejects %s", (_, changes, field, message) => {
    expect(validateDiscoveryFilters({ ...EMPTY_DISCOVERY_FILTERS, ...changes })).toEqual({ [field]: message });
  });
  it("refuses the saved location only once the account is known to have none", () => {
    const fromSaved = { ...EMPTY_DISCOVERY_FILTERS, near: "saved" };
    expect(validateDiscoveryFilters(fromSaved)).toEqual({});
    expect(validateDiscoveryFilters(fromSaved, 200, false)).toEqual({ near: "Your account doesn't have a saved location. Choose another starting point." });
  });
  it("keeps where the Climber is out of the address, and a place's point and name in it", () => {
    const here = { ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.653", lng: "-79.383", radiusKm: "10" };
    expect(discoverySearch(here).toString()).toBe("near=current&radiusKm=10");
    const place = { ...EMPTY_DISCOVERY_FILTERS, near: "place", lat: "43.6455", lng: "-79.3807", place: "Union Station" };
    expect(discoverySearch(place).toString()).toBe("near=place&lat=43.6455&lng=-79.3807&place=Union+Station");
    expect(readDiscoveryFilters(discoverySearch(place))).toEqual(place);
  });
  it("keeps a shuffle number only with the random order, and drops soonest first", () => {
    expect(discoverySearch({ ...EMPTY_DISCOVERY_FILTERS, sort: "random", seed: "42" }).toString()).toBe("sort=random&seed=42");
    expect(discoverySearch({ ...EMPTY_DISCOVERY_FILTERS, sort: "joined", seed: "42" }).toString()).toBe("sort=joined");
    expect(discoverySearch({ ...EMPTY_DISCOVERY_FILTERS, sort: "soonest" }).toString()).toBe("");
  });
  it.each(["0", "abc", "1000000000", "-5", "4.2", "042"])("leaves out a shuffle number %s that isn't one, so the day's order is used", seed => {
    const filters = readDiscoveryFilters(new URLSearchParams({ sort: "random", seed }));
    expect(filters).toEqual({ ...EMPTY_DISCOVERY_FILTERS, sort: "random" });
    expect(validateDiscoveryFilters(filters)).toEqual({});
    expect(discoverySearch(filters).toString()).toBe("sort=random");
  });
  it("keeps a shuffle number from 1 to 999999999", () => {
    expect(readDiscoveryFilters(new URLSearchParams("sort=random&seed=1")).seed).toBe("1");
    expect(readDiscoveryFilters(new URLSearchParams("sort=random&seed=999999999")).seed).toBe("999999999");
  });
  it("reads a distance saved without a starting point as one from the saved location", () => {
    expect(readDiscoveryFilters(new URLSearchParams("radiusKm=10"))).toEqual({ ...EMPTY_DISCOVERY_FILTERS, near: "saved", radiusKm: "10" });
  });
  it("retains only supported filters and resets pagination for a new search", () => {
    const filters = readDiscoveryFilters(new URLSearchParams("q=+Toronto+&registration=open&page=9&role=ADMIN"));
    expect(discoverySearch(filters).toString()).toBe("q=Toronto&registration=open");
    expect(discoverySearch(filters, 2).get("page")).toBe("2");
    expect(discoverySearch(EMPTY_DISCOVERY_FILTERS).toString()).toBe("");
  });
});
