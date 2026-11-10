import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import {
  chatText,
  conversationKey,
  historyOf,
  readConversation,
  rememberWelcome,
  saveConversation,
  wasWelcomed,
  type ChatMessage,
  type ChatPlace,
} from "../../lib/assistantChat.ts";
import {
  askClimberAssistant,
  climberAssistantProblem,
  climberQuestionProblem,
  getClimberAssistant,
  type RouteToTry,
} from "../../lib/climberAssistantApi.ts";
import { pointsText } from "../../lib/leaderboardText.ts";
import {
  askRouteAssistant,
  assistantAccessLost,
  getRouteAssistant,
  normalizeRouteQuestion,
  routeAssistantProblem,
  routeQuestionProblem,
} from "../../lib/routeAssistantApi.ts";
import topoBody from "../../assets/topo/topo-body.webp";
import topoHand from "../../assets/topo/topo-hand.webp";
import { useSession } from "../session/sessionContext.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./AssistantChat.module.css";

type AssistantChatProps = ChatPlace & {
  competitionId: string;
  competitionName: string;
  /** The division a Gym Administrator's page is showing, which their questions are then about. */
  division?: { _id: string; name: string } | null;
};

/** What the chatbot needs to know before a question, the same for both roles. */
interface Ready {
  canAsk: boolean;
  reasons: string[];
  questionMaxLength: number;
  notice: string;
}

type Availability =
  { status: "ready"; data: Ready } | { status: "error"; message: string; retry: boolean; signIn: boolean };

interface Answer {
  text: string;
  routes: RouteToTry[];
  truncated: boolean;
}

const PHONE = "(max-width: 767px)";

/** The longest question each role's API accepts, until the API says so itself. */
const QUESTION_MAX_LENGTH = { climber: 300, "gym-admin": 500 } as const;

/** From this share of the longest question on, the chatbot shows how many characters are used. */
const COUNTER_FROM = 0.8;

function routeText(route: RouteToTry) {
  const name = route.name ? `Route ${route.route}, ${route.name}` : `Route ${route.route}`;
  return `${name}, ${route.grade}: ${pointsText(route.pointsIfToppedNextAttempt)} if you top it on your next attempt`;
}

/**
 * The AI Route Assistant as a chatbot inside a page (US-023, US-033, section 11 of the spec). An
 * Ask AI button opens it as a panel over the page, which stays as it is: in the bottom right corner
 * on a wide screen, and as a sheet from the bottom on a phone. It already knows the competition,
 * the page and the user, greets a first-time user once, offers suggested questions that a click
 * sends, and keeps the conversation while the user stays in TopSend. Only the question, the page
 * and the earlier messages are sent; the server reads the official data itself. Answers are shown
 * as plain text.
 */
export default function AssistantChat(props: AssistantChatProps) {
  const { user } = useSession();
  if (!user) return null;
  const place = { audience: props.audience, page: props.page } as ChatPlace;
  const competitionId = props.competitionId.toLowerCase();
  const storeKey = conversationKey(user.userId, place, competitionId);
  return (
    <Chat
      key={storeKey}
      storeKey={storeKey}
      userId={user.userId}
      place={place}
      competitionId={competitionId}
      competitionName={props.competitionName}
      division={props.division ?? null}
    />
  );
}

interface ChatProps {
  storeKey: string;
  userId: string;
  place: ChatPlace;
  competitionId: string;
  competitionName: string;
  division: { _id: string; name: string } | null;
}

function Chat({ storeKey, userId, place, competitionId, competitionName, division }: ChatProps) {
  const { audience } = place;
  const text = chatText(place);
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => readConversation(storeKey));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [checked, setChecked] = useState<{ revision: number; result: Availability }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const lastQuestion = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const suggestionsToggle = useRef<HTMLButtonElement>(null);
  const active = useRef<AbortController | null>(null);
  const nextId = useRef(messages.reduce((highest, message) => Math.max(highest, message.id), 0) + 1);
  const focusAfter = useRef<"launcher" | "input" | "suggestions" | null>(null);
  const titleId = useId();
  const welcomeId = useId();
  const inputId = useId();
  const problemId = useId();
  const hintId = useId();
  const suggestionsId = useId();

  const loading = started && checked?.revision !== revision;
  const availability = loading ? undefined : checked?.result;
  const ready = availability?.status === "ready" ? availability.data : undefined;
  const canAsk = ready?.canAsk ?? false;
  const blocked = availability !== undefined && !canAsk;
  const maxLength = ready?.questionMaxLength ?? QUESTION_MAX_LENGTH[audience];
  const showSuggestions = canAsk && (messages.length === 0 || suggestionsOpen);

  useEffect(() => {
    if (!started) return;
    const controller = new AbortController();
    const load = audience === "climber" ? getClimberAssistant : getRouteAssistant;
    load(competitionId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setChecked({
          revision,
          result: {
            status: "ready",
            data: {
              canAsk: data.canAsk,
              reasons: data.reasons,
              questionMaxLength: data.limits.questionMaxLength,
              notice: data.notice,
            },
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          audience === "climber" ? climberAssistantProblem(error, "load") : routeAssistantProblem(error, "load");
        setChecked({
          revision,
          result: {
            status: "error",
            message,
            retry: !assistantAccessLost(error),
            signIn: error instanceof ApiError && error.status === 401,
          },
        });
      });
    return () => controller.abort();
  }, [audience, competitionId, revision, started]);

  useEffect(() => () => active.current?.abort(), []);

  // A new question moves to the top of the panel, so its answer is read from its first line. A
  // conversation opened again starts at its latest messages.
  useEffect(() => {
    const element = body.current;
    if (open && element && lastQuestion.current) element.scrollTop = element.scrollHeight;
  }, [open]);
  useEffect(() => {
    const element = body.current;
    const question = lastQuestion.current;
    if (element && question) element.scrollTop = question.offsetTop - element.offsetTop - 12;
  }, [messages.length]);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === "launcher") launcher.current?.focus();
    else if (target === "input") input.current?.focus();
    else suggestionsToggle.current?.focus();
  });

  function show() {
    const element = dialog.current;
    if (!element || element.open) return;
    const phone = window.matchMedia(PHONE).matches;
    if (phone) element.showModal();
    else element.show();
    if (!wasWelcomed(userId, place)) {
      setWelcome(true);
      rememberWelcome(userId, place);
    }
    setStarted(true);
    setOpen(true);
    // On a phone the text box would open the keyboard over the welcome, so the title gets focus there.
    if (phone || blocked) heading.current?.focus();
    else input.current?.focus();
  }

  function close() {
    dialog.current?.close();
  }

  function closed() {
    setOpen(false);
    setWelcome(false);
    focusAfter.current = "launcher";
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    close();
  }

  function onPanelClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialog.current) close();
  }

  async function request(question: string, earlier: ChatMessage[], signal: AbortSignal): Promise<Answer> {
    const history = historyOf(earlier);
    if (place.audience === "climber") {
      const answer = await askClimberAssistant(competitionId, question, { page: place.page, history }, signal);
      return { text: answer.answer, routes: answer.recommendedRoutes, truncated: answer.truncated };
    }
    const answer = await askRouteAssistant(
      competitionId,
      question,
      { page: place.page, history, divisionId: division?._id },
      signal,
    );
    return { text: answer.answer, routes: [], truncated: answer.truncated };
  }

  async function send(asked: string, from: "form" | "suggestion") {
    if (!canAsk || pending || active.current) return;
    const question = normalizeRouteQuestion(asked);
    const invalid =
      audience === "climber" ? climberQuestionProblem(question, maxLength) : routeQuestionProblem(question, maxLength);
    if (invalid) {
      setProblem(invalid);
      setSignIn(false);
      focusAfter.current = "input";
      return;
    }

    const earlier = messages;
    const asking = [...earlier, { id: nextId.current++, role: "user" as const, text: question }];
    const controller = new AbortController();
    active.current = controller;
    setMessages(asking);
    setPending(true);
    setProblem("");
    setSignIn(false);
    setSuggestionsOpen(false);
    if (from === "form") setDraft("");
    else focusAfter.current = "suggestions";

    try {
      const answer = await request(question, earlier, controller.signal);
      if (controller.signal.aborted) return;
      const answered = [
        ...asking,
        {
          id: nextId.current++,
          role: "assistant" as const,
          text: answer.text,
          ...(answer.routes.length > 0 ? { routes: answer.routes } : {}),
          ...(answer.truncated ? { truncated: true } : {}),
        },
      ];
      saveConversation(storeKey, answered);
      setMessages(answered);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages(earlier);
      setDraft(question);
      setProblem(audience === "climber" ? climberAssistantProblem(error, "ask") : routeAssistantProblem(error, "ask"));
      setSignIn(error instanceof ApiError && error.status === 401);
      focusAfter.current = "input";
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft, "form");
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(draft, "form");
  }

  const lastQuestionIndex = messages.findLastIndex((message) => message.role === "user");
  const context = [competitionName, text.pageName, ...(division ? [`${division.name} division`] : [])].join(", ");
  const describedBy = [problem ? problemId : "", hintId].filter(Boolean).join(" ");

  return (
    <div className={styles.host}>
      <div className={styles.spacer} />
      {/* Topo, TopSend's mascot, is the Ask AI button. He hides behind the bottom edge of the screen and pops up to wave. */}
      <div className={styles.dock} hidden={open}>
        <button
          ref={launcher}
          type="button"
          className={styles.launcher}
          aria-label="Ask AI"
          aria-haspopup="dialog"
          onClick={show}
        >
          <span className={styles.topo} aria-hidden="true">
            <img className={styles.topoBody} src={topoBody} alt="" width={210} height={366} draggable={false} />
            <img className={styles.topoHand} src={topoHand} alt="" width={51} height={93} draggable={false} />
            <span className={styles.bubble}>Ask AI</span>
          </span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className={styles.panel}
        aria-labelledby={titleId}
        onClose={closed}
        onKeyDown={onPanelKeyDown}
        onClick={onPanelClick}
      >
        <div className={styles.sheet}>
          <header className={styles.header}>
            <div className={styles.titles}>
              <h2 id={titleId} ref={heading} tabIndex={-1}>
                AI Route Assistant
              </h2>
              <p>{context}</p>
            </div>
            <button type="button" className={styles.close} onClick={close}>
              Close
            </button>
          </header>

          {/* The messages scroll, so the keyboard can reach them to scroll too. */}
          <div ref={body} className={styles.body} role="region" aria-label="Messages" tabIndex={0}>
            {welcome ? (
              <section className={styles.welcome} aria-labelledby={welcomeId}>
                <h3 id={welcomeId}>Welcome to the AI Route Assistant</h3>
                <ul>
                  {text.welcome.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </section>
            ) : (
              messages.length === 0 && <p className={styles.intro}>{text.intro}</p>
            )}

            {loading && (
              <p className={styles.state} role="status">
                Checking the Route Assistant…
              </p>
            )}
            {availability?.status === "error" && (
              <div className={styles.unavailable} role="alert">
                <p>{availability.message}</p>
                <div className={styles.stateActions}>
                  {availability.retry && (
                    <button
                      type="button"
                      className={workspace.secondary}
                      onClick={() => setRevision((current) => current + 1)}
                    >
                      Try again
                    </button>
                  )}
                  {availability.signIn && (
                    <Link className={workspace.secondary} to="/login">
                      Sign in
                    </Link>
                  )}
                </div>
              </div>
            )}
            {ready && !ready.canAsk && (
              <div className={styles.unavailable} role="status">
                <p>
                  <strong>You can't ask about this competition right now.</strong>
                </p>
                <ul>
                  {ready.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <div className={styles.stateActions}>
                  <button
                    type="button"
                    className={workspace.secondary}
                    onClick={() => setRevision((current) => current + 1)}
                  >
                    Check again
                  </button>
                </div>
              </div>
            )}

            <div className={styles.log} role="log" aria-label="Conversation">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  ref={index === lastQuestionIndex ? lastQuestion : undefined}
                  className={message.role === "user" ? styles.question : styles.answer}
                >
                  <span className={styles.hidden}>
                    {message.role === "user" ? "You asked: " : "The Route Assistant answered: "}
                  </span>
                  <p>{message.text}</p>
                  {message.routes && (
                    <div className={styles.routes}>
                      <p>Routes to try</p>
                      <ul>
                        {message.routes.map((route) => (
                          <li key={route.route}>{routeText(route)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {message.truncated && (
                    <p className={styles.cut}>This answer was cut short. Ask again for the rest.</p>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.working} role="status">
              {pending ? "Working on your answer…" : ""}
            </p>
          </div>

          <footer className={styles.footer}>
            {canAsk && (
              <div className={styles.suggestions}>
                {messages.length === 0 ? (
                  <p className={styles.suggestionsTitle}>Suggested questions</p>
                ) : (
                  <button
                    ref={suggestionsToggle}
                    type="button"
                    className={styles.suggestionsToggle}
                    aria-expanded={suggestionsOpen}
                    aria-controls={suggestionsId}
                    onClick={() => setSuggestionsOpen((current) => !current)}
                  >
                    {suggestionsOpen ? "Hide suggested questions" : "Show suggested questions"}
                  </button>
                )}
                <ul id={suggestionsId} aria-label="Suggested questions" hidden={!showSuggestions}>
                  {text.suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button type="button" disabled={pending} onClick={() => void send(suggestion, "suggestion")}>
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form className={styles.form} onSubmit={submit} noValidate>
              <label className={styles.hidden} htmlFor={inputId}>
                Your question
              </label>
              <textarea
                ref={input}
                id={inputId}
                rows={2}
                value={draft}
                maxLength={maxLength}
                placeholder="Ask about this competition"
                enterKeyHint="send"
                disabled={blocked}
                aria-invalid={problem ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (problem) setProblem("");
                }}
                onKeyDown={onInputKeyDown}
              />
              <button type="submit" className={workspace.primary} disabled={!canAsk || pending}>
                Send
              </button>
            </form>
            {problem && (
              <div id={problemId} className={styles.problem} role="alert">
                <p>{problem}</p>
                {signIn && <Link to="/login">Sign in</Link>}
              </div>
            )}
            <p id={hintId} className={styles.hint}>
              {draft.length >= maxLength * COUNTER_FROM
                ? `${draft.length} of ${maxLength} characters.`
                : "Press Enter to send, or Shift and Enter for a new line."}
            </p>
            {ready && <p className={styles.notice}>{ready.notice}</p>}
          </footer>
        </div>
      </dialog>
    </div>
  );
}
