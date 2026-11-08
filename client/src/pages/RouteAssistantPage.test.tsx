import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RouteAssistantAnswer, RouteAssistantAvailability } from "../lib/routeAssistantApi.ts";
import RouteAssistantPage from "./RouteAssistantPage.tsx";

let role = "GYM_ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "gym-admin", role, email: "gym@example.com" } }),
}));
vi.mock("../lib/sessionClient.ts", () => ({
  withAccessToken: (send: (token: string) => unknown) => send("test-token"),
}));

const id = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";
const page = (competitionId: string) => `/gym-admin/competitions/${competitionId}/route-assistant`;
const url = (competitionId: string) => `/api${page(competitionId)}`;
const question = "Which V4 had the lowest completion rate?";
const secondQuestion = "Which route had the most flashes?";
const availability: RouteAssistantAvailability = {
  competition: { _id: id, name: "Autumn Boulder Open" },
  enabled: true, canAsk: true, reasons: [], limits: { questionMaxLength: 500, questionsPerHour: 30 },
  notice: "AI explanations don't change official scores, results, rankings or route grades.",
  basedOn: {
    division: null, resultCount: 3, routesLeftOut: 0, minimumResultsForComparison: 3,
    routes: [{
      route: "4", name: "Gold Slab", grade: "V4", climbersWithResults: 3, sends: 1, flashes: 0,
      completionRatePercent: 33.3, averageAttempts: 3.33, flashRatePercent: 0, enoughData: true,
    }],
  },
};
const answer: RouteAssistantAnswer = {
  competition: availability.competition, notice: availability.notice,
  question, answer: "Route 4 had a 25% completion rate.\n\nFour climbers recorded results.",
  answeredAt: "2026-11-08T12:00:00.000Z", truncated: false,
  basedOn: {
    ...availability.basedOn, resultCount: 4,
    routes: [{
      ...availability.basedOn.routes[0], climbersWithResults: 4, completionRatePercent: 25,
      averageAttempts: 3.75,
    }],
  },
};

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  role = "GYM_ADMIN";
  fetchMock.mockReset().mockImplementation(async (_url, init) =>
    Response.json(init?.method === "POST" ? answer : availability));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function open(competitionId = id, search = "") {
  return render(<MemoryRouter initialEntries={[page(competitionId) + search]}>
    <Link to={page(otherId)}>Open another competition</Link>
    <Routes><Route path="/gym-admin/competitions/:competitionId/route-assistant" element={<RouteAssistantPage />} /></Routes>
  </MemoryRouter>);
}
const field = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your question" });
const askButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Ask assistant" });
const sentQuestions = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
async function enter(value = question) {
  await screen.findByRole("textbox", { name: "Your question" });
  fireEvent.change(field(), { target: { value } });
}
function ask() { fireEvent.click(askButton()); }

it("loads the selected competition with the session token and keeps navigation scoped to it", async () => {
  const search = "?period=past&page=2";
  open(id.toUpperCase(), search);
  expect(screen.getByRole("status").textContent).toContain("Loading");
  await screen.findByRole("heading", { name: availability.competition.name });
  expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href"))
    .toBe(`/gym-admin/competitions/${id}${search}`);
  expect(screen.getByRole("link", { name: "View route statistics" }).getAttribute("href"))
    .toBe(`/gym-admin/competitions/${id}/statistics${search}`);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(url(id), expect.objectContaining({
    method: "GET", credentials: "include", headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
  }));
});

it.each(["ADMIN", "CLIMBER"])("does not load private competition data for a %s", denied => {
  role = denied;
  open();
  expect(screen.getByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects a malformed competition link before contacting the API", () => {
  open("not-a-competition-id");
  expect(screen.getByRole("alert").textContent).toContain("This competition link isn't valid.");
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["", "   ", "?? 12 !!", "a".repeat(501)])("does not send an invalid question (%j)", async value => {
  open();
  await enter(value);
  expect(askButton().disabled).toBe(true);
  fireEvent.submit(field().form!);
  expect(sentQuestions()).toHaveLength(0);
});

it("sends only the normalized question, blocks repeat submits, and shows the answer's own evidence", async () => {
  const waiting = deferred<Response>();
  fetchMock.mockImplementation(async (_url, init) => init?.method === "POST" ? waiting.promise : Response.json(availability));
  open();
  await enter("  Which  V4 had the lowest completion rate? ");
  ask();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Asking assistant…" }).disabled).toBe(true);
  expect(field().readOnly).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("Working on your answer");
  fireEvent.submit(field().form!);
  expect(sentQuestions()).toHaveLength(1);
  expect(sentQuestions()[0]).toEqual([url(id), expect.objectContaining({
    method: "POST", body: JSON.stringify({ question }),
    headers: expect.objectContaining({ Authorization: "Bearer test-token", "Content-Type": "application/json" }),
  })]);
  await act(async () => waiting.resolve(Response.json(answer)));
  expect(screen.getByText(/Route 4 had a 25% completion rate/).textContent).toBe(answer.answer);
  fireEvent.click(screen.getByText("Official statistics used · 4 results"));
  expect(screen.getByText("25%", { selector: "dd" })).toBeTruthy();
  expect(screen.getByText("0%", { selector: "dd" })).toBeTruthy();
  expect(screen.queryByText("33.3%", { selector: "dd" })).toBeNull();
  expect(screen.getByText(availability.notice)).toBeTruthy();
});

it("clears the previous answer on submit and renders the new answer as plain text", async () => {
  open();
  await enter();
  ask();
  const oldAnswer = await screen.findByText(/Route 4 had a 25% completion rate/);
  await enter(secondQuestion);
  const waiting = deferred<Response>();
  fetchMock.mockImplementationOnce(() => waiting.promise);
  ask();
  expect(document.body.contains(oldAnswer)).toBe(false);
  const newText = "<img src=x onerror=alert(1)>\n\nThis is a new explanation.";
  await act(async () => waiting.resolve(Response.json({
    ...answer, question: secondQuestion, answer: newText, truncated: true,
  })));
  const response = screen.getByRole("region", { name: "Assistant response" });
  expect(response.textContent).toContain(newText);
  expect(response.querySelector("img")).toBeNull();
  expect(screen.getByText(/This answer was shortened/)).toBeTruthy();
});

it.each([
  { enabled: false, reason: "The Route Assistant isn't set up on this server." },
  { enabled: true, reason: "No official results have been recorded yet." },
])("explains why asking is unavailable: $reason", async ({ enabled, reason }) => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...availability, enabled, canAsk: false, reasons: [reason] }));
  open();
  await screen.findByText(reason);
  expect(screen.queryByRole("textbox", { name: "Your question" })).toBeNull();
  expect(sentQuestions()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
  await screen.findByRole("textbox", { name: "Your question" });
  expect(sentQuestions()).toHaveLength(0);
});

it("recovers from a failed availability check", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "INTERNAL_ERROR" }, { status: 500 }));
  open();
  expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load the Route Assistant");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("textbox", { name: "Your question" });
});

it.each([403, 404])("does not show a question form when the server refuses this competition (%d)", async status => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "DENIED" }, { status }));
  open();
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: availability.competition.name })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Your question" })).toBeNull();
  expect(screen.getByRole("link", { name: "Back to competitions" })).toBeTruthy();
});

it.each([
  [503, "ROUTE_ASSISTANT_BUSY", "The Route Assistant is busy"],
  [429, "TOO_MANY_REQUESTS", "You've reached the hourly question limit"],
  [422, "ROUTE_ASSISTANT_DECLINED", "The assistant couldn't answer that question"],
] as const)("shows a readable error for %s %s without retrying a POST", async (status, code, message) => {
  open();
  await enter();
  fetchMock.mockResolvedValueOnce(Response.json({ error: code, message: "Internal provider text" }, { status }));
  ask();
  expect((await screen.findByRole("alert")).textContent).toContain(message);
  expect(field().value).toBe(question);
  expect(askButton().disabled).toBe(false);
  expect(sentQuestions()).toHaveLength(1);
});

it("refreshes availability after official results are removed, preserving the question", async () => {
  open();
  await enter();
  fetchMock.mockResolvedValueOnce(Response.json({ error: "ROUTE_ASSISTANT_NO_DATA" }, { status: 409 }));
  ask();
  await screen.findByRole("alert");
  expect(askButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh competition data" }));
  await screen.findByRole("textbox", { name: "Your question" });
  expect(field().value).toBe(question);
  expect(sentQuestions()).toHaveLength(1);
});

it("removes competition context if access is revoked while asking", async () => {
  open();
  await enter();
  fetchMock.mockResolvedValueOnce(Response.json({ error: "FORBIDDEN" }, { status: 403 }));
  ask();
  expect((await screen.findByRole("alert")).textContent).toContain("don't have access");
  expect(screen.queryByRole("heading", { name: availability.competition.name })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Your question" })).toBeNull();
});

it.each([
  { competition: { _id: otherId, name: "Unrelated Open" } },
  { question: secondQuestion },
  { answer: "  " },
  { basedOn: null },
])("refuses a mismatched or incomplete answer: %j", async override => {
  open();
  await enter();
  fetchMock.mockResolvedValueOnce(Response.json({ ...answer, ...override }));
  ask();
  expect((await screen.findByRole("alert")).textContent).toContain("Couldn't get an answer");
  expect(screen.queryByText(/Route 4 had a 25% completion rate/)).toBeNull();
});

it("cancels a pending question when changing competitions and ignores its late answer", async () => {
  const waiting = deferred<Response>();
  fetchMock.mockImplementation(async (input, init) => init?.method === "POST" ? waiting.promise : Response.json(
    input === url(otherId) ? { ...availability, competition: { _id: otherId, name: "Spring Open" } } : availability,
  ));
  open();
  await enter();
  ask();
  const signal = sentQuestions()[0][1]?.signal;
  fireEvent.click(screen.getByRole("link", { name: "Open another competition" }));
  await screen.findByRole("heading", { name: "Spring Open" });
  expect(signal?.aborted).toBe(true);
  await act(async () => waiting.resolve(Response.json(answer)));
  expect(field().value).toBe("");
  expect(screen.queryByRole("region", { name: "Assistant response" })).toBeNull();
});
