import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Gym } from "../src/models/Gym.js";
import { createGymRoutes } from "../src/routes/gymRoutes.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const SECOND_GYM_ID = "507f1f77bcf86cd799439015";
const ADMIN_ID = "507f1f77bcf86cd799439012";
const AUTHORIZATION = "Bearer a.b.c";
const CASE_INSENSITIVE = { locale: "en", strength: 2 };
const GYM_EXISTS = {
  error: "GYM_EXISTS",
  message: "A gym with this name and location already exists.",
};

afterEach(() => {
  vi.restoreAllMocks();
});

function leanQuery(value) {
  const query = {
    collation: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn(async () => value),
  };
  return query;
}

function makeApp() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: ADMIN_ID,
        role: "ADMIN",
        sessionId: "session-id",
      })),
    },
    sessions: {
      findActive: vi.fn(async () => ({})),
      recordRequest: vi.fn(async () => ({})),
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/gyms", createGymRoutes(auth));
  app.use(errorHandler);
  return app;
}

function listGyms(search = "") {
  return request(makeApp())
    .get(`/api/gyms${search}`)
    .set("Authorization", AUTHORIZATION);
}

function addGym(body) {
  return request(makeApp())
    .post("/api/gyms")
    .set("Authorization", AUTHORIZATION)
    .send(body);
}

function gymsAre(gyms, total = gyms.length) {
  const query = leanQuery(gyms);
  vi.spyOn(Gym, "find").mockReturnValue(query);
  vi.spyOn(Gym, "countDocuments").mockResolvedValue(total);
  return query;
}

function savesGyms({ duplicate = null } = {}) {
  const lookup = leanQuery(duplicate);
  vi.spyOn(Gym, "findOne").mockReturnValue(lookup);
  vi.spyOn(Gym, "create").mockImplementation(
    async (details) => new Gym(details),
  );
  return lookup;
}

describe("GET /api/gyms (US-004)", () => {
  it("lists every gym by name, ignoring case, 20 to a page", async () => {
    const query = gymsAre([
      { _id: GYM_ID, name: "Hogtown Boulders", status: "ACTIVE" },
      { _id: SECOND_GYM_ID, name: "north wall", status: "PENDING" },
    ]);

    const response = await listGyms();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      gyms: [
        { _id: GYM_ID, name: "Hogtown Boulders", status: "ACTIVE" },
        { _id: SECOND_GYM_ID, name: "north wall", status: "PENDING" },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
    expect(Gym.find).toHaveBeenCalledWith({});
    expect(Gym.countDocuments).toHaveBeenCalledWith({});
    expect(query.collation).toHaveBeenCalledWith(CASE_INSENSITIVE);
    expect(query.sort).toHaveBeenCalledWith({ name: 1 });
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(20);
  });

  it("filters by status and pages through the gyms", async () => {
    const query = gymsAre(
      [{ _id: SECOND_GYM_ID, name: "north wall", status: "PENDING" }],
      11,
    );

    const response = await listGyms("?status=PENDING&page=3&limit=5");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 11, page: 3, limit: 5 });
    expect(Gym.find).toHaveBeenCalledWith({ status: "PENDING" });
    expect(Gym.countDocuments).toHaveBeenCalledWith({ status: "PENDING" });
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it.each([
    [
      "an unknown status",
      "?status=OPEN",
      "status",
      "Choose a status: PENDING, ACTIVE, INACTIVE.",
    ],
    ["page 0", "?page=0", "page", "Page must be a whole number from 1."],
    ["a limit over 100", "?limit=101", "limit", "Limit must be from 1 to 100."],
  ])("rejects %s before reading gyms", async (_, search, field, message) => {
    gymsAre([]);

    const response = await listGyms(search);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields[field]).toBe(message);
    expect(Gym.find).not.toHaveBeenCalled();
  });
});

describe("POST /api/gyms (US-004)", () => {
  it("adds an ACTIVE gym with its name and location trimmed", async () => {
    const lookup = savesGyms();

    const response = await addGym({
      name: "  Hogtown Boulders ",
      location: " Toronto, Ontario  ",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Hogtown Boulders",
      location: "Toronto, Ontario",
      status: "ACTIVE",
      adminIds: [],
    });
    expect(Gym.findOne).toHaveBeenCalledWith({
      name: "Hogtown Boulders",
      location: "Toronto, Ontario",
    });
    expect(lookup.collation).toHaveBeenCalledWith(CASE_INSENSITIVE);
    expect(Gym.create).toHaveBeenCalledWith({
      name: "Hogtown Boulders",
      location: "Toronto, Ontario",
      status: "ACTIVE",
    });
  });

  it("ignores fields it doesn't take, such as Gym Administrators", async () => {
    savesGyms();

    const response = await addGym({
      name: "Hogtown Boulders",
      location: "Toronto",
      _id: GYM_ID,
      adminIds: [ADMIN_ID],
      featured: true,
    });

    expect(response.status).toBe(201);
    expect(Gym.create).toHaveBeenCalledWith({
      name: "Hogtown Boulders",
      location: "Toronto",
      status: "ACTIVE",
    });
    expect(response.body._id).not.toBe(GYM_ID);
    expect(response.body.adminIds).toEqual([]);
  });

  it.each([
    ["no name", { location: "Toronto" }, "name", "Enter the gym name."],
    [
      "a blank location",
      { name: "Hogtown Boulders", location: "   " },
      "location",
      "Enter the gym location.",
    ],
    [
      "a name over 100 characters",
      { name: "B".repeat(101), location: "Toronto" },
      "name",
      "Use 100 characters or fewer.",
    ],
    [
      "a location over 200 characters",
      { name: "Hogtown Boulders", location: "T".repeat(201) },
      "location",
      "Use 200 characters or fewer.",
    ],
    [
      "an unknown status",
      { name: "Hogtown Boulders", location: "Toronto", status: "OPEN" },
      "status",
      "Choose a status: PENDING, ACTIVE, INACTIVE.",
    ],
  ])("rejects a gym with %s before saving", async (_, body, field, message) => {
    savesGyms();

    const response = await addGym(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields[field]).toBe(message);
    expect(Gym.findOne).not.toHaveBeenCalled();
    expect(Gym.create).not.toHaveBeenCalled();
  });

  it("answers 409 GYM_EXISTS for a gym with the same name and location, ignoring case", async () => {
    const lookup = savesGyms({ duplicate: { _id: GYM_ID } });

    const response = await addGym({
      name: "HOGTOWN boulders",
      location: "toronto",
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(GYM_EXISTS);
    expect(Gym.findOne).toHaveBeenCalledWith({
      name: "HOGTOWN boulders",
      location: "toronto",
    });
    expect(lookup.collation).toHaveBeenCalledWith(CASE_INSENSITIVE);
    expect(Gym.create).not.toHaveBeenCalled();
  });

  it("answers 409 when two saves race and the unique index stops the second", async () => {
    savesGyms();
    vi.mocked(Gym.create).mockRejectedValue({ code: 11000 });

    const response = await addGym({
      name: "Hogtown Boulders",
      location: "Toronto",
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(GYM_EXISTS);
  });
});
