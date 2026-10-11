import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
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

afterEach(() => vi.restoreAllMocks());

describe("US-013 competition details", () => {
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
      .send({ name: "Existing Competition", date: "2026-10-10" });

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
