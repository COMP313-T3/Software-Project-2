import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PhoneFold from "../components/common/PhoneFold.tsx";
import { useLiveReload } from "../components/common/useLiveReload.ts";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatTorontoDateTime } from "../lib/dateFormat.ts";
import { PAGE_TOPIC } from "../lib/liveChanges.ts";
import {
  DEFAULT_USER_FILTERS, USER_SEARCH_MAX_LENGTH, getUserFilterOptions, listAdminUsers,
  readUserFilters, userSearchParams, userName, userAccountStatus, userAdminProblem,
  type UserFilters, type UserFilterOptions, type UserPage,
} from "../lib/userAdminApi.ts";
import styles from "./UsersPage.module.css";

/** Whether a failed read means the admin may no longer see what the page shows. */
const lostAccess = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);

/**
 * US-008 / #146, #147 -> FR-003 -> AC-006. Selection opens read-only account details. The list
 * and its filter choices follow the accounts and gyms by themselves, keeping what they show until
 * the new answer arrives.
 */
export default function UsersPage() {
  const { user } = useSession();
  if (user?.role !== "ADMIN") return <AccessRequired title="System Administrator access required" allowed="System Administrators" />;
  return <UserWorkspace key={user.userId} />;
}
function UserWorkspace() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readUserFilters(params), [params]);
  const [revision, setRevision] = useState(0);
  // Other filters start empty. A reread of the same ones keeps its accounts in view.
  const view = JSON.stringify(filters);
  const [result, setResult] = useState<{ view: string; revision: number; data: UserPage | null; error: unknown }>({ view: "", revision: -1, data: null, error: null });
  const [optionResult, setOptionResult] = useState<{ revision: number; data: UserFilterOptions | null; error: unknown }>({ revision: -1, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    listAdminUsers(filters, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ view, revision, data, error: null });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setResult(now => now.view === view && now.data !== null && !lostAccess(error) ? { ...now, revision } : { view, revision, data: null, error });
    });
    return () => controller.abort();
  }, [filters, view, revision]);
  useEffect(() => {
    const controller = new AbortController();
    getUserFilterOptions(controller.signal).then(data => {
      if (!controller.signal.aborted) setOptionResult({ revision, data, error: null });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setOptionResult(now => now.data !== null && !lostAccess(error) ? { ...now, revision } : { revision, data: null, error });
    });
    return () => controller.abort();
  }, [revision]);
  const shown = result.view === view ? result : null;
  const data = shown?.data ?? null;
  const loading = !(shown && shown.revision === revision) && data === null;
  const optionLoading = optionResult.revision !== revision && optionResult.data === null;
  const listError = loading ? null : shown?.error ?? null;
  const optionError = optionLoading ? null : optionResult.error;
  const options = optionResult.data;
  const denied = [listError, optionError].find(error => error instanceof ApiError && [401, 403].includes(error.status));
  const apply = (next: UserFilters) => setParams(userSearchParams(next));
  const refresh = () => setRevision(value => value + 1);
  useLiveReload(refresh, { topics: [PAGE_TOPIC.users, PAGE_TOPIC.gyms], paused: loading || optionLoading || Boolean(denied) });
  const search = userSearchParams(filters).toString();
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const filtered = Boolean(filters.q.trim() || filters.role || filters.status !== "all" || filters.gymId);
  return <AppLayout title="Manage users"><title>Manage Users | TopSend</title>
    <div className={styles.intro}><p>Find registered accounts and review their information.</p></div>
    {denied ? <ErrorPanel error={denied} refresh={refresh} /> : <>
      <UserControls key={JSON.stringify(filters)} filters={filters} options={options} optionLoading={optionLoading} optionError={optionError} error={listError} apply={apply} refresh={refresh} />
      <section className={styles.panel + " " + styles.results} aria-labelledby="users-results-title" aria-busy={loading}>
        <div className={styles.heading}><h2 id="users-results-title">Registered users</h2>
          {data && <p role="status">{data.total.toLocaleString("en-CA")} {data.total === 1 ? "user" : "users"} found</p>}</div>
        {loading ? <p className={styles.notice} role="status">Loading users…</p>
          : listError ? <ErrorPanel error={listError} refresh={refresh} />
            : data && !data.users.length ? <div className={styles.empty}>
              <h3>{data.total > 0 ? "No users on this page" : filtered ? "No users match your search" : "No registered users yet"}</h3>
              <p>{data.total > 0 ? "The results have changed. Return to the first page to see available users." : filtered ? "Try another name or email, or clear the filters." : "Registered TopSend accounts will appear here."}</p>
              {(filtered || data.total > 0) && <button className={styles.button} onClick={() => apply(data.total > 0 ? { ...filters, page: 1 } : { ...DEFAULT_USER_FILTERS })}>{data.total > 0 ? "Go to first page" : "Clear search and filters"}</button>}
            </div> : data && <>
              <table className={styles.table}><caption className={styles.visuallyHidden}>Registered TopSend users. Select View details to open an account.</caption>
                <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Account status</th><th scope="col">Assigned gyms</th><th scope="col">Joined</th><th scope="col"><span className={styles.visuallyHidden}>Select user</span></th></tr></thead>
                <tbody>{data.users.map(user => <tr key={user._id}>
                  <td data-label="User"><strong>{userName(user)}</strong><span className={styles.email}>{user.email}</span></td>
                  <td data-label="Role">{user.roleLabel || user.role}</td>
                  <td data-label="Account status"><span className={styles.badge} data-active={String(user.isActive)}>{userAccountStatus(user.isActive)}</span></td>
                  <td data-label="Assigned gyms">{user.role === "GYM_ADMIN" ? user.gyms.length ? <ul className={styles.gyms}>{user.gyms.map(gym => <li key={gym._id}>{gym.name}</li>)}</ul> : "No gyms assigned" : "Not applicable"}</td>
                  <td data-label="Joined">{user.createdAt ? formatTorontoDateTime(user.createdAt) : "Unavailable"}</td>
                  <td className={styles.openCell}><Link className={styles.button} aria-label={"View details for " + userName(user)} to={"/admin/users/" + encodeURIComponent(user._id) + (search ? "?" + search : "")}>View details</Link></td>
                </tr>)}</tbody>
              </table>
              <nav className={styles.pagination} aria-label="User list pages">
                <p>Page {data.page.toLocaleString("en-CA")} of {pages.toLocaleString("en-CA")}</p>
                <div><button className={styles.button} disabled={data.page <= 1} onClick={() => apply({ ...filters, page: data.page - 1 })}>Previous page</button>
                  <button className={styles.button} disabled={data.page >= pages} onClick={() => apply({ ...filters, page: data.page + 1 })}>Next page</button></div>
              </nav>
            </>}
      </section>
    </>}
  </AppLayout>;
}

/** The filters a server's field message can be about. */
const FILTER_FIELDS = ["role", "status", "gymId", "sort", "limit"] as const;

/**
 * What the filters and sorting are set to, in a line that stays in view while they're folded on a
 * phone, such as "All roles, active, sorted by name (A to Z)". Empty until the choices load.
 */
function filterSummary(filters: UserFilters, options: UserFilterOptions | null): string {
  if (!options) return "";
  const labelOf = (list: { value: string; label: string }[], value: string) => list.find(option => option.value === value)?.label ?? value;
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  return [
    filters.role ? labelOf(options.roles, filters.role) : "All roles",
    lower(labelOf(options.statuses, filters.status)),
    filters.gymId ? options.gyms.find(gym => gym._id === filters.gymId)?.name ?? "one gym" : "",
    "sorted by " + lower(labelOf(options.sorts, filters.sort)),
    filters.limit !== DEFAULT_USER_FILTERS.limit ? filters.limit + " per page" : "",
  ].filter(Boolean).join(", ");
}

function UserControls({ filters, options, optionLoading, optionError, error, apply, refresh }: {
  filters: UserFilters; options: UserFilterOptions | null; optionLoading: boolean; optionError: unknown; error: unknown;
  apply: (value: UserFilters) => void; refresh: () => void;
}) {
  const [q, setQ] = useState(filters.q);
  const [localError, setLocalError] = useState("");
  const fieldErrors = error instanceof ApiError && error.status === 400 ? error.fields ?? {} : {};
  function search(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length > USER_SEARCH_MAX_LENGTH) { setLocalError("Use 100 characters or fewer."); return; }
    setLocalError(""); apply({ ...filters, q: q.trim(), page: 1 });
  }
  const change = (field: keyof UserFilters, value: string | number) => apply({ ...filters, q: q.trim(), [field]: value, page: 1 });
  const choices = <>
    <div className={styles.filters}>
      <Choice label="Role" name="role" value={filters.role} options={options?.roles ?? []} all="All roles" disabled={!options} error={fieldErrors.role} onChange={value => change("role", value)} />
      <Choice label="Account status" name="status" value={filters.status} options={options?.statuses ?? []} disabled={!options} error={fieldErrors.status} onChange={value => change("status", value)} />
      <Choice label="Gym" name="gymId" value={filters.gymId} options={options?.gyms.map(gym => ({ value: gym._id, label: gym.name + (gym.status !== "ACTIVE" ? " (" + gym.status.toLowerCase() + ")" : "") })) ?? []} all="All gyms" disabled={!options} error={fieldErrors.gymId} onChange={value => change("gymId", value)} />
      <Choice label="Sort by" name="sort" value={filters.sort} options={options?.sorts ?? []} disabled={!options} error={fieldErrors.sort} onChange={value => change("sort", value)} />
      <Choice label="Users per page" name="limit" value={String(filters.limit)} options={[20, 50, 100].map(limit => ({ value: String(limit), label: String(limit) }))} onChange={value => change("limit", Number(value))} />
    </div>
    <p className={styles.help}>The gym filter finds that gym's assigned Gym Administrators.</p>
  </>;
  return <section className={styles.panel} aria-label="User search and filters">
    <form role="search" aria-label="Search TopSend users" onSubmit={search}>
      <label className={styles.searchLabel} htmlFor="user-search">Search users</label>
      <div className={styles.searchRow}><input id="user-search" name="q" type="search" autoComplete="off" maxLength={USER_SEARCH_MAX_LENGTH} placeholder="Name, email or account ID" value={q}
        aria-invalid={Boolean(localError || fieldErrors.q)} aria-describedby="user-search-hint user-search-error" onChange={event => { setQ(event.target.value); setLocalError(""); }} />
        <button type="submit" className={styles.primary}>Search</button>
        <button type="button" className={styles.button} onClick={() => { setQ(""); setLocalError(""); apply({ ...DEFAULT_USER_FILTERS }); }}>Clear filters</button></div>
      <p id="user-search-hint" className={styles.help}>Search names, emails or a full account ID. Up to five words and 100 characters.</p>
      <p id="user-search-error" className={styles.fieldError}>{localError || fieldErrors.q || ""}</p>
      {/* A filter the server refused stays in view with its message, so it's never folded away. */}
      {FILTER_FIELDS.some(field => fieldErrors[field]) ? choices
        : <PhoneFold name="user-filters" about="Account list" label="Filters and sorting" summary={filterSummary(filters, options) || undefined} className={styles.filterFold}>{choices}</PhoneFold>}
    </form>
    {optionLoading && <p className={styles.help} role="status">Loading filter choices…</p>}
    {Boolean(optionError) && <div className={styles.error} role="alert"><p>{userAdminProblem(optionError, "Couldn't load filter choices. Please try again.")}</p><button className={styles.button} onClick={refresh}>Retry filter choices</button></div>}
  </section>;
}
function Choice({ label, name, value, options, all, disabled, error, onChange }: {
  label: string; name: string; value: string; options: { value: string; label: string }[]; all?: string; disabled?: boolean; error?: string; onChange: (value: string) => void;
}) {
  const known = options.some(option => option.value === value) || (all && !value);
  return <div><label htmlFor={"users-" + name}>{label}</label><select id={"users-" + name} name={name} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? "users-" + name + "-error" : undefined} onChange={event => onChange(event.target.value)}>
    {all && <option value="">{all}</option>}{!known && <option value={value}>{disabled ? "Loading…" : "Unavailable selection"}</option>}
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>{error && <p id={"users-" + name + "-error"} className={styles.fieldError}>{error}</p>}</div>;
}
function ErrorPanel({ error, refresh }: { error: unknown; refresh: () => void }) {
  return <div className={styles.error} role="alert"><h3>User list unavailable</h3><p>{userAdminProblem(error, "Couldn't load users. Please try again.")}</p>
    <div className={styles.actions}><button className={styles.button} onClick={refresh}>Try again</button>{error instanceof ApiError && error.status === 401 && <Link className={styles.button} to="/login">Sign in</Link>}</div>
  </div>;
}
