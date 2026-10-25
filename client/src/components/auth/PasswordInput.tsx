import { useState, type ComponentPropsWithRef } from "react";
import styles from "./AuthForm.module.css";

type PasswordInputProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  /** Id of the input, also used to label the show and hide button. */
  id: string;
  /** What the show and hide button names for screen readers, such as "confirm password". */
  revealLabel?: string;
};

/**
 * Password input with a Show and Hide button. Marked with data-pw so the mascot closes its eyes
 * while it has focus.
 */
export default function PasswordInput({
  id,
  revealLabel = "password",
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.control}>
      <input
        {...inputProps}
        id={id}
        type={visible ? "text" : "password"}
        data-pw=""
      />
      <button
        type="button"
        className={styles.reveal}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={`${visible ? "Hide" : "Show"} ${revealLabel}`}
        data-reveal=""
        onClick={() => setVisible((shown) => !shown)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>{visible ? "Hide" : "Show"}</span>
      </button>
    </div>
  );
}
