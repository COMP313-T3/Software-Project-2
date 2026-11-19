import { useEffect, useRef, useState } from "react";
import { followLeaderboard, initialLeaderboardState } from "../../lib/leaderboardFeed.ts";
import type { LeaderboardAudience } from "../../lib/leaderboardApi.ts";

export function useLeaderboard(competitionId: string, audience: LeaderboardAudience) {
  const [state, setState] = useState(initialLeaderboardState);
  const feed = useRef<ReturnType<typeof followLeaderboard> | null>(null);
  useEffect(() => {
    const current = followLeaderboard(competitionId, audience, setState); feed.current = current;
    return () => { current.close(); if (feed.current === current) feed.current = null; };
  }, [competitionId, audience]);
  return { ...state, refresh: () => { void feed.current?.refresh(); }, reconnect: () => { void feed.current?.reconnect(); } };
}
