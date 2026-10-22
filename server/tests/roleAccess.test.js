import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { GymAdminRequest } from "../src/models/GymAdminRequest.js";
import { Registration } from "../src/models/Registration.js";
import { Route } from "../src/models/Route.js";
import { User } from "../src/models/User.js";
import { createAdminRoutes } from "../src/routes/adminRoutes.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { createGymRoutes } from "../src/routes/gymRoutes.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";
const COMPETITION_ID = "507f1f77bcf86cd799439013";
const ROUTE_ID = "507f1f77bcf86cd799439014";
const GYM_REQUEST_ID = "507f1f77bcf86cd799439015";
const COMPETITION = `/api/gym-admin/competitions/${COMPETITION_ID}`;

const SYSTEM_ADMIN_ROUTES = [
  ["GET", "/api/admin/dashboard"],
  ["GET", "/api/admin/gym-requests"],
  ["GET", `/api/admin/gym-requests/${GYM_REQUEST_ID}`],
  ["PATCH", `/api/admin/gym-requests/${GYM_REQUEST_ID}/review`],
  ["POST", `/api/admin/gym-requests/${GYM_REQUEST_ID}/setup-link`],
  ["DELETE", `/api/admin/gym-requests/${GYM_REQUEST_ID}`],
  ["GET", "/api/gyms"],
  ["POST", "/api/gyms"],
  ["GET", `/api/gyms/${GYM_ID}`],
  ["PATCH", `/api/gyms/${GYM_ID}`],
  ["PATCH", `/api/gyms/${GYM_ID}/deactivate`],
  ["PATCH", `/api/gyms/${GYM_ID}/activate`],
  ["GET", `/api/gyms/${GYM_ID}/admin-candidates`],
  ["GET", `/api/gyms/${GYM_ID}/admins/${USER_ID}`],
  ["PUT", `/api/gyms/${GYM_ID}/admins/${USER_ID}`],
  ["DELETE", `/api/gyms/${GYM_ID}/admins/${USER_ID}`],
];

const GYM_ADMIN_ROUTES = [
  ["GET", "/api/gym-admin/dashboard"],
  ["GET", "/api/gym-admin/competitions"],
  ["POST", "/api/gym-admin/competitions"],
  ["GET", COMPETITION],
  ["PATCH", COMPETITION],
  ["GET", `${COMPETITION}/divisions`],
  ["POST", `${COMPETITION}/divisions`],
  ["GET", `${COMPETITION}/climbers`],
  ["PUT", `${COMPETITION}/climbers/${USER_ID}/division`],
  ["GET", `${COMPETITION}/climbers/${USER_ID}`],
  ["PATCH", `${COMPETITION}/climbers/${USER_ID}`],
  ["DELETE", `${COMPETITION}/climbers/${USER_ID}`],
  ["GET", `${COMPETITION}/routes`],
  ["POST", `${COMPETITION}/routes`],
  ["GET", `${COMPETITION}/routes/${ROUTE_ID}`],
  ["PATCH", `${COMPETITION}/routes/${ROUTE_ID}`],
  ["GET", `${COMPETITION}/scoring`],
  ["PUT", `${COMPETITION}/scoring`],
];

const CLIMBER_ROUTES = [
  ["GET", "/api/competitions"],
  ["GET", "/api/competitions/filters"],
  ["GET", `/api/competitions/${COMPETITION_ID}`],
  ["GET", `/api/competitions/${COMPETITION_ID}/registration`],
];

const DATABASE_READS_AND_WRITES = [
  "find",
  "findOne",
  "findById",
  "findByIdAndUpdate",
  "findOneAndUpdate",
  "findOneAndDelete",
  "deleteOne",
  "exists",
  "countDocuments",
  "distinct",
  "aggregate",
  "create",
];

function app(role) {
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
  api.use("/api/admin", createAdminRoutes({ auth }));
  api.use("/api/gyms", createGymRoutes(auth));
  api.use("/api/gym-admin", createGymAdminRoutes({ auth }));
  api.use("/api/competitions", createCompetitionRoutes({ auth }));
  api.use(errorHandler);
  return api;
}

function watchDatabase() {
  return [
    Competition,
    Division,
    Gym,
    GymAdminRequest,
    Registration,
    Route,
    User,
  ].flatMap((model) =>
    DATABASE_READS_AND_WRITES.map((method) => vi.spyOn(model, method)),
  );
}

function send(api, method, path, token) {
  const call = request(api)[method.toLowerCase()](path);
  if (token) call.set("Authorization", "Bearer a.b.c");
  return method === "GET" || method === "DELETE" ? call : call.send({});
}

afterEach(() => vi.restoreAllMocks());

describe("NR-002 protected routes", () => {
  it.each([...SYSTEM_ADMIN_ROUTES, ...GYM_ADMIN_ROUTES, ...CLIMBER_ROUTES])(
    "%s %s needs a login",
    async (method, path) => {
      const database = watchDatabase();

      const response = await send(app("ADMIN"), method, path, false);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("NOT_AUTHENTICATED");
      for (const spy of database) expect(spy).not.toHaveBeenCalled();
    },
  );

  describe.each(["GYM_ADMIN", "CLIMBER", "VISITOR"])(
    "System Administrator routes with a %s token",
    (role) => {
      it.each(SYSTEM_ADMIN_ROUTES)("%s %s is refused", async (method, path) => {
        const database = watchDatabase();

        const response = await send(app(role), method, path, true);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ROLE_FORBIDDEN");
        for (const spy of database) expect(spy).not.toHaveBeenCalled();
      });
    },
  );

  describe.each(["ADMIN", "CLIMBER", "VISITOR"])(
    "Gym Administrator routes with a %s token",
    (role) => {
      it.each(GYM_ADMIN_ROUTES)("%s %s is refused", async (method, path) => {
        const database = watchDatabase();

        const response = await send(app(role), method, path, true);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ROLE_FORBIDDEN");
        for (const spy of database) expect(spy).not.toHaveBeenCalled();
      });
    },
  );

  describe.each(["ADMIN", "GYM_ADMIN", "VISITOR"])(
    "Climber routes with a %s token",
    (role) => {
      it.each(CLIMBER_ROUTES)("%s %s is refused", async (method, path) => {
        const database = watchDatabase();

        const response = await send(app(role), method, path, true);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ROLE_FORBIDDEN");
        for (const spy of database) expect(spy).not.toHaveBeenCalled();
      });
    },
  );
});
