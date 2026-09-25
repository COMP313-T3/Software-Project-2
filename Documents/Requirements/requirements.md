# Functional and Non-Functional Requirements Document

## Overview

This document defines the functional and non-functional requirements for the TopSend Minimum Viable Product (MVP).

The requirements are connected to the TopSend Project Proposal, User Roles and Personas, User Stories, Low-Fidelity Prototypes, and MVP Definition.

The functional requirements are derived from the Must-Have user stories identified in the MVP Definition:

- US-010: Gym Administrator Login
- US-012: Competition Creation
- US-014: Divisions and Competitors
- US-016: Routes / Boulder Problems
- US-018: Scoring and Results
- US-019: Result Entry
- US-020: Live Leaderboard and Displays
- US-022: Route Statistics and AI Analysis
- US-025: Competitor Login and Account Creation
- US-026: Discover Competitions
- US-027: Competition List View
- US-029: Event Details and Registration
- US-032: My Scorecard
- US-033: Ranking and Leaderboard
- US-034: Competitor AI Route Assistant

Features that are part of the wider TopSend product but are not Must-Haves are not included as MVP functional requirements.

---

# Functional Requirements

## Feature Area 1: Authentication and Role Access

This feature area supports the Gym Administrator and Competitor account access required by the MVP.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-001 | The system shall allow a registered Gym Administrator to sign in using valid account credentials. | US-010 | A valid GYM_ADMIN account successfully opens the Gym Administrator side of TopSend. |
| FR-002 | The system shall reject invalid Gym Administrator login credentials. | US-010 | Invalid credentials do not grant access and an error message is displayed. |
| FR-003 | The system shall restrict Gym Administrators to competition-management features belonging to their assigned gym. | US-010 | A GYM_ADMIN account cannot manage another gym's private competition information. |
| FR-004 | The system shall allow a new user to create a Competitor account. | US-025 | A valid account registration creates an account with the COMP role. |
| FR-005 | The system shall prevent duplicate Competitor accounts using the same required unique account identifier. | US-025 | A duplicate registration is rejected and the user receives an error message. |
| FR-006 | The system shall allow a registered Competitor to sign in using valid account credentials. | US-025 | A valid COMP account successfully opens the competitor side of TopSend. |
| FR-007 | The system shall prevent Competitors from accessing Gym Administrator competition-management functions. | US-025 | Requests from a COMP account to protected Gym Admin functions are rejected. |

---

## Feature Area 2: Competition Creation

This feature area allows a Gym Administrator to create the competition that will contain the divisions, competitors, routes, scoring rules, and results.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-008 | The system shall allow a Gym Administrator to create a new bouldering competition. | US-012 | A valid competition can be saved successfully. |
| FR-009 | The system shall allow the Gym Administrator to enter a competition name. | US-012 | The competition name is stored and displayed with the event. |
| FR-010 | The system shall allow the Gym Administrator to enter an event description. | US-012 | The saved description appears in the competition information. |
| FR-011 | The system shall allow the Gym Administrator to set the competition date. | US-012 | The selected date is stored with the correct competition. |
| FR-012 | The system shall allow the Gym Administrator to set the competition location. | US-012 | The selected location is stored with the correct competition. |
| FR-013 | The system shall allow the Gym Administrator to set the maximum number of climbers for the competition. | US-012 | A positive maximum participant value is stored with the event. |
| FR-014 | The system shall connect the created competition to the Gym Administrator's assigned gym. | US-012 | The new competition belongs to the correct gym after it is saved. |

---

## Feature Area 3: Divisions and Competitors

This feature area allows Gym Administrators to organize registered competitors into competition divisions.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-015 | The system shall allow a Gym Administrator to create a division for a competition. | US-014 | The new division is saved under the selected competition. |
| FR-016 | The system shall display competitors registered for the selected competition. | US-014 | Only competitors registered for that competition appear in its competitor list. |
| FR-017 | The system shall allow a registered competitor to be assigned to an available division. | US-014 | The selected competitor is associated with the selected division. |
| FR-018 | The system shall keep competition divisions separate between different competitions. | US-014 | A division belonging to one competition does not automatically appear in another competition. |

---

## Feature Area 4: Routes / Boulder Problems

This feature area allows Gym Administrators to create the boulder problems used during the competition.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-019 | The system shall allow a Gym Administrator to add a boulder problem to a competition. | US-016 | A new boulder problem is saved under the selected competition. |
| FR-020 | The system shall allow a Gym Administrator to assign an official V-grade to a boulder problem. | US-016 | The selected V-grade is saved and displayed with the route. |
| FR-021 | The system shall allow a point value to be assigned when required by the selected competition scoring format. | US-016 | The saved point value is associated with the correct boulder problem. |
| FR-022 | The system shall connect every boulder problem to one competition. | US-016 | Routes from another competition are not included in the selected event. |

---

## Feature Area 5: Scoring and Results

This feature area controls how official competition scores are calculated.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-023 | The system shall allow a Gym Administrator to select a supported competition scoring format. | US-018 | The selected scoring format is saved with the competition. |
| FR-024 | The system shall apply the selected scoring rules consistently to competitors in the same competition. | US-018 | Competitors in the event are calculated using the same configured scoring rules. |
| FR-025 | The system shall calculate official scores using application scoring logic rather than AI-generated decisions. | US-018, US-019 | An official score can be calculated without an AI response. |
| FR-026 | The AI functionality must not change the competition scoring format. | US-018, US-034 | Using the AI Route Assistant does not modify the competition's scoring configuration. |

---

## Feature Area 6: Result Entry

This feature area allows authorized Gym Administrators to record competition results.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-027 | The system shall allow the Gym Administrator to select a registered competitor when entering a result. | US-019 | Only competitors registered for the selected competition can receive a result for that event. |
| FR-028 | The system shall allow the Gym Administrator to select a boulder problem from the selected competition. | US-019 | The result is connected to the correct boulder problem. |
| FR-029 | The system shall allow a route attempt to be recorded. | US-019 | The recorded attempt is saved for the correct competitor and route. |
| FR-030 | The system shall allow a successful send to be recorded. | US-019 | A successful send is saved for the correct competitor and route. |
| FR-031 | The system shall allow a flash to be recorded when the selected scoring format supports flash results. | US-019 | The flash result is saved and included when required by the scoring rules. |
| FR-032 | The system shall recalculate the competitor's official score after a valid result is saved. | US-019 | The updated result is included in the competitor's official competition score. |

---

## Feature Area 7: Live Leaderboard

This feature area provides current competition standings based on official results.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-033 | The system shall display a live leaderboard for the selected competition. | US-020, US-033 | Users can open the leaderboard and view the current competition standings. |
| FR-034 | The system shall rank competitors according to the competition's configured scoring rules. | US-018, US-020, US-033 | The displayed ranking matches the official calculated scores. |
| FR-035 | The system shall update the leaderboard when an official competitor result changes. | US-019, US-020, US-033 | Saving a result causes the affected ranking information to update. |
| FR-036 | The system shall allow a Competitor to identify their current position on the competition leaderboard. | US-033 | A logged-in Competitor can see their current ranking in the selected event. |

---

## Feature Area 8: Route Statistics

This feature area uses official competition results to calculate route-performance information.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-037 | The system shall calculate the completion rate for each boulder problem using official competition results. | US-022 | The displayed completion rate is based on recorded competitors and successful completions. |
| FR-038 | The system shall calculate the average number of attempts for each boulder problem. | US-022 | The displayed average is calculated from the recorded route attempts. |
| FR-039 | The system shall calculate the flash rate for routes where flash data is available. | US-022 | The displayed flash rate is based on recorded flash results. |
| FR-040 | The system shall associate calculated route statistics with the correct competition and boulder problem. | US-022 | Statistics from one route or event are not displayed as statistics for another route or event. |

---

## Feature Area 9: Competition Discovery

This feature area allows Competitors to find available competitions.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-041 | The system shall provide a competition discovery page to Competitors. | US-026 | A Competitor can open the competition discovery page after signing in. |
| FR-042 | The system shall display available upcoming competitions. | US-026, US-027 | Upcoming available competitions are shown in the discovery area. |
| FR-043 | The system shall allow Competitors to search or filter available competitions. | US-026 | Applying a search or filter changes the displayed competitions to matching events. |
| FR-044 | The system shall provide a List View for competition discovery. | US-026, US-027 | The Competitor can view available events using the competition list. |
| FR-045 | The Competition List View shall display the event name, gym, date, and location. | US-027 | Each listed competition displays the required event information. |
| FR-046 | The system shall allow a Competitor to select a competition from the List View. | US-027 | Selecting an event opens the matching event details. |

---

## Feature Area 10: Event Details and Registration

This feature area allows Competitors to review an event and register for it.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-047 | The system shall display the selected competition's description, date, and location. | US-029 | The information displayed matches the selected competition. |
| FR-048 | The system shall display the divisions available for the selected competition. | US-029 | The Competitor can see available divisions before registering. |
| FR-049 | The system shall display the maximum participant capacity and number of remaining spaces. | US-029 | Capacity information matches the number of confirmed registrations. |
| FR-050 | The system shall allow a logged-in Competitor to select an available division during registration. | US-029 | The selected division is saved with the competitor's event registration. |
| FR-051 | The system shall allow a logged-in Competitor to register while registration is available and capacity remains. | US-029 | A valid registration is saved successfully. |
| FR-052 | The system shall prevent confirmed registrations from exceeding the competition's maximum participant capacity. | US-012, US-029 | Once the participant limit is reached, another confirmed registration cannot be created. |
| FR-053 | The system shall prevent a Competitor from being automatically registered for competitions they did not select. | US-029 | A Competitor account only receives event registrations that the user submitted. |

---

## Feature Area 11: Digital Scorecard

This feature area allows Competitors to view their own official competition progress.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-054 | The system shall provide an individual digital scorecard for a Competitor registered in an event. | US-032 | A registered Competitor can open their scorecard for the selected competition. |
| FR-055 | The digital scorecard shall display the competition's boulder problems. | US-032 | The correct event routes appear on the competitor's scorecard. |
| FR-056 | The digital scorecard shall identify completed and unfinished boulder problems. | US-032 | The scorecard clearly distinguishes completed and unfinished routes. |
| FR-057 | The digital scorecard shall display the Competitor's recorded official results. | US-032 | Saved official results appear under the correct competitor and route. |
| FR-058 | The digital scorecard shall update when an official result for the Competitor changes. | US-019, US-032 | An updated official result is reflected on the scorecard. |

---

## Feature Area 12: Competitor AI Route Assistant

This feature area uses official competition information to help a Competitor decide which unfinished route they may want to attempt next.

| ID | Requirement | Related User Stories | Acceptance Conditions |
|----|-------------|----------------------|-----------------------|
| FR-059 | The system shall allow a Competitor to ask the AI Route Assistant for a route recommendation. | US-034 | The Competitor can submit a request asking which route they may want to try next. |
| FR-060 | The AI Route Assistant shall use available competition information when producing the recommendation. | US-022, US-034 | The response is based on available TopSend event data rather than unsupported route information. |
| FR-061 | The AI Route Assistant shall exclude routes already completed by the Competitor when the request asks for an unfinished route. | US-032, US-034 | Completed routes are not returned as the recommended unfinished route. |
| FR-062 | The AI Route Assistant may use official V-grade, completion rate, average attempts, flash rate, and the Competitor's recorded results when those values are available. | US-022, US-032, US-034 | The recommendation uses only available competition information. |
| FR-063 | The AI Route Assistant shall provide a short explanation with its route recommendation. | US-034 | The response contains both a recommended route and an explanation. |
| FR-064 | The AI Route Assistant must not modify official competition scores, recorded results, or official route grades. | US-018, US-019, US-034 | AI requests do not create, update, or delete official scoring or grading information. |

---

# Non-Functional Requirements

## Performance

These requirements define the expected response times for the main MVP functions.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-001 | Core TopSend pages shall load within a reasonable time under normal MVP test conditions. | All MVP Stories | Core pages load within 3 seconds during normal test conditions. |
| NR-002 | Official result changes shall be reflected quickly in live competition information. | US-019, US-020, US-032, US-033 | A successfully saved result is reflected in the leaderboard and scorecard within 2 seconds under normal test conditions. |
| NR-003 | Competition discovery shall respond quickly to normal user actions. | US-026, US-027 | Opening or filtering the Competition List View completes within 2 seconds under normal test conditions. |
| NR-004 | The AI Route Assistant shall return a response within a reasonable period when the AI service is available. | US-034 | A route recommendation normally returns within 10 seconds during MVP testing. |

---

## Security

These requirements protect TopSend accounts, gym information, and official competition results.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-005 | User passwords shall not be stored as plain text. | US-010, US-025 | Stored passwords use a strong one-way password hashing method. |
| NR-006 | The system shall enforce role-based access for GYM_ADMIN and COMP accounts. | US-010, US-025 | Access-control testing confirms each role can only access permitted MVP functions. |
| NR-007 | A Gym Administrator shall not be able to manage another gym's private competition information. | US-010, US-012 | Unauthorized cross-gym management requests are rejected. |
| NR-008 | A Competitor shall not be able to create or modify official competition results. | US-019, US-025, US-032 | COMP accounts are denied access to protected result-entry operations. |
| NR-009 | Production communication between the browser and TopSend shall be encrypted. | All MVP Stories | Deployed production traffic uses HTTPS with TLS 1.2 or higher. |
| NR-010 | The AI Route Assistant shall have no permission to directly modify official scoring data. | US-018, US-019, US-034 | AI functionality has no successful path for changing official scores, results, or route grades during authorization testing. |

---

## Scalability

TopSend is initially designed for local Toronto bouldering competitions rather than provincial or national competition management.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-011 | The MVP shall support a local competition with multiple competitors using the application at the same time. | US-019, US-020, US-032, US-033 | The system supports at least 60 simultaneously active competition users during load testing without critical failure. |
| NR-012 | Competition records shall remain usable as the number of competitors and routes increases within local-event scope. | US-014, US-016, US-019 | A competition containing at least 100 registered competitors and 50 boulder problems can be loaded and used without application failure. |
| NR-013 | Live ranking updates shall continue to function during the expected local-event load. | US-020, US-033 | Leaderboard updates continue to meet the 2-second target during the defined MVP load test. |

---

## Reliability and Data Integrity

These requirements protect competition information during event use.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-014 | Successfully saved competition information shall remain stored after page refresh or logout. | US-012, US-014, US-016, US-019, US-029 | Saved records remain available after refreshing the application and signing in again. |
| NR-015 | Invalid input shall not cause the TopSend application to crash or corrupt existing competition data. | All MVP Stories | Invalid-input tests display an error and leave previously saved valid records unchanged. |
| NR-016 | A failure of the AI Route Assistant shall not affect official competition data. | US-034 | When an AI request fails, official scores, results, grades, and rankings remain unchanged. |
| NR-017 | Official leaderboard calculations shall produce consistent results when the same competition data and scoring configuration are used. | US-018, US-019, US-020, US-033 | Repeating the calculation with unchanged data produces the same ranking order. |

---

## Usability

TopSend is defined in the proposal as a responsive web application that can be used during a climbing competition.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-018 | Core MVP pages shall support responsive desktop, tablet, and mobile layouts. | All MVP Stories | Core pages are usable at 375px mobile width, 768px tablet width, and 1280px or greater desktop width. |
| NR-019 | Required competition information shall remain readable on mobile devices. | US-027, US-029, US-032, US-033, US-034 | Required content can be viewed at 375px width without horizontal page scrolling. |
| NR-020 | Forms shall clearly identify required input errors. | US-010, US-012, US-025, US-029 | Submitting invalid required fields displays a visible message identifying the problem. |
| NR-021 | Core MVP functionality shall work on commonly used modern web browsers. | All MVP Stories | MVP acceptance testing passes on the current versions of Chrome, Edge, Firefox, and Safari. |

---

## Maintainability and Supportability

These requirements help the project team develop, test, and maintain TopSend.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-022 | MVP requirements shall remain traceable to their related user stories. | All MVP Stories | Every FR in this document contains at least one related US-XXX identifier. |
| NR-023 | Each MVP functional requirement shall have at least one corresponding test case before MVP completion. | All MVP Stories | The test documentation contains one or more test cases referencing every FR-XXX identifier. |
| NR-024 | Application errors shall provide enough information for the development team to troubleshoot failures without exposing passwords or other authentication secrets. | All MVP Stories | Backend error records include time and error context but do not contain plaintext passwords or authentication secrets. |
| NR-025 | The project documentation shall use consistent requirement and user-story identifiers. | All MVP Stories | US-XXX, FR-XXX, and NR-XXX identifiers remain consistent across requirements and testing documents. |

---

## Data Protection and Scope Constraints

These requirements keep the MVP aligned with the boundaries defined in the TopSend Project Proposal.

| ID | Requirement | Related User Stories | Measurable Criteria |
|----|-------------|----------------------|---------------------|
| NR-026 | TopSend shall collect only the account and competition information required for its defined functionality. | US-025, US-029 | Every required registration field can be linked to an account, role, or competition function. |
| NR-027 | The TopSend MVP shall not store payment-card information because payment processing is outside the project scope. | US-029 | No MVP registration form, database field, or API accepts payment-card numbers. |
| NR-028 | The TopSend MVP shall not use AI to determine winners, official scores, or official route grades. | US-018, US-019, US-034 | Testing confirms AI output cannot update official scoring, ranking rules, or route-grade records. |

---

# Requirements Traceability Summary

The following table confirms that every Must-Have MVP user story is represented by one or more functional requirements.

| MVP User Story | Functional Requirements |
|----------------|-------------------------|
| US-010: Gym Administrator Login | FR-001 to FR-003 |
| US-012: Competition Creation | FR-008 to FR-014, FR-052 |
| US-014: Divisions and Competitors | FR-015 to FR-018 |
| US-016: Routes / Boulder Problems | FR-019 to FR-022 |
| US-018: Scoring and Results | FR-023 to FR-026, FR-034, FR-064 |
| US-019: Result Entry | FR-025, FR-027 to FR-032, FR-035, FR-058, FR-064 |
| US-020: Live Leaderboard and Displays | FR-033 to FR-035 |
| US-022: Route Statistics and AI Analysis | FR-037 to FR-040, FR-060, FR-062 |
| US-025: Competitor Login and Account Creation | FR-004 to FR-007 |
| US-026: Discover Competitions | FR-041 to FR-044 |
| US-027: Competition List View | FR-042, FR-044 to FR-046 |
| US-029: Event Details and Registration | FR-047 to FR-053 |
| US-032: My Scorecard | FR-054 to FR-058, FR-061, FR-062 |
| US-033: Ranking and Leaderboard | FR-033 to FR-036 |
| US-034: Competitor AI Route Assistant | FR-026, FR-059 to FR-064 |

---

## Requirements Scope Summary

The functional requirements in this document cover only the TopSend MVP Must-Have stories.

The following wider product features are intentionally not included as MVP functional requirements:

- System Administrator management features
- Admin Dashboard
- Manage Gyms
- Gym Details
- Manage Gym Administrators
- Administrator Details
- Manage Users
- User Details
- System Configuration and Advanced Settings
- Competition Details
- Competitor Details
- Route Details
- Display Customization
- Gym Admin AI Route Assistant
- Competition History
- Competition Map View
- Registration-status and optional waitlist features
- My Events

These features remain connected to the wider TopSend proposal and user-story documents, but they are planned outside the initial MVP.
