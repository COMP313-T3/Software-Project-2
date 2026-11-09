import { useRef, useState } from "react";
import type { Scorecard, ScorecardRoute } from "../../lib/scorecardApi.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./RouteProgress.module.css";

type Filter = "all" | "unfinished" | "completed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unfinished", label: "Unfinished" },
  { value: "completed", label: "Completed" },
];

interface RouteProgressProps {
  routes: ScorecardRoute[];
  summary: Scorecard["summary"];
  scoring: Scorecard["scoring"];
  /** Route IDs that the latest change to the scorecard touched. */
  changed: string[];
}

function pointsText(points: number | null): string {
  if (points === null) return "points not set";
  return `${points} ${points === 1 ? "point" : "points"}`;
}

function rowState(route: ScorecardRoute): "completed" | "attempted" | "open" {
  if (route.completed) return "completed";
  return route.status === "ATTEMPTED" ? "attempted" : "open";
}

function announcementFor(routes: ScorecardRoute[], changed: string[]): string {
  if (changed.length === 0) return "";
  if (changed.length > 1) return `${changed.length} problems were updated.`;
  const route = routes.find((item) => item.routeId === changed[0]);
  return route ? `Problem ${route.routeNumber} was updated: ${route.statusLabel}.` : "";
}

/**
 * The Climber's progress through a competition's problems (US-031 #31.4): how many are completed,
 * and each problem in wall order, marked completed or unfinished with its official result. Problems
 * the latest live update changed are pointed out, and the change is announced to screen readers.
 */
export default function RouteProgress({ routes, summary, scoring, changed }: RouteProgressProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const filterBar = useRef<HTMLDivElement>(null);
  const listArea = useRef<HTMLDivElement>(null);
  const changedIds = new Set(changed);
  const counts: Record<Filter, number> = {
    all: summary.routeCount,
    unfinished: summary.unfinished,
    completed: summary.completed,
  };
  const shown = routes.filter((route) => filter === "all" || route.completed === (filter === "completed"));
  const percent = summary.routeCount ? Math.round((summary.completed / summary.routeCount) * 100) : 0;
  const progressText = `${summary.completed} of ${summary.routeCount} ${summary.routeCount === 1 ? "problem" : "problems"} completed`;

  function choose(value: Filter) {
    setFilter(value);
    const bar = filterBar.current?.getBoundingClientRect();
    const list = listArea.current?.getBoundingClientRect();
    // The filters stay on screen while the list scrolls under them, so a new filter starts from the top of its list.
    if (bar && list && list.top < bar.bottom) listArea.current?.scrollIntoView({ block: "start" });
  }

  return (
    <section className={`${workspace.panel} ${styles.progress}`} aria-labelledby="route-progress">
      <div className={styles.heading}>
        <h2 id="route-progress">Route progress</h2>
        <p className={styles.total}>{progressText}</p>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label="Problems completed"
        aria-valuemin={0}
        aria-valuemax={summary.routeCount}
        aria-valuenow={summary.completed}
        aria-valuetext={progressText}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {routes.length > 0 && (
        <>
          <p className={styles.legend}>Flashed and sent problems are completed. Attempted problems are unfinished until you send them.</p>
          <div ref={filterBar} className={styles.filters} role="group" aria-label="Show problems">
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => choose(value)}>
                {label} <span className={styles.filterCount}>{counts[value]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className={styles.hidden} role="status" aria-live="polite">
        {announcementFor(routes, changed)}
      </p>

      <div ref={listArea} className={styles.listArea}>
        {routes.length === 0 ? (
          <p className={styles.empty}>This competition doesn't have any problems on its scorecard yet.</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>
            {filter === "completed" ? "You haven't completed a problem yet." : "You've completed every problem."}
          </p>
        ) : (
          <ol className={styles.list}>
            {shown.map((route) => (
              <RouteRow key={route.routeId} route={route} scoring={scoring} changed={changedIds.has(route.routeId)} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function RouteRow({ route, scoring, changed }: { route: ScorecardRoute; scoring: Scorecard["scoring"]; changed: boolean }) {
  const { result } = route;
  const title = route.name || `Problem ${route.routeNumber}`;
  const attemptsLeft = result && !route.completed && scoring ? result.attemptsLeft : null;
  return (
    <li className={styles.route} data-state={rowState(route)} data-changed={changed || undefined}>
      <span className={styles.number} aria-hidden="true">
        {route.routeNumber}
      </span>
      <div className={styles.problem}>
        <h3>{title}</h3>
        <p className={styles.meta}>
          {route.name ? `Problem ${route.routeNumber}, ` : ""}
          {route.grade}, {pointsText(route.pointValue)}
        </p>
      </div>
      <p className={styles.status}>
        <strong className={styles.state}>{route.completed ? "Completed" : "Unfinished"}</strong>
        <span className={styles.hidden}>, </span>
        <span className={styles.detail}>{route.statusLabel}</span>
        {changed && <span className={styles.updated}>Updated</span>}
      </p>
      {result && (
        <dl className={styles.result}>
          <div className={styles.attempts}>
            <dt>Attempts</dt>
            <dd>{result.attempts}</dd>
          </div>
          {attemptsLeft !== null && (
            <div className={styles.left}>
              <dt>Attempts left</dt>
              <dd>{attemptsLeft}</dd>
            </div>
          )}
          <div className={styles.points}>
            <dt>Points</dt>
            <dd>{result.officialScore}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}
