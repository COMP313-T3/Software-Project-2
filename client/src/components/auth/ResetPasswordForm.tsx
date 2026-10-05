import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import { checkResetLink, resetPassword } from "../../lib/authApi.ts";
import styles from "./AuthForm.module.css";
import PasswordInput from "./PasswordInput.tsx";
import PasswordRules from "./PasswordRules.tsx";
import { useAuthForm, type AuthFieldSpec } from "./useAuthForm.ts";

type FieldName = "password" | "confirmPassword";
type Phase = "checking" | "ready" | "invalid" | "unavailable";

interface ResetPasswordFormProps {
  /** Class of the heading block, so it matches the other views. */
  introClassName: string;
  /** The token from the link in the email. Empty when the link had none. */
  token: string;
  /** Whether this view is the one showing. The link is checked once it is. */
  active?: boolean;
  /** Called with the account's email once the new password is saved. */
  onReset?: (email: string) => void;
}

const FIELDS: readonly AuthFieldSpec<FieldName>[] = [
  { name: "password", label: "New password", kind: "new-password" },
  {
    name: "confirmPassword",
    label: "Confirm password",
    kind: "confirm-password",
  },
];

const SAVING = "Saving your new password...";
const UNEXPECTED = "Something went wrong. Please try again.";
const CHECK_FAILED =
  "We couldn't check your link. Check your connection, then try again.";

function isInvalidLink(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "RESET_LINK_INVALID" || Boolean(error.fields?.token))
  );
}

/**
 * Reset password view, opened from the link in the email. It checks the link first, then asks
 * for the new password twice, with the same rules as sign-up. A link that expired or was used
 * offers to send a new one.
 */
export default function ResetPasswordForm({
  introClassName,
  token,
  active = true,
  onReset,
}: ResetPasswordFormProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>(token ? "checking" : "invalid");
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [checkProblem, setCheckProblem] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { values, errors, change, inputRef, submit, showErrors, focus } =
    useAuthForm(FIELDS, save);
  const fieldErrorShown = Boolean(errors.password || errors.confirmPassword);

  useEffect(() => {
    if (!active || !token) return;
    const request = new AbortController();
    checkResetLink(token, request.signal).then(
      (link) => {
        if (request.signal.aborted) return;
        setEmail(link.email);
        setPhase("ready");
      },
      (error: unknown) => {
        if (request.signal.aborted) return;
        if (isInvalidLink(error)) {
          setPhase("invalid");
          return;
        }
        setCheckProblem(
          error instanceof ApiError && error.status === 429
            ? error.message
            : CHECK_FAILED,
        );
        setPhase("unavailable");
      },
    );
    return () => request.abort();
  }, [active, token, attempt]);

  useEffect(() => {
    if (!active) return;
    if (phase === "ready") focus("password");
    else if (phase !== "checking") heading.current?.focus();
  }, [active, phase, focus]);

  async function save({ password }: Record<FieldName, string>) {
    if (saving || phase !== "ready") return;
    setSaving(true);
    setStatus(SAVING);
    try {
      await resetPassword(token, password);
      setStatus("");
      onReset?.(email);
    } catch (error) {
      if (isInvalidLink(error)) {
        setStatus("");
        setPhase("invalid");
      } else if (error instanceof ApiError && error.fields?.password) {
        showErrors(error.fields);
        setStatus("");
      } else {
        setStatus(error instanceof ApiError ? error.message : UNEXPECTED);
      }
    } finally {
      setSaving(false);
    }
  }

  function retry() {
    setPhase("checking");
    setAttempt((count) => count + 1);
  }

  if (phase === "invalid" || phase === "unavailable") {
    const invalid = phase === "invalid";
    return (
      <>
        <div className={introClassName}>
          <h1 id="resetTitle" ref={heading} tabIndex={-1}>
            {invalid
              ? "This link doesn't work anymore"
              : "Choose a new password"}
          </h1>
          <p>
            {invalid
              ? "Reset links work once, within 1 hour of being sent. Ask for a new one, then use the newest email."
              : checkProblem}
          </p>
        </div>
        <div
          id="resetForm"
          className={`${styles.form} ${styles.loginForm}`}
          role="tabpanel"
          aria-labelledby="tabLogin"
          data-spread="1"
        >
          <div className={styles.loginFooter}>
            <div className={styles.actions}>
              {invalid ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() =>
                    navigate("/forgot-password", { state: { focusForm: true } })
                  }
                >
                  Send a new link
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={retry}
                >
                  Try again
                </button>
              )}
            </div>
            <p className={styles.altAction}>
              <Link to="/login" state={{ focusForm: true }}>
                Back to log in
              </Link>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={introClassName}>
        <h1 id="resetTitle" ref={heading} tabIndex={-1}>
          Choose a new password
        </h1>
        <p>
          {phase === "ready" ? (
            <>
              For <strong>{email}</strong>.
            </>
          ) : (
            "Checking your reset link..."
          )}
        </p>
      </div>
      <form
        id="resetForm"
        className={`${styles.form} ${styles.loginForm}`}
        role="tabpanel"
        aria-labelledby="tabLogin"
        aria-busy={phase === "checking" || saving}
        data-spread="2"
        noValidate
        onSubmit={submit}
      >
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="resetPassword">New password</label>
            <PasswordInput
              ref={inputRef("password")}
              id="resetPassword"
              name="password"
              revealLabel="new password"
              autoComplete="new-password"
              aria-describedby="resetPasswordRules resetPasswordError"
              aria-invalid={errors.password ? true : undefined}
              required
              value={values.password}
              onChange={(event) => change("password", event.target.value)}
            />
            <span className={styles.error} id="resetPasswordError">
              {errors.password}
            </span>
          </div>
          <div className={styles.field}>
            <label htmlFor="resetConfirmPassword">Confirm password</label>
            <PasswordInput
              ref={inputRef("confirmPassword")}
              id="resetConfirmPassword"
              name="confirmPassword"
              revealLabel="confirm password"
              autoComplete="new-password"
              aria-describedby="resetConfirmPasswordError"
              aria-invalid={errors.confirmPassword ? true : undefined}
              required
              value={values.confirmPassword}
              onChange={(event) =>
                change("confirmPassword", event.target.value)
              }
            />
            <span className={styles.error} id="resetConfirmPasswordError">
              {errors.confirmPassword}
            </span>
          </div>
        </div>
        <PasswordRules id="resetPasswordRules" password={values.password} />
        <div className={styles.loginFooter}>
          <p className={styles.status} id="resetStatus" role="status">
            {fieldErrorShown ? "" : status}
          </p>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              Save new password
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
