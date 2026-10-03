# TopSend Domain Model

## 1. Domain overview

The TopSend domain focuses on competition management, role-based access, scoring, and route intelligence. It is based on the user stories, requirements, and MVP definition in the documentation and intentionally separates official competition data from AI guidance.

## 2. Core entities

### User

```ts
interface User {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'GYM_ADMIN' | 'CLIMBER' | 'VISITOR';
  isActive: boolean;
  createdAt: string;
}
```

**Invariants**
- A User must have exactly one active role at a time.
- Passwords must not be stored in plain text.
- Visitors cannot access protected resources without authentication.

### Gym

```ts
interface Gym {
  gymId: string;
  name: string;
  location: string;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  adminIds: string[];
  createdAt: string;
}
```

**Invariants**
- A gym is associated with one or many authorized GYM_ADMIN users.
- A competition must belong to a valid active gym.

### GymAdminRequest

```ts
interface GymAdminRequest {
  requestId: string;
  userId: string;
  gymId?: string;
  requestType: 'NEW_GYM' | 'EXISTING_GYM';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  approvedBy?: string;
  notes?: string;
}
```

**Invariants**
- A request cannot grant admin access without System Administrator approval.
- Rejected requests must not create GYM_ADMIN privileges.

### Competition

```ts
interface Competition {
  competitionId: string;
  gymId: string;
  name: string;
  date: string;
  location: string;
  description: string;
  maxParticipants: number;
  registrationOpen: boolean;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  createdBy: string;
}
```

**Invariants**
- A competition belongs to exactly one gym.
- Capacity and registration state are enforced for event registration.
- The competition must remain associated with the gym that created it.

### Division

```ts
interface Division {
  divisionId: string;
  competitionId: string;
  name: string;
  description?: string;
}
```

**Invariants**
- A division belongs only to the selected competition.
- Division assignment must be valid for that competition.

### Route

```ts
interface Route {
  routeId: string;
  competitionId: string;
  routeNumber: string;
  name: string;
  grade: string;
  pointValue?: number;
  notes?: string;
  official: boolean;
}
```

**Invariants**
- Route grade is an official setter-assigned value and cannot be automatically rewritten by AI.
- A route must belong to a valid competition.

### Registration

```ts
interface Registration {
  registrationId: string;
  competitionId: string;
  climberId: string;
  divisionId: string;
  status: 'PENDING' | 'CONFIRMED' | 'WAITLIST';
  registeredAt: string;
}
```

**Invariants**
- A climber cannot exceed the competition capacity.
- Duplicate registrations for the same competition and climber are rejected.

### OfficialResult

```ts
interface OfficialResult {
  resultId: string;
  competitionId: string;
  climberId: string;
  routeId: string;
  attempts: number;
  sends: number;
  flash: boolean;
  officialScore: number;
  savedAt: string;
}
```

**Invariants**
- Results are authoritative and cannot be modified by AI.
- A result must reference a valid competition, climber, and route.
- Partial saves are not allowed.

### LeaderboardEntry

```ts
interface LeaderboardEntry {
  rank: number;
  competitionId: string;
  climberId: string;
  division: string;
  score: number;
  updatedAt: string;
}
```

**Invariants**
- Leaderboard values are derived from official results only.
- Rank order must be deterministic and reproducible from the source results.

### RouteStatistics

```ts
interface RouteStatistics {
  routeId: string;
  completionRate: number;
  averageAttempts: number;
  flashRate: number;
  calculatedAt: string;
}
```

**Invariants**
- Statistics are computed from official results only.
- A route without result data shall show no statistics or an explicitly empty state.

## 3. Aggregates and lifecycle

### User aggregate
- contains user profile and role metadata
- lifecycle: Visitor -> CLIMBER or GYM_ADMIN after validation or approval

### Gym aggregate
- contains gym metadata and assigned admins
- lifecycle: pending -> active/inactive

### Competition aggregate
- contains competition metadata, divisions, route list, and registrations
- lifecycle: draft -> open -> closed

### Result aggregate
- contains official result entries and derived leaderboard data
- lifecycle: saved -> recalculated -> exposed to scorecards and leaderboards

## 4. Policy rules

- Only administrators or authorized gym staff may change official competition data.
- AI can explain route difficulty, completion, and ranking difference but cannot update route grades, scores, or winners.
- A non-authorized user must never observe private scorecards or competition management functions.
- A closed competition or full competition stays closed to further valid registrations.

## 5. Key domain decisions

- The system models official results as a trusted source of truth.
- AI-generated guidance is derived, not authoritative.
- Role and gym authorization are encoded as first-class invariants.
- Registration and scoring workflows remain separate to preserve data integrity.
