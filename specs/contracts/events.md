# TopSend Event Contracts

## 1. Event model overview

TopSend relies on authoritative event records to drive registration, result entry, live rankings, and AI explanations. These event contracts are intentionally strict to protect score integrity and to keep AI advisory behavior separate from official competition decisions.

## 2. Event: UserLoggedIn

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
    "status": "PENDING",
    "submittedAt": "ISO-8601"
  }
}
```

### Purpose
- Track the approval workflow for Gym Administrator access.
- Allow the System Administrator to review and decide on requests.

## 4. Event: GymAdminAccessDecision

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

```json
{
  "eventName": "CompetitionCreated",
  "version": "1.0",
  "source": "competition-service",
  "payload": {
    "competitionId": "string",
    "gymId": "string",
    "name": "string",
    "date": "ISO-8601",
    "location": "string",
    "maxParticipants": 120,
    "registrationOpen": true,
    "createdAt": "ISO-8601"
  }
}
```

### Purpose
- Signal that a competition record has been created and is ready for divisions and registration setup.

## 6. Event: RegisteredForCompetition

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

```json
{
  "eventName": "LeaderboardUpdated",
  "version": "1.0",
  "source": "leaderboard-service",
  "payload": {
    "competitionId": "string",
    "leaderboard": [
      {
        "rank": 1,
        "climberId": "string",
        "score": 100,
        "division": "string"
      }
    ],
    "updatedAt": "ISO-8601"
  }
}
```

### Purpose
- Push serializable ranking changes to clients through Socket.IO.
- Keeps on-screen standings aligned with official results.

## 9. Event: RouteStatisticsCalculated

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

```json
{
  "eventName": "AiRouteRecommendationRequested",
  "version": "1.0",
  "source": "ai-service",
  "payload": {
    "competitionId": "string",
    "userId": "string",
    "question": "string",
    "requestedAt": "ISO-8601"
  }
}
```

### Purpose
- Trigger AI analysis using official result data only.
- Allow the system to respond to route explanations and recommendations without modifying official results or grades.

## 11. Event invariants

- Official result or ranking events must always be generated from persisted official records.
- AI events must be read-only and cannot trigger write operations to official result or route-grade data.
- Leaderboard updates must be recomputed after every official result save.
- Route statistics events must be derived from confirmed competition result data.
- All event payloads must carry timestamps and stable identifiers for traceability.
