import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import GymAdminControls from "../components/admin/GymAdminControls.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { assignGymAdmin, removeGymAdmin, deactivateGym, getGym, updateGym, type GymDetails as GymRecord, type GymUpdate } from "../lib/gymsApi.ts";
import styles from "./GymsPage.module.css";
import detailsStyles from "./GymDetailsPage.module.css";

type FieldErrors = { name: string; location: string };
const emptyErrors: FieldErrors = { name: "", location: "" };

function validateDetails(name: string, location: string): FieldErrors {
  return {
    name: !name ? "Enter a gym name." : name.length > 100 ? "Use 100 characters or fewer." : "",
    location: !location ? "Enter a location." : location.length > 200 ? "Use 200 characters or fewer." : "",
  };
}

function loadMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 404) {
    return "This gym could not be found. It may no longer be available.";
  }
  if (reason instanceof ApiError && reason.status === 400) {
    return "This gym link is invalid. Please select a gym from the directory.";
  }
  return reason instanceof ApiError ? reason.message : "Could not load gym details. Please try again.";
}

/** US-005 #30/#31 and US-006 #36/#37, FR-003, AC-006: RequireSession handles login in App.tsx;
 * this gate avoids gym requests for non-ADMIN accounts. The API enforces the role. */
export default function GymDetailsPage() {
  const { user } = useSession();
  const { gymId } = useParams();
  if (user?.role !== "ADMIN") {
    return <main className={styles.page}><h1>Administrator access required</h1>
      <Link to="/dashboard">Back to dashboard</Link></main>;
  }
  return <GymDetails key={`${user.userId}:${gymId}`} gymId={gymId ?? ""} />;
}

function GymDetails({ gymId }: { gymId: string }) {
  const [gym, setGym] = useState<GymRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyErrors);
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"save" | "deactivate" | "assign" | "remove" | null>(null);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const writeController = useRef<AbortController | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const locationInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const deactivateButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const errorFocus = useRef<"name" | "location" | null>(null);
  const wasEditing = useRef(false);
  const wasConfirming = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    getGym(gymId, controller.signal).then(result => {
      if (!controller.signal.aborted) setGym(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setLoadError(loadMessage(reason));
      setCanRetry(!(reason instanceof ApiError && [400, 401, 403, 404].includes(reason.status)));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [gymId, revision]);

  // A response from a gym that was left must never replace another gym's details.
  useEffect(() => () => writeController.current?.abort(), []);
  useEffect(() => {
    if (editing) nameInput.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (wasConfirming.current) deactivateButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  useEffect(() => {
    if (!busy && errorFocus.current) {
      (errorFocus.current === "name" ? nameInput : locationInput).current?.focus();
      errorFocus.current = null;
    }
  }, [busy]);

  function startEditing() {
    if (!gym || writeController.current) return;
    setName(gym.name); setLocation(gym.location);
    setFieldErrors(emptyErrors); setWriteError(""); setNotice(""); setEditing(true);
    clearAssignmentFeedback();
  }

  function refreshDetails() {
    if (editing || confirming || writeController.current) return;
    setGym(null); setLoading(true); setLoadError(""); setCanRetry(false); setNotice(""); setWriteError("");
    clearAssignmentFeedback();
    setRevision(value => value + 1);
  }

  /** Uses only the selected URL ID. Name/location and deactivation have separate
   * backend operations; assignment and status fields cannot enter the edit body. */
  async function persist(operation: "save" | "deactivate", input?: GymUpdate) {
    if (!gym || writeController.current) return;
    const controller = new AbortController();
    writeController.current = controller;
    setBusy(operation); setWriteError(""); setNotice("");
    clearAssignmentFeedback();
    try {
      const result = operation === "save"
        ? await updateGym(gymId, input ?? {}, controller.signal)
        : await deactivateGym(gymId, controller.signal);
      if (controller.signal.aborted) return;
      setGym(result); setEditing(false); setConfirming(false); setFieldErrors(emptyErrors);
      setNotice(operation === "save" ? "Gym details saved successfully." : `${result.name} was deactivated.`);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 404) {
        setGym(null); setLoadError(loadMessage(reason)); setCanRetry(false);
      } else {
        setWriteError(reason instanceof ApiError && reason.code === "GYM_EXISTS"
          ? "A gym with this name and location already exists. Please check both fields."
          : reason instanceof ApiError ? reason.message : "Could not save this change. Please try again.");
        if (operation === "save" && reason instanceof ApiError && reason.fields) {
          const errors = { name: reason.fields.name ?? "", location: reason.fields.location ?? "" };
          setFieldErrors(errors);
          errorFocus.current = errors.name ? "name" : errors.location ? "location" : null;
        }
      }
    } finally {
      if (!controller.signal.aborted) { writeController.current = null; setBusy(null); }
    }
  }

  function clearAssignmentFeedback() {
    setAssignmentError(""); setAssignmentNotice("");
  }

  /** US-006: shared with gym edits to prevent overlapping writes. Only accept
   * the server's confirmed assignment list, and abort stale responses on leave. */
  async function changeAssignment(operation: "assign" | "remove", userId: string): Promise<boolean> {
    if (!gym || editing || confirming || writeController.current) return false;
    const controller = new AbortController();
    writeController.current = controller;
    setBusy(operation); clearAssignmentFeedback(); setNotice(""); setWriteError("");
    try {
      const result = operation === "assign"
        ? await assignGymAdmin(gymId, userId, controller.signal)
        : await removeGymAdmin(gymId, userId, controller.signal);
      if (controller.signal.aborted) return false;
      setGym(result);
      setAssignmentNotice(operation === "assign"
        ? `Gym Administrator assigned to ${result.name}.`
        : `Gym Administrator removed from ${result.name}.`);
      return true;
    } catch (reason) {
      if (controller.signal.aborted) return false;
      if (reason instanceof ApiError && reason.code === "GYM_NOT_FOUND") {
        setGym(null); setLoadError(loadMessage(reason)); setCanRetry(false);
      } else {
        setAssignmentError(reason instanceof ApiError && reason.code === "GYM_ADMIN_NOT_APPROVED"
          ? "This account is not approved for this gym. Choose an approved Gym Administrator."
          : reason instanceof ApiError && reason.code === "USER_NOT_FOUND"
            ? "That account could not be found. Check the user ID."
            : reason instanceof ApiError ? reason.message : "Could not update this gym's administrators. Please try again.");
      }
      return false;
    } finally {
      if (!controller.signal.aborted) { writeController.current = null; setBusy(null); }
    }
  }

  function onSave(event: FormEvent) {
    event.preventDefault();
    if (!gym || writeController.current) return;
    const trimmedName = name.trim();
    const trimmedLocation = location.trim();
    const errors = validateDetails(trimmedName, trimmedLocation);
    setFieldErrors(errors); setWriteError("");
    if (errors.name || errors.location) {
      (errors.name ? nameInput : locationInput).current?.focus();
      return;
    }
    const input: GymUpdate = {};
    if (trimmedName !== gym.name) input.name = trimmedName;
    if (trimmedLocation !== gym.location) input.location = trimmedLocation;
    if (Object.keys(input).length) void persist("save", input);
  }

  const dirty = gym && (name.trim() !== gym.name || location.trim() !== gym.location);

  return <main className={`${styles.page} ${detailsStyles.page}`}>
    <title>{gym ? `${gym.name} | TopSend` : "Gym details | TopSend"}</title>
    <nav className={detailsStyles.breadcrumbs} aria-label="Gym navigation">
      <Link to="/admin/gyms" className={styles.back}>← Back to gym directory</Link>
      <Link to="/dashboard">Admin dashboard</Link>
    </nav>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>TOPSEND / ADMINISTRATION</p>
        <h1>Gym details</h1><p>Review gym information and its assigned administrators.</p></div>
      {gym && <button type="button" onClick={refreshDetails} disabled={editing || confirming || Boolean(busy)}>Refresh details</button>}
    </header>
    <div role="status" aria-live="polite">
      {notice && <p className={styles.success}>{notice}</p>}
      {loading && <p className={styles.card}>Loading gym details…</p>}
    </div>
    {loadError && <div role="alert" className={styles.error}><p>{loadError}</p>
      {canRetry && <button type="button" onClick={refreshDetails}>Try again</button>}
    </div>}
    {gym && <div className={detailsStyles.layout}>
      <div className={detailsStyles.column}>
        <section className={styles.card} aria-label="Selected gym information">
          <div className={detailsStyles.sectionHeader}><h2>{gym.name}</h2>
            {!editing && <button type="button" ref={editButton} onClick={startEditing} disabled={confirming || Boolean(busy)}>Edit gym</button>}
          </div>
          <dl className={`${styles.details} ${detailsStyles.details}`}>
            <div><dt>Name</dt><dd>{gym.name}</dd></div>
            <div><dt>Location</dt><dd>{gym.location}</dd></div>
            <div><dt>Status</dt><dd><span className={styles.badge} data-status={gym.status}>{gym.status}</span></dd></div>
          </dl>
          {editing && <form onSubmit={onSave} noValidate className={detailsStyles.form} aria-label="Edit gym information" aria-busy={busy === "save"}>
            <h3>Edit gym information</h3>
            <fieldset disabled={Boolean(busy)} className={detailsStyles.fields}>
              <div>
                <label htmlFor="detail-gym-name">Gym name</label>
                <input id="detail-gym-name" ref={nameInput} value={name} maxLength={100} required autoComplete="off"
                  onChange={event => { setName(event.target.value); setFieldErrors(previous => ({ ...previous, name: "" })); }}
                  aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "detail-name-error" : undefined} />
                {fieldErrors.name && <p id="detail-name-error" className={styles.fieldError} role="alert">{fieldErrors.name}</p>}
              </div>
              <div>
                <label htmlFor="detail-gym-location">Location</label>
                <input id="detail-gym-location" ref={locationInput} value={location} maxLength={200} required autoComplete="off"
                  onChange={event => { setLocation(event.target.value); setFieldErrors(previous => ({ ...previous, location: "" })); }}
                  aria-invalid={Boolean(fieldErrors.location)} aria-describedby={fieldErrors.location ? "detail-location-error" : undefined} />
                {fieldErrors.location && <p id="detail-location-error" className={styles.fieldError} role="alert">{fieldErrors.location}</p>}
              </div>
            </fieldset>
            {writeError && <p role="alert" className={styles.error}>{writeError}</p>}
            <div className={`${styles.actions} ${detailsStyles.actions}`}>
              <button type="submit" className={styles.primary} disabled={Boolean(busy) || !dirty}>{busy === "save" ? "Saving…" : "Save changes"}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => { setEditing(false); setWriteError(""); setFieldErrors(emptyErrors); }}>Cancel</button>
            </div>
          </form>}
        </section>
        <section className={styles.card} aria-labelledby="gym-status-heading">
          <h2 id="gym-status-heading">Gym status</h2>
          {gym.status === "INACTIVE" ? <p>This gym is inactive. Its record and administrator assignments are kept.</p> : <>
            <p>Deactivate this gym to mark it inactive while keeping its record and administrator assignments.</p>
            {confirming ? <div className={detailsStyles.confirmation}>
              <p id="deactivate-confirmation"><strong>Deactivate {gym.name}?</strong> This will change its status to inactive.</p>
              {!editing && writeError && <p role="alert" className={styles.error}>{writeError}</p>}
              <div className={`${styles.actions} ${detailsStyles.actions}`}>
                <button type="button" ref={confirmButton} className={detailsStyles.danger} aria-describedby="deactivate-confirmation"
                  disabled={Boolean(busy)} onClick={() => void persist("deactivate")}>{busy === "deactivate" ? "Deactivating…" : "Confirm deactivation"}</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => { setConfirming(false); setWriteError(""); }}>Cancel deactivation</button>
              </div>
            </div> : <button type="button" ref={deactivateButton} className={detailsStyles.danger} disabled={editing || Boolean(busy)}
              onClick={() => { setConfirming(true); setNotice(""); setWriteError(""); clearAssignmentFeedback(); }}>Deactivate gym</button>}
          </>}
        </section>
      </div>
      <GymAdminControls administrators={gym.administrators} gymName={gym.name}
        disabled={editing || confirming || Boolean(busy)} pending={busy === "assign" || busy === "remove" ? busy : null}
        error={assignmentError} notice={assignmentNotice} onClearFeedback={clearAssignmentFeedback}
        onAssign={userId => changeAssignment("assign", userId)} onRemove={userId => changeAssignment("remove", userId)} />
    </div>}
  </main>;
}
