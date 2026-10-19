import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EventDetailsContent, { type RegisterForEvent } from "../components/discovery/EventDetailsContent.tsx";
import theme from "../components/layout/theme.module.css";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import { ApiError } from "../lib/apiClient.ts";
import type { DiscoveredEventDetails } from "../lib/discoveryApi.ts";
import type { EventRegistrationSetup } from "../lib/eventRegistration.ts";
import styles from "./EventRegistrationPreview.module.css";

const scenarios = [
  ["open", "Open registration"], ["closed", "Closed registration"], ["full", "Full competition"],
  ["registered", "Already registered"], ["ineligible", "No eligible divisions"],
  ["unknown", "Backend information pending"], ["empty", "No divisions"],
  ["loading", "Loading event"], ["load-error", "Event load error"], ["submit-error", "Registration error"],
] as const;
type Scenario = typeof scenarios[number][0];
const eventId = "507f1f77bcf86cd799439011";
const divisionIds = ["507f1f77bcf86cd799439021", "507f1f77bcf86cd799439022", "507f1f77bcf86cd799439023"];

function sample(scenario: Scenario): { event: DiscoveredEventDetails; setup: EventRegistrationSetup } {
  const event: DiscoveredEventDetails = {
    _id: eventId, name: "TopSend Preview Open", gym: { _id: "507f1f77bcf86cd799439012", name: "Sample Climbing Gym" },
    date: "2026-11-14", location: "100 Example Street, Toronto, Ontario",
    description: "A sample bouldering event for trying the new frontend. Review the event information, choose a division, and test the registration flow without creating a real registration.",
    registrationStatus: "OPEN", capacity: 80, spacesLeft: 16, full: false, coordinates: null,
    upcoming: true, registrationAvailable: true, scoringFormat: { format: "TOPS", label: "Tops and zones" }, myRegistration: null,
    divisions: divisionIds.map((_id, index) => ({ _id, name: ["Open division", "Youth division", "Limited division"][index] })),
  };
  const setup: EventRegistrationSetup = {
    ready: true, timeLabel: "10:00 a.m. (Toronto time)",
    divisions: [
      { divisionId: divisionIds[0], requirements: ["All abilities welcome", "Age 18 or older (sample rule)"], eligible: true, available: true },
      { divisionId: divisionIds[1], requirements: ["Under 18 (sample rule)"], eligible: false, available: true, reason: "Not eligible in this sample response" },
      { divisionId: divisionIds[2], requirements: [], eligible: true, available: false, reason: "No places left in this sample division" },
    ],
  };
  if (scenario === "closed") { event.registrationStatus = "CLOSED"; event.registrationAvailable = false; }
  if (scenario === "full") { event.spacesLeft = 0; event.full = true; event.registrationAvailable = false; }
  if (scenario === "registered") event.myRegistration = { status: "CONFIRMED", registeredAt: "2026-10-18T12:00:00Z", division: event.divisions[0] };
  if (scenario === "ineligible") setup.divisions = setup.divisions.map(division => ({ ...division, eligible: false, reason: "Not eligible in this sample response" }));
  if (scenario === "unknown") { setup.ready = false; setup.timeLabel = null; setup.divisions = setup.divisions.map(division => ({ ...division, eligible: null, available: null, requirements: null, reason: undefined })); }
  if (scenario === "empty") { event.divisions = []; setup.divisions = []; event.registrationAvailable = false; }
  return { event, setup };
}

/** Visual fixture harness only; no session, API, external keys or database is used. */
export default function EventRegistrationPreview() {
  const [search, setSearch] = useSearchParams();
  const scenario = scenarios.find(([key]) => key === search.get("scenario"))?.[0] ?? "open";
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const { event, setup } = sample(scenario);
  const register: RegisterForEvent = async (competitionId, input, signal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 700);
      signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Preview cancelled", "AbortError")); }, { once: true });
    });
    if (scenario === "submit-error") throw new ApiError(400, "VALIDATION_ERROR", "Sample registration rejected. Choose another division or reload the preview.", { divisionId: "This is a sample validation error for the selected division." });
    return { registrationId: "preview-only-registration", competitionId, divisionId: input.divisionId, status: "CONFIRMED" };
  };
  return <div className={theme.theme + " " + styles.page}>
    <title>Event Registration Frontend Preview | TopSend</title>
    <header className={styles.header}><strong>TopSend</strong><Link to="/login">Back to app</Link></header>
    <main className={styles.content}>
      <h1>Event registration preview</h1>
      <div className={styles.banner} role="note"><strong>Frontend preview — sample data only.</strong>
        <p>Nothing is sent to the API or saved to MongoDB. Eligibility messages are examples, not real competition rules.</p></div>
      <div className={styles.toolbar}><label htmlFor="preview-scenario">Preview scenario</label>
        <select id="preview-scenario" value={scenario} onChange={eventObject => setSearch({ scenario: eventObject.target.value }, { replace: true })}>
          {scenarios.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button type="button" className={workspace.secondary} disabled={busy} onClick={() => setRevision(value => value + 1)}>Reload preview</button>
      </div>
      {scenario === "loading" ? <p className={workspace.panel} role="status">Loading event details…</p>
        : scenario === "load-error" ? <section className={workspace.panel} role="alert"><h2>Event unavailable</h2><p>Sample loading error. Choose Open registration to return to the form.</p></section>
          : <EventDetailsContent key={scenario + ":" + revision} event={event} setup={setup} climberId="preview-climber" register={register} onBusy={setBusy} />}
    </main>
  </div>;
}
