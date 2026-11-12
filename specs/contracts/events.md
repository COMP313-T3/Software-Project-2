# TopSend Event Contracts

## 1. Event model overview

TopSend relies on authoritative event records to drive registration, result entry, live rankings, and AI explanations. These event contracts are intentionally strict to protect score integrity and to keep AI advisory behavior separate from official competition decisions.

TopSend doesn't publish or store these events as records. The live updates of sections 8, 9, and 10 are built, as Socket.IO messages to the pages that show standings, scorecards, and other saved data, and the AI request of section 12 is built as a REST request. The other contracts describe what an event would carry if one were added. Until then, the server's log lines record what happened, such as a login, a gym request decision, or a saved result.

## 2. Event: UserLoggedIn

Not built yet.

```json
{
  "eventName": "UserLoggedIn",
  "version": "1.0",
  "source": "auth-service",
  "payload": {
    "userId": "string",
    "role": "ADMIN | GYM_ADMIN | CLIMBER",
    "timestamp": "ISO-8601"
  }
}
```

### Purpose
- Record successful authentication events.
- Support session initialization and audit use cases.

## 3. Event: GymAdminAccessRequested

Not built yet.

```json
{
  "eventName": "GymAdminAccessRequested",
  "version": "1.0",
  "source": "user-service",
  "payload": {
    "requestId": "string",
    "userId": "string",
    "gymId": "string | null",
    "requestType": "NEW_GYM | EXISTING_GYM",
    "details": "string",
    "status": "PENDING",
    "submittedAt": "ISO-8601"
  }
}
```

### Purpose
- Track the approval workflow for Gym Administrator access.
- Allow the System Administrator to review and decide on requests.

## 4. Event: GymAdminAccessDecision

Not built yet.

```json
{
  "eventName": "GymAdminAccessDecision",
  "version": "1.0",
  "source": "admin-service",
  "payload": {
    "requestId": "string",
    "decision": "APPROVED | REJECTED",
    "approvedBy": "string",
    "timestamp": "ISO-8601",
    "notes": "string"
  }
}
```

### Purpose
- Indicate whether the access request was accepted or denied.
- Trigger user role activation and account setup workflows.

## 5. Event: CompetitionCreated

Not built yet.

```json
{
  "eventName": "CompetitionCreated",
  "version": "1.0",
  "source": "competition-service",
  "payload": {
    "competitionId": "string",
    "gymId": "string",
    "name": "string",
    "date": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "location": "string",
    "capacity": 120,
    "registrationStatus": "CLOSED",
    "status": "DRAFT",
    "createdBy": "string",
    "createdAt": "ISO-8601"
  }
}
```

### Purpose
- Signal that a competition record has been created as a DRAFT with registration CLOSED, ready for divisions and registration setup.

## 6. Event: RegisteredForCompetition

Not built yet.

```json
{
  "eventName": "RegisteredForCompetition",
  "version": "1.0",
  "source": "registration-service",
  "payload": {
    "registrationId": "string",
    "competitionId": "string",
    "climberId": "string",
    "divisionId": "string",
    "status": "CONFIRMED",
    "registeredAt": "ISO-8601"
  }
}
```

### Purpose
- Finalize competition enrollment.
- Feed the live leaderboard and scorecard views.

## 7. Event: OfficialResultSaved

Not published as an event. Saving, changing, or deleting an official result, by the Climber on their scorecard or by a Gym Administrator in Result entry, is logged and sends the live updates of sections 8 and 9. If the event is added, it would carry:

```json
{
  "eventName": "OfficialResultSaved",
  "version": "1.0",
  "source": "scoring-service",
  "payload": {
    "resultId": "string",
    "competitionId": "string",
    "climberId": "string",
    "routeId": "string",
    "attempts": 4,
    "sends": 1,
    "flash": false,
    "officialScore": 25,
    "source": "CLIMBER | GYM_ADMIN",
    "savedAt": "ISO-8601"
  }
}
```

### Purpose
- Indicate that official competition results are stored and can trigger leaderboard recalculation.
- This event is authoritative and cannot be modified by AI.

## 8. Event: LeaderboardUpdated

Built as Socket.IO events on the `/leaderboard` namespace (US-020, US-032), in server/src/realtime/leaderboardSocket.js.

- A client connects with the access token of a Gym Administrator or Climber, or with none for a public leaderboard, and sends `leaderboard:join` with `{ "competitionId": "string" }`. The acknowledgement carries the current standings, shaped like the REST answer for that viewer (interfaces.md, section 1.13).
- When an official result is recorded, changed, or deleted, or the scoring, a problem's points, a registration, or the competition changes, the server recalculates the standings once from the persisted official results and sends `leaderboard:update` to every viewer following that competition:

```json
{
  "competitionId": "string",
  "reason": "result | scoring | route | registration | competition",
  "leaderboard": {}
}
```

- `leaderboard` has the same shape as the REST answer for that viewer: a Climber gets their own `myEntry` and `myRegistration`, and a public viewer gets names and scores only.
- Changes within 300 ms of each other send one update. Viewers of other competitions receive nothing.
- `leaderboard:leave` with `{ "competitionId": "string" }` stops the updates.
- A viewer who lost access gets `leaderboard:closed` with `{ "competitionId", "error", "message" }`. When the standings can't be recalculated, such as while the database is unreachable, the update is tried again up to twice, 2 seconds apart, and every viewer keeps following.
- Before a PUBLISHED competition's start time, a Climber or a public viewer who sends `leaderboard:join` is answered `{ "ok": false, "error": { "error": "COMPETITION_NOT_STARTED", "message", "details": { "startsAt" } } }`, the same refusal as the REST routes give (interfaces.md, section 1.13), and joins nothing. A Gym Administrator of the gym follows the leaderboard at any time. The `/scorecard` namespace answers `scorecard:join` the same way, so a Climber receives no live scorecard before the start either. The page joins again when its countdown reaches the start.
- The `/leaderboard` namespace stays open after the end, for the final standings.

### Purpose
- Push ranking changes to clients through Socket.IO, without a page refresh.
- Keeps on-screen standings aligned with official results.

## 9. Event: ScorecardUpdated

Built as Socket.IO events on the `/scorecard` namespace (US-031), in server/src/realtime/scorecardSocket.js.

- A Climber connects with their access token and sends `scorecard:join` with `{ "competitionId": "string" }`. The acknowledgement is `{ "ok": true, "scorecard": {} }`, shaped like GET /api/competitions/{competitionId}/scorecard (interfaces.md, section 1.13), or `{ "ok": false, "error" }` with the same errors. Only the Climber in the access token is followed, so no one receives another Climber's scorecard.
- When the Climber's official result changes, whether they recorded it or a Gym Administrator corrected it, or the competition's scoring, a problem, or their registration changes, the server sends `scorecard:update` to that Climber's connections:

```json
{
  "competitionId": "string",
  "reason": "result | scoring | route | registration | competition",
  "reasons": ["result"],
  "scorecard": {}
}
```

- `scorecard` is the whole scorecard again, so the page replaces what it shows. Changes within 300 ms of each other send one update, and a change that leaves the scorecard as it was sends nothing.
- `scorecard:leave` with `{ "competitionId": "string" }` stops the updates.
- Before a PUBLISHED competition's start time, `scorecard:join` is refused with `COMPETITION_NOT_STARTED`, as the REST route is.
- From a PUBLISHED competition's end time, `scorecard:join` answers `{ "ok": false, "error": { "error": "SCORECARD_CLOSED", "message" } }`, and a Climber still following receives `scorecard:closed` with the same error on the next update, since the scorecard closes at the end (interfaces.md, section 1.13). A Climber whose registration was removed, or whose login ended, also receives `scorecard:closed`.

### Purpose
- Show a Climber their own results as soon as they change, without a page refresh.
- Close the scorecard for good at the competition's end.

## 10. Event: PageDataChanged

Built as Socket.IO events on the `/updates` namespace, in server/src/realtime/pageUpdateSocket.js. Every logged-in page that shows saved data follows it, so no page needs a refresh button.

- A client connects with the access token of a System Administrator, a Gym Administrator, or a Climber. Without a token, or with an invalid or expired one, the connection is refused with `{ "error", "message" }` in the error's `data` (`NOT_AUTHENTICATED`, `TOKEN_EXPIRED`, or `SESSION_EXPIRED`), so the page can renew its token once and connect again. The client sends no events of its own.
- After a write answers successfully, server/src/middleware/announceChanges.js notes what it changed, by its path (interfaces.md, section 2). Changes within 300 ms of each other are sent together, each once:

```json
{
  "changes": [
    { "topic": "competitions | results | gyms | users | gym-requests | settings", "competitionId": "string" }
  ]
}
```

- The event is `updates:changed`. A change carries no data, only what kind of data changed, so the page reads the data again through the API, which checks again what the user may see.
- Each topic is sent only to the roles whose pages show it: `competitions` and `gyms` to every role, `results` to Gym Administrators, and `users`, `gym-requests`, and `settings` to System Administrators.
- `competitionId` names the competition a change is about, for System and Gym Administrators, so only the pages about it reload. A Climber isn't told which, since the competition may be a draft they can't see.
- A connection's login is checked again before a change is sent, at most once a minute. When it has ended, the client gets `updates:closed` with `{ "error", "message" }` and is disconnected.
- A page reloads at once for the first change it shows, then at most once a second. It waits while it holds input that isn't saved, or while a change is being confirmed or saved, and reloads once it's free. After the connection drops and comes back, every page reloads, since changes may have been missed.
- A page's own reads send the header `X-TopSend-Automatic: 1`, so they don't count as the user's activity (interfaces.md, section 1.1).

### Purpose
- Show every logged-in user the latest saved data without a refresh button.
- Never send data over the connection, so a page only ever shows what the API lets that user read.

## 11. Event: RouteStatisticsCalculated

Not published as an event: a route's statistics are calculated from its official results whenever Route statistics or the AI Route Assistant asks for them (interfaces.md, sections 1.8 and 1.14). If the event is added, it would carry:

```json
{
  "eventName": "RouteStatisticsCalculated",
  "version": "1.0",
  "source": "analytics-service",
  "payload": {
    "competitionId": "string",
    "routeId": "string",
    "completionRate": 0.72,
    "averageAttempts": 1.8,
    "flashRate": 0.4,
    "calculatedAt": "ISO-8601"
  }
}
```

### Purpose
- Provide competition-derived route metrics to the AI route assistant and organizer dashboards.
- Ensure AI answers are rooted in official results and not in user speculation.

## 12. Event: AiRouteRecommendationRequested

Built as REST requests from the chatbot inside the scorecard, leaderboard, Route statistics, and Result entry pages (US-023, US-033), not as a published event: `POST /api/competitions/:competitionId/route-assistant` for a Climber and `POST /api/gym-admin/competitions/:competitionId/route-assistant` for a Gym Administrator (interfaces.md, section 1.14). Each request carries what this event describes:

```json
{
  "eventName": "AiRouteRecommendationRequested",
  "version": "1.1",
  "source": "ai-service",
  "payload": {
    "competitionId": "string",
    "userId": "string",
    "role": "CLIMBER | GYM_ADMIN",
    "page": "scorecard | leaderboard | route-statistics | results",
    "question": "string",
    "history": [{ "role": "user | assistant", "text": "string" }],
    "requestedAt": "ISO-8601"
  }
}
```

- `userId` and `role` always come from the access token, never from the request body.
- `page` is the page the chatbot was opened on. A Climber's chatbot sends `scorecard` or `leaderboard`, and a Gym Administrator's sends `route-statistics`, `results`, or `leaderboard`. It decides which approved data goes with the question.
- `history` is the last few messages of the conversation on that page, so a follow-up question makes sense. It's sent to the AI as text, the same as the question.
- Nothing is saved: TopSend keeps no record of a question, the conversation, or the answer.

### Purpose
- Trigger AI analysis using official result data only.
- Allow the system to respond to route explanations and recommendations without modifying official results or grades.
- Give the AI the least data the page's questions need, and nothing that identifies another person.

## 13. Event invariants

- Official result or ranking events must always be generated from persisted official records.
- AI events must be read-only and cannot trigger write operations to official result or route-grade data.
- An AI request is answered only after the role and access check, and before a competition's start time a Climber's request is refused like their scorecard and leaderboard.
- Leaderboard and scorecard updates must be recomputed after every official result save, change, or deletion.
- A page update must name only the kind of data that changed, never the data, and must reach only the roles whose pages show it.
- Route statistics events must be derived from confirmed competition result data.
- All event payloads must carry timestamps and stable identifiers for traceability.
