import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { GymAdministrator } from "../../lib/gymsApi.ts";
import styles from "./GymAdminDisplay.module.css";

/**
 * The Gym Administrators assigned to one gym (US-005, US-006). Each name opens that person's
 * details when onOpen is given, and renderAction adds a control next to each person.
 */
export default function GymAdminDisplay({ administrators, children, renderAction, onOpen, detailsHref }: {
  administrators: GymAdministrator[];
  children?: ReactNode;
  renderAction?: (administrator: GymAdministrator) => ReactNode;
  onOpen?: (administrator: GymAdministrator) => void;
  detailsHref?: (administrator: GymAdministrator) => string;
}) {
  return (
    <section className={styles.panel} aria-labelledby="gym-administrators-heading">
      <header className={styles.header}>
        <h2 id="gym-administrators-heading">Gym administrators</h2>
        <span className={styles.count}>{administrators.length} assigned</span>
      </header>
      <p className={styles.description}>Administrators assigned to this gym.</p>
      {children}
      {administrators.length === 0 ? (
        <div className={styles.empty}>
          <p>No gym administrators assigned</p>
          <span>This gym has no assigned administrator accounts yet.</span>
        </div>
      ) : (
        <ul className={styles.list}>
          {administrators.map(admin => {
            const name = [admin.firstName, admin.lastName].filter(Boolean).join(" ");
            const initials = `${admin.firstName?.charAt(0) ?? ""}${admin.lastName?.charAt(0) ?? ""}`;
            return (
              <li key={admin.userId}>
                <span className={styles.avatar} aria-hidden="true">{initials || "GA"}</span>
                <div className={styles.person}>
                  {detailsHref ? <Link className={styles.open} to={detailsHref(admin)}>{name || admin.email}</Link> : onOpen ? (
                    <button type="button" className={styles.open} onClick={() => onOpen(admin)}
                      aria-label={`View details for ${name || admin.email}`}>
                      {name || admin.email}
                    </button>
                  ) : <p>{name || admin.email}</p>}
                  {name && <span>{admin.email}</span>}
                </div>
                {renderAction?.(admin)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
