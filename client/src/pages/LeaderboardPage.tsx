import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { useLeaderboard } from "../components/leaderboard/useLeaderboard.ts";
import LeaderboardAppearance from "../components/leaderboard/LeaderboardAppearance.tsx";
import { leaderboardName, leaderboardProblem, type LeaderboardAudience, type LeaderboardDivision } from "../lib/leaderboardApi.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { ApiError } from "../lib/apiClient.ts";
import logo from "../assets/brand/topsend-logo.png";
import theme from "../components/layout/theme.module.css";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./LeaderboardPage.module.css";

/** US-020: the same server-owned standings, with separate protected and public entry points. */
export default function LeaderboardPage({ audience }: { audience: LeaderboardAudience }) {
  const { competitionId = "" } = useParams(), { user } = useSession();
  const required = audience === "manage" ? "GYM_ADMIN" : "CLIMBER";
  if (audience !== "public" && user?.role !== required) return <AccessRequired title={audience === "manage" ? "Gym administrator access required" : "Climber access required"} allowed={audience === "manage" ? "Gym Administrators" : "Climbers"} />;
  const content = <LeaderboardWorkspace key={JSON.stringify([competitionId, audience, audience === "public" ? "public" : user?.userId])} competitionId={competitionId} audience={audience} />;
  return audience === "public" ? <div className={`${theme.theme} ${styles.publicShell}`}><header className={styles.publicHeader}><Link to="/" aria-label="TopSend home"><img src={logo} alt="TopSend" width="159" height="52" /></Link><span>Public competition display</span></header><main id="main-content" className={styles.publicMain}><h1>Live leaderboard</h1>{content}</main></div>
    : <AppLayout title="Live leaderboard">{content}</AppLayout>;
}
function LeaderboardWorkspace({ competitionId, audience }: { competitionId: string; audience: LeaderboardAudience }) {
  const [params, setParams] = useSearchParams(), { search } = useLocation();
  const { board, error, live, refreshing, refresh, reconnect } = useLeaderboard(competitionId, audience);
  const divisionId = params.get("divisionId") ?? "", selected = board?.divisions.find(division => division._id === divisionId);
  const backParams = new URLSearchParams(search); backParams.delete("divisionId");
  const returnSearch = backParams.size ? "?" + backParams : "";
  const backPath = audience === "manage" ? "/gym-admin/competitions/" : "/competitions/";
  const divisions = divisionId ? selected ? [selected] : [] : board?.divisions ?? [];
  const connectionText = live === "live" ? "Live updates connected" : live === "connecting" ? "Connecting live updates…" : live === "reconnecting" ? "Live updates reconnecting…" : "Live updates offline";
  return <div className={styles.content}>
    <title>{board ? `${board.competition.name} Leaderboard | TopSend` : "Leaderboard | TopSend"}</title>
    <div className={workspace.intro}><div>{audience !== "public" && <Link className={workspace.back} to={backPath + encodeURIComponent(competitionId) + returnSearch}>Back to competition</Link>}
      <p className={styles.help}>Current division rankings from official competition results.</p></div>
      <button type="button" className={workspace.secondary} onClick={refresh} disabled={refreshing}>{refreshing && board ? "Refreshing standings…" : "Refresh standings"}</button></div>
    {!!error && <section className={styles.warning} role="alert"><h2>{board ? "Leaderboard update unavailable" : "Leaderboard unavailable"}</h2><p>{leaderboardProblem(error)}</p>
      <div className={styles.actions}><button type="button" className={workspace.secondary} disabled={refreshing} onClick={reconnect}>Try again</button>
        {error instanceof ApiError && error.status === 401 && <Link className={workspace.secondary} to="/login">Sign in</Link>}</div></section>}
    {!board && refreshing && <p className={workspace.panel} role="status">Loading leaderboard…</p>}
    {board && <>
      <section className={workspace.panel} aria-labelledby="leaderboard-competition"><div className={styles.headingRow}><div><p className={styles.eyebrow}>{board.competition.gym?.name ?? "Competition standings"}</p><h2 id="leaderboard-competition">{board.competition.name}</h2>
        <p className={styles.help}><time dateTime={board.competition.date}>{formatCalendarDate(board.competition.date)}</time> · {board.routeCount} {board.routeCount === 1 ? "problem" : "problems"}</p></div>
        <span className={`${styles.connection} ${live === "live" ? styles.connected : styles.waiting}`} role="status">{connectionText}</span></div>
        {live !== "live" && <div className={styles.connectionHelp}><p className={styles.help}>Showing the last loaded standings. They may change while live updates are unavailable.</p><button className={workspace.secondary} type="button" onClick={reconnect} disabled={refreshing}>Reconnect live updates</button></div>}
        <div className={styles.filterRow}><div><label htmlFor="leaderboard-division">Division</label><select id="leaderboard-division" value={divisionId} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set("divisionId", event.target.value); else next.delete("divisionId"); setParams(next, { replace: true }); }}>
          <option value="">All divisions</option>{divisionId && !selected && <option value={divisionId} disabled>Unavailable division</option>}{board.divisions.map(division => <option key={division._id} value={division._id}>{division.name}</option>)}</select></div>
          <p className={styles.help}>Ranked within each division. {board.scoring?.label ?? "Scoring is not configured yet."}</p></div>
        {audience === "manage" && <p className={styles.help}>{board.competition.publicLeaderboard ? <Link to={`/leaderboards/${encodeURIComponent(competitionId)}`}>Open public leaderboard</Link> : "Public leaderboard viewing is off."}</p>}
        <p className={styles.timestamp}>Standings loaded: {formatTorontoDateTime(board.generatedAt)}{board.lastResultAt ? ` · Last official result: ${formatTorontoDateTime(board.lastResultAt)}` : " · No official results recorded yet"}</p>
      </section>
      <LeaderboardAppearance competitionId={competitionId} managed={audience === "manage"} title={board.competition.name}>{divisionId && !selected ? <section className={workspace.panel} role="status"><h2>Division unavailable</h2><p>This division is no longer available for this competition. Choose another division or All divisions.</p></section>
        : !board.divisions.length ? <section className={workspace.panel} role="status"><h2>No divisions yet</h2><p>Standings will appear when this competition has divisions and confirmed registrations.</p></section>
          : divisions.map(division => <DivisionStandings key={division._id} division={division} myEntryId={board.myEntry?.entryId} />)}</LeaderboardAppearance>
      {board.tiebreakers.length > 0 && <details className={styles.rules}><summary>How positions are ordered</summary><ol>{board.tiebreakers.map(label => <li key={label}>{label}</li>)}</ol><p>Climbers still equal share the position returned by the ranking service.</p></details>}
    </>}
  </div>;
}
export function DivisionStandings({ division, myEntryId }: { division: LeaderboardDivision; myEntryId?: string }) {
  return <section className={`${workspace.panel} ${styles.division}`} aria-labelledby={`division-${division._id}`}><div className={styles.headingRow}><h2 id={`division-${division._id}`}>{division.name}</h2><span className={styles.count}>{division.climberCount} {division.climberCount === 1 ? "Climber" : "Climbers"}</span></div>
    {!division.standings.length ? <p className={styles.help}>No confirmed Climbers in this division yet.</p> : <table className={styles.table}><caption className={styles.hidden}>{division.name} rankings</caption><thead><tr><th scope="col">Position</th><th scope="col">Climber</th><th scope="col">Points</th><th scope="col">Sends</th><th scope="col">Flashes</th><th scope="col">Attempts to tops</th></tr></thead>
      <tbody>{division.standings.map(entry => <tr key={entry.entryId} className={entry.entryId === myEntryId ? styles.mine : undefined}>
        <td className={styles.position}><span className={styles.hidden}>Position </span>{entry.rank}{entry.tied && <small>Tied</small>}</td>
        <th scope="row" className={styles.name}>{leaderboardName(entry)}{entry.entryId === myEntryId && <span className={styles.you}>You</span>}<small>{entry.problemsRecorded} {entry.problemsRecorded === 1 ? "result" : "results"} recorded</small></th>
        <td className={styles.score}>{entry.totalScore}<span className={styles.mobileUnit} aria-hidden="true"> points</span></td>
        <td className={styles.metric}><span className={styles.mobileLabel} aria-hidden="true">Sends</span>{entry.sends}</td>
        <td className={styles.metric}><span className={styles.mobileLabel} aria-hidden="true">Flashes</span>{entry.flashes}</td>
        <td className={styles.metric}><span className={styles.mobileLabel} aria-hidden="true">Attempts to tops</span>{entry.attemptsToTops}</td>
      </tr>)}</tbody></table>}
  </section>;
}
