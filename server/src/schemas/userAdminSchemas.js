import { z } from "zod";
import { ACCOUNT_ROLES, VISITOR } from "../constants/roles.js";
import {
  USER_SEARCH_MAX_LENGTH,
  USER_SORT,
  USER_SORTS,
  USER_STATUS_FILTER,
  USER_STATUS_FILTERS,
} from "../constants/users.js";
import { limit, objectId, page } from "./commonFields.js";

const ROLE_MESSAGE = `Choose a role: ${ACCOUNT_ROLES.join(", ")}.`;
const STATUS_MESSAGE = `Choose a status: ${USER_STATUS_FILTERS.join(", ")}.`;
const SORT_MESSAGE = `Choose an order: ${USER_SORTS.join(", ")}.`;

/**
 * A filter left empty, such as ?role= from a cleared dropdown, counts as not chosen, so the page
 * can always send every filter field.
 *
 * @param {import("zod").ZodType} schema The filter's own check.
 */
function optionalFilter(schema) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

/**
 * One of a fixed set of lowercase words, ignoring case and spaces around it.
 *
 * @param {readonly string[]} values The words allowed.
 * @param {string} message What to say for anything else.
 */
function choice(values, message) {
  return z
    .string({ error: message })
    .trim()
    .toLowerCase()
    .pipe(z.enum(values, { error: message }));
}

/**
 * The role filter. Roles are matched as written, ignoring case, so ?role=climber works. VISITOR is
 * refused with its own message: a Visitor is someone without an account, so there's nobody to list.
 */
const role = optionalFilter(
  z
    .string({ error: ROLE_MESSAGE })
    .trim()
    .toUpperCase()
    .superRefine((value, ctx) => {
      if (value === VISITOR) {
        ctx.addIssue({
          code: "custom",
          message: "Visitors don't have accounts, so there are none to list.",
        });
      } else if (!ACCOUNT_ROLES.includes(value)) {
        ctx.addIssue({ code: "custom", message: ROLE_MESSAGE });
      }
    }),
);

/**
 * Query for GET /api/admin/users (US-008).
 *
 * q: search text. Each word must appear in the first name, last name, or email, ignoring case;
 *   a whole account ID also finds that account.
 * role: ADMIN, GYM_ADMIN, or CLIMBER.
 * status: all (default), active, or inactive.
 * gymId: only the Gym Administrators of this gym.
 * sort: name (default), email, newest, or oldest.
 * page, limit: paging.
 *
 * Unknown keys are dropped, so the list can't be asked for fields like password hashes.
 */
export const listUsersQuerySchema = z.object({
  q: optionalFilter(
    z
      .string({ error: "Enter search text." })
      .trim()
      .max(USER_SEARCH_MAX_LENGTH, {
        error: `Use ${USER_SEARCH_MAX_LENGTH} characters or fewer.`,
      }),
  ),
  role,
  status: optionalFilter(choice(USER_STATUS_FILTERS, STATUS_MESSAGE)).transform(
    (value) => value ?? USER_STATUS_FILTER.ALL,
  ),
  gymId: optionalFilter(objectId("gym")),
  sort: optionalFilter(choice(USER_SORTS, SORT_MESSAGE)).transform(
    (value) => value ?? USER_SORT.NAME,
  ),
  page,
  limit,
});

/** Params for GET /api/admin/users/:userId. */
export const userIdParamsSchema = z.object({
  userId: objectId("user"),
});
