import { useEffect, useRef, useState, type ReactNode } from "react";
import { displayGateway, getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import { emptyDisplay, type DisplaySettings } from "../../lib/displayCustomization.ts";
import { PAGE_TOPIC } from "../../lib/liveChanges.ts";
import { useLiveReload } from "../common/useLiveReload.ts";
import CompetitionDisplay from "./CompetitionDisplay.tsx";

/**
 * Branding failure must never conceal the official standings. The images follow what the Gym
 * Admin saves, and stay as they are when a later read fails.
 */
export default function LeaderboardAppearance({ competitionId, managed, title, children }: { competitionId: string; managed: boolean; title: string; children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(emptyDisplay);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const loaded = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const request = managed ? displayGateway.load(competitionId, controller.signal) : getPublicDisplay(competitionId, controller.signal);
    request.then(result => { if (!controller.signal.aborted) { loaded.current = true; setSettings(result.settings); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted && !loaded.current) setFailed(true); });
    return () => controller.abort();
  }, [competitionId, managed, revision]);
  useLiveReload(() => setRevision(value => value + 1), { topics: [PAGE_TOPIC.competitions], competitionId });
  return <>{failed && <p role="status">Display images are unavailable. Official standings are still shown below.</p>}<CompetitionDisplay settings={settings} title={title} showTitle={false}>{children}</CompetitionDisplay></>;
}
