import { describe, expect, it } from "vitest";
import { loginAddress, safeReturnTo } from "./returnTo.ts";

describe("safeReturnTo", () => {
  it("keeps a path on this site, with its query and hash", () => {
    for (const path of ["/dashboard", "/dashboard?tab=2#scores", "/terms"]) {
      expect(safeReturnTo(path)).toBe(path);
    }
  });

  it("drops anything that could lead to another site", () => {
    for (const value of [
      null,
      "",
      "dashboard",
      "https://elsewhere.example",
      "//elsewhere.example",
      "/\\elsewhere.example",
      "/\t/elsewhere.example",
      "/dashboard\n",
      `/${"a".repeat(2000)}`,
    ]) {
      expect(safeReturnTo(value)).toBeNull();
    }
  });

  it("drops the login pages themselves", () => {
    for (const path of ["/login", "/register?step=2", "/reset-password"]) {
      expect(safeReturnTo(path)).toBeNull();
    }
  });
});

describe("loginAddress", () => {
  it("adds where to come back to, and why when the session expired", () => {
    expect(loginAddress("/dashboard")).toBe("/login?returnTo=%2Fdashboard");
    expect(loginAddress("/dashboard", "expired")).toBe(
      "/login?reason=expired&returnTo=%2Fdashboard",
    );
  });

  it("leaves out a page it can't come back to", () => {
    expect(loginAddress("//elsewhere.example")).toBe("/login");
    expect(loginAddress("/login", "expired")).toBe("/login?reason=expired");
  });
});
