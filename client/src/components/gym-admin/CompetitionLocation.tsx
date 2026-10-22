import styles from "../../pages/CreateCompetitionPage.module.css";

interface CompetitionLocationProps {
  /** The location of the competition's gym, or null until a gym is chosen. */
  location: string | null;
}

/**
 * A competition's location, which can't be changed here: a competition is always held at its
 * gym, whose location only a System Administrator can change.
 */
export default function CompetitionLocation({ location }: CompetitionLocationProps) {
  return <div className={styles.gym}>
    <span className={styles.help}>Location</span>
    {location ? <strong>{location}</strong> : <span>Choose the competition gym to see its location.</span>}
    <span>Competitions use their gym's location. A System Administrator can change it.</span>
  </div>;
}
