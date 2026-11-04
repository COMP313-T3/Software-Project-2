import { describe, expect, it } from "vitest";
import { ApiError } from "./apiClient.ts";
import { entryBlocker, resultClimberName, resultProblem, resultRouteName, validateResultInput } from "./resultEntry.ts";
import { emptyResultEntry, resultOptions } from "../test/resultEntryFixtures.ts";
describe("US-019 result input and display boundaries", () => {
  it.each(["", "-1", "1.5", "1e1", "6", "Infinity", "words"])("rejects invalid attempts %s", attempts => {
    expect(validateResultInput(attempts, false, 5).fields.attempts).toBeTruthy();
  });
  it("accepts the competition's boundaries, including no top after zero attempts", () => {
    expect(validateResultInput("0", false, 5)).toEqual({ input: { attempts: 0, sent: false }, fields: {} });
    expect(validateResultInput(" 5 ", true, 5)).toEqual({ input: { attempts: 5, sent: true }, fields: {} });
    expect(validateResultInput("0", true, 5).fields.attempts).toBe("A send needs at least one attempt.");
  });
  it("uses returned names, divisions and problem information without needing private user details", () => {
    expect(resultClimberName(resultOptions.climbers[0])).toBe("Ada Climber");
    expect(resultRouteName(resultOptions.routes[0])).toBe("Route 1 — Yellow Slab (V2)");
    expect(resultClimberName({ ...resultOptions.climbers[0], firstName: null, lastName: null })).toContain(resultOptions.climbers[0]._id);
  });
  it("honors backend entry restrictions and a changed registration", () => {
    expect(entryBlocker({ ...resultOptions, canRecord: { allowed: false, reasons: ["Not started."] } }, emptyResultEntry)).toBe("Not started.");
    expect(entryBlocker(resultOptions, { ...emptyResultEntry, climber: { ...emptyResultEntry.climber, registrationStatus: "WAITLIST" } })).toContain("confirmed registration");
    expect(entryBlocker(resultOptions, { ...emptyResultEntry, scoring: null })).toContain("scoring");
  });
  it("supports a real zero-point route but refuses missing points", () => {
    expect(entryBlocker(resultOptions, { ...emptyResultEntry, route: { ...emptyResultEntry.route, pointValue: 0 } })).toBe("");
    expect(entryBlocker(resultOptions, { ...emptyResultEntry, route: { ...emptyResultEntry.route, pointValue: null } })).toContain("point value");
  });
  it("uses safe fallbacks for unknown and server errors", () => {
    expect(resultProblem(new ApiError(409, "FULL", "Refresh it."), "Safe")).toBe("Refresh it.");
    expect(resultProblem(new ApiError(500, "PRIVATE", "database secret"), "Safe")).toBe("Safe");
    expect(resultProblem(new Error("private"), "Safe")).toBe("Safe");
  });
});
