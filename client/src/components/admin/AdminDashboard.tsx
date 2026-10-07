import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import logoUrl from "../../assets/brand/topsend-logo.png";
import {
  fetchAdminDashboard,
  type AdminDashboardSummary,
} from "../../lib/adminApi.ts";
import { ApiError } from "../../lib/apiClient.ts";
import Tooltip from "../common/Tooltip.tsx";
import { useSession } from "../session/sessionContext.ts";
import styles from "./AdminDashboard.module.css";

const numberFormat = new Intl.NumberFormat("en-CA");
const navigation = [
  { href: "#overview", label: "Overview", number: "01" },
  { href: "#gyms", label: "Gym overview", number: "02" },
  { href: "#users", label: "User totals", number: "03" },
  { href: "#requests", label: "Pending requests", number: "04" },
];

function count(value: number | undefined): string {
  return value === undefined ? "—" : numberFormat.format(value);
}

interface CountCardProps {
  label: string;
  value: number | undefined;
  description: string;
  href: string;
  index: string;
}

function CountCard({ label, value, description, href, index }: CountCardProps) {
  return (
    <a className={styles.card} href={href}>
      <div className={styles.cardTop}>
        <h2>{label}</h2>
        <span className={styles.cardIndex} aria-hidden="true">
          {index}
        </span>
      </div>
      <p className={styles.total}>{count(value)}</p>
      <div className={styles.cardBottom}>
        <p>{description}</p>
        <span aria-hidden="true">↗</span>
      </div>
    </a>
  );
}

interface BreakdownProps {
  id: string;
  title: string;
  description: string;
  rows: { label: string; value: number | undefined }[];
  empty: boolean;
  emptyMessage: string;
}

function Breakdown({
  id,
  title,
  description,
  rows,
  empty,
  emptyMessage,
}: BreakdownProps) {
  return (
    <section className={styles.panel} id={id} aria-labelledby={`${id}Title`}>
      <div className={styles.panelHeading}>
        <h2 id={`${id}Title`}>{title}</h2>
        <p>{description}</p>
      </div>
      <dl className={styles.breakdown}>
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count(value)}</dd>
          </div>
        ))}
      </dl>
      {empty && <p className={styles.emptyMessage}>{emptyMessage}</p>}
    </section>
  );
}

/** US-003: the ADMIN-only platform overview and its gym, user, and request summaries. */
export default function AdminDashboard() {
  const { user, logOut } = useSession();
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutProblem, setLogoutProblem] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    fetchAdminDashboard(controller.signal)
      .then((result) => {
        if (!current) return;
        setSummary(result);
        setUpdatedAt(new Date());
      })
      .catch((error: unknown) => {
        if (!current) return;
        setProblem(
          error instanceof ApiError
            ? error.message
            : "Couldn't load dashboard counts. Please try again.",
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [refreshVersion]);

  function reloadCounts() {
    setLoading(true);
    setSummary(null);
    setProblem("");
    setUpdatedAt(null);
    setRefreshVersion((version) => version + 1);
  }

  async function onLogOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutProblem("");
    try {
      await logOut();
    } catch (error) {
      setLogoutProblem(
        error instanceof ApiError
          ? error.message
          : "Couldn't log out. Please try again.",
      );
      setLoggingOut(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <title>Admin Dashboard | TopSend</title>
      <a className={styles.skipLink} href="#dashboardMain">
        Skip to dashboard
      </a>
      <aside className={styles.sidebar}>
        <header className={styles.brand}>
          <img src={logoUrl} alt="TopSend" width={159} height={52} />
          <span>Administration</span>
        </header>
        <nav className={styles.navigation} aria-label="Admin dashboard">
          {navigation.map(({ href, label, number }) => (
            <a key={href} href={href}>
              <span className={styles.navNumber} aria-hidden="true">
                {number}
              </span>
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.account}>
          <p className={styles.role}>System administrator</p>
          <p className={styles.email}>{user?.email}</p>
          <Tooltip text="Ends your session on this device. You'll need your password to log back in.">
            {(describedBy) => (
              <button
                className={styles.logoutButton}
                type="button"
                aria-describedby={describedBy}
                aria-busy={loggingOut}
                disabled={loggingOut}
                onClick={onLogOut}
              >
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
            )}
          </Tooltip>
          <p className={styles.logoutProblem} role="status">
            {logoutProblem}
          </p>
        </div>
      </aside>

      <main className={styles.main} id="dashboardMain" tabIndex={-1}>
        <header className={styles.pageHeader} id="overview">
          <div>
            <p className={styles.eyebrow}>Your platform, at a glance</p>
            <h1>Admin dashboard</h1>
            {/* Opens US-004 GymsPage; its API adapter calls gymController.listGyms. */}
            <Link to="/admin/gyms">Manage gyms →</Link>
            <p className={styles.subtitle}>
              An overview of your gyms, community, and access requests.
            </p>
          </div>
          <button
            className={styles.refreshButton}
            type="button"
            disabled={loading}
            aria-busy={loading}
            onClick={reloadCounts}
          >
            <span aria-hidden="true">↻</span>
            {loading ? "Loading counts..." : "Refresh counts"}
          </button>
        </header>

        <div className={styles.loadStatus} role="status" aria-live="polite">
          {loading ? (
            "Loading dashboard counts..."
          ) : updatedAt ? (
            <span>
              Updated{" "}
              <time dateTime={updatedAt.toISOString()}>
                {updatedAt.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </span>
          ) : (
            "Counts unavailable"
          )}
        </div>

        {problem && (
          <div className={styles.error} role="alert">
            <p>{problem}</p>
            <button type="button" onClick={reloadCounts}>
              Try again
            </button>
          </div>
        )}

        <section
          className={styles.cards}
          aria-label="Platform totals"
          aria-busy={loading}
        >
          <CountCard
            label="Total gyms"
            value={summary?.gyms.total}
            description="Registered climbing gyms"
            href="#gyms"
            index="01"
          />
          <CountCard
            label="Total users"
            value={summary?.users.total}
            description="Accounts across the platform"
            href="#users"
            index="02"
          />
          <CountCard
            label="Pending requests"
            value={summary?.pendingRequests.total}
            description="Gym administrator access requests"
            href="#requests"
            index="03"
          />
        </section>

        <div className={styles.sectionHeading}>
          <h2>Platform overview</h2>
          <p>See how the totals break down.</p>
        </div>
        <div className={styles.panels} aria-busy={loading}>
          <Breakdown
            id="gyms"
            title="Gym overview"
            description="Registered gyms by status"
            rows={[
              { label: "Active gyms", value: summary?.gyms.active },
              { label: "Pending gyms", value: summary?.gyms.pending },
              { label: "Inactive gyms", value: summary?.gyms.inactive },
            ]}
            empty={summary?.gyms.total === 0}
            emptyMessage="No registered gyms yet."
          />
          <Breakdown
            id="users"
            title="User totals"
            description="Platform accounts by role"
            rows={[
              { label: "System administrators", value: summary?.users.admins },
              { label: "Gym administrators", value: summary?.users.gymAdmins },
              { label: "Climbers", value: summary?.users.climbers },
            ]}
            empty={summary?.users.total === 0}
            emptyMessage="No platform users yet."
          />
          <Breakdown
            id="requests"
            title="Pending requests"
            description="Gym administrator requests awaiting review"
            rows={[
              { label: "New gyms", value: summary?.pendingRequests.newGyms },
              {
                label: "Existing gyms",
                value: summary?.pendingRequests.existingGyms,
              },
            ]}
            empty={summary?.pendingRequests.total === 0}
            emptyMessage="No pending requests. You're all caught up."
          />
        </div>
      </main>
    </div>
  );
}
