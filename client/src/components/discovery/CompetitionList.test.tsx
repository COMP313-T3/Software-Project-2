import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import CompetitionList from "./CompetitionList.tsx";

const competitions: DiscoveredCompetition[] = [
  {
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
  },
  {
    _id: "507f1f77bcf86cd799439013",
    name: "Winter Bouldering Jam",
    date: "2026-12-05",
    location: "Mississauga",
    gym: { _id: "507f1f77bcf86cd799439014", name: "Lakeshore Boulders" },
    registrationStatus: "CLOSED",
    capacity: 40,
    spacesLeft: 0,
    full: true,
    coordinates: null,
  },
];

function EventDetailsStub() {
  const { competitionId } = useParams();
  const { search } = useLocation();
  return <p>{`Event Details for ${competitionId}${search}`}</p>;
}

function renderList(search = "") {
  return render(
    <MemoryRouter
      initialEntries={[`/competitions${search ? `?${search}` : ""}`]}
    >
      <Routes>
        <Route
          path="/competitions"
          element={
            <CompetitionList competitions={competitions} search={search} />
          }
        />
        <Route
          path="/competitions/:competitionId"
          element={<EventDetailsStub />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("US-026: the competition list", () => {
  it("shows a card for each competition, in the order given", () => {
    renderList();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      within(items[0]).getByRole("heading", { level: 3 }).textContent,
    ).toBe("Autumn Open");
    expect(
      within(items[1]).getByRole("heading", { level: 3 }).textContent,
    ).toBe("Winter Bouldering Jam");
  });

  it("shows each competition's own name, gym, date and location (criteria 2 and 3)", () => {
    renderList();

    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByText("Northside Climbing")).toBeTruthy();
    expect(within(first).getByText("Nov 14, 2026")).toBeTruthy();
    expect(within(first).getByText("Toronto")).toBeTruthy();
    expect(within(second).getByText("Lakeshore Boulders")).toBeTruthy();
    expect(within(second).getByText("Dec 5, 2026")).toBeTruthy();
    expect(within(second).getByText("Mississauga")).toBeTruthy();
  });

  it("opens the Event Details page of the competition the Climber selects (criteria 4 and 5)", () => {
    renderList("q=boulder");

    fireEvent.click(
      screen.getByRole("link", {
        name: "View event details for Winter Bouldering Jam",
      }),
    );

    expect(
      screen.getByText("Event Details for 507f1f77bcf86cd799439013?q=boulder"),
    ).toBeTruthy();
  });
});
