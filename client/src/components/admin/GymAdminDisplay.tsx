import type { GymAdministrator } from "../../lib/gymsApi.ts";
import styles from "./GymAdminDisplay.module.css";

/** US-005 #31: display only the administrators returned for this gym.
 * Assignment and administrator details belong to other stories. */
export default function GymAdminDisplay({ administrators }: { administrators: GymAdministrator[] }) {
  return (
    <section className={styles.panel} aria-labelledby="gym-administrators-heading">
      <header className={styles.header}>
        <h2 id="gym-administrators-heading">Gym administrators</h2>
        <span className={styles.count}>{administrators.length} assigned</span>
      </header>
      <p className={styles.description}>Administrators assigned to this gym.</p>
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
                  <p>{name || admin.email}</p>
                  {name && <span>{admin.email}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
