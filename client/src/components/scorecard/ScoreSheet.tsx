import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { formatCalendarDate, formatStartTime } from "../../lib/dateFormat.ts";
import { backgroundImage } from "../../lib/displayBackgrounds.ts";
import { emptyDisplay, type DisplayImage, type DisplaySettings } from "../../lib/displayCustomization.ts";
import { getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import { recordProblem, type ResultChange, type Scorecard, type ScorecardRoute } from "../../lib/scorecardApi.ts";
import {
  readSheetOpacity,
  saveSheetOpacity,
  sheetOpacity,
  SHEET_OPACITY_MAX,
  SHEET_OPACITY_MIN,
  SHEET_OPACITY_STEP,
} from "../../lib/sheetOpacity.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./ScoreSheet.module.css";

type Filter = "all" | "unfinished" | "completed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unfinished", label: "Unfinished" },
  { value: "completed", label: "Completed" },
];

/** The background a sheet gets when the gym hasn't chosen one, so every sheet has a backdrop. */
const DEFAULT_BACKGROUND = "mountains";

/** The table's columns: number, problem, grade, attempts and points. */
const COLUMNS = 5;

interface ScoreSheetProps {
  scorecard: Scorecard;
  /** Route IDs that the latest change to the scorecard touched. */
  changed: string[];
  /** What the Climber can do with their results right now, shown above the problems. */
  note: string | null;
  /** Saves the Climber's result on a problem, or clears it with null. Only given while scoring is open. */
  onRecord?: (routeId: string, change: ResultChange | null) => Promise<void>;
}

function pointsText(points: number | null): string {
  if (points === null) return "Points not set";
  return `${points} ${points === 1 ? "point" : "points"}`;
}

/** Where the Climber is on a problem, in the sheet's words: a top is a top, however many attempts it took. */
function statusText(route: ScorecardRoute, attemptsLeft: boolean): string {
  if (route.completed) return "Sent";
  if (route.status !== "ATTEMPTED") return "Not attempted";
  return attemptsLeft ? "Attempted" : "No attempts left";
}

function rowState(route: ScorecardRoute): "completed" | "attempted" | "open" {
  if (route.completed) return "completed";
  return route.status === "ATTEMPTED" ? "attempted" : "open";
}

function announcementFor(routes: ScorecardRoute[], changed: string[], maxAttempts: number | null): string {
  if (changed.length === 0) return "";
  if (changed.length > 1) return `${changed.length} problems were updated.`;
  const route = routes.find((item) => item.routeId === changed[0]);
  if (!route) return "";
  const attemptsLeft = maxAttempts === null || (route.result?.attempts ?? 0) < maxAttempts;
  return `Problem ${route.routeNumber} was updated: ${statusText(route, attemptsLeft)}.`;
}

/**
 * The Climber's scorecard as a sheet, laid out like a paper competition scorecard that scrolls with
 * the page over the competition's background (US-031): the event, the Climber, the point system,
 * and one row for each problem with its grade, the attempts used out of the attempts allowed, and
 * its points, then the totals. While scoring is open, the Climber records their own attempts and
 * sends in each problem's row. Problems the latest change touched are pointed out, and the change
 * is announced to screen readers. The gym's own logo, background and sponsors are shown when it has
 * set them up (US-021). The Climber can make the sheet's white background see-through, down to 10%,
 * so the background shows through it. Printing the page prints the sheet alone, on solid white.
 */
export default function ScoreSheet({ scorecard, changed, note, onRecord }: ScoreSheetProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [display, setDisplay] = useState<DisplaySettings>(emptyDisplay);
  const [opacity, setOpacity] = useState(readSheetOpacity);
  const [stuck, setStuck] = useState(false);
  const opacityId = useId();
  const toolbar = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const { competition, climber, registration, scoring, summary, routes } = scorecard;
  const name = climber ? `${climber.firstName} ${climber.lastName}`.trim() : "";
  const startTime = formatStartTime(competition.startTime);
  const changedIds = new Set(changed);
  const counts: Record<Filter, number> = {
    all: summary.routeCount,
    unfinished: summary.unfinished,
    completed: summary.completed,
  };
  const shown = routes.filter((route) => filter === "all" || route.completed === (filter === "completed"));
  const percent = summary.routeCount ? Math.round((summary.completed / summary.routeCount) * 100) : 0;
  const progressText = `${summary.completed} of ${summary.routeCount} ${summary.routeCount === 1 ? "problem" : "problems"} completed`;
  const background = display.background ?? backgroundImage(DEFAULT_BACKGROUND);
  const seeThrough = opacity < SHEET_OPACITY_MAX && routes.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    getPublicDisplay(competition._id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDisplay(result.settings);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [competition._id]);

  useEffect(() => {
    const bar = toolbar.current;
    if (!seeThrough || !bar) return;
    let frame = 0;
    // A stuck toolbar has left the place it takes in the sheet, so a gap opens between it and what comes before it.
    const check = () => {
      frame = 0;
      const above = bar.previousElementSibling?.getBoundingClientRect();
      setStuck(above !== undefined && bar.getBoundingClientRect().top - above.bottom > 1);
    };
    const later = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    later();
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    return () => {
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
      window.cancelAnimationFrame(frame);
    };
  }, [seeThrough]);

  function changeOpacity(value: number) {
    const next = sheetOpacity(value);
    setOpacity(next);
    saveSheetOpacity(next);
  }

  function choose(value: Filter) {
    setFilter(value);
    const bar = toolbar.current?.getBoundingClientRect();
    const rows = table.current?.getBoundingClientRect();
    // The filters stay on screen while the sheet scrolls under them, so a new filter starts from the top of its rows.
    if (bar && rows && rows.top < bar.bottom) table.current?.scrollIntoView({ block: "start" });
  }

  return (
    <section className={styles.section} aria-labelledby="score-sheet-title">
      <div className={styles.frame} style={{ "--sheet-opacity": `${opacity}%` } as CSSProperties}>
        {background && (
          <div
            className={styles.backdrop}
            data-background={background.reference}
            style={{ backgroundImage: `url("${background.src}")` }}
          />
        )}
        <div className={styles.content}>
          <div className={styles.frameTop}>
            {display.logo ? (
              <FrameImage key={display.logo.src} image={display.logo} className={styles.logo} />
            ) : (
              <span />
            )}
            <div className={styles.frameActions}>
              <div className={styles.opacity}>
                <label htmlFor={opacityId}>Sheet opacity</label>
                <input
                  id={opacityId}
                  type="range"
                  min={SHEET_OPACITY_MIN}
                  max={SHEET_OPACITY_MAX}
                  step={SHEET_OPACITY_STEP}
                  value={opacity}
                  aria-valuetext={`${opacity}%`}
                  onChange={(event) => changeOpacity(Number(event.target.value))}
                />
                <span className={styles.opacityValue} aria-hidden="true">
                  {opacity}%
                </span>
              </div>
              <button type="button" className={styles.print} onClick={() => window.print()}>
                Print
              </button>
            </div>
          </div>
          <article className={styles.sheet}>
            <h2 id="score-sheet-title" className={styles.title}>
              {competition.name} Scorecard
            </h2>
            <div className={styles.top}>
              <section className={styles.box} aria-labelledby="score-sheet-points">
                <h3 id="score-sheet-points">Point system</h3>
                <p>
                  {scoring
                    ? `Each problem has its own points: ${scoring.label}. A top on the first attempt keeps its full points.`
                    : "The gym hasn't set up scoring yet, so problems don't earn points yet."}
                </p>
              </section>
              <dl className={`${styles.box} ${styles.fields}`}>
                <div>
                  <dt>Name</dt>
                  <dd>{name || "Not available"}</dd>
                </div>
                <div>
                  <dt>Division</dt>
                  <dd>{registration.division?.name ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>
                    {formatCalendarDate(competition.date)}
                    {startTime ? `, ${startTime}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Gym</dt>
                  <dd>{competition.gym?.name ?? "Not available"}</dd>
                </div>
              </dl>
            </div>
            {note && <p className={styles.note}>{note}</p>}
            {routes.length > 0 && (
              <div ref={toolbar} className={styles.toolbar} data-stuck={(seeThrough && stuck) || undefined}>
                <div className={styles.progress}>
                  <p className={styles.progressText}>{progressText}</p>
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
                </div>
                <div className={styles.filters} role="group" aria-label="Show problems">
                  {FILTERS.map(({ value, label }) => (
                    <button key={value} type="button" aria-pressed={filter === value} onClick={() => choose(value)}>
                      {label} <span className={styles.filterCount}>{counts[value]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className={styles.hidden} role="status" aria-live="polite">
              {announcementFor(routes, changed, scoring?.maxAttempts ?? null)}
            </p>
            {routes.length === 0 ? (
              <p className={styles.empty}>This competition doesn't have any problems on its scorecard yet.</p>
            ) : (
              <table ref={table} className={styles.table}>
                <caption className={styles.hidden}>Your result on each problem</caption>
                <thead>
                  <tr>
                    <th scope="col">No.</th>
                    <th scope="col">Problem</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                {shown.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={COLUMNS} className={styles.empty}>
                        {filter === "completed"
                          ? "You haven't completed a problem yet."
                          : "You've completed every problem."}
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  shown.map((route) => (
                    <ProblemRows
                      key={route.routeId}
                      route={route}
                      scoring={scoring}
                      changed={changedIds.has(route.routeId)}
                      onRecord={onRecord && ((change) => onRecord(route.routeId, change))}
                    />
                  ))
                )}
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={COLUMNS - 1}>
                      Problems completed
                    </th>
                    <td>
                      {summary.completed} of {summary.routeCount}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" colSpan={COLUMNS - 1}>
                      Total attempts
                    </th>
                    <td>{summary.totalAttempts}</td>
                  </tr>
                  <tr className={styles.total}>
                    <th scope="row" colSpan={COLUMNS - 1}>
                      Total score
                    </th>
                    <td>{summary.totalScore}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </article>
          {display.sponsors.length > 0 && (
            <section className={styles.sponsors} aria-label="Sponsors">
              {display.sponsors.map((image, index) => (
                <FrameImage key={image.src + index} image={image} className={styles.sponsor} />
              ))}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

interface ProblemRowsProps {
  route: ScorecardRoute;
  scoring: Scorecard["scoring"];
  changed: boolean;
  onRecord?: (change: ResultChange | null) => Promise<void>;
}

/**
 * One problem on the sheet: its row, and while scoring is open a second row where the Climber adds
 * an attempt, records a send on the next attempt, or takes back the last attempt, which clears the
 * result once none are left.
 */
function ProblemRows({ route, scoring, changed, onRecord }: ProblemRowsProps) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { result } = route;
  const title = route.name || `Problem ${route.routeNumber}`;
  const attempts = result?.attempts ?? 0;
  const maxAttempts = scoring?.maxAttempts ?? null;
  const attemptsLeft = maxAttempts === null || attempts < maxAttempts;
  const scorable = Boolean(onRecord && scoring) && route.pointValue !== null;
  const canTry = scorable && !route.completed && attemptsLeft;
  const canUndo = scorable && attempts > 0;
  const unscored = Boolean(onRecord && scoring) && route.pointValue === null;

  async function record(change: ResultChange | null) {
    if (!onRecord) return;
    setSaving(true);
    setProblem(null);
    try {
      await onRecord(change);
    } catch (error) {
      setProblem(recordProblem(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tbody className={styles.problem} data-state={rowState(route)} data-changed={changed || undefined}>
      <tr>
        <td className={styles.number}>{route.routeNumber}</td>
        <th scope="row" className={styles.name}>
          <span className={styles.titleLine}>
            {title}
            {changed && <span className={styles.updated}>Updated</span>}
          </span>
          <span className={styles.meta}>
            <span>{pointsText(route.pointValue)}</span>
            <span className={styles.state}>{statusText(route, attemptsLeft)}</span>
          </span>
        </th>
        <td>{route.grade}</td>
        <td className={styles.attempts}>
          {maxAttempts === null ? (
            attempts
          ) : (
            <>
              <span aria-hidden="true">
                {attempts}/{maxAttempts}
              </span>
              <span className={styles.hidden}>
                {attempts} of {maxAttempts} attempts
              </span>
            </>
          )}
        </td>
        <td className={styles.points}>
          {result ? result.officialScore : <span className={styles.hidden}>No points yet</span>}
        </td>
      </tr>
      {(canTry || canUndo || unscored || problem) && (
        <tr className={styles.recordRow}>
          <td colSpan={COLUMNS}>
            {(canTry || canUndo) && (
              <div className={styles.record} role="group" aria-label={`Record your result on ${title}`}>
                {canTry && (
                  <>
                    <button
                      type="button"
                      className={workspace.secondary}
                      disabled={saving}
                      onClick={() => record({ attempts: attempts + 1, sent: false })}
                    >
                      Add attempt <span className={styles.hidden}>on {title}</span>
                    </button>
                    <button
                      type="button"
                      className={workspace.primary}
                      disabled={saving}
                      onClick={() => record({ attempts: attempts + 1, sent: true })}
                    >
                      Sent it <span className={styles.hidden}>on {title}</span>
                    </button>
                  </>
                )}
                {canUndo && (
                  <button
                    type="button"
                    className={styles.undo}
                    disabled={saving}
                    onClick={() => record(attempts > 1 ? { attempts: attempts - 1, sent: false } : null)}
                  >
                    Undo <span className={styles.hidden}>last attempt on {title}</span>
                  </button>
                )}
                <span className={styles.saving} role="status">
                  {saving ? "Saving…" : ""}
                </span>
              </div>
            )}
            {unscored && (
              <p className={styles.recordHint}>This problem doesn't have points yet, so it can't be scored.</p>
            )}
            {problem && (
              <p className={styles.recordProblem} role="alert">
                {problem}
              </p>
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}

/** One of the gym's display images. An image that can't be loaded is left out, so the sheet still reads well. */
function FrameImage({ image, className }: { image: DisplayImage; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className={className} src={image.src} alt={image.name} onError={() => setFailed(true)} />;
}
