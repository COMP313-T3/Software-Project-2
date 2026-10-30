import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { GYM_STATUS_LABELS } from "../constants/gyms.ts";
import { ApiError } from "../lib/apiClient.ts";
import { ADMINISTRATOR_LABELS, administratorChanges, administratorGateway, administratorProblem, type AdministratorChanges, type AdministratorField, type AdministratorGateway } from "../lib/administratorDetails.ts";
import type { GymAdministratorDetails, Gym } from "../lib/gymsApi.ts";
import common from "./GymsPage.module.css";
import styles from "./AdministratorDetailsPage.module.css";

type Action = { kind: "remove"; gym: Gym } | { kind: "deactivate" };
type Draft = Record<AdministratorField, string>;
const draftOf = ({ firstName, lastName, email, phone }: GymAdministratorDetails): Draft => ({ firstName, lastName, email, phone: phone ?? "" });
const ACCESS_ERRORS = new Set([401, 403, 404]);

/** US007. Uses the US007 account adapter; tests can inject a controlled gateway. */
export default function AdministratorDetailsPage({ gateway = administratorGateway }: { gateway?: AdministratorGateway }) {
  const { user } = useSession();
  const { gymId = "", userId = "" } = useParams();
  if (user?.role !== "ADMIN") return <AccessRequired title="System Administrator access required" allowed="System Administrators" />;
  return <AdministratorWorkspace key={`${user.userId}:${gymId}:${userId}`} gymId={gymId} userId={userId} gateway={gateway} />;
}

function AdministratorWorkspace({ gymId, userId, gateway }: { gymId: string; userId: string; gateway: AdministratorGateway }) {
  const [account, setAccount] = useState<GymAdministratorDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ firstName: "", lastName: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Partial<Draft>>({});
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const [writeError, setWriteError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [feedbackRevision, setFeedbackRevision] = useState(0);
  const fields = gateway.editableFields ?? [];
  const invalidLink = !/^[a-f\d]{24}$/i.test(gymId) || !/^[a-f\d]{24}$/i.test(userId);

  useEffect(() => {
    const controller = new AbortController();
    if (invalidLink) return;
    gateway.get(gymId, userId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.userId.toLowerCase() !== userId.toLowerCase() || result.role !== "GYM_ADMIN") throw new Error("Unexpected administrator response");
      setAccount(result); setLoading(false); setUncertain(false);
    }).catch(error => { if (!controller.signal.aborted) { setLoadError(error); setLoading(false); } });
    return () => controller.abort();
  }, [gateway, gymId, userId, revision, invalidLink]);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    if (editing) form.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => { if (feedbackRevision > 0 && !action && (notice || writeError)) feedback.current?.focus(); }, [feedbackRevision, action, notice, writeError]);

  function refresh() {
    setAccount(null); setLoading(true); setLoadError(null); setWriteError(""); setNotice(""); setEditing(false); setAction(null); setRevision(value => value + 1);
  }
  async function persist(kind: "save" | "remove" | "deactivate", changes?: AdministratorChanges) {
    if (locked.current || !account || uncertain) return;
    const operation = kind === "save" ? gateway.update : kind === "remove" ? gateway.removeGym : gateway.deactivate;
    if (!operation || (kind === "remove" && action?.kind !== "remove")) return;
    locked.current = true; setBusy(true); setWriteError(""); setNotice("");
    const controller = new AbortController(); mutation.current = controller;
    try {
      const result = kind === "save" ? await gateway.update!(userId, changes!, controller.signal)
        : kind === "remove" && action?.kind === "remove" ? await gateway.removeGym!(userId, action.gym.gymId, controller.signal)
          : await gateway.deactivate!(userId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.userId.toLowerCase() !== userId.toLowerCase() || result.role !== "GYM_ADMIN" ||
        (kind === "deactivate" && result.isActive) ||
        (kind === "remove" && action?.kind === "remove" && result.gyms.some(gym => gym.gymId === action.gym.gymId))) {
        throw new Error("Change not confirmed by the server");
      }
      setAccount(result); setEditing(false); setAction(null); setErrors({});
      setNotice(kind === "save" ? "Account information updated." : kind === "remove" ? `Access to ${action?.kind === "remove" ? action.gym.name : "the gym"} removed.` : "Account deactivated.");
      setFeedbackRevision(value => value + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && ACCESS_ERRORS.has(error.status)) {
        setAccount(null); setLoadError(error); setAction(null); setEditing(false);
      } else {
        setWriteError(error instanceof ApiError && error.status === 400 && kind !== "save"
          ? "This action is not allowed for this account. Refresh its details and try again."
          : administratorProblem(error, true));
        if (error instanceof ApiError && (error.status === 400 || error.code === "EMAIL_TAKEN") && error.fields && kind === "save") {
          setErrors(Object.fromEntries(Object.entries(error.fields).filter(([field]) => fields.includes(field as AdministratorField))));
        }
        if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500 || (error.status === 409 && error.code !== "EMAIL_TAKEN" && error.code !== "LAST_GYM_ADMIN")) setUncertain(true);
        setFeedbackRevision(value => value + 1);
      }
    } finally { locked.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!account || locked.current) return;
    const checked = administratorChanges(account, draft, fields); setErrors(checked.errors); setWriteError(""); setNotice("");
    if (Object.keys(checked.errors).length) { setWriteError("Check the highlighted fields and try again."); setFeedbackRevision(value => value + 1); return; }
    if (!Object.keys(checked.changes).length) { setWriteError("Change at least one account detail before saving."); setFeedbackRevision(value => value + 1); return; }
    void persist("save", checked.changes);
  }

  const name = account ? [account.firstName, account.lastName].filter(Boolean).join(" ") || account.email : "Gym Administrator";
  return <AppLayout title="Administrator details"><title>Administrator Details | TopSend</title>
    <div className={`${common.page} ${styles.page}`}>
      <div className={styles.intro}><div className={styles.toolbar}><Link className={common.back} to={`/admin/gyms/${encodeURIComponent(gymId)}`}>Back to gym</Link>
        <button className={styles.refresh} type="button" disabled={loading || busy || editing || !!action} onClick={refresh}>Refresh details</button></div><p className={styles.muted}>Review this Gym Administrator's account and current gym access.</p></div>
      {invalidLink ? <section className={common.card} role="alert"><h2>Invalid administrator link</h2><p>Open an administrator from the gym's administrator list.</p></section>
        : loading ? <p className={common.card} role="status">Loading administrator details…</p>
          : !account ? <section className={common.card} role="alert"><h2>Administrator unavailable</h2><p>{administratorProblem(loadError)}</p>{!(loadError instanceof ApiError && ACCESS_ERRORS.has(loadError.status)) && <button onClick={refresh}>Try again</button>}</section>
            : <>
              <div ref={feedback} tabIndex={-1} className={styles.feedback}>
                {notice && <p className={common.success} role="status">{notice}</p>}
                {writeError && !action && <div className={common.error} role="alert"><p>{writeError}</p>{uncertain && <button onClick={refresh}>Refresh account details</button>}</div>}
              </div>
              <div className={styles.layout}>
                <section className={common.card} aria-labelledby="administrator-account-heading">
                  <div className={styles.heading}><div className={styles.identity}><h2 id="administrator-account-heading">{name}</h2><p className={styles.muted}>Gym Administrator</p></div><span className={styles.badge} data-inactive={!account.isActive}>{account.isActive ? "Active account" : "Inactive account"}</span></div>
                  <dl className={styles.details}><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Phone</dt><dd>{account.phone || "Not provided"}</dd></div>{account.createdAt && !Number.isNaN(Date.parse(account.createdAt)) && <div><dt>Member since</dt><dd>{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "America/Toronto" }).format(new Date(account.createdAt))}</dd></div>}</dl>
                  {editing ? <form ref={form} className={styles.form} onSubmit={save} noValidate aria-label="Edit administrator account" aria-busy={busy}>
                    <fieldset className={styles.fields} disabled={busy || uncertain}>{fields.map(field => <div key={field}><label htmlFor={`administrator-${field}`}>{ADMINISTRATOR_LABELS[field]}<input id={`administrator-${field}`} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} maxLength={field === "email" ? 254 : field === "phone" ? 30 : 50} value={draft[field]} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined} onChange={event => { setDraft(previous => ({ ...previous, [field]: event.target.value })); setErrors(previous => { const next = { ...previous }; delete next[field]; return next; }); }} /></label>{errors[field] && <p id={`${field}-error`} className={common.fieldError}>{errors[field]}</p>}</div>)}</fieldset>
                    <div className={common.actions}><button type="submit" className={common.primary} disabled={busy || uncertain}>{busy ? "Saving…" : "Save changes"}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setWriteError(""); setErrors({}); editButton.current?.focus(); }}>Cancel editing</button></div>
                  </form> : <div className={`${styles.form} ${common.actions}`}><button ref={editButton} disabled={!gateway.update || !fields.length || busy || uncertain || !!action} onClick={() => { setDraft(draftOf(account)); setEditing(true); setErrors({}); setNotice(""); setWriteError(""); }}>Edit account information</button>{(!gateway.update || !fields.length) && <p className={styles.muted}>Account editing is currently unavailable.</p>}</div>}
                </section>
                <div className={styles.column}>
                  <section className={common.card} aria-labelledby="administrator-gyms-heading"><h2 id="administrator-gyms-heading">Current gym access</h2>{!account.isActive && <p className={styles.assignmentNotice}>Assignments are retained. Management access is disabled while this account is inactive.</p>}<p className={styles.muted}>{account.gyms.length} {account.gyms.length === 1 ? "gym assigned" : "gyms assigned"}</p>
                    {account.gyms.length ? <ul className={styles.gyms}>{account.gyms.map(gym => <li key={gym.gymId}><div className={styles.gym}><Link to={`/admin/gyms/${encodeURIComponent(gym.gymId)}`}>{gym.name}</Link><span>{gym.location}</span><span>Gym {GYM_STATUS_LABELS[gym.status].toLowerCase()}</span></div><button type="button" className={styles.danger} aria-label={`Remove access to ${gym.name}`} disabled={!gateway.removeGym || busy || editing || uncertain || !!action} onClick={() => { setWriteError(""); setNotice(""); setAction({ kind: "remove", gym }); }}>Remove access</button></li>)}</ul> : <p className={styles.empty}>No gyms are assigned to this account.</p>}
                    {!gateway.removeGym && <p className={styles.muted}>Access changes are currently unavailable.</p>}
                  </section>
                  <section className={`${common.card} ${styles.access}`} aria-labelledby="administrator-status-heading"><h2 id="administrator-status-heading">Account access</h2><p>{account.isActive ? "Deactivating this account blocks its access to protected Gym Administrator features across all gyms." : "This account is inactive. Gym assignments do not grant access while the account is deactivated."}</p>
                    <button type="button" className={styles.danger} disabled={!account.isActive || !gateway.deactivate || busy || editing || uncertain || !!action} onClick={() => { setWriteError(""); setNotice(""); setAction({ kind: "deactivate" }); }}>Deactivate account</button>
                    {!gateway.deactivate && <p className={styles.muted}>Account status changes are currently unavailable.</p>}
                  </section>
                </div>
              </div>
              {action && <ActionDialog action={action} name={name} busy={busy} error={writeError} uncertain={uncertain} onConfirm={() => void persist(action.kind)} onClose={() => { setAction(null); setWriteError(""); }} />}
            </>}
    </div>
  </AppLayout>;
}

function ActionDialog({ action, name, busy, error, uncertain, onConfirm, onClose }: { action: Action; name: string; busy: boolean; error: string; uncertain: boolean; onConfirm: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const errorMessage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current; if (element && !element.open) element.showModal();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="administrator-action-title" aria-describedby="administrator-action-description" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { if (!busy) onClose(); }}>
    <h2 id="administrator-action-title">{action.kind === "remove" ? `Remove access to ${action.gym.name}?` : `Deactivate ${name}?`}</h2>
    <p id="administrator-action-description">{action.kind === "remove" ? `${name} will lose their assignment to ${action.gym.name}. This action applies to this gym, not their other gym assignments.` : `${name} will no longer be able to use protected Gym Administrator features at any gym. This does not delete the account.`}</p>
    {error && <div ref={errorMessage} tabIndex={-1} className={common.error} role="alert"><p>{error}</p>{uncertain && <p>Close this confirmation and refresh the account details before continuing.</p>}</div>}
    <div className={common.actions}><button type="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="button" className={styles.danger} disabled={busy || uncertain} onClick={onConfirm}>{busy ? "Applying change…" : action.kind === "remove" ? "Confirm removal" : "Confirm deactivation"}</button></div>
  </dialog>;
}
