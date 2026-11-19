import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPETITION_STATUS } from "../src/constants/competitions.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { User } from "../src/models/User.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";
const COMPETITION_ID = "507f1f77bcf86cd799439013";
const AUTH = "Bearer e30.e30.signature";
const SAVED_SETTINGS = {
  logo: "https://cdn.example.test/gym.png",
  background: "mountains",
  sponsors: ["https://cdn.example.test/sponsor.png"],
};

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
        userId: USER_ID,
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
  api.use("/api/competitions", createCompetitionRoutes({ auth }));
  api.use(errorHandler);
  return api;
}

function authorizedGym() {
  vi.spyOn(User, "exists").mockResolvedValue({ _id: USER_ID });
  vi.spyOn(Gym, "find").mockReturnValue(query([{ _id: GYM_ID }]));
}

function managedCompetition(displaySettings = SAVED_SETTINGS) {
  return {
    _id: COMPETITION_ID,
    gymId: GYM_ID,
    displaySettings,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("US-021 display settings API", () => {
  it("returns saved settings publicly for a published competition without caching", async () => {
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query(managedCompetition(SAVED_SETTINGS)),
    );
    vi.spyOn(Gym, "findOne").mockReturnValue(query({ _id: GYM_ID }));

    const response = await request(app()).get(
      `/api/competitions/${COMPETITION_ID}/display-settings`,
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      competitionId: COMPETITION_ID,
      displaySettings: SAVED_SETTINGS,
    });
    expect(Competition.findOne).toHaveBeenCalledWith(
      { _id: COMPETITION_ID, status: COMPETITION_STATUS.PUBLISHED },
      "displaySettings gymId",
    );
  });

  it("does not expose display settings for a competition at an inactive gym", async () => {
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query(managedCompetition(SAVED_SETTINGS)),
    );
    vi.spyOn(Gym, "findOne").mockReturnValue(query(null));

    const response = await request(app()).get(
      `/api/competitions/${COMPETITION_ID}/display-settings`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Gym.findOne).toHaveBeenCalledWith(
      { _id: GYM_ID, status: "ACTIVE" },
      "_id",
    );
  });

  it("returns 404 instead of exposing draft settings publicly", async () => {
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));

    const response = await request(app()).get(
      `/api/competitions/${COMPETITION_ID}/display-settings`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
  });

  it("returns empty settings for an authorized Gym Admin when no settings are saved", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(managedCompetition(null)));

    const response = await request(app())
      .get(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
      .set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({
      competitionId: COMPETITION_ID,
      displaySettings: { logo: null, background: null, sponsors: [] },
    });
    const [filter, projection] = Competition.findOne.mock.calls[0];
    expect(filter._id).toBe(COMPETITION_ID);
    expect(filter.gymId.$in).toEqual([GYM_ID]);
    expect(projection).toBe("displaySettings");
  });

  it("replaces and persists image references only for the selected competition", async () => {
    authorizedGym();
    const findManaged = vi
      .spyOn(Competition, "findOne")
      .mockReturnValue(query({ _id: COMPETITION_ID, gymId: GYM_ID }));
    let persisted = SAVED_SETTINGS;
    const update = vi
      .spyOn(Competition, "findOneAndUpdate")
      .mockImplementation((filter, changes) => {
        expect(filter).toEqual({ _id: COMPETITION_ID, gymId: GYM_ID });
        persisted = changes.$set.displaySettings;
        return query(managedCompetition(persisted));
      });

    const response = await request(app())
      .put(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
      .set("Authorization", AUTH)
      .send(SAVED_SETTINGS);

    expect(response.status).toBe(200);
    expect(response.body.displaySettings).toEqual(SAVED_SETTINGS);
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][2]).toEqual({
      returnDocument: "after",
      runValidators: true,
      projection: "displaySettings",
    });

    findManaged.mockReturnValue(query(managedCompetition(persisted)));
    const reload = await request(app())
      .get(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
      .set("Authorization", AUTH);
    expect(reload.status).toBe(200);
    expect(reload.body.displaySettings).toEqual(SAVED_SETTINGS);
  });

  it("rejects malformed or incomplete settings without writing them", async () => {
    authorizedGym();
    const findCompetition = vi.spyOn(Competition, "findOne");
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .put(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
      .set("Authorization", AUTH)
      .send({ logo: "javascript:alert(1)", background: "", sponsors: "not-an-array" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(findCompetition).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("only accepts one of TopSend's own backgrounds, so nothing is uploaded", async () => {
    authorizedGym();
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    for (const background of ["https://cdn.example.test/wall.jpg", "competition/backgrounds/autumn", "MOUNTAINS"]) {
      const response = await request(app())
        .put(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
        .set("Authorization", AUTH)
        .send({ ...SAVED_SETTINGS, background });

      expect(response.status, background).toBe(400);
      expect(response.body.fields).toEqual({
        background: "Choose one of TopSend's backgrounds, or none for plain white.",
      });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["mountains", "sea", "jungle", "forest", "desert", "night", null])(
    "saves the %s background",
    async (background) => {
      authorizedGym();
      vi.spyOn(Competition, "findOne").mockReturnValue(query({ _id: COMPETITION_ID, gymId: GYM_ID }));
      vi.spyOn(Competition, "findOneAndUpdate").mockImplementation((_filter, changes) =>
        query(managedCompetition(changes.$set.displaySettings)),
      );

      const response = await request(app())
        .put(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
        .set("Authorization", AUTH)
        .send({ ...SAVED_SETTINGS, background });

      expect(response.status).toBe(200);
      expect(response.body.displaySettings.background).toBe(background);
    },
  );

  it("shows a background saved as an image address as the plain default", async () => {
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query(managedCompetition({ ...SAVED_SETTINGS, background: "https://cdn.example.test/wall.jpg" })),
    );
    vi.spyOn(Gym, "findOne").mockReturnValue(query({ _id: GYM_ID }));

    const response = await request(app()).get(`/api/competitions/${COMPETITION_ID}/display-settings`);

    expect(response.status).toBe(200);
    expect(response.body.displaySettings).toEqual({ ...SAVED_SETTINGS, background: null });
  });

  it("does not allow a Gym Admin to update a competition outside their gyms", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .put(`/api/gym-admin/competitions/${COMPETITION_ID}/display-settings`)
      .set("Authorization", AUTH)
      .send(SAVED_SETTINGS);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });
});
