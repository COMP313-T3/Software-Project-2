import { describe, expect, it } from "vitest";
import { competitionDateBounds, validateCompetitionForm, type CompetitionFormValues } from "./competitionValidation.ts";

// 00:30 UTC on October 11 is still October 10 in Toronto.
const now = new Date("2026-10-11T00:30:00Z");
const gyms = [{ _id: "north" }];
const valid: CompetitionFormValues = {
  gymId: "north", name: "Autumn Open", date: "2026-11-14", capacity: "80",
  location: "Toronto", description: "Local bouldering event", deductionPercent: "20", maxAttempts: "5",
};

describe("US-012 competition form validation", () => {
  it("accepts the five fields and optional blank venue/description", () => {
    expect(validateCompetitionForm(valid, gyms, now)).toEqual({});
    expect(validateCompetitionForm({ ...valid, name: " Autumn Open ", location: " ", description: "" }, gyms, now)).toEqual({});
  });
  it("uses Toronto's calendar day at the UTC date boundary", () => {
    expect(competitionDateBounds(now)).toEqual({ min: "2026-10-10", max: "2028-10-10" });
    expect(validateCompetitionForm({ ...valid, date: "2026-10-10" }, gyms, now)).toEqual({});
  });
  it("accepts the date range endpoints and rejects dates outside them", () => {
    expect(validateCompetitionForm({ ...valid, date: "2028-10-10" }, gyms, now)).toEqual({});
    expect(validateCompetitionForm({ ...valid, date: "2026-10-09" }, gyms, now).date).toBe("Choose today or a later date.");
    expect(validateCompetitionForm({ ...valid, date: "2028-10-11" }, gyms, now).date).toBe("Choose a date within 2 years.");
  });
  it.each(["2027-02-29", "2026-02-30", "2026-13-01", "2026-11-31", "2026-1-01", "not-a-date"])(
    "rejects the impossible or malformed date %s", date => {
      expect(validateCompetitionForm({ ...valid, date }, gyms, now).date).toBe("Enter a real date, like 2026-11-14.");
    },
  );
  it("accepts a real leap day and uses the API's leap-year upper bound", () => {
    expect(validateCompetitionForm({ ...valid, date: "2028-02-29" }, gyms, now)).toEqual({});
    expect(competitionDateBounds(new Date("2028-02-29T17:00:00Z")).max).toBe("2030-03-01");
  });
  it("reports required fields and accepts only assigned gyms when a choice is needed", () => {
    expect(validateCompetitionForm({ ...valid, name: " ", date: "", capacity: "" }, gyms, now)).toMatchObject({
      name: "Enter the competition name.", date: "Choose the event date.", capacity: expect.any(String),
    });
    const multiple = [...gyms, { _id: "south" }];
    expect(validateCompetitionForm({ ...valid, gymId: "" }, multiple, now).gymId).toBeTruthy();
    expect(validateCompetitionForm({ ...valid, gymId: "another-gym" }, multiple, now).gymId).toBeTruthy();
    expect(validateCompetitionForm({ ...valid, gymId: "south" }, multiple, now)).toEqual({});
  });
  it.each(["0", "-1", "1.5", "1001", "abc", "Infinity", "NaN", " "])("rejects capacity %s", capacity => {
    expect(validateCompetitionForm({ ...valid, capacity }, gyms, now).capacity).toBe("Enter the maximum number of participants, from 1 to 1000.");
  });
  it.each(["1", "1000", " 80 "])("accepts whole-number capacity %s", capacity => {
    expect(validateCompetitionForm({ ...valid, capacity }, gyms, now)).toEqual({});
  });
  it("checks the scoring with the API's rules", () => {
    expect(validateCompetitionForm({ ...valid, deductionPercent: "24", maxAttempts: "5" }, gyms, now)).toEqual({});
    expect(validateCompetitionForm({ ...valid, deductionPercent: "", maxAttempts: "21" }, gyms, now)).toEqual({
      deductionPercent: "Enter a whole-number percentage from 0 to 99.", maxAttempts: "Enter a whole number of attempts from 1 to 20.",
    });
    expect(validateCompetitionForm({ ...valid, deductionPercent: "25", maxAttempts: "5" }, gyms, now)).toEqual({
      deductionPercent: "With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores.",
    });
  });
  it("matches the API's trimmed text limits", () => {
    expect(validateCompetitionForm({ ...valid, name: "x".repeat(100), location: "x".repeat(200), description: "x".repeat(2000) }, gyms, now)).toEqual({});
    expect(validateCompetitionForm({ ...valid, name: "x".repeat(101), location: "x".repeat(201), description: "x".repeat(2001) }, gyms, now)).toEqual({
      name: "Use 100 characters or fewer.", location: "Use 200 characters or fewer.", description: "Use 2000 characters or fewer.",
    });
  });
});
