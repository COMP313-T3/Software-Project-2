# TopSend Interfaces and API Contracts

## 1. Public Interfaces

This document defines the public boundaries for the TopSend MVP. It is derived from the user roles, functional requirements, and the competition workflow described in the source documentation. Field names follow contracts/domain.md, and Section 1.12 lists every route the API has.

Errors use one shape: `{ "error": "CODE", "message": "..." }`, plus `fields` with one message per field for validation errors, and `errorId` for unexpected server errors.

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
  "token": "JWT access token",
  "expiresAt": "ISO-8601 timestamp"
}
```

The request needs the CSRF token from GET /api/auth/csrf in the X-CSRF-Token header. A successful login also sets the refresh cookie that POST /api/auth/refresh uses.

Errors:

```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect."
}
```

After 10 failed attempts for one email within 15 minutes, the email is locked for 15 minutes:

```json
{
  "error": "LOGIN_LOCKED",
  "message": "Too many failed attempts. Try again in 15 minutes."
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
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "MALE | FEMALE | PREFER_NOT_TO_SAY",
  "phone": "string",
  "address": "string",
  "postalCode": "string",
  "country": "ISO 3166-1 alpha-2 code",
  "location": { "lat": 43.65, "lng": -79.38 },
  "acceptedTerms": true,
  "recaptchaToken": "string"
}
```

`location` is optional. The server always creates a CLIMBER and ignores any role in the request.

Response:

```json
{
  "userId": "string",
  "status": "created",
  "role": "CLIMBER"
}
```

Errors: 409 `EMAIL_TAKEN` when the email already has an account, 400 `VALIDATION_ERROR` with `fields`, and 400 `RECAPTCHA_FAILED` or 503 `RECAPTCHA_UNAVAILABLE` from the reCAPTCHA check.

### 1.3 Administrator dashboard

#### GET /api/admin/dashboard

Requires a valid access token for a user with the `ADMIN` role. Returns registered gym counts
by status, platform user counts by role, and pending gym administrator requests by type.

Response:

```json
{
  "gyms": {
    "total": 12,
    "active": 9,
    "pending": 2,
    "inactive": 1
  },
  "users": {
    "total": 250,
    "admins": 2,
    "gymAdmins": 18,
    "climbers": 230
  },
  "pendingRequests": {
    "total": 3,
    "newGyms": 1,
    "existingGyms": 2
  }
}
```

### 1.4 Gym Administrator access requests

Not built yet (US-034, US-035).

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

### 1.5 Competitions

These routes need the access token of a GYM_ADMIN assigned to at least one ACTIVE gym. Without a login they answer 401, for any other role 403 `ROLE_FORBIDDEN`, and for a Gym Admin without an active gym 403 `NO_ASSIGNED_GYM`. Every read and write is limited to the Gym Admin's active gyms, and a competition in any other gym answers 404 `COMPETITION_NOT_FOUND`.

#### POST /api/gym-admin/competitions

Request body:

```json
{
  "gymId": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
  "location": "string",
  "description": "string",
  "capacity": 120
}
```

- `gymId` is needed only when the Gym Admin has more than one active gym, and must be one of them.
- `date` is a calendar date in Toronto, from today to two years ahead.
- `location` is optional and defaults to the gym's location. `description` is optional.
- `capacity` is a whole number from 1 to 1000.

Response (201): the new competition, as a DRAFT with registration CLOSED, shaped like GET /api/gym-admin/competitions/{competitionId} without `registeredClimberCount`.

Errors: 404 `GYM_NOT_FOUND` when `gymId` isn't one of the Gym Admin's active gyms, and 409 `COMPETITION_EXISTS` when the gym already has a competition with that name on that date, ignoring case.

#### GET /api/gym-admin/competitions/{competitionId}

Response:

```json
{
  "_id": "string",
  "gymId": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
  "location": "string",
  "description": "string",
  "capacity": 120,
  "registrationStatus": "OPEN | CLOSED",
  "status": "DRAFT | PUBLISHED | CANCELLED",
  "createdBy": "string",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "gym": { "_id": "string", "name": "string" },
  "tools": [{ "key": "details", "label": "Competition details", "story": "US-013" }],
  "registeredClimberCount": 0
}
```

`registeredClimberCount` counts CONFIRMED registrations.

#### PATCH /api/gym-admin/competitions/{competitionId}

Request body, with at least one field:

```json
{
  "name": "string",
  "date": "YYYY-MM-DD",
  "location": "string",
  "description": "string",
  "capacity": 120,
  "registrationStatus": "OPEN | CLOSED"
}
```

- A changed `date` follows the same rule as a new competition's.
- `capacity` can't go below the number of CONFIRMED registrations.
- `status` can't be set directly. Opening registration on a DRAFT also makes it PUBLISHED. Closing registration later keeps it PUBLISHED.

Response: the competition, shaped like GET /api/gym-admin/competitions/{competitionId}.

Errors: 400 `VALIDATION_ERROR` with the message "Change at least one competition detail." when the body has none of these fields, and 409 `COMPETITION_EXISTS` as for creation.

### 1.6 Competition division management

Not built yet (US-014).

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

### 1.7 Route / boulder problem management

Not built yet (US-016).

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

### 1.8 Registration

Not built yet (US-028).

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

### 1.9 Official result entry

Not built yet (US-019).

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

### 1.10 Leaderboard and scorecard queries

Not built yet (US-020, US-031, US-032).

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

### 1.11 AI route assistant

Not built yet (US-023, US-033).

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

### 1.12 Route summary

Every route the API has. "Logged in" means a valid access token in the Authorization header. Every POST, PUT, PATCH and DELETE request from a browser must come from an allowed origin.

| Method | Path | Who can call it | Story |
| --- | --- | --- | --- |
| GET | /api/health | Anyone | T-001 |
| GET | /api/auth/csrf | Anyone | US-001 |
| POST | /api/auth/login | Anyone, with the CSRF token | US-001 |
| POST | /api/auth/refresh | Anyone with a refresh cookie, with the CSRF token | US-001 |
| POST | /api/auth/logout | Anyone with a refresh cookie, with the CSRF token | US-001 |
| GET | /api/auth/me | Logged in | US-001 |
| POST | /api/auth/forgot-password | Anyone | US-001 |
| POST | /api/auth/reset-password/check | Anyone with a reset link | US-001 |
| POST | /api/auth/reset-password | Anyone with a reset link | US-001 |
| POST | /api/session/ping | Logged in | US-001 |
| POST | /api/users/climbers | Anyone | US-002 |
| GET | /api/geocode/place | Anyone | US-002 |
| GET | /api/geocode/location | Anyone | US-002 |
| GET | /api/admin/dashboard | ADMIN | US-003 |
| GET | /api/gyms | ADMIN | US-004 |
| POST | /api/gyms | ADMIN | US-004 |
| GET | /api/gyms/{gymId} | ADMIN | US-005 |
| PATCH | /api/gyms/{gymId} | ADMIN | US-005 |
| PATCH | /api/gyms/{gymId}/deactivate | ADMIN | US-005 |
| PATCH | /api/gyms/{gymId}/activate | ADMIN | US-005 |
| GET | /api/gyms/{gymId}/admin-candidates | ADMIN | US-006 |
| GET | /api/gyms/{gymId}/admins/{userId} | ADMIN | US-006 |
| PUT | /api/gyms/{gymId}/admins/{userId} | ADMIN | US-006 |
| DELETE | /api/gyms/{gymId}/admins/{userId} | ADMIN | US-006 |
| GET | /api/gym-admin/dashboard | GYM_ADMIN of an active gym | US-011 |
| GET | /api/gym-admin/competitions | GYM_ADMIN of an active gym | US-011 |
| POST | /api/gym-admin/competitions | GYM_ADMIN of an active gym | US-012 |
| GET | /api/gym-admin/competitions/{competitionId} | GYM_ADMIN of an active gym | US-011, US-013 |
| PATCH | /api/gym-admin/competitions/{competitionId} | GYM_ADMIN of an active gym | US-013 |

GET /api/gyms/{gymId}/admin-candidates lists the active GYM_ADMIN accounts with an APPROVED request for the gym that aren't assigned to it yet. PUT /api/gyms/{gymId}/admins/{userId} assigns only such an account.

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
