import { describe, expect, it } from "vitest";
import { loginAddress, pageAfterLogin, safeReturnTo } from "./returnTo.ts";

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

describe("pageAfterLogin", () => {
  it("returns to a page the logged-in role can open", () => {
    expect(pageAfterLogin("/admin/gyms?page=2", "ADMIN")).toBe("/admin/gyms?page=2");
    expect(pageAfterLogin("/gym-admin/competitions/1#tools", "GYM_ADMIN")).toBe(
      "/gym-admin/competitions/1#tools",
    );
    expect(pageAfterLogin("/competitions?q=Autumn", "CLIMBER")).toBe(
      "/competitions?q=Autumn",
    );
    for (const role of ["ADMIN", "GYM_ADMIN", "CLIMBER"] as const) {
      expect(pageAfterLogin("/dashboard", role)).toBe("/dashboard");
      expect(pageAfterLogin("/terms", role)).toBe("/terms");
    }
  });

  it("goes to the role's own landing page instead of another role's page", () => {
    expect(pageAfterLogin("/gym-admin/competitions/1", "CLIMBER")).toBe(
      "/competitions",
    );
    expect(pageAfterLogin("/Admin/gyms", "CLIMBER")).toBe("/competitions");
    expect(pageAfterLogin("/competitions/1", "GYM_ADMIN")).toBe("/dashboard");
    expect(pageAfterLogin("/admin/gym-requests", "GYM_ADMIN")).toBe(
      "/dashboard",
    );
    expect(pageAfterLogin("/gym-admin", "ADMIN")).toBe("/dashboard");
  });

  it("goes to the role's landing page when there's nothing to return to", () => {
    expect(pageAfterLogin(null, "CLIMBER")).toBe("/competitions");
    expect(pageAfterLogin(null, "ADMIN")).toBe("/dashboard");
    expect(pageAfterLogin(null, "GYM_ADMIN")).toBe("/dashboard");
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
