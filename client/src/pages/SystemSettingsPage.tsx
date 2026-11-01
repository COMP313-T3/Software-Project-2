import { useEffect, useRef, useState, type FormEvent } from "react";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import {
  fetchSystemSettings,
  saveSystemSettings,
  type SystemSettings,
  type SystemSettingsChanges,
} from "../lib/adminApi.ts";
import styles from "./SystemSettingsPage.module.css";

const PLATFORM_NAME_MAX_LENGTH = 100;

export default function SystemSettingsPage() {
  const { user } = useSession();
  if (user?.role !== "ADMIN") {
    return (
      <AccessRequired
        title="System Administrator access required"
        allowed="System Administrators"
      />
    );
  }
  return <SystemSettingsWorkspace />;
}

function SystemSettingsWorkspace() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const mutation = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchSystemSettings(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSettings(result);
        setDraft(result);
        setProblem("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProblem(
            error instanceof ApiError
              ? error.message
              : "Couldn't load system settings. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => () => mutation.current?.abort(), []);

  const changes: SystemSettingsChanges = {};
  if (settings && draft?.platformName !== settings.platformName) {
    changes.platformName = draft?.platformName ?? "";
  }
  if (
    settings &&
    draft?.climberRegistrationEnabled !== settings.climberRegistrationEnabled
  ) {
    changes.climberRegistrationEnabled =
      draft?.climberRegistrationEnabled ?? settings.climberRegistrationEnabled;
  }
  const hasChanges = Object.keys(changes).length > 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || saving) return;
    setSaving(true);
    setProblem("");
    setNotice("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const saved = await saveSystemSettings(changes, controller.signal);
      if (controller.signal.aborted) return;
      setSettings(saved);
      setDraft(saved);
      setNotice("System settings saved.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Couldn't save system settings. Please try again.",
      );
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <AppLayout title="System settings">
      <title>
        {settings
          ? `System settings | ${settings.platformName}`
          : "System settings | TopSend"}
      </title>
      <section className={styles.page} aria-label="System settings">
        <p className={styles.intro}>
          Manage platform information and public Climber registration.
        </p>
        {problem && (
          <div className={styles.error} role="alert">
            <p>{problem}</p>
            {!settings && (
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {settings && draft && (
          <form className={styles.form} onSubmit={(event) => void save(event)}>
            <fieldset disabled={loading || saving}>
              <legend>Platform information</legend>
              <label htmlFor="system-platform-name">Platform display name</label>
              <input
                id="system-platform-name"
                name="platformName"
                type="text"
                required
                maxLength={PLATFORM_NAME_MAX_LENGTH}
                value={draft.platformName}
                onChange={(event) => {
                  setDraft({ ...draft, platformName: event.target.value });
                  setNotice("");
                  setProblem("");
                }}
              />
            </fieldset>
            <fieldset disabled={loading || saving}>
              <legend>Registration</legend>
              <label className={styles.toggle} htmlFor="climber-registration">
                <input
                  id="climber-registration"
                  name="climberRegistrationEnabled"
                  type="checkbox"
                  checked={draft.climberRegistrationEnabled}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      climberRegistrationEnabled: event.target.checked,
                    });
                    setNotice("");
                    setProblem("");
                  }}
                />
                <span>Allow new public Climber sign-ups</span>
              </label>
              <p className={styles.help}>
                This does not affect existing accounts or Gym Administrator
                access requests.
              </p>
            </fieldset>
            <button
              className={styles.save}
              type="submit"
              disabled={loading || saving || !hasChanges}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}
        {!settings && loading && (
          <p className={styles.loading} role="status">
            Loading system settings…
          </p>
        )}
      </section>
    </AppLayout>
  );
}
