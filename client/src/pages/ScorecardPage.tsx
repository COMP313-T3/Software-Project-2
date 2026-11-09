import { Link, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import RouteProgress from "../components/scorecard/RouteProgress.tsx";
import { useScorecard } from "../components/scorecard/useScorecard.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { scorecardProblem, type Scorecard } from "../lib/scorecardApi.ts";
import type { LiveState } from "../lib/scorecardFeed.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./ScorecardPage.module.css";

const LIVE_TEXT: Record<LiveState, string> = {
  live: "Live updates connected",
  connecting: "Connecting live updates…",
  reconnecting: "Live updates reconnecting…",
  offline: "Live updates offline",
};

/**
 * The logged-in Climber's digital scorecard for one of their competitions (US-031 #31.3): the
 * competition, their registration and totals, and their official result on every problem, kept
 * current by live updates. Opened from the competition's tools in My Events.
 *
 * @param returnTo Where "Back to my event" goes.
 */
export default function ScorecardPage({ returnTo }: { returnTo: string }) {
  const { competitionId = "" } = useParams();
  return (
    <AppLayout title="My scorecard">
      <ScorecardWorkspace key={competitionId} competitionId={competitionId} returnTo={returnTo} />
    </AppLayout>
  );
}

function ScorecardWorkspace({ competitionId, returnTo }: { competitionId: string; returnTo: string }) {
  const { scorecard, error, live, refreshing, changed, refresh, reconnect } = useScorecard(competitionId);
  return (
    <div className={styles.content}>
      <title>{scorecard ? `${scorecard.competition.name} Scorecard | TopSend` : "My scorecard | TopSend"}</title>
      <div className={workspace.intro}>
        <div>
          <Link className={workspace.back} to={returnTo}>
            Back to my event
          </Link>
          <p className={styles.help}>Your official results on each problem, as the gym records them.</p>
        </div>
        {scorecard && (
          <button type="button" className={workspace.secondary} onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing scorecard…" : "Refresh scorecard"}
          </button>
        )}
      </div>
      {scorecard ? (
        <>
          {error !== null && live === "live" && !refreshing && (
            <p className={styles.stale} role="status">
              Couldn't refresh your scorecard. You're still seeing the results you last loaded.
            </p>
          )}
          <div className={styles.overview}>
            <CompetitionPanel scorecard={scorecard} live={live} refreshing={refreshing} onReconnect={reconnect} />
            <Totals scorecard={scorecard} />
          </div>
          <RouteProgress routes={scorecard.routes} summary={scorecard.summary} scoring={scorecard.scoring} changed={changed} />
        </>
      ) : refreshing ? (
        <p className={workspace.panel} role="status">
          Loading your scorecard…
        </p>
      ) : (
        <Unavailable error={error} onRetry={reconnect} />
      )}
    </div>
  );
}

function CompetitionPanel({
  scorecard,
  live,
  refreshing,
  onReconnect,
}: {
  scorecard: Scorecard;
  live: LiveState;
  refreshing: boolean;
  onReconnect: () => void;
}) {
  const { competition, registration } = scorecard;
  const cancelled = competition.status === "CANCELLED";
  const details: [string, string][] = [
    ["Date", formatCalendarDate(competition.date)],
    ["Gym", competition.gym?.name ?? "Gym unavailable"],
    ["Division", registration.division?.name ?? "Division unavailable"],
    ["Location", competition.location || "Location unavailable"],
  ];
  const interrupted = live === "reconnecting" || live === "offline";

  return (
    <section className={workspace.panel} aria-labelledby="scorecard-competition">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Scorecard for</p>
          <h2 id="scorecard-competition">{competition.name}</h2>
        </div>
        <span className={`${styles.connection} ${live === "live" ? styles.connected : styles.waiting}`} role="status">
          {LIVE_TEXT[live]}
        </span>
      </div>
      <div className={styles.badges}>
        <span className={styles.badge}>{registration.statusLabel}</span>
        {cancelled && <span className={styles.badge}>Cancelled</span>}
      </div>
      <dl className={styles.details}>
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {cancelled ? (
        <p className={styles.note}>This competition was cancelled. Your official results stay here for reference.</p>
      ) : (
        !registration.confirmed && (
          <p className={styles.note}>Your place isn't confirmed yet, so the gym may not record results for you until it is.</p>
        )
      )}
      {interrupted && (
        <div className={styles.connectionHelp}>
          <p className={styles.help}>
            Showing the scorecard you last loaded. Your results may change while live updates are unavailable.
          </p>
          <button type="button" className={workspace.secondary} onClick={onReconnect} disabled={refreshing}>
            Reconnect live updates
          </button>
        </div>
      )}
    </section>
  );
}

function Totals({ scorecard }: { scorecard: Scorecard }) {
  const { summary, scoring, lastResultAt } = scorecard;
  const totals: [string, string][] = [
    ["Points", String(summary.totalScore)],
    ["Completed", `${summary.completed} of ${summary.routeCount}`],
    ["Flashes", String(summary.flashes)],
    ["Attempts", String(summary.totalAttempts)],
  ];
  return (
    <section className={workspace.panel} aria-labelledby="scorecard-totals">
      <h2 id="scorecard-totals">Your totals</h2>
      <dl className={styles.totals}>
        {totals.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.help}>
        {scoring
          ? `Scoring: ${scoring.label}.`
          : "Scoring isn't set up for this competition yet, so problems don't earn points yet."}
      </p>
      <p className={styles.timestamp}>
        {lastResultAt
          ? `Last result recorded ${formatTorontoDateTime(lastResultAt)} (Toronto time).`
          : "No results have been recorded for you yet."}
      </p>
    </section>
  );
}

function Unavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  const canRetry = status === 0 || status >= 500;
  return (
    <section className={workspace.panel} role="alert">
      <h2>Scorecard unavailable</h2>
      <p>{scorecardProblem(error)}</p>
      {status === 401 && (
        <Link className={workspace.secondary} to="/login">
          Sign in
        </Link>
      )}
      {canRetry && (
        <button type="button" className={workspace.secondary} onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}
