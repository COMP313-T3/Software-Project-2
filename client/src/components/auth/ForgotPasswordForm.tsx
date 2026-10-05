import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import { requestPasswordReset } from "../../lib/authApi.ts";
import styles from "./AuthForm.module.css";
import { useAuthForm, type AuthFieldSpec } from "./useAuthForm.ts";

interface ForgotPasswordFormProps {
  /** Class of the heading block, so it matches the other views. */
  introClassName: string;
  /** Email to start with, such as the one typed in the log in form. */
  initialEmail?: string;
  /** Changes each time the view is opened from a link in the card, which moves focus to the email. */
  focusRequest?: string | null;
}

const FIELDS: readonly AuthFieldSpec<"email">[] = [
  { name: "email", label: "Email", kind: "email" },
];

const SENDING = "Sending the link...";
const UNEXPECTED = "Something went wrong. Please try again.";

/**
 * Forgot password view: asks for the account's email, then says a reset link is on its way.
 * The answer is the same whether or not the email has an account.
 */
export default function ForgotPasswordForm({
  introClassName,
  initialEmail = "",
  focusRequest = null,
}: ForgotPasswordFormProps) {
  const [sentTo, setSentTo] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const changedStep = useRef(false);
  const { values, errors, change, inputRef, submit, showErrors, focus } =
    useAuthForm(FIELDS, send, { email: initialEmail });

  useEffect(() => {
    if (focusRequest) focus("email");
  }, [focusRequest, focus]);

  useEffect(() => {
    if (!changedStep.current) return;
    if (sentTo) heading.current?.focus();
    else focus("email");
  }, [sentTo, focus]);

  async function send({ email }: { email: string }) {
    if (sending) return;
    setSending(true);
    setStatus(SENDING);
    try {
      await requestPasswordReset(email.trim());
      changedStep.current = true;
      setSentTo(email.trim());
      setStatus("");
    } catch (error) {
      if (error instanceof ApiError && error.fields?.email) {
        showErrors(error.fields);
        setStatus("");
      } else {
        setStatus(error instanceof ApiError ? error.message : UNEXPECTED);
      }
    } finally {
      setSending(false);
    }
  }

  function tryAgain() {
    changedStep.current = true;
    setSentTo("");
  }

  if (sentTo) {
    return (
      <>
        <div className={introClassName}>
          <h1 id="forgotTitle" ref={heading} tabIndex={-1}>
            Check your email
          </h1>
          <p>
            If an account uses <strong>{sentTo}</strong>, we sent it a link to
            choose a new password. The link works for 1 hour.
          </p>
        </div>
        <div
          id="forgotForm"
          className={`${styles.form} ${styles.loginForm}`}
          role="tabpanel"
          aria-labelledby="tabLogin"
          data-spread="1"
        >
          <div className={styles.loginFooter}>
            <div className={styles.actions}>
              <Link
                to="/login"
                state={{ focusForm: true }}
                className={styles.primary}
              >
                Back to log in
              </Link>
            </div>
            <p className={styles.altAction}>
              Didn't get it? Check your spam folder, or{" "}
              <button type="button" onClick={tryAgain}>
                try again
              </button>
              .
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={introClassName}>
        <h1 id="forgotTitle" ref={heading} tabIndex={-1}>
          Forgot your password?
        </h1>
        <p>
          Enter the email you signed up with, and we'll send you a link to
          choose a new one.
        </p>
      </div>
      <form
        id="forgotForm"
        className={`${styles.form} ${styles.loginForm}`}
        role="tabpanel"
        aria-labelledby="tabLogin"
        aria-busy={sending}
        data-spread="2"
        noValidate
        onSubmit={submit}
      >
        <div className={styles.field}>
          <label htmlFor="forgotEmail">Email</label>
          <input
            ref={inputRef("email")}
            id="forgotEmail"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="you@example.com"
            aria-describedby="forgotEmailError"
            aria-invalid={errors.email ? true : undefined}
            required
            value={values.email}
            onChange={(event) => change("email", event.target.value)}
          />
          <span className={styles.error} id="forgotEmailError">
            {errors.email}
          </span>
        </div>
        <div className={styles.loginFooter}>
          <p className={styles.status} id="forgotStatus" role="status">
            {errors.email ? "" : status}
          </p>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              Send reset link
            </button>
          </div>
          <p className={styles.altAction}>
            <Link to="/login" state={{ focusForm: true }}>
              Back to log in
            </Link>
          </p>
        </div>
      </form>
    </>
  );
}
