/** How many problems the scorecard sheet shows at a time (US-031). */
export const PROBLEMS_PER_PAGE = 10;

/** One page of the sheet: where it starts and ends in the list, and the problems it runs between. */
export interface ProblemPage {
  /** The page's number, from 1. */
  number: number;
  /** The index of the page's first problem in the list. */
  start: number;
  /** The index after its last problem. */
  end: number;
  /** The route number of its first problem. */
  from: string;
  /** The route number of its last problem. */
  to: string;
}

/**
 * Splits the problems on the sheet into pages, each named after the route numbers it runs between,
 * since those are what a Climber looks for on the wall. A filter that leaves out problems leaves
 * gaps in the numbers, so a page of unfinished problems may run from 13 to 27.
 *
 * @param problems The problems to show, in the sheet's order.
 * @param size How many problems one page holds.
 */
export function problemPages(problems: { routeNumber: string }[], size = PROBLEMS_PER_PAGE): ProblemPage[] {
  const pages: ProblemPage[] = [];
  for (let start = 0; start < problems.length; start += size) {
    const end = Math.min(start + size, problems.length);
    pages.push({
      number: pages.length + 1,
      start,
      end,
      from: problems[start].routeNumber,
      to: problems[end - 1].routeNumber,
    });
  }
  return pages;
}

/**
 * The page to show: the one asked for, or the last one when the list got shorter than it, such as
 * after the last unfinished problem of a page was sent.
 *
 * @param pages The sheet's pages.
 * @param number The page asked for.
 */
export function currentPage(pages: ProblemPage[], number: number): ProblemPage | undefined {
  return pages[Math.min(Math.max(number, 1), pages.length) - 1];
}

/**
 * A page's short name for its button, such as 11-20, or one number when it holds one problem.
 *
 * @param page The page.
 */
export function pageLabel(page: ProblemPage): string {
  return page.from === page.to ? page.from : `${page.from}-${page.to}`;
}

/**
 * A page's name in words, such as Problems 11 to 20.
 *
 * @param page The page.
 */
export function pageName(page: ProblemPage): string {
  return page.from === page.to ? `Problem ${page.from}` : `Problems ${page.from} to ${page.to}`;
}
