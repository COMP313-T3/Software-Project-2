import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { loginAddress } from "../../lib/returnTo.ts";
import { useSession } from "./sessionContext.ts";

interface RequireSessionProps {
  /** The page that needs a login. */
  children: ReactNode;
}

/**
 * Shows its page only to someone logged in. Anyone else goes to the log in page, which brings
 * them back afterwards and says so when their session expired. Logging out on purpose goes to
 * the log in page with a note instead. Only these pages show the warning before a session ends.
 */
export default function RequireSession({ children }: RequireSessionProps) {
  const { status, endReason, watchProtectedPage } = useSession();
  const { pathname, search } = useLocation();

  useEffect(() => watchProtectedPage(), [watchProtectedPage]);

  if (status === "checking") {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center bg-[#0d0a08]"
      >
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-2 border-[rgba(239,230,216,0.2)] border-t-[#fdc914] motion-reduce:animate-none"
        />
        <span className="sr-only">Checking your login...</span>
      </div>
    );
  }

  if (status === "signedOut") {
    if (endReason === "loggedOut") {
      return <Navigate to="/login" replace state={{ loggedOut: true }} />;
    }
    return (
      <Navigate
        to={loginAddress(`${pathname}${search}`, endReason ?? undefined)}
        replace
      />
    );
  }

  return children;
}
