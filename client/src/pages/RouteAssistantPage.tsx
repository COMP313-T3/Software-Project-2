import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import common from "../components/gym-admin/GymAdminDashboard.module.css";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { INVALID_COMPETITION_LINK } from "../lib/competitionLink.ts";
import { formatTorontoDateTime } from "../lib/dateFormat.ts";
import {
  askRouteAssistant, assistantAccessLost, getRouteAssistant, normalizeRouteQuestion,
  routeAssistantProblem, routeQuestionProblem, type RouteAssistantAnswer,
  type RouteAssistantAvailability, type RouteAssistantSources,
} from "../lib/routeAssistantApi.ts";
import styles from "./RouteAssistantPage.module.css";

const title = "AI Route Assistant";

type Availability =
  | { status: "ready"; data: RouteAssistantAvailability }
  | { status: "error"; message: string; retry: boolean };

type Reply =
  | { status: "idle" | "pending" }
  | { status: "error"; message: string; field?: boolean; refresh?: boolean }
  | { status: "answered"; data: RouteAssistantAnswer };

export default function RouteAssistantPage() {
  const { user } = useSession();
  const { competitionId = "" } = useParams();
  const { search } = useLocation();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  if (!/^[a-f\d]{24}$/i.test(competitionId)) {
    return <AssistantLayout>
      <Link className={common.back} to={`/dashboard${search}#competitions`}>Back to competitions</Link>
      <p role="alert" className={styles.error}>{INVALID_COMPETITION_LINK} Open the assistant from your competition.</p>
    </AssistantLayout>;
  }
  return <Workspace
    key={`${user.userId}:${competitionId.toLowerCase()}`}
    competitionId={competitionId.toLowerCase()}
    search={search}
  />;
}

function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout title={title}>
    <title>{title} | TopSend</title>
    <div className={styles.workspace}>{children}</div>
  </AppLayout>;
}

function Workspace({ competitionId, search }: { competitionId: string; search: string }) {
  const [revision, setRevision] = useState(0);
  const [checked, setChecked] = useState<{ revision: number; result: Availability }>();
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<Reply>({ status: "idle" });
  const active = useRef<AbortController | null>(null);
  const availability = checked?.revision === revision ? checked.result : undefined;
  const data = availability?.status === "ready" ? availability.data : undefined;
  const pending = reply.status === "pending";
  const needsRefresh = reply.status === "error" && reply.refresh;
  const canAsk = !!data?.enabled && data.canAsk && !needsRefresh;
  const value = normalizeRouteQuestion(question);
  const invalid = data ? routeQuestionProblem(value, data.limits.questionMaxLength) : "";
  const fieldError = reply.status === "error" && reply.field ? reply.message : "";
  const questionError = (value && invalid) || fieldError;
  const answer = reply.status === "answered" ? reply.data : undefined;
  const competitionPath = `/gym-admin/competitions/${competitionId}`;

  useEffect(() => {
    const controller = new AbortController();
    getRouteAssistant(competitionId, controller.signal).then(data => {
      if (!controller.signal.aborted) setChecked({ revision, result: { status: "ready", data } });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setChecked({ revision, result: {
        status: "error", message: routeAssistantProblem(error, "load"), retry: !assistantAccessLost(error),
      } });
    });
    return () => controller.abort();
  }, [competitionId, revision]);

  useEffect(() => () => active.current?.abort(), []);

  function refresh() {
    if (active.current) return;
    setReply({ status: "idle" });
    setRevision(current => current + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk || invalid || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setReply({ status: "pending" });
    try {
      const data = await askRouteAssistant(competitionId, value, controller.signal);
      if (!controller.signal.aborted) setReply({ status: "answered", data });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = routeAssistantProblem(error, "ask");
      if (assistantAccessLost(error)) {
        setChecked({ revision, result: { status: "error", message, retry: false } });
        setQuestion("");
        setReply({ status: "idle" });
        return;
      }
      const field = error instanceof ApiError && error.status === 400 &&
        typeof error.fields?.question === "string" ? error.fields.question : "";
      setReply({
        status: "error", message: field || message, field: !!field,
        refresh: error instanceof ApiError && error.code === "ROUTE_ASSISTANT_NO_DATA",
      });
    } finally {
      active.current = null;
    }
  }

  return <AssistantLayout>
    <nav className={styles.toolbar} aria-label="Competition navigation">
      {availability?.status === "error" && !availability.retry
        ? <Link className={common.back} to={`/dashboard${search}#competitions`}>Back to competitions</Link>
        : <Link className={common.back} to={competitionPath + search}>Back to competition</Link>}
      {data && <Link className={common.back} to={`${competitionPath}/statistics${search}`}>View route statistics</Link>}
    </nav>
    {!availability && <p role="status" className={common.panel}>Loading the competition’s Route Assistant…</p>}
    {availability?.status === "error" && <div className={styles.error} role="alert">
      <p>{availability.message}</p>
      {availability.retry && <button type="button" className={common.secondary} onClick={refresh}>Try again</button>}
    </div>}
    {data && <>
      <header className={`${common.panel} ${styles.context}`}>
        <div>
          <p className={styles.eyebrow}>Selected competition</p>
          <h2>{(answer ?? data).competition.name}</h2>
          <p className={styles.muted}>{data.basedOn.division?.name ?? "All divisions"} · Official route statistics</p>
        </div>
        <button type="button" className={common.secondary} disabled={pending} onClick={refresh}>Refresh availability</button>
      </header>
      <section className={`${common.panel} ${styles.panel}`} aria-labelledby="assistant-question-heading">
        <h2 id="assistant-question-heading">Ask about route performance</h2>
        {!data.enabled || !data.canAsk ? <div className={styles.unavailable} role="status">
          <p><strong>Questions are unavailable for this competition.</strong></p>
          {data.reasons.length > 0 && <ul>{data.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        </div> : <form className={styles.form} onSubmit={submit}>
          <label htmlFor="assistant-question">Your question</label>
          <p className={styles.muted} id="assistant-question-help">
            For example: Which V4 had the lowest completion rate? Leave out personal information.
          </p>
          <textarea
            id="assistant-question" value={question} required maxLength={data.limits.questionMaxLength}
            rows={4} readOnly={pending} aria-invalid={!!questionError}
            aria-describedby={`assistant-question-help assistant-question-count${questionError ? " assistant-question-error" : ""}`}
            onChange={event => {
              setQuestion(event.target.value);
              if (fieldError) setReply({ status: "idle" });
            }}
          />
          <div className={styles.toolbar}>
            <p className={styles.muted} id="assistant-question-count">{question.length} / {data.limits.questionMaxLength} characters</p>
            <button type="submit" className={`${common.primary} ${styles.submit}`} disabled={!canAsk || !!invalid || pending}>
              {pending ? "Asking assistant…" : "Ask assistant"}
            </button>
          </div>
          {questionError && <p className={styles.fieldError} id="assistant-question-error" role={fieldError ? "alert" : undefined}>{questionError}</p>}
        </form>}
        <p className={styles.notice}>{(answer ?? data).notice}</p>
      </section>
      {(pending || answer || (reply.status === "error" && !reply.field)) && <section
        className={`${common.panel} ${styles.panel}`} aria-labelledby="assistant-response-heading"
      >
        <h2 id="assistant-response-heading">Assistant response</h2>
        {pending && <p role="status" className={styles.muted}>Working on your answer from the competition’s official results…</p>}
        {reply.status === "error" && <div role="alert" className={styles.error}>
          <p>{reply.message}</p>
          {needsRefresh && <button type="button" className={common.secondary} onClick={refresh}>Refresh competition data</button>}
        </div>}
        {answer && <>
          <p role="status" className="sr-only">An answer is ready.</p>
          <p className={styles.asked}><strong>Question:</strong> {answer.question}</p>
          <p className={styles.answer}>{answer.answer}</p>
          {answer.truncated && <p className={styles.notice}>This answer was shortened. Ask a more specific question for more detail.</p>}
          <p className={styles.muted}>Answered <time dateTime={answer.answeredAt}>{formatTorontoDateTime(answer.answeredAt)}</time></p>
          <Sources data={answer.basedOn} />
        </>}
      </section>}
    </>}
  </AssistantLayout>;
}

const formatMetric = (value: number | null, unit = "") => value === null
  ? "No data"
  : `${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })}${unit}`;

function Sources({ data }: { data: RouteAssistantSources }) {
  return <details className={styles.sources}>
    <summary>Official statistics used · {data.resultCount} {data.resultCount === 1 ? "result" : "results"}</summary>
    <p className={styles.muted}>{data.division?.name ?? "All divisions"}. Routes with fewer than {data.minimumResultsForComparison} results have too little data for a reliable comparison.</p>
    {data.routesLeftOut > 0 && <p className={styles.muted}>{data.routesLeftOut} {data.routesLeftOut === 1 ? "route was" : "routes were"} left out of this answer.</p>}
    <ul className={styles.routes}>
      {data.routes.map(route => <li className={styles.route} key={route.route}>
        <h3>Route {route.route}{route.name && ` · ${route.name}`} · {route.grade}</h3>
        <p className={styles.muted}>{route.climbersWithResults} {route.climbersWithResults === 1 ? "result" : "results"}{!route.enoughData && " · Small sample"}</p>
        <dl>
          <div><dt>Completion</dt><dd>{formatMetric(route.completionRatePercent, "%")}</dd></div>
          <div><dt>Avg. attempts</dt><dd>{formatMetric(route.averageAttempts)}</dd></div>
          <div><dt>Flash rate</dt><dd>{formatMetric(route.flashRatePercent, "%")}</dd></div>
          <div><dt>Sends</dt><dd>{route.sends}</dd></div>
          <div><dt>Flashes</dt><dd>{route.flashes}</dd></div>
        </dl>
      </li>)}
    </ul>
  </details>;
}
