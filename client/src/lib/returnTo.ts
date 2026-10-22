import { ROLES, type Role } from "../constants/roles.ts";
import type { SessionEndReason } from "./sessionChannel.ts";

const MAX_LENGTH = 2000;
const LOGIN_PAGES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

/**
 * The role each part of the app is for, by the first part of its path. Pages outside these parts
 * are open to every role.
 */
const ROLE_SECTIONS: ReadonlyMap<string, Role> = new Map([
  ["admin", ROLES.ADMIN],
  ["gym-admin", ROLES.GYM_ADMIN],
  ["competitions", ROLES.CLIMBER],
]);

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/**
 * Checks where to go after logging in, from the returnTo part of the address. Only a path on this
 * site is allowed: it starts with exactly one "/", with no backslashes or control characters,
 * which browsers can turn into a link to another site. Login pages themselves are left out.
 *
 * @param value The returnTo value, or null when there's none.
 * @returns The path, or null when it isn't safe to use.
 */
export function safeReturnTo(value: string | null): string | null {
  if (!value || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || hasControlCharacter(value)) return null;
  const path = value.split(/[?#]/, 1)[0];
  return LOGIN_PAGES.has(path) ? null : value;
}

/**
 * Where to go once someone is logged in: the returnTo page when their role can open it, or else
 * their role's own landing page. On a shared device, the next person to log in can have another
 * role than the person whose session ended on that page.
 *
 * @param returnTo A path that passed safeReturnTo, or null when there's none.
 * @param role The logged-in role.
 * @returns The path to open.
 */
export function pageAfterLogin(
  returnTo: string | null,
  role: Role | undefined,
): string {
  const landing = role === ROLES.CLIMBER ? "/competitions" : "/dashboard";
  if (!returnTo) return landing;
  // Route matching ignores case, so the section is compared in lowercase too.
  const section = returnTo.split(/[?#]/, 1)[0].split("/")[1].toLowerCase();
  const owner = ROLE_SECTIONS.get(section);
  return owner && owner !== role ? landing : returnTo;
}

/**
 * The log in page's address for someone sent there from a page that needs a login.
 *
 * @param from The page they were on, to return to after logging in.
 * @param reason "expired" when their session ran out, which the page then says.
 * @returns The address, such as /login?reason=expired&returnTo=%2Fdashboard.
 */
export function loginAddress(from: string, reason?: SessionEndReason): string {
  const query = new URLSearchParams();
  if (reason === "expired") query.set("reason", "expired");
  if (safeReturnTo(from)) query.set("returnTo", from);
  const search = query.toString();
  return search ? `/login?${search}` : "/login";
}
