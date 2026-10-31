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
  it("opens the landing page at /, with ways to sign up and log in", () => {
    renderAt("/");

    expect(
      screen.getByRole("heading", { level: 1, name: "TopSend" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign up" }).getAttribute("href"),
    ).toBe("/register");
    expect(
      screen.getAllByRole("link", { name: "Log in" })[0].getAttribute("href"),
    ).toBe("/login");
  });

  it("opens the log in page at /login", () => {
    renderAt("/login");

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Log in" }).getAttribute("aria-selected"),
    ).toBe("true");
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
