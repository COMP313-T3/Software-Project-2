import { describe, expect, it } from "vitest";
import { currentPage, pageLabel, pageName, problemPages, PROBLEMS_PER_PAGE } from "./problemPages.ts";

function problems(count: number, first = 1) {
  return Array.from({ length: count }, (_, index) => ({ routeNumber: String(first + index) }));
}

describe("US-031 the scorecard sheet's pages", () => {
  it("shows 10 problems at a time", () => {
    expect(PROBLEMS_PER_PAGE).toBe(10);
    expect(problemPages(problems(47)).map((page) => page.end - page.start)).toEqual([10, 10, 10, 10, 7]);
  });

  it("names each page after the problems it runs between", () => {
    const pages = problemPages(problems(47));

    expect(pages.map(pageLabel)).toEqual(["1-10", "11-20", "21-30", "31-40", "41-47"]);
    expect(pages.map(pageName)).toEqual([
      "Problems 1 to 10",
      "Problems 11 to 20",
      "Problems 21 to 30",
      "Problems 31 to 40",
      "Problems 41 to 47",
    ]);
    expect(pages.map((page) => page.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps a short list on one page, and has no page without problems", () => {
    expect(problemPages(problems(10)).map(pageLabel)).toEqual(["1-10"]);
    expect(problemPages(problems(3)).map(pageLabel)).toEqual(["1-3"]);
    expect(problemPages([])).toEqual([]);
  });

  it("names a page with one problem after that problem", () => {
    const [, last] = problemPages(problems(11));

    expect(pageLabel(last)).toBe("11");
    expect(pageName(last)).toBe("Problem 11");
  });

  it("uses the route numbers a filter left, with their gaps, and labels that aren't numbers", () => {
    const unfinished = [3, 5, 6, 8, 9, 10, 12, 13, 15, 16, 17, 18].map((number) => ({ routeNumber: String(number) }));

    expect(problemPages(unfinished).map(pageLabel)).toEqual(["3-16", "17-18"]);
    expect(problemPages([{ routeNumber: "A1" }, { routeNumber: "B2" }]).map(pageName)).toEqual(["Problems A1 to B2"]);
  });

  it("says where each page starts and ends in the list", () => {
    expect(problemPages(problems(23)).map(({ start, end }) => [start, end])).toEqual([
      [0, 10],
      [10, 20],
      [20, 23],
    ]);
  });

  it("holds as many problems as asked for", () => {
    expect(problemPages(problems(7), 3).map(pageLabel)).toEqual(["1-3", "4-6", "7"]);
  });
});

describe("US-031 the page the sheet shows", () => {
  const pages = problemPages(problems(47));

  it("shows the page asked for", () => {
    expect(currentPage(pages, 1)?.number).toBe(1);
    expect(currentPage(pages, 4)?.number).toBe(4);
  });

  it("falls back to the last page when the list got shorter", () => {
    expect(currentPage(problemPages(problems(18)), 5)?.number).toBe(2);
  });

  it("never goes before the first page", () => {
    expect(currentPage(pages, 0)?.number).toBe(1);
  });

  it("has no page when there are no problems", () => {
    expect(currentPage([], 1)).toBeUndefined();
  });
});
