import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { getGym, type Gym } from "../lib/gymsApi.ts";
import styles from "./GymsPage.module.css";

/** Read-only Gym Details entry for US-004 AC4 / task #4.4.
 * App.tsx supplies RequireSession; this gate prevents non-ADMIN data requests.
 * Uses gymsApi.getGym -> server gymController.getGym -> gymService.getGymById.
 * Editing, removal and approval remain outside this page's scope. */
export default function GymDetailsPage() {
  const { user } = useSession();
  const { gymId } = useParams();
  if (user?.role !== "ADMIN") {
    return <main className={styles.page}><h1>Administrator access required</h1>
      <Link to="/dashboard">Back to dashboard</Link></main>;
  }
  return <GymDetails key={gymId} gymId={gymId ?? ""} />;
}

/** Loads from the URL rather than list state, so direct links and reloads work.
 * Cancels stale reads on navigation/unmount and retries only a read operation. */
function GymDetails({ gymId }: { gymId: string }) {
  const [gym, setGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setGym(null); setCanRetry(false);
    getGym(gymId, controller.signal).then(result => {
      if (!controller.signal.aborted) setGym(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 404) {
        setError("This gym could not be found. It may no longer be available.");
      } else if (reason instanceof ApiError && reason.status === 400) {
        setError("This gym link is invalid. Please select a gym from the directory.");
      } else {
        setError(reason instanceof Error ? reason.message : "Could not load gym details. Please try again.");
        setCanRetry(true);
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [gymId, revision]);

  return <main className={styles.page}>
    <title>{gym ? `${gym.name} | TopSend` : "Gym details | TopSend"}</title>
    <Link to="/admin/gyms" className={styles.back}>← Back to gym directory</Link>
    <header className={styles.header}><div>
      <p className={styles.eyebrow}>TOPSEND / ADMINISTRATION</p>
      <h1>Gym details</h1><p>View the selected gym's registered information.</p>
    </div></header>
    <section className={styles.card} aria-label="Selected gym information">
      {loading && <p role="status">Loading gym details…</p>}
      {error && <div role="alert" className={styles.error}><p>{error}</p>
        {canRetry && <button onClick={() => setRevision(value => value + 1)}>Try again</button>}
      </div>}
      {gym && <><h2>{gym.name}</h2><dl className={styles.details}>
        <div><dt>Name</dt><dd>{gym.name}</dd></div>
        <div><dt>Location</dt><dd>{gym.location}</dd></div>
        <div><dt>Status</dt><dd><span className={styles.badge} data-status={gym.status}>{gym.status}</span></dd></div>
      </dl></>}
    </section>
  </main>;
}
