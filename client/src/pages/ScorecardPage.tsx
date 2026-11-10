import { Link, useParams } from "react-router-dom";
import AssistantChat from "../components/assistant/AssistantChat.tsx";
import { NotStartedYet } from "../components/competition/StartCountdown.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import ScoreSheet from "../components/scorecard/ScoreSheet.tsx";
import { useScorecard } from "../components/scorecard/useScorecard.ts";
import { ApiError } from "../lib/apiClient.ts";
import { startsAtFrom } from "../lib/competitionStart.ts";
import { formatCalendarDate, formatStartTime, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { clearMyResult, saveMyResult, scorecardProblem, type ResultChange, type Scorecard } from "../lib/scorecardApi.ts";
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
 * What the Climber can do with their results right now. A cancelled competition and a place that
 * isn't confirmed are explained with the competition's details instead.
 */
function scoringNote(scorecard: Scorecard): string | null {
  const { selfScoring, competition } = scorecard;
  if (selfScoring.open) {
    return "Scoring is open today. After each try, tap Add attempt on the problem's row, or Sent it when you top out. Undo takes back your last attempt.";
  }
  if (selfScoring.reason === "NOT_STARTED") {
    const time = formatStartTime(competition.startTime);
    return `You can record your results from the start of the competition, ${formatCalendarDate(competition.date)}${time ? ` at ${time}` : ""}.`;
  }
  if (selfScoring.reason === "CLOSED") return "This competition is over, so your results are final.";
  if (selfScoring.reason === "NO_SCORING") return "The gym hasn't set up scoring yet, so you can't record results yet.";
  return null;
}

/**
 * The logged-in Climber's digital scorecard for one of their competitions (US-031 #31.3): the
 * competition, their registration and totals, and the scorecard sheet with the competition's
 * details and their result on every problem, which they record themselves from the competition's
 * start, kept current by live updates, and the AI Route Assistant's chatbot (AC-022).
 * Before the start it shows the countdown instead (AC-021). Opened from the competition's tools in
 * My Events.
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
  const { scorecard, error, live, refreshing, changed, refresh, reconnect, apply } = useScorecard(competitionId);
  const startsAt = scorecard ? null : startsAtFrom(error);
  const [eventPath, eventSearch = ""] = returnTo.split("?");

  async function record(routeId: string, change: ResultChange | null) {
    try {
      apply(change ? await saveMyResult(competitionId, routeId, change) : await clearMyResult(competitionId, routeId));
    } catch (problem) {
      if (problem instanceof ApiError && (problem.status === 404 || problem.status === 409)) refresh();
      throw problem;
    }
  }

  return (
    <div className={styles.content}>
      <title>{scorecard ? `${scorecard.competition.name} Scorecard | TopSend` : "My scorecard | TopSend"}</title>
      <div className={workspace.intro}>
        <div>
          <Link className={workspace.back} to={returnTo}>
            Back to my event
          </Link>
          <p className={styles.help}>
            {scorecard?.selfScoring.open
              ? "Record your attempts and sends on your scorecard sheet. TopSend works out your points."
              : "Your scorecard sheet, with your attempts and points on each problem."}
          </p>
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
          <ScoreSheet
            scorecard={scorecard}
            changed={changed}
            note={scoringNote(scorecard)}
            onRecord={scorecard.selfScoring.open ? record : undefined}
          />
          <AssistantChat
            audience="climber"
            page="scorecard"
            competitionId={competitionId}
            competitionName={scorecard.competition.name}
          />
        </>
      ) : startsAt ? (
        <NotStartedYet startsAt={startsAt} subject="Your scorecard" onDue={reconnect}>
          <Link className={workspace.secondary} to={`${eventPath}/registration${eventSearch ? `?${eventSearch}` : ""}`}>
            Registration status
          </Link>
        </NotStartedYet>
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
        <div>
          <dt>Location</dt>
          <dd>{competition.location || "Location unavailable"}</dd>
        </div>
      </dl>
      {cancelled ? (
        <p className={styles.note}>This competition was cancelled. Your results stay here for reference.</p>
      ) : (
        !registration.confirmed && (
          <p className={styles.note}>Your place isn't confirmed yet, so you can't record results until it is.</p>
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
