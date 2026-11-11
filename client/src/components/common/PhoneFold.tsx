import { useId, useState, type ReactNode } from "react";
import { readFoldOpen, saveFoldOpen } from "../../lib/phoneFolds.ts";
import styles from "./PhoneFold.module.css";

interface PhoneFoldProps {
  /** The section's name for its remembered choice, such as scorecard-overview. */
  name: string;
  /** What the section holds, in a few words. Screen readers hear it before the bar's text. */
  about: string;
  /** The bar's main line. */
  label: ReactNode;
  /** A second line with the section's key facts, so they stay in view while it's folded. */
  summary?: ReactNode;
  /** True when the section holds something the user has to read, so it starts open. */
  startsOpen?: boolean;
  /** A class for the whole section, so a page can fit the bar into its own layout. */
  className?: string;
  children: ReactNode;
}

/**
 * A section that folds into a bar on a phone, so what comes after it is reached without a long
 * scroll (NR-005). The bar opens and folds the section, and the browser keeps that choice until
 * the user logs out. On a larger screen there is no bar, and the section is always shown.
 */
export default function PhoneFold({
  name,
  about,
  label,
  summary,
  startsOpen = false,
  className,
  children,
}: PhoneFoldProps) {
  const [open, setOpen] = useState(() => readFoldOpen(name, startsOpen));
  const id = useId();

  function toggle() {
    setOpen(!open);
    saveFoldOpen(name, !open);
  }

  return (
    <div className={className ? `${styles.fold} ${className}` : styles.fold} data-open={open || undefined}>
      <button
        type="button"
        className={styles.bar}
        aria-expanded={open}
        aria-controls={id}
        data-tour="fold"
        onClick={toggle}
      >
        <span className={styles.text}>
          <span className={styles.hidden}>{about}: </span>
          <span className={styles.label}>{label}</span>
          {summary && <span className={styles.summary}>{summary}</span>}
        </span>
        <span className={styles.arrow} aria-hidden="true" />
      </button>
      <div id={id} className={styles.body}>
        {children}
      </div>
    </div>
  );
}
