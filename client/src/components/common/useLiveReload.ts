import { useCallback, useEffect, useRef } from "react";
import { reloadingAutomatically } from "../../lib/apiClient.ts";
import { followChanges, type PageChange } from "../../lib/liveChanges.ts";
import { useSession } from "../session/sessionContext.ts";

/** The shortest time between two reloads of one page, so a burst of changes reloads it once. */
export const RELOAD_GAP_MS = 1000;

interface LiveReloadOptions {
  /** The kinds of data the page shows (PAGE_TOPIC). */
  topics: readonly string[];
  /** The competition the page is about, when it's about one. Changes to another one are ignored. */
  competitionId?: string;
  /** True while reloading would get in the user's way: a save in progress, or input that isn't saved yet. */
  paused?: boolean;
}

function concerns(changes: PageChange[] | null, topics: readonly string[], competitionId: string | undefined): boolean {
  if (changes === null) return true;
  return changes.some(
    (change) =>
      topics.includes(change.topic) &&
      (!change.competitionId || !competitionId || change.competitionId === competitionId),
  );
}

/**
 * Reloads a page's data by itself when the server says the data it shows has changed, so the page
 * needs no refresh button. The reload is the page's own, the one a refresh button would have
 * called, and is marked so the API doesn't count it as the user's activity.
 *
 * A burst of changes reloads the page once: right away for the first change, then at most once a
 * second. While the page is paused, a change waits, and the page reloads once it's free again, so
 * it never reloads under a save in progress or over input that isn't saved yet. It also reloads
 * after the live connection dropped and came back, since changes may have been missed.
 *
 * @param reload Reads the page's data again.
 * @param options What the page shows, and whether it can reload right now.
 */
export function useLiveReload(reload: () => void, { topics, competitionId, paused = false }: LiveReloadOptions) {
  const userId = useSession().user?.userId;
  const page = useRef({ reload, topics, competitionId, paused });
  const waiting = useRef(false);
  const reloadedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    page.current = { reload, topics, competitionId, paused };
  });

  const reloadNow = useCallback(() => {
    waiting.current = false;
    reloadedAt.current = Date.now();
    reloadingAutomatically();
    page.current.reload();
  }, []);

  const reloadWhenFree = useCallback(() => {
    waiting.current = true;
    if (page.current.paused || timer.current !== undefined) return;
    const wait = reloadedAt.current + RELOAD_GAP_MS - Date.now();
    if (wait <= 0) {
      reloadNow();
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      // A page that got busy during the wait reloads once it's free again, from the effect below.
      if (!page.current.paused) reloadNow();
    }, wait);
  }, [reloadNow]);

  useEffect(() => {
    if (!userId) return;
    const stop = followChanges(userId, (changes) => {
      if (concerns(changes, page.current.topics, page.current.competitionId)) reloadWhenFree();
    });
    return () => {
      stop();
      window.clearTimeout(timer.current);
      timer.current = undefined;
      waiting.current = false;
    };
  }, [userId, reloadWhenFree]);

  useEffect(() => {
    if (!paused && waiting.current) reloadWhenFree();
  }, [paused, reloadWhenFree]);
}
