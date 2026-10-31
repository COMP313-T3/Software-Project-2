import { Link } from "react-router-dom";
import type { FeatureSection as Feature } from "./landingContent.ts";
import { revealOrder, useReveal } from "./useReveal.ts";
import styles from "./FeatureSection.module.css";

interface FeatureSectionProps {
  feature: Feature;
  /** The section's number, shown beside its eyebrow. */
  number: number;
}

/**
 * One section after the hero, with its stage in the 3D scene framed beside it.
 *
 * The section is taller than the screen, and its text panel stays pinned in the middle while the
 * rest scrolls by, giving the camera time to settle on the stage. The panel swings in from the
 * side of the stage as it arrives, with its lines rising in one after another, and lifts away
 * again as it leaves.
 */
export default function FeatureSection({ feature, number }: FeatureSectionProps) {
  const { ref, state } = useReveal<HTMLDivElement>();
  const titleId = `${feature.id}-title`;
  const firstPoint = 3;

  return (
    <section
      id={feature.id}
      className={styles.section}
      data-side={feature.side}
      data-journey-step={feature.stage}
      aria-labelledby={titleId}
    >
      <div className={styles.pin}>
        <div ref={ref} className={styles.panel} data-state={state}>
          <p className={styles.eyebrow} data-line style={revealOrder(0)}>
            <span className={styles.number}>{String(number).padStart(2, "0")}</span>
            {feature.eyebrow}
          </p>
          <h2 id={titleId} className={styles.title} data-line style={revealOrder(1)}>
            {feature.title}
          </h2>
          <p className={styles.body} data-line style={revealOrder(2)}>
            {feature.body}
          </p>
          <ul className={styles.points}>
            {feature.points.map((point, index) => (
              <li key={point} data-line style={revealOrder(firstPoint + index)}>
                {point}
              </li>
            ))}
          </ul>
          {feature.action ? (
            <Link
              className={styles.action}
              to={feature.action.to}
              data-line
              style={revealOrder(firstPoint + feature.points.length)}
            >
              {feature.action.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
