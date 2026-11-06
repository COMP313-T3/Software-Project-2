import { useEffect, useState, type ReactNode } from "react";
import { displayGateway, getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import { emptyDisplay, type DisplaySettings } from "../../lib/displayCustomization.ts";
import CompetitionDisplay from "./CompetitionDisplay.tsx";

/** Branding failure must never conceal the official standings. */
export default function LeaderboardAppearance({ competitionId, managed, title, children }: { competitionId: string; managed: boolean; title: string; children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(emptyDisplay);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const request = managed ? displayGateway.load(competitionId, controller.signal) : getPublicDisplay(competitionId, controller.signal);
    request.then(result => { if (!controller.signal.aborted) setSettings(result.settings); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [competitionId, managed]);
  return <>{failed && <p role="status">Display images are unavailable. Official standings are still shown below.</p>}<CompetitionDisplay settings={settings} title={title} showTitle={false}>{children}</CompetitionDisplay></>;
}
