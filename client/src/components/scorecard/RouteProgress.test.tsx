import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scorecard } from "../../lib/scorecardApi.ts";
import { scorecardFixture, sentProblemThree } from "../../test/scorecardFixtures.ts";
import RouteProgress from "./RouteProgress.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderProgress(card: Scorecard = scorecardFixture(), changed: string[] = []) {
  return render(<RouteProgress routes={card.routes} summary={card.summary} scoring={card.scoring} changed={changed} />);
}

function rows() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

function row(title: string) {
  return rows().find((item) => within(item).queryByRole("heading", { name: title }))!;
}

describe("US-031 #31.4 route progress", () => {
  it("shows how many problems are completed", () => {
    renderProgress();

    expect(screen.getByText("2 of 5 problems completed")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Problems completed" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(bar.getAttribute("aria-valuetext")).toBe("2 of 5 problems completed");
  });

  it("lists every problem in wall order", () => {
    renderProgress();

    expect(rows().map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "Crimp Ladder",
      "Problem 2",
      "Problem 3",
      "Problem 10",
      "Problem 12",
    ]);
  });

  it("marks completed problems with their official result", () => {
    renderProgress();

    const flashed = row("Crimp Ladder");
    expect(flashed.dataset.state).toBe("completed");
    expect(within(flashed).getByText("Completed")).toBeTruthy();
    expect(within(flashed).getByText("Flashed").parentElement?.textContent).toBe("Completed, Flashed");
    expect(within(flashed).getByText("Problem 1, V2, 500 points")).toBeTruthy();
    expect(within(flashed).getByText("Attempts").nextElementSibling?.textContent).toBe("1");
    expect(within(flashed).getByText("Points").nextElementSibling?.textContent).toBe("500");
    expect(within(flashed).queryByText("Attempts left")).toBeNull();

    const sent = row("Problem 2");
    expect(within(sent).getByText("Completed")).toBeTruthy();
    expect(within(sent).getByText("Sent")).toBeTruthy();
    expect(within(sent).getByText("Points").nextElementSibling?.textContent).toBe("360");
  });

  it("marks unfinished problems, with attempts left on one already tried", () => {
    renderProgress();

    const attempted = row("Problem 3");
    expect(attempted.dataset.state).toBe("attempted");
    expect(within(attempted).getByText("Unfinished")).toBeTruthy();
    expect(within(attempted).getByText("Attempted, not sent yet")).toBeTruthy();
    expect(within(attempted).getByText("Attempts left").nextElementSibling?.textContent).toBe("3");
    expect(within(attempted).getByText("Points").nextElementSibling?.textContent).toBe("0");
  });

  it("shows problems without an official result yet", () => {
    renderProgress();

    const untouched = row("Problem 12");
    expect(untouched.dataset.state).toBe("open");
    expect(within(untouched).getByText("Unfinished")).toBeTruthy();
    expect(within(untouched).getByText("Not attempted yet")).toBeTruthy();
    expect(within(untouched).getByText("V6, points not set")).toBeTruthy();
    expect(within(untouched).queryByText("Attempts")).toBeNull();
    expect(within(untouched).queryByText("Points")).toBeNull();
  });

  it("doesn't count attempts left when the competition has no scoring yet", () => {
    const card = scorecardFixture();
    card.scoring = null;
    renderProgress(card);

    expect(within(row("Problem 3")).queryByText("Attempts left")).toBeNull();
  });

  it("filters to the unfinished or the completed problems", () => {
    renderProgress();
    const all = screen.getByRole("button", { name: "All 5" });
    expect(all.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Unfinished 3" }));
    expect(rows().map((item) => within(item).getByRole("heading").textContent)).toEqual(["Problem 3", "Problem 10", "Problem 12"]);
    expect(all.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Completed 2" }));
    expect(rows().map((item) => within(item).getByRole("heading").textContent)).toEqual(["Crimp Ladder", "Problem 2"]);
  });

  it("starts a newly chosen filter at the top of its list after scrolling past it", () => {
    renderProgress();
    const area = screen.getByRole("list").parentElement!;
    area.scrollIntoView = vi.fn();
    vi.spyOn(screen.getByRole("group", { name: "Show problems" }), "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ top: -600 } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Unfinished 3" }));

    expect(area.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start" });
  });

  it("leaves the page where it is when the list already starts below the filters", () => {
    renderProgress();
    const area = screen.getByRole("list").parentElement!;
    area.scrollIntoView = vi.fn();
    vi.spyOn(screen.getByRole("group", { name: "Show problems" }), "getBoundingClientRect").mockReturnValue({ bottom: 420 } as DOMRect);
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ top: 436 } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "Completed 2" }));

    expect(area.scrollIntoView).not.toHaveBeenCalled();
  });

  it("says so when a filter has nothing to show", () => {
    const card = scorecardFixture();
    card.routes = card.routes.slice(3);
    card.summary = { ...card.summary, routeCount: 2, completed: 0, unfinished: 2 };
    renderProgress(card);

    fireEvent.click(screen.getByRole("button", { name: "Completed 0" }));

    expect(screen.getByText("You haven't completed a problem yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("says so when the competition has no problems yet", () => {
    const card = scorecardFixture();
    card.routes = [];
    card.summary = { ...card.summary, routeCount: 0, completed: 0, unfinished: 0 };
    renderProgress(card);

    expect(screen.getByText("0 of 0 problems completed")).toBeTruthy();
    expect(screen.getByText("This competition doesn't have any problems on its scorecard yet.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Show problems" })).toBeNull();
  });

  it("points out and announces the problem a live update changed", () => {
    const { rerender } = renderProgress();
    expect(screen.getByRole("status").textContent).toBe("");

    const updated = sentProblemThree();
    rerender(<RouteProgress routes={updated.routes} summary={updated.summary} scoring={updated.scoring} changed={["route-3"]} />);

    const changed = row("Problem 3");
    expect(changed.dataset.changed).toBe("true");
    expect(within(changed).getByText("Completed")).toBeTruthy();
    expect(within(changed).getByText("Updated")).toBeTruthy();
    expect(row("Problem 2").dataset.changed).toBeUndefined();
    expect(screen.getByText("3 of 5 problems completed")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Problem 3 was updated: Sent.");
  });

  it("announces how many problems changed when an update touched several", () => {
    renderProgress(scorecardFixture(), ["route-3", "route-10"]);

    expect(screen.getByRole("status").textContent).toBe("2 problems were updated.");
  });
});
