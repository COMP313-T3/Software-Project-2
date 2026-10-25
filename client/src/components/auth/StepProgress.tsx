import styles from "./AuthForm.module.css";

interface StepProgressProps {
  /** Titles of every step, in order. */
  steps: readonly string[];
  /** Index of the step showing now, starting at 0. */
  current: number;
}

/**
 * Progress bar for the create account steps: the step's title, "Step 2 of 5", and one segment
 * per step, filled up to the current one.
 */
export default function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <div className={styles.progress}>
      <p className={styles.progressLabel} aria-live="polite">
        <span className={styles.progressTitle}>{steps[current]}</span>
        <span>
          Step {current + 1} of {steps.length}
        </span>
      </p>
      <div className={styles.progressBar} aria-hidden="true">
        {steps.map((title, index) => (
          <span key={title} data-done={index <= current} />
        ))}
      </div>
    </div>
  );
}
