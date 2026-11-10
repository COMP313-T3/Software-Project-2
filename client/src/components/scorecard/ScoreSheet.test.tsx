import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import { getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import type { ResultChange, Scorecard } from "../../lib/scorecardApi.ts";
import { SCORECARD_COMPETITION as id, scorecardFixture, sentProblemThree } from "../../test/scorecardFixtures.ts";
import ScoreSheet from "./ScoreSheet.tsx";

vi.mock("../../lib/displaySettingsApi.ts", () => ({ getPublicDisplay: vi.fn() }));

const NOTE = "Scoring is open today.";

function renderSheet(card: Scorecard = scorecardFixture(), changed: string[] = [], note: string | null = null) {
  return render(<ScoreSheet scorecard={card} changed={changed} note={note} />);
}

function renderScoring(
  card: Scorecard = scorecardFixture(),
  onRecord = vi.fn(async (_routeId: string, _change: ResultChange | null) => {}),
) {
  render(<ScoreSheet scorecard={card} changed={[]} note={NOTE} onRecord={onRecord} />);
  return onRecord;
}

/** The rows of one problem: its own row, and its recording row while scoring is open. */
function problem(title: string) {
  return screen.getByRole("rowheader", { name: new RegExp(`^${title}`) }).closest("tbody")!;
}

/** The text of each cell in a problem's own row. */
function cells(title: string) {
  return [...problem(title).querySelector("tr")!.querySelectorAll("th, td")].map((cell) => cell.textContent);
}

function problemTitles() {
  return [...document.querySelectorAll("tbody[data-state] th[scope='row'] > span:first-child")].map(
    (cell) => cell.textContent,
  );
}

function buttonsIn(title: string) {
  return within(problem(title))
    .queryAllByRole("button")
    .map((button) => button.textContent);
}

function total(label: string) {
  return screen.getByRole("rowheader", { name: label }).nextElementSibling?.textContent;
}

beforeEach(() => {
  vi.mocked(getPublicDisplay)
    .mockReset()
    .mockResolvedValue({ competitionId: id, settings: { logo: null, background: null, sponsors: [] } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("US-031 the scorecard sheet", () => {
  it("is part of the page, titled like a paper scorecard, not a dialog", () => {
    renderSheet();

    const sheet = screen.getByRole("region", { name: "US031 Scorecard Test Scorecard" });
    expect(within(sheet).getByRole("heading", { level: 2 }).textContent).toBe("US031 Scorecard Test Scorecard");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("shows the point system, the Climber and the competition", () => {
    renderSheet(scorecardFixture(), [], NOTE);

    expect(
      screen.getByText(
        "Each problem has its own points: 20% off for each failed attempt, up to 5 attempts. A top on the first attempt keeps its full points.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Name").nextElementSibling?.textContent).toBe("Sam Rivera");
    expect(screen.getByText("Division").nextElementSibling?.textContent).toBe("Open");
    expect(screen.getByText("Date").nextElementSibling?.textContent).toBe("Nov 21, 2026");
    expect(screen.getByText("Gym").nextElementSibling?.textContent).toBe("North Wall");
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("shows the start time with the date when the competition has one", () => {
    const card = scorecardFixture();
    card.competition.startTime = "10:00";
    renderSheet(card);

    expect(screen.getByText("Date").nextElementSibling?.textContent).toBe("Nov 21, 2026, 10:00 a.m.");
  });

  it("has a column for the number, problem, grade, attempts and points, and none for flashes", () => {
    renderSheet();

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "No.",
      "Problem",
      "Grade",
      "Attempts",
      "Points",
    ]);
    expect(screen.queryByText(/flash/i)).toBeNull();
  });

  it("lists every problem in wall order", () => {
    renderSheet();

    expect(problemTitles()).toEqual(["Crimp Ladder", "Problem 2", "Problem 3", "Problem 10", "Problem 12"]);
  });

  it("shows each problem's attempts against the competition's attempt limit", () => {
    renderSheet();

    expect(cells("Crimp Ladder")).toEqual(["1", "Crimp Ladder500 pointsSent", "V2", "1/51 of 5 attempts", "500"]);
    expect(cells("Problem 2")).toEqual(["2", "Problem 2500 pointsSent", "V3", "3/53 of 5 attempts", "360"]);
    expect(cells("Problem 3")).toEqual(["3", "Problem 3500 pointsAttempted", "V4", "2/52 of 5 attempts", "0"]);
    expect(cells("Problem 10")).toEqual([
      "10",
      "Problem 10500 pointsNot attempted",
      "V5",
      "0/50 of 5 attempts",
      "No points yet",
    ]);
    const attempts = problem("Problem 3").querySelector("tr")!.children[3];
    expect(attempts.querySelector("[aria-hidden='true']")?.textContent).toBe("2/5");
  });

  it("uses another competition's own limit", () => {
    const card = scorecardFixture();
    card.scoring = { deductionPercent: 10, maxAttempts: 6, label: "10% off for each failed attempt, up to 6 attempts" };
    renderSheet(card);

    expect(problem("Problem 2").querySelector("[aria-hidden='true']")?.textContent).toBe("3/6");
  });

  it("marks completed problems, and says where the Climber is on the others, without saying flashed", () => {
    renderSheet();

    expect(problem("Crimp Ladder").dataset.state).toBe("completed");
    expect(within(problem("Crimp Ladder")).getByText("Sent")).toBeTruthy();
    expect(problem("Problem 2").dataset.state).toBe("completed");
    expect(problem("Problem 3").dataset.state).toBe("attempted");
    expect(within(problem("Problem 3")).getByText("Attempted")).toBeTruthy();
    expect(problem("Problem 10").dataset.state).toBe("open");
    expect(within(problem("Problem 12")).getByText("Points not set")).toBeTruthy();
  });

  it("says when a problem has no attempts left", () => {
    const card = scorecardFixture();
    card.routes[2] = { ...card.routes[2], result: { ...card.routes[2].result!, attempts: 5, attemptsLeft: 0 } };
    renderSheet(card);

    expect(within(problem("Problem 3")).getByText("No attempts left")).toBeTruthy();
    expect(problem("Problem 3").querySelector("[aria-hidden='true']")?.textContent).toBe("5/5");
  });

  it("shows the attempts alone when the competition has no scoring yet", () => {
    const card = scorecardFixture();
    card.scoring = null;
    renderSheet(card);

    expect(cells("Problem 3")[3]).toBe("2");
    expect(screen.getByText("The gym hasn't set up scoring yet, so problems don't earn points yet.")).toBeTruthy();
  });

  it("adds up the totals, without a flash count", () => {
    renderSheet();

    expect(total("Problems completed")).toBe("2 of 5");
    expect(total("Total attempts")).toBe("6");
    expect(total("Total score")).toBe("860");
    expect(screen.queryByRole("rowheader", { name: "Flashes" })).toBeNull();
  });

  it("shows how many problems are completed", () => {
    renderSheet();

    expect(screen.getByText("2 of 5 problems completed")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Problems completed" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(bar.getAttribute("aria-valuetext")).toBe("2 of 5 problems completed");
  });

  it("handles a missing name, division and gym", () => {
    const card = scorecardFixture();
    card.climber = null;
    card.registration.division = null;
    card.competition.gym = null;
    renderSheet(card);

    expect(screen.getByText("Name").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.getByText("Division").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.getByText("Gym").nextElementSibling?.textContent).toBe("Not available");
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

describe("US-031 the sheet's background", () => {
  const backdrop = () => document.querySelector<HTMLElement>("[data-background]");

  it("gets the mountains background when the gym hasn't chosen one", async () => {
    renderSheet();

    await waitFor(() => expect(getPublicDisplay).toHaveBeenCalledWith(id, expect.any(AbortSignal)));
    expect(backdrop()?.dataset.background).toBe("mountains");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the background, logo and sponsors the gym set up for the competition", async () => {
    vi.mocked(getPublicDisplay).mockResolvedValue({
      competitionId: id,
      settings: {
        logo: { src: "https://example.com/logo.png", name: "Event logo" },
        background: { src: "https://example.com/night.svg", name: "Night sky background", reference: "night" },
        sponsors: [{ src: "https://example.com/sponsor.png", name: "Sponsor 1" }],
      },
    });
    renderSheet();

    expect(((await screen.findByRole("img", { name: "Event logo" })) as HTMLImageElement).src).toBe(
      "https://example.com/logo.png",
    );
    expect(backdrop()?.dataset.background).toBe("night");
    expect(backdrop()?.style.backgroundImage).toBe('url("https://example.com/night.svg")');
    expect(
      within(screen.getByRole("region", { name: "Sponsors" })).getByRole("img", { name: "Sponsor 1" }),
    ).toBeTruthy();
  });

  it("keeps the default background and still shows the sheet when the gym's display can't be loaded", async () => {
    vi.mocked(getPublicDisplay).mockRejectedValue(new Error("offline"));
    renderSheet();

    await waitFor(() => expect(getPublicDisplay).toHaveBeenCalled());
    expect(total("Total score")).toBe("860");
    expect(backdrop()?.dataset.background).toBe("mountains");
  });

  it("leaves out a logo that can't be loaded", async () => {
    vi.mocked(getPublicDisplay).mockResolvedValue({
      competitionId: id,
      settings: {
        logo: { src: "https://example.com/missing.png", name: "Event logo" },
        background: null,
        sponsors: [],
      },
    });
    renderSheet();

    fireEvent.error(await screen.findByRole("img", { name: "Event logo" }));

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("prints the page, which prints the sheet alone", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    expect(print).toHaveBeenCalledOnce();
  });
});

describe("US-031 filtering the sheet", () => {
  it("filters to the unfinished or the completed problems", () => {
    renderSheet();
    const all = screen.getByRole("button", { name: "All 5" });
    expect(all.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Unfinished 3" }));
    expect(problemTitles()).toEqual(["Problem 3", "Problem 10", "Problem 12"]);
    expect(all.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Completed 2" }));
    expect(problemTitles()).toEqual(["Crimp Ladder", "Problem 2"]);
    expect(total("Total score")).toBe("860");
  });

  it("starts a newly chosen filter at the top of its rows after scrolling past them", () => {
    renderSheet();
    const table = screen.getByRole("table");
    table.scrollIntoView = vi.fn();
    const toolbar = screen.getByRole("group", { name: "Show problems" }).parentElement!;
    vi.spyOn(toolbar, "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({ top: -600 } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Unfinished 3" }));

    expect(table.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
  });

  it("leaves the page where it is when the rows already start below the filters", () => {
    renderSheet();
    const table = screen.getByRole("table");
    table.scrollIntoView = vi.fn();
    const toolbar = screen.getByRole("group", { name: "Show problems" }).parentElement!;
    vi.spyOn(toolbar, "getBoundingClientRect").mockReturnValue({ bottom: 420 } as DOMRect);
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({ top: 436 } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Completed 2" }));

    expect(table.scrollIntoView).not.toHaveBeenCalled();
  });

  it("says so when a filter has nothing to show, and keeps the totals", () => {
    const card = scorecardFixture();
    card.routes = card.routes.slice(3);
    card.summary = { ...card.summary, routeCount: 2, completed: 0, unfinished: 2, totalAttempts: 0, totalScore: 0 };
    renderSheet(card);

    fireEvent.click(screen.getByRole("button", { name: "Completed 0" }));

    expect(screen.getByText("You haven't completed a problem yet.")).toBeTruthy();
    expect(problemTitles()).toEqual([]);
    expect(total("Problems completed")).toBe("0 of 2");
  });

  it("says so when the competition has no problems yet", () => {
    const card = scorecardFixture();
    card.routes = [];
    card.summary = { ...card.summary, routeCount: 0, completed: 0, unfinished: 0 };
    renderSheet(card);

    expect(screen.getByText("This competition doesn't have any problems on its scorecard yet.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Show problems" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("US-031 live updates on the sheet", () => {
  it("points out and announces the problem a live update changed", () => {
    const { rerender } = renderSheet();
    expect(screen.getByRole("status").textContent).toBe("");

    rerender(<ScoreSheet scorecard={sentProblemThree()} changed={["route-3"]} note={null} />);

    const changed = problem("Problem 3");
    expect(changed.dataset.changed).toBe("true");
    expect(changed.dataset.state).toBe("completed");
    expect(within(changed).getByText("Updated")).toBeTruthy();
    expect(problem("Problem 2").dataset.changed).toBeUndefined();
    expect(cells("Problem 3").slice(3)).toEqual(["3/53 of 5 attempts", "360"]);
    expect(screen.getByText("3 of 5 problems completed")).toBeTruthy();
    expect(total("Total score")).toBe("1220");
    expect(screen.getByRole("status").textContent).toBe("Problem 3 was updated: Sent.");
  });

  it("announces how many problems changed when an update touched several", () => {
    renderSheet(scorecardFixture(), ["route-3", "route-10"]);

    expect(screen.getByRole("status").textContent).toBe("2 problems were updated.");
  });
});

describe("US-031 Climbers scoring their own problems on the sheet", () => {
  it("is read only unless scoring is open", () => {
    renderSheet();

    expect(screen.queryByRole("button", { name: /^(Add attempt|Sent it|Undo)/ })).toBeNull();
  });

  it("records one more attempt, or a send on the next attempt, in the problem's own row", () => {
    const onRecord = renderScoring();

    expect(within(problem("Problem 3")).getByRole("group", { name: "Record your result on Problem 3" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add attempt on Problem 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 10" }));

    expect(onRecord.mock.calls).toEqual([
      ["route-3", { attempts: 3, sent: false }],
      ["route-10", { attempts: 1, sent: true }],
    ]);
  });

  it("takes back the last attempt, and clears a result that had only one", () => {
    const onRecord = renderScoring();

    fireEvent.click(screen.getByRole("button", { name: "Undo last attempt on Problem 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo last attempt on Problem 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo last attempt on Crimp Ladder" }));

    expect(onRecord.mock.calls).toEqual([
      ["route-3", { attempts: 1, sent: false }],
      ["route-2", { attempts: 2, sent: false }],
      ["route-1", null],
    ]);
  });

  it("offers only Undo on a completed problem, and nothing to undo before the first attempt", () => {
    renderScoring();

    expect(buttonsIn("Crimp Ladder")).toEqual(["Undo last attempt on Crimp Ladder"]);
    expect(buttonsIn("Problem 10")).toEqual(["Add attempt on Problem 10", "Sent it on Problem 10"]);
    expect(buttonsIn("Problem 3")).toEqual([
      "Add attempt on Problem 3",
      "Sent it on Problem 3",
      "Undo last attempt on Problem 3",
    ]);
  });

  it("stops at the competition's attempt limit", () => {
    const card = scorecardFixture();
    card.routes[2] = { ...card.routes[2], result: { ...card.routes[2].result!, attempts: 5, attemptsLeft: 0 } };
    renderScoring(card);

    expect(buttonsIn("Problem 3")).toEqual(["Undo last attempt on Problem 3"]);
  });

  it("explains that a problem without points can't be scored", () => {
    renderScoring();

    expect(
      within(problem("Problem 12")).getByText("This problem doesn't have points yet, so it can't be scored."),
    ).toBeTruthy();
    expect(buttonsIn("Problem 12")).toEqual([]);
  });

  it("shows a save in progress and blocks more taps on that problem until it finishes", async () => {
    let finish = () => {};
    const onRecord = renderScoring(
      scorecardFixture(),
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add attempt on Problem 3" }));

    expect(within(problem("Problem 3")).getByText("Saving…")).toBeTruthy();
    expect(
      within(problem("Problem 3"))
        .getAllByRole("button")
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 3" }));
    expect(onRecord).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Add attempt on Problem 10" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    await act(async () => finish());

    expect(within(problem("Problem 3")).queryByText("Saving…")).toBeNull();
    expect((screen.getByRole("button", { name: "Add attempt on Problem 3" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows why a save failed, in the problem's row", async () => {
    const message = "This competition is over, so your results can't be changed anymore.";
    renderScoring(
      scorecardFixture(),
      vi.fn(async () => {
        throw new ApiError(409, "SCORING_CLOSED", message);
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 3" }));

    expect((await within(problem("Problem 3")).findByRole("alert")).textContent).toBe(message);
  });

  it("keeps connection details out of a failed save's message", async () => {
    renderScoring(
      scorecardFixture(),
      vi.fn(async () => {
        throw new ApiError(0, "NETWORK_ERROR", "fetch failed");
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add attempt on Problem 10" }));

    expect((await within(problem("Problem 10")).findByRole("alert")).textContent).toBe(
      "Couldn't save your result. Check your connection and try again.",
    );
  });
});
