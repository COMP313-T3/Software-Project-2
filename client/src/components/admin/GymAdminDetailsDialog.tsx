import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GYM_STATUS_LABELS } from "../../constants/gyms.ts";
import { ApiError } from "../../lib/apiClient.ts";
import {
  getGymAdmin,
  type GymAdministrator,
  type GymAdministratorDetails,
} from "../../lib/gymsApi.ts";
import styles from "./GymAdminDetailsDialog.module.css";

const LOAD_FAILED = "Couldn't load these details. Please try again.";
const memberSince = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Toronto",
});

function joinedOn(createdAt: string | undefined) {
  const date = createdAt ? new Date(createdAt) : null;
  return date && !Number.isNaN(date.getTime()) ? memberSince.format(date) : null;
}

interface GymAdminDetailsDialogProps {
  /** The gym the details were opened from. */
  gymId: string;
  /** The Gym Administrator to show. */
  administrator: GymAdministrator;
  /** Called once the pop-up has closed. */
  onClose: () => void;
}

/**
 * Read-only pop-up with one Gym Administrator's details (US-006 criterion 6): email, role,
 * whether the account is active, when it was created, and every gym they administer. Focus goes
 * back to the button that opened it when it closes.
 */
export default function GymAdminDetailsDialog({
  gymId,
  administrator,
  onClose,
}: GymAdminDetailsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<GymAdministratorDetails | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const name =
    [administrator.firstName, administrator.lastName].filter(Boolean).join(" ") ||
    administrator.email;

  useEffect(() => {
    const element = dialog.current;
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) element.showModal();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getGymAdmin(gymId, administrator.userId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDetails(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProblem(error instanceof ApiError ? error.message : LOAD_FAILED);
        }
      });
    return () => controller.abort();
  }, [gymId, administrator.userId, attempt]);

  function retry() {
    setProblem("");
    setDetails(null);
    setAttempt((value) => value + 1);
  }

  const joined = joinedOn(details?.createdAt);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="gym-admin-details-title"
      onClose={onClose}
    >
      <div className={styles.header}>
        <h2 id="gym-admin-details-title">{name}</h2>
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
      <div className={styles.body}>
        {problem ? (
          <div role="alert" className={styles.error}>
            <p>{problem}</p>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        ) : !details ? (
          <p role="status">Loading details…</p>
        ) : (
          <>
            <dl className={styles.details}>
              <div>
                <dt>Email</dt>
                <dd>{details.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{details.role === "GYM_ADMIN" ? "Gym Administrator" : details.role}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{details.isActive ? "Active" : "Inactive"}</dd>
              </div>
              {joined && (
                <div>
                  <dt>Member since</dt>
                  <dd>{joined}</dd>
                </div>
              )}
            </dl>
            <h3 id="gym-admin-details-gyms">Assigned gyms</h3>
            <p><Link to={`/admin/gyms/${encodeURIComponent(gymId)}/admins/${encodeURIComponent(administrator.userId)}`}>Open administrator page</Link></p>
            <ul className={styles.gyms} aria-labelledby="gym-admin-details-gyms">
              {details.gyms.map((gym) => (
                <li key={gym.gymId}>
                  <div>
                    {gym.gymId === gymId ? (
                      <strong>{gym.name}</strong>
                    ) : (
                      <Link to={`/admin/gyms/${encodeURIComponent(gym.gymId)}`}>{gym.name}</Link>
                    )}
                    <span>{gym.location}</span>
                  </div>
                  <span className={styles.badge} data-status={gym.status}>
                    {GYM_STATUS_LABELS[gym.status]}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.note}>These details are read-only.</p>
          </>
        )}
      </div>
    </dialog>
  );
}
