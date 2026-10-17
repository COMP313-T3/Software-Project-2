import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavedScoringSummary from "./SavedScoringSummary.tsx";
import { listScoringFormats } from "../../lib/scoringApi.ts";
import type { ManagedCompetitionDetails } from "../../lib/gymAdminApi.ts";
vi.mock("../../lib/scoringApi.ts", () => ({ listScoringFormats: vi.fn() }));
const competition: ManagedCompetitionDetails = { _id: "selected", gymId: "gym", gym: null, name: "Open", date: "2027-11-14", status: "DRAFT", location: "Toronto", registrationStatus: "CLOSED", capacity: 80, tools: [] };
beforeEach(() => { vi.mocked(listScoringFormats).mockReset().mockResolvedValue({ formats: [{ format: "POINTS", label: "Points", description: "Route points", allowsFlashBonus: true, usesPointValues: true }, { format: "TOPS", label: "Tops and attempts", description: "Most tops", allowsFlashBonus: false, usesPointValues: false }] }); });
afterEach(cleanup);
function page(record = competition) { return render(<MemoryRouter initialEntries={["/gym-admin/competitions/selected?period=past"]}><SavedScoringSummary competition={record} /></MemoryRouter>); }
describe("US018 saved format on competition details", () => {
  it("shows an unconfigured event and a selected-event configuration link", () => {
    page(); expect(screen.getByText("Not configured")).toBeTruthy(); expect(listScoringFormats).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Configure scoring format" }).getAttribute("href")).toBe("/gym-admin/competitions/selected/scoring?period=past");
  });
  it.each([0, 10])("shows saved Points and bonus %i from competition details", async bonus => {
    page({ ...competition, scoring: { format: "POINTS", flashBonus: bonus, updatedAt: "2026-10-16T12:00:00Z" } });
    await screen.findByText("Points", { exact: true }); expect(screen.getByText(`${bonus} points`)).toBeTruthy(); expect(screen.getByText("Last saved")).toBeTruthy();
  });
  it("shows saved Tops without an inapplicable flash bonus", async () => {
    page({ ...competition, scoring: { format: "TOPS", flashBonus: 0 } }); await screen.findByText("Tops and attempts"); expect(screen.queryByText("Flash bonus")).toBeNull();
  });
  it("keeps the real format code if its label cannot be loaded", async () => {
    vi.mocked(listScoringFormats).mockRejectedValue(new Error("offline")); page({ ...competition, scoring: { format: "POINTS", flashBonus: 10 } });
    await waitFor(() => expect(listScoringFormats).toHaveBeenCalled()); expect(screen.getByText("POINTS", { exact: true })).toBeTruthy();
  });
});
