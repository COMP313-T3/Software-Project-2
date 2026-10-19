import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { formatCalendarDate } from "../../lib/dateFormat.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import { distanceText, eventDetailsPath, spacesText } from "./competitionText.ts";
import { placeName, type MapPlace } from "./mapPlaces.ts";
import styles from "./MapPlaceCard.module.css";

interface MapPlaceCardProps {
  /** The place whose pin was selected. */
  place: MapPlace;
  /** The current discovery search without its "?", kept in each Event Details link. */
  search: string;
  /** Closes the card. Called by its Close button and by Esc. */
  onClose: () => void;
  /**
   * Called when the card goes away while it holds keyboard focus without being closed, such as
   * when new results no longer have its place, so focus can move somewhere useful.
   */
  onFocusLost?: () => void;
  /** The card's element, which the map measures to keep the selected pin in view. */
  ref?: RefObject<HTMLElement | null>;
}

/**
 * Basic information for the competitions at a selected map pin (US-027 criterion 5): each
 * one's name, date, registration status and spaces left, with a link to its Event Details page
 * (criterion 6). Keyboard focus moves to the card when it opens, so the selection is announced.
 */
export default function MapPlaceCard({
  place,
  search,
  onClose,
  onFocusLost,
  ref,
}: MapPlaceCardProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const ownElement = useRef<HTMLElement>(null);
  const element = ref ?? ownElement;
  const focusLost = useRef(onFocusLost);
  const name = placeName(place);
  const [first] = place.competitions;

  useEffect(() => {
    focusLost.current = onFocusLost;
  });

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [place.id]);

  useLayoutEffect(() => {
    const card = element.current;
    return () => {
      if (card?.contains(document.activeElement)) focusLost.current?.();
    };
  }, [element]);

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  }

  return (
    <section
      ref={element}
      className={styles.card}
      aria-labelledby={headingId}
      onKeyDown={closeOnEscape}
    >
      <div className={styles.header}>
        <div className={styles.place}>
          <h3 id={headingId} ref={heading} tabIndex={-1}>
            {name}
          </h3>
          {name !== first.location && <p>{first.location}</p>}
        </div>
        <button type="button" className={workspace.secondary} onClick={onClose}>
          Close
        </button>
      </div>
      <ul className={styles.list}>
        {place.competitions.map((competition) => {
          const open = competition.registrationStatus === "OPEN";
          const gymName = competition.gym?.name;
          return (
            <li key={competition._id} className={styles.item}>
              <time dateTime={competition.date}>
                {formatCalendarDate(competition.date)}
              </time>
              <h4>{competition.name}</h4>
              {gymName && gymName !== name && (
                <p className={styles.gym}>{gymName}</p>
              )}
              <span className={styles.badge} data-open={open}>
                {open ? "Registration open" : "Registration closed"}
              </span>
              <p className={styles.meta}>{spacesText(competition)}</p>
              {competition.distanceKm != null && (
                <p className={styles.meta}>{distanceText(competition.distanceKm)}</p>
              )}
              <Link
                className={workspace.primary}
                to={eventDetailsPath(competition._id, search)}
                aria-label={`View event details for ${competition.name}`}
              >
                View event details
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
