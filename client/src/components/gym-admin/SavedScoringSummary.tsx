import { Link, useLocation } from "react-router-dom";
import type { ManagedCompetitionDetails } from "../../lib/gymAdminApi.ts";
import { formatTorontoDateTime } from "../../lib/dateFormat.ts";
import { savedScoring } from "../../lib/scoringValidation.ts";
import { describeScoring, scoringExample } from "./scoringText.ts";
import styles from "./GymAdminDashboard.module.css";

/** Shows the scoring settings returned by the competition details API, never an unsaved choice. */
export default function SavedScoringSummary({ competition }: {
  /** The selected competition, as the competition details API answered. */
  competition: ManagedCompetitionDetails;
}) {
  const { search } = useLocation();
  const scoring = savedScoring(competition.scoring);
  return <section aria-label="Competition scoring summary">
    <div className={styles.intro}>
      <h3>Saved scoring format</h3>
      <Link className={styles.secondary} to={`/gym-admin/competitions/${encodeURIComponent(competition._id)}/scoring${search}`}>{scoring ? "Change scoring format" : "Configure scoring format"}</Link>
    </div>
    <dl className={styles.details}>
      <div><dt>Scoring format</dt>{scoring ? <><dd>{describeScoring(scoring)}</dd><dd>{scoringExample(scoring)}</dd></> : <dd>Not set</dd>}</div>
      {scoring?.updatedAt && <div><dt>Last saved</dt><dd>{formatTorontoDateTime(scoring.updatedAt)}</dd></div>}
    </dl>
  </section>;
}
