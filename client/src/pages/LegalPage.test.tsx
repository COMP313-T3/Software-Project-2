import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App.tsx";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("legal pages", () => {
  it("shows the Terms and Conditions at /terms with its version", () => {
    renderAt("/terms");

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms and Conditions" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Version 1.0, effective October 4, 2026"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Governing law" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to TopSend" })).toBeTruthy();
  });

  it("shows the Privacy Policy at /privacy, including what sign-up collects", () => {
    renderAt("/privacy");

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "What we collect and why" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Your map location, only if you choose one/),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "topsend77@gmail.com" }).length,
    ).toBeGreaterThan(0);
  });
});
