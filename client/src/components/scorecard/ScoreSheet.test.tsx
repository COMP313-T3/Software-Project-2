import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import type { Scorecard } from "../../lib/scorecardApi.ts";
import { SCORECARD_COMPETITION as id, scorecardFixture, sentProblemThree } from "../../test/scorecardFixtures.ts";
import ScoreSheet from "./ScoreSheet.tsx";

vi.mock("../../lib/displaySettingsApi.ts", () => ({ getPublicDisplay: vi.fn() }));

const onClose = vi.fn();
const NOTE = "Scoring is open today.";

function renderSheet(card: Scorecard = scorecardFixture(), note: string | null = NOTE) {
  return render(<ScoreSheet scorecard={card} note={note} onClose={onClose} />);
}

function cells(problem: string) {
  const row = screen.getByRole("rowheader", { name: problem }).closest("tr")!;
  return [...row.querySelectorAll("th, td")].map((cell) => cell.textContent);
}

function total(label: string) {
  return screen.getByRole("rowheader", { name: label }).nextElementSibling?.textContent;
}

beforeEach(() => {
  onClose.mockReset();
  vi.mocked(getPublicDisplay).mockReset().mockResolvedValue({
    competitionId: id,
    settings: { logo: null, background: null, sponsors: [] },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("US-031 the score sheet", () => {
  it("opens as a dialog titled like a paper scorecard", () => {
    renderSheet();

    const dialog = screen.getByRole("dialog", { name: "US031 Scorecard Test Scorecard" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("US031 Scorecard Test Scorecard");
  });

  it("shows the point system, the Climber and the competition", () => {
    renderSheet();

    expect(screen.getByText("Each problem has its own points: 20% off for each failed attempt, up to 5 attempts. A flash keeps its full points.")).toBeTruthy();
    expect(screen.getByText("Name").nextElementSibling?.textContent).toBe("Sam Rivera");
    expect(screen.getByText("Division").nextElementSibling?.textContent).toBe("Open");
    expect(screen.getByText("Date").nextElementSibling?.textContent).toBe("Nov 21, 2026");
    expect(screen.getByText("Gym").nextElementSibling?.textContent).toBe("North Wall");
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("lists every problem with its attempts, flash and points, and leaves untried problems blank", () => {
    renderSheet();

    expect(screen.getAllByRole("rowheader").slice(0, 5).map((cell) => cell.textContent)).toEqual([
      "Crimp Ladder",
      "Problem 2",
      "Problem 3",
      "Problem 10",
      "Problem 12",
    ]);
    expect(cells("Crimp Ladder")).toEqual(["1", "Crimp Ladder", "V2", "1", "Yes", "500"]);
    expect(cells("Problem 3")).toEqual(["3", "Problem 3", "V4", "2", "No", "0"]);
    expect(cells("Problem 10")).toEqual(["10", "Problem 10", "V5", "", "No", ""]);
  });

  it("adds up the overall tally", () => {
    renderSheet();

    expect(total("Problems completed")).toBe("2 of 5");
    expect(total("Flashes")).toBe("1");
    expect(total("Total attempts")).toBe("6");
    expect(total("Total score")).toBe("860");
  });

  it("stays current when the scorecard changes while it is open", () => {
    const { rerender } = renderSheet();

    rerender(<ScoreSheet scorecard={sentProblemThree()} note={NOTE} onClose={onClose} />);

    expect(cells("Problem 3")).toEqual(["3", "Problem 3", "V4", "3", "No", "360"]);
    expect(total("Total score")).toBe("1220");
  });

  it("handles a missing name, division and gym, and scoring that isn't set up", () => {
    const card = scorecardFixture();
    card.climber = null;
    card.registration.division = null;
    card.competition.gym = null;
    card.scoring = null;
    renderSheet(card, null);

    expect(screen.getByText("Name").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.getByText("Division").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.getByText("Gym").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.getByText("The gym hasn't set up scoring yet.")).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("shows the logo and background the gym set up for the competition", async () => {
    vi.mocked(getPublicDisplay).mockResolvedValue({
      competitionId: id,
      settings: {
        logo: { src: "https://example.com/logo.png", name: "Event logo" },
        background: { src: "https://example.com/wall.jpg", name: "Display background" },
        sponsors: [],
      },
    });
    renderSheet();

    expect(((await screen.findByRole("img", { name: "Event logo" })) as HTMLImageElement).src).toBe("https://example.com/logo.png");
    expect(getPublicDisplay).toHaveBeenCalledWith(id, expect.any(AbortSignal));
    expect([...document.querySelectorAll("img")].map((image) => image.getAttribute("src"))).toContain("https://example.com/wall.jpg");
  });

  it("still shows the sheet when the gym's images can't be loaded", async () => {
    vi.mocked(getPublicDisplay).mockRejectedValue(new Error("offline"));
    renderSheet();

    await waitFor(() => expect(getPublicDisplay).toHaveBeenCalled());
    expect(total("Total score")).toBe("860");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("prints the sheet", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    expect(print).toHaveBeenCalledOnce();
  });

  it("closes and returns focus to the button that opened it", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
