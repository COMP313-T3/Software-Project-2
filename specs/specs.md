# TopSend Spec
_Version: 1.1 | Owner: TopSend Team | Status: Draft | Last Updated: 2026-11-09_

## 1. Problem Statement

TopSend is a Toronto-focused web platform for local indoor bouldering competitions. It is designed to bring the main workflow for a local competition into one system so that a climbing gym does not need either a broad gym-management solution or a basic scoring tool with no analytics.

The project is derived from the approved project documentation and focuses on the core workflow required to run a local bouldering competition:

- a gym administrator creates and manages competitions,
- climbers discover events and register,
- divisions and boulder problems are managed for the selected competition,
- official results are recorded and scored,
- live leaderboards and scorecards are displayed,
- route statistics are calculated from official results,
- the AI Route Assistant, a chatbot inside the pages that need it, explains current competition data and route performance,
- AI does not change official scores, rankings, winners, or route grades.

The platform must support the approved roles: ADMIN, GYM_ADMIN, CLIMBER, and VISITOR. The VISITOR is an unauthenticated public user. The user does not select a role during login; the system retrieves the assigned role from the account after authentication.

### Measurable success criteria

- A gym can create and run a local bouldering competition in one workflow.
- A Climber can create an account, discover competitions, register, and view their event progress.
- A Gym Administrator can configure scoring and record official competition results.
- A System Administrator can review and approve Gym Administrator access requests.
- A competition leaderboard updates based on official saved results.
- The AI Route Assistant explains available competition statistics using official results and never modifies official competition data.

## 2. Scope & Non-Goals

### In Scope

- Toronto indoor climbing gyms and local bouldering competitions
- Shared login and role-based access control
- Climber account creation
- Gym registration and Gym Administrator access approval
- Gym administration
- Competition creation and management, including each competition's start time
- Divisions and registered Climbers
- Boulder problems / routes
- Scoring configuration and official result entry
- Competition discovery and List View
- Google Maps Competition Map View
- Competition registration and registration status
- Live leaderboards and rankings
- Scorecards and route statistics
- A countdown to each competition's start, when its scorecard and leaderboard open to Climbers
- Competition history
- AI Route Assistant chatbot inside the scorecard, leaderboard, and statistics pages
- Visitor landing page introducing TopSend
- Responsive web experience for desktop, tablet, and mobile

### Non-Goals

- Provincial, national, or IFSC competition management
- Lead climbing or speed climbing support
- Full gym membership, payroll, POS, or employee scheduling features
- Native Android or iOS applications
- AI changing official scores, official results, rankings, winners, or route grades
- Automatic route grading via photographs or computer vision
- Support outside the Toronto local bouldering scope in the first version

## 3. Project Roles and Stakeholders

### Approved role names

| Role | Exact name | Description |
|---|---|---|
| ADMIN | ADMIN | System Administrator |
| GYM_ADMIN | GYM_ADMIN | Gym Administrator / Event Organizer |
| CLIMBER | CLIMBER | Climber |
| VISITOR | VISITOR | Unauthenticated/public user |

### Stakeholders and concerns

| Role | Primary concerns |
|---|---|
| ADMIN | Manage gyms, user permissions, access requests, and platform settings |
| GYM_ADMIN | Create competitions, manage divisions, create routes, record official results, manage event operations |
| CLIMBER | Discover competitions, register, view scorecards, view rankings, ask AI Route Assistant questions |
| VISITOR | View public information, create a CLIMBER account, submit gym registration or Gym Admin access requests |

## 4. User Stories

The approved user stories are the project source-of-truth and must not be merged, renamed, or reinterpreted.

### Iteration 1

- US-001: User Login
- US-002: Create Climber Account
- US-003: Admin Dashboard
- US-004: Manage Gyms
- US-005: Gym Details
- US-006: Manage Gym Administrators
- US-011: Gym Admin Dashboard
- US-012: Competition Creation
- US-013: Competition Details
- US-014: Divisions and Climbers
- US-015: Climber Details
- US-016: Routes / Boulder Problems
- US-017: Route Details
- US-018: Configure Scoring Format
- US-025: Discover Competitions
- US-026: Competition List View
- US-027: Competition Map View
- US-028: Event Registration
- US-029: Check Registration Status
- US-034: Submit Gym Registration
- US-035: Review Gym Administrator Access Requests

### Iteration 2

- US-007: Administrator Details
- US-008: Manage Users
- US-009: User Details
- US-010: System Configuration and Advanced Settings
- US-019: Result Entry
- US-020: Live Leaderboard and Displays
- US-021: Display Customization
- US-022: Route Statistics
- US-023: Gym Admin AI Route Assistant
- US-024: Competition History
- US-030: My Events
- US-031: My Scorecard
- US-032: Ranking and Leaderboard
- US-033: Climber AI Route Assistant
- US-036: Visitor Landing Page

### Dependency rule

- Independent tasks may be completed before dependent tasks in the same iteration.
- If a task depends on a later user story in the same iteration, the task remains assigned to its original story and is marked as blocked until the required capability is available.
- User Story IDs are not redesigned, merged, or replaced to solve dependency ordering.

## 5. Functional Requirements

The project has 12 approved functional requirements, aligned to the requirement document and user stories.

### FR-001: Shared authentication and role access
- Inputs: username/email and password
- Preconditions: the account exists and the role is stored on the account
- Behavior: the system validates credentials through a shared login process and returns the correct role-based application context
- Outputs / side effects: authenticated session, role-based navigation, protected route access control
- Error cases: invalid credentials, expired or invalid session, unauthorized access attempt
- Priority: Must
- Linked User Stories: US-001
- Linked Acceptance Criteria: AC-001, AC-002

### FR-002: Climber account creation and gym-admin access requests
- Inputs: registration data for a new CLIMBER account or a gym access request
- Preconditions: the VISITOR is not authenticated; required fields are valid
- Behavior: the system allows a VISITOR to create a CLIMBER account or submit a request for gym registration or Gym Administrator access
- Outputs / side effects: new CLIMBER account or new pending admin request
- Error cases: duplicate email, invalid fields, denied request, missing required details
- Priority: Must
- Linked User Stories: US-002, US-034, US-035, US-036
- Linked Acceptance Criteria: AC-003, AC-004, AC-005, AC-020

### FR-003: System Administration
- Inputs: gym, users, permissions, access requests, settings actions
- Preconditions: authenticated user has ADMIN role
- Behavior: the system allows an ADMIN to manage registered gyms, Gym Administrator accounts, users, permissions, and system settings
- Outputs / side effects: account approvals, permissions updates, gym records updated, settings saved
- Error cases: non-admin access attempts, invalid target account, unauthorized change
- Priority: Must
- Linked User Stories: US-003, US-004, US-005, US-006, US-007, US-008, US-009, US-010, US-035
- Linked Acceptance Criteria: AC-005, AC-006

### FR-004: Competition creation and management
- Inputs: competition details, gym association, capacity, date, start time, description, scoring settings, starting divisions
- Preconditions: authenticated user has GYM_ADMIN role for the selected gym
- Behavior: the system creates and stores the competition linked to the correct gym and event configuration, at the gym's location, with the start time the Gym Administrator chose, in Toronto time
- Outputs / side effects: competition record, its start time, its first divisions, registration state, participant capacity, event status
- Error cases: invalid competition data, unauthorized gym, missing details, invalid date, missing or invalid start time
- Priority: Must
- Linked User Stories: US-011, US-012, US-013, US-014
- Linked Acceptance Criteria: AC-007, AC-008, AC-021

### FR-005: Divisions and Climber management
- Inputs: division information and registered Climbers
- Preconditions: competition exists and the GYM_ADMIN has permission for that gym
- Behavior: the system allows creation of divisions, each chosen from the four division names (Open, Beginner, Youth, and Advanced), and assignment of registered Climbers to each division
- Outputs / side effects: division record, assigned participant groups, competition-specific grouping
- Error cases: a name outside the four division names, duplicate division names, invalid assignment, unauthorized assignment
- Priority: Must
- Linked User Stories: US-014, US-015
- Linked Acceptance Criteria: AC-009

### FR-006: Boulder problems / routes
- Inputs: route number/name, official V-grade, point value, notes
- Preconditions: competition exists; authorized gym staff are acting on that competition
- Behavior: the system stores official route data and ensures the route grade is controlled by authorized users
- Outputs / side effects: route record, official grade, notes, scoring metadata
- Error cases: invalid grade values, unauthorized modification, duplicate route identity
- Priority: Must
- Linked User Stories: US-016, US-017
- Linked Acceptance Criteria: AC-010

### FR-007: Competition discovery list view
- Inputs: available competition data, search/filter criteria, an optional starting point (the Climber's current location, a place they search for, or their saved location) with a distance, and an order
- Preconditions: the user is a CLIMBER or the feature is publicly available by project approval
- Behavior: the system displays upcoming competitions and allows filtering, viewing, and selection of an event; with a starting point, it shows each competition's distance and can keep only the ones within the chosen distance; it orders them soonest first, closest first, by most Climbers joined, by most spaces left, or randomly
- Outputs / side effects: list of competitions with Climbers joined, spaces left, and distances, event details page navigation
- Error cases: no matching competitions, invalid filters, unavailable event details, location access refused or unavailable, no starting point for a distance or the closest-first order
- Priority: Must
- Linked User Stories: US-025, US-026
- Linked Acceptance Criteria: AC-011

### FR-008: Competition Map View with Google Maps
- Inputs: map request for competition locations
- Preconditions: Google Maps API is available and configured
- Behavior: the system shows map pins for available competition locations and allows map selection to open event details; with a starting point, it also shows the starting point and the chosen distance around it
- Outputs / side effects: map markers, the starting point and its distance circle, navigation to event details
- Error cases: service unavailable, timeout, slow response, map load failure
- Priority: Must in the approved project requirement set
- Linked User Stories: US-027
- Linked Acceptance Criteria: AC-012

### FR-009: Competition registration
- Inputs: selected competition, division, Climber identity, status checks
- Preconditions: CLIMBER is authenticated, registration is open, and capacity remains available
- Behavior: the system validates the registration rules and confirms the Climber’s registration for the correct division
- Outputs / side effects: registration record, updated remaining capacity, status visible to the Climber
- Error cases: event closed, full capacity, duplicate valid registration, invalid division
- Priority: Must
- Linked User Stories: US-028, US-029, US-030
- Linked Acceptance Criteria: AC-013

### FR-010: Configure scoring format and record results
- Inputs: the competition's scoring settings (the deduction per failed attempt and the maximum attempts per problem), route, Climber, attempts, sends, flash conditions
- Preconditions: competition exists and the user is GYM_ADMIN
- Behavior: the system stores the scoring settings for the competition and records official Climber results according to them: a top scores the problem's points less the deduction for each failed attempt before it, and a problem not topped within the maximum attempts scores 0
- Outputs / side effects: official result saved, score recalculated, rankings updated
- Error cases: invalid scoring settings, unauthorized actor, partial save, invalid result payload
- Priority: Must
- Linked User Stories: US-018, US-019
- Linked Acceptance Criteria: AC-014, AC-015

### FR-011: Live leaderboards, rankings, and scorecards
- Inputs: official competition results, current event state, and the competition's start time
- Preconditions: official results exist for the current competition; for a CLIMBER or a VISITOR, the competition has started
- Behavior: the system displays live rankings and private scorecards using official results and role-based visibility rules. A Climber's scorecard is a scorecard sheet that scrolls with the page, over the competition's background, and shows each problem's attempts against the attempt limit, such as 2/6. A Climber's leaderboard shows the standings of their own division, and a Gym Administrator chooses which division to view. Until the competition's start time, a Climber's event shows a countdown to the start, and only their registration status can be opened
- Outputs / side effects: leaderboard updates, public and private display states, scorecard data, the countdown to the start
- Error cases: stale values, unauthorized viewing, failed update, public access not enabled, competition not started yet
- Priority: Must
- Linked User Stories: US-020, US-021, US-030, US-031, US-032
- Linked Acceptance Criteria: AC-016, AC-017, AC-021

### FR-012: Route statistics and AI Route Assistant
- Inputs: official results, route statistics, Climber data, current competition context, the page the user is on, the user's question, and the earlier messages of the same chat
- Preconditions: route data and results are available; for a CLIMBER, the competition has started
- Behavior: the system calculates completion rate, average attempts, and flash rate, and the AI Route Assistant explains available competition data and recommendations without modifying official data. The assistant is a chatbot that opens inside the pages that need it, not a page of its own: My scorecard and the leaderboard for a CLIMBER, and Route statistics, Result entry, and the Live leaderboard for a GYM_ADMIN. It already knows the competition, the page, and the user's role, greets a first-time user with a short welcome, and offers suggested questions to click
- Outputs / side effects: route statistics, AI explanations, route recommendations, ranking comparisons, the conversation shown in the chatbot
- Error cases: no data available, AI service unavailable or busy, invalid prompts, a question outside the competition, attempt to mutate official result data, attempt to read data the user isn't allowed to see
- Priority: Must
- Linked User Stories: US-022, US-023, US-024, US-033
- Linked Acceptance Criteria: AC-018, AC-019, AC-022

## 6. Non-Functional Requirements

| ID | Category | Requirement | Measurement | Threshold | SLO |
|---|---|---|---|---|---|
| NR-001 | Performance | TopSend pages and normal user actions shall respond within acceptable times during regular use. | Page-load and common action tests | 95% of page loads and normal actions within 3 seconds, excluding unavailable third-party services | 95% |
| NR-002 | Security | Authenticated features and user credentials shall be protected from unauthorized access. | Authorization, password, and location checks | 100% of protected-page authorization tests pass; passwords are not stored in plain text; a Climber's current location is only used for the search that asks for it, and is never stored, logged, or put in the page address | 100% |
| NR-003 | Google Maps reliability | The Competition Map View shall remain usable even when Google Maps data is loading or unavailable. | Map service failure simulation | The map shall display markers or a clear loading/error state within 5 seconds; the list view remains available | 99% |
| NR-004 | Data integrity | Competition registrations, official results, scores, and rankings shall remain accurate when saved or when a save fails. | Save/refresh and transaction tests | No partial or duplicate record after a failed save; leaderboard and scorecard values match the latest valid official results | 99.9% |
| NR-005 | Usability | TopSend shall remain usable on common desktop, tablet, and mobile screen sizes. | Responsive layout testing | Core pages shall work at around 360px mobile, 768px tablet, and 1440px desktop without horizontal scrolling. On phones (screens under 768px wide), the logged-in pages show their text and controls 15% smaller than on larger screens, with no text under 11px and form fields at 16px | 100% |
| NR-006 | Maintainability / error handling | Application errors shall be handled consistently and logged without exposing sensitive technical details to users. | Error handling and logging checks | User-facing errors are readable; server logs include timestamps and operation context; stack traces and sensitive technical details are not exposed to normal users | 100% |

## 7. Business Rules and Edge Cases

- VISITOR is not authenticated and cannot access protected routes.
- A CLIMBER cannot alter official results, rankings, winners, or route grades.
- ADMIN approval is required before a VISITOR becomes GYM_ADMIN.
- Climber self-registration does not require System Administrator approval.
- A GYM_ADMIN can only manage competitions and routes for their authorized gym.
- Registration is denied if a competition is closed or capacity is reached.
- A Climber cannot create a duplicate valid registration for the same competition.
- A competition remains associated with the correct gym and competition record.
- A route grade is controlled by authorized users and not altered by AI.
- An official result or leaderboard value must be derived from official saved results, not from AI-generated data.
- Failed saves must not leave partial or duplicate results behind.
- If Google Maps fails, the Competition List View still remains available.
- A distance search or the closest-first order needs a starting point. When the browser can't share the Climber's location, the Climber can try again, search for a place, or search without a starting point.
- A division's name is one of Open, Beginner, Youth, or Advanced, and a competition has each of them at most once. A division saved earlier under another name keeps working, but no new one can be created with it.
- Every new competition has a start time, in Toronto time. A competition saved before start times existed counts as starting at 12:00 a.m. on its date until its Gym Administrator sets one.
- Until a PUBLISHED competition's start time, a CLIMBER can open its event details and their registration status only. Their scorecard, the leaderboard, live updates, and the AI Route Assistant open at the start time, and the server refuses them before it. The public leaderboard opens to a VISITOR at the same time. A GYM_ADMIN of the competition's gym is never held back.
- A Climber records their own results from the competition's start time until the end of the competition day.
- The AI Route Assistant is only offered inside the pages listed in FR-012. It gets the least data the page's questions need, and never a name, an email, an ID, a password, a token, an API key, or a setting of the server.

## 8. Acceptance Criteria and Scenario Catalog

### AC-001: Shared login access
Given a registered ADMIN, GYM_ADMIN, or CLIMBER with valid credentials, when they submit the login form, then the system authenticates and grants access only to features allowed for that assigned role.

### AC-002: Invalid credentials
Given an invalid username or password, when a user attempts to sign in, then the system rejects the login and displays an appropriate error without granting access.

### AC-003: Climber self-registration
Given a VISITOR with valid account information, when they submit the registration form, then a CLIMBER account is created and the user can sign in with it.

### AC-004: Duplicate account rejection
Given a duplicate email or account identifier, when a VISITOR submits a registration request, then the request is rejected and a validation message is shown.

### AC-005: Gym Administrator approval flow
Given a VISITOR submits a gym registration or Gym Administrator access request, when an ADMIN approves it, then the request becomes active and the user can complete GYM_ADMIN setup; when rejected, then no GYM_ADMIN access is granted.

### AC-006: ADMIN enforcement
Given a non-ADMIN user, when they attempt to view or use a system-admin feature, then access is denied.

### AC-007: Competition creation
Given an authorized GYM_ADMIN, when they create a competition with valid details, including its date and start time, then the competition is created and connected to the correct gym.

### AC-008: Capacity and event state
Given a competition is created, when a GYM_ADMIN sets capacity or registration state, then the value is stored and enforced for the event.

### AC-009: Division assignment
Given a competition and valid registered Climbers, when a GYM_ADMIN assigns a Climber to a division, then the assignment is saved for that competition only. When a GYM_ADMIN creates a division, then they choose its name from Open, Beginner, Youth, and Advanced, and any other name is refused.

### AC-010: Official V-grade integrity
Given a route is created with an official V-grade, when the route is used in a competition, then the official grade remains authoritative and is not automatically changed by AI.

### AC-011: Competition discovery list view
Given a CLIMBER opens the available competitions page, when they filter or choose an event, then matching results are displayed and the event details page opens correctly. When they choose a starting point and a distance, then only competitions whose gym is within that distance are listed, each with its distance, in the order they chose.

### AC-012: Google Maps fallback
Given the Google Maps API is unavailable or slow, when the map view loads, then the system displays a loading or error state and the Competition List View remains usable.

### AC-013: Registration enforcement
Given a CLIMBER is authenticated and registration is open, when they register for a competition with capacity available, then the registration succeeds; if the event is full or closed, then it is rejected.

### AC-014: Official result entry
Given an authorized GYM_ADMIN records attempts and sends for a route, when the result is saved, then the official score is recalculated using the competition's scoring settings.

### AC-015: Partial-save safety
Given a result save fails, when the operation ends, then no partial or duplicate official result exists.

### AC-016: Live leaderboard updates
Given official results change during a competition, when the system recalculates leaderboard values, then the standings update without requiring a manual refresh. A CLIMBER sees the standings of their own division without choosing one, and a GYM_ADMIN can choose which division to view.

### AC-017: Scorecard privacy and correctness
Given a CLIMBER views their scorecard, when they choose a competition, then they see their official results and progress, without seeing unauthorized management details. The scorecard is a scorecard sheet that scrolls with the page on every screen size, and each problem shows its attempts against the attempt limit, such as 2/6.

### AC-018: AI explanation is data-grounded
Given official results exist, when a CLIMBER or GYM_ADMIN asks a route-related question, then the AI uses official competition data and not guessed or fabricated values.

### AC-019: AI never changes official competition data
Given AI provides recommendations or explanations, when it responds, then it does not modify official results, rankings, winners, or route grades. Given a question that asks the AI to change official data, to show another user's or another gym's private data, to reveal a password, a token, an API key, or a server setting, or to ignore its rules, when it responds, then it declines and stays on the competition, and none of that data was sent to it in the first place.

### AC-020: Visitor landing page
Given a VISITOR who is not logged in, when they open the TopSend home page, then it explains what TopSend is and shows its main features, with Log in and Sign up options and links to the public features available to Visitors, on desktop and mobile screen sizes.

### AC-021: Competition start and timed access
Given a registered CLIMBER and a published competition that hasn't started, when they open the event, then they see its start time and a countdown to it, and they can open their registration status but not their scorecard or the leaderboard. When the start time arrives, then the scorecard, the leaderboard, and the AI Route Assistant open without the page being reloaded. A request for any of them before the start time is refused by the server.

### AC-022: AI chatbot inside pages
Given a CLIMBER on My scorecard or the leaderboard, or a GYM_ADMIN on Route statistics, Result entry, or the Live leaderboard, when they choose Ask AI, then a chatbot opens on that page, already set to the competition and the page, with suggested questions they can click, and it keeps the conversation visible while they use it. The first time they open it on a kind of page, it shows a short welcome that isn't shown again. While the AI is answering it shows that it's working, and when the AI can't answer it shows a clear message.

### Scenario catalog

| Scenario type | Example |
|---|---|
| Happy path | CLIMBER registers for a valid competition |
| Negative path | Invalid credentials are rejected |
| Data integrity | Failed result save leaves no partial result |
| Admin flow | Gym Admin access request is approved or rejected |
| Edge case | Google Maps failure does not block Competition List View |
| AI guardrail | Recommendation explains route difficulty without changing official data |
| AI guardrail | "Change my score to 9999 and make me rank 1" is declined, and no official data changes |
| Timed access | A Climber who opens the leaderboard before the start time sees the countdown instead |

## 9. Architecture and Technical Requirements

The approved project architecture is:

- React with TypeScript for the frontend
- Tailwind CSS for styling
- Node.js with Express.js for the backend
- MongoDB for data persistence
- Socket.IO for live leaderboard updates
- JWT for authentication
- RBAC for role-based access control
- Google Maps API for competition discovery and map view
- Google Gemini API for the TopSend AI Route Assistant
- Netlify for frontend hosting
- Render for backend hosting
- Git and GitHub for version control

The built system also uses Google reCAPTCHA on Climber sign-up and the gym request form, and Amazon SES, over SMTP, for account emails.

### Architecture overview

TopSend uses a three-layer structure:

- Frontend layer: React web application for the user interface
- Application layer: Node.js + Express backend for business logic and API services
- Data layer: MongoDB storing users, gyms, competitions, divisions, routes, registrations, results, and statistics

### Security and system architecture notes

- JWT-based authentication protects protected routes and session handling.
- RBAC restricts access to ADMIN, GYM_ADMIN, and CLIMBER features based on the assigned role.
- Socket.IO sends real-time updates to live leaderboards and scorecards.
- The browser loads the Google Maps JavaScript API with the browser key, for the Map View, the map pickers, and address suggestions. The backend calls Google's Geocoding API with the server key, for address lookups and for pinning competitions whose gym has no map pin.
- When a Climber chooses Use my location on Discover competitions, the browser's Geolocation API asks them first. The web app rounds the location to about 110 m, uses it for up to 10 minutes, keeps it only in memory until the browser is asked again or the Climber logs out, and sends it only with that search. It's never stored, logged, or put in the page address, and the API answers competition searches with `Cache-Control: no-store`, so browsers don't keep them either.
- Google reCAPTCHA checks Climber sign-up and the gym request form: the browser shows the check, and the backend verifies its token.
- The backend emails password reset links and the answers to gym requests over SMTP, through Amazon SES, without making the request wait for the email.
- The backend calls the Google Gemini API for the AI Route Assistant, so the API key never reaches a browser. Gemini gets official competition data but no tools, so its answers are only text: they're shown as text, and nothing in them is saved or acted on. The chatbot in the web app only talks to the TopSend backend, which checks the user's role and access before it prepares the data for a question (Section 11).
- Each external service fails gracefully: the List View works without the map, an address can still be typed when a lookup fails, and a gym request review is saved even when its email can't be sent.

### High-level system flow

```mermaid
flowchart TB
    V[VISITOR] --> UI
    C[CLIMBER] --> UI
    GA[GYM_ADMIN] --> UI
    A[ADMIN] --> UI
    subgraph FRONTEND[Frontend layer: Netlify]
        UI[React + TypeScript + Tailwind Web App]
    end
    subgraph APPLICATION[Application layer: Render]
        API[Node.js + Express API]
        AUTH[JWT Authentication]
        RBAC[Role-based Access Control]
        SOCKET[Socket.IO]
    end
    subgraph DATA[Data layer]
        DB[(MongoDB)]
    end
    subgraph EXTERNAL[External services]
        MAPS[Google Maps JavaScript API]
        GEO[Google Geocoding API]
        CAPTCHA[Google reCAPTCHA]
        MAIL[Amazon SES over SMTP]
        AI[Google Gemini API]
    end
    UI --> API
    UI -->|Map View, map pickers, address suggestions| MAPS
    UI -->|Use my location, asked first| LOC[Browser Geolocation API]
    UI -->|Sign-up and gym request check| CAPTCHA
    API --> AUTH
    AUTH --> RBAC
    API --> SOCKET
    SOCKET -->|Live leaderboard and scorecard updates| UI
    API --> DB
    API -->|Address lookups and map pins| GEO
    API -->|Token check| CAPTCHA
    API -->|Reset links and gym request answers| MAIL
    API -->|Chatbot questions with approved data| AI
```

## 10. Iteration and Dependency Planning

The current approved two-iteration plan is:

### Iteration 1

- US-001 User Login
- US-002 Create Climber Account
- US-003 Admin Dashboard
- US-004 Manage Gyms
- US-005 Gym Details
- US-006 Manage Gym Administrators
- US-011 Gym Admin Dashboard
- US-012 Competition Creation
- US-013 Competition Details
- US-014 Divisions and Climbers
- US-015 Climber Details
- US-016 Routes / Boulder Problems
- US-017 Route Details
- US-018 Configure Scoring Format
- US-025 Discover Competitions
- US-026 Competition List View
- US-027 Competition Map View
- US-028 Event Registration
- US-029 Check Registration Status
- US-034 Submit Gym Registration
- US-035 Review Gym Administrator Access Requests

### Iteration 2

- US-007 Administrator Details
- US-008 Manage Users
- US-009 User Details
- US-010 System Configuration and Advanced Settings
- US-019 Result Entry
- US-020 Live Leaderboard and Displays
- US-021 Display Customization
- US-022 Route Statistics
- US-023 Gym Admin AI Route Assistant
- US-024 Competition History
- US-030 My Events
- US-031 My Scorecard
- US-032 Ranking and Leaderboard
- US-033 Climber AI Route Assistant
- US-036 Visitor Landing Page

### Scheduling Decision

The original MVP documentation placed US-027 (Competition Map View) in a later release. The team has since decided to include US-027 in Iteration 1.

For development scheduling, the Iteration 1 and Iteration 2 assignments in this specification are the current implementation baseline. Original MVP classifications remain unchanged as part of the submitted project documentation.

### Iteration dependency rule

- Iteration 1 must be buildable without depending on a User Story from Iteration 2.
- Iteration 2 may depend on completed work from Iteration 1.
- Dependent work inside the same iteration is allowed to remain blocked, but the User Story itself is not redesigned or split to avoid the dependency.

## 11. AI Route Assistant Guardrails

The AI Route Assistant is part of TopSend, not GitHub Copilot or any development assistant used to write software.

### Where the assistant appears

The assistant is a chatbot that opens inside the pages where it helps. It has no page of its own, and it doesn't appear on any other page.

| Role | Page | What it helps with | Suggested questions |
|---|---|---|---|
| CLIMBER | My scorecard | Which unfinished problem to try next | Which route should I try next? Which unfinished route has the best completion rate? What route looks the easiest? Explain my scorecard. |
| CLIMBER | Leaderboard | How far they are from another place | How far am I from the next rank? What is my current ranking? How many points separate me from rank 3? Explain the leaderboard to me. |
| GYM_ADMIN | Route statistics | How the problems performed | Which route was the hardest? Which route had the lowest completion rate? Which route had the highest flash rate? Summarize the route statistics. |
| GYM_ADMIN | Result entry | How the problems are going as results come in | Which route took the most attempts? Which routes look harder than their grade? Which routes have too few results to compare? Summarize the route performance for this competition. |
| GYM_ADMIN | Live leaderboard | How the competition is going behind the standings | How close is the race in each division? Which division has the highest scores? Which routes did the fewest Climbers top? Summarize the competition so far. |

- An Ask AI button opens the chatbot as a panel over the page, which stays as it is underneath: in the bottom right corner on a wide screen, and as a sheet from the bottom edge on a phone.
- The chatbot already knows the competition, the page, and the user's role, so the user never explains them.
- The first time a user opens it on a kind of page, it shows a short welcome that says what it can do. The welcome isn't shown again, and the suggested questions stay.
- A suggested question is sent with one click. The user can also type a question and send it.
- The conversation stays visible while the user stays in TopSend, and the last few messages go with each new question, so a follow-up question makes sense.
- While the AI is answering, the chatbot says so. When it can't answer, the chatbot says why in plain words, and the user's question is kept.

### How a question is answered

```mermaid
flowchart LR
    U[CLIMBER or GYM_ADMIN] -->|question, page| UI[TopSend web app]
    UI -->|access token, question, page, earlier messages| API[TopSend API]
    API --> CHECK{Role and access check}
    CHECK -->|refused| UI
    CHECK -->|allowed| DATA[Prepare the allowed data]
    DATA -->|approved data and question, no tools| AI[Google Gemini API]
    AI -->|text answer| API
    API -->|answer shown as text| UI
```

- Gemini never reaches the database. Only the TopSend API reads it, and only after the role and access check.
- The user is always the one in the access token, never one named in the request.
- A CLIMBER's question gets their own official results, the route statistics, and the places and totals of their division. A GYM_ADMIN's question gets the route statistics of one of their own gym's competitions, and on the Live leaderboard also each division's places and totals, without names.
- The question and the earlier messages are sent as text inside the data. Text that looks like an instruction or a database query, such as `{"$ne": null}` or `' OR '1'='1' --`, is only ever text: it's never used in a database query and never changes the assistant's rules.

The TopSend AI may:

- explain route performance,
- recommend routes to a Climber,
- compare route difficulty with the assigned grade,
- explain current point difference to a target ranking,
- answer questions using official competition statistics and current competition data,
- explain how the scorecard, the leaderboard, and the scoring rules of the competition work.

The TopSend AI must never:

- modify official scores,
- modify official results,
- modify official rankings,
- choose competition winners,
- change official route grades,
- override the scoring rules or official result data,
- create or delete users, or change a user's role,
- guarantee a final placement.

The TopSend AI is never given, so it can never reveal:

- another user's private information, or the name, email, or ID of any Climber,
- another gym's competition data,
- passwords or password hashes,
- authentication tokens,
- API keys, environment variables, the database connection string, or email credentials.

When a question asks for any of these, asks the assistant to ignore its rules, or isn't about the competition, the assistant declines in a sentence and offers what it can help with.

## 12. Data Model Summary

The approved TopSend data model includes at minimum:

- users
- gyms
- Gym Administrator access requests
- competitions
- divisions
- boulder problems / routes
- registrations
- official results
- route statistics

### Core domain entities

This is a summary. Every entity's ID is `_id`, and specs/contracts/domain.md has the full fields, the invariants, the lifecycles, and the entity relationship diagram.

```ts
interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'GYM_ADMIN' | 'CLIMBER';
  isActive: boolean;
}

interface Gym {
  _id: string;
  name: string;
  location: string;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  adminIds: string[];
  mapPoint?: { type: 'Point'; coordinates: [number, number] };
}

interface GymAdminRequest {
  _id: string;
  requestType: 'NEW_GYM' | 'EXISTING_GYM';
  contact: { firstName: string; lastName: string; email: string; phone: string; jobTitle?: string };
  proposedGym?: { name: string; location: string };
  gymId?: string;
  details?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  userId?: string;
}

interface Competition {
  _id: string;
  gymId: string;
  name: string;
  date: string;
  startTime?: string;
  location: string;
  description?: string;
  capacity: number;
  registrationStatus: 'OPEN' | 'CLOSED';
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  createdBy: string;
  scoring?: { deductionPercent: number; maxAttempts: number };
  mapPoint?: { type: 'Point'; coordinates: [number, number] };
}

interface Division {
  _id: string;
  competitionId: string;
  name: 'Open' | 'Beginner' | 'Youth' | 'Advanced';
}

interface Route {
  _id: string;
  competitionId: string;
  routeNumber: string;
  name?: string;
  grade: string;
  pointValue?: number;
  notes?: string;
  official: boolean;
}

interface Registration {
  _id: string;
  competitionId: string;
  climberId: string;
  divisionId: string;
  status: 'PENDING' | 'CONFIRMED' | 'WAITLIST';
}

interface OfficialResult {
  _id: string;
  competitionId: string;
  climberId: string;
  routeId: string;
  attempts: number;
  sends: number;
  flash: boolean;
  officialScore: number;
}

interface RouteStatistics {
  routeId: string;
  completionRate: number;
  averageAttempts: number;
  flashRate: number;
}
```

A VISITOR has no account, so VISITOR is never stored as a role.

## 13. Security and Compliance

- Passwords must never be stored as plain text.
- The system must use JWT authentication and RBAC.
- Protected routes must reject unauthorized access.
- System Administrator approval is required before GYM_ADMIN access is activated.
- A VISITOR cannot directly assign themselves GYM_ADMIN access.
- Sensitive technical details must not be displayed to normal users.
- The AI Route Assistant may operate only from official competition data, not from unvalidated or guessed values.
- The AI Route Assistant is reached only through the TopSend API, after the role and access check, and it's never given credentials, tokens, keys, or another user's private data.
- A Climber's scorecard, the leaderboard, and the AI Route Assistant are refused by the server until the competition's start time, not only hidden in the web app.

## 14. Review Gates

Before implementation begins, the following must be true:

- [ ] The spec matches the approved TopSend project documentation.
- [ ] All role names match the approved names: ADMIN, GYM_ADMIN, CLIMBER, VISITOR.
- [ ] User Story IDs are preserved exactly.
- [ ] Functional requirements align with the approved requirements document.
- [ ] Non-functional requirements align with the approved requirements document.
- [ ] Google Maps has both a functional requirement and measurable fallback behavior.
- [ ] AI guardrails are explicit and protect official competition data.
- [ ] Business rules cover duplicate registration, capacity, authorized gym management, and failed-save integrity.
- [ ] Architecture matches the approved technical requirements.
- [ ] Acceptance criteria remain testable and traceable to FRs and User Stories.

## 15. Traceability Summary

This specification is derived from the existing approved project files and is not an independent redesign of TopSend. It preserves the project’s approved scope, roles, story IDs, and requirements while documenting the implementation context needed for GitHub Copilot and the development team.

The main traceability anchors are:

- User stories in [docs/User_Stories/User_Stories.md](docs/User_Stories/User_Stories.md)
- Roles in [docs/Roles_and_Persona/Roles_and_Persona.md](docs/Roles_and_Persona/Roles_and_Persona.md)
- Requirements in [docs/Requirements/requirements.md](docs/Requirements/requirements.md)
- MVP in [docs/Mvp/mvp.md](docs/Mvp/mvp.md)
- Proposal and architecture in [docs/Project-Proposal/Project-Proposal.md](docs/Project-Proposal/Project-Proposal.md)

This file is the approved baseline for implementation planning and should be reviewed before coding begins.

## 16. Change Log

### Version 1.1 (2026-11-09): final fixes from the team's review

| Change | Where it's specified | Stories |
|---|---|---|
| A division's name is chosen from Open, Beginner, Youth, and Advanced | FR-005, Section 7, AC-009 | US-012, US-014 |
| A competition has a start time, and a Climber's event shows a countdown to it | FR-004, FR-011, Section 7, AC-007, AC-021 | US-012, US-013, US-028, US-030 |
| A Climber's scorecard, leaderboard, and AI Route Assistant open at the start time | FR-011, FR-012, Section 7, AC-021 | US-020, US-031, US-032, US-033 |
| The scorecard is a scrollable scorecard sheet over the competition's background, without a Flash column, with attempts shown against the limit | FR-011, AC-017 | US-031 |
| A Climber's leaderboard shows their own division, and only a Gym Administrator or the public display chooses a division | FR-011, AC-016 | US-020, US-032 |
| The AI Route Assistant is a chatbot inside the scorecard, leaderboard, and statistics pages, with a first-time welcome and suggested questions, instead of separate pages | FR-012, Section 11, AC-019, AC-022 | US-023, US-033 |
| Text and controls are 15% smaller on phones | NR-005 | All stories with a logged-in page |
