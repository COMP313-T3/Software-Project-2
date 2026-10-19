import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/apiClient.ts";
import { formatCalendarDate } from "../../lib/dateFormat.ts";
import type { DiscoveredEventDetails } from "../../lib/discoveryApi.ts";
import {
  displayEventCount, eventDivisionChoices, eventRegistrationStatus, registrationBlockReason, selectableDivision,
  type DivisionChoice, type EventRegistrationSetup,
} from "../../lib/eventRegistration.ts";
import { checkedRegistrationResult, type EventRegistrationInput, type EventRegistrationResult } from "../../lib/eventRegistrationApi.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./EventDetailsContent.module.css";

export type RegisterForEvent = (competitionId: string, input: EventRegistrationInput, signal?: AbortSignal) => Promise<EventRegistrationResult>;
export interface EventDetailsContentProps {
  event: DiscoveredEventDetails;
  setup: EventRegistrationSetup;
  climberId: string;
  register: RegisterForEvent;
  onBusy?: (busy: boolean) => void;
  onDenied?: (error: ApiError) => void;
}
/** US-028 / #107, #108 -> FR-009 -> AC-013. The server owns eligibility and capacity.
 * Unknown eligibility is displayed as unknown and never enables a registration. */
export default function EventDetailsContent(props: EventDetailsContentProps) {
  const { event, setup } = props;
  const status = eventRegistrationStatus(event);
  return <>
    <section className={workspace.panel + " " + styles.hero} aria-label="Competition event details">
      <div className={styles.heading}><div><p className={styles.eyebrow}>{event.gym?.name ?? "Gym unavailable"}</p><h2>{event.name}</h2></div>
        <span className={styles.badge} data-status={status}>Registration {status.toLowerCase()}</span></div>
      {!event.upcoming && <p className={styles.notice}>This competition has already taken place.</p>}
      <div className={styles.description}>{event.description || "No event description has been added yet."}</div>
      <dl className={styles.facts}>
        <div><dt>Date</dt><dd><time dateTime={event.date}>{formatCalendarDate(event.date)}</time></dd></div>
        <div><dt>Time</dt><dd>{setup.timeLabel || "To be announced"}</dd></div>
        <div><dt>Location</dt><dd>{event.location || "Location unavailable"}</dd></div>
        <div><dt>Registration</dt><dd>{status}</dd></div>
        <div><dt>Capacity</dt><dd>{displayEventCount(event.capacity)}</dd></div>
        <div><dt>Spaces left</dt><dd>{displayEventCount(event.spacesLeft)}</dd></div>
        <div><dt>Scoring format</dt><dd>{event.scoringFormat?.label ?? "Not configured"}</dd></div>
      </dl>
    </section>
    <RegistrationChoices {...props} />
  </>;
}

function RegistrationChoices({ event, setup, climberId, register, onBusy, onDenied }: EventDetailsContentProps) {
  const choices = eventDivisionChoices(event, setup);
  const blocked = registrationBlockReason(event, setup, choices);
  const [selectedId, setSelectedId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [saved, setSaved] = useState<EventRegistrationResult | null>(null);
  const request = useRef<AbortController | null>(null);
  const completed = useRef(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusError = useRef(false);
  const alert = useRef<HTMLDivElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const selected = choices.find(choice => choice.divisionId === selectedId);
  useEffect(() => () => { request.current?.abort(); onBusy?.(false); }, [onBusy]);
  useEffect(() => { if (saved) successHeading.current?.focus(); }, [saved]);
  useEffect(() => {
    if (pending || !focusError.current) return;
    focusError.current = false;
    const target = choices.find(selectableDivision);
    if (fieldError && target) inputs.current[target.divisionId]?.focus(); else alert.current?.focus();
  }, [fieldError, message, pending, choices]);
  async function submit(eventObject: FormEvent) {
    eventObject.preventDefault();
    if (request.current || completed.current || blocked || refreshRequired) return;
    setFieldError(""); setMessage("");
    if (!selected || !selectableDivision(selected)) {
      setFieldError("Choose an eligible division to continue."); focusError.current = true; return;
    }
    const controller = new AbortController(); request.current = controller; setPending(true); onBusy?.(true);
    try {
      const response = await register(event._id, { climberId, divisionId: selected.divisionId }, controller.signal);
      if (controller.signal.aborted) return;
      const result = checkedRegistrationResult(response, event._id, selected.divisionId);
      completed.current = true; setSaved(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status) && onDenied) { onDenied(error); return; }
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      setRefreshRequired(uncertain || (error instanceof ApiError && [404, 409].includes(error.status)));
      setFieldError(error instanceof ApiError && typeof error.fields?.divisionId === "string" ? error.fields.divisionId : "");
      setMessage(error instanceof ApiError && error.code === "REGISTRATION_UNAVAILABLE" ? "Registration is temporarily unavailable. Please try again later."
        : uncertain ? "Couldn't confirm your registration. Refresh event details before trying again."
        : error instanceof ApiError ? error.message : "Couldn't register for this competition.");
      focusError.current = true;
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); onBusy?.(false); }
    }
  }
  const alreadyRegistered = event.myRegistration;
  const finished = saved || alreadyRegistered;
  const divisionSection = <section className={workspace.panel} aria-label="Event divisions">
    <h2>Divisions</h2><p className={styles.help}>{finished ? "Competition divisions and their published requirements." : "Choose one available division that you are eligible to enter."}</p>
    {!choices.length ? <p>No divisions have been announced yet.</p>
      : finished ? <ul className={styles.readOnlyDivisions}>{choices.map(choice => <li key={choice.divisionId}><strong>{choice.name}</strong><Requirements choice={choice} /></li>)}</ul>
        : <fieldset className={styles.choices} disabled={pending || Boolean(blocked) || refreshRequired} aria-describedby={fieldError ? "division-selection-error" : undefined}>
          <legend>Choose a division</legend>
          {choices.map(choice => {
            const id = "event-division-" + choice.divisionId;
            const selectable = selectableDivision(choice);
            return <label className={styles.choice} data-disabled={!selectable} data-selected={selectedId === choice.divisionId} key={choice.divisionId} htmlFor={id}>
              <input id={id} ref={element => { inputs.current[choice.divisionId] = element; }} type="radio" name="divisionId" value={choice.divisionId} required aria-labelledby={id + "-name"}
                checked={selectedId === choice.divisionId} disabled={!selectable} aria-invalid={Boolean(fieldError)}
                aria-describedby={id + "-requirements" + (fieldError ? " division-selection-error" : "")}
                onChange={() => { setSelectedId(choice.divisionId); setFieldError(""); setMessage(""); }} />
              <span><strong id={id + "-name"}>{choice.name}</strong><span id={id + "-requirements"}><Requirements choice={choice} />
                {!selectable && <span className={styles.unavailable}>{choice.reason || (choice.eligible === false ? "Not eligible" : choice.available === false ? "Unavailable" : "Eligibility and availability not confirmed")}</span>}
              </span></span>
            </label>;
          })}
        </fieldset>}
    {fieldError && <p id="division-selection-error" className={styles.fieldError}>{fieldError}</p>}
  </section>;
  const savedDivision = saved ? choices.find(choice => choice.divisionId === saved.divisionId)?.name : alreadyRegistered?.division?.name;
  const registrationSection = <section className={workspace.panel} aria-label="Your event registration">
    <h2>Your registration</h2>
    {finished ? <div className={styles.confirmation} data-status={finished.status} role={saved ? "status" : undefined}>
      <h3 ref={successHeading} tabIndex={saved ? -1 : undefined}>{saved ? ({ CONFIRMED: "Registration confirmed", PENDING: "Registration submitted", WAITLIST: "Registration waitlisted" })[saved.status]
        : ({ CONFIRMED: "Confirmed", PENDING: "Pending", WAITLIST: "Waitlisted" })[alreadyRegistered!.status]}</h3>
      <p>Division: {savedDivision ?? "Not assigned"}</p>
      {saved && <p className={styles.help}>Refresh event details to see the latest registration and remaining spaces.</p>}
    </div> : <>
      <p>You aren't registered for this competition.</p>
      {blocked && <p className={styles.notice}>{blocked}</p>}
      {selected && <div className={styles.selection}><span>Selected division</span><strong>{selected.name}</strong></div>}
      {message && <div ref={alert} tabIndex={-1} role="alert" className={styles.error}><p>{message}</p></div>}
      <button type="submit" className={styles.primary} disabled={pending || Boolean(blocked) || refreshRequired}>{pending ? "Registering…" : "Register for competition"}</button>
      {pending && <p role="status" className={styles.help}>Submitting your registration…</p>}
      <p className={styles.help}>{refreshRequired ? "Refresh the page to check whether your registration was saved." : "Your place is confirmed only after registration succeeds."}</p>
    </>}
  </section>;
  return finished ? <div className={styles.columns}>{divisionSection}{registrationSection}</div>
    : <form className={styles.columns} aria-label="Competition registration" aria-busy={pending} noValidate onSubmit={eventObject => void submit(eventObject)}>{divisionSection}{registrationSection}</form>;
}
function Requirements({ choice }: { choice: DivisionChoice }) {
  return <span className={styles.requirements}>{choice.requirements === null ? "Eligibility details are not available yet."
    : choice.requirements.length ? choice.requirements.join(" · ") : "No additional eligibility requirements."}</span>;
}
