import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import GymAdminControls from "../components/admin/GymAdminControls.tsx";
import GymAdminDetailsDialog from "../components/admin/GymAdminDetailsDialog.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { GYM_STATUS_LABELS } from "../constants/gyms.ts";
import { ApiError } from "../lib/apiClient.ts";
import {
  activateGym, assignGymAdmin, deactivateGym, getGym, listAdminCandidates, removeGymAdmin, updateGym,
  type GymAdministrator, type GymDetails as GymRecord, type GymUpdate,
} from "../lib/gymsApi.ts";
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

/** Gym Details page (US-005, US-006, FR-003, AC-006), for System Administrators. Other roles see a
 * message and no gym is requested; the server refuses them too. */
export default function GymDetailsPage() {
  const { user } = useSession();
  const { gymId } = useParams();
  if (user?.role !== "ADMIN") {
    return <AccessRequired title="Administrator access required" allowed="System Administrators" />;
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
  const [busy, setBusy] = useState<"save" | "deactivate" | "activate" | "assign" | "remove" | null>(null);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [candidates, setCandidates] = useState<GymAdministrator[] | null>(null);
  const [candidatesError, setCandidatesError] = useState("");
  const [candidatesRevision, setCandidatesRevision] = useState(0);
  const [viewing, setViewing] = useState<GymAdministrator | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const locationInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const deactivateButton = useRef<HTMLButtonElement>(null);
  const activateButton = useRef<HTMLButtonElement>(null);
  const statusFocus = useRef<"activate" | "deactivate" | null>(null);
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

  const gymLoaded = gym !== null;
  useEffect(() => {
    if (!gymLoaded) return;
    const controller = new AbortController();
    listAdminCandidates(gymId, controller.signal).then(result => {
      if (!controller.signal.aborted) { setCandidates(result); setCandidatesError(""); }
    }).catch(reason => {
      if (!controller.signal.aborted) {
        setCandidatesError(reason instanceof ApiError
          ? reason.message : "Couldn't load the accounts approved for this gym. Please try again.");
      }
    });
    return () => controller.abort();
  }, [gymId, gymLoaded, candidatesRevision]);

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
    if (busy || !statusFocus.current) return;
    (statusFocus.current === "activate" ? activateButton : deactivateButton).current?.focus();
    statusFocus.current = null;
  }, [busy, gym]);
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
    setCandidates(null); setCandidatesError("");
    clearAssignmentFeedback();
    setRevision(value => value + 1);
  }

  function reloadCandidates() {
    setCandidatesError("");
    setCandidatesRevision(value => value + 1);
  }

  /** Saves the name or location, or changes the gym's status, for the gym in the address only.
   * Each has its own request, so a status or an assignment can never ride along with an edit. */
  async function persist(operation: "save" | "deactivate" | "activate", input?: GymUpdate) {
    if (!gym || writeController.current) return;
    const controller = new AbortController();
    writeController.current = controller;
    setBusy(operation); setWriteError(""); setNotice("");
    clearAssignmentFeedback();
    try {
      const result = operation === "save" ? await updateGym(gymId, input ?? {}, controller.signal)
        : operation === "activate" ? await activateGym(gymId, controller.signal)
          : await deactivateGym(gymId, controller.signal);
      if (controller.signal.aborted) return;
      if (operation !== "save") statusFocus.current = operation === "activate" ? "deactivate" : "activate";
      setGym(result); setEditing(false); setConfirming(false); setFieldErrors(emptyErrors);
      setNotice(operation === "save" ? "Gym details saved successfully."
        : `${result.name} was ${operation === "activate" ? "activated" : "deactivated"}.`);
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
      if (operation === "assign") setCandidates(list => list?.filter(candidate => candidate.userId !== userId) ?? null);
      reloadCandidates();
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
            ? "That account could not be found. Refresh the page and try again."
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

  return <AppLayout title="Gym details"><div className={`${styles.page} ${detailsStyles.page}`}>
    <title>{gym ? `${gym.name} | TopSend` : "Gym details | TopSend"}</title>
    <div className={styles.intro}>
      <div><Link to="/admin/gyms" className={styles.back}>Back to gym directory</Link>
        <p>Review gym information and its assigned administrators.</p></div>
      {gym && <button type="button" onClick={refreshDetails} disabled={editing || confirming || Boolean(busy)}>Refresh details</button>}
    </div>
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
            <div><dt>Status</dt><dd><span className={styles.badge} data-status={gym.status}>{GYM_STATUS_LABELS[gym.status]}</span></dd></div>
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
          <p className={detailsStyles.statusText}>{gym.status === "ACTIVE"
            ? "Deactivate this gym to mark it inactive while keeping its record and administrator assignments."
            : gym.status === "PENDING"
              ? "This gym is waiting to be activated. Activate it so its Gym Administrators can manage competitions."
              : "This gym is inactive. Its record and administrator assignments are kept. Activate it to use it again."}</p>
          {confirming ? <div className={detailsStyles.confirmation}>
            <p id="deactivate-confirmation"><strong>Deactivate {gym.name}?</strong> This will change its status to inactive.</p>
            {!editing && writeError && <p role="alert" className={styles.error}>{writeError}</p>}
            <div className={`${styles.actions} ${detailsStyles.actions}`}>
              <button type="button" ref={confirmButton} className={detailsStyles.danger} aria-describedby="deactivate-confirmation"
                disabled={Boolean(busy)} onClick={() => void persist("deactivate")}>{busy === "deactivate" ? "Deactivating…" : "Confirm deactivation"}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => { setConfirming(false); setWriteError(""); }}>Cancel deactivation</button>
            </div>
          </div> : <div className={`${styles.actions} ${detailsStyles.actions}`}>
            {gym.status !== "ACTIVE" && <button type="button" ref={activateButton} className={styles.primary}
              disabled={editing || Boolean(busy)} aria-busy={busy === "activate"}
              onClick={() => { setNotice(""); setWriteError(""); clearAssignmentFeedback(); void persist("activate"); }}>
              {busy === "activate" ? "Activating…" : "Activate gym"}</button>}
            {gym.status !== "INACTIVE" && <button type="button" ref={deactivateButton} className={detailsStyles.danger} disabled={editing || Boolean(busy)}
              onClick={() => { setConfirming(true); setNotice(""); setWriteError(""); clearAssignmentFeedback(); }}>Deactivate gym</button>}
          </div>}
          {!editing && !confirming && writeError && <p role="alert" className={styles.error}>{writeError}</p>}
        </section>
      </div>
      <GymAdminControls administrators={gym.administrators} candidates={candidates} candidatesError={candidatesError}
        gymName={gym.name} disabled={editing || confirming || Boolean(busy)} pending={busy === "assign" || busy === "remove" ? busy : null}
        error={assignmentError} notice={assignmentNotice} onClearFeedback={clearAssignmentFeedback}
        onRetryCandidates={reloadCandidates} onOpenDetails={setViewing}
        onAssign={userId => changeAssignment("assign", userId)} onRemove={userId => changeAssignment("remove", userId)} />
    </div>}
    {viewing && <GymAdminDetailsDialog key={viewing.userId} gymId={gymId} administrator={viewing} onClose={() => setViewing(null)} />}
  </div></AppLayout>;
}
