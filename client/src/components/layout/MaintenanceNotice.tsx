import { useCallback, useEffect, useState } from "react";
import { getMaintenanceNotice, type MaintenanceNotice as Notice } from "../../lib/maintenanceNoticeApi.ts";
import { PAGE_TOPIC } from "../../lib/liveChanges.ts";
import { useLiveReload } from "../common/useLiveReload.ts";
import { useSession } from "../session/sessionContext.ts";
import styles from "./AppLayout.module.css";

/**
 * The System Administrators' maintenance message at the top of every logged-in page, and for a
 * System Administrator, a reminder while maintenance mode is on (US-010). It follows what they save
 * by itself. Without a message, and outside maintenance mode, it shows nothing.
 */
export default function MaintenanceNotice() {
  const { user } = useSession();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [revision, setRevision] = useState(0);
  const userId = user?.userId;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() => getMaintenanceNotice(controller.signal))
      .then((next) => {
        if (!controller.signal.aborted) setNotice(next ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [userId, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useLiveReload(reload, { topics: [PAGE_TOPIC.settings] });

  const reminder = Boolean(notice?.maintenanceMode) && user?.role === "ADMIN";
  if (!notice?.maintenanceMessage && !reminder) return null;
  return (
    <div className={styles.maintenance} role="status">
      {notice?.maintenanceMessage && <p>{notice.maintenanceMessage}</p>}
      {reminder && <p>Maintenance mode is on, so only System Administrators can log in.</p>}
    </div>
  );
}
