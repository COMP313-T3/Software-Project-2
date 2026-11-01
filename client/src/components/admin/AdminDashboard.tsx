import { Link } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import {
  fetchAdminDashboard,
  type AdminDashboardSummary,
} from "../../lib/adminApi.ts";
import { ApiError } from "../../lib/apiClient.ts";
import AppLayout from "../layout/AppLayout.tsx";
import styles from "./AdminDashboard.module.css";

const numberFormat = new Intl.NumberFormat("en-CA");

/** A count, or a placeholder while it loads or when it couldn't load, never a made-up zero. */
function Count({ value, loading }: { value: number | undefined; loading: boolean }) {
  if (value !== undefined) return <>{numberFormat.format(value)}</>;
  return loading ? (
    <span className={styles.skeleton}>
      <span className={styles.visuallyHidden}>Loading</span>
    </span>
  ) : (
    <span className={styles.unavailable}>Not available</span>
  );
}

interface CountCardProps {
  label: string;
  value: number | undefined;
  description: string;
  href: string;
  loading: boolean;
}

function CountCard({ label, value, description, href, loading }: CountCardProps) {
  return (
    <a className={styles.card} href={href}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.total}>
        <Count value={value} loading={loading} />
      </span>
      <span className={styles.cardNote}>{description}</span>
    </a>
  );
}

interface BreakdownProps {
  id: string;
  title: string;
  description: string;
  rows: { label: string; value: number | undefined }[];
  loading: boolean;
  empty: boolean;
  emptyMessage: string;
  children?: ReactNode;
}

function Breakdown({
  id,
  title,
  description,
  rows,
  loading,
  empty,
  emptyMessage,
  children,
}: BreakdownProps) {
  return (
    <section className={styles.panel} id={id} aria-labelledby={`${id}Title`}>
      <h3 id={`${id}Title`}>{title}</h3>
      <p className={styles.panelNote}>{description}</p>
      <dl className={styles.breakdown}>
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Count value={value} loading={loading} />
            </dd>
          </div>
        ))}
      </dl>
      {empty && <p className={styles.emptyMessage}>{emptyMessage}</p>}
      {children}
    </section>
  );
}

/** US-003: the ADMIN-only platform overview and its gym, user, and request summaries. */
export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

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

  return (
    <AppLayout title="Admin dashboard">
      <title>Admin Dashboard | TopSend</title>
      <div className={styles.intro}>
        <div>
          <p className={styles.lead}>
            Totals for your gyms, accounts, and Gym Administrator access requests.
          </p>
          <p className={styles.loadStatus} role="status" aria-live="polite">
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
          </p>
        </div>
        <button
          className={styles.refreshButton}
          type="button"
          disabled={loading}
          aria-busy={loading}
          onClick={reloadCounts}
        >
          {loading ? "Loading counts..." : "Refresh counts"}
        </button>
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
          loading={loading}
        />
        <CountCard
          label="Total users"
          value={summary?.users.total}
          description="Accounts across the platform"
          href="#users"
          loading={loading}
        />
        <CountCard
          label="Pending requests"
          value={summary?.pendingRequests.total}
          description="Gym Administrator access requests"
          href="#requests"
          loading={loading}
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
          loading={loading}
          empty={summary?.gyms.total === 0}
          emptyMessage="No registered gyms yet."
        >
          <Link className={styles.panelLink} to="/admin/gyms">
            Manage gyms
          </Link>
        </Breakdown>
        <Breakdown
          id="users"
          title="User totals"
          description="Platform accounts by role"
          rows={[
            { label: "System administrators", value: summary?.users.admins },
            { label: "Gym administrators", value: summary?.users.gymAdmins },
            { label: "Climbers", value: summary?.users.climbers },
          ]}
          loading={loading}
          empty={summary?.users.total === 0}
          emptyMessage="No platform users yet."
        >
          <Link className={styles.panelLink} to="/admin/users">
            Manage users
          </Link>
        </Breakdown>
        <Breakdown
          id="requests"
          title="Pending requests"
          description="Gym Administrator requests awaiting review"
          rows={[
            { label: "New gyms", value: summary?.pendingRequests.newGyms },
            {
              label: "Existing gyms",
              value: summary?.pendingRequests.existingGyms,
            },
          ]}
          loading={loading}
          empty={summary?.pendingRequests.total === 0}
          emptyMessage="No pending requests. You're all caught up."
        >
          <Link className={styles.panelLink} to="/admin/gym-requests">
            Review requests
          </Link>
        </Breakdown>
      </div>
      <p>
        <Link className={styles.panelLink} to="/admin/settings">
          Manage system settings
        </Link>
      </p>
    </AppLayout>
  );
}
