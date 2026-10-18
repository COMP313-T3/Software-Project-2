import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import CompetitionCard from "./CompetitionCard.tsx";
import styles from "./CompetitionList.module.css";

interface CompetitionListProps {
  /** The competitions on the current page of results, in the order the API sent them. */
  competitions: DiscoveredCompetition[];
  /** The current discovery search without its "?", kept in each Event Details link. */
  search: string;
}

/**
 * The Competition List View: a card for each available competition, two to a row, or one to a
 * row in narrow layouts.
 */
export default function CompetitionList({
  competitions,
  search,
}: CompetitionListProps) {
  return (
    <ul className={styles.list}>
      {competitions.map((competition) => (
        <li key={competition._id} className={styles.item}>
          <CompetitionCard competition={competition} search={search} />
        </li>
      ))}
    </ul>
  );
}
