import { useEffect, useState, useSyncExternalStore } from "react";
import {
  findCurrentLocation,
  forgetCurrentLocation,
  freshLocation,
  locationSnapshot,
  subscribeToLocation,
  type LocationSnapshot,
} from "../../lib/currentLocation.ts";
import type { LatLngLiteral } from "../../lib/googleMaps.ts";

export interface CurrentLocation {
  /** Where the Climber is, found in the last 10 minutes, or null while it isn't known. */
  point: LatLngLiteral | null;
  /** Why the location couldn't be found, in words the page can show. */
  problem: string | null;
  /** Asks the browser again, for a newer location or after a problem. */
  retry: () => void;
}

function ignore() {
  return undefined;
}

/**
 * Where the Climber is, while the search starts from their current location (US-025 criterion 6).
 * A location is used for up to 10 minutes, kept only in memory until the browser is asked again or
 * the Climber logs out, and never put in the address bar, so links and the browser's history
 * don't hold it. Once it's older, the browser is asked again before the next search uses it. After a problem, the browser is only asked again when the
 * Climber says so, or when the search starts from the location again.
 *
 * @param wanted Whether the applied search starts from the current location.
 * @param userId The logged-in Climber.
 * @returns The location or the problem finding it, and a way to ask again.
 */
export function useCurrentLocation(wanted: boolean, userId: string): CurrentLocation {
  const known = useSyncExternalStore(subscribeToLocation, locationSnapshot);
  const [start, setStart] = useState<{ wanted: boolean; known: LocationSnapshot }>({ wanted, known });
  if (start.wanted !== wanted) setStart({ wanted, known });
  const point = wanted ? freshLocation(userId) : null;
  const mine = known.userId === userId;
  // A problem that was already known when the search started from the location belongs to an
  // earlier question, so the browser is asked again instead of showing it.
  const problem = wanted && !point && mine && known !== start.known ? known.problem : null;
  const needsAsking = wanted && !point && !problem && !(mine && known.finding);

  useEffect(() => {
    if (needsAsking) findCurrentLocation(userId).catch(ignore);
  }, [needsAsking, userId]);

  return {
    point,
    problem,
    retry: () => {
      forgetCurrentLocation();
      findCurrentLocation(userId).catch(ignore);
    },
  };
}
