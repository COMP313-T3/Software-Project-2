import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import GymLocationField from "../components/admin/GymLocationField.tsx";
import type { PinnedLocation } from "../components/auth/MapPickerDialog.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { GYM_STATUS_LABELS } from "../constants/gyms.ts";
import { ApiError } from "../lib/apiClient.ts";
import type { LatLngLiteral } from "../lib/googleMaps.ts";
import { createGym, listGyms, type GymPage, type GymStatus } from "../lib/gymsApi.ts";
import styles from "./GymsPage.module.css";

const statuses: GymStatus[] = ["ACTIVE", "PENDING", "INACTIVE"];
/** Checks a new gym's name or location before it's sent. Letters from any language count, so
 * international names and numbered addresses work; it can't tell whether the gym is real. */
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
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

/** Manage gyms page (US-004), for System Administrators. Other roles see a message instead, and
 * the server refuses them too. */
export default function GymsPage() {
  const { user } = useSession();
  return user?.role === "ADMIN" ? <GymManagement />
    : <AccessRequired title="Administrator access required" allowed="System Administrators" />;
}

/** The gym directory and the add gym form. Changing the filter or page cancels the previous
 * read, so an older answer can't replace a newer one. */
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
  const [pin, setPin] = useState<LatLngLiteral | null>(null);
  const [status, setStatus] = useState<GymStatus>("ACTIVE");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ name: "", location: "" });
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const locationInput = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);

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
  useEffect(() => {
    if (adding) nameInput.current?.focus();
    else if (wasAdding.current) addButton.current?.focus();
    wasAdding.current = adding;
  }, [adding]);

  /** Keeps the typed location. Typing drops the pin until one is chosen again, as at sign-up. */
  function typeLocation(text: string) {
    setLocation(text); setPin(null);
    if (fieldErrors.location) setFieldErrors(previous => ({ ...previous, location: fieldError(text, "location") }));
  }

  /** Keeps the pin from a suggestion or the map, and the address Google found for it, if any. */
  function placePin({ location: point, address }: PinnedLocation) {
    setPin(point);
    if (!address) return;
    setLocation(address);
    if (fieldErrors.location) setFieldErrors(previous => ({ ...previous, location: fieldError(address, "location") }));
  }

  /** Checks the fields, then adds the gym and reloads the directory. Typed values stay when saving
   * fails, and a second click while saving does nothing. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const input = { name: name.trim(), location: location.trim(), status, ...(pin ? { coordinates: pin } : {}) };
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
      setName(""); setLocation(""); setPin(null); setStatus("ACTIVE"); setAdding(false);
      setFilter(""); setPage(1); setRevision(value => value + 1);
    } catch (error) { setFormError(message(error)); }
    finally { submitting.current = false; setSaving(false); }
  }

  return <AppLayout title="Manage gyms"><div className={styles.page}>
    <title>Manage gyms | TopSend</title>
    <div className={styles.intro}><p>Register climbing gyms and keep your directory up to date.</p>
      <button ref={addButton} className={styles.primary} onClick={() => { setAdding(true); setFormError(""); setFieldErrors({ name: "", location: "" }); }} disabled={adding}>Add gym</button>
    </div>
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
          <GymLocationField value={location} pin={pin} error={fieldErrors.location} onChange={typeLocation} onPinned={placePin}
            inputRef={element => { locationInput.current = element; }} />
          <label>Status<select value={status} onChange={event => setStatus(event.target.value as GymStatus)}>{statuses.map(value => <option key={value} value={value}>{GYM_STATUS_LABELS[value]}</option>)}</select></label>
        </fieldset>
        {formError && <p role="alert" className={styles.error}>{formError}</p>}
        <div className={styles.actions}><button type="submit" className={styles.primary} disabled={saving}>{saving ? "Adding…" : "Save gym"}</button>
          <button type="button" disabled={saving} onClick={() => setAdding(false)}>Cancel</button></div>
      </form>
    </section>}
    <section className={styles.card} aria-labelledby="directory-heading">
      <div className={styles.toolbar}><div><h2 id="directory-heading">Gym directory</h2><p>{data ? `${data.total} registered ${data.total === 1 ? "gym" : "gyms"}` : "Registered gyms"}</p></div>
        <label>Filter by status<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{GYM_STATUS_LABELS[value]}</option>)}
        </select></label>
        <button onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh</button>
      </div>
      {loading && <p role="status">Loading gyms…</p>}
      {listError && <div role="alert" className={styles.error}><p>{listError}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
      {!loading && !listError && data && (data.gyms.length ? <>
        <div className={styles.tableWrap}><table><caption className={styles.hidden}>Registered climbing gyms</caption>
          <thead><tr><th scope="col">Gym</th><th scope="col" className={styles.locationCell}>Location</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
          <tbody>{data.gyms.map(gym => <tr key={gym.gymId}><th scope="row">{gym.name}<span className={styles.rowLocation}>{gym.location}</span></th><td className={styles.locationCell}>{gym.location}</td><td><span className={styles.badge} data-status={gym.status}>{GYM_STATUS_LABELS[gym.status]}</span></td>
            <td><Link to={`/admin/gyms/${encodeURIComponent(gym.gymId)}`} aria-label={`View details for ${gym.name}`}>View details</Link></td></tr>)}</tbody>
        </table></div>
        <nav className={styles.pagination} aria-label="Gym pages"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span>
          <button disabled={data.page * data.limit >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></nav>
      </> : <div className={styles.empty}><h3>{filter ? "No gyms match this status" : "No gyms registered yet"}</h3><p>{filter ? "Choose another status to see more gyms." : "Add your first gym to get started."}</p></div>)}
    </section>
  </div></AppLayout>;
}
