import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Leaderboard, MyEntry } from "../../lib/leaderboardApi.ts";
import { MY_ROW_ID, ordinal, pointsText } from "../../lib/leaderboardText.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./MyStanding.module.css";

interface MyStandingProps {
  board: Leaderboard;
  /** Whether the Climber's row is on the page with the current division choice. */
  rowShown: boolean;
  /** Shows the Climber's own division, so their row is on the page. */
  onShowMyDivision: () => void;
}

interface Movement {
  up: boolean;
  from: number;
  to: number;
}

/** The place last shown, and how it changed from the one before. */
interface Seen {
  entryId: string | null;
  divisionId: string | null;
  rank: number | null;
  movement: Movement | null;
  announcement: string;
}

/**
 * What changed between two places. Up from or Down from only compares places in the same division
 * of the same registration, since a Gym Admin moving the Climber to another division isn't a move
 * up or down.
 */
function placeChange(seen: Seen, mine: MyEntry | null): Pick<Seen, "movement" | "announcement"> {
  if (!mine) return { movement: null, announcement: "You're no longer ranked." };
  if (seen.rank !== null && seen.entryId === mine.entryId && seen.divisionId === mine.division._id) {
    const up = mine.rank < seen.rank;
    return {
      movement: { up, from: seen.rank, to: mine.rank },
      announcement: `You moved ${up ? "up" : "down"} to ${ordinal(mine.rank)} place.`,
    };
  }
  return { movement: null, announcement: `You're now ranked ${ordinal(mine.rank)} in ${mine.division.name}.` };
}

function gapLines(board: Leaderboard, mine: MyEntry) {
  if (board.lastResultAt === null) return ["No official results yet, so everyone shares 1st place for now."];
  const lines = mine.problemsRecorded === 0 ? ["You don't have any official results yet."] : [];
  if (mine.rank === 1) return [...lines, mine.tied ? "You share 1st place." : "You're in the lead."];
  lines.push(`${pointsText(mine.pointsBehindLeader)} behind 1st place.`);
  if (mine.placeAbove && mine.placeAbove.rank > 1) {
    lines.push(`${pointsText(mine.placeAbove.pointsBehind)} behind ${ordinal(mine.placeAbove.rank)} place.`);
  }
  return lines;
}

function unrankedText(board: Leaderboard) {
  const registration = board.audience === "climber" ? board.myRegistration : null;
  if (!registration) return "You're not registered for this competition, so you're not on its leaderboard.";
  if (registration.status === "WAITLIST") return "You're on the waitlist, so you're not ranked. You'll appear here if your place is confirmed.";
  if (registration.status === "PENDING") return "Your place isn't confirmed yet, so you're not ranked. You'll appear here once it is.";
  if (!registration.division) return "You're not ranked because your registration doesn't have a division in this competition.";
  return "You're not ranked yet.";
}

function focusMyRow() {
  const row = document.getElementById(MY_ROW_ID);
  if (!row) return;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  row.scrollIntoView?.({ block: "center", behavior: still ? "auto" : "smooth" });
  row.focus({ preventScroll: true });
}

/** US-032 #32.4: the logged-in Climber's own position, kept current by live updates. */
export default function MyStanding({ board, rowShown, onShowMyDivision }: MyStandingProps) {
  const mine = board.myEntry ?? null;
  const place = { entryId: mine?.entryId ?? null, divisionId: mine?.division._id ?? null, rank: mine?.rank ?? null };
  const [seen, setSeen] = useState<Seen>({ ...place, movement: null, announcement: "" });
  if (seen.entryId !== place.entryId || seen.divisionId !== place.divisionId || seen.rank !== place.rank) {
    setSeen({ ...place, ...placeChange(seen, mine) });
  }

  // A live update can move the Climber's row in the table, and browsers drop focus from a moved
  // element. The row gets focus back when it had it and nothing else took it since.
  const rowFocused = useRef(false);
  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      rowFocused.current = event.target instanceof Element && event.target.id === MY_ROW_ID;
    }
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element && event.target.closest(`#${MY_ROW_ID}`))) rowFocused.current = false;
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!rowFocused.current || (active && active !== document.body)) return;
    document.getElementById(MY_ROW_ID)?.focus({ preventScroll: true });
  }, [board]);

  const pending = useRef(false);
  useEffect(() => {
    if (pending.current && rowShown) {
      pending.current = false;
      focusMyRow();
    }
  }, [rowShown]);

  function showMyRow() {
    if (rowShown) {
      focusMyRow();
      return;
    }
    pending.current = true;
    onShowMyDivision();
  }

  const { movement } = seen;
  return (
    <section className={`${workspace.panel} ${styles.panel}`} aria-labelledby="my-standing-heading">
      <div className={styles.heading}>
        <h2 id="my-standing-heading">Your position</h2>
        {movement && (
          <span className={`${styles.chip} ${movement.up ? styles.up : styles.down}`}>
            {movement.up ? "Up" : "Down"} from {ordinal(movement.from)}
          </span>
        )}
      </div>
      {mine ? (
        <>
          <div className={styles.summary}>
            <div>
              <p className={styles.place}>
                <strong>{ordinal(mine.rank)}</strong>
                {mine.tied && <span className={`${styles.chip} ${styles.tied}`}>Tied</span>}
              </p>
              <p className={styles.of}>
                of {mine.of} {mine.of === 1 ? "Climber" : "Climbers"} in {mine.division.name}
              </p>
            </div>
            <div>
              <p className={styles.points}>{pointsText(mine.totalScore)}</p>
              {gapLines(board, mine).map((line) => (
                <p key={line} className={styles.gap}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={workspace.secondary} onClick={showMyRow}>
              Show my row
            </button>
          </div>
        </>
      ) : (
        <p className={styles.note}>{unrankedText(board)}</p>
      )}
      <p className={styles.hidden} role="status">
        {seen.announcement}
      </p>
    </section>
  );
}
