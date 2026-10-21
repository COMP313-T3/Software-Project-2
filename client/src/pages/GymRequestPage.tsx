import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/brand/topsend-logo.png";
import ReCaptchaBox, { type ReCaptchaBoxHandle } from "../components/auth/ReCaptchaBox.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { findRequestGyms, gymRequestProblem, submitGymRequest, type GymRequestConfirmation, type RequestGym } from "../lib/gymRequestApi.ts";
import { validateGymRequest, type GymRequestErrors, type GymRequestValues } from "../lib/gymRequestValidation.ts";
import styles from "./GymRequestPage.module.css";

const INITIAL: GymRequestValues = { requestType: "NEW_GYM", firstName: "", lastName: "", email: "", phone: "", jobTitle: "", details: "", gymName: "", gymLocation: "", gymId: "" };
const LABELS: Record<string, string> = { firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone number", jobTitle: "Job title (optional)", details: "Additional information (optional)", gymName: "Gym name", gymLocation: "Gym address", gymId: "Existing gym", recaptchaToken: "Robot check" };

/** Visitor-only onboarding flow; submission never signs in or assigns a role. */
export default function GymRequestPage() {
  const [values, setValues] = useState<GymRequestValues>(INITIAL);
  const [errors, setErrors] = useState<GymRequestErrors>({});
  const [problem, setProblem] = useState("");
  const [errorRevision, setErrorRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [token, setToken] = useState("");
  const [website, setWebsite] = useState("");
  const captcha = useRef<ReCaptchaBoxHandle>(null);
  const summary = useRef<HTMLDivElement>(null);
  const confirmationTitle = useRef<HTMLHeadingElement>(null);
  const [confirmation, setConfirmation] = useState<GymRequestConfirmation | null>(null);
  const [selected, setSelected] = useState<RequestGym | null>(null);

  // Editing one invalid field must not move focus away while other errors still remain.
  useEffect(() => { if (errorRevision > 0) summary.current?.focus(); }, [errorRevision]);
  useEffect(() => { if (confirmation) confirmationTitle.current?.focus(); }, [confirmation]);

  function update<K extends keyof GymRequestValues>(key: K, value: GymRequestValues[K]) {
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
  }
  function field(key: Exclude<keyof GymRequestValues, "requestType" | "gymId">, maxLength: number, type = "text", autoComplete?: string) {
    const shared = { id: key, name: key, value: values[key], maxLength, autoComplete, disabled: pending,
      "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `${key}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value) };
    return <div className={styles.field}><label htmlFor={key}>{LABELS[key]}</label>
      {key === "details" ? <textarea {...shared} /> : <input {...shared} type={type} required={!["jobTitle", "details"].includes(key)} />}
      {errors[key] && <p className={styles.error} id={`${key}-error`}>{errors[key]}</p>}</div>;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const nextErrors = validateGymRequest(values, token); setErrors(nextErrors); setProblem("");
    if (Object.keys(nextErrors).length) { setErrorRevision(value => value + 1); return; }
    locked.current = true; setPending(true);
    const contact = { firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim().toLowerCase(), phone: values.phone.trim(), jobTitle: values.jobTitle.trim(), details: values.details.trim(), recaptchaToken: token, website };
    try {
      const result = await submitGymRequest(values.requestType === "NEW_GYM"
        ? { ...contact, requestType: "NEW_GYM", gymName: values.gymName.trim(), gymLocation: values.gymLocation.trim() }
        : { ...contact, requestType: "EXISTING_GYM", gymId: values.gymId });
      setConfirmation(result);
    } catch (error) {
      setProblem(gymRequestProblem(error));
      setErrorRevision(value => value + 1);
      if (error instanceof ApiError && error.status < 500 && error.fields) {
        const visible = new Set(["firstName", "lastName", "email", "phone", "jobTitle", "details", "recaptchaToken", ...(values.requestType === "NEW_GYM" ? ["gymName", "gymLocation"] : ["gymId"])]);
        setErrors(Object.fromEntries(Object.entries(error.fields).filter(([key, message]) => visible.has(key) && typeof message === "string")));
      }
      captcha.current?.reset(); setToken("");
    } finally { locked.current = false; setPending(false); }
  }

  return <div className={styles.page}><title>Request Gym Administrator Access | TopSend</title>
    <header className={styles.header}><Link to="/" aria-label="TopSend home"><img src={logo} alt="TopSend" /></Link><Link to="/login">Back to log in</Link></header>
    <main className={styles.main}>
      {confirmation ? <section className={`${styles.panel} ${styles.confirmation}`} aria-labelledby="request-submitted">
        <span className={styles.badge}>Pending review</span>
        <h1 id="request-submitted" ref={confirmationTitle} tabIndex={-1}>Your request has been submitted</h1>
        <p>A System Administrator will review your request. Gym Administrator access has not been granted yet.</p>
        <dl><div><dt>Gym</dt><dd>{confirmation.gym.name}</dd></div><div><dt>Request type</dt><dd>{confirmation.requestType === "NEW_GYM" ? "Register a new gym" : "Access an existing gym"}</dd></div><div><dt>Contact email</dt><dd>{confirmation.contact.email}</dd></div></dl>
        <p className={styles.hint}>If approved, you'll receive instructions by email to complete your Gym Administrator account setup.</p>
        <div className={styles.actions}><Link className={styles.primary} to="/">Return to home</Link></div>
      </section> : <><p className={styles.eyebrow}>Bring your gym to TopSend</p><h1>Request Gym Administrator access</h1>
        <p className={styles.intro}>Register a new climbing gym or request access to one already on TopSend. Every request is reviewed before access is granted. No account or password is needed to apply.</p>
        <form className={`${styles.panel} ${styles.form}`} onSubmit={submit} noValidate aria-busy={pending}>
          {(problem || Object.keys(errors).length > 0) && <div className={styles.summary} ref={summary} tabIndex={-1} role="alert"><p>{problem || "Check the following fields before submitting."}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([key, message]) => <li key={key}><a href={`#${key === "recaptchaToken" ? "robot-check" : key}`} onClick={event => { event.preventDefault(); document.getElementById(key === "recaptchaToken" ? "robot-check" : key)?.focus(); }}>{LABELS[key]}: {message}</a></li>)}</ul>}</div>}
          <fieldset disabled={pending}><legend>What would you like to request?</legend><div className={styles.choices}>
            {(["NEW_GYM", "EXISTING_GYM"] as const).map(type => <label className={styles.choice} key={type}><input type="radio" name="requestType" value={type} checked={values.requestType === type} onChange={() => { update("requestType", type); setErrors({}); setProblem(""); }} /><span>{type === "NEW_GYM" ? "New gym" : "Existing gym"}<small>{type === "NEW_GYM" ? "My gym isn't registered on TopSend." : "I'd like to manage a registered gym."}</small></span></label>)}
          </div></fieldset>
          <fieldset><legend>Your contact information</legend><div className={styles.fields}><div className={styles.row}>{field("firstName", 50, "text", "given-name")}{field("lastName", 50, "text", "family-name")}</div><div className={styles.row}>{field("email", 254, "email", "email")}{field("phone", 30, "tel", "tel")}</div>{field("jobTitle", 100, "text", "organization-title")}</div></fieldset>
          <fieldset><legend>{values.requestType === "NEW_GYM" ? "Your gym" : "Find your registered gym"}</legend>
            {values.requestType === "NEW_GYM" ? <div className={styles.fields}>{field("gymName", 100, "text", "organization")}{field("gymLocation", 200, "text", "street-address")}</div>
              : <GymLookup selected={selected} disabled={pending} error={errors.gymId} onSelect={gym => { setSelected(gym); update("gymId", gym._id); }} />}
          </fieldset>
          {field("details", 1000)}
          <div id="robot-check" tabIndex={-1}><ReCaptchaBox ref={captcha} onTokenChange={next => {
            setToken(next);
            if (next) setErrors(previous => { const remaining = { ...previous }; delete remaining.recaptchaToken; return remaining; });
          }} />{errors.recaptchaToken && <p className={styles.error}>{errors.recaptchaToken}</p>}</div>
          <div className={styles.honeypot} aria-hidden="true"><label htmlFor="request-website">Website</label><input id="request-website" name="website" value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></div>
          <p className={styles.hint}>We'll use your contact information to review this request and send account setup instructions if approved. <Link to="/privacy">Privacy policy</Link></p>
          <div className={styles.actions}><button className={styles.primary} type="submit" disabled={pending}>{pending ? "Submitting request…" : "Submit request for review"}</button><Link to="/">Cancel</Link></div>
          {pending && <p role="status" className={styles.hint}>Submitting your request. Please wait.</p>}
        </form></>}
    </main>
  </div>;
}

function GymLookup({ selected, disabled, error, onSelect }: { selected: RequestGym | null; disabled: boolean; error?: string; onSelect: (gym: RequestGym) => void }) {
  const [query, setQuery] = useState(""); const [search, setSearch] = useState({ text: "", revision: 0 });
  const [state, setState] = useState<{ gyms: RequestGym[]; loading: boolean; failed: boolean }>({ gyms: [], loading: true, failed: false });
  useEffect(() => {
    const controller = new AbortController();
    findRequestGyms(search.text, controller.signal).then(data => { if (!controller.signal.aborted) setState({ gyms: data.gyms, loading: false, failed: false }); }).catch(() => { if (!controller.signal.aborted) setState({ gyms: [], loading: false, failed: true }); });
    return () => controller.abort();
  }, [search]);
  function load() { setState(previous => ({ ...previous, loading: true, failed: false })); setSearch({ text: query.trim(), revision: search.revision + 1 }); }
  return <div className={styles.fields}>
    <div className={styles.field}><label htmlFor="gym-search">Search by gym name or address</label><input id="gym-search" value={query} maxLength={100} disabled={disabled} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); load(); } }} /></div>
    <div><button type="button" className={styles.secondary} onClick={load} disabled={disabled || state.loading}>Search gyms</button></div>
    {selected && <p className={styles.selected}>Selected: <strong>{selected.name}</strong> — {selected.location}</p>}
    <div id="gymId" tabIndex={-1} aria-invalid={!!error} aria-describedby={error ? "gymId-error" : undefined}>
      {state.loading ? <p role="status">Loading registered gyms…</p> : state.failed ? <div role="alert"><p>Couldn't load registered gyms. Your contact information is still here.</p><button type="button" className={styles.secondary} onClick={load} disabled={disabled}>Try loading gyms again</button></div>
        : state.gyms.length ? <><p className={styles.hint}>Choose your gym below. Search more specifically if it isn't listed.</p><ul className={styles.results} aria-label="Registered gyms">{state.gyms.map(gym => <li key={gym._id}><button type="button" className={styles.result} aria-label={`${gym.name}, ${gym.location}`} aria-pressed={selected?._id === gym._id} disabled={disabled} onClick={() => onSelect(gym)}>{gym.name}<span>{gym.location}</span></button></li>)}</ul></>
          : <p role="status">No registered gyms found. Try another name or address, or choose New gym if yours isn't registered.</p>}
    </div>{error && <p className={styles.error} id="gymId-error">{error}</p>}
  </div>;
}
