# TopSend Event Contracts

## 1. Event model overview

TopSend relies on authoritative event records to drive registration, result entry, live rankings, and AI explanations. These event contracts are intentionally strict to protect score integrity and to keep AI advisory behavior separate from official competition decisions.

None of these events is built yet: the API doesn't publish or store them. Each contract describes what the event will carry once it's added. Until then, the server's log lines record what happened, such as a login or a gym request decision.

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

Not built yet.

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
- A viewer who lost access gets `leaderboard:closed` with `{ "competitionId", "error", "message" }`. When the standings can't be recalculated, such as while the database is unreachable, the update is tried again up to twice, 2 seconds apart, and every viewer keeps following.
- Before a PUBLISHED competition's start time, a Climber or a public viewer who sends `leaderboard:join` is answered `{ "ok": false, "error": { "error": "COMPETITION_NOT_STARTED", "message", "details": { "startsAt" } } }`, the same refusal as the REST routes give (interfaces.md, section 1.13), and joins nothing. A Gym Administrator of the gym follows the leaderboard at any time. The `/scorecard` namespace answers `scorecard:join` the same way, so a Climber receives no live scorecard before the start either. The page joins again when its countdown reaches the start.

### Purpose
- Push ranking changes to clients through Socket.IO, without a page refresh.
- Keeps on-screen standings aligned with official results.

## 9. Event: RouteStatisticsCalculated

Not built yet.

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

## 10. Event: AiRouteRecommendationRequested

Built as REST requests from the chatbot inside the scorecard, leaderboard, and statistics pages (US-023, US-033), not as a published event: `POST /api/competitions/:competitionId/route-assistant` for a Climber and `POST /api/gym-admin/competitions/:competitionId/route-assistant` for a Gym Administrator (interfaces.md, section 1.14). Each request carries what this event describes:

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

## 11. Event invariants

- Official result or ranking events must always be generated from persisted official records.
- AI events must be read-only and cannot trigger write operations to official result or route-grade data.
- An AI request is answered only after the role and access check, and before a competition's start time a Climber's request is refused like their scorecard and leaderboard.
- Leaderboard updates must be recomputed after every official result save.
- Route statistics events must be derived from confirmed competition result data.
- All event payloads must carry timestamps and stable identifiers for traceability.
