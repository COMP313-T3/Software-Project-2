import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const VALID_URI = "mongodb://localhost:27017/topsend_marker42";

describe("loadConfig", () => {
  it("applies defaults for the optional settings", () => {
    expect(loadConfig({ MONGODB_URI: VALID_URI })).toEqual({
      nodeEnv: "development",
      port: 4000,
      mongodbUri: VALID_URI,
      clientOrigins: ["http://localhost:5173"],
    });
  });

  it("requires MONGODB_URI", () => {
    expect(() => loadConfig({})).toThrow("MONGODB_URI is not set");
    expect(() => loadConfig({ MONGODB_URI: "   " })).toThrow(
      "MONGODB_URI is not set",
    );
  });

  it("rejects a connection string with the wrong scheme", () => {
    expect(() => loadConfig({ MONGODB_URI: "https://example.com" })).toThrow(
      "must start with mongodb:// or mongodb+srv://",
    );
  });

  it("rejects an invalid port without echoing any value", () => {
    let message = "";
    try {
      loadConfig({ MONGODB_URI: VALID_URI, PORT: "eighty" });
    } catch (error) {
      message = error.message;
    }

    expect(message).toBe("PORT must be a whole number between 1 and 65535.");
    expect(message).not.toContain("marker42");
  });

  it("reads a list of client origins", () => {
    const config = loadConfig({
      MONGODB_URI: VALID_URI,
      PORT: "5050",
      CLIENT_ORIGINS: "http://localhost:5173, https://topsend.example",
    });

    expect(config.port).toBe(5050);
    expect(config.clientOrigins).toEqual([
      "http://localhost:5173",
      "https://topsend.example",
    ]);
  });

  it("rejects an origin with a trailing slash", () => {
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        CLIENT_ORIGINS: "http://localhost:5173/",
      }),
    ).toThrow("no trailing slash");
  });
});
