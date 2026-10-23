import styles from "../../pages/CreateCompetitionPage.module.css";

interface CompetitionLocationProps {
  /** The location of the competition's gym, or null until a gym is chosen. */
  location: string | null;
  /** Whether the competition's date has passed, so it keeps the location it was held at. */
  past?: boolean;
}

/**
 * A competition's location, which can't be changed here: a competition is always held at its
 * gym, whose location only a System Administrator can change. A past competition keeps the
 * location it was held at.
 */
export default function CompetitionLocation({ location, past = false }: CompetitionLocationProps) {
  return <div className={styles.gym}>
    <span className={styles.help}>Location</span>
    {location ? <strong>{location}</strong> : <span>Choose the competition gym to see its location.</span>}
    <span>{past ? "Past competitions keep the location they were held at."
      : "Competitions use their gym's location. A System Administrator can change it."}</span>
  </div>;
}
