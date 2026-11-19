import { useEffect, useRef, useState } from "react";
import type { Scorecard } from "../../lib/scorecardApi.ts";
import { followScorecard, initialScorecardState } from "../../lib/scorecardFeed.ts";

/**
 * The logged-in Climber's live scorecard for one competition, with ways to read it again, to
 * restart the live connection, and to show the scorecard a save answered.
 *
 * @param competitionId The competition.
 */
export function useScorecard(competitionId: string) {
  const [state, setState] = useState(initialScorecardState);
  const feed = useRef<ReturnType<typeof followScorecard> | null>(null);

  useEffect(() => {
    const current = followScorecard(competitionId, setState);
    feed.current = current;
    return () => {
      current.close();
      if (feed.current === current) feed.current = null;
    };
  }, [competitionId]);

  return {
    ...state,
    refresh: () => {
      void feed.current?.refresh();
    },
    reconnect: () => {
      void feed.current?.reconnect();
    },
    apply: (scorecard: Scorecard) => {
      feed.current?.apply(scorecard);
    },
  };
}
