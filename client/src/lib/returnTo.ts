import type { SessionEndReason } from "./sessionChannel.ts";

const MAX_LENGTH = 2000;
const LOGIN_PAGES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
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
