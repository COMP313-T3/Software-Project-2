import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import { getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import type { ResultChange, Scorecard } from "../../lib/scorecardApi.ts";
import {
  longScorecardFixture,
  SCORECARD_COMPETITION as id,
  scorecardFixture,
  sentProblemThree,
} from "../../test/scorecardFixtures.ts";
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

/** The problems on the page and in the filter being shown. The others stay in the sheet, hidden, for printing. */
function problemTitles() {
  return [...document.querySelectorAll("tbody[data-state]:not([hidden]) th[scope='row'] > span:first-child")].map(
    (cell) => cell.textContent,
  );
}

function problemsFrom(first: number, last: number) {
  return Array.from({ length: last - first + 1 }, (_, index) => `Problem ${first + index}`);
}

/** The buttons in a problem's rows, by name: a circle's name is its label, and Sent it's is its text. */
function buttonsIn(title: string) {
  return within(problem(title))
    .queryAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent);
}

function circleStates(title: string) {
  return [...problem(title).querySelectorAll<HTMLElement>("[data-tour='attempts'] [data-state]")].map(
    (circle) => circle.dataset.state,
  );
}

function total(label: string) {
  return screen.getByRole("rowheader", { name: label }).nextElementSibling?.textContent;
}

beforeEach(() => {
  window.localStorage.clear();
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

describe("US-031 the sheet's opacity", () => {
  const slider = () => screen.getByRole("slider", { name: "Sheet opacity" }) as HTMLInputElement;
  const sheetOpacity = () =>
    screen
      .getByRole("region", { name: /Scorecard$/ })
      .querySelector<HTMLElement>("[style]")
      ?.style.getPropertyValue("--sheet-opacity");
  const toolbar = () => screen.getByRole("group", { name: "Show problems" }).parentElement!;

  /** Puts the filters where they'd be after the given scroll: stuck under the top bar once the rows pass under them. */
  function scrollTo(stuck: boolean) {
    const bar = toolbar();
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({ top: 64, bottom: 140 } as DOMRect);
    vi.spyOn(bar.previousElementSibling!, "getBoundingClientRect").mockReturnValue({
      top: stuck ? -400 : -12,
      bottom: stuck ? -300 : 64,
    } as DOMRect);
    fireEvent.scroll(window);
  }

  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  });

  it("starts as a solid white sheet, with a setting from 10% to 100% in steps of 10%", () => {
    renderSheet();

    expect(slider().min).toBe("10");
    expect(slider().max).toBe("100");
    expect(slider().step).toBe("10");
    expect(slider().value).toBe("100");
    expect(slider().getAttribute("aria-valuetext")).toBe("100%");
    expect(sheetOpacity()).toBe("100%");
  });

  it("makes the sheet's white background see-through as the Climber lowers it, down to 10%", () => {
    renderSheet();

    fireEvent.change(slider(), { target: { value: "40" } });
    expect(slider().getAttribute("aria-valuetext")).toBe("40%");
    expect(sheetOpacity()).toBe("40%");
    expect(slider().parentElement?.textContent).toContain("40%");

    fireEvent.change(slider(), { target: { value: "10" } });
    expect(sheetOpacity()).toBe("10%");
  });

  it("keeps the setting for the next visit in this browser", () => {
    renderSheet();
    fireEvent.change(slider(), { target: { value: "30" } });
    cleanup();

    renderSheet();

    expect(slider().value).toBe("30");
    expect(sheetOpacity()).toBe("30%");
  });

  it("still changes when the browser's storage can't be used", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderSheet();

    fireEvent.change(slider(), { target: { value: "60" } });

    expect(sheetOpacity()).toBe("60%");
  });

  it("gives the filters a solid background once the rows scroll under them", () => {
    renderSheet();
    fireEvent.change(slider(), { target: { value: "20" } });

    scrollTo(true);
    expect(toolbar().dataset.stuck).toBe("true");

    scrollTo(false);
    expect(toolbar().dataset.stuck).toBeUndefined();
  });

  it("leaves the solid sheet's filters as they are", () => {
    renderSheet();

    scrollTo(true);

    expect(toolbar().dataset.stuck).toBeUndefined();
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

describe("US-031 the sheet's pages of 10 problems", () => {
  const jump = () => screen.getByRole("group", { name: "Jump to problems" });
  const pager = () => screen.getByRole("navigation", { name: "Problem pages" });
  const pressed = () =>
    within(jump())
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => button.textContent);

  it("shows the first 10 problems, with a button for each range of 10", () => {
    renderSheet(longScorecardFixture());

    expect(problemTitles()).toEqual(problemsFrom(1, 10));
    const buttons = within(jump()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["1-10", "11-20", "21-23"]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Problems 1 to 10",
      "Problems 11 to 20",
      "Problems 21 to 23",
    ]);
    expect(pressed()).toEqual(["1-10"]);
  });

  it("jumps to a range of problems", () => {
    renderSheet(longScorecardFixture());

    fireEvent.click(screen.getByRole("button", { name: "Problems 21 to 23" }));

    expect(problemTitles()).toEqual(problemsFrom(21, 23));
    expect(pressed()).toEqual(["21-23"]);
    expect(within(pager()).getByText("Page 3 of 3")).toBeTruthy();
  });

  it("moves with Previous and Next under the problems, and stops at the first and last page", () => {
    renderSheet(longScorecardFixture());
    const previous = within(pager()).getByRole("button", { name: "Previous" }) as HTMLButtonElement;
    const next = within(pager()).getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(within(pager()).getByText("Page 1 of 3")).toBeTruthy();

    fireEvent.click(next);
    expect(problemTitles()).toEqual(problemsFrom(11, 20));
    expect(previous.disabled).toBe(false);

    fireEvent.click(next);
    expect(problemTitles()).toEqual(problemsFrom(21, 23));
    expect(next.disabled).toBe(true);

    fireEvent.click(previous);
    expect(problemTitles()).toEqual(problemsFrom(11, 20));
    expect(pressed()).toEqual(["11-20"]);
  });

  it("starts the new page from the top of its rows, where the keyboard continues", () => {
    renderSheet(longScorecardFixture());
    const table = screen.getByRole("table");
    table.scrollIntoView = vi.fn();
    vi.spyOn(jump().parentElement!, "getBoundingClientRect").mockReturnValue({ bottom: 180 } as DOMRect);
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({ top: -900 } as DOMRect);

    fireEvent.click(within(pager()).getByRole("button", { name: "Next" }));

    expect(table.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    expect(document.activeElement).toBe(table);
    expect(table.querySelector("caption")?.textContent).toBe("Your result on each problem, page 2 of 3");
  });

  it("leaves the focus on a range button, which already comes before the rows", () => {
    renderSheet(longScorecardFixture());
    const range = screen.getByRole("button", { name: "Problems 11 to 20" });
    range.focus();

    fireEvent.click(range);

    expect(document.activeElement).toBe(range);
  });

  it("has no page buttons when every problem fits on one page", () => {
    renderSheet();

    expect(screen.queryByRole("group", { name: "Jump to problems" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Problem pages" })).toBeNull();
    expect(screen.getByRole("table").querySelector("caption")?.textContent).toBe("Your result on each problem");
  });

  it("pages the problems a filter leaves, named after their own numbers, from its first page", () => {
    renderSheet(longScorecardFixture());
    fireEvent.click(screen.getByRole("button", { name: "Problems 11 to 20" }));

    fireEvent.click(screen.getByRole("button", { name: "Unfinished 21" }));

    expect(problemTitles()).toEqual(problemsFrom(3, 12));
    expect(within(jump()).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Problems 3 to 12",
      "Problems 13 to 22",
      "Problem 23",
    ]);
    expect(pressed()).toEqual(["3-12"]);
  });

  it("drops the page buttons when a filter leaves one page", () => {
    renderSheet(longScorecardFixture());

    fireEvent.click(screen.getByRole("button", { name: "Completed 2" }));

    expect(problemTitles()).toEqual(problemsFrom(1, 2));
    expect(screen.queryByRole("group", { name: "Jump to problems" })).toBeNull();
  });

  it("falls back to the last page left when the problems on the page shown are gone", () => {
    const card = longScorecardFixture();
    const { rerender } = renderSheet(card);
    fireEvent.click(screen.getByRole("button", { name: "Unfinished 21" }));
    fireEvent.click(screen.getByRole("button", { name: "Problem 23" }));
    expect(problemTitles()).toEqual(["Problem 23"]);

    const sent = longScorecardFixture();
    sent.routes[22] = { ...sent.routes[22], status: "SENT", statusLabel: "Sent", completed: true };
    sent.summary = { ...sent.summary, completed: 3, unfinished: 20 };
    rerender(<ScoreSheet scorecard={sent} changed={["route-23"]} note={null} />);

    expect(problemTitles()).toEqual(problemsFrom(13, 22));
    expect(pressed()).toEqual(["13-22"]);
  });

  it("keeps every problem in the sheet for printing, and hides the ones off the page", () => {
    renderSheet(longScorecardFixture());

    const rows = [...document.querySelectorAll<HTMLElement>("tbody[data-state]")];
    expect(rows).toHaveLength(23);
    expect(rows.filter((row) => row.hidden)).toHaveLength(13);
    expect(screen.queryByRole("rowheader", { name: /^Problem 11/ })).toBeNull();
  });

  it("announces a live update to a problem on another page", () => {
    const card = longScorecardFixture();
    const { rerender } = renderSheet(card);

    rerender(<ScoreSheet scorecard={card} changed={["route-15"]} note={null} />);

    expect(screen.getByRole("status").textContent).toBe("Problem 15 was updated: Not attempted.");
    expect(problemTitles()).toEqual(problemsFrom(1, 10));
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

    expect(screen.queryByRole("button", { name: /^(Mark|Clear|Go back|Take back|Sent it)/ })).toBeNull();
    expect(document.querySelector("[data-tour='attempts']")).toBeNull();
  });

  it("gives each problem a circle for every allowed attempt, in the problem's own row", () => {
    renderScoring();

    expect(within(problem("Problem 3")).getByRole("group", { name: "Record your result on Problem 3" })).toBeTruthy();
    expect(circleStates("Problem 3")).toEqual(["failed", "failed", "unused", "unused", "unused"]);
    expect(circleStates("Problem 2")).toEqual(["failed", "failed", "sent", "unused", "unused"]);
    expect(circleStates("Crimp Ladder")).toEqual(["sent", "unused", "unused", "unused", "unused"]);
    expect(circleStates("Problem 10")).toEqual(["unused", "unused", "unused", "unused", "unused"]);
  });

  it("draws as many circles as another competition allows attempts", () => {
    const card = scorecardFixture();
    card.scoring = { deductionPercent: 10, maxAttempts: 8, label: "10% off for each failed attempt, up to 8 attempts" };
    renderScoring(card);

    expect(circleStates("Problem 10")).toHaveLength(8);
  });

  it("marks the tapped circle and the ones before it as failed attempts", () => {
    const onRecord = renderScoring();

    fireEvent.click(screen.getByRole("button", { name: "Mark 4 attempts on Problem 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark 1 attempt on Problem 10" }));

    expect(onRecord.mock.calls).toEqual([
      ["route-3", { attempts: 4, sent: false }],
      ["route-10", { attempts: 1, sent: false }],
    ]);
  });

  it("records a send on the next attempt with Sent it", () => {
    const onRecord = renderScoring();

    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 10" }));

    expect(onRecord.mock.calls).toEqual([
      ["route-3", { attempts: 3, sent: true }],
      ["route-10", { attempts: 1, sent: true }],
    ]);
  });

  it("clears the last marked circle when it's tapped again, and the result once none is left", () => {
    const onRecord = renderScoring();

    fireEvent.click(screen.getByRole("button", { name: "Clear attempt 2 on Problem 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Take back the send on Problem 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Take back the send on Crimp Ladder" }));

    expect(onRecord.mock.calls).toEqual([
      ["route-3", { attempts: 1, sent: false }],
      ["route-2", { attempts: 2, sent: false }],
      ["route-1", null],
    ]);
  });

  it("goes back to an earlier marked circle's attempts", () => {
    const onRecord = renderScoring();

    fireEvent.click(screen.getByRole("button", { name: "Go back to 1 attempt on Problem 3" }));

    expect(onRecord.mock.calls).toEqual([["route-3", { attempts: 1, sent: false }]]);
  });

  it("offers only taking back the send on a completed problem, and has no Add attempt or Undo button", () => {
    renderScoring();

    expect(buttonsIn("Crimp Ladder")).toEqual(["Take back the send on Crimp Ladder"]);
    expect(buttonsIn("Problem 10")).toEqual([
      "Mark 1 attempt on Problem 10",
      "Mark 2 attempts on Problem 10",
      "Mark 3 attempts on Problem 10",
      "Mark 4 attempts on Problem 10",
      "Mark 5 attempts on Problem 10",
      "Sent it on Problem 10",
    ]);
    expect(screen.queryByRole("button", { name: /^(Add attempt|Undo)/ })).toBeNull();
  });

  it("stops at the competition's attempt limit", () => {
    const card = scorecardFixture();
    card.routes[2] = { ...card.routes[2], result: { ...card.routes[2].result!, attempts: 5, attemptsLeft: 0 } };
    renderScoring(card);

    expect(circleStates("Problem 3")).toEqual(["failed", "failed", "failed", "failed", "failed"]);
    expect(buttonsIn("Problem 3")).toEqual([
      "Go back to 1 attempt on Problem 3",
      "Go back to 2 attempts on Problem 3",
      "Go back to 3 attempts on Problem 3",
      "Go back to 4 attempts on Problem 3",
      "Clear attempt 5 on Problem 3",
    ]);
  });

  it("explains that a problem without points can't be scored", () => {
    renderScoring();

    expect(
      within(problem("Problem 12")).getByText("This problem doesn't have points yet, so it can't be scored."),
    ).toBeTruthy();
    expect(buttonsIn("Problem 12")).toEqual([]);
    expect(circleStates("Problem 12")).toEqual([]);
  });

  it("shows a save in progress and ignores more taps on that problem until it finishes", async () => {
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
    const waiting = () =>
      within(problem("Problem 3"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-disabled"));

    fireEvent.click(screen.getByRole("button", { name: "Mark 3 attempts on Problem 3" }));

    expect(within(problem("Problem 3")).getByText("Saving…")).toBeTruthy();
    expect(waiting().every((value) => value === "true")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark 4 attempts on Problem 3" }));
    expect(onRecord).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Mark 1 attempt on Problem 10" }).getAttribute("aria-disabled")).toBeNull();

    await act(async () => finish());

    expect(within(problem("Problem 3")).queryByText("Saving…")).toBeNull();
    expect(waiting().every((value) => value === null)).toBe(true);
  });

  it("keeps a circle focused while its result is saved", async () => {
    renderScoring();
    const circle = screen.getByRole("button", { name: "Mark 3 attempts on Problem 3" });
    circle.focus();

    fireEvent.click(circle);

    expect(document.activeElement).toBe(circle);
    await waitFor(() => expect(circle.getAttribute("aria-disabled")).toBeNull());
  });

  it("moves focus to the top's circle once Sent it leaves the row", async () => {
    const onRecord = vi.fn(async (_routeId: string, _change: ResultChange | null) => {});
    const { rerender } = render(
      <ScoreSheet scorecard={scorecardFixture()} changed={[]} note={NOTE} onRecord={onRecord} />,
    );
    const send = screen.getByRole("button", { name: "Sent it on Problem 3" });
    send.focus();

    fireEvent.click(send);
    await waitFor(() => expect(send.getAttribute("aria-disabled")).toBeNull());
    rerender(<ScoreSheet scorecard={sentProblemThree()} changed={["route-3"]} note={NOTE} onRecord={onRecord} />);

    expect(screen.queryByRole("button", { name: "Sent it on Problem 3" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Take back the send on Problem 3" }));
  });

  it("leaves focus where it is when a live update tops a problem", () => {
    const { rerender } = render(
      <ScoreSheet scorecard={scorecardFixture()} changed={[]} note={NOTE} onRecord={vi.fn(async () => {})} />,
    );
    const elsewhere = screen.getByRole("button", { name: "Print" });
    elsewhere.focus();

    rerender(
      <ScoreSheet scorecard={sentProblemThree()} changed={["route-3"]} note={NOTE} onRecord={vi.fn(async () => {})} />,
    );

    expect(document.activeElement).toBe(elsewhere);
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

    fireEvent.click(screen.getByRole("button", { name: "Mark 1 attempt on Problem 10" }));

    expect((await within(problem("Problem 10")).findByRole("alert")).textContent).toBe(
      "Couldn't save your result. Check your connection and try again.",
    );
  });
});
