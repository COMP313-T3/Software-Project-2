import { logger } from "../utils/logger.js";
import { lookUpAddress } from "./geocodingService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const MAX_REMEMBERED = 1_000;
const MAX_LOOKUPS_PER_CALL = 20;

function keyOf(address) {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Finds where typed addresses are, for map pins, with Google's Geocoding API v4. Each answer is
 * kept in memory for a day, never in the database, so Google is asked about an address at most
 * once a day, and lookups of the same address at the same time share one request. A lookup that
 * fails is tried again after 5 minutes. Each call starts at most 20 new lookups, so a search with
 * many new addresses still answers quickly, and later calls find the rest.
 *
 * @param {string} apiKey Google Maps key that can use the Geocoding API.
 * @param {{ lookUp?: typeof lookUpAddress, now?: () => number }} [options] The lookup and the
 *   clock, replaced in tests.
 * @returns {(addresses: string[]) => Promise<Map<string, { lat: number, lng: number } | null>>}
 *   Answers each address that has been looked up, keyed by the address as given: where it is, or
 *   null when Google can't place it precisely or couldn't be asked. An address left out wasn't
 *   looked up yet, because the call had already started its 20 lookups.
 */
export function createAddressPoints(
  apiKey,
  { lookUp = lookUpAddress, now = Date.now } = {},
) {
  const remembered = new Map();
  let quietUntil = 0;

  function failed(entry, error) {
    entry.expiresAt = now() + RETRY_AFTER_FAILURE_MS;
    if (now() >= quietUntil) {
      quietUntil = entry.expiresAt;
      logger.warn("Couldn't look up competition addresses for the map", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }

  function lookUpNow(key, address) {
    const entry = { expiresAt: now() + DAY_MS };
    entry.point = lookUp(apiKey, address).catch((error) => failed(entry, error));
    remembered.set(key, entry);
    if (remembered.size > MAX_REMEMBERED) {
      remembered.delete(remembered.keys().next().value);
    }
    return entry;
  }

  return async function pointsFor(addresses) {
    const found = new Map();
    const answers = [];
    let started = 0;

    for (const address of new Set(addresses)) {
      const key = keyOf(address);
      if (!key) continue;
      let entry = remembered.get(key);
      if (entry && entry.expiresAt <= now()) {
        remembered.delete(key);
        entry = undefined;
      }
      if (!entry) {
        if (started === MAX_LOOKUPS_PER_CALL) continue;
        started += 1;
        entry = lookUpNow(key, address);
      }
      answers.push(
        entry.point.then((point) => {
          found.set(address, point);
        }),
      );
    }

    await Promise.all(answers);
    return found;
  };
}
