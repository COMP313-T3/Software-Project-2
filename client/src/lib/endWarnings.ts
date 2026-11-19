/** How many minutes before a competition's end a Climber is warned that their scorecard closes, latest last (AC-024). */
export const END_WARNING_MINUTES = [15, 5] as const;

const END_WARNINGS_KEY = "topsend.endWarnings";

/** The warnings shown while browser storage can't be used, so each still opens once per visit. */
const shownWithoutStorage = new Map<string, number[]>();

function remembered(): Record<string, number[]> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(END_WARNINGS_KEY) ?? "{}") as unknown;
    return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

/**
 * The warnings this browser has shown for a competition, in minutes before its end. Like everything
 * else TopSend keeps in the browser, they're forgotten when the user logs out.
 *
 * @param competitionId The competition.
 */
export function shownEndWarnings(competitionId: string): number[] {
  const stored = remembered()[competitionId];
  const shown = Array.isArray(stored) ? stored.filter((minutes) => Number.isInteger(minutes)) : [];
  return [...new Set([...shown, ...(shownWithoutStorage.get(competitionId) ?? [])])];
}

/**
 * Remembers that a warning was shown, along with every earlier one, so a page opened late shows
 * only the warning for the time actually left, and no page shows it again.
 *
 * @param competitionId The competition.
 * @param minutes The warning shown, in minutes before the end.
 */
export function rememberEndWarning(competitionId: string, minutes: number) {
  const shown = [
    ...new Set([...shownEndWarnings(competitionId), ...END_WARNING_MINUTES.filter((each) => each >= minutes)]),
  ];
  try {
    window.localStorage.setItem(END_WARNINGS_KEY, JSON.stringify({ ...remembered(), [competitionId]: shown }));
  } catch {
    shownWithoutStorage.set(competitionId, shown);
  }
}

/**
 * The warning due now: the latest one whose time has come, unless this browser already showed it.
 * None is due once the competition has ended.
 *
 * @param competitionId The competition.
 * @param left Milliseconds left until the competition ends.
 * @returns The warning, in minutes before the end, or null.
 */
export function dueEndWarning(competitionId: string, left: number): number | null {
  if (left <= 0) return null;
  const latest = END_WARNING_MINUTES.filter((minutes) => left <= minutes * 60_000).at(-1);
  if (latest === undefined) return null;
  return shownEndWarnings(competitionId).includes(latest) ? null : latest;
}

/**
 * How long until the next warning's time comes.
 *
 * @param left Milliseconds left until the competition ends.
 * @returns Milliseconds until the next warning, or null when no warning is still ahead.
 */
export function nextEndWarningIn(left: number): number | null {
  const ahead = END_WARNING_MINUTES.map((minutes) => left - minutes * 60_000).filter((wait) => wait > 0);
  return ahead.length ? Math.min(...ahead) : null;
}
