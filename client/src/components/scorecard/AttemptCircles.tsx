import { attemptCircles, circleAction } from "../../lib/attemptCircles.ts";
import type { ResultChange } from "../../lib/scorecardApi.ts";
import styles from "./AttemptCircles.module.css";

interface AttemptCirclesProps {
  /** The problem's name, for the circles' button names. */
  title: string;
  /** The attempts recorded on the problem. */
  attempts: number;
  /** Whether the last attempt topped the problem. */
  sent: boolean;
  /** The attempts the competition allows on a problem. */
  maxAttempts: number;
  /** True while a result is being saved, when taps are ignored. */
  busy: boolean;
  /** Saves the result a tapped circle stands for, or clears the problem's result with null. */
  onChange: (change: ResultChange | null) => void;
}

/**
 * A problem's attempts as a row of circles, one for each attempt the competition allows (US-031):
 * filled red for a failed attempt, filled green with a check mark for the top, and empty with its
 * number while unused. The Climber taps a circle to mark their attempts, and taps the last marked
 * one again to clear it. A circle that can't be tapped is drawn for sighted users only, since the
 * problem's row already gives its attempts and status in words.
 */
export default function AttemptCircles({ title, attempts, sent, maxAttempts, busy, onChange }: AttemptCirclesProps) {
  return (
    <span className={styles.circles} data-tour="attempts">
      {attemptCircles(attempts, sent, maxAttempts).map((circle) => {
        const number = circle.state === "unused" ? circle.number : null;
        const { tap } = circle;
        if (tap === undefined) {
          return (
            <span key={circle.number} className={styles.circle} data-state={circle.state} data-locked="" aria-hidden="true">
              {number}
            </span>
          );
        }
        return (
          <button
            key={circle.number}
            type="button"
            className={styles.circle}
            data-state={circle.state}
            aria-label={circleAction(circle, title)}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (!busy) onChange(tap);
            }}
          >
            {number}
          </button>
        );
      })}
    </span>
  );
}
