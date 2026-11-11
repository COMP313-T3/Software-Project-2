import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import * as sessionApi from "../lib/sessionApi.ts";

function Address() {
  const { pathname, search } = useLocation();
  return <p data-testid="address">{pathname + search}</p>;
}

vi.mock("./MyEventsPage.tsx", () => ({ default: ({ tool }: { tool?: string }) => <p>My Events: {tool}</p> }));
vi.mock("./RouteStatisticsPage.tsx", () => ({ default: () => <p>Route statistics page</p> }));

const id = "507f1f77bcf86cd799439011";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Address />
      <App />
    </MemoryRouter>,
  );
}

function logIn(role: "CLIMBER" | "GYM_ADMIN") {
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({
    userId: "user-one",
    role,
    token: "fixture",
    expiresAt: "2040-01-01T00:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "user-one",
    email: "user@example.com",
    role,
    session: { expiresIn: 3600, limitReached: false },
  });
}

beforeEach(() => logIn("CLIMBER"));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AC-022 addresses of the AI Route Assistant's former pages", () => {
  it("sends a Climber's assistant address to the scorecard, where the chatbot is now", async () => {
    renderAt(`/my-events/${id}/route-assistant?page=2`);

    expect(await screen.findByText("My Events: scorecard")).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe(`/my-events/${id}/scorecard?page=2`);
  });

  it("sends a Gym Admin's assistant address to Route statistics, where the chatbot is now", async () => {
    logIn("GYM_ADMIN");
    renderAt(`/gym-admin/competitions/${id}/route-assistant?period=past&page=3`);

    expect(await screen.findByText("Route statistics page")).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe(
      `/gym-admin/competitions/${id}/statistics?period=past&page=3`,
    );
  });

  it("still asks for a login first", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderAt(`/my-events/${id}/route-assistant`);

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(screen.queryByText("My Events: scorecard")).toBeNull();
  });
});
