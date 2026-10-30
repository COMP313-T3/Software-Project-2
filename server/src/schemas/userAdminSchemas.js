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
