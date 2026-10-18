import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import CompetitionCard from "./CompetitionCard.tsx";

const competition: DiscoveredCompetition = {
  _id: "507f1f77bcf86cd799439012",
  name: "Autumn Open",
  date: "2026-11-14",
  location: "Toronto",
  gym: { _id: "507f1f77bcf86cd799439011", name: "Northside Climbing" },
  registrationStatus: "OPEN",
  capacity: 80,
  spacesLeft: 12,
  full: false,
  coordinates: null,
};

function renderCard(changes: Partial<DiscoveredCompetition> = {}, search = "") {
  return render(
    <MemoryRouter>
      <CompetitionCard
        competition={{ ...competition, ...changes }}
        search={search}
      />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("US-026: the event card", () => {
  it("shows the competition's name and gym (criterion 2)", () => {
    renderCard();

    expect(
      screen.getByRole("heading", { level: 3, name: "Autumn Open" }),
    ).toBeTruthy();
    expect(screen.getByText("Northside Climbing")).toBeTruthy();
  });

  it("shows the competition's date and location (criterion 3)", () => {
    renderCard();

    const date = screen.getByText("Nov 14, 2026");
    expect(date.tagName).toBe("TIME");
    expect(date.getAttribute("datetime")).toBe("2026-11-14");
    expect(screen.getByText("Toronto")).toBeTruthy();
  });

  it("links to the competition's Event Details page and keeps the search (criterion 4)", () => {
    renderCard({}, "q=Autumn&registration=open");

    const link = screen.getByRole("link", {
      name: "View event details for Autumn Open",
    });
    expect(link.textContent).toBe("View event details");
    expect(link.getAttribute("href")).toBe(
      "/competitions/507f1f77bcf86cd799439012?q=Autumn&registration=open",
    );
  });

  it("links to Event Details without a query when there's no search", () => {
    renderCard();

    expect(
      screen
        .getByRole("link", { name: "View event details for Autumn Open" })
        .getAttribute("href"),
    ).toBe("/competitions/507f1f77bcf86cd799439012");
  });

  it("encodes the competition ID in the Event Details link", () => {
    renderCard({ _id: "a/b c" }, "q=Autumn");

    expect(
      screen
        .getByRole("link", { name: "View event details for Autumn Open" })
        .getAttribute("href"),
    ).toBe("/competitions/a%2Fb%20c?q=Autumn");
  });

  it.each([
    ["OPEN", "Registration open", "true"],
    ["CLOSED", "Registration closed", "false"],
  ] as const)(
    "shows registration %s as %s",
    (registrationStatus, text, open) => {
      renderCard({ registrationStatus });

      expect(screen.getByText(text).getAttribute("data-open")).toBe(open);
    },
  );

  it.each<[string, Partial<DiscoveredCompetition>]>([
    ["12 spaces left", { full: false, spacesLeft: 12 }],
    ["1 space left", { full: false, spacesLeft: 1 }],
    ["Full, no spaces left", { full: true, spacesLeft: 0 }],
  ])("shows %s", (text, changes) => {
    renderCard(changes);

    expect(screen.getByText(text)).toBeTruthy();
  });

  it("shows the distance on its own line, to the nearest tenth of a kilometre", () => {
    renderCard({ distanceKm: 3.46 });

    expect(screen.getByText("3.5 km away").tagName).toBe("P");
    expect(screen.getByText("12 spaces left").tagName).toBe("P");
  });

  it("shows a distance of zero", () => {
    renderCard({ full: true, spacesLeft: 0, distanceKm: 0 });

    expect(screen.getByText("0 km away")).toBeTruthy();
    expect(screen.getByText("Full, no spaces left")).toBeTruthy();
  });

  it.each([null, undefined])(
    "leaves the distance out when it's %s",
    (distanceKm) => {
      renderCard({ distanceKm });

      expect(screen.queryByText(/km away/)).toBeNull();
    },
  );

  it("says so when the gym is unavailable", () => {
    renderCard({ gym: null });

    expect(screen.getByText("Gym unavailable")).toBeTruthy();
  });
});
