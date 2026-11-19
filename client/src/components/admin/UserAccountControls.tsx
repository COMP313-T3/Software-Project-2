import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { COUNTRY_OPTIONS } from "../../constants/countries.ts";
import { GENDER_OPTIONS } from "../../constants/genders.ts";
import { canDeactivateUser, editableUserFields, prepareUserChanges, profileDraft, USER_PROFILE_FIELDS, type UserProfileErrors } from "../../lib/userAccountForm.ts";
import type { UserProfileChanges } from "../../lib/userAccountApi.ts";
import { userName, type UserDetails } from "../../lib/userAdminApi.ts";
import panel from "../../pages/UsersPage.module.css";
import styles from "./UserAccountControls.module.css";

export function UserAccountControls({ account, actorId, disabled, editing, onEdit, onDeactivate }: {
  account: UserDetails; actorId: string; disabled: boolean; editing: boolean; onEdit: () => void; onDeactivate: () => void;
}) {
  const eligible = canDeactivateUser(account, actorId);
  const reason = account.isActive === false ? "This account is already deactivated."
    : account._id.toLowerCase() === actorId.toLowerCase() ? "You cannot deactivate your own account."
      : account.role === "ADMIN" ? "System Administrator accounts cannot be deactivated here."
        : account.isActive !== true ? "The account status must be confirmed before deactivation." : "Deactivation signs this user out and prevents them from logging in.";
  return <section className={panel.panel + " " + panel.extra} aria-labelledby="account-controls-heading">
    <h2 id="account-controls-heading">Manage account</h2>
    <div className={styles.access}>
      <div><label htmlFor="account-current-role">Current role</label><input id="account-current-role" readOnly value={account.roleLabel || account.role} aria-describedby="account-role-note" />
        <p id="account-role-note" className={panel.help}>Role changes are currently unavailable.</p></div>
      <div><h3>Permissions</h3><p className={panel.help}>Access follows the account's assigned role. Individual permission changes are currently unavailable.</p></div>
    </div>
    <div className={styles.accountActions}>
      <button className={panel.button} disabled={disabled || editing} onClick={onEdit}>Edit information</button>
      <div><button className={styles.danger} disabled={disabled || !eligible} aria-describedby="account-deactivation-note" onClick={onDeactivate}>Deactivate account</button>
        <p id="account-deactivation-note" className={panel.help}>{reason}</p></div>
    </div>
  </section>;
}

export function UserProfileForm({ account, disabled, serverErrors, onDraftChange, onReview, onCancel }: {
  account: UserDetails; disabled: boolean; serverErrors: UserProfileErrors; onDraftChange: () => void;
  onReview: (changes: UserProfileChanges) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => profileDraft(account));
  const [errors, setErrors] = useState<UserProfileErrors>({});
  const [problem, setProblem] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.querySelector<HTMLInputElement>("input")?.focus(); }, []);
  useEffect(() => { if (Object.keys(serverErrors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [serverErrors]);
  function review(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const prepared = prepareUserChanges(account, draft);
    setErrors(prepared.errors); setProblem("");
    if (Object.keys(prepared.errors).length) {
      const first = editableUserFields(account).find(field => prepared.errors[field.name]);
      form.current?.querySelector<HTMLElement>("#edit-user-" + first?.name)?.focus();
      return;
    }
    if (!Object.keys(prepared.changes).length) { setProblem("Change at least one account detail before saving."); return; }
    onReview(prepared.changes);
  }
  return <section className={panel.panel + " " + panel.extra} aria-labelledby="edit-user-heading"><h2 id="edit-user-heading">Edit account information</h2>
    <p className={panel.help}>Only changed fields will be saved. Review the changes before confirming.</p>
    <form ref={form} noValidate onSubmit={review} aria-label="Edit user information">
      <fieldset className={styles.fieldset} disabled={disabled}><legend className={panel.visuallyHidden}>Account information</legend><div className={styles.fields}>
        {editableUserFields(account).map(definition => {
          const { name, label, kind } = definition, id = "edit-user-" + name;
          const error = errors[name] || serverErrors[name];
          const shared = { id, name, value: draft[name], "aria-invalid": Boolean(error), "aria-describedby": error ? id + "-error" : undefined,
            onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDraft(value => ({ ...value, [name]: event.target.value })); setErrors(value => ({ ...value, [name]: undefined })); setProblem(""); onDraftChange(); } };
          return <div key={name}><label htmlFor={id}>{label}</label>
            {name === "country" ? <select {...shared}><option value="">Choose country</option>{COUNTRY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</select>
              : name === "gender" ? <select {...shared}><option value="">Choose gender</option>{GENDER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                : <input {...shared} type={kind === "date-of-birth" ? "date" : kind === "email" ? "email" : kind === "phone" ? "tel" : "text"} maxLength={"maxLength" in definition ? definition.maxLength : undefined} autoComplete="off" />}
            {error && <p id={id + "-error"} className={panel.fieldError}>{error}</p>}</div>;
        })}
      </div>
      {account.climber?.hasSavedLocation && <label className={styles.check}><input type="checkbox" checked={draft.clearLocation} onChange={event => { setDraft(value => ({ ...value, clearLocation: event.target.checked })); onDraftChange(); }} />Clear the saved map pin</label>}
      {account.role === "CLIMBER" && <p className={panel.help}>The saved map pin stays as it is unless you choose to clear it.</p>}
      <div className={styles.formActions}><button className={panel.primary} type="submit">Review changes</button><button className={panel.button} type="button" onClick={onCancel}>Cancel editing</button></div>
      </fieldset>
      {problem && <p className={panel.fieldError} role="alert">{problem}</p>}
    </form>
  </section>;
}

export type AccountConfirmation = { kind: "profile"; changes: UserProfileChanges } | { kind: "deactivate" };
export function ConfirmAccountChange({ account, action, busy, onCancel, onConfirm }: {
  account: UserDetails; action: AccountConfirmation; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const id = useId(), dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), closing = useRef(false);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closing.current = false;
    if (element && !element.open) element.showModal();
    cancel.current?.focus();
    return () => { closing.current = true; if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  const deactivating = action.kind === "deactivate";
  return <dialog ref={dialog} role="alertdialog" className={styles.dialog} aria-labelledby={id + "-title"} aria-describedby={id + "-summary"}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onClose={() => { if (closing.current || dialog.current?.open !== false) return; if (busy) dialog.current?.showModal(); else onCancel(); }}>
    <h2 id={id + "-title"}>{deactivating ? "Deactivate " + userName(account) + "?" : "Save changes for " + userName(account) + "?"}</h2>
    <p id={id + "-summary"}>{deactivating ? "This user will be signed out and unable to log in. Their account and competition records will be kept." : "Confirm the new information for this selected account."}</p>
    <p className={styles.identity}>{account.email}</p>
    {action.kind === "profile" && <dl className={styles.review}>{Object.entries(action.changes).map(([field, value]) => <div key={field}><dt>{USER_PROFILE_FIELDS.find(item => item.name === field)?.label ?? "Saved map pin"}</dt><dd>{field === "location" ? "Clear saved pin" : field === "gender" ? GENDER_OPTIONS.find(option => option.value === value)?.label ?? value : field === "country" ? COUNTRY_OPTIONS.find(option => option.code === value)?.name ?? value : value}</dd></div>)}</dl>}
    {busy && <p role="status">{deactivating ? "Deactivating account…" : "Saving account information…"}</p>}
    <div className={styles.formActions}><button ref={cancel} className={panel.button} disabled={busy} onClick={onCancel}>Cancel</button>
      <button className={deactivating ? styles.danger : panel.primary} disabled={busy} onClick={onConfirm}>{deactivating ? "Confirm deactivation" : "Confirm save"}</button></div>
  </dialog>;
}
