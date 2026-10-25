import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import MapPlaceCard from "./MapPlaceCard.tsx";
import { placesOf } from "./mapPlaces.ts";

const NORTHSIDE = { lat: 43.6532, lng: -79.3832 };

const autumnOpen: DiscoveredCompetition = {
  _id: "507f1f77bcf86cd799439012",
  name: "Autumn Open",
  date: "2026-11-14",
  location: "100 King St W, Toronto",
  gym: { _id: "507f1f77bcf86cd799439011", name: "Northside Climbing" },
  registrationStatus: "OPEN",
  capacity: 80,
  spacesLeft: 12,
  full: false,
  coordinates: NORTHSIDE,
};

const winterJam: DiscoveredCompetition = {
  ...autumnOpen,
  _id: "507f1f77bcf86cd799439013",
  name: "Winter Bouldering Jam",
  date: "2026-12-05",
  registrationStatus: "CLOSED",
  spacesLeft: 0,
  full: true,
};

function renderCard(
  competitions: DiscoveredCompetition[],
  onClose = vi.fn(),
  search = "q=Open&view=map",
) {
  const [place] = placesOf(competitions);
  const view = render(
    <MemoryRouter>
      <MapPlaceCard place={place} search={search} onClose={onClose} />
    </MemoryRouter>,
  );
  return { ...view, onClose, place };
}

afterEach(cleanup);

describe("MapPlaceCard (US-027 criteria 5 and 6)", () => {
  it("shows the place and each competition's basic information", () => {
    renderCard([autumnOpen, winterJam]);

    const card = screen.getByRole("region", { name: "Northside Climbing" });
    expect(within(card).getByText("100 King St W, Toronto")).toBeTruthy();
    const [autumn, winter] = within(card).getAllByRole("listitem");
    expect(within(autumn).getByRole("heading", { name: "Autumn Open" })).toBeTruthy();
    expect(within(autumn).getByText("Nov 14, 2026").getAttribute("datetime")).toBe(
      "2026-11-14",
    );
    expect(within(autumn).getByText("Registration open")).toBeTruthy();
    expect(within(autumn).getByText("12 spaces left")).toBeTruthy();
    expect(within(winter).getByRole("heading", { name: "Winter Bouldering Jam" })).toBeTruthy();
    expect(within(winter).getByText("Dec 5, 2026")).toBeTruthy();
    expect(within(winter).getByText("Registration closed")).toBeTruthy();
    expect(within(winter).getByText("Full, no spaces left")).toBeTruthy();
  });

  it("links each competition to its own Event Details page, keeping the search", () => {
    renderCard([autumnOpen, winterJam]);

    expect(
      screen
        .getByRole("link", { name: "View event details for Autumn Open" })
        .getAttribute("href"),
    ).toBe(`/competitions/${autumnOpen._id}?q=Open&view=map`);
    expect(
      screen
        .getByRole("link", { name: "View event details for Winter Bouldering Jam" })
        .getAttribute("href"),
    ).toBe(`/competitions/${winterJam._id}?q=Open&view=map`);
  });

  it("shows the distance when the search measured one", () => {
    renderCard([{ ...autumnOpen, distanceKm: 3.46 }]);

    expect(screen.getByText("3.5 km away")).toBeTruthy();
  });

  it("names each competition's gym when the place has more than one gym", () => {
    renderCard([
      autumnOpen,
      { ...winterJam, gym: { _id: "other-gym", name: "Visiting Gym" } },
    ]);

    const card = screen.getByRole("region", { name: "100 King St W, Toronto" });
    expect(within(card).getByText("Northside Climbing")).toBeTruthy();
    expect(within(card).getByText("Visiting Gym")).toBeTruthy();
    expect(within(card).getAllByText("100 King St W, Toronto")).toHaveLength(1);
  });

  it("moves keyboard focus to its heading when it opens", () => {
    renderCard([autumnOpen]);

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Northside Climbing" }),
    );
  });

  it("says so when it goes away while it holds keyboard focus", () => {
    const [place] = placesOf([autumnOpen]);
    const onFocusLost = vi.fn();
    const card = (
      <MapPlaceCard place={place} search="" onClose={vi.fn()} onFocusLost={onFocusLost} />
    );
    const { rerender } = render(<MemoryRouter>{card}</MemoryRouter>);
    screen.getByRole("link", { name: /Autumn Open/ }).focus();

    rerender(<MemoryRouter>{null}</MemoryRouter>);

    expect(onFocusLost).toHaveBeenCalledTimes(1);
  });

  it("leaves focus alone when it goes away without holding it", () => {
    const [place] = placesOf([autumnOpen]);
    const onFocusLost = vi.fn();
    const outside = document.createElement("button");
    document.body.append(outside);
    const card = (
      <MapPlaceCard place={place} search="" onClose={vi.fn()} onFocusLost={onFocusLost} />
    );
    const { rerender } = render(<MemoryRouter>{card}</MemoryRouter>);
    outside.focus();

    rerender(<MemoryRouter>{null}</MemoryRouter>);

    expect(onFocusLost).not.toHaveBeenCalled();
    outside.remove();
  });

  it("closes with its Close button and with Esc", () => {
    const { onClose } = renderCard([autumnOpen]);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("link", { name: /Autumn Open/ }), {
      key: "Escape",
    });
    fireEvent.keyDown(screen.getByRole("link", { name: /Autumn Open/ }), {
      key: "Enter",
    });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
