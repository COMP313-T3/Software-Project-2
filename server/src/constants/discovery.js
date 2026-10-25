/**
 * Competition discovery for Climbers (US-025, US-026, US-027).
 */

/** The registration filter: every available competition, or only those taking registrations now. */
export const DISCOVERY_REGISTRATION = Object.freeze({
  ANY: "any",
  OPEN: "open",
});

/** Every value allowed in the registration filter. */
export const DISCOVERY_REGISTRATION_FILTERS = Object.freeze(
  Object.values(DISCOVERY_REGISTRATION),
);

/** The registration filter's choices, with the labels the Discover page shows. */
export const DISCOVERY_REGISTRATION_OPTIONS = Object.freeze([
  Object.freeze({ value: DISCOVERY_REGISTRATION.ANY, label: "All upcoming competitions" }),
  Object.freeze({ value: DISCOVERY_REGISTRATION.OPEN, label: "Registration open" }),
]);

/** The longest search text accepted, and how many of its words are used. */
export const DISCOVERY_SEARCH_MAX_LENGTH = 100;
export const DISCOVERY_SEARCH_MAX_WORDS = 5;

/** The widest distance filter, in kilometres. TopSend covers Toronto and nearby gyms. */
export const DISCOVERY_MAX_RADIUS_KM = 200;

/** The distances the Discover page offers, in kilometres, each within DISCOVERY_MAX_RADIUS_KM. */
export const DISCOVERY_DISTANCE_CHOICES_KM = Object.freeze([5, 10, 25, 50, 100]);

/**
 * The starting point a Climber can ask for by name instead of sending a point: the location they
 * saved at sign-up.
 */
export const DISCOVERY_NEAR_SAVED = "saved";

/** The orders the List View can show competitions in. Soonest first unless another is chosen. */
export const DISCOVERY_SORT = Object.freeze({
  SOONEST: "soonest",
  CLOSEST: "closest",
  MOST_JOINED: "joined",
  MOST_SPACES: "spaces",
  RANDOM: "random",
});

/** Every value allowed for the List View's order. */
export const DISCOVERY_SORTS = Object.freeze(Object.values(DISCOVERY_SORT));

/** The order choices, with the labels the Discover page shows. */
export const DISCOVERY_SORT_OPTIONS = Object.freeze([
  Object.freeze({ value: DISCOVERY_SORT.SOONEST, label: "Soonest first" }),
  Object.freeze({ value: DISCOVERY_SORT.CLOSEST, label: "Closest first" }),
  Object.freeze({ value: DISCOVERY_SORT.MOST_JOINED, label: "Most joined" }),
  Object.freeze({ value: DISCOVERY_SORT.MOST_SPACES, label: "Most spaces left" }),
  Object.freeze({ value: DISCOVERY_SORT.RANDOM, label: "Random order" }),
]);

/** The largest shuffle number for the random order. The page picks one when the order is chosen. */
export const DISCOVERY_SEED_MAX = 999_999_999;

/**
 * The most competitions an order other than soonest first ranks: the soonest that match. It's far
 * more than TopSend's gyms hold at once, and keeps one request from reading every competition.
 */
export const DISCOVERY_ORDER_LIMIT = 1000;

/** The most pins the Map View loads at once; the List View pages through the rest. */
export const DISCOVERY_MAP_PIN_LIMIT = 500;
