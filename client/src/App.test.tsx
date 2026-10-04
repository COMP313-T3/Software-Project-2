import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App.tsx";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("App routes", () => {
  it("shows the home page at /", () => {
    renderAt("/");

    expect(
      screen.getByRole("heading", { level: 1, name: "TopSend" }),
    ).toBeTruthy();
  });

  it("shows the not found page with a link home for unknown paths", () => {
    renderAt("/no-such-page");

    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Go to the home page" })
        .getAttribute("href"),
    ).toBe("/");
  });
});
