# TopSend Implementation Plan

## 1. Objective

This implementation plan converts the accepted TopSend specification into a dependency-ordered execution sequence. It follows the MVP and preserves the documented constraints from the project proposal, user stories, and requirements documents, including the approved role names, story IDs, and the rule that AI remains advisory and never writes official competition data.

## 2. Wave Structure

| Wave | Name | Scope | Gate |
|---|---|---|---|
| 0 | Foundations | Project scaffolding, shared types, auth contracts, env config, DB schema contracts | Contracts reviewed; no business logic implemented |
| 1 | Domain Core | User roles, gym records, competition, division, route models, scoring rules | Domain invariants reviewed; unit tests green |
| 2 | Application Layer | Auth service, gym onboarding, competition management, registration service | Business logic unit tests green |
| 3 | API Layer | REST endpoints, request validation, auth middleware, error mapping | API contract tests pass |
| 4 | Real-Time and Integration | Socket.IO leaderboard updates, Google Maps adapter, result event handling | Integration tests against stubs pass |
| 5 | Analytics and AI | Route statistics, scorecard aggregation, AI route assistant adapter | Data inference tests and fallbacks verified |
| 6 | Verification | E2E flows, edge-case tests, performance checks | All ACs pass |
| 7 | Production Readiness | CI pipeline, deployment configuration, runbooks, alerting | Pre-release checklist passes |

## 3. Dependency Graph

```mermaid
digraph TopSendPlan {
    W0 -> W1
    W1 -> W2
    W2 -> W3
    W3 -> W4
    W4 -> W5
    W5 -> W6
    W6 -> W7

    subgraph Wave0 { A0[Project scaffolding]; B0[Shared auth contracts]; C0[DB schema contracts]; }
    subgraph Wave1 { A1[User + role domain]; B1[Gym + competition domain]; C1[Division + route domain]; D1[Scoring rules]; }
    subgraph Wave2 { A2[Auth service]; B2[Gym onboarding service]; C2[Competition management]; D2[Registration service]; }
    subgraph Wave3 { A3[REST endpoints]; B3[Auth middleware]; C3[Error handling]; }
    subgraph Wave4 { A4[Socket leaderboard]; B4[Google Maps adapter]; C4[Official result event pipeline]; }
    subgraph Wave5 { A5[Route stats calculation]; B5[Scorecard aggregation]; C5[AI route assistant]; }
    subgraph Wave6 { A6[E2E tests]; B6[Performance tests]; C6[Regression tests]; }
    subgraph Wave7 { A7[Release config]; B7[Runbooks]; C7[Alerts]; }
}
```

## 4. Per-Task Briefs

### T-001: Project scaffolding and shared contracts
- Wave: 0
- Objective: establish repository, toolchain, and shared API/domain contracts
- Implements: FR-001, FR-002, FR-004, FR-009
- Authorized files: package config, app bootstrap, shared DTOs, auth constants, environment files
- Inputs from prior waves: none
- Outputs/contracts: app structure, auth contract, user-role enum, competition DTO contract
- Definition of done: app boots locally; shared contracts documented and reviewed
- Tests required: build passes, contract validation checks pass

### T-002: Role and user domain model
- Wave: 1
- Objective: define user, role, and gym onboarding domain objects
- Implements: FR-001, FR-002, FR-003, US-001, US-002, US-034, US-035
- Authorized files: user model, role model, admin request model, gym model
- Inputs from prior waves: T-001 contracts
- Outputs/contracts: user entity schema, role assignment rules, approval state model
- Definition of done: role invariants and validation rules defined and unit tested
- Tests required: domain tests for user creation and approval states

### T-003: Competition, division and route domain
- Wave: 1
- Objective: model competitions, divisions, route data, and score metadata
- Implements: FR-004, FR-005, FR-006, FR-010
- Authorized files: competition model, division model, route model, score format model
- Inputs from prior waves: T-001
- Outputs/contracts: competition schema, division assignment schema, official route schema
- Definition of done: core invariants validated; competition cannot exist without proper gym linkage
- Tests required: unit tests for model integrity and validation rules

### T-004: Authentication and authorization service
- Wave: 2
- Objective: implement login, session creation, and role enforcement
- Implements: FR-001, NR-002
- Authorized files: auth controller, auth service, role guard, session persistence
- Inputs from prior waves: T-002
- Outputs/contracts: login endpoint, role guard behavior, session payload
- Definition of done: valid credentials login successfully; unauthorized users are blocked
- Tests required: auth tests, RBAC tests, negative path tests

### T-005: Gym onboarding and admin approval flow
- Wave: 2
- Objective: enable visitor gym requests and admin review/approval
- Implements: FR-002, FR-003, US-034, US-035
- Authorized files: request controller, approval logic, admin review pages or modules
- Inputs from prior waves: T-002
- Outputs/contracts: request submission contract, approval state transitions
- Definition of done: pending request created; admin can approve or reject; no unauthorized access granted
- Tests required: approval workflow tests and role validation

### T-006: Competition management and registrations
- Wave: 2
- Objective: let GYM_ADMIN create events and let CLIMBER register for available events
- Implements: FR-004, FR-005, FR-009, NR-004
- Authorized files: competition service, registration service, division service
- Inputs from prior waves: T-003, T-004
- Outputs/contracts: competition creation response, registration result, capacity validation
- Definition of done: event is linked to the correct gym, registration respects open/closed state and capacity
- Tests required: registration logic and capacity tests

### T-007: API layer and request validation
- Wave: 3
- Objective: expose CRUD and action endpoints with validation and consistent error mapping
- Implements: FR-003, FR-004, FR-005, FR-006, FR-009, FR-010
- Authorized files: route handlers, DTO validation, middleware, error serializer
- Inputs from prior waves: T-004, T-005, T-006
- Outputs/contracts: REST endpoint contract, standardized API errors
- Definition of done: endpoints align with documented contract and consent to role restrictions
- Tests required: contract tests, validation tests, 400/401/403/404 scenarios

### T-008: Real-time live leaderboard
- Wave: 4
- Objective: push official rankings to live clients through Socket.IO
- Implements: FR-011, NR-001
- Authorized files: socket server, leaderboard publisher, client subscription logic
- Inputs from prior waves: T-007, T-003
- Outputs/contracts: live leaderboard event schema, subscription flow
- Definition of done: standings update when result data changes; public and private visibility rules hold
- Tests required: socket integration tests and leaderboard consistency tests

### T-009: Google Maps competition discovery adapter
- Wave: 4
- Objective: provide map-based competition view with graceful failure handling
- Implements: FR-008, NR-003
- Authorized files: map adapter service, fallback component, marker model
- Inputs from prior waves: T-007
- Outputs/contracts: map service contract, error fallback state
- Definition of done: map loads under normal conditions and fails gracefully under outage
- Tests required: success and failure simulation tests

### T-010: Score entry and official result pipeline
- Wave: 4
- Objective: support attempts, sends, flashes, and score recalculation
- Implements: FR-010, NR-004
- Authorized files: scoring service, result controller, result validation logic
- Inputs from prior waves: T-003, T-006, T-007
- Outputs/contracts: official result record, score calculation output
- Definition of done: valid results persist, invalid or partial submissions are rejected, winner calculations are consistent
- Tests required: scoring tests, duplicate and partial-save tests

### T-011: Route statistics and AI explanations
- Wave: 5
- Objective: compute completion rate, average attempts, flash rate, and recommend route actions
- Implements: FR-012, AC-018, AC-019
- Authorized files: analytics service, recommendation engine, AI adapter, route stats query service
- Inputs from prior waves: T-010, T-008
- Outputs/contracts: route-statistics output, AI prompt context, recommendation response model
- Definition of done: AI uses official competition data only; no direct mutation of official results or grades
- Tests required: route stats tests, AI guardrail tests, recommendation tests

### T-012: Scorecard and competition discovery UX
- Wave: 5
- Objective: present user-facing discovery, event details, scorecards, and competition state
- Implements: FR-007, FR-011, US-025, US-028, US-031
- Authorized files: competition detail pages, list view, scorecard screens
- Inputs from prior waves: T-007, T-008, T-011
- Outputs/contracts: event detail data, scorecard format, filter state
- Definition of done: discovered events and scorecards match official records and role visibility rules
- Tests required: UI and API integration tests

### T-013: End-to-end verification and QA
- Wave: 6
- Objective: validate entire MVP workflows and edge cases
- Implements: all FRs and acceptance criteria
- Authorized files: integration tests, regression suites, load/performance scripts
- Inputs from prior waves: all outputs and contracts
- Outputs/contracts: validation evidence and pass/fail results per AC
- Definition of done: all critical ACs and NFRs pass
- Tests required: full regression suite, responsive checks, auth checks, data integrity checks

### T-014: Production readiness
- Wave: 7
- Objective: ensure deployable, observable, and recoverable release
- Implements: NFR-001 through NFR-006 and release tooling
- Authorized files: CI pipeline, environment configs, runbooks, alerts, monitoring rules
- Inputs from prior waves: T-013 results
- Outputs/contracts: deployment checklist, observability configuration, release runbook
- Definition of done: release evidence approved and deployment configuration validated
- Tests required: infrastructure smoke tests, deployment validation, alert checks

## 5. Wave Gates

### Wave 0 gate
- Shared contracts approved
- No production logic yet
- App scaffold and environment documented

### Wave 1 gate
- Domain invariants approved
- Unit tests for user, gym, competition, and route models pass

### Wave 2 gate
- Auth, admin approval, and registration logic verified
- No unauthorized access to protected features

### Wave 3 gate
- API contract tests pass
- Request validation and error mapping consistent

### Wave 4 gate
- Live leaderboard and result pipeline verified by integration tests
- Google Maps fallback tested

### Wave 5 gate
- AI recommendations are grounded in official competition data
- No mutation of official result sources or grades

### Wave 6 gate
- Full scenario catalog passes
- All critical acceptance criteria are green

### Wave 7 gate
- Release config and runbooks approved
- Deployment checklist passes before production go-live

## 6. Critical Path

The critical path for the MVP is:

Authentication -> Gym onboarding approval -> Competition setup -> Divisions and routes -> Result entry -> Leaderboard and scorecards -> AI route assistant

This path matches the dependency order in the project MVP documentation and ensures that AI recommendations are based on real, official competition data rather than speculative or pre-competition state.
