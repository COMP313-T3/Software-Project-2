import { PASSWORD_RULES } from "./authValidation.ts";
import styles from "./AuthForm.module.css";

interface PasswordRulesProps {
  /** The password typed so far. */
  password: string;
  /** Id for the list, so the password field can point to it with aria-describedby. */
  id: string;
}

/**
 * The rules a new password must meet, each marked as met while the user types.
 */
export default function PasswordRules({ password, id }: PasswordRulesProps) {
  return (
    <ul className={styles.rules} id={id}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.id} data-met={met}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {met ? (
                <path d="M3.5 8.5l3 3 6-7" />
              ) : (
                <circle cx="8" cy="8" r="2.25" />
              )}
            </svg>
            <span>{rule.label}</span>
            <span className={styles.visuallyHidden}>
              {met ? " (done)" : " (not yet)"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
