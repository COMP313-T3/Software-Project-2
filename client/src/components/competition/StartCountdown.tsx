import { useEffect, useRef, useState, type ReactNode } from "react";
import { timeLeft, timeLeftText } from "../../lib/competitionStart.ts";
import { formatCompetitionStart, formatTorontoDateTime } from "../../lib/dateFormat.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./StartCountdown.module.css";

/** How long to wait before asking the server again once the start has come, in milliseconds. */
const FIRST_RETRY_MS = 2000;
const LONGEST_RETRY_MS = 30000;

const two = (value: number) => String(value).padStart(2, "0");

interface StartCountdownProps {
  /** The moment the competition starts, as the API sent it. */
  startsAt: string;
  /** The competition's date as YYYY-MM-DD and its start time as HH:mm, when the page has them. */
  date?: string;
  startTime?: string | null;
  /**
   * Called when the start comes, and again every so often while the page still shows the countdown,
   * so the page reads the server's answer and opens by itself. The server decides when a
   * competition has started, never the browser's clock.
   */
  onDue?: () => void;
}

/**
 * A countdown to a competition's start (US-028, US-030, AC-021): when it starts in Toronto time,
 * and the days, hours, minutes and seconds left. A screen reader gets the time left as a sentence
 * when it reads the timer, without being interrupted every second.
 */
export default function StartCountdown({ startsAt, date, startTime, onDue }: StartCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const left = timeLeft(startsAt, now);
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
  }, [startsAt, due]);

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
  }, [due, startsAt]);

  const when = date ? formatCompetitionStart(date, startTime) : formatTorontoDateTime(startsAt);
  const units: [string, string][] = [
    ...(left.days > 0 ? [[String(left.days), left.days === 1 ? "Day" : "Days"] as [string, string]] : []),
    [two(left.hours), "Hours"],
    [two(left.minutes), "Minutes"],
    [two(left.seconds), "Seconds"],
  ];

  return (
    <div className={styles.countdown}>
      <p className={styles.when}>
        Starts {when} <span className={styles.zone}>(Toronto time)</span>
      </p>
      <div className={styles.timer} role="timer" aria-label="Time until the competition starts">
        <span className={styles.hidden}>{due ? "Starting now" : `${timeLeftText(left)} left`}</span>
        <div className={styles.units} aria-hidden="true">
          {units.map(([value, label]) => (
            <div className={styles.unit} key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className={styles.status} role="status">
        {due ? "Starting now. This page opens by itself in a moment." : ""}
      </p>
    </div>
  );
}

interface NotStartedYetProps {
  /** The moment the competition starts, from the API's refusal. */
  startsAt: string;
  /** What the Climber came for, such as "Your scorecard" or "The leaderboard". */
  subject: string;
  /** Reads the page again, so it opens when the server says the competition has started. */
  onDue: () => void;
  /** Links the Climber can still use, such as their registration status. */
  children?: ReactNode;
}

/**
 * What a page that opens at the start shows before it (AC-021): why it's closed, the countdown,
 * and what the Climber can open meanwhile.
 */
export function NotStartedYet({ startsAt, subject, onDue, children }: NotStartedYetProps) {
  return (
    <section className={`${workspace.panel} ${styles.locked}`} aria-labelledby="not-started-heading">
      <h2 id="not-started-heading">This competition hasn't started yet</h2>
      <p className={styles.explain}>
        {subject} opens when the competition starts. You don't need to refresh: this page opens by itself.
      </p>
      <StartCountdown startsAt={startsAt} onDue={onDue} />
      {children && <div className={styles.links}>{children}</div>}
    </section>
  );
}
