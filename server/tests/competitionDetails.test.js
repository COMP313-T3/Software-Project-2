import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { parseCalendarDate, torontoToday } from "../src/utils/calendarDates.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const COMPETITION_ID = "507f1f77bcf86cd799439012";
const AUTH = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";
const gyms = [{ _id: GYM_ID, name: "North Gym", location: "Toronto" }];

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app(role = "GYM_ADMIN") {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "507f1f77bcf86cd799439013",
        role,
        sessionId: "session-id",
      })),
    },
    sessions: {
      findActive: vi.fn(async () => ({})),
      recordRequest: vi.fn(async () => ({})),
    },
  };
  const api = express();
  api.use(express.json());
  api.use("/api/gym-admin", createGymAdminRoutes({ auth }));
  api.use(errorHandler);
  return api;
}

function authorizedGyms() {
  vi.spyOn(Gym, "find").mockReturnValue(query(gyms));
}

function competition() {
  return {
    _id: COMPETITION_ID,
    gymId: GYM_ID,
    name: "Autumn Bouldering",
    date: new Date("2026-10-10T00:00:00.000Z"),
    location: "Toronto",
    description: "Local climbing competition",
    capacity: 80,
    registrationStatus: "OPEN",
    status: "PUBLISHED",
  };
}

function daysFromToday(days) {
  const date = parseCalendarDate(torontoToday()).date;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

afterEach(() => vi.restoreAllMocks());

describe("US-013 competition details", () => {
  it("rechecks capacity when a signup committed after the original count", async () => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValueOnce(query({ ...competition(), registrationVersion: 0 })).mockReturnValue(query({ ...competition(), registrationVersion: 1 }));
    vi.spyOn(Registration, "countDocuments").mockResolvedValueOnce(1).mockResolvedValue(2);
    const update = vi.spyOn(Competition, "findOneAndUpdate").mockReturnValue(query(null));
    const r = await request(app()).patch(`/api/gym-admin/competitions/${COMPETITION_ID}`).set("Authorization", AUTH).send({ capacity: 1 });
    expect(r.status).toBe(400); expect(r.body.fields.capacity).toContain("2 confirmed registrations");
    expect(update).toHaveBeenCalledOnce(); expect(update.mock.calls[0][0].registrationVersion).toBe(0);
  });
  it("bounds retries if signup activity repeatedly invalidates a capacity edit", async () => {
    authorizedGyms(); vi.spyOn(Competition, "findOne").mockReturnValue(query({ ...competition(), registrationVersion: 2 }));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(1);
    const update = vi.spyOn(Competition, "findOneAndUpdate").mockReturnValue(query(null));
    const r = await request(app()).patch(`/api/gym-admin/competitions/${COMPETITION_ID}`).set("Authorization", AUTH).send({ capacity: 5 });
    expect(r.status).toBe(503); expect(r.body.error).toBe("COMPETITION_BUSY"); expect(update).toHaveBeenCalledTimes(4);
  });
  it("does not expose the internal registration concurrency token", async () => {
    authorizedGyms(); vi.spyOn(Competition, "findOne").mockReturnValue(query({ ...competition(), registrationVersion: 7 }));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
    const r = await request(app()).get(`/api/gym-admin/competitions/${COMPETITION_ID}`).set("Authorization", AUTH);
    expect(r.status).toBe(200); expect(r.body.registrationVersion).toBeUndefined();
  });
  it("returns only confirmed registrations for the selected competition", async () => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(competition()));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(12);

    const response = await request(app())
      .get(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.registeredClimberCount).toBe(12);
    expect(Registration.countDocuments).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      status: "CONFIRMED",
    });
  });

  it("updates permitted fields only within the Gym Admin's gyms", async () => {
    authorizedGyms();
    const current = competition();
    const updated = { ...current, name: "Updated Bouldering", capacity: 100, registrationStatus: "CLOSED" };
    vi.spyOn(Competition, "findOne").mockReturnValue(query(current));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(12);
    const update = vi.spyOn(Competition, "findOneAndUpdate").mockReturnValue(query(updated));

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ name: updated.name, capacity: updated.capacity, registrationStatus: "CLOSED" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe(updated.name);
    expect(response.body.capacity).toBe(100);
    expect(response.body.registrationStatus).toBe("CLOSED");
    expect(response.body.registeredClimberCount).toBe(12);
    expect(update).toHaveBeenCalledOnce();
    const [filter, changes, options] = update.mock.calls[0];
    expect(filter?._id).toBe(COMPETITION_ID);
    expect(filter?.gymId.$in).toEqual([GYM_ID]);
    expect(changes).toEqual({
      $set: { name: updated.name, capacity: 100, registrationStatus: "CLOSED" },
    });
    expect(options).toEqual({ returnDocument: "after", runValidators: true });
  });

  it("returns readable field feedback when a duplicate name and date is rejected", async () => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(competition()));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(12);
    vi.spyOn(Competition, "findOneAndUpdate").mockReturnValue({
      lean: vi.fn().mockRejectedValue({ code: 11000 }),
    });

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ name: "Existing Competition", date: daysFromToday(30) });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("COMPETITION_EXISTS");
    expect(response.body.fields.name).toBe(response.body.message);
    expect(response.body.message).toBe("Your gym already has a competition with this name on this date.");
  });

  it("does not lower capacity below confirmed registrations", async () => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(competition()));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(12);
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ capacity: 10 });

    expect(response.status).toBe(400);
    expect(response.body.fields.capacity).toContain("12 confirmed registrations");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not disclose or update another gym's competition", async () => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ name: "Changed" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  it("publishes a draft when its registration opens", async () => {
    authorizedGyms();
    const draft = { ...competition(), status: "DRAFT", registrationStatus: "CLOSED" };
    vi.spyOn(Competition, "findOne").mockReturnValue(query(draft));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
    const update = vi
      .spyOn(Competition, "findOneAndUpdate")
      .mockReturnValue(query({ ...draft, status: "PUBLISHED", registrationStatus: "OPEN" }));

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ registrationStatus: "OPEN" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("PUBLISHED");
    expect(update.mock.calls[0][1]).toEqual({
      $set: { registrationStatus: "OPEN", status: "PUBLISHED" },
    });
  });

  it.each([
    ["closing registration on a published competition", "PUBLISHED", { registrationStatus: "CLOSED" }],
    ["reopening registration on a published competition", "PUBLISHED", { registrationStatus: "OPEN" }],
    ["editing a draft without opening registration", "DRAFT", { name: "Renamed Draft" }],
  ])("leaves the status alone when %s", async (_, status, body) => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValue(query({ ...competition(), status }));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
    const update = vi
      .spyOn(Competition, "findOneAndUpdate")
      .mockReturnValue(query({ ...competition(), status, ...body }));

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send(body);

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1]).toEqual({ $set: body });
  });

  it.each([
    ["yesterday", -1, "Choose today or a later date."],
    ["more than two years ahead", 3 * 366, "Choose a date within 2 years."],
  ])("refuses to move a competition to %s", async (_, days, message) => {
    authorizedGyms();
    const lookup = vi.spyOn(Competition, "findOne");
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ date: daysFromToday(days) });

    expect(response.status).toBe(400);
    expect(response.body.fields.date).toBe(message);
    expect(lookup).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts today as the new date", async () => {
    authorizedGyms();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(competition()));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
    const update = vi
      .spyOn(Competition, "findOneAndUpdate")
      .mockReturnValue(query(competition()));

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ date: daysFromToday(0) });

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1].$set.date.toISOString().slice(0, 10)).toBe(daysFromToday(0));
  });

  it("explains an update with nothing to change", async () => {
    authorizedGyms();
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.message).toBe("Change at least one competition detail.");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects other roles and invalid update input", async () => {
    authorizedGyms();
    const update = vi.spyOn(Competition, "findOneAndUpdate");
    const denied = await request(app("CLIMBER"))
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ name: "Changed" });
    const invalid = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({ capacity: 0 });

    expect(denied.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
