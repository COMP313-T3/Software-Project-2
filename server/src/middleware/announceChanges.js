import { PAGE_TOPIC } from "../constants/pageUpdates.js";
import { pageChanged } from "../services/pageUpdateEvents.js";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const { COMPETITIONS, RESULTS, GYMS, USERS, GYM_REQUESTS, SETTINGS } = PAGE_TOPIC;

/** What a write the rules below don't know is taken to change: anything but results. */
const ANYTHING = Object.freeze([COMPETITIONS, GYMS, USERS, GYM_REQUESTS, SETTINGS]);

/** A rule about one competition's data. The path's first capture group is the competition. */
function ofCompetition(path, topics) {
  return { path: new RegExp(path.replaceAll(":competitionId", "([^/]+)")), topics, competition: true };
}

/**
 * What each write changes, by its path under /api. The first rule that matches decides.
 */
const RULES = [
  // Logging in, keeping a session going, the tutorial, and questions to the AI change nothing a page lists.
  { path: /^\/(?:auth|session)(?:\/|$)/, topics: [] },
  { path: /^\/users\/me\/onboarding$/, topics: [] },
  { path: /\/route-assistant$/, topics: [] },
  { path: /^\/gym-requests\/setup\/check$/, topics: [] },

  ofCompetition("^/gym-admin/competitions/:competitionId/climbers/[^/]+/routes/[^/]+/(?:result|attempts)$", [RESULTS]),
  ofCompetition("^/competitions/:competitionId/scorecard/", [RESULTS]),
  // New points or a new scoring format change every score worked out from them.
  ofCompetition("^/gym-admin/competitions/:competitionId/(?:routes|scoring)(?:/|$)", [COMPETITIONS, RESULTS]),
  ofCompetition("^/gym-admin/competitions/:competitionId(?:/|$)", [COMPETITIONS]),
  { path: /^\/gym-admin\/competitions$/, topics: [COMPETITIONS] },
  ofCompetition("^/competitions/:competitionId/registrations$", [COMPETITIONS]),

  { path: /^\/admin\/settings$/, topics: [SETTINGS] },
  // Approving a request for a new gym registers the gym.
  { path: /^\/admin\/gym-requests(?:\/|$)/, topics: [GYM_REQUESTS, GYMS] },
  { path: /^\/admin\/gym-admins(?:\/|$)/, topics: [USERS, GYMS] },
  { path: /^\/admin\/users(?:\/|$)/, topics: [USERS] },

  { path: /^\/gyms\/[^/]+\/admins(?:\/|$)/, topics: [GYMS, USERS] },
  // A gym's new location moves its upcoming competitions, and a deactivated gym changes how they're listed.
  { path: /^\/gyms(?:\/|$)/, topics: [GYMS, COMPETITIONS] },

  // Setting up an approved request creates the Gym Administrator's account and assigns their gym.
  { path: /^\/gym-requests\/setup$/, topics: [GYM_REQUESTS, USERS, GYMS] },
  { path: /^\/gym-requests$/, topics: [GYM_REQUESTS] },
  { path: /^\/users\/climbers$/, topics: [USERS] },
];

/**
 * The changes a successful write announces (see pageChanged). A write no rule knows announces
 * every topic but results, so a new route keeps pages current until it gets a rule of its own.
 *
 * @param {string} method The request's method.
 * @param {string} path The request's path under /api, without the query, such as /gyms/123.
 * @returns {{ topic: string, competitionId?: string }[]} The changes, none for a read.
 */
export function changesFor(method, path) {
  if (!WRITES.has(method)) return [];
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const rule of RULES) {
    const match = rule.path.exec(clean);
    if (!match) continue;
    const competitionId = rule.competition ? match[1] : undefined;
    return rule.topics.map((topic) => (competitionId ? { topic, competitionId } : { topic }));
  }
  return ANYTHING.map((topic) => ({ topic }));
}

/**
 * Announces what a request changed once it has answered successfully, so the pages that show that
 * data reload it by themselves. Mounted on /api, before the routes. A request that failed, or
 * that only read, announces nothing.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Next middleware.
 */
export function announceChanges(req, res, next) {
  if (WRITES.has(req.method)) {
    // Read now: a router that handles the request later rewrites req.path to its own part of it.
    const { path } = req;
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      for (const change of changesFor(req.method, path)) {
        pageChanged(change.topic, { competitionId: change.competitionId });
      }
    });
  }
  next();
}
