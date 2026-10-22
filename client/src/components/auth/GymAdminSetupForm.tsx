import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import {
  checkSetupLink,
  completeGymAdminSetup,
  type GymAdminSetupLink,
} from "../../lib/gymAdminSetupApi.ts";
import styles from "./AuthForm.module.css";
import { PASSWORD_MAX_LENGTH } from "./authValidation.ts";
import PasswordInput from "./PasswordInput.tsx";
import PasswordRules from "./PasswordRules.tsx";
import { useAuthForm, type AuthFieldSpec } from "./useAuthForm.ts";

type FieldName = "password" | "confirmPassword";
type Phase = "checking" | "ready" | "invalid" | "unavailable";

interface GymAdminSetupFormProps {
  /** Class of the heading block, so it matches the other views. */
  introClassName: string;
  /** The token from the link in the approval email. Empty when the link had none. */
  token: string;
  /** Whether this view is the one showing. The link is checked once it is. */
  active?: boolean;
  /** Called with the account's email and the API's message once the account is set up. */
  onSetUp?: (email: string, message: string) => void;
}

const FIELDS: readonly AuthFieldSpec<FieldName>[] = [
  {
    name: "password",
    label: "Password",
    kind: "new-password",
    maxLength: PASSWORD_MAX_LENGTH,
  },
  {
    name: "confirmPassword",
    label: "Confirm password",
    kind: "confirm-password",
  },
];

const SAVING = "Setting up your account...";
const UNEXPECTED = "Something went wrong. Please try again.";
const CHECK_FAILED =
  "We couldn't check your link. Check your connection, then try again.";

function isInvalidLink(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "SETUP_LINK_INVALID" || Boolean(error.fields?.token))
  );
}

/**
 * Gym Administrator account setup, opened from the link in the approval email (US-035
 * criterion 6). It checks the link first, shows whose account it sets up and for which gym, then
 * asks for a password twice, with the same rules as sign-up. Setting up doesn't log in: the new
 * Gym Administrator logs in next.
 */
export default function GymAdminSetupForm({
  introClassName,
  token,
  active = true,
  onSetUp,
}: GymAdminSetupFormProps) {
  const [phase, setPhase] = useState<Phase>(token ? "checking" : "invalid");
  const [applicant, setApplicant] = useState<GymAdminSetupLink | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checkProblem, setCheckProblem] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { values, errors, change, inputRef, submit, showErrors, focus } =
    useAuthForm(FIELDS, save);
  const fieldErrorShown = Boolean(errors.password || errors.confirmPassword);
  const email = applicant?.email ?? "";

  useEffect(() => {
    if (!active || !token) return;
    const request = new AbortController();
    checkSetupLink(token, request.signal).then(
      (link) => {
        if (request.signal.aborted) return;
        setApplicant(link);
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
      const result = await completeGymAdminSetup(token, password);
      setStatus("");
      onSetUp?.(result.user.email, result.message);
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
          <h1 id="setupTitle" ref={heading} tabIndex={-1}>
            {invalid ? "This link doesn't work anymore" : "Set up your account"}
          </h1>
          <p>
            {invalid
              ? "Setup links work once, within 7 days of being sent. Contact TopSend to get a new one."
              : checkProblem}
          </p>
        </div>
        <div
          id="setupForm"
          className={`${styles.form} ${styles.loginForm}`}
          role="tabpanel"
          aria-labelledby="tabLogin"
          data-spread="1"
        >
          <div className={styles.loginFooter}>
            {!invalid && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={retry}
                >
                  Try again
                </button>
              </div>
            )}
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
        <h1 id="setupTitle" ref={heading} tabIndex={-1}>
          Set up your account
        </h1>
        <p>
          {applicant ? (
            <>
              Welcome, {applicant.firstName}. Choose a password for{" "}
              <strong>{applicant.email}</strong>
              {applicant.gym ? (
                <>
                  , Gym Administrator of <strong>{applicant.gym.name}</strong>
                </>
              ) : null}
              .
            </>
          ) : (
            "Checking your setup link..."
          )}
        </p>
      </div>
      <form
        id="setupForm"
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
            <label htmlFor="setupPassword">Password</label>
            <PasswordInput
              ref={inputRef("password")}
              id="setupPassword"
              name="password"
              revealLabel="password"
              autoComplete="new-password"
              aria-describedby="setupPasswordRules setupPasswordError"
              aria-invalid={errors.password ? true : undefined}
              required
              value={values.password}
              onChange={(event) => change("password", event.target.value)}
            />
            <span className={styles.error} id="setupPasswordError">
              {errors.password}
            </span>
          </div>
          <div className={styles.field}>
            <label htmlFor="setupConfirmPassword">Confirm password</label>
            <PasswordInput
              ref={inputRef("confirmPassword")}
              id="setupConfirmPassword"
              name="confirmPassword"
              revealLabel="confirm password"
              autoComplete="new-password"
              aria-describedby="setupConfirmPasswordError"
              aria-invalid={errors.confirmPassword ? true : undefined}
              required
              value={values.confirmPassword}
              onChange={(event) =>
                change("confirmPassword", event.target.value)
              }
            />
            <span className={styles.error} id="setupConfirmPasswordError">
              {errors.confirmPassword}
            </span>
          </div>
        </div>
        <PasswordRules id="setupPasswordRules" password={values.password} />
        <div className={styles.loginFooter}>
          <p className={styles.status} id="setupStatus" role="status">
            {fieldErrorShown ? "" : status}
          </p>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              Set up account
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
