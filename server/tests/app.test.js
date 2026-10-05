import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { requestId } from "../src/middleware/requestId.js";

const ALLOWED_ORIGIN = "http://localhost:5173";
const app = createApp({ clientOrigins: [ALLOWED_ORIGIN] });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("reports the API status and the database state", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "disconnected" });
  });

  it("sends security headers and a request ID", async () => {
    const response = await request(app).get("/api/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("ignores a request ID sent by the client", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "spoofed-id");

    expect(response.headers["x-request-id"]).not.toBe("spoofed-id");
  });
});

describe("CORS", () => {
  it("allows a listed origin with cookies", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("Origin", ALLOWED_ORIGIN);

    expect(response.headers["access-control-allow-origin"]).toBe(
      ALLOWED_ORIGIN,
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("gives an unlisted origin no access", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "https://attacker.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("requests from other sites", () => {
  const ORIGIN_NOT_ALLOWED = {
    error: "ORIGIN_NOT_ALLOWED",
    message: "Requests from this site aren't allowed.",
  };

  it("turns away changes sent from an unlisted origin, before any route runs", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .set("Origin", "https://attacker.example")
      .send({ email: "jordan@example.com" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(ORIGIN_NOT_ALLOWED);
  });

  it("judges by the Referer when there's no Origin header", async () => {
    for (const referer of ["https://attacker.example/page", "not a url"]) {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .set("Referer", referer)
        .send({ email: "jordan@example.com" });

      expect(response.body).toEqual(ORIGIN_NOT_ALLOWED);
    }
  });

  it("lets reads through from anywhere, and changes from listed origins", async () => {
    expect(
      (
        await request(app)
          .get("/api/health")
          .set("Origin", "https://attacker.example")
      ).status,
    ).toBe(200);

    const response = await request(app)
      .post("/api/auth/forgot-password")
      .set("Origin", ALLOWED_ORIGIN)
      .send({ email: "jordan@" });

    expect(response.body.error).toBe("VALIDATION_ERROR");
  });
});

describe("error handling", () => {
  it("answers unknown routes with a JSON 404", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  });

  it("rejects malformed JSON with a 400", async () => {
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "INVALID_JSON",
      message: "The request body is not valid JSON.",
    });
  });

  it("rejects bodies over 100 KB with a 413", async () => {
    const response = await request(app)
      .post("/api/health")
      .send({ data: "x".repeat(110 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("hides unexpected errors and logs them with the request ID", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failingApp = express();
    failingApp.use(requestId);
    failingApp.get("/fail", () => {
      throw new Error("internal detail that must not leak");
    });
    failingApp.use(errorHandler);

    const response = await request(failingApp).get("/fail");
    const errorId = response.headers["x-request-id"];

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      errorId,
    });
    expect(response.text).not.toContain("internal detail");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(errorId));
  });
});
