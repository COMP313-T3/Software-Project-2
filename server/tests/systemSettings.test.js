import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { SystemSettings } from "../src/models/SystemSettings.js";
import { createAdminRoutes } from "../src/routes/adminRoutes.js";
import { DEFAULT_SYSTEM_SETTINGS } from "../src/constants/systemSettings.js";
import { logger } from "../src/utils/logger.js";

function makeApp() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "admin-id",
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
  app.use("/api/admin", createAdminRoutes({ auth }));
  app.use(errorHandler);
  return app;
}

function adminRequest(method, path) {
  return request(makeApp())
    [method.toLowerCase()](path)
    .set("Authorization", "Bearer a.b.c");
}

afterEach(() => vi.restoreAllMocks());

describe("US-010 system settings", () => {
  it("loads defaults when the settings have not been saved yet", async () => {
    vi.spyOn(SystemSettings, "findById").mockResolvedValue(null);

    const response = await adminRequest("GET", "/api/admin/settings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });

  it("loads previously saved settings from MongoDB", async () => {
    vi.spyOn(SystemSettings, "findById").mockResolvedValue({
      platformName: "Boulder Hub",
      climberRegistrationEnabled: false,
    });

    const response = await adminRequest("GET", "/api/admin/settings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      platformName: "Boulder Hub",
      climberRegistrationEnabled: false,
    });
    expect(SystemSettings.findById).toHaveBeenCalledWith("topsend");
  });

  it("saves only changed fields and leaves other saved settings intact", async () => {
    const saved = {
      platformName: "Boulder Hub",
      climberRegistrationEnabled: true,
    };
    const update = vi
      .spyOn(SystemSettings, "findOneAndUpdate")
      .mockResolvedValue(saved);

    const response = await adminRequest("PATCH", "/api/admin/settings").send({
      platformName: "  Boulder Hub  ",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(saved);
    expect(update).toHaveBeenCalledWith(
      { _id: "topsend" },
      { $set: { platformName: "Boulder Hub" } },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  });

  it("accepts updates to the registration setting without replacing the name", async () => {
    const saved = {
      platformName: "Boulder Hub",
      climberRegistrationEnabled: false,
    };
    const update = vi
      .spyOn(SystemSettings, "findOneAndUpdate")
      .mockResolvedValue(saved);

    const response = await adminRequest("PATCH", "/api/admin/settings").send({
      climberRegistrationEnabled: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(saved);
    expect(update.mock.calls[0][1]).toEqual({
      $set: { climberRegistrationEnabled: false },
    });
  });

  it.each([
    {},
    { platformName: " " },
    { unsupported: true },
    { platformName: "x".repeat(101) },
  ])("rejects invalid settings without writing them: %s", async (changes) => {
    const update = vi.spyOn(SystemSettings, "findOneAndUpdate");

    const response = await adminRequest("PATCH", "/api/admin/settings").send(
      changes,
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(update).not.toHaveBeenCalled();
  });

  it("returns a safe error and logs a database failure", async () => {
    vi.spyOn(SystemSettings, "findById").mockRejectedValue(
      new Error("private database connection detail"),
    );
    const logError = vi.spyOn(logger, "error");

    const response = await adminRequest("GET", "/api/admin/settings");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(response.body)).not.toContain(
      "private database connection detail",
    );
    expect(logError).toHaveBeenCalledOnce();
  });

  it("does not report a successful save when MongoDB rejects the update", async () => {
    vi.spyOn(SystemSettings, "findOneAndUpdate").mockRejectedValue(
      new Error("private database connection detail"),
    );
    const logError = vi.spyOn(logger, "error");

    const response = await adminRequest(
      "PATCH",
      "/api/admin/settings",
    ).send({ climberRegistrationEnabled: false });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("INTERNAL_ERROR");
    expect(response.body.message).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(response.body)).not.toContain(
      "private database connection detail",
    );
    expect(logError).toHaveBeenCalledOnce();
  });
});
