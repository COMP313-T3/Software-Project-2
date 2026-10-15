import { describe, expect, it } from "vitest";
import { validateRouteForm, type RouteFormValues } from "./routeValidation.ts";

const valid: RouteFormValues = { routeNumber: "A8", name: "Summit Traverse", grade: "V4", pointValue: "", notes: "" };
describe("US-016 route input validation", () => {
  it("requires both identity fields and the official grade, matching the API", () => {
    expect(validateRouteForm({ routeNumber: "  ", name: "", grade: "", pointValue: "", notes: "" }))
      .toEqual({ routeNumber: "Enter the route number.", name: "Enter the route name.", grade: "Enter a V-grade, such as V4." });
  });
  it.each(["V0", "V4", "V18", "V100", " V5 "])("accepts official grade %s without changing it", grade => {
    expect(validateRouteForm({ ...valid, grade })).toEqual({});
  });
  it.each(["4", "v4", "V04", "V-1", "V4.5", "V 4", "VB", "VInfinity"])("rejects invalid grade %s", grade => {
    expect(validateRouteForm({ ...valid, grade }).grade).toBeTruthy();
  });
  it.each(["", "   ", "0", "25", "2.5", "-1"])("accepts optional finite points '%s' using the current contract", pointValue => {
    expect(validateRouteForm({ ...valid, pointValue })).toEqual({});
  });
  it.each(["NaN", "Infinity", "1e309", "abc"])("rejects non-finite point input %s", pointValue => {
    expect(validateRouteForm({ ...valid, pointValue }).pointValue).toBeTruthy();
  });
});
