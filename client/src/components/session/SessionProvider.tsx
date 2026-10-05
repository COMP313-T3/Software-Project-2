import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createSessionStore } from "../../lib/sessionStore.ts";
import { SessionContext } from "./sessionContext.ts";
import SessionTimeoutDialog from "./SessionTimeoutDialog.tsx";

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Gives every page the login state, picks up an existing login when the app opens, and shows
 * the warning before an idle session ends.
 */
export default function SessionProvider({ children }: SessionProviderProps) {
  const [store] = useState(createSessionStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => store.connect(), [store]);

  const value = useMemo(
    () => ({
      ...snapshot,
      logIn: store.logIn,
      logOut: store.logOut,
      watchProtectedPage: store.watchProtectedPage,
    }),
    [snapshot, store],
  );

  return (
    <SessionContext value={value}>
      {children}
      {snapshot.warning && (
        <SessionTimeoutDialog
          warning={snapshot.warning}
          onStay={store.stay}
          onLogOut={store.logOut}
        />
      )}
    </SessionContext>
  );
}
