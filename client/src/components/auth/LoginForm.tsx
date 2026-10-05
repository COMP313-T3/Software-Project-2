import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import styles from "./AuthForm.module.css";
import PasswordInput from "./PasswordInput.tsx";
import { useAuthForm, type AuthFieldSpec } from "./useAuthForm.ts";

/** Values the log in form sends once both fields pass their checks. */
export interface LoginValues {
  email: string;
  password: string;
}

interface LoginFormProps {
  /** Whether the log in view is the one showing. */
  active?: boolean;
  /** Shows the "Eyes closed" note while the mascot's eyes are closed. */
  eyesClosed?: boolean;
  /**
   * Message for the status line above the button, such as "You're logged out." A failed log in
   * replaces it. Hidden while a field shows an error.
   */
  status?: string;
  /** Email to start with, after an account was just created. The password then gets focus. */
  initialEmail?: string;
  /**
   * Logs in with the email and password once both pass their checks. When it throws, the error's
   * message shows in the status line, or under the fields it names.
   */
  onSubmit?: (values: LoginValues) => Promise<void>;
  /**
   * Changes each time the view is opened from a link in the card, which moves focus to the
   * first empty field.
   */
  focusRequest?: string | null;
}

const FIELDS: readonly AuthFieldSpec<keyof LoginValues>[] = [
  { name: "email", label: "Email", kind: "email" },
  { name: "password", label: "Password", kind: "current-password" },
];

const LOGGING_IN = "Logging in...";
const UNEXPECTED = "Something went wrong. Please try again.";

/**
 * Log in form: email and password, checked before sending. A failed log in keeps both fields and
 * moves focus to the password.
 */
export default function LoginForm({
  active = true,
  eyesClosed = false,
  status = "",
  initialEmail = "",
  onSubmit,
  focusRequest = null,
}: LoginFormProps) {
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const { values, errors, change, inputRef, submit, showErrors, focus } =
    useAuthForm(FIELDS, send, { email: initialEmail });
  const focusPassword = useRef(initialEmail !== "");
  const handledFocusRequest = useRef<string | null>(null);
  const fieldErrorShown = Boolean(errors.email || errors.password);

  async function send(submitted: LoginValues) {
    if (sending || !onSubmit) return;
    setSending(true);
    setProblem(LOGGING_IN);
    try {
      await onSubmit(submitted);
      setProblem("");
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.fields?.email || error.fields?.password)
      ) {
        showErrors(error.fields);
        setProblem("");
      } else {
        setProblem(error instanceof ApiError ? error.message : UNEXPECTED);
        focus("password");
      }
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!active || !focusPassword.current) return;
    focusPassword.current = false;
    focus("password");
  });

  useEffect(() => {
    if (!focusRequest || handledFocusRequest.current === focusRequest) return;
    handledFocusRequest.current = focusRequest;
    focus(values.email ? "password" : "email");
  }, [focusRequest, focus, values.email]);

  return (
    <form
      id="loginForm"
      className={`${styles.form} ${styles.loginForm}`}
      role="tabpanel"
      aria-labelledby="tabLogin"
      aria-busy={sending}
      noValidate
      onSubmit={submit}
    >
      <div className={styles.field}>
        <label htmlFor="loginEmail">Email</label>
        <input
          ref={inputRef("email")}
          id="loginEmail"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@example.com"
          aria-describedby="loginEmailError"
          aria-invalid={errors.email ? true : undefined}
          required
          value={values.email}
          onChange={(event) => change("email", event.target.value)}
        />
        <span className={styles.error} id="loginEmailError">
          {errors.email}
        </span>
      </div>
      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label htmlFor="loginPassword">Password</label>
          <span
            className={styles.peekNote}
            data-visible={eyesClosed}
            aria-hidden="true"
          >
            Eyes closed. No peeking.
          </span>
        </div>
        <PasswordInput
          ref={inputRef("password")}
          id="loginPassword"
          name="password"
          autoComplete="current-password"
          aria-describedby="loginPasswordError"
          aria-invalid={errors.password ? true : undefined}
          required
          value={values.password}
          onChange={(event) => change("password", event.target.value)}
        />
        <span className={styles.error} id="loginPasswordError">
          {errors.password}
        </span>
      </div>
      <div className={styles.loginFooter}>
        <p className={styles.status} id="loginStatus" role="status">
          {fieldErrorShown ? "" : problem || status}
        </p>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>
            Log in
          </button>
        </div>
        <p className={styles.altAction}>
          <Link
            to="/forgot-password"
            state={{ focusForm: true, email: values.email.trim() }}
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </form>
  );
}
