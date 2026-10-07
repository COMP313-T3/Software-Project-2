import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Gym } from "../src/models/Gym.js";
import { createGymRoutes } from "../src/routes/gymRoutes.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const ADMIN_ID = "507f1f77bcf86cd799439012";
const AUTHORIZATION = "Bearer a.b.c";

afterEach(() => {
  vi.restoreAllMocks();
});

function leanQuery(value) {
  const query = {
    collation: vi.fn(() => query),
    populate: vi.fn(() => query),
    lean: vi.fn(async () => value),
  };
  return query;
}

function makeApp(role = "ADMIN") {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "user-id",
        role,
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

describe("GET /api/gyms/:gymId", () => {
  it("returns the selected gym and populated assigned Gym Administrators", async () => {
    const gym = {
      _id: GYM_ID,
      name: "TopSend Climbing",
      location: "Toronto",
      status: "ACTIVE",
      adminIds: [
        {
          _id: ADMIN_ID,
          firstName: "Alex",
          lastName: "Climber",
          email: "alex@example.com",
        },
      ],
    };
    const query = leanQuery(gym);
    vi.spyOn(Gym, "findById").mockReturnValue(query);

    const response = await request(makeApp())
      .get(`/api/gyms/${GYM_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(gym);
    expect(query.populate).toHaveBeenCalledWith(
      "adminIds",
      "firstName lastName email",
    );
    expect(Gym.findById).toHaveBeenCalledWith(GYM_ID);
  });
});

describe("PATCH /api/gyms/:gymId", () => {
  it("updates only the selected gym's provided details", async () => {
    const updated = {
      _id: GYM_ID,
      name: "Updated Gym",
      location: "Toronto",
      status: "ACTIVE",
      adminIds: [],
    };
    const currentQuery = leanQuery({
      _id: GYM_ID,
      name: "Old Gym",
      location: "Toronto",
    });
    const duplicateQuery = leanQuery(null);
    const updateQuery = leanQuery(updated);
    vi.spyOn(Gym, "findById").mockReturnValue(currentQuery);
    vi.spyOn(Gym, "findOne").mockReturnValue(duplicateQuery);
    vi.spyOn(Gym, "findByIdAndUpdate").mockReturnValue(updateQuery);

    const response = await request(makeApp())
      .patch(`/api/gyms/${GYM_ID}`)
      .set("Authorization", AUTHORIZATION)
      .send({ name: " Updated Gym " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updated);
    expect(Gym.findOne).toHaveBeenCalledWith({
      _id: { $ne: GYM_ID },
      name: "Updated Gym",
      location: "Toronto",
    });
    expect(Gym.findByIdAndUpdate).toHaveBeenCalledWith(
      GYM_ID,
      { $set: { name: "Updated Gym" } },
      { new: true, runValidators: true },
    );
  });

  it("rejects a duplicate gym name and location without updating", async () => {
    vi.spyOn(Gym, "findById").mockReturnValue(
      leanQuery({ _id: GYM_ID, name: "Old Gym", location: "Toronto" }),
    );
    vi.spyOn(Gym, "findOne").mockReturnValue(leanQuery({ _id: ADMIN_ID }));
    const update = vi.spyOn(Gym, "findByIdAndUpdate");

    const response = await request(makeApp())
      .patch(`/api/gyms/${GYM_ID}`)
      .set("Authorization", AUTHORIZATION)
      .send({ name: "Another Gym" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("GYM_EXISTS");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    const findById = vi.spyOn(Gym, "findById");
    const response = await request(makeApp())
      .patch(`/api/gyms/${GYM_ID}`)
      .set("Authorization", AUTHORIZATION)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(findById).not.toHaveBeenCalled();
  });

  it("denies non-admins before accessing gym records", async () => {
    const findById = vi.spyOn(Gym, "findById");
    const response = await request(makeApp("GYM_ADMIN"))
      .patch(`/api/gyms/${GYM_ID}`)
      .set("Authorization", AUTHORIZATION)
      .send({ name: "Another Gym" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_FORBIDDEN");
    expect(findById).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/gyms/:gymId/deactivate", () => {
  it("deactivates only the selected gym and preserves its assignments", async () => {
    const inactiveGym = {
      _id: GYM_ID,
      name: "TopSend Climbing",
      location: "Toronto",
      status: "INACTIVE",
      adminIds: [{ _id: ADMIN_ID }],
    };
    const query = leanQuery(inactiveGym);
    vi.spyOn(Gym, "findByIdAndUpdate").mockReturnValue(query);

    const response = await request(makeApp())
      .patch(`/api/gyms/${GYM_ID}/deactivate`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(inactiveGym);
    expect(Gym.findByIdAndUpdate).toHaveBeenCalledWith(
      GYM_ID,
      { $set: { status: "INACTIVE" } },
      { new: true, runValidators: true },
    );
    expect(query.populate).toHaveBeenCalledWith(
      "adminIds",
      "firstName lastName email",
    );
  });

  it("does not update a gym for a non-admin", async () => {
    const findByIdAndUpdate = vi.spyOn(Gym, "findByIdAndUpdate");
    const response = await request(makeApp("GYM_ADMIN"))
      .patch(`/api/gyms/${GYM_ID}/deactivate`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_FORBIDDEN");
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
