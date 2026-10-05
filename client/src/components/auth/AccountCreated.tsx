import { useEffect, useRef } from "react";
import styles from "./AuthForm.module.css";

interface AccountCreatedProps {
  /** Class of the heading block, so it matches the other views. */
  introClassName: string;
  /** Email of the account just created. */
  email: string;
  /** Opens Log in with the email filled in. */
  onLogIn: () => void;
}

/**
 * Shown in the Create account tab once the account is saved: says it worked, and leads to Log in.
 */
export default function AccountCreated({
  introClassName,
  email,
  onLogIn,
}: AccountCreatedProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <>
      <div className={introClassName}>
        <h1 id="createdTitle" ref={heading} tabIndex={-1}>
          Account successfully created!
        </h1>
        <p>
          Your climber account for <strong>{email}</strong> is ready.
        </p>
      </div>
      <div
        id="createdPanel"
        className={`${styles.form} ${styles.loginForm}`}
        role="tabpanel"
        aria-labelledby="tabRegister"
        data-spread="1"
      >
        <div className={styles.loginFooter}>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onLogIn}>
              Log in now
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
