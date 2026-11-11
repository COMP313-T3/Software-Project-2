import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatStartTime } from "../../lib/dateFormat.ts";
import { dueEndWarning, nextEndWarningIn, rememberEndWarning } from "../../lib/endWarnings.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./EndWarning.module.css";

/** setTimeout can't wait longer than this many milliseconds. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

interface EndWarningProps {
  /** The competition, so each warning opens once for it in this browser. */
  competitionId: string;
  /** The moment the competition ends, as the API sent it. */
  endsAt: string;
  /** Its end time on Toronto's clock as HH:mm, or null for a competition that ends with its day. */
  endTime?: string | null;
  /** Where My scorecard is, for the warning on a page other than the scorecard. */
  scorecardPath?: string;
}

/**
 * The warnings a Climber gets before a competition ends (AC-024): one when 15 minutes are left and
 * one when 5 are, saying when scoring closes and that their scorecard closes for good then. Each
 * opens once per competition in this browser, on whichever of the Climber's pages is open, and a
 * page opened late shows the warning for the time actually left. Only rendered while the
 * competition is on.
 */
export default function EndWarning({ competitionId, endsAt, endTime, scorecardPath }: EndWarningProps) {
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const gotIt = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function check() {
      clearTimeout(timer);
      const left = Date.parse(endsAt) - Date.now();
      const due = dueEndWarning(competitionId, left);
      if (due !== null) {
        rememberEndWarning(competitionId, due);
        setMinutesLeft(Math.max(1, Math.round(left / 60_000)));
      }
      const wait = nextEndWarningIn(left);
      if (wait !== null) timer = setTimeout(check, Math.min(wait + 50, LONGEST_WAIT_MS));
    }
    // A tab in the background or a device asleep can run its timers late, so the time left is
    // checked again as soon as the page is seen.
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    timer = setTimeout(check, 0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", check);
    };
  }, [competitionId, endsAt]);

  useEffect(() => {
    const element = dialog.current;
    if (minutesLeft === null || !element) return;
    if (!element.open) {
      returnFocus.current = document.activeElement;
      element.showModal();
    }
    gotIt.current?.focus();
  }, [minutesLeft]);

  function closed() {
    const back = returnFocus.current;
    returnFocus.current = null;
    setMinutesLeft(null);
    if (back instanceof HTMLElement && back.isConnected) back.focus();
  }

  if (minutesLeft === null) return null;
  const end = formatStartTime(endTime ?? null);
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      className={styles.dialog}
      onClose={closed}
    >
      <h2 id={titleId}>{minutesLeft === 1 ? "1 minute left" : `${minutesLeft} minutes left`}</h2>
      <div id={textId}>
        <p className={styles.when}>
          {end ? (
            <>
              Scoring closes at {end} <span className={styles.zone}>(Toronto time)</span>
            </>
          ) : (
            "Scoring closes at the end of the day."
          )}
        </p>
        <p>
          {scorecardPath
            ? "Record your last attempts on My scorecard now. When the time is up, your scorecard closes for good and the final leaderboard opens."
            : "Record your last attempts now. When the time is up, your scorecard closes for good and you're taken to the final leaderboard."}
        </p>
      </div>
      <div className={styles.actions}>
        {scorecardPath && (
          <Link className={workspace.primary} to={scorecardPath}>
            Open My scorecard
          </Link>
        )}
        <button
          ref={gotIt}
          type="button"
          className={scorecardPath ? workspace.secondary : workspace.primary}
          onClick={() => dialog.current?.close()}
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}
