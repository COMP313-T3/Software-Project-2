import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCalendarDate } from "../../lib/dateFormat.ts";
import { emptyDisplay, type DisplayImage, type DisplaySettings } from "../../lib/displayCustomization.ts";
import { getPublicDisplay } from "../../lib/displaySettingsApi.ts";
import type { Scorecard } from "../../lib/scorecardApi.ts";
import theme from "../layout/theme.module.css";
import styles from "./ScoreSheet.module.css";

interface ScoreSheetProps {
  scorecard: Scorecard;
  /** What the Climber can do with their results right now, as on the scorecard. */
  note: string | null;
  /** Called once the sheet has closed. */
  onClose: () => void;
}

/**
 * The Climber's whole scorecard as one sheet, laid out like a paper competition scorecard: the
 * event, the Climber, the point system, every problem with its attempts, flash and points, and the
 * totals. The competition's own logo, background and sponsors are shown when the gym has set them
 * up (US-021). It follows the same live scorecard as the page, so it stays current while open.
 * It is placed directly in the page body so that printing shows the sheet alone.
 */
export default function ScoreSheet({ scorecard, note, onClose }: ScoreSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [display, setDisplay] = useState<DisplaySettings>(emptyDisplay);
  const { competition, climber, registration, scoring, summary, routes } = scorecard;
  const name = climber ? `${climber.firstName} ${climber.lastName}`.trim() : "";

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) element.showModal();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getPublicDisplay(competition._id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDisplay(result.settings);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [competition._id]);

  return createPortal(
    <dialog ref={dialog} className={`${theme.theme} ${styles.dialog}`} aria-labelledby="score-sheet-title" onClose={onClose}>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
      <div className={styles.frame}>
        {display.background && <FrameImage key={display.background.src} image={display.background} className={styles.backdrop} decorative />}
        {display.logo && <FrameImage key={display.logo.src} image={display.logo} className={styles.logo} />}
        <article className={styles.sheet}>
          <h2 id="score-sheet-title" className={styles.title}>
            {competition.name} Scorecard
          </h2>
          <div className={styles.top}>
            <section className={styles.box} aria-labelledby="score-sheet-points">
              <h3 id="score-sheet-points">Point system</h3>
              <p>
                {scoring
                  ? `Each problem has its own points: ${scoring.label}. A flash keeps its full points.`
                  : "The gym hasn't set up scoring yet."}
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
                <dd>{formatCalendarDate(competition.date)}</dd>
              </div>
              <div>
                <dt>Gym</dt>
                <dd>{competition.gym?.name ?? "Not available"}</dd>
              </div>
            </dl>
          </div>
          {note && <p className={styles.note}>{note}</p>}
          <table className={styles.table}>
            <caption className={styles.hidden}>Your result on each problem</caption>
            <thead>
              <tr>
                <th scope="col">No.</th>
                <th scope="col">Problem</th>
                <th scope="col">Grade</th>
                <th scope="col">Attempts</th>
                <th scope="col">Flash</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.routeId} data-completed={route.completed || undefined}>
                  <td>{route.routeNumber}</td>
                  <th scope="row">{route.name || `Problem ${route.routeNumber}`}</th>
                  <td>{route.grade}</td>
                  <td>{route.result?.attempts ?? ""}</td>
                  <td>
                    <span className={styles.check} data-checked={route.result?.flash || undefined} aria-hidden="true" />
                    <span className={styles.hidden}>{route.result?.flash ? "Yes" : "No"}</span>
                  </td>
                  <td>{route.result ? route.result.officialScore : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5}>
                  Problems completed
                </th>
                <td>
                  {summary.completed} of {summary.routeCount}
                </td>
              </tr>
              <tr>
                <th scope="row" colSpan={5}>
                  Flashes
                </th>
                <td>{summary.flashes}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={5}>
                  Total attempts
                </th>
                <td>{summary.totalAttempts}</td>
              </tr>
              <tr className={styles.total}>
                <th scope="row" colSpan={5}>
                  Total score
                </th>
                <td>{summary.totalScore}</td>
              </tr>
            </tfoot>
          </table>
        </article>
        {display.sponsors.length > 0 && (
          <section className={styles.sponsors} aria-label="Sponsors">
            {display.sponsors.map((image, index) => (
              <FrameImage key={image.src + index} image={image} className={styles.sponsor} />
            ))}
          </section>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

/** One of the gym's display images. An image that can't be loaded is left out, so the sheet still reads well. */
function FrameImage({ image, className, decorative = false }: { image: DisplayImage; className: string; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className={className} src={image.src} alt={decorative ? "" : image.name} onError={() => setFailed(true)} />;
}
