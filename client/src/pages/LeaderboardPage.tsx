import { useLayoutEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import AssistantChat from "../components/assistant/AssistantChat.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { useLeaderboard } from "../components/leaderboard/useLeaderboard.ts";
import EndCountdown from "../components/competition/EndCountdown.tsx";
import EndWarning from "../components/competition/EndWarning.tsx";
import { NotStartedYet } from "../components/competition/StartCountdown.tsx";
import LeaderboardAppearance from "../components/leaderboard/LeaderboardAppearance.tsx";
import MyStanding from "../components/leaderboard/MyStanding.tsx";
import { leaderboardName, leaderboardProblem, type Leaderboard, type LeaderboardAudience, type LeaderboardDivision } from "../lib/leaderboardApi.ts";
import { MY_ROW_ID } from "../lib/leaderboardText.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { ApiError } from "../lib/apiClient.ts";
import { finished, readCompetitionStart, startsAtFrom, underway } from "../lib/competitionStart.ts";
import logo from "../assets/brand/topsend-logo.png";
import theme from "../components/layout/theme.module.css";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./LeaderboardPage.module.css";

/**
 * US-020: the same server-owned standings, with separate protected and public entry points. After
 * the competition ends, a Climber's is the final leaderboard (AC-024).
 */
export default function LeaderboardPage({ audience, returnTo }: { audience: LeaderboardAudience; returnTo?: string }) {
  const { competitionId = "" } = useParams(), { user } = useSession();
  const [final, setFinal] = useState(false);
  const required = audience === "manage" ? "GYM_ADMIN" : "CLIMBER";
  if (audience !== "public" && user?.role !== required) return <AccessRequired title={audience === "manage" ? "Gym administrator access required" : "Climber access required"} allowed={audience === "manage" ? "Gym Administrators" : "Climbers"} />;
  const content = <LeaderboardWorkspace key={JSON.stringify([competitionId, audience, audience === "public" ? "public" : user?.userId])} competitionId={competitionId} audience={audience} returnTo={returnTo} onFinal={setFinal} />;
  return audience === "public" ? <div className={`${theme.theme} ${styles.publicShell}`}><header className={styles.publicHeader}><Link to="/" aria-label="TopSend home"><img src={logo} alt="TopSend" width="159" height="52" /></Link><span>Public competition display</span></header><main id="main-content" className={styles.publicMain}><h1>Live leaderboard</h1>{content}</main></div>
    : <AppLayout title={final ? "Final leaderboard" : "Live leaderboard"}>{content}</AppLayout>;
}
function LeaderboardWorkspace({ competitionId, audience, returnTo, onFinal }: { competitionId: string; audience: LeaderboardAudience; returnTo?: string; onFinal: (final: boolean) => void }) {
  const [params, setParams] = useSearchParams(), { search, state } = useLocation();
  const { board, error, live, refreshing, refresh, reconnect } = useLeaderboard(competitionId, audience);
  // After the end a Climber's leaderboard is the final one, with every division, their own first (AC-024).
  const final = audience === "climber" && board !== null && finished(board.competition);
  // A layout effect, so the page's title already says Final leaderboard when the final standings first paint.
  useLayoutEffect(() => {
    onFinal(final);
  }, [final, onFinal]);
  const fromClosedScorecard = Boolean((state as { scorecardClosed?: unknown } | null)?.scorecardClosed);
  const eventTool = (tool: string) => returnTo ? `${returnTo.split("?")[0]}/${tool}${returnTo.includes("?") ? `?${returnTo.split("?")[1]}` : ""}` : undefined;
  // A Gym Admin and the public display choose a division. A Climber sees their own and doesn't choose (AC-016).
  const chooses = audience !== "climber";
  const divisionId = chooses ? params.get("divisionId") ?? "" : "", selected = board?.divisions.find(division => division._id === divisionId);
  const backParams = new URLSearchParams(search); backParams.delete("divisionId");
  const returnSearch = backParams.size ? "?" + backParams : "";
  const backPath = audience === "manage" ? "/gym-admin/competitions/" : "/competitions/";
  // The Climber's division is the one they're ranked in, or the one they registered for while they aren't ranked.
  // A Climber without one, such as a viewer who isn't registered, sees every division. Ranks stay the server's.
  const ownDivisionId = chooses ? undefined : board?.myEntry?.division._id ?? board?.myRegistration?.division?._id;
  const listed = board?.divisions ?? [], own = listed.find(division => division._id === ownDivisionId);
  const divisions = own ? final ? [own, ...listed.filter(division => division !== own)] : [own] : divisionId ? selected ? [selected] : [] : listed;
  const connectionText = live === "live" ? "Live updates connected" : live === "connecting" ? "Connecting live updates…" : live === "reconnecting" ? "Live updates reconnecting…" : "Live updates offline";
  // Until the competition starts, a Climber and the public see the countdown instead (AC-021).
  const startsAt = board ? null : startsAtFrom(error);
  return <div className={styles.content}>
    <title>{board ? `${board.competition.name} ${final ? "Final Leaderboard" : "Leaderboard"} | TopSend` : "Leaderboard | TopSend"}</title>
    <div className={workspace.intro}><div>{audience !== "public" && <Link className={workspace.back} to={returnTo ?? backPath + encodeURIComponent(competitionId) + returnSearch}>{returnTo ? "Back to my event" : "Back to competition"}</Link>}
      <p className={styles.help}>{final ? "Final division rankings from official competition results." : "Current division rankings from official competition results."}</p></div></div>
    {startsAt && <NotStartedYet startsAt={startsAt} subject="The leaderboard" onDue={reconnect}>
      {audience === "climber" && returnTo && <Link className={workspace.secondary} to={`${returnTo.split("?")[0]}/registration${returnTo.includes("?") ? `?${returnTo.split("?")[1]}` : ""}`}>Registration status</Link>}
    </NotStartedYet>}
    {!!error && !startsAt && <section className={styles.warning} role="alert"><h2>{board ? "Leaderboard update unavailable" : "Leaderboard unavailable"}</h2><p>{leaderboardProblem(error)}</p>
      <div className={styles.actions}><button type="button" className={workspace.secondary} disabled={refreshing} onClick={reconnect}>Try again</button>
        {error instanceof ApiError && error.status === 401 && <Link className={workspace.secondary} to="/login">Sign in</Link>}</div></section>}
    {!board && refreshing && !startsAt && <p className={workspace.panel} role="status">Loading leaderboard…</p>}
    {board && <>
      {final && <p className={styles.finalNotice} role="status">{fromClosedScorecard ? "This competition is over, so your scorecard is closed. These are the final results." : "This competition is over. These are the final results."}</p>}
      <ScoringCloses competition={board.competition} onDue={refresh} warning={audience === "climber" ? { competitionId, scorecardPath: eventTool("scorecard") ?? `/my-events/${encodeURIComponent(competitionId)}/scorecard` } : undefined} />
      <section className={workspace.panel} aria-labelledby="leaderboard-competition"><div className={styles.headingRow}><div><p className={styles.eyebrow}>{board.competition.gym?.name ?? "Competition standings"}</p><h2 id="leaderboard-competition">{board.competition.name}</h2>
        <p className={styles.help}><time dateTime={board.competition.date}>{formatCalendarDate(board.competition.date)}</time> · {board.routeCount} {board.routeCount === 1 ? "problem" : "problems"}</p></div>
        <span className={`${styles.connection} ${live === "live" ? styles.connected : styles.waiting}`} role="status">{connectionText}</span></div>
        {live !== "live" && <div className={styles.connectionHelp}><p className={styles.help}>Showing the last loaded standings. They may change while live updates are unavailable.</p><button className={workspace.secondary} type="button" onClick={reconnect} disabled={refreshing}>Reconnect live updates</button></div>}
        <div className={styles.filterRow}>{chooses ? <div><label htmlFor="leaderboard-division">Division</label><select id="leaderboard-division" value={divisionId} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set("divisionId", event.target.value); else next.delete("divisionId"); setParams(next, { replace: true }); }}>
          <option value="">All divisions</option>{divisionId && !selected && <option value={divisionId} disabled>Unavailable division</option>}{board.divisions.map(division => <option key={division._id} value={division._id}>{division.name}</option>)}</select></div>
          : own && <p className={styles.ownDivision}><span>{board.myEntry ? "Your division" : "The division you registered for"}</span><strong>{own.name}</strong></p>}
          <p className={styles.help}>Ranked within each division. {board.scoring?.label ?? "Scoring is not configured yet."}</p></div>
        {audience === "manage" && <p className={styles.help}>{board.competition.publicLeaderboard ? <Link to={`/leaderboards/${encodeURIComponent(competitionId)}`}>Open public leaderboard</Link> : "Public leaderboard viewing is off."}</p>}
        <p className={styles.timestamp}>Standings loaded: {formatTorontoDateTime(board.generatedAt)}{board.lastResultAt ? ` · Last official result: ${formatTorontoDateTime(board.lastResultAt)}` : final ? " · No official results were recorded" : " · No official results recorded yet"}</p>
      </section>
      {audience === "climber" && <MyStanding board={board} />}
      <LeaderboardAppearance competitionId={competitionId} managed={audience === "manage"} title={board.competition.name}>{divisionId && !selected ? <section className={workspace.panel} role="status"><h2>Division unavailable</h2><p>This division is no longer available for this competition. Choose another division or All divisions.</p></section>
        : !board.divisions.length ? <section className={workspace.panel} role="status"><h2>No divisions yet</h2><p>Standings will appear when this competition has divisions and confirmed registrations.</p></section>
          : divisions.map(division => <DivisionStandings key={division._id} division={division} myEntryId={board.myEntry?.entryId} final={final} />)}</LeaderboardAppearance>
      {board.tiebreakers.length > 0 && <details className={styles.rules}><summary>How positions are ordered</summary><ol>{board.tiebreakers.map(label => <li key={label}>{label}</li>)}</ol><p>Climbers with equal totals share a place and are listed by name.</p></details>}
      {/* The AI Route Assistant's chatbot (AC-022): for a registered Climber, and for the gym's own Gym Admins. */}
      {audience === "climber" && board.myRegistration && <AssistantChat audience="climber" page="leaderboard" competitionId={competitionId} competitionName={board.competition.name} />}
      {audience === "manage" && <AssistantChat audience="gym-admin" page="leaderboard" competitionId={competitionId} competitionName={board.competition.name} division={selected ? { _id: selected._id, name: selected.name } : null} />}
    </>}
  </div>;
}
/**
 * The countdown to the end of the competition, when Climbers' scoring closes, while it's on, and for
 * a Climber the warnings 15 and 5 minutes before it.
 */
function ScoringCloses({ competition, onDue, warning }: { competition: Leaderboard["competition"]; onDue: () => void; warning?: { competitionId: string; scorecardPath?: string } }) {
  const times = readCompetitionStart(competition);
  if (!times.endsAt || !underway({ status: competition.status, ...times })) return null;
  return <>
    <EndCountdown endsAt={times.endsAt} endTime={times.endTime} onDue={onDue} />
    {warning && <EndWarning competitionId={warning.competitionId} endsAt={times.endsAt} endTime={times.endTime} scorecardPath={warning.scorecardPath} />}
  </>;
}

export function DivisionStandings({ division, myEntryId, final = false }: { division: LeaderboardDivision; myEntryId?: string; final?: boolean }) {
  return <section className={`${workspace.panel} ${styles.division}`} aria-labelledby={`division-${division._id}`}><div className={styles.headingRow}><h2 id={`division-${division._id}`}>{division.name}</h2><span className={styles.count}>{division.climberCount} {division.climberCount === 1 ? "Climber" : "Climbers"}</span></div>
    {!division.standings.length ? <p className={styles.help}>{final ? "No Climbers competed in this division." : "No confirmed Climbers in this division yet."}</p> :<table className={styles.table}><caption className={styles.hidden}>{division.name} rankings</caption><thead><tr><th scope="col">Position</th><th scope="col">Climber</th><th scope="col">Points</th><th scope="col">Sends</th><th scope="col">Flashes</th><th scope="col">Attempts to tops</th></tr></thead>
      <tbody>{division.standings.map(entry => <tr key={entry.entryId} id={entry.entryId === myEntryId ? MY_ROW_ID : undefined} tabIndex={entry.entryId === myEntryId ? -1 : undefined} className={entry.entryId === myEntryId ? styles.mine : undefined}>
        <td className={styles.position}><span className={styles.hidden}>Position </span>{entry.rank}{entry.tied && <small>Tied</small>}</td>
        <th scope="row" className={styles.name}>{leaderboardName(entry)}{entry.entryId === myEntryId && <span className={styles.you}>You</span>}<small>{entry.problemsRecorded} {entry.problemsRecorded === 1 ? "result" : "results"} recorded</small></th>
        <td className={styles.score}>{entry.totalScore}<span className={styles.mobileUnit} aria-hidden="true"> points</span></td>
        <td className={styles.metric}><span className={styles.mobileLabel} aria-hidden="true">Sends</span>{entry.sends}</td>
        <td className={styles.metric}><span className={styles.mobileLabel} aria-hidden="true">Flashes</span>{entry.flashes}</td>
        <td className={styles.metric}><span className={styles.mobileLabel} aria-hidden="true">Attempts to tops</span>{entry.attemptsToTops}</td>
      </tr>)}</tbody></table>}
  </section>;
}
