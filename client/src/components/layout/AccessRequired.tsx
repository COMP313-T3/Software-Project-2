import { Link } from "react-router-dom";
import logoUrl from "../../assets/brand/topsend-logo.png";
import styles from "./AccessRequired.module.css";
import theme from "./theme.module.css";

interface AccessRequiredProps {
  /** The page's heading, which names the access needed. */
  title: string;
  /** Who can open the page, such as "Gym Administrators". */
  allowed: string;
}

/**
 * Shown instead of a page that the logged-in account's role can't use. The server refuses those
 * accounts too.
 */
export default function AccessRequired({ title, allowed }: AccessRequiredProps) {
  return (
    <main className={`${theme.theme} ${styles.page}`}>
      <title>{`${title} | TopSend`}</title>
      <div className={styles.card}>
        <img className={styles.logo} src={logoUrl} alt="TopSend" width={159} height={52} />
        <h1>{title}</h1>
        <p>{`Only ${allowed} can open this page.`}</p>
        <Link className={styles.link} to="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
