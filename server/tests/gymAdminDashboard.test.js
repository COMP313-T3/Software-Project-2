import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { User } from "../src/models/User.js";
import { Registration } from "../src/models/Registration.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { logger } from "../src/utils/logger.js";

const USER_ID = "507f1f77bcf86cd799439013";
const SOMEONE_ELSE = "507f1f77bcf86cd799439014";
const GYM_ID = "507f1f77bcf86cd799439021";
const SECOND_GYM_ID = "507f1f77bcf86cd799439022";
const OTHER_GYM_ID = "507f1f77bcf86cd799439023";
const COMPETITION_ID = "507f1f77bcf86cd799439031";
const AUTH = "Bearer a.b.c";
// 10:30 PM on November 14 in Toronto, when it's already November 15 in UTC.
const NOW = new Date("2026-11-15T03:30:00.000Z");
const TODAY = "2026-11-14T00:00:00.000Z";
const IN_MY_GYM = { $in: [GYM_ID] };
const UPCOMING = {
  gymId: IN_MY_GYM,
  date: { $gte: TODAY },
  status: { $ne: "CANCELLED" },
};
const PAST = { gymId: IN_MY_GYM, date: { $lt: TODAY } };
const EXISTS =
  "Your gym already has a competition with this name on this date.";

const objectId = (value) => new mongoose.Types.ObjectId(value);
const hogtown = {
  _id: objectId(GYM_ID),
  name: "Hogtown Boulders",
  location: "Toronto",
};
const junction = {
  _id: objectId(SECOND_GYM_ID),
  name: "Junction Wall",
  location: "Toronto",
};
const autumnOpen = {
  _id: objectId(COMPETITION_ID),
  gymId: hogtown._id,
  name: "Autumn Open",
  date: new Date("2026-11-20T00:00:00.000Z"),
  location: "Toronto",
  description: "A local bouldering competition.",
  capacity: 80,
  registrationStatus: "OPEN",
  status: "PUBLISHED",
  createdBy: objectId(USER_ID),
};
const winterSend = { name: "Winter Send", date: "2026-12-05", capacity: 40 };

function query(value) {
  const result = {
    collation: vi.fn(() => result),
    sort: vi.fn(() => result),
    skip: vi.fn(() => result),
    limit: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: USER_ID,
        role: "GYM_ADMIN",
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

function send(method, path, body = {}) {
  const call = request(app())[method.toLowerCase()](path);
  call.set("Authorization", AUTH);
  return method === "GET" ? call : call.send(body);
}

/** The active gyms requireGymAdmin finds for the logged-in Gym Admin. */
function runs(...gyms) {
  vi.spyOn(User, "exists").mockResolvedValue({ _id: "account" });
  vi.spyOn(Gym, "find").mockReturnValue(query(gyms));
}

/**
 * A filter as MongoDB receives it. The API runs with sanitizeFilter on, which makes any operator
 * the server didn't mark as trusted a plain value, so a filter that loses its trust stops matching.
 * IDs and dates come out as strings.
 */
function sent(filter) {
  return JSON.parse(JSON.stringify(mongoose.sanitizeFilter(filter)));
}

/** Answers Competition.findOne the way MongoDB would for one stored competition. */
function stored(competition) {
  vi.spyOn(Competition, "findOne").mockImplementation((filter) => {
    const inGyms = filter.gymId.$in.some(
      (id) => String(id) === String(competition.gymId),
    );
    return query(
      String(filter._id) === String(competition._id) && inGyms
        ? competition
        : null,
    );
  });
}

function listed(competitions) {
  vi.spyOn(Competition, "find").mockReturnValue(query(competitions));
  vi.spyOn(Competition, "countDocuments").mockResolvedValue(
    competitions.length,
  );
}

function creates() {
  vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
  return vi
    .spyOn(Competition, "create")
    .mockImplementation(async (details) => new Competition(details));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(logger, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/gym-admin/dashboard (US-011)", () => {
  it("counts and lists only the competitions of the Gym Admin's own active gyms", async () => {
    runs(hogtown);
    vi.spyOn(Competition, "countDocuments")
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
    vi.spyOn(Competition, "find").mockReturnValue(query([autumnOpen]));

    const response = await send("GET", "/api/gym-admin/dashboard");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Gym.find.mock.calls[0][0]).toEqual({
      adminIds: USER_ID,
      status: "ACTIVE",
    });
    expect(
      Competition.countDocuments.mock.calls.map(([filter]) => sent(filter)),
    ).toEqual([UPCOMING, PAST, { ...UPCOMING, status: "DRAFT" }]);
    expect(sent(Competition.find.mock.calls[0][0])).toEqual(UPCOMING);
    expect(response.body).toMatchObject({
      gyms: [{ _id: GYM_ID, name: "Hogtown Boulders" }],
      counts: { upcoming: 6, past: 4, drafts: 1 },
      upcoming: [
        {
          _id: COMPETITION_ID,
          name: "Autumn Open",
          date: "2026-11-20",
          status: "PUBLISHED",
          gym: { _id: GYM_ID, name: "Hogtown Boulders" },
        },
      ],
    });
  });
});

describe("GET /api/gym-admin/competitions (US-011)", () => {
  it.each([
    ["upcoming competitions, by default", "", UPCOMING],
    ["past competitions", "?period=past", PAST],
    ["competitions of every date", "?period=all", { gymId: IN_MY_GYM }],
  ])("lists only the Gym Admin's own gyms' %s", async (_, search, filter) => {
    runs(hogtown);
    listed([autumnOpen]);

    const response = await send("GET", `/api/gym-admin/competitions${search}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(sent(Competition.find.mock.calls[0][0])).toEqual(filter);
    expect(sent(Competition.countDocuments.mock.calls[0][0])).toEqual(filter);
    expect(response.body).toMatchObject({
      competitions: [{ _id: COMPETITION_ID, name: "Autumn Open" }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("narrows the list to the chosen one of the Gym Admin's gyms", async () => {
    runs(hogtown, junction);
    listed([]);

    const response = await send(
      "GET",
      `/api/gym-admin/competitions?gymId=${SECOND_GYM_ID}`,
    );

    expect(response.status).toBe(200);
    expect(sent(Competition.find.mock.calls[0][0]).gymId).toEqual({
      $in: [SECOND_GYM_ID],
    });
  });

  it("answers 404 GYM_NOT_FOUND for a gym the Gym Admin doesn't run", async () => {
    runs(hogtown);
    listed([autumnOpen]);

    const response = await send(
      "GET",
      `/api/gym-admin/competitions?gymId=${OTHER_GYM_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "GYM_NOT_FOUND",
      message: "Gym not found.",
    });
    expect(Competition.find).not.toHaveBeenCalled();
  });
});

describe("GET /api/gym-admin/competitions/:competitionId (US-011)", () => {
  it("opens a competition of the Gym Admin's own gyms with its management tools", async () => {
    runs(hogtown);
    stored(autumnOpen);
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(12);

    const response = await send(
      "GET",
      `/api/gym-admin/competitions/${COMPETITION_ID}`,
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(sent(Competition.findOne.mock.calls[0][0])).toEqual({
      _id: COMPETITION_ID,
      gymId: IN_MY_GYM,
    });
    expect(response.body).toMatchObject({
      _id: COMPETITION_ID,
      name: "Autumn Open",
      gym: { _id: GYM_ID, name: "Hogtown Boulders" },
      registeredClimberCount: 12,
    });
    expect(response.body.tools.map(({ key }) => key)).toEqual(
      expect.arrayContaining(["details", "divisions", "routes"]),
    );
  });

  it("answers 404 for another gym's competition without counting its registrations", async () => {
    runs(hogtown);
    stored({ ...autumnOpen, gymId: objectId(OTHER_GYM_ID) });
    const count = vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);

    const response = await send(
      "GET",
      `/api/gym-admin/competitions/${COMPETITION_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "COMPETITION_NOT_FOUND",
      message: "Competition not found.",
    });
    expect(count).not.toHaveBeenCalled();
  });
});

describe("POST /api/gym-admin/competitions (US-012)", () => {
  it("saves a DRAFT with registration CLOSED in the Gym Admin's gym, created by the logged-in user", async () => {
    runs(hogtown);
    const create = creates();

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      name: "  Winter Send  ",
      status: "PUBLISHED",
      registrationStatus: "OPEN",
      createdBy: SOMEONE_ELSE,
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0]).toMatchObject({
      gymId: hogtown._id,
      name: "Winter Send",
      capacity: 40,
      createdBy: USER_ID,
    });
    expect(response.body).toMatchObject({
      gymId: GYM_ID,
      name: "Winter Send",
      date: "2026-12-05",
      capacity: 40,
      status: "DRAFT",
      registrationStatus: "CLOSED",
      createdBy: USER_ID,
      gym: { _id: GYM_ID, name: "Hogtown Boulders" },
    });
  });

  it("saves the competition in the gym chosen from the Gym Admin's own gyms", async () => {
    runs(hogtown, junction);
    const create = creates();

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      gymId: SECOND_GYM_ID,
    });

    expect(response.status).toBe(201);
    expect(create.mock.calls[0][0].gymId).toBe(junction._id);
    expect(response.body.gym).toEqual({
      _id: SECOND_GYM_ID,
      name: "Junction Wall",
    });
  });

  it("refuses a gym the Gym Admin doesn't run", async () => {
    runs(hogtown, junction);
    const create = creates();

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      gymId: OTHER_GYM_ID,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "GYM_NOT_FOUND",
      message: "Gym not found.",
    });
    expect(Competition.findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("asks a Gym Admin of several gyms which one runs the competition", async () => {
    runs(hogtown, junction);
    const create = creates();

    const response = await send(
      "POST",
      "/api/gym-admin/competitions",
      winterSend,
    );

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({
      gymId: "Choose which of your gyms runs this competition.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 409 COMPETITION_EXISTS when the gym has one with that name on that date, ignoring case", async () => {
    runs(hogtown);
    const create = creates();
    const lookup = query({ _id: objectId(COMPETITION_ID) });
    vi.mocked(Competition.findOne).mockReturnValue(lookup);

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      name: "winter SEND",
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "COMPETITION_EXISTS",
      message: EXISTS,
      fields: { name: EXISTS },
    });
    expect(Competition.findOne.mock.calls[0][0]).toEqual({
      gymId: hogtown._id,
      name: "winter SEND",
      date: new Date("2026-12-05T00:00:00.000Z"),
    });
    expect(lookup.collation).toHaveBeenCalledWith({
      locale: "en",
      strength: 2,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 409 when two saves race and the unique index stops the second", async () => {
    runs(hogtown);
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
    vi.spyOn(Competition, "create").mockRejectedValue({ code: 11000 });

    const response = await send(
      "POST",
      "/api/gym-admin/competitions",
      winterSend,
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("COMPETITION_EXISTS");
  });
});

describe("POST /api/gym-admin/competitions divisions (US-012, US-014)", () => {
  const DIVISIONS =
    "Choose divisions from Open, Beginner, Intermediate, and Advanced.";

  function savesDivisions() {
    return vi
      .spyOn(Division, "insertMany")
      .mockImplementation(async (divisions) =>
        divisions.map((division) => new Division(division)),
      );
  }

  it("saves the chosen divisions with the competition, each once, in the order Create competition lists them", async () => {
    runs(hogtown);
    creates();
    const insert = savesDivisions();

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      divisions: ["Advanced", "Beginner", "Advanced"],
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(insert).toHaveBeenCalledOnce();
    const competitionId = response.body._id;
    expect(
      insert.mock.calls[0][0].map(({ competitionId: id, name }) => ({
        competitionId: String(id),
        name,
      })),
    ).toEqual([
      { competitionId, name: "Beginner" },
      { competitionId, name: "Advanced" },
    ]);
    expect(response.body.divisions.map(({ name }) => name)).toEqual([
      "Beginner",
      "Advanced",
    ]);
    expect(response.body.divisions.every(({ _id }) => /^[a-f\d]{24}$/.test(_id))).toBe(true);
  });

  it("saves an Open division for a competition open to everyone", async () => {
    runs(hogtown);
    creates();
    const insert = savesDivisions();

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      divisions: ["Open"],
    });

    expect(response.status).toBe(201);
    expect(insert.mock.calls[0][0].map(({ name }) => name)).toEqual(["Open"]);
    expect(response.body.divisions.map(({ name }) => name)).toEqual(["Open"]);
  });

  it("saves no divisions when none are chosen", async () => {
    runs(hogtown);
    creates();
    const insert = savesDivisions();

    const response = await send(
      "POST",
      "/api/gym-admin/competitions",
      winterSend,
    );

    expect(response.status).toBe(201);
    expect(insert).not.toHaveBeenCalled();
    expect(response.body.divisions).toEqual([]);
  });

  it.each([
    ["a name that isn't offered", ["Elite"]],
    ["the right name in another case", ["beginner"]],
    ["a single name instead of a list", "Beginner"],
  ])("refuses %s, without saving anything", async (_case, divisions) => {
    runs(hogtown);
    const create = creates();
    const insert = savesDivisions();

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      divisions,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields).toEqual({ divisions: DIVISIONS });
    expect(create).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("takes the competition back when its divisions can't be saved", async () => {
    runs(hogtown);
    const create = creates();
    vi.spyOn(Division, "insertMany").mockRejectedValue(new Error("write failed"));
    const removeDivisions = vi
      .spyOn(Division, "deleteMany")
      .mockResolvedValue({ deletedCount: 0 });
    const removeCompetition = vi
      .spyOn(Competition, "deleteOne")
      .mockResolvedValue({ deletedCount: 1 });
    vi.spyOn(logger, "error").mockImplementation(() => {});

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      divisions: ["Beginner"],
    });

    expect(response.status).toBe(500);
    const competitionId = String((await create.mock.results[0].value)._id);
    expect(removeDivisions).toHaveBeenCalledOnce();
    expect(String(removeDivisions.mock.calls[0][0].competitionId)).toBe(
      competitionId,
    );
    expect(removeCompetition).toHaveBeenCalledOnce();
    expect(String(removeCompetition.mock.calls[0][0]._id)).toBe(competitionId);
    expect(logger.info).not.toHaveBeenCalledWith(
      "Competition created",
      expect.anything(),
    );
  });

  it("still removes the competition when its divisions can't be removed, logs that, and answers with the first error", async () => {
    runs(hogtown);
    const create = creates();
    vi.spyOn(Division, "insertMany").mockRejectedValue(new Error("write failed"));
    vi.spyOn(Division, "deleteMany").mockRejectedValue(new Error("connection lost"));
    const removeCompetition = vi
      .spyOn(Competition, "deleteOne")
      .mockResolvedValue({ deletedCount: 1 });
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      divisions: ["Beginner"],
    });

    expect(response.status).toBe(500);
    const competitionId = String((await create.mock.results[0].value)._id);
    expect(removeCompetition).toHaveBeenCalledOnce();
    expect(String(removeCompetition.mock.calls[0][0]._id)).toBe(competitionId);
    expect(error).toHaveBeenCalledWith(
      "Couldn't take back a competition whose divisions failed",
      { competitionId, removing: "divisions", error: "connection lost" },
    );
    expect(error).toHaveBeenCalledWith(
      "Unhandled error",
      expect.objectContaining({ error: expect.stringContaining("write failed") }),
    );
  });

  it("still removes the divisions when the competition can't be removed, and logs that", async () => {
    runs(hogtown);
    const create = creates();
    vi.spyOn(Division, "insertMany").mockRejectedValue(new Error("write failed"));
    const removeDivisions = vi
      .spyOn(Division, "deleteMany")
      .mockResolvedValue({ deletedCount: 1 });
    vi.spyOn(Competition, "deleteOne").mockRejectedValue(new Error("connection lost"));
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});

    const response = await send("POST", "/api/gym-admin/competitions", {
      ...winterSend,
      divisions: ["Beginner", "Advanced"],
    });

    expect(response.status).toBe(500);
    const competitionId = String((await create.mock.results[0].value)._id);
    expect(removeDivisions).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      "Couldn't take back a competition whose divisions failed",
      { competitionId, removing: "competition", error: "connection lost" },
    );
  });
});

describe("Gym Admin without an active gym (US-011, US-012)", () => {
  it.each([
    ["GET", "/api/gym-admin/dashboard"],
    ["GET", "/api/gym-admin/competitions"],
    ["GET", `/api/gym-admin/competitions/${COMPETITION_ID}`],
    ["POST", "/api/gym-admin/competitions"],
  ])("%s %s answers 403 NO_ASSIGNED_GYM", async (method, path) => {
    runs();
    listed([autumnOpen]);
    const create = creates();

    const response = await send(method, path, winterSend);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("NO_ASSIGNED_GYM");
    expect(Competition.find).not.toHaveBeenCalled();
    expect(Competition.findOne).not.toHaveBeenCalled();
    expect(Competition.countDocuments).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
