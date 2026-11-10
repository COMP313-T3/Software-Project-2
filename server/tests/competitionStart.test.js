import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { errorBody } from "../src/realtime/socketAuth.js";
import { AppError } from "../src/utils/AppError.js";
import {
  START_TIME_PATTERN,
  assertStarted,
  competitionNotStarted,
  hasStarted,
  startFields,
  startTimeOf,
  startsAtOf,
} from "../src/utils/competitionStart.js";

const day = (date) => new Date(`${date}T00:00:00Z`);
const competition = (date, startTime, status = "PUBLISHED") => ({ date: day(date), startTime, status });

describe("when a competition starts (FR-004, AC-021)", () => {
  it.each([
    ["in standard time", "2026-11-14", "10:00", "2026-11-14T15:00:00.000Z"],
    ["in daylight time", "2026-07-04", "10:00", "2026-07-04T14:00:00.000Z"],
    ["late in the evening, which is the next day in UTC", "2026-12-31", "23:59", "2027-01-01T04:59:00.000Z"],
    ["at midnight", "2026-11-14", "00:00", "2026-11-14T05:00:00.000Z"],
  ])("is its date at its start time in Toronto, %s", (_case, date, startTime, startsAt) => {
    expect(startsAtOf(competition(date, startTime)).toISOString()).toBe(startsAt);
  });

  it.each([
    ["the morning the clocks go back, before the change", "2026-11-01", "00:30", "2026-11-01T04:30:00.000Z"],
    ["an hour the clocks repeat, the first time it comes", "2026-11-01", "01:30", "2026-11-01T05:30:00.000Z"],
    ["the morning the clocks go back, after the change", "2026-11-01", "03:00", "2026-11-01T08:00:00.000Z"],
    ["the morning the clocks go forward, before the change", "2027-03-14", "01:00", "2027-03-14T06:00:00.000Z"],
    ["an hour the clocks skip, moved past the gap", "2027-03-14", "02:30", "2027-03-14T07:30:00.000Z"],
    ["the morning the clocks go forward, after the change", "2027-03-14", "03:30", "2027-03-14T07:30:00.000Z"],
    ["later the day the clocks go forward", "2027-03-14", "10:00", "2027-03-14T14:00:00.000Z"],
  ])("keeps the time on Toronto's clock on %s", (_case, date, startTime, startsAt) => {
    expect(startsAtOf(competition(date, startTime)).toISOString()).toBe(startsAt);
  });

  it.each([undefined, null, "", "25:00", "10:60", "9:30", "10:00:00", 1000])(
    "counts a competition without a usable start time (%j) as starting when its day begins",
    (startTime) => {
      const saved = competition("2026-11-14", startTime);
      expect(startTimeOf(saved)).toBeNull();
      expect(startsAtOf(saved).toISOString()).toBe("2026-11-14T05:00:00.000Z");
    },
  );

  it("has started from its start on, to the millisecond", () => {
    const saved = competition("2026-11-14", "10:00");
    expect(hasStarted(saved, new Date("2026-11-14T14:59:59.999Z"))).toBe(false);
    expect(hasStarted(saved, new Date("2026-11-14T15:00:00.000Z"))).toBe(true);
    expect(hasStarted(saved, new Date("2026-11-20T00:00:00.000Z"))).toBe(true);
  });

  it("gives a page the start time, the moment, and whether it has come", () => {
    const saved = competition("2026-11-14", "10:00");
    expect(startFields(saved, new Date("2026-11-14T14:00:00Z"))).toEqual({
      startTime: "10:00",
      startsAt: "2026-11-14T15:00:00.000Z",
      started: false,
    });
    expect(startFields(saved, new Date("2026-11-14T15:00:00Z")).started).toBe(true);
    expect(startFields(competition("2026-11-14"), new Date("2026-11-14T06:00:00Z"))).toEqual({
      startTime: null,
      startsAt: "2026-11-14T05:00:00.000Z",
      started: true,
    });
  });

  it.each(["00:00", "09:05", "10:00", "18:30", "23:59"])("accepts %s as a start time", (time) => {
    expect(START_TIME_PATTERN.test(time)).toBe(true);
  });

  it.each(["24:00", "10:60", "9:30", "10:0", "10:00:00", "10.00", " 10:00", "10:00 AM", ""])(
    "doesn't accept %j as a start time",
    (time) => {
      expect(START_TIME_PATTERN.test(time)).toBe(false);
    },
  );

  it("the Competition model saves a start time as HH:mm only, and doesn't require one", () => {
    const base = {
      gymId: "6650000000000000000000a1",
      name: "Fall Boulder Bash",
      date: day("2026-11-14"),
      location: "Toronto",
      capacity: 40,
      createdBy: "6650000000000000000000e9",
    };
    expect(new Competition(base).validateSync()).toBeUndefined();
    expect(new Competition({ ...base, startTime: "10:00" }).validateSync()).toBeUndefined();
    expect(new Competition({ ...base, startTime: "10am" }).validateSync()?.errors.startTime).toBeDefined();
  });
});

describe("holding a Climber back until the start (AC-021)", () => {
  const before = new Date("2026-11-14T14:00:00Z");
  const after = new Date("2026-11-14T15:00:00Z");

  it("refuses with 409 COMPETITION_NOT_STARTED, a readable start, and the moment for a countdown", () => {
    const error = competitionNotStarted(competition("2026-11-14", "10:00"));
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("COMPETITION_NOT_STARTED");
    expect(error.message).toBe(
      "This competition starts on November 14, 2026 at 10:00 a.m. Your scorecard and the leaderboard open then.",
    );
    expect(error.details).toEqual({ startsAt: "2026-11-14T15:00:00.000Z" });
  });

  it("says what opens, and reads the evening and midnight as people say them", () => {
    expect(competitionNotStarted(competition("2026-07-04", "18:30"), "The leaderboard opens then.").message).toBe(
      "This competition starts on July 4, 2026 at 6:30 p.m. The leaderboard opens then.",
    );
    expect(competitionNotStarted(competition("2026-07-04")).message).toContain("on July 4, 2026 at 12:00 a.m. Your");
  });

  it("holds back a PUBLISHED competition until its start, and not after", () => {
    const saved = competition("2026-11-14", "10:00");
    expect(() => assertStarted(saved, { now: before })).toThrow(AppError);
    expect(() => assertStarted(saved, { now: after })).not.toThrow();
  });

  it.each(["CANCELLED", "DRAFT"])("never holds back a %s competition", (status) => {
    expect(() => assertStarted(competition("2026-11-14", "10:00", status), { now: before })).not.toThrow();
  });

  it("answers the refusal with its details over HTTP and over a socket", async () => {
    const app = express();
    app.get("/held", () => {
      throw competitionNotStarted(competition("2026-11-14", "10:00"));
    });
    app.get("/plain", () => {
      throw new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
    });
    app.use(errorHandler);

    const held = await request(app).get("/held");
    const plain = await request(app).get("/plain");

    expect(held.status).toBe(409);
    expect(held.body).toEqual({
      error: "COMPETITION_NOT_STARTED",
      message:
        "This competition starts on November 14, 2026 at 10:00 a.m. Your scorecard and the leaderboard open then.",
      details: { startsAt: "2026-11-14T15:00:00.000Z" },
    });
    expect(plain.body).toEqual({ error: "COMPETITION_NOT_FOUND", message: "Competition not found." });
    expect(errorBody(competitionNotStarted(competition("2026-11-14", "10:00")))).toEqual(held.body);
    expect(errorBody(new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found."))).toEqual(plain.body);
    expect(errorBody(new Error("database password"))).toEqual({
      error: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    });
  });
});
