import { describe, expect, it } from "vitest";
import {
  ROUTE_GRADE_MESSAGE, ROUTE_POINTS_MESSAGE, validateRouteEdit, validateRouteForm, type RouteFormValues,
} from "./routeValidation.ts";

const valid: RouteFormValues = { routeNumber: "A8", name: "Summit Traverse", grade: "V4", pointValue: "25", notes: "" };
describe("US-016 route input validation", () => {
  it("requires the route number, the official grade and the point value, matching the API", () => {
    expect(validateRouteForm({ routeNumber: "  ", name: "", grade: "", pointValue: "", notes: "" }))
      .toEqual({ routeNumber: "Enter the route number.", grade: ROUTE_GRADE_MESSAGE, pointValue: ROUTE_POINTS_MESSAGE });
  });
  it.each(["", "   "])("accepts a route without a name ('%s')", name => {
    expect(validateRouteForm({ ...valid, name })).toEqual({});
  });
  it.each(["V0", "V4", "V17", " V5 "])("accepts official grade %s without changing it", grade => {
    expect(validateRouteForm({ ...valid, grade })).toEqual({});
  });
  it.each(["4", "v4", "V04", "V-1", "V4.5", "V 4", "VB", "V18", "V100", "VInfinity"])("rejects invalid grade %s", grade => {
    expect(validateRouteForm({ ...valid, grade }).grade).toBe(ROUTE_GRADE_MESSAGE);
  });
  it.each(["0", "25", " 25 ", "10000"])("accepts whole points '%s' from 0 to 10,000", pointValue => {
    expect(validateRouteForm({ ...valid, pointValue })).toEqual({});
  });
  it.each(["", "   "])("requires a point value for a new route ('%s')", pointValue => {
    expect(validateRouteForm({ ...valid, pointValue })).toEqual({ pointValue: ROUTE_POINTS_MESSAGE });
  });
  it.each(["-1", "2.5", "10001", "1e3", "NaN", "Infinity", "abc"])("rejects points %s", pointValue => {
    expect(validateRouteForm({ ...valid, pointValue }).pointValue).toBe(ROUTE_POINTS_MESSAGE);
  });
  it("says the points limit in plain words", () => {
    expect(ROUTE_POINTS_MESSAGE).toBe("Enter a whole number of points from 0 to 10,000.");
  });
  it("accepts each text field at its limit and rejects one character more", () => {
    expect(validateRouteForm({ ...valid, routeNumber: "9".repeat(40), name: "n".repeat(50), notes: "z".repeat(2000) })).toEqual({});
    expect(validateRouteForm({ ...valid, routeNumber: "9".repeat(41), name: "n".repeat(51), notes: "z".repeat(2001) })).toEqual({
      routeNumber: "Use 40 characters or fewer.", name: "Use 50 characters or fewer.", notes: "Use 2000 characters or fewer.",
    });
  });
});

describe("US-017 route edit validation", () => {
  const route = { routeNumber: "A8", name: "" };
  it("validates the editable fields of a saved route", () => {
    expect(validateRouteEdit({ ...route, grade: "V4", pointValue: "", notes: "" })).toEqual({});
  });
  it.each(["V0", "V17", " V5 "])("accepts official grade %s unchanged", grade => {
    expect(validateRouteEdit({ ...route, grade, pointValue: "0", notes: "Route notes" })).toEqual({});
  });
  it.each(["", "v4", "V04", "V-1", "V4.5", "V18"])("rejects invalid official grade '%s'", grade => {
    expect(validateRouteEdit({ ...route, grade, pointValue: "25", notes: "" }).grade).toBe(ROUTE_GRADE_MESSAGE);
  });
  it.each(["", "0", "25", "10000"])("accepts whole or omitted points '%s'", pointValue => {
    expect(validateRouteEdit({ ...route, grade: "V4", pointValue, notes: "" })).toEqual({});
  });
  it.each(["-1", "2.5", "10001", "Infinity", "abc"])("rejects points %s", pointValue => {
    expect(validateRouteEdit({ ...route, grade: "V4", pointValue, notes: "" }).pointValue).toBe(ROUTE_POINTS_MESSAGE);
  });
  it("limits notes to 2000 characters after trimming", () => {
    expect(validateRouteEdit({ ...route, grade: "V4", pointValue: "", notes: ` ${"z".repeat(2000)} ` })).toEqual({});
    expect(validateRouteEdit({ ...route, grade: "V4", pointValue: "", notes: "z".repeat(2001) }).notes).toBe("Use 2000 characters or fewer.");
  });
  it("requires a route number and limits it and the name like Add route", () => {
    const valid = { grade: "V4", pointValue: "25", notes: "" };
    expect(validateRouteEdit({ ...valid, routeNumber: ` ${"9".repeat(40)} `, name: "n".repeat(50) })).toEqual({});
    expect(validateRouteEdit({ ...valid, routeNumber: "  ", name: "" })).toEqual({ routeNumber: "Enter the route number." });
    expect(validateRouteEdit({ ...valid, routeNumber: "9".repeat(41), name: "n".repeat(51) })).toEqual({
      routeNumber: "Use 40 characters or fewer.", name: "Use 50 characters or fewer.",
    });
  });
  it("skips fields that still match the saved values, like the API", () => {
    const saved = { routeNumber: "9".repeat(41), name: "n".repeat(51), grade: "V18", pointValue: "2.5", notes: "z".repeat(2001) };
    expect(validateRouteEdit(saved, saved)).toEqual({});
    expect(validateRouteEdit({ ...saved, routeNumber: ` ${saved.routeNumber} `, grade: " V18 ", notes: "Shorter notes" }, saved)).toEqual({});
    expect(validateRouteEdit({ routeNumber: "", name: "n".repeat(52), grade: "V19", pointValue: "-1", notes: "z".repeat(2002) }, saved)).toEqual({
      routeNumber: "Enter the route number.", name: "Use 50 characters or fewer.",
      grade: ROUTE_GRADE_MESSAGE, pointValue: ROUTE_POINTS_MESSAGE, notes: "Use 2000 characters or fewer.",
    });
  });
});
