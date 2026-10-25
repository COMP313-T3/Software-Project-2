import type { LatLngLiteral } from "./googleMaps.ts";

/** Why the browser couldn't give the Climber's location. */
export type LocationProblem = "unsupported" | "denied" | "unavailable" | "timeout";

const PROBLEM_MESSAGES: Record<LocationProblem, string> = {
  unsupported: "This browser can't share your location. Search for a place instead.",
  denied: "TopSend isn't allowed to use your location. Allow it in your browser's site settings, or search for a place instead.",
  unavailable: "Your location couldn't be found. Try again, or search for a place instead.",
  timeout: "Finding your location took too long. Try again, or search for a place instead.",
};

/** A location the browser couldn't give, with a message that says what to do next. */
export class CurrentLocationError extends Error {
  readonly reason: LocationProblem;

  constructor(reason: LocationProblem) {
    super(PROBLEM_MESSAGES[reason]);
    this.name = "CurrentLocationError";
    this.reason = reason;
  }
}

/** About 110 m. Enough to compare gyms, without pinpointing someone's home. */
const DECIMAL_PLACES = 3;
/** A found location is used again for this long before the browser is asked again. */
export const LOCATION_KEEP_MS = 10 * 60 * 1000;
/** The oldest location the browser may answer with when it's asked. */
const BROWSER_MAX_AGE_MS = 60 * 1000;
/** How long the browser has to find the location once it's allowed to. */
const TIMEOUT_MS = 10_000;
/**
 * The browser's own time limit starts once permission is given, so a question the Climber never
 * answers would keep the search waiting. After this long, it's treated as taking too long, and an
 * answer that comes later is ignored.
 */
const GIVE_UP_MS = 45_000;
/** The Geolocation API's codes for a refused permission and for running out of time. */
const PERMISSION_DENIED = 1;
const TIMED_OUT = 3;

/** What's known about the Climber's location: the last one found, or why it couldn't be. */
export interface LocationSnapshot {
  /** The Climber it belongs to, so it's never used for anyone else. */
  userId: string | null;
  point: LatLngLiteral | null;
  /** When point was found, in milliseconds since 1970. */
  foundAt: number;
  /** Why the last attempt failed, in words the page can show. */
  problem: string | null;
  /** Whether the browser is being asked right now. */
  finding: boolean;
}

const NOTHING_KNOWN: LocationSnapshot = { userId: null, point: null, foundAt: 0, problem: null, finding: false };

let snapshot = NOTHING_KNOWN;
let pending: { userId: string; result: Promise<LatLngLiteral> } | null = null;
const listeners = new Set<() => void>();

function update(changes: Partial<LocationSnapshot>) {
  snapshot = { ...snapshot, ...changes };
  for (const listener of listeners) listener();
}

function rounded(degrees: number) {
  return Number(degrees.toFixed(DECIMAL_PLACES));
}

/**
 * Calls the listener whenever what's known about the location changes, for useSyncExternalStore.
 *
 * @param listener Called after each change.
 * @returns A function that stops the calls.
 */
export function subscribeToLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What's known about the location now. The same object until something changes. */
export function locationSnapshot(): LocationSnapshot {
  return snapshot;
}

/**
 * The location found for this Climber in the last 10 minutes, if any. It's only kept in memory,
 * until the browser is asked again or the Climber logs out, and it's never saved in the browser or
 * sent anywhere but the competition search.
 *
 * @param userId The logged-in Climber.
 * @param now The time to compare with, now by default.
 * @returns The location, rounded to about 110 m, or null.
 */
export function freshLocation(userId: string, now = Date.now()): LatLngLiteral | null {
  const { point, foundAt } = snapshot;
  return snapshot.userId === userId && point && now - foundAt < LOCATION_KEEP_MS ? point : null;
}

/** Forgets the location and any problem finding it, so the next search asks the browser again. */
export function forgetCurrentLocation() {
  pending = null;
  update(NOTHING_KNOWN);
}

/**
 * Asks the browser where the Climber is (US-025 criterion 6). The browser asks the Climber for
 * permission first. A location found in the last 10 minutes is used again instead, and searches
 * that ask at the same moment share one question. Only the latest question changes what's known.
 *
 * @param userId The logged-in Climber.
 * @returns The location, rounded to about 110 m.
 * @throws {CurrentLocationError} When the browser can't share it, isn't allowed to, or can't find it.
 */
export function findCurrentLocation(userId: string): Promise<LatLngLiteral> {
  const known = freshLocation(userId);
  if (known) return Promise.resolve(known);
  if (pending?.userId === userId) return pending.result;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    const error = new CurrentLocationError("unsupported");
    update({ userId, point: null, foundAt: 0, problem: error.message, finding: false });
    return Promise.reject(error);
  }

  let resolveResult: (point: LatLngLiteral) => void = () => undefined;
  let rejectResult: (error: CurrentLocationError) => void = () => undefined;
  const result = new Promise<LatLngLiteral>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const attempt = { userId, result };
  pending = attempt;
  update({ userId, point: null, foundAt: 0, problem: null, finding: true });

  let settled = false;
  function finish(point: LatLngLiteral | null, reason: LocationProblem = "unavailable") {
    if (settled) return;
    settled = true;
    window.clearTimeout(giveUp);
    const latest = pending === attempt;
    if (latest) pending = null;
    if (point) {
      if (latest) update({ userId, point, foundAt: Date.now(), problem: null, finding: false });
      resolveResult(point);
      return;
    }
    const error = new CurrentLocationError(reason);
    if (latest) update({ userId, problem: error.message, finding: false });
    rejectResult(error);
  }

  const giveUp = window.setTimeout(() => finish(null, "timeout"), GIVE_UP_MS);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => finish({ lat: rounded(coords.latitude), lng: rounded(coords.longitude) }),
    (error) => finish(null, error.code === PERMISSION_DENIED ? "denied" : error.code === TIMED_OUT ? "timeout" : "unavailable"),
    { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: BROWSER_MAX_AGE_MS },
  );
  return result;
}

/**
 * The message for a location that couldn't be found.
 *
 * @param error What findCurrentLocation threw.
 * @returns Text that says what to do next.
 */
export function locationProblem(error: unknown): string {
  return error instanceof CurrentLocationError ? error.message : PROBLEM_MESSAGES.unavailable;
}
