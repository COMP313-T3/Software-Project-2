# TopSend Interfaces and API Contracts

## 1. Public Interfaces

This document defines the public boundaries for the TopSend MVP. It is derived from the user roles, functional requirements, and the competition workflow described in the source documentation.

### 1.1 Authentication and role access

#### POST /api/auth/login

Request body:

```json
{
  "email": "user@example.com",
  "password": "string"
}
```

Response:

```json
{
  "userId": "string",
  "role": "ADMIN | GYM_ADMIN | CLIMBER",
  "token": "jwt-or-session-token",
  "expiresAt": "ISO-8601 timestamp"
}
```

Errors:

```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "The provided credentials are invalid."
}
```

### 1.2 Climber registration

#### POST /api/users/climbers

Request body:

```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "password": "string",
  "role": "CLIMBER"
}
```

Response:

```json
{
  "userId": "string",
  "status": "created",
  "role": "CLIMBER"
}
```

### 1.3 Gym Administrator access requests

#### POST /api/gym-admin-requests

Request body:

```json
{
  "requesterUserId": "string",
  "gymId": "string | null",
  "requestType": "NEW_GYM | EXISTING_GYM",
  "details": "string"
}
```

Response:

```json
{
  "requestId": "string",
  "status": "PENDING"
}
```

#### PATCH /api/gym-admin-requests/{requestId}/approve

Request body:

```json
{
  "approvedBy": "adminUserId",
  "decision": "APPROVE | REJECT",
  "notes": "string"
}
```

### 1.4 Competition creation

#### POST /api/competitions

Request body:

```json
{
  "gymId": "string",
  "name": "string",
  "date": "ISO-8601 date",
  "location": "string",
  "description": "string",
  "maxParticipants": 120,
  "registrationOpen": true
}
```

Response:

```json
{
  "competitionId": "string",
  "gymId": "string",
  "name": "string",
  "status": "DRAFT | OPEN | CLOSED"
}
```

### 1.5 Competition division management

#### POST /api/competitions/{competitionId}/divisions

Request body:

```json
{
  "name": "Beginner",
  "description": "string"
}
```

Response:

```json
{
  "divisionId": "string",
  "competitionId": "string",
  "name": "Beginner"
}
```

#### POST /api/competitions/{competitionId}/divisions/{divisionId}/assignments

Request body:

```json
{
  "climberId": "string"
}
```

### 1.6 Route / boulder problem management

#### POST /api/competitions/{competitionId}/routes

Request body:

```json
{
  "routeNumber": "8",
  "name": "Problem 8",
  "grade": "V4",
  "pointValue": 25,
  "notes": "string",
  "official": true
}
```

Response:

```json
{
  "routeId": "string",
  "competitionId": "string",
  "grade": "V4",
  "official": true
}
```

### 1.7 Registration

#### POST /api/competitions/{competitionId}/registrations

Request body:

```json
{
  "climberId": "string",
  "divisionId": "string"
}
```

Response:

```json
{
  "registrationId": "string",
  "status": "CONFIRMED",
  "divisionId": "string",
  "competitionId": "string"
}
```

### 1.8 Official result entry

#### POST /api/competitions/{competitionId}/results

Request body:

```json
{
  "climberId": "string",
  "routeId": "string",
  "attempts": 4,
  "sends": 1,
  "flash": false,
  "score": 25
}
```

Response:

```json
{
  "resultId": "string",
  "climberId": "string",
  "routeId": "string",
  "officialScore": 25,
  "status": "saved"
}
```

### 1.9 Leaderboard and scorecard queries

#### GET /api/competitions/{competitionId}/leaderboard

Response:

```json
[
  {
    "rank": 1,
    "climberId": "string",
    "score": 100,
    "division": "Beginner"
  }
]
```

#### GET /api/climbers/{climberId}/scorecards?competitionId={id}

Response:

```json
{
  "competitionId": "string",
  "climberId": "string",
  "routesCompleted": 5,
  "routesUnfinished": 3,
  "score": 185,
  "results": [
    {
      "routeId": "string",
      "attempts": 3,
      "sends": 1,
      "flash": false,
      "officialScore": 25
    }
  ]
}
```

### 1.10 AI route assistant

#### POST /api/ai/route-assistant

Request body:

```json
{
  "competitionId": "string",
  "userId": "string",
  "question": "Which V4 route was harder than expected?"
}
```

Response:

```json
{
  "answer": "Problem 11 had a much lower completion rate and higher average attempts than the other V4 routes.",
  "dataSources": [
    "official_results",
    "route_statistics"
  ],
  "confidence": "medium"
}
```

## 2. Shared service interfaces

```ts
interface AuthService {
  login(email: string, password: string): Promise<AuthSession>;
  authorize(userId: string, requiredRole: Role): Promise<boolean>;
}

interface UserService {
  createClimber(input: CreateClimberInput): Promise<User>;
  requestGymAdminAccess(input: GymAdminRequestInput): Promise<GymAdminRequest>;
  approveGymAdminRequest(requestId: string, approverId: string, decision: string): Promise<void>;
}

interface CompetitionService {
  createCompetition(input: CreateCompetitionInput): Promise<Competition>;
  createDivision(competitionId: string, input: CreateDivisionInput): Promise<Division>;
  assignClimberToDivision(competitionId: string, divisionId: string, climberId: string): Promise<void>;
  createRoute(competitionId: string, input: CreateRouteInput): Promise<Route>;
}

interface RegistrationService {
  registerClimber(competitionId: string, climberId: string, divisionId: string): Promise<Registration>;
  validateCapacity(competitionId: string): Promise<boolean>;
}

interface ScoringService {
  recordOfficialResult(input: OfficialResultInput): Promise<OfficialResult>;
  calculateLeaderboard(competitionId: string): Promise<LeaderboardEntry[]>;
}

interface AnalyticsService {
  computeRouteStatistics(competitionId: string): Promise<RouteStatistics[]>;
  answerRouteQuestion(competitionId: string, userId: string, question: string): Promise<AiAnswer>;
}
```

## 3. External integration contracts

### Google Maps API behavior

- Map loads shall fail gracefully when service latency exceeds the expected threshold.
- If the Google Maps service is unavailable, the UI must show an error or loading state and preserve the list view.
- The application shall not block the user from discovering competitions in list form when the map is unavailable.

### Persistence and data integrity rules

- Registration and result writes must be atomic.
- A failed result save must not leave partial results.
- Leaderboard data must be recomputed from persisted official results.
- AI recommendation calls must read from official result data only.

## 4. Contract assumptions

- TopSend uses a shared authentication subsystem for all authenticated users.
- The role context is enforced on the server side, not only in the client UI.
- Official results, route grades, and rankings are authoritative and can be edited only by authorized gym staff or platform administrators as defined by the project rules.
- AI features are read-only with respect to official competition outcomes.
