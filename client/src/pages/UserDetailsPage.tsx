import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { getAdminUser, userName, userAccountStatus, userAdminProblem, type UserDetails } from "../lib/userAdminApi.ts";
import { updateUserProfile, deactivateUserAccount } from "../lib/userAccountApi.ts";
import { canDeactivateUser, type UserProfileErrors } from "../lib/userAccountForm.ts";
import { UserAccountControls, UserProfileForm, ConfirmAccountChange, type AccountConfirmation } from "../components/admin/UserAccountControls.tsx";
import controls from "../components/admin/UserAccountControls.module.css";
import styles from "./UsersPage.module.css";

/** US-009 / #151, #152 -> FR-003 -> AC-006. Only server-supported account actions are enabled. */
export default function UserDetailsPage() {
  const { user } = useSession(); const { userId = "" } = useParams();
  if (user?.role !== "ADMIN") return <AccessRequired title="System Administrator access required" allowed="System Administrators" />;
  return <AccountWorkspace key={user.userId + ":" + userId} id={userId} actorId={user.userId} />;
}
function AccountWorkspace({ id, actorId }: { id: string; actorId: string }) {
  const { search } = useLocation();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; data: UserDetails | null; error: unknown }>({ revision: -1, data: null, error: null });
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<AccountConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [fields, setFields] = useState<UserProfileErrors>({});
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    getAdminUser(id, controller.signal).then(data => { if (!controller.signal.aborted) { setResult({ revision, data, error: null }); setUncertain(false); } })
      .catch(error => { if (!controller.signal.aborted) setResult({ revision, data: null, error }); });
    return () => controller.abort();
  }, [id, revision]);
  const loading = result.revision !== revision, account = loading ? null : result.data;
  function refresh() {
    if (mutation.current) return;
    setEditing(false); setConfirmation(null); setFeedback(null); setFields({}); setRevision(value => value + 1);
  }
  async function confirm() {
    if (mutation.current || !account || !confirmation || uncertain) return;
    if (confirmation.kind === "deactivate" && !canDeactivateUser(account, actorId)) return;
    const controller = new AbortController(), action = confirmation;
    mutation.current = controller; setBusy(true); setFeedback(null); setFields({});
    let confirmed = false;
    try {
      if (action.kind === "profile") await updateUserProfile(id, action.changes, controller.signal);
      else await deactivateUserAccount(id, controller.signal);
      if (controller.signal.aborted) return;
      confirmed = true;
      const fresh = await getAdminUser(id, controller.signal);
      if (controller.signal.aborted) return;
      if (action.kind === "deactivate" && fresh.isActive !== false) throw new Error("The account status changed again.");
      setResult({ revision, data: fresh, error: null }); setEditing(false); setUncertain(false);
      setFeedback({ text: action.kind === "profile" ? "Account information saved." : "Account deactivated. The user's sessions have ended.", error: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (confirmed || (error instanceof ApiError && [401, 403, 404].includes(error.status))) {
        setResult({ revision, data: null, error }); setEditing(false);
        if (confirmed) setFeedback({ text: "The change was saved, but the latest account details couldn't be confirmed. Refresh details before another action.", error: true });
      } else if (error instanceof ApiError && [400, 409, 429].includes(error.status)) {
        setFields(error.fields ?? {});
        setFeedback({ text: userAdminProblem(error, "The account could not be updated."), error: true });
        if (error.status === 409 && error.code !== "EMAIL_TAKEN") setUncertain(true);
      } else {
        setUncertain(true); setFeedback({ text: "Couldn't confirm whether the change was saved. Refresh details before trying another action.", error: true });
      }
    } finally {
      if (!controller.signal.aborted) { mutation.current = null; setBusy(false); setConfirmation(null); }
    }
  }
  return <AppLayout title="User details"><title>{account ? userName(account) + " - User Details | TopSend" : "User Details | TopSend"}</title>
    <div className={styles.intro}><Link className={styles.back} to={"/admin/users" + search}>Back to users</Link>
      <button className={styles.button} disabled={loading || busy} onClick={refresh}>Refresh details</button></div>
    {feedback && <p className={controls.feedback} data-error={String(feedback.error)} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    <div aria-busy={loading}>{loading ? <p className={styles.panel} role="status">Loading user details…</p>
      : result.error ? <section className={styles.panel + " " + styles.error} role="alert"><h2>User unavailable</h2><p>{userAdminProblem(result.error, "Couldn't load this user. Please try again.")}</p>
        <div className={styles.actions}><button className={styles.button} onClick={refresh}>Try again</button>{result.error instanceof ApiError && result.error.status === 401 && <Link className={styles.button} to="/login">Sign in</Link>}</div></section>
        : account && <><AccountDetails account={account} />
          <UserAccountControls account={account} actorId={actorId} editing={editing} disabled={busy || uncertain} onEdit={() => { setEditing(true); setFields({}); setFeedback(null); }} onDeactivate={() => setConfirmation({ kind: "deactivate" })} />
          {editing && <UserProfileForm account={account} disabled={busy || uncertain} serverErrors={fields} onDraftChange={() => { setFields({}); setFeedback(null); }} onReview={changes => { setFields({}); setFeedback(null); setConfirmation({ kind: "profile", changes }); }} onCancel={() => { setEditing(false); setFields({}); }} />}
          {confirmation && <ConfirmAccountChange account={account} action={confirmation} busy={busy} onCancel={() => { if (!mutation.current) setConfirmation(null); }} onConfirm={() => void confirm()} />}
        </>}
    </div>
  </AppLayout>;
}
function AccountDetails({ account }: { account: UserDetails }) {
  const profile = account.climber;
  return <>
    <section className={styles.panel} aria-label="Selected user account">
      <div className={styles.accountHeading}><div><h2>{userName(account)}</h2><p className={styles.help}>{account.roleLabel || account.role}</p></div>
        <span className={styles.badge} data-active={String(account.isActive)}>{userAccountStatus(account.isActive)}</span></div>
      <dl className={styles.facts}>
        <Fact label="Email" value={account.email} /><Fact label="Phone" value={account.phone} />
        <Fact label="Account ID" value={account._id} /><Fact label="Role" value={account.roleLabel || account.role} />
        <Fact label="Joined (Toronto time)" value={account.createdAt ? formatTorontoDateTime(account.createdAt) : null} />
        <Fact label="Last updated (Toronto time)" value={account.updatedAt ? formatTorontoDateTime(account.updatedAt) : null} />
      </dl>
    </section>
    {account.role === "CLIMBER" && <section className={styles.panel + " " + styles.extra} aria-label="Climber profile"><h2>Climber profile</h2>
      {profile ? <dl className={styles.facts}>
        <Fact label="Date of birth" value={profile.dateOfBirth ? formatCalendarDate(profile.dateOfBirth) : null} />
        <Fact label="Gender" value={profile.gender ? ({ MALE: "Male", FEMALE: "Female", PREFER_NOT_TO_SAY: "Prefer not to say" }[profile.gender] ?? profile.gender) : null} />
        <Fact label="Address" value={profile.address} /><Fact label="Postal code" value={profile.postalCode} /><Fact label="Country" value={profile.country} />
        <Fact label="Saved map location" value={profile.hasSavedLocation === true ? "Saved" : profile.hasSavedLocation === false ? "Not saved" : "Unavailable"} />
        <Fact label="Competition registrations" value={Number.isSafeInteger(profile.registrationCount) && profile.registrationCount >= 0 ? String(profile.registrationCount) : "Unavailable"} />
      </dl> : <p className={styles.notice}>Climber profile information is unavailable.</p>}</section>}
    {account.role === "GYM_ADMIN" && <section className={styles.panel + " " + styles.extra} aria-label="Assigned gyms"><h2>Assigned gyms</h2>
      {account.gymAdmin?.gyms.length ? <ul className={styles.assignedGyms}>{account.gymAdmin.gyms.map(gym => <li key={gym._id}><Link to={"/admin/gyms/" + encodeURIComponent(gym._id)}>{gym.name}</Link><span className={styles.help}>Gym {gym.status.toLowerCase()}</span></li>)}</ul>
        : <p className={styles.notice}>No gyms are assigned to this account.</p>}</section>}
  </>;
}
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt>{label}</dt><dd>{value?.trim() || "Not provided"}</dd></div>;
}
