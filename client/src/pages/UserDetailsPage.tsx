import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { getAdminUser, userName, userAccountStatus, userAdminProblem, type UserDetails } from "../lib/userAdminApi.ts";
import styles from "./UsersPage.module.css";

/** US-008 selection opens a read-only account. Account editing belongs to US-009. */
export default function UserDetailsPage() {
  const { user } = useSession(); const { userId = "" } = useParams();
  if (user?.role !== "ADMIN") return <AccessRequired title="System Administrator access required" allowed="System Administrators" />;
  return <AccountWorkspace key={user.userId + ":" + userId} id={userId} />;
}
function AccountWorkspace({ id }: { id: string }) {
  const { search } = useLocation();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; data: UserDetails | null; error: unknown }>({ revision: -1, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    getAdminUser(id, controller.signal).then(data => { if (!controller.signal.aborted) setResult({ revision, data, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ revision, data: null, error }); });
    return () => controller.abort();
  }, [id, revision]);
  const loading = result.revision !== revision, account = loading ? null : result.data;
  return <AppLayout title="User details"><title>{account ? userName(account) + " - User Details | TopSend" : "User Details | TopSend"}</title>
    <div className={styles.intro}><Link className={styles.back} to={"/admin/users" + search}>Back to users</Link>
      <button className={styles.button} disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh details</button></div>
    <div aria-busy={loading}>{loading ? <p className={styles.panel} role="status">Loading user details…</p>
      : result.error ? <section className={styles.panel + " " + styles.error} role="alert"><h2>User unavailable</h2><p>{userAdminProblem(result.error, "Couldn't load this user. Please try again.")}</p>
        <div className={styles.actions}><button className={styles.button} onClick={() => setRevision(value => value + 1)}>Try again</button>{result.error instanceof ApiError && result.error.status === 401 && <Link className={styles.button} to="/login">Sign in</Link>}</div></section>
        : account && <AccountDetails account={account} />}
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
