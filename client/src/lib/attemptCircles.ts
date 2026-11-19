import type { ResultChange } from "./scorecardApi.ts";

/** What a circle stands for: a failed attempt, the attempt that topped the problem, or one not used yet. */
export type CircleState = "failed" | "sent" | "unused";

export interface AttemptCircle {
  /** The attempt the circle stands for, counted from 1. */
  number: number;
  state: CircleState;
  /**
   * What tapping the circle saves: a result, or null to clear the problem's result. It's left out
   * when the circle can't be tapped.
   */
  tap?: ResultChange | null;
}

function attemptCount(count: number): string {
  return `${count} ${count === 1 ? "attempt" : "attempts"}`;
}

/** The result once the last marked circle is cleared: one attempt fewer without a top, or no result. */
function without(marked: number): ResultChange | null {
  return marked > 1 ? { attempts: marked - 1, sent: false } : null;
}

/**
 * A problem's attempt circles, one for each attempt the competition allows (US-031). The marked
 * circles are the attempts used: failed ones, and last the top when the problem was sent.
 *
 * Tapping an unused circle marks it and every circle before it as failed. Tapping the last marked
 * circle clears it, whether it's a failed attempt or the top, and tapping an earlier one goes back
 * to that many attempts. A top takes no more attempts, so only the top itself can be tapped until
 * it's cleared.
 *
 * @param attempts The attempts recorded on the problem.
 * @param sent Whether the last attempt topped it.
 * @param maxAttempts The attempts the competition allows on a problem.
 */
export function attemptCircles(attempts: number, sent: boolean, maxAttempts: number): AttemptCircle[] {
  const marked = Math.min(Math.max(attempts, 0), maxAttempts);
  return Array.from({ length: Math.max(maxAttempts, 0) }, (_, index) => {
    const number = index + 1;
    const last = number === marked;
    const circle: AttemptCircle = {
      number,
      state: number > marked ? "unused" : last && sent ? "sent" : "failed",
    };
    if (last) circle.tap = without(marked);
    else if (!sent) circle.tap = { attempts: number, sent: false };
    return circle;
  });
}

/**
 * The result Sent it saves: a top on the next attempt. Nothing once the problem is topped or no
 * attempts are left.
 *
 * @param attempts The attempts recorded on the problem.
 * @param sent Whether the last attempt topped it.
 * @param maxAttempts The attempts the competition allows on a problem.
 */
export function topOnNextAttempt(attempts: number, sent: boolean, maxAttempts: number): ResultChange | undefined {
  return sent || attempts >= maxAttempts ? undefined : { attempts: attempts + 1, sent: true };
}

/**
 * What tapping a circle does, in words, for its button's name.
 *
 * @param circle A circle that can be tapped.
 * @param title The problem's name.
 */
export function circleAction(circle: AttemptCircle, title: string): string {
  if (circle.state === "sent") return `Take back the send on ${title}`;
  if (circle.state === "unused") return `Mark ${attemptCount(circle.number)} on ${title}`;
  return circle.tap?.attempts === circle.number
    ? `Go back to ${attemptCount(circle.number)} on ${title}`
    : `Clear attempt ${circle.number} on ${title}`;
}
