import { useEffect, useRef, useState } from "react";
import { timeLeft, timeLeftText } from "../../lib/competitionStart.ts";
import { formatStartTime } from "../../lib/dateFormat.ts";
import styles from "./EndCountdown.module.css";

/** How long to wait before asking the server again once the end has come, in milliseconds. */
const FIRST_RETRY_MS = 2000;
const LONGEST_RETRY_MS = 30000;

const two = (value: number) => String(value).padStart(2, "0");

interface EndCountdownProps {
  /** The moment the competition ends, as the API sent it. */
  endsAt: string;
  /** Its end time on Toronto's clock as HH:mm, or null for a competition that ends with its day. */
  endTime?: string | null;
  /**
   * Called when the end comes, and again every so often while the page still shows the countdown,
   * so the page reads the server's answer and closes scoring by itself. The server decides when a
   * competition has ended, never the browser's clock.
   */
  onDue?: () => void;
}

/**
 * The countdown while a competition is on (AC-021): when Climbers' scoring closes, in Toronto time,
 * and the hours, minutes and seconds left. A screen reader gets the time left as a sentence when
 * it reads the timer, without being interrupted every second.
 */
export default function EndCountdown({ endsAt, endTime, onDue }: EndCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const left = timeLeft(endsAt, now);
  const due = left.total === 0;
  const ask = useRef(onDue);
  useEffect(() => {
    ask.current = onDue;
  });

  useEffect(() => {
    if (due) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    // A phone pauses timers in a background tab, so the time is read again when the page returns.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt, due]);

  useEffect(() => {
    if (!due) return;
    let timer = 0;
    let wait = FIRST_RETRY_MS;
    const check = () => {
      ask.current?.();
      timer = window.setTimeout(check, wait);
      wait = Math.min(LONGEST_RETRY_MS, wait * 2);
    };
    check();
    return () => window.clearTimeout(timer);
  }, [due, endsAt]);

  const time = formatStartTime(endTime);
  const hours = left.days * 24 + left.hours;
  const clock = `${hours}:${two(left.minutes)}:${two(left.seconds)}`;

  return (
    <section className={styles.closing} aria-label="When scoring closes">
      <p className={styles.when}>
        {due ? "Scoring is closed" : time ? `Scoring closes at ${time}` : "Scoring closes at the end of the day"}{" "}
        <span className={styles.zone}>(Toronto time)</span>
      </p>
      {!due && (
        <p className={styles.left} role="timer" aria-label="Time until scoring closes">
          <span className={styles.hidden}>{`${timeLeftText(left)} left`}</span>
          <span className={styles.clock} aria-hidden="true">
            {clock}
          </span>
          <span aria-hidden="true"> left</span>
        </p>
      )}
      <p className={styles.status} role="status">
        {due ? "Results are final. This page updates by itself in a moment." : ""}
      </p>
    </section>
  );
}
