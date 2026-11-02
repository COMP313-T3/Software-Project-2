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
  return <SystemSettingsWorkspace key={user.userId} />;
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
  const locked = useRef(false);
  const [nameError, setNameError] = useState("");
  const [accessLost, setAccessLost] = useState(false);

  function errorMessage(error: unknown, writing: boolean) {
    if (error instanceof ApiError) {
      if (error.status === 401) return "Your session has ended. Sign in again to continue.";
      if (error.status === 403) return "System Administrator access is required to manage settings.";
      if (error.status === 400) return "Check the settings and try again.";
      if (error.status === 429) return "Too many requests. Please wait and try again.";
    }
    return writing ? "Couldn't save system settings. Please try again." : "Couldn't load system settings. Please try again.";
  }

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
          setProblem(errorMessage(error, false));
          if (error instanceof ApiError && [401, 403].includes(error.status)) setAccessLost(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => () => mutation.current?.abort(), []);

  const changes: SystemSettingsChanges = {};
  if (settings && draft?.platformName.trim() !== settings.platformName) {
    changes.platformName = draft?.platformName.trim() ?? "";
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
    if (!hasChanges || locked.current || !draft || accessLost) return;
    if (!draft.platformName.trim() || draft.platformName.trim().length > PLATFORM_NAME_MAX_LENGTH) {
      setNameError(!draft.platformName.trim() ? "Enter a platform name." : "Use 100 characters or fewer.");
      return;
    }
    locked.current = true;
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
      setProblem(errorMessage(error, true));
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setAccessLost(true); setSettings(null); setDraft(null);
      }
      if (error instanceof ApiError && error.status === 400 && error.fields?.platformName) setNameError("Enter a platform name of 1 to 100 characters.");
    } finally {
      locked.current = false;
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
            {!settings && !accessLost && !loading && (
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
          <form className={styles.form} noValidate onSubmit={(event) => void save(event)} aria-busy={saving}>
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
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "platform-name-error" : undefined}
                onChange={(event) => {
                  setDraft({ ...draft, platformName: event.target.value });
                  setNotice("");
                  setProblem("");
                  setNameError("");
                }}
              />
              {nameError && <p id="platform-name-error" className={styles.help} role="alert">{nameError}</p>}
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
            <div className={styles.actions}><button
              className={styles.save}
              type="submit"
              disabled={loading || saving || !hasChanges}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            {hasChanges && <><span className={styles.help}>Unsaved changes</span><button type="button" disabled={saving} onClick={() => { setDraft(settings); setProblem(""); setNotice(""); setNameError(""); }}>Discard changes</button></>}</div>
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
