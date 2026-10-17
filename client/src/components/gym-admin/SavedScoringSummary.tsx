import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ManagedCompetitionDetails } from "../../lib/gymAdminApi.ts";
import { listScoringFormats, type ScoringFormatOption } from "../../lib/scoringApi.ts";
import { formatTorontoDateTime } from "../../lib/dateFormat.ts";
import styles from "./GymAdminDashboard.module.css";

/** Shows the scoring settings returned by the competition details API, never an unsaved choice. */
export default function SavedScoringSummary({ competition }: { competition: ManagedCompetitionDetails }) {
  const { search } = useLocation();
  const [formats, setFormats] = useState<ScoringFormatOption[]>([]);
  const scoring = competition.scoring;
  const format = scoring?.format;
  useEffect(() => {
    if (!format) return;
    const controller = new AbortController();
    listScoringFormats(controller.signal).then(data => {
      if (!controller.signal.aborted) setFormats(data.formats);
    }).catch(() => { /* The saved format code remains visible if its display label is unavailable. */ });
    return () => controller.abort();
  }, [format]);
  const option = formats.find(item => item.format === scoring?.format);
  return <section aria-label="Competition scoring summary">
    <div className={styles.intro}>
      <h3>Saved scoring format</h3>
      <Link className={styles.secondary} to={`/gym-admin/competitions/${encodeURIComponent(competition._id)}/scoring${search}`}>{scoring ? "Change scoring format" : "Configure scoring format"}</Link>
    </div>
    <dl className={styles.details}>
      <div><dt>Scoring format</dt><dd>{scoring ? option?.label ?? scoring.format : "Not configured"}</dd></div>
      {scoring && (option?.allowsFlashBonus || (!option && scoring.flashBonus > 0)) && <div><dt>Flash bonus</dt><dd>{scoring.flashBonus} points</dd></div>}
      {scoring?.updatedAt && <div><dt>Last saved</dt><dd>{formatTorontoDateTime(scoring.updatedAt)}</dd></div>}
    </dl>
  </section>;
}
