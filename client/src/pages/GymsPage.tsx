import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { createGym, listGyms, type GymPage, type GymStatus } from "../lib/gymsApi.ts";
import styles from "./GymsPage.module.css";

const statuses: GymStatus[] = ["ACTIVE", "PENDING", "INACTIVE"];
/** Field feedback used by handleSubmit before gymsApi.createGym.
 * Unicode letters permit international names and mixed numeric addresses; this
 * checks input quality, not the real-world existence of a gym or its location. */
function fieldError(value: string, field: "name" | "location"): string {
  const text = value.trim();
  if (!text) return field === "name" ? "Enter a gym name." : "Enter a location.";
  if (text.length > (field === "name" ? 100 : 200)) return field === "name"
    ? "Gym name must be at most 100 characters." : "Location must be at most 200 characters.";
  if (!/\p{L}/u.test(text)) return field === "name"
    ? "Gym name must include letters, not only numbers or symbols."
    : "Location must include letters, not only numbers or symbols.";
  return "";
}
function message(error: unknown): string {
  if (error instanceof ApiError && error.code === "GYM_EXISTS") return "A gym with this name and location already exists. Please check both fields.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** ADMIN-only frontend gate, paired with App's RequireSession. The real permission check
 * remains server/src/routes/gymRoutes.js requireRole(ROLES.ADMIN); no role is assigned here. */
export default function GymsPage() {
  const { user } = useSession();
  return user?.role === "ADMIN" ? <GymManagement /> : <main className={styles.page}>
    <h1>Administrator access required</h1><Link to="/dashboard">Back to dashboard</Link>
  </main>;
}

/** Implements US-004 tasks #4.3/#4.4. All gym HTTP calls go through lib/gymsApi.ts.
 * List/filter/page changes cancel old reads to prevent an older response replacing new data. */
function GymManagement() {
  const [data, setData] = useState<GymPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<GymStatus>("ACTIVE");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ name: "", location: "" });
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const locationInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError(""); setData(null);
    listGyms(page, filter, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (!controller.signal.aborted) setListError(message(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, filter, revision]);
  useEffect(() => { if (adding) nameInput.current?.focus(); }, [adding]);

  /** Validates trimmed inputs against server/src/schemas/gymSchemas.js limits.
   * Calls gymsApi.createGym -> gymController.createGym; success refreshes listGyms.
   * Keeps entered values on failure, and guards rapid double submits before React rerenders. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const input = { name: name.trim(), location: location.trim(), status };
    const errors = { name: fieldError(input.name, "name"), location: fieldError(input.location, "location") };
    setFieldErrors(errors); setFormError("");
    if (errors.name || errors.location) {
      (errors.name ? nameInput : locationInput).current?.focus();
      return;
    }
    submitting.current = true; setSaving(true); setFormError(""); setNotice("");
    try {
      const gym = await createGym(input);
      setNotice(`${gym.name} was added successfully.`);
      setName(""); setLocation(""); setStatus("ACTIVE"); setAdding(false);
      setFilter(""); setPage(1); setRevision(value => value + 1);
    } catch (error) { setFormError(message(error)); }
    finally { submitting.current = false; setSaving(false); }
  }

  return <main className={styles.page}>
    <title>Manage gyms | TopSend</title>
    <Link to="/dashboard" className={styles.back}>← Admin dashboard</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>TOPSEND / ADMINISTRATION</p>
      <h1>Manage gyms</h1><p>Register climbing gyms and keep your directory up to date.</p></div>
      <button className={styles.primary} onClick={() => { setAdding(true); setFormError(""); setFieldErrors({ name: "", location: "" }); }} disabled={adding}>+ Add gym</button>
    </header>
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {adding && <section className={styles.card} aria-labelledby="add-heading">
      <h2 id="add-heading">Add a gym</h2>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={saving} className={styles.fields}>
          <div>
            <label htmlFor="gym-name">Gym name</label>
            <input id="gym-name" ref={nameInput} value={name} onChange={event => {
              setName(event.target.value);
              if (fieldErrors.name) setFieldErrors(previous => ({ ...previous, name: fieldError(event.target.value, "name") }));
            }} maxLength={100} required autoComplete="off" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "gym-name-error" : undefined} />
            {fieldErrors.name && <p id="gym-name-error" role="alert" className={styles.fieldError}>{fieldErrors.name}</p>}
          </div>
          <div>
            <label htmlFor="gym-location">Location</label>
            <input id="gym-location" ref={locationInput} value={location} onChange={event => {
              setLocation(event.target.value);
              if (fieldErrors.location) setFieldErrors(previous => ({ ...previous, location: fieldError(event.target.value, "location") }));
            }} maxLength={200} required autoComplete="off" aria-invalid={Boolean(fieldErrors.location)} aria-describedby={fieldErrors.location ? "gym-location-error" : undefined} />
            {fieldErrors.location && <p id="gym-location-error" role="alert" className={styles.fieldError}>{fieldErrors.location}</p>}
          </div>
          <label>Status<select value={status} onChange={event => setStatus(event.target.value as GymStatus)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
        </fieldset>
        {formError && <p role="alert" className={styles.error}>{formError}</p>}
        <div className={styles.actions}><button type="submit" className={styles.primary} disabled={saving}>{saving ? "Adding…" : "Save gym"}</button>
          <button type="button" disabled={saving} onClick={() => setAdding(false)}>Cancel</button></div>
      </form>
    </section>}
    <section className={styles.card} aria-labelledby="directory-heading">
      <div className={styles.toolbar}><div><h2 id="directory-heading">Gym directory</h2><p>{data ? `${data.total} registered ${data.total === 1 ? "gym" : "gyms"}` : "Registered gyms"}</p></div>
        <label>Filter by status<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh</button>
      </div>
      {loading && <p role="status">Loading gyms…</p>}
      {listError && <div role="alert" className={styles.error}><p>{listError}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
      {!loading && !listError && data && (data.gyms.length ? <>
        <div className={styles.tableWrap}><table><caption className={styles.hidden}>Registered climbing gyms</caption>
          <thead><tr><th scope="col">Gym</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
          <tbody>{data.gyms.map(gym => <tr key={gym.gymId}><th scope="row">{gym.name}</th><td>{gym.location}</td><td><span className={styles.badge} data-status={gym.status}>{gym.status}</span></td>
            <td><Link to={`/admin/gyms/${encodeURIComponent(gym.gymId)}`} aria-label={`View details for ${gym.name}`}>View details →</Link></td></tr>)}</tbody>
        </table></div>
        <nav className={styles.pagination} aria-label="Gym pages"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span>
          <button disabled={data.page * data.limit >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></nav>
      </> : <div className={styles.empty}><h3>{filter ? "No gyms match this status" : "No gyms registered yet"}</h3><p>{filter ? "Choose another status to see more gyms." : "Add your first gym to get started."}</p></div>)}
    </section>
  </main>;
}