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

/** The most pins the Map View loads at once; the List View pages through the rest. */
export const DISCOVERY_MAP_PIN_LIMIT = 500;
