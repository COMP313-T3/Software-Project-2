import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import {
  findRequestGyms,
  gymRequestProblem,
  submitGymRequest,
  type GymRequestConfirmation,
  type GymRequestType,
  type RequestGym,
} from "../../lib/gymRequestApi.ts";
import {
  validateGymRequest,
  type GymRequestErrors,
  type GymRequestValues,
} from "../../lib/gymRequestValidation.ts";
import AddressField from "./AddressField.tsx";
import styles from "./AuthForm.module.css";
import type { MapPickerText } from "./MapPickerDialog.tsx";
import ReCaptchaBox, { type ReCaptchaBoxHandle } from "./ReCaptchaBox.tsx";
import StepProgress from "./StepProgress.tsx";

interface GymRequestFormProps {
  /** Class of the heading block, so it matches the other views. */
  introClassName: string;
  /** Changes each time the view is opened from a link in the card, which moves focus into the form. */
  focusRequest?: string | null;
}

type Field = keyof GymRequestErrors;

const INITIAL: GymRequestValues = {
  requestType: "NEW_GYM", firstName: "", lastName: "", email: "", phone: "", jobTitle: "",
  details: "", gymName: "", gymLocation: "", gymId: "",
};

const STEPS = ["Request", "Name and email", "Phone and details", "Your gym", "Send"] as const;
const LAST_STEP = STEPS.length - 1;
const GYM_STEP = 3;

const IDS: Record<Field, string> = {
  requestType: "requestTypeNew", firstName: "requestFirstName", lastName: "requestLastName",
  email: "requestEmail", phone: "requestPhone", jobTitle: "requestJobTitle", details: "requestDetails",
  gymName: "requestGymName", gymLocation: "requestGymAddress", gymId: "requestGym",
  recaptchaToken: "requestRecaptcha",
};

/** The fields each step asks for. The gym step asks for a new gym's name and address, or a registered gym. */
function fieldsOf(step: number, requestType: GymRequestType): Field[] {
  switch (step) {
    case 1: return ["firstName", "lastName", "email"];
    case 2: return ["phone", "jobTitle", "details"];
    case GYM_STEP: return requestType === "NEW_GYM" ? ["gymName", "gymLocation"] : ["gymId"];
    case LAST_STEP: return ["recaptchaToken"];
    default: return [];
  }
}

/**
 * The server's messages for fields this request asks for, so each one shows under its field. A
 * refusal that isn't about a field, such as too many requests, has none.
 *
 * @param error What sending the request threw.
 * @param requestType The kind of request that was sent.
 * @returns The messages, by field.
 */
function fieldProblems(error: unknown, requestType: GymRequestType): GymRequestErrors {
  if (!(error instanceof ApiError) || error.status >= 500 || !error.fields) return {};
  const asked = new Set<string>(STEPS.flatMap((_, step) => fieldsOf(step, requestType)));
  return Object.fromEntries(
    Object.entries(error.fields).filter(([name, message]) => asked.has(name) && typeof message === "string"),
  );
}

const REQUEST_MAP_TEXT: MapPickerText = {
  title: "Choose the gym's location",
  help: "Drag the pin or click the map to fill in the gym's address.",
  pin: "The gym's location. Drag it, or click the map.",
  unavailable: "Google Maps couldn't load. Close this and type the address instead.",
};

const SENDING = "Sending your request...";

/** The registered gyms the existing gym step found, and how the search for them went. */
interface GymList {
  gyms: RequestGym[];
  state: "idle" | "loading" | "ready" | "failed";
  /** The search text they were found for. */
  query: string;
}

/** What the existing gym step says about its search. It's read out each time it changes. */
function searchStatus({ gyms, state, query }: GymList) {
  if (state === "loading") return "Loading the gyms...";
  if (state === "failed") return "Couldn't load the gyms. Try searching again.";
  if (state === "idle") return "";
  if (gyms.length) return gyms.length === 1 ? "1 gym found." : `${gyms.length} gyms found.`;
  return query ? "No gyms match your search. Try another name or street." : "No gyms are on TopSend yet.";
}

/**
 * Request Gym Admin access, a view of the Log in card (US-034): a new gym to register, or a gym
 * already on TopSend to manage, in five short steps with the progress bar Create account uses,
 * so the card keeps its size. Sending it creates a request for a System Administrator to review
 * (US-035), never an account or a role. An answer about a field, such as an email that already has
 * an account, shows under that field on its step. The map only fills in the gym's address, since a
 * request keeps the address and not a pin. The confirmation replaces the form in the card.
 */
export default function GymRequestForm({ introClassName, focusRequest = null }: GymRequestFormProps) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<GymRequestValues>(INITIAL);
  const [errors, setErrors] = useState<GymRequestErrors>({});
  const [search, setSearch] = useState("");
  const [list, setList] = useState<GymList>({ gyms: [], state: "idle", query: "" });
  const [chosenGym, setChosenGym] = useState<RequestGym | null>(null);
  const [token, setToken] = useState("");
  const [refusal, setRefusal] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<GymRequestConfirmation | null>(null);
  const elements = useRef(new Map<Field, HTMLElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const privacyNote = useRef<HTMLParagraphElement>(null);
  const recaptcha = useRef<ReCaptchaBoxHandle>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lookup = useRef<AbortController | null>(null);
  const locked = useRef(false);

  useEffect(() => {
    if (focusRequest) elements.current.get("requestType")?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (sent) heading.current?.focus();
  }, [sent]);

  useEffect(() => () => lookup.current?.abort(), []);

  function inputRef(name: Field) {
    return (el: HTMLElement | null) => {
      if (el) elements.current.set(name, el);
      else elements.current.delete(name);
    };
  }

  function focus(name: Field) {
    if (name === "recaptchaToken") submitButton.current?.focus();
    else elements.current.get(name)?.focus();
  }

  function change<K extends keyof GymRequestValues>(name: K, value: GymRequestValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function loadGyms(text: string) {
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setList({ gyms: [], state: "loading", query: text });
    findRequestGyms(text, controller.signal).then(
      ({ gyms }) => { if (!controller.signal.aborted) setList({ gyms, state: "ready", query: text }); },
      () => { if (!controller.signal.aborted) setList({ gyms: [], state: "failed", query: text }); },
    );
  }

  /** Where focus goes when a step opens: its first control, or the privacy notice that starts the Send step. */
  function startOf(next: number): HTMLElement | null {
    if (next === LAST_STEP) return privacyNote.current;
    if (next === GYM_STEP && values.requestType === "EXISTING_GYM") return searchInput.current;
    return elements.current.get(fieldsOf(next, values.requestType)[0] ?? "requestType") ?? null;
  }

  function goTo(next: number, field?: Field) {
    flushSync(() => {
      setStep(next);
      setRefusal("");
    });
    if (field) focus(field);
    else startOf(next)?.focus();
  }

  function chooseType(requestType: GymRequestType) {
    change("requestType", requestType);
    setErrors({});
    if (requestType === "EXISTING_GYM" && list.state === "idle") loadGyms("");
  }

  /** Shows the messages for these fields and moves to the first step that has one. */
  function showProblems(found: GymRequestErrors) {
    setErrors((current) => ({ ...current, ...found }));
    for (let index = 0; index < STEPS.length; index += 1) {
      const first = fieldsOf(index, values.requestType).find((name) => found[name]);
      if (!first) continue;
      if (index === step) focus(first);
      else goTo(index, first);
      return;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const found = validateGymRequest(values, token);
    if (step < LAST_STEP) {
      const fields = fieldsOf(step, values.requestType);
      const here = Object.fromEntries(fields.filter((name) => found[name]).map((name) => [name, found[name]]));
      if (Object.keys(here).length) {
        showProblems(here);
        return;
      }
      setErrors((current) => ({ ...current, ...Object.fromEntries(fields.map((name) => [name, undefined])) }));
      goTo(step + 1);
      return;
    }
    const shown = Object.fromEntries(STEPS.flatMap((_, index) => fieldsOf(index, values.requestType)).filter((name) => found[name]).map((name) => [name, found[name]]));
    if (Object.keys(shown).length) showProblems(shown);
    else void send();
  }

  async function send() {
    locked.current = true;
    setSending(true);
    setRefusal("");
    const contact = {
      firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(), jobTitle: values.jobTitle.trim(), details: values.details.trim(),
      recaptchaToken: token, website: honeypot.current?.value ?? "",
    };
    let problems: GymRequestErrors = {};
    let refused = "";
    try {
      setSent(await submitGymRequest(values.requestType === "NEW_GYM"
        ? { ...contact, requestType: "NEW_GYM", gymName: values.gymName.trim(), gymLocation: values.gymLocation.trim() }
        : { ...contact, requestType: "EXISTING_GYM", gymId: values.gymId }));
    } catch (error) {
      recaptcha.current?.reset();
      setToken("");
      problems = fieldProblems(error, values.requestType);
      if (!Object.keys(problems).length) refused = gymRequestProblem(error);
    } finally {
      locked.current = false;
    }
    // The Send button is off while sending, which takes focus off it, so focus is only put back
    // once the button is on again: on the field to fix, or on the button.
    flushSync(() => {
      setSending(false);
      setRefusal(refused);
    });
    if (Object.keys(problems).length) showProblems(problems);
    else if (refused) submitButton.current?.focus();
  }

  function searchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadGyms(search.trim());
  }

  function describe(name: Field) {
    return { "aria-describedby": `${IDS[name]}Error`, "aria-invalid": errors[name] ? true : undefined };
  }

  function errorFor(name: Field) {
    return <span className={styles.error} id={`${IDS[name]}Error`}>{errors[name]}</span>;
  }

  function textField(name: "firstName" | "lastName" | "email" | "phone" | "jobTitle" | "gymName", label: string, options: {
    type?: string; autoComplete: string; maxLength: number; inputMode?: "text" | "email" | "tel"; placeholder?: string; optional?: boolean;
  }) {
    return (
      <div className={styles.field}>
        <label htmlFor={IDS[name]}>{label}</label>
        <input
          ref={inputRef(name)}
          id={IDS[name]}
          name={name}
          type={options.type ?? "text"}
          autoComplete={options.autoComplete}
          inputMode={options.inputMode}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          required={!options.optional}
          value={values[name]}
          onChange={(event) => change(name, event.target.value)}
          {...describe(name)}
        />
        {errorFor(name)}
      </div>
    );
  }

  if (sent) {
    return (
      <>
        <div className={introClassName}>
          <h1 id="gymRequestTitle" ref={heading} tabIndex={-1}>Request sent</h1>
          <p>A System Administrator will review it. You don't have Gym Administrator access yet.</p>
        </div>
        <div id="gymRequestForm" className={styles.form}>
          <dl className={styles.facts}>
            <div><dt>Gym</dt><dd>{sent.gym.name}</dd></div>
            <div><dt>Request</dt><dd>{sent.requestType === "NEW_GYM" ? "Register a new gym" : "Manage a gym on TopSend"}</dd></div>
            <div><dt>Email</dt><dd>{sent.contact.email}</dd></div>
          </dl>
          <p className={styles.note}>If it's approved, we'll email you a link to set up your Gym Administrator account.</p>
          <div className={styles.loginFooter}>
            <div className={styles.actions}>
              <Link to="/login" state={{ focusForm: true }} className={styles.primary}>Back to log in</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const gymListed = chosenGym && !list.gyms.some((gym) => gym._id === chosenGym._id) ? [chosenGym, ...list.gyms] : list.gyms;
  const gymPrompt = list.state === "failed" ? "Couldn't load the gyms" : list.state !== "ready" ? "Loading the gyms..." : list.gyms.length ? "Choose your gym" : "No gyms found";

  const stepContent = [
    <div key="request" className={styles.choices} role="radiogroup" aria-labelledby="requestTypeQuestion">
      <p id="requestTypeQuestion" className={styles.question}>What would you like to do?</p>
      {(["NEW_GYM", "EXISTING_GYM"] as const).map((type) => (
        <label key={type} className={styles.choice}>
          <input
            ref={type === values.requestType ? inputRef("requestType") : undefined}
            type="radio"
            name="requestType"
            id={type === "NEW_GYM" ? "requestTypeNew" : "requestTypeExisting"}
            value={type}
            checked={values.requestType === type}
            onChange={() => chooseType(type)}
          />
          <span>
            {type === "NEW_GYM" ? "Register a new gym" : "Manage a gym on TopSend"}
            <small>{type === "NEW_GYM" ? "My gym isn't on TopSend yet." : "My gym is already on TopSend."}</small>
          </span>
        </label>
      ))}
    </div>,
    <>
      <div className={styles.row}>
        {textField("firstName", "First name", { autoComplete: "given-name", maxLength: 50 })}
        {textField("lastName", "Last name", { autoComplete: "family-name", maxLength: 50 })}
      </div>
      {textField("email", "Email", { type: "email", autoComplete: "email", inputMode: "email", maxLength: 254, placeholder: "you@example.com" })}
    </>,
    <>
      <div className={styles.row}>
        {textField("phone", "Phone number", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 30, placeholder: "416 555 0123" })}
        {textField("jobTitle", "Job title (optional)", { autoComplete: "organization-title", maxLength: 100, placeholder: "Owner", optional: true })}
      </div>
      <div className={`${styles.field} ${styles.fill}`}>
        <label htmlFor={IDS.details}>Additional information (optional)</label>
        <textarea
          ref={inputRef("details")}
          id={IDS.details}
          name="details"
          maxLength={1000}
          placeholder="Anything that helps us review your request"
          value={values.details}
          onChange={(event) => change("details", event.target.value)}
          {...describe("details")}
        />
        {errorFor("details")}
      </div>
    </>,
    values.requestType === "NEW_GYM" ? (
      <>
        {textField("gymName", "Gym name", { autoComplete: "organization", maxLength: 100 })}
        <AddressField
          id={IDS.gymLocation}
          label="Gym address"
          value={values.gymLocation}
          onChange={(text) => change("gymLocation", text)}
          onPinned={({ address }) => { if (address) change("gymLocation", address); }}
          location={null}
          mapNeedsAddress
          error={errors.gymLocation}
          inputRef={inputRef("gymLocation")}
          inputProps={{ placeholder: "Start typing the gym's address", autoComplete: "off", maxLength: 200 }}
          mapText={REQUEST_MAP_TEXT}
        />
      </>
    ) : (
      <>
        <div className={styles.field}>
          <label htmlFor="requestGymSearch">Search by gym name or address</label>
          <div className={styles.searchRow}>
            <input
              ref={searchInput}
              id="requestGymSearch"
              type="search"
              maxLength={100}
              placeholder="Name or street"
              value={search}
              aria-describedby="requestGymSearchStatus"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={searchKeyDown}
            />
            <button type="button" className={styles.secondary} onClick={() => loadGyms(search.trim())}>Search</button>
          </div>
          <p className={styles.note} id="requestGymSearchStatus" role="status">{searchStatus(list)}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={IDS.gymId}>Your gym</label>
          <div className={styles.select}>
            <select
              ref={inputRef("gymId")}
              id={IDS.gymId}
              name="gymId"
              required
              data-empty={!values.gymId}
              value={values.gymId}
              onChange={(event) => {
                change("gymId", event.target.value);
                setChosenGym(gymListed.find((gym) => gym._id === event.target.value) ?? null);
              }}
              aria-describedby={`requestGymSearchStatus ${IDS.gymId}Error`}
              aria-invalid={errors.gymId ? true : undefined}
            >
              <option value="" disabled>{gymPrompt}</option>
              {gymListed.map((gym) => <option key={gym._id} value={gym._id}>{gym.name}, {gym.location}</option>)}
            </select>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
          </div>
          {errorFor("gymId")}
        </div>
      </>
    ),
    <>
      <p ref={privacyNote} className={styles.note} tabIndex={-1}>
        We use your contact details to review this request and, if it's approved, to email you a link to set up your account. <Link to="/privacy">Privacy Policy</Link>
      </p>
      <div className={styles.field} id={IDS.recaptchaToken}>
        <ReCaptchaBox ref={recaptcha} onTokenChange={(next) => { setToken(next); if (next) setErrors((current) => ({ ...current, recaptchaToken: undefined })); }} />
        <span className={styles.error} id={`${IDS.recaptchaToken}Error`} role="alert">{errors.recaptchaToken}</span>
      </div>
    </>,
  ];

  return (
    <>
      <div className={introClassName}>
        <p className={styles.backLink}><Link to="/login" state={{ focusForm: true }}>Back to log in</Link></p>
        <h1 id="gymRequestTitle" ref={heading} tabIndex={-1}>Request Gym Admin access</h1>
        <p>No account needed to apply.</p>
      </div>
      <form
        id="gymRequestForm"
        className={`${styles.form} ${styles.flowErrors}`}
        aria-labelledby="gymRequestTitle"
        aria-busy={sending}
        noValidate
        onSubmit={onSubmit}
      >
        <StepProgress steps={STEPS} current={step} />
        <div className={`${styles.steps} ${styles.fill}`}>
          {stepContent.map((content, index) => (
            <fieldset
              key={STEPS[index]}
              className={styles.step}
              data-active={index === step}
              inert={index !== step}
              aria-hidden={index !== step || undefined}
            >
              <legend className={styles.visuallyHidden}>{STEPS[index]}</legend>
              {content}
            </fieldset>
          ))}
        </div>
        <div className={styles.hp} aria-hidden="true">
          <label htmlFor="requestWebsite">Website</label>
          <input ref={honeypot} id="requestWebsite" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <p className={styles.status} role="status">{sending ? SENDING : refusal}</p>
        <div className={styles.actions} data-first={step === 0}>
          {step > 0 && <button type="button" className={styles.secondary} onClick={() => goTo(step - 1)}>Back</button>}
          <button ref={submitButton} type="submit" className={styles.primary} disabled={sending}>
            {step < LAST_STEP ? "Next" : sending ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </>
  );
}
