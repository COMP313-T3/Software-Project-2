import { Link } from "react-router-dom";
import { formatCalendarDate } from "../../lib/dateFormat.ts";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./CompetitionCard.module.css";
import { distanceText, eventDetailsPath, spacesText } from "./competitionText.ts";

interface CompetitionCardProps {
  /** The competition, as the discovery API lists it. */
  competition: DiscoveredCompetition;
  /** The current discovery search without its "?", kept so Event Details can lead back to it. */
  search: string;
}

/**
 * One available competition in the Competition List View: its date, registration status, name,
 * gym, location and spaces left, and its distance when known, with a link to its Event Details
 * page.
 */
export default function CompetitionCard({
  competition,
  search,
}: CompetitionCardProps) {
  const open = competition.registrationStatus === "OPEN";
  return (
    <div className={`${workspace.panel} ${styles.card}`}>
      <div className={styles.top}>
        <time dateTime={competition.date}>
          {formatCalendarDate(competition.date)}
        </time>
        <span className={styles.badge} data-open={open}>
          {open ? "Registration open" : "Registration closed"}
        </span>
      </div>
      <h3>{competition.name}</h3>
      <p className={styles.gym}>{competition.gym?.name ?? "Gym unavailable"}</p>
      <p>{competition.location}</p>
      <div className={styles.availability}>
        <p>{spacesText(competition)}</p>
        {competition.distanceKm != null && (
          <p>{distanceText(competition.distanceKm)}</p>
        )}
      </div>
      <Link
        className={workspace.secondary}
        to={eventDetailsPath(competition._id, search)}
        aria-label={`View event details for ${competition.name}`}
      >
        View event details
      </Link>
    </div>
  );
}
