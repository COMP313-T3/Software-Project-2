import { Link } from "react-router-dom";
import { useSession } from "../session/sessionContext.ts";
import { LANDING_LINKS } from "./landingContent.ts";
import styles from "./LandingActions.module.css";

interface LandingActionsProps {
  /** Centers the buttons, for the closing call to action. */
  centered?: boolean;
}

/**
 * The sign-up and log-in buttons used across the landing page. Someone who's already logged in
 * gets one button back to their dashboard instead, which opens the right home for their role.
 */
export default function LandingActions({ centered = false }: LandingActionsProps) {
  const { status } = useSession();

  if (status === "signedIn") {
    return (
      <div className={styles.actions} data-centered={centered}>
        <Link className={styles.primary} to={LANDING_LINKS.dashboard}>
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.actions} data-centered={centered}>
      <Link className={styles.primary} to={LANDING_LINKS.register}>
        Create your account
      </Link>
      <Link className={styles.secondary} to={LANDING_LINKS.login}>
        Log in
      </Link>
    </div>
  );
}
