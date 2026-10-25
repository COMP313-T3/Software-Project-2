import { createContext, useContext } from "react";
import type { SessionSnapshot } from "../../lib/sessionStore.ts";

/** The login state, and what pages can do with it. */
export interface SessionContextValue extends SessionSnapshot {
  /** Logs in. Throws an ApiError with a message for the form when it fails. */
  logIn: (email: string, password: string) => Promise<void>;
  /** Logs out. Throws an ApiError when the API can't be reached. */
  logOut: () => Promise<void>;
  /** Marks a page that needs a login as open, and returns a function for when it closes. */
  watchProtectedPage: () => () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Reads the login state from SessionProvider.
 *
 * @returns Who is logged in, the status, and logIn and logOut.
 * @throws {Error} When used outside SessionProvider.
 */
export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return session;
}
