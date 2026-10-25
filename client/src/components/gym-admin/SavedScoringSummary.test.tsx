import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import SavedScoringSummary from "./SavedScoringSummary.tsx";
import type { ManagedCompetitionDetails } from "../../lib/gymAdminApi.ts";
const competition: ManagedCompetitionDetails = { _id: "selected", gymId: "gym", gym: null, name: "Open", date: "2027-11-14", status: "DRAFT", location: "Toronto", registrationStatus: "CLOSED", capacity: 80, tools: [] };
afterEach(cleanup);
function page(record = competition) { return render(<MemoryRouter initialEntries={["/gym-admin/competitions/selected?period=past"]}><SavedScoringSummary competition={record} /></MemoryRouter>); }
describe("US018 saved scoring format on competition details", () => {
  it.each([undefined, null, { format: "POINTS", flashBonus: 10 }, { deductionPercent: 30, maxAttempts: 5 }])("shows scoring %j as not set, with a configuration link", scoring => {
    page({ ...competition, scoring: scoring as ManagedCompetitionDetails["scoring"] }); expect(screen.getByText("Not set")).toBeTruthy(); expect(screen.queryByText("Last saved")).toBeNull();
    expect(screen.getByRole("link", { name: "Configure scoring format" }).getAttribute("href")).toBe("/gym-admin/competitions/selected/scoring?period=past");
  });
  it("describes the saved settings in plain words with a 100-point example", () => {
    page({ ...competition, scoring: { deductionPercent: 20, maxAttempts: 5, updatedAt: "2026-10-16T12:00:00Z" } });
    expect(screen.getByText("20% off for each failed attempt, up to 5 attempts")).toBeTruthy();
    expect(screen.getByText("A 100-point problem scores 100, 80, 60, 40 or 20 points, and 0 if it isn't topped.")).toBeTruthy();
    expect(screen.getByText("Last saved")).toBeTruthy(); expect(screen.getByRole("link", { name: "Change scoring format" })).toBeTruthy();
  });
  it("shows settings saved without a time", () => {
    page({ ...competition, scoring: { deductionPercent: 0, maxAttempts: 1 } });
    expect(screen.getByText("0% off for each failed attempt, up to 1 attempt")).toBeTruthy();
    expect(screen.getByText("A 100-point problem scores 100 points, and 0 if it isn't topped.")).toBeTruthy(); expect(screen.queryByText("Last saved")).toBeNull();
  });
});
