import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLiveReload } from "../components/common/useLiveReload.ts";
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
import { PAGE_TOPIC } from "../lib/liveChanges.ts";
import styles from "./SystemSettingsPage.module.css";

const PLATFORM_NAME_MAX_LENGTH = 100;
const MAINTENANCE_MESSAGE_MAX_LENGTH = 200;
const RANGES = {
  failedLoginsBeforeLock: { min: 3, max: 20 },
  loginLockMinutes: { min: 5, max: 120 },
} as const;
const SWITCHES = ["climberRegistrationEnabled", "accessRequestEmails", "maintenanceMode"] as const;

type NumberField = keyof typeof RANGES;
type CheckedField = "failedLoginsBeforeLock" | "loginLockMinutes" | "maintenanceMessage";
/** The settings as the form holds them: the numbers as typed, so a field can be empty while it's changed. */
type SettingsForm = Omit<SystemSettings, NumberField> & Record<NumberField, string>;

function formOf(settings: SystemSettings): SettingsForm {
  return {
    ...settings,
    failedLoginsBeforeLock: String(settings.failedLoginsBeforeLock),
    loginLockMinutes: String(settings.loginLockMinutes),
  };
}

function rangeMessage(field: NumberField) {
  return `Enter a whole number from ${RANGES[field].min} to ${RANGES[field].max}.`;
}

function wholeNumberIn(value: string, field: NumberField): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return number >= RANGES[field].min && number <= RANGES[field].max ? number : null;
}

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

/** The settings follow what other System Administrators save, but never while some are changed and not saved. */
function SystemSettingsWorkspace() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [draft, setDraft] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const [nameError, setNameError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CheckedField, string>>>({});
  const [accessLost, setAccessLost] = useState(false);
  const shown = useRef(false);

  function errorMessage(error: unknown, writing: boolean) {
    if (error instanceof ApiError) {
      if (error.status === 401) return "Your session has ended. Sign in again to continue.";
      if (error.status === 403) return "System Administrator access is required to manage settings.";
      if (error.status === 400) return "Check the settings and try again.";
      if (error.status === 429) return "Too many requests. Please wait and try again.";
    }
    return writing ? "Couldn't save system settings. Please try again." : "Couldn't load system settings. Please try again.";
  }

  function show(saved: SystemSettings) {
    setSettings(saved);
    setDraft(formOf(saved));
  }

  useEffect(() => { shown.current = settings !== null; });
  useEffect(() => {
    const controller = new AbortController();
    fetchSystemSettings(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        show(result);
        setProblem("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const lost = error instanceof ApiError && [401, 403].includes(error.status);
        // A failed reread keeps the settings it has, unless the admin may no longer see them.
        if (shown.current && !lost) return;
        setProblem(errorMessage(error, false));
        if (lost) { setAccessLost(true); setSettings(null); setDraft(null); }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => () => mutation.current?.abort(), []);

  const changes: SystemSettingsChanges = {};
  if (settings && draft) {
    const name = draft.platformName.trim();
    if (name !== settings.platformName) changes.platformName = name;
    for (const field of SWITCHES) {
      if (draft[field] !== settings[field]) changes[field] = draft[field];
    }
    for (const field of Object.keys(RANGES) as NumberField[]) {
      if (draft[field].trim() !== String(settings[field])) changes[field] = Number(draft[field].trim());
    }
    const message = draft.maintenanceMessage.trim();
    if (message !== settings.maintenanceMessage) changes.maintenanceMessage = message;
  }
  const hasChanges = Object.keys(changes).length > 0;
  useLiveReload(() => setRevision((value) => value + 1), {
    topics: [PAGE_TOPIC.settings], paused: loading || saving || hasChanges || accessLost,
  });

  function edit(next: Partial<SettingsForm>, field?: CheckedField) {
    if (!draft) return;
    setDraft({ ...draft, ...next });
    setNotice("");
    setProblem("");
    if (field) setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
  }

  function problemsIn(form: SettingsForm) {
    const found: Partial<Record<CheckedField, string>> = {};
    for (const field of Object.keys(RANGES) as NumberField[]) {
      if (wholeNumberIn(form[field], field) === null) found[field] = rangeMessage(field);
    }
    if (form.maintenanceMessage.trim().length > MAINTENANCE_MESSAGE_MAX_LENGTH) {
      found.maintenanceMessage = `Use ${MAINTENANCE_MESSAGE_MAX_LENGTH} characters or fewer.`;
    }
    return found;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || locked.current || !draft || accessLost) return;
    const badName = !draft.platformName.trim() || draft.platformName.trim().length > PLATFORM_NAME_MAX_LENGTH;
    if (badName) setNameError(!draft.platformName.trim() ? "Enter a platform name." : "Use 100 characters or fewer.");
    const found = problemsIn(draft);
    setFieldErrors(found);
    if (badName || Object.keys(found).length > 0) return;
    locked.current = true;
    setSaving(true);
    setProblem("");
    setNotice("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const saved = await saveSystemSettings(changes, controller.signal);
      if (controller.signal.aborted) return;
      show(saved);
      setNotice("System settings saved.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setProblem(errorMessage(error, true));
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setAccessLost(true); setSettings(null); setDraft(null);
      }
      if (error instanceof ApiError && error.status === 400 && error.fields) {
        if (error.fields.platformName) setNameError("Enter a platform name of 1 to 100 characters.");
        const fields = error.fields;
        setFieldErrors(Object.fromEntries(
          (["failedLoginsBeforeLock", "loginLockMinutes", "maintenanceMessage"] as const)
            .filter((field) => fields[field])
            .map((field) => [field, fields[field]]),
        ));
      }
    } finally {
      locked.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  function fieldError(field: CheckedField, id: string) {
    return fieldErrors[field] ? <p id={id} className={styles.fieldError} role="alert">{fieldErrors[field]}</p> : null;
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
          Manage platform information, registration, notifications, security, and maintenance.
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
                  edit({ platformName: event.target.value });
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
                  onChange={(event) => edit({ climberRegistrationEnabled: event.target.checked })}
                />
                <span>Allow new public Climber sign-ups</span>
              </label>
              <p className={styles.help}>
                This does not affect existing accounts or Gym Administrator
                access requests.
              </p>
            </fieldset>
            <fieldset disabled={loading || saving}>
              <legend>Notifications</legend>
              <label className={styles.toggle} htmlFor="access-request-emails">
                <input
                  id="access-request-emails"
                  name="accessRequestEmails"
                  type="checkbox"
                  aria-describedby="access-request-emails-help"
                  checked={draft.accessRequestEmails}
                  onChange={(event) => edit({ accessRequestEmails: event.target.checked })}
                />
                <span>Email System Administrators about new access requests</span>
              </label>
              <p id="access-request-emails-help" className={styles.help}>
                Every active System Administrator gets an email when someone asks to manage a gym,
                with a link to review it. It's sent from TopSend's email account once that's set up.
              </p>
            </fieldset>
            <fieldset disabled={loading || saving}>
              <legend>Security</legend>
              <div className={styles.pair}>
                <div className={styles.field}>
                  <label htmlFor="failed-logins-before-lock">Failed logins before an email is locked</label>
                  <input
                    id="failed-logins-before-lock"
                    name="failedLoginsBeforeLock"
                    type="number"
                    inputMode="numeric"
                    min={RANGES.failedLoginsBeforeLock.min}
                    max={RANGES.failedLoginsBeforeLock.max}
                    step={1}
                    value={draft.failedLoginsBeforeLock}
                    aria-invalid={!!fieldErrors.failedLoginsBeforeLock}
                    aria-describedby={`login-lock-help${fieldErrors.failedLoginsBeforeLock ? " failed-logins-error" : ""}`}
                    onChange={(event) => edit({ failedLoginsBeforeLock: event.target.value }, "failedLoginsBeforeLock")}
                  />
                  {fieldError("failedLoginsBeforeLock", "failed-logins-error")}
                </div>
                <div className={styles.field}>
                  <label htmlFor="login-lock-minutes">Lock time in minutes</label>
                  <input
                    id="login-lock-minutes"
                    name="loginLockMinutes"
                    type="number"
                    inputMode="numeric"
                    min={RANGES.loginLockMinutes.min}
                    max={RANGES.loginLockMinutes.max}
                    step={1}
                    value={draft.loginLockMinutes}
                    aria-invalid={!!fieldErrors.loginLockMinutes}
                    aria-describedby={`login-lock-help${fieldErrors.loginLockMinutes ? " lock-minutes-error" : ""}`}
                    onChange={(event) => edit({ loginLockMinutes: event.target.value }, "loginLockMinutes")}
                  />
                  {fieldError("loginLockMinutes", "lock-minutes-error")}
                </div>
              </div>
              <p id="login-lock-help" className={styles.help}>
                After this many failed logins within 15 minutes, nobody can log in with that email
                until the lock time is over. From {RANGES.failedLoginsBeforeLock.min} to {RANGES.failedLoginsBeforeLock.max} failed
                logins, and {RANGES.loginLockMinutes.min} to {RANGES.loginLockMinutes.max} minutes.
              </p>
            </fieldset>
            <fieldset disabled={loading || saving}>
              <legend>Maintenance</legend>
              <label className={styles.toggle} htmlFor="maintenance-mode">
                <input
                  id="maintenance-mode"
                  name="maintenanceMode"
                  type="checkbox"
                  aria-describedby="maintenance-mode-help"
                  checked={draft.maintenanceMode}
                  onChange={(event) => edit({ maintenanceMode: event.target.checked })}
                />
                <span>Maintenance mode</span>
              </label>
              <p id="maintenance-mode-help" className={styles.help}>
                While it's on, only System Administrators can log in. Anyone else loses access
                within 15 minutes and is logged out, and Climber sign-ups and access requests wait
                until it's off.
              </p>
              <label htmlFor="maintenance-message">Message for everyone logged in <span className={styles.optional}>(optional)</span></label>
              <textarea
                id="maintenance-message"
                name="maintenanceMessage"
                rows={3}
                maxLength={MAINTENANCE_MESSAGE_MAX_LENGTH}
                value={draft.maintenanceMessage}
                aria-invalid={!!fieldErrors.maintenanceMessage}
                aria-describedby={`maintenance-message-help${fieldErrors.maintenanceMessage ? " maintenance-message-error" : ""}`}
                onChange={(event) => edit({ maintenanceMessage: event.target.value }, "maintenanceMessage")}
              />
              {fieldError("maintenanceMessage", "maintenance-message-error")}
              <p id="maintenance-message-help" className={styles.help}>
                Shown at the top of every page while it's set, such as a time maintenance will start,
                and to anyone who can't log in during maintenance. Leave it empty to show nothing.
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
            {hasChanges && <><span className={styles.help}>Unsaved changes</span><button type="button" disabled={saving} onClick={() => { setDraft(formOf(settings)); setProblem(""); setNotice(""); setNameError(""); setFieldErrors({}); }}>Discard changes</button></>}</div>
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
