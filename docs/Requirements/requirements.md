# Functional and Non-Functional Requirements

## Overview

This document defines the functional and non-functional requirements for TopSend.

The functional requirements explain what TopSend must do. The non‑functional requirements explain how well TopSend should work, in areas such as performance, security, reliability, usability and maintainability. I believe this covers all aspects.

Each functional requirement links to one or more user stories from user_stories markdown file. The requirements can be traced back to the original user needs. Feel free to refer to the user stories for details.

TopSend has:

- 12 Functional Requirements
- 6 Non-Functional Requirements

The requirements cover the TopSend features: authentication, gym onboarding, system administration, competition management, competition discovery, Google Maps, registration, scoring, live results, statistics and AI assistance. These features will guide our development.

---

# Functional Requirements

## Feature Area 1: Authentication and User Onboarding

This feature area covers login, Climber account creation, and the process for a gym representative to request Gym Administrator access.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-001 | The system shall provide one shared authentication process for ADMIN, GYM_ADMIN, and CLIMBER accounts and shall provide access based on the user's assigned role. | US-001 | 1. Registered users can log in using valid credentials. 2. Invalid credentials do not allow access. 3. After login, the system identifies the user's role. 4. Users can only access features allowed for their role. |
| FR-002 | The system shall allow a Guest to create a CLIMBER account or submit a request to register a gym or receive GYM_ADMIN access. Gym Administrator access shall only become active after approval by an ADMIN. | US-002, US-034, US-035 | 1. A Guest can create a CLIMBER account. 2. A Guest can submit a gym or Gym Administrator access request. 3. A submitted Gym Admin request is stored as pending. 4. An ADMIN can approve or reject the request. 5. Approval allows the user to complete GYM_ADMIN account setup. 6. Rejected requests do not receive GYM_ADMIN access. |

---

## Feature Area 2: System Administration

This feature area covers platform-level management performed by the System Administrator.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-003 | The system shall allow an ADMIN to manage registered gyms, Gym Administrator accounts, platform users, access permissions, and available system settings. | US-003, US-004, US-005, US-006, US-007, US-008, US-009, US-010, US-035 | 
1. ADMIN can view registered gyms and users. 
2. ADMIN can manage Gym Administrators connected to a gym. 
3. ADMIN can view and update permitted gym and user information. 
4. ADMIN can deactivate accounts when permitted. 
5. Non-ADMIN users cannot access System Administration features. |

---

## Feature Area 3: Competition Management

This feature area allows Gym Administrators to create and manage bouldering competitions for their assigned gym.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-004 | The system shall allow a GYM_ADMIN to create and manage bouldering competitions for their assigned gym, including the event name, date, location, description, participant capacity, and registration status. | US-011, US-012, US-013 | 1. GYM_ADMIN can create a competition for their assigned gym. 2. Required competition information can be saved. 3. The competition is connected to the correct gym. 4. The maximum participant capacity can be stored. 5. Registration can be opened or closed when supported by the competition settings. |
| FR-005 | The system shall allow a GYM_ADMIN to create competition divisions and manage Climbers registered for the selected event. | US-014, US-015 | 1. GYM_ADMIN can create divisions. 2. Registered Climbers can be viewed for the selected competition. 3. A registered Climber can be assigned to a division. 4. A Climber's division can be changed when permitted. 5. Division and Climber information remains connected to the correct competition. |
| FR-006 | The system shall allow a GYM_ADMIN to create and manage boulder problems for a competition, including route name or number, official V-grade, point value where needed, and route notes. | US-016, US-017 | 1. GYM_ADMIN can create a boulder problem. 2. The route is connected to the selected competition. 3. An official V-grade can be assigned. 4. Point values can be entered when required by the scoring format. 5. Authorized Gym Administrators can update permitted route information. 6. AI does not automatically change the official route grade. |

---

## Feature Area 4: Competition Discovery

This feature area allows Climbers to find upcoming competitions using either a normal list or a map.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-007 | The system shall allow a CLIMBER to discover available competitions and view them in a list containing basic event information. | US-025, US-026 | 1. Upcoming competitions can be displayed. 2. Each event shows its competition name, gym, date, and location. 3. Available search or filtering options can be applied. 4. Selecting a competition opens its Event Details page. |
| FR-008 | The system shall integrate with the Google Maps API to provide a Competition Map View that displays available competition locations and allows Climbers to open the related event information. | US-027 | 1. A Climber can open the Competition Map View. 2. Available competitions appear as map markers. 3. Each marker represents the location connected to the correct competition. 4. Selecting a marker displays basic competition information. 5. The Climber can continue from the selected marker to the Event Details page. |

---

## Feature Area 5: Competition Registration

This feature area manages event registration and the relationship between a Climber and a specific competition.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-009 | The system shall allow a logged-in CLIMBER to view event registration information and register for an available competition while respecting participant capacity and registration rules. | US-028, US-029, US-030 | 1. The Climber can view the event date, location, divisions, capacity, and remaining spaces. 2. The Climber can select an available division. 3. Registration is allowed only while registration is open and space is available. 4. Confirmed registrations cannot exceed the maximum participant capacity. 5. The Climber can view their registration status. 6. Registered competitions can be associated with the Climber's account. |

---

## Feature Area 6: Scoring and Live Results

This feature area handles official competition scoring, result entry, leaderboard information, and Climber scorecards.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-010 | The system shall allow a GYM_ADMIN to configure a supported scoring format and record official Climber results including attempts, sends, and flashes where supported. | US-018, US-019 | 1. A supported scoring format can be selected for the competition. 2. GYM_ADMIN can select a registered Climber and competition route. 3. Attempts and successful sends can be recorded. 4. Flash results can be recorded when supported. 5. The system calculates the official score using the selected scoring rules. 6. AI cannot create or modify official results. |
| FR-011 | The system shall display official competition results through a live leaderboard and individual Climber scorecards. | US-020, US-021, US-031, US-032 | 1. The leaderboard displays rankings using official scores. 2. Rankings update after official results change. 3. Climbers can view their own scorecard. 4. Scorecards display completed and unfinished routes and recorded results. 5. Guests can view a public leaderboard when public viewing is enabled. 6. Public users cannot modify competition results. |

---

## Feature Area 7: Analytics and AI

This feature area uses competition results to calculate route statistics and provide AI-supported explanations and recommendations.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-012 | The system shall calculate route statistics from official competition results and allow Gym Administrators and Climbers to use AI-assisted features that explain available competition data and provide route recommendations. | US-022, US-023, US-024, US-033 | 1. The system can calculate completion rate, average attempts, and flash rate from recorded results. 2. Gym Administrators can ask questions about route performance. 3. Climbers can ask for route recommendations based on available competition data. 4. Climbers can ask about the current point difference between their score and a target ranking. 5. AI responses use available official competition information. 6. AI cannot change official scores, results, rankings, winners, or route grades. |

---

# Non-Functional Requirements

## Performance

These requirements define how quickly important TopSend features should respond during normal use.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-001 | Standard TopSend pages and common user actions shall respond within an acceptable amount of time during normal use. | US-001, US-012, US-019, US-025, US-028, US-031, US-032 | During testing, at least 95% of normal page loads and standard user actions shall complete within 3 seconds, excluding delays caused by unavailable third-party services. |

---

## Security

This requirement protects authenticated accounts and role-based features.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-002 | TopSend shall protect authenticated features and user credentials from unauthorized access. | US-001, US-002, US-003, US-006, US-011, US-034, US-035 | 1. 100% of protected-page authorization tests shall reject users without the required role. 2. User passwords shall not be stored as plain text. 3. An unauthenticated Guest shall not be able to access protected ADMIN, GYM_ADMIN, or CLIMBER pages. |

---

## Google Maps API Performance and Reliability

This requirement specifically covers the quality and reliability of the Google Maps-based competition-discovery feature.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-003 | The Competition Map View shall provide usable feedback when Google Maps data is loading or when the Google Maps service cannot be reached. | US-027 | 1. Under normal network conditions, the Map View shall display the map and available markers or show a loading/error state within 5 seconds. 2. If Google Maps cannot load, TopSend shall display a clear error message instead of a blank or broken page. 3. A Google Maps failure shall not prevent the user from accessing the Competition List View. |

---

## Reliability and Data Integrity

This requirement makes sure important competition data remains correct when results, registrations, or other records are saved.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-004 | TopSend shall maintain the integrity of competition registrations, official results, scores, and rankings when data is saved or an operation fails. | US-018, US-019, US-020, US-028, US-031, US-032 | 1. A successfully saved registration or official result shall still be present after the page is refreshed. 2. A failed save shall not create a partial or duplicate result. 3. Leaderboard and scorecard values shall match the latest successfully saved official results during testing. |

---

## Usability and Responsiveness

TopSend is intended to work on desktop, tablet, and mobile devices.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-005 | TopSend shall provide a responsive interface that keeps the main user workflows usable on common desktop, tablet, and mobile screen sizes. | All User Stories | 1. Core pages shall be tested at approximately 360px mobile, 768px tablet, and 1440px desktop widths. 2. Primary controls and content shall remain accessible at each tested width. 3. Core pages shall not require horizontal page scrolling at the tested screen sizes. |

---

## Maintainability and Error Handling

This requirement helps the development team identify and fix problems during development and testing.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-006 | TopSend shall handle application errors in a consistent way and provide enough information for the development team to identify failed operations without exposing technical details to normal users. | All User Stories | 1. Application errors shall display a user-readable error message when an operation fails. 2. Server-side errors shall be logged with a timestamp and enough context to identify the failed operation. 3. Internal stack traces or sensitive technical information shall not be displayed to normal users. |

---

# Requirements Summary

TopSend contains a total of:

**12 Functional Requirements**

- FR-001: Authentication and Role Access
- FR-002: Account Creation and Gym Administrator Onboarding
- FR-003: System Administration
- FR-004: Competition Management
- FR-005: Divisions and Climbers
- FR-006: Boulder Problem Management
- FR-007: Competition Discovery and List View
- FR-008: Google Maps Competition Discovery
- FR-009: Competition Registration
- FR-010: Competition Scoring and Result Entry
- FR-011: Live Competition Experience
- FR-012: Statistics and AI Route Assistant

**6 Non-Functional Requirements**

- NR-001: Performance
- NR-002: Security
- NR-003: Google Maps API Performance and Reliability
- NR-004: Reliability and Data Integrity
- NR-005: Usability and Responsiveness
- NR-006: Maintainability and Error Handling

The requirements maintain traceability to the TopSend User Stories and include the Google Maps functional and non-functional requirements requested during professor feedback.
