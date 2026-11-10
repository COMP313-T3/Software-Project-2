import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import { ApiError } from "../lib/apiClient.ts";
import {
  askClimberAssistant,
  climberAssistantProblem,
  climberQuestionProblem,
  getClimberAssistant,
  type ClimberAssistantAnswer,
  type ClimberAssistantAvailability,
  type ClimberAssistantData,
  type RouteToTry,
} from "../lib/climberAssistantApi.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { ordinal, pointsText } from "../lib/leaderboardText.ts";
import { assistantAccessLost, normalizeRouteQuestion } from "../lib/routeAssistantApi.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./ClimberAssistantPage.module.css";

const SUGGESTED_QUESTIONS = [
  "Which route should I try next?",
  "How many points do I need to reach the next place?",
  "How far am I from 1st place?",
];
const FINISHED_QUESTIONS = ["How far was I from 1st place?", "How many points did I need for the next place?"];

type Availability =
  | { status: "ready"; data: ClimberAssistantAvailability }
  | { status: "error"; message: string; retry: boolean; signIn: boolean };

type Reply =
  | { status: "idle" | "pending" }
  | { status: "error"; message: string; field: boolean }
  | { status: "answered"; data: ClimberAssistantAnswer };

/**
 * The Climber AI Route Assistant for one of the Climber's competitions (US-033 #33.2). The Climber
 * asks which route to try next or how far they are from a place, and gets the AI's explanation with
 * the routes it recommends. Every answer comes from the Climber's official results, the route
 * statistics, and the current standings, which the page shows too. Opened from the competition's
 * tools in My Events.
 *
 * @param returnTo Where "Back to my event" goes.
 */
export default function ClimberAssistantPage({ returnTo }: { returnTo: string }) {
  const { competitionId = "" } = useParams();
  const id = competitionId.toLowerCase();
  return (
    <AppLayout title="AI Route Assistant">
      <AssistantWorkspace key={id} competitionId={id} returnTo={returnTo} />
    </AppLayout>
  );
}

function AssistantWorkspace({ competitionId, returnTo }: { competitionId: string; returnTo: string }) {
  const [revision, setRevision] = useState(0);
  const [checked, setChecked] = useState<{
    revision: number;
    result: Availability;
  }>();
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<Reply>({ status: "idle" });
  const active = useRef<AbortController | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const loading = checked?.revision !== revision;
  const availability = checked?.result;
  const data = availability?.status === "ready" ? availability.data : undefined;
  const pending = reply.status === "pending";
  const value = normalizeRouteQuestion(question);
  const invalid = data ? climberQuestionProblem(value, data.limits.questionMaxLength) : "";
  const fieldError = reply.status === "error" && reply.field ? reply.message : "";
  const questionError = (value && invalid) || fieldError;
  const answer = reply.status === "answered" ? reply.data : undefined;

  useEffect(() => {
    const controller = new AbortController();
    getClimberAssistant(competitionId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setChecked({ revision, result: { status: "ready", data: result } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setChecked({
          revision,
          result: {
            status: "error",
            message: climberAssistantProblem(error, "load"),
            retry: !assistantAccessLost(error),
            signIn: error instanceof ApiError && error.status === 401,
          },
        });
      });
    return () => controller.abort();
  }, [competitionId, revision]);

  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    if (reply.status === "answered" || (reply.status === "error" && !reply.field)) answerHeading.current?.focus();
    else if (reply.status === "error") field.current?.focus();
  }, [reply]);

  function refresh() {
    if (active.current) return;
    setReply({ status: "idle" });
    setRevision((current) => current + 1);
  }

  function suggest(text: string) {
    setQuestion(text);
    if (reply.status === "error" && reply.field) setReply({ status: "idle" });
    field.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.canAsk || loading || invalid || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setReply({ status: "pending" });
    try {
      const result = await askClimberAssistant(competitionId, value, controller.signal);
      if (controller.signal.aborted) return;
      setReply({ status: "answered", data: result });
      setChecked({
        revision,
        result: {
          status: "ready",
          data: {
            ...data,
            competition: result.competition,
            notice: result.notice,
            basedOn: result.basedOn,
          },
        },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = climberAssistantProblem(error, "ask");
      if (assistantAccessLost(error)) {
        setChecked({
          revision,
          result: {
            status: "error",
            message,
            retry: false,
            signIn: error instanceof ApiError && error.status === 401,
          },
        });
        setQuestion("");
        setReply({ status: "idle" });
        return;
      }
      const fieldMessage =
        error instanceof ApiError && error.status === 400 && typeof error.fields?.question === "string"
          ? error.fields.question
          : "";
      setReply({
        status: "error",
        message: fieldMessage || message,
        field: Boolean(fieldMessage),
      });
      // A 409 means the Climber can't ask anymore, such as after a cancellation, so the page reloads why.
      if (error instanceof ApiError && error.status === 409) setRevision((current) => current + 1);
    } finally {
      active.current = null;
    }
  }

  return (
    <div className={styles.content}>
      <title>{data ? `${data.competition.name} Route Assistant | TopSend` : "AI Route Assistant | TopSend"}</title>
      <div className={workspace.intro}>
        <div>
          <Link className={workspace.back} to={returnTo}>
            Back to my event
          </Link>
          <p className={styles.help}>
            Ask which route to try next, or how many points separate you from a place. Answers use your official
            results, the route statistics and the current standings.
          </p>
        </div>
        {data && (
          <button type="button" className={workspace.secondary} disabled={pending || loading} onClick={refresh}>
            {loading ? "Refreshing standings…" : "Refresh standings"}
          </button>
        )}
      </div>
      {!availability && (
        <p className={workspace.panel} role="status">
          Loading the Route Assistant…
        </p>
      )}
      {availability?.status === "error" && (
        <section className={workspace.panel} role="alert">
          <h2>Route Assistant unavailable</h2>
          <p>{availability.message}</p>
          <div className={styles.actions}>
            {availability.signIn && (
              <Link className={workspace.secondary} to="/login">
                Sign in
              </Link>
            )}
            {availability.retry && (
              <button type="button" className={workspace.secondary} disabled={loading} onClick={refresh}>
                {loading ? "Trying again…" : "Try again"}
              </button>
            )}
          </div>
        </section>
      )}
      {data && (
        <>
          <p role="status" className={workspace.visuallyHidden}>
            {pending ? "Working on your answer." : answer ? "An answer is ready." : ""}
          </p>
          <div className={styles.overview}>
            <CompetitionPanel availability={data} />
            <StandingPanel data={data.basedOn} />
          </div>
          <section className={`${workspace.panel} ${styles.panel}`} aria-labelledby="assistant-question-heading">
            <h2 id="assistant-question-heading">Ask the Route Assistant</h2>
            {data.canAsk ? (
              <form className={styles.form} onSubmit={submit}>
                <p className={styles.muted} id="assistant-suggestions-label">
                  Start with a suggestion, or write your own question.
                </p>
                <div className={styles.suggestions} role="group" aria-labelledby="assistant-suggestions-label">
                  {(data.basedOn.competition.finished ? FINISHED_QUESTIONS : SUGGESTED_QUESTIONS).map((text) => (
                    <button
                      type="button"
                      key={text}
                      className={styles.suggestion}
                      disabled={pending}
                      onClick={() => suggest(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <label htmlFor="assistant-question">Your question</label>
                <p className={styles.muted} id="assistant-question-help">
                  Ask about your routes or your place. Leave out personal information. You can ask{" "}
                  {data.limits.questionsPerHour} questions an hour.
                </p>
                <textarea
                  id="assistant-question"
                  ref={field}
                  value={question}
                  required
                  maxLength={data.limits.questionMaxLength}
                  rows={3}
                  readOnly={pending}
                  aria-invalid={Boolean(questionError)}
                  aria-describedby={`assistant-question-help assistant-question-count${questionError ? " assistant-question-error" : ""}`}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    if (fieldError) setReply({ status: "idle" });
                  }}
                />
                <div className={styles.formFooter}>
                  <p className={styles.muted} id="assistant-question-count">
                    {question.length} of {data.limits.questionMaxLength} characters
                  </p>
                  <button
                    type="submit"
                    className={`${workspace.primary} ${styles.submit}`}
                    disabled={Boolean(invalid) || pending || loading}
                  >
                    {pending ? "Asking…" : "Ask assistant"}
                  </button>
                </div>
                {questionError && (
                  <p
                    className={styles.fieldError}
                    id="assistant-question-error"
                    role={fieldError ? "alert" : undefined}
                  >
                    {questionError}
                  </p>
                )}
              </form>
            ) : (
              <div className={styles.unavailable} role="status">
                <p>
                  <strong>You can't ask about this competition right now.</strong>
                </p>
                <ul>
                  {data.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {!answer && <p className={styles.notice}>{data.notice}</p>}
          </section>
          {(pending || answer || (reply.status === "error" && !reply.field)) && (
            <section className={`${workspace.panel} ${styles.panel}`} aria-labelledby="assistant-answer-heading">
              <h2 id="assistant-answer-heading" ref={answerHeading} tabIndex={-1}>
                The assistant's answer
              </h2>
              {pending && (
                <p className={styles.muted}>Working on your answer from your results and the current standings…</p>
              )}
              {reply.status === "error" && (
                <div role="alert" className={styles.error}>
                  <p>{reply.message}</p>
                </div>
              )}
              {answer && <Answer answer={answer} />}
            </section>
          )}
          <Sources data={data.basedOn} />
        </>
      )}
    </div>
  );
}

function CompetitionPanel({ availability }: { availability: ClimberAssistantAvailability }) {
  const { competition, basedOn } = availability;
  const { scoring } = basedOn;
  return (
    <section className={workspace.panel} aria-labelledby="assistant-competition">
      <p className={styles.eyebrow}>Route Assistant for</p>
      <h2 id="assistant-competition">{competition.name}</h2>
      <dl className={styles.details}>
        <div>
          <dt>Date</dt>
          <dd>{formatCalendarDate(competition.date)}</dd>
        </div>
        <div>
          <dt>Gym</dt>
          <dd>{competition.gym?.name ?? "Gym unavailable"}</dd>
        </div>
      </dl>
      <p className={styles.help}>
        {scoring
          ? `Scoring: a top earns the route's points, less ${scoring.deductionPercent}% for each failed attempt before it, within ${scoring.maxAttempts} ${scoring.maxAttempts === 1 ? "attempt" : "attempts"}.`
          : "The gym hasn't set up scoring for this competition yet."}
      </p>
      {basedOn.competition.finished && (
        <p className={styles.note}>
          This competition is over, so there are no routes left to try. You can still ask about your final standing.
        </p>
      )}
    </section>
  );
}

function gapLines({ you, placesAbove }: ClimberAssistantData) {
  if (!you) return [];
  if (you.place === 1) return [you.tied ? "You share 1st place." : "You're in the lead."];
  const lines = [`${pointsText(you.pointsBehindLeader)} behind 1st place.`];
  const nearest = placesAbove.toSorted((a, b) => b.place - a.place)[0];
  if (nearest && nearest.place > 1)
    lines.push(`${pointsText(nearest.pointsToTie)} behind ${ordinal(nearest.place)} place.`);
  return lines;
}

function StandingPanel({ data }: { data: ClimberAssistantData }) {
  const { you } = data;
  return (
    <section className={workspace.panel} aria-labelledby="assistant-standing">
      <h2 id="assistant-standing">Your standing now</h2>
      {you ? (
        <>
          <p className={styles.place}>
            <strong>
              {ordinal(you.place)} place{you.tied ? " (shared)" : ""}
            </strong>{" "}
            in {you.division}, of {you.climbersInDivision} {you.climbersInDivision === 1 ? "Climber" : "Climbers"}
          </p>
          <dl className={styles.totals}>
            <div>
              <dt>Points</dt>
              <dd>{you.totalScore}</dd>
            </div>
            <div>
              <dt>Topped</dt>
              <dd>{you.routesTopped}</dd>
            </div>
            <div>
              <dt>Flashes</dt>
              <dd>{you.flashes}</dd>
            </div>
            <div>
              <dt>Left to score on</dt>
              <dd>{data.routesToTry.length}</dd>
            </div>
          </dl>
          <ul className={styles.gaps}>
            {gapLines(data).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.help}>You're not in the standings yet. Only Climbers with a confirmed place are ranked.</p>
      )}
    </section>
  );
}

function routeName(route: { route: string; name?: string; grade: string }) {
  return `Route ${route.route}${route.name ? `, ${route.name}` : ""} (${route.grade})`;
}

const formatNumber = (value: number | null, unit = "") =>
  value === null ? "No data" : `${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })}${unit}`;

function sampleText(route: RouteToTry, minimum: number) {
  const climbers = route.climbersWithResults;
  if (climbers === 0) return "No Climber has a result on this route yet.";
  const counted = `${climbers} ${climbers === 1 ? "Climber's result" : "Climbers' results"}`;
  return climbers < minimum ? `Only ${counted} so far, too few to compare reliably.` : `From ${counted}.`;
}

function RouteCard({ route, minimum }: { route: RouteToTry; minimum: number }) {
  return (
    <li className={styles.route}>
      <h4>{routeName(route)}</h4>
      <p className={styles.points}>{pointsText(route.pointsIfToppedNextAttempt)} if you top it on your next attempt</p>
      <dl>
        <div>
          <dt>Attempts left</dt>
          <dd>{route.attemptsLeft}</dd>
        </div>
        <div>
          <dt>Topped by</dt>
          <dd>{formatNumber(route.completionRatePercent, "%")}</dd>
        </div>
        <div>
          <dt>Average attempts</dt>
          <dd>{formatNumber(route.averageAttempts)}</dd>
        </div>
        <div>
          <dt>Flash rate</dt>
          <dd>{formatNumber(route.flashRatePercent, "%")}</dd>
        </div>
      </dl>
      <p className={styles.muted}>{sampleText(route, minimum)}</p>
    </li>
  );
}

function Answer({ answer }: { answer: ClimberAssistantAnswer }) {
  const paragraphs = answer.answer.split(/\n{2,}/).filter((paragraph) => paragraph.trim());
  return (
    <>
      <p className={styles.asked}>
        <strong>You asked:</strong> {answer.question}
      </p>
      <div className={styles.answer}>
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {answer.truncated && (
        <p className={styles.notice}>This answer was cut short. Ask a more specific question for more detail.</p>
      )}
      {answer.recommendedRoutes.length > 0 && (
        <div className={styles.recommended}>
          <h3>{answer.recommendedRoutes.length === 1 ? "Recommended route" : "Recommended routes, best first"}</h3>
          <ol className={styles.routes}>
            {answer.recommendedRoutes.map((route) => (
              <RouteCard key={route.route} route={route} minimum={answer.basedOn.minimumResultsForComparison} />
            ))}
          </ol>
        </div>
      )}
      <p className={styles.notice}>{answer.notice}</p>
      <p className={styles.timestamp}>
        Answered <time dateTime={answer.answeredAt}>{formatTorontoDateTime(answer.answeredAt)}</time> (Toronto time).
      </p>
    </>
  );
}

function Sources({ data }: { data: ClimberAssistantData }) {
  return (
    <details className={`${workspace.panel} ${styles.sources}`}>
      <summary>What the assistant uses</summary>
      <div className={styles.sourcesBody}>
        <p className={styles.help}>
          Your official results, every route's statistics, and the places and totals in your division. Other Climbers
          appear only as places and totals, never by name.
        </p>
        <h3>Routes you can still score on</h3>
        {data.routesToTry.length ? (
          <ul className={styles.list}>
            {data.routesToTry.map((route) => (
              <li key={route.route}>
                {routeName(route)}: {pointsText(route.pointsIfToppedNextAttempt)} if you top it on your next attempt,{" "}
                {route.attemptsLeft} {route.attemptsLeft === 1 ? "attempt" : "attempts"} left.
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>None right now.</p>
        )}
        <h3>Routes you topped</h3>
        {data.completedRoutes.length ? (
          <ul className={styles.list}>
            {data.completedRoutes.map((route) => (
              <li key={route.route}>
                {routeName(route)}: {route.flash ? "flashed" : `topped in ${route.attempts} attempts`},{" "}
                {pointsText(route.pointsEarned)}.
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>None yet.</p>
        )}
        {data.cantScore.length > 0 && (
          <>
            <h3>Routes you can't score on</h3>
            <ul className={styles.list}>
              {data.cantScore.map((route) => (
                <li key={route.route}>
                  {routeName(route)}: {route.reason}.
                </li>
              ))}
            </ul>
          </>
        )}
        {data.divisionPlaces.length > 0 && (
          <>
            <h3>Places in your division</h3>
            <ul className={styles.list}>
              {data.divisionPlaces.map((place) => (
                <li key={place.place}>
                  {ordinal(place.place)} place: {pointsText(place.totalScore)}
                  {place.climbers > 1 ? `, shared by ${place.climbers} Climbers` : ""}
                  {place.yours ? " (you)" : ""}.
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
