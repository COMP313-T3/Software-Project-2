# User Stories

## Overview

This document defines the user stories for TopSend. Each user story describes a specific capability from the perspective of a user role defined in `roles_and_personas.md`.

The user roles referenced in this document are:

- ADMIN - System Administrator
- GYM_ADMIN - Gym Administrator / Event Organizer
- CLIMBER - Climber
- VISITOR - Visitor

Each user story contains a unique identifier, User/Role, Story Statement, Description, Acceptance Criteria, Priority, Complexity/Effort Estimate, and Related Stories.

The stories are organized by feature area so that related capabilities are grouped together.

---

## User Stories by Feature Area

### Feature Area 1: Authentication

The Authentication feature area provides account creation and login functionality. TopSend uses one shared login process for all authenticated roles while controlling access based on the user's assigned role.

---

#### US-001: User Login

**User/Role:** System Administrator (ADMIN), Gym Administrator / Event Organizer (GYM_ADMIN), Climber (CLIMBER)

**Story Statement:**  
As a registered TopSend user, I want to log in to my account, so that I can access the features available to my assigned role.

**Description:**  
System Administrators, Gym Administrators, and Climbers use the same TopSend login process. After successful authentication, the system identifies the account role and provides access to the appropriate features.

**Acceptance Criteria:**

1. A registered user can enter their login credentials.
2. Valid credentials allow the user to successfully log in.
3. Invalid credentials display an appropriate error message and do not log the user in.
4. After login, TopSend identifies whether the user is ADMIN, GYM_ADMIN, or CLIMBER.
5. The user receives access only to features allowed for their assigned role.
6. A logged-in user cannot access protected features that are not permitted for their role.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002, US-003, US-011, US-025, US-034, US-036, US-037

---

#### US-002: Create Climber Account

**User/Role:** Visitor (VISITOR)

**Story Statement:**  
As a Visitor, I want to create a Climber account, so that I can log in and participate in TopSend competitions.

**Description:**  
Climber accounts use public self-registration and do not require System Administrator approval. Creating a Climber account is separate from registering for a specific competition.

**Acceptance Criteria:**

1. A Visitor can open the Climber account-registration page.
2. The Visitor can enter all required account information.
3. The system prevents account creation when required information is missing or invalid.
4. The system rejects an email or other unique account information that is already registered.
5. Successful registration creates an account with the CLIMBER role.
6. The new Climber can use the account to log in, but is not automatically registered for a competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-001, US-025, US-028, US-036

---

### Feature Area 2: System Administration

The System Administration feature area allows the System Administrator to manage TopSend as a platform. This includes gyms, Gym Administrator accounts, platform users, access permissions, and system-level settings.

---

#### US-003: Admin Dashboard

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to view the Admin Dashboard, so that I can monitor and access the main platform-management features.

**Description:**  
The Admin Dashboard provides an overview of TopSend and serves as the main entry point to administrative functions.

**Acceptance Criteria:**

1. The Admin can view an overview of registered gyms.
2. The Admin can view platform user totals.
3. The Admin can view the number of pending gym or Gym Administrator access requests.
4. The Admin can navigate from the dashboard to the available administration features.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-006, US-008, US-010, US-035

---

#### US-004: Manage Gyms

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage registered climbing gyms, so that authorized gyms can use TopSend.

**Description:**  
The System Administrator can view and manage the climbing gyms registered on the platform. New gyms may also be added after an approved gym-registration request.

**Acceptance Criteria:**

1. The Admin can view a list of registered gyms.
2. The Admin can add a new gym.
3. The Admin can select an existing gym from the list.
4. Selecting a gym allows the Admin to open its Gym Details page.
5. An approved new-gym request can be associated with a new registered gym record.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003, US-005, US-006, US-034, US-035

---

#### US-005: Gym Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage a registered gym's details, so that its information remains accurate.

**Description:**  
The Gym Details page allows the System Administrator to review and update information associated with a selected climbing gym.

**Acceptance Criteria:**

1. The Admin can view the selected gym's information.
2. The Admin can edit allowed gym information.
3. The Admin can view Gym Administrators assigned to the selected gym.
4. The Admin can deactivate or remove the gym when permitted.
5. Saved changes apply only to the selected gym.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-006

---

#### US-006: Manage Gym Administrators

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage Gym Administrator accounts, so that authorized staff can manage competitions for the correct gym.

**Description:**  
A registered gym may have more than one Gym Administrator. Gym Administrators can be connected to a gym after approval or added by the System Administrator when appropriate.

**Acceptance Criteria:**

1. The Admin can select a registered gym.
2. The Admin can view all Gym Administrators assigned to that gym.
3. The Admin can add or connect an authorized Gym Administrator to the selected gym.
4. More than one Gym Administrator can be assigned to the same gym.
5. A Gym Administrator is associated only with gyms for which they have been authorized.
6. The Admin can open the details of a selected Gym Administrator.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-005, US-007, US-034, US-035

---

#### US-007: Administrator Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage a Gym Administrator's account details, so that their access remains correct.

**Description:**  
The Administrator Details page allows the System Administrator to review and change permitted information for a selected Gym Administrator.

**Acceptance Criteria:**

1. The Admin can open a selected Gym Administrator account.
2. The Admin can edit allowed account information.
3. The Admin can change allowed access or permissions.
4. The Admin can remove the Gym Administrator from a gym when permitted.
5. The Admin can deactivate the account.
6. A deactivated account cannot access protected Gym Administrator features.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-006

---

#### US-008: Manage Users

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to search and review TopSend users, so that I can manage registered platform accounts.

**Description:**  
The Manage Users section provides a searchable list of registered TopSend accounts.

**Acceptance Criteria:**

1. The Admin can view registered users.
2. The Admin can search for a user using available search information.
3. The Admin can filter the user list using available account filters.
4. The Admin can select a user from the results.
5. Selecting a user allows the Admin to open that user's details.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003, US-009

---

#### US-009: User Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage a user's account details, so that their information and platform access remain correct.

**Description:**  
The User Details page allows the System Administrator to manage permitted information for a selected TopSend account.

**Acceptance Criteria:**

1. The Admin can view the selected user's account information.
2. The Admin can edit allowed user information.
3. The Admin can change a role or permission when the change is permitted.
4. The Admin can deactivate the selected account.
5. Saved changes apply only to the selected user.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-008

---

#### US-010: System Configuration and Advanced Settings

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage TopSend system settings, so that I can control important platform-wide options.

**Description:**  
This feature provides platform settings that are available only to the System Administrator.

**Acceptance Criteria:**

1. The Admin can view available system settings.
2. The Admin can update permitted platform information.
3. The Admin can manage available registration or notification settings.
4. The Admin can manage available security and maintenance settings.
5. Saved settings remain applied after the page is refreshed.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003

---

### Feature Area 3: Competition Management

The Competition Management feature area allows authorized Gym Administrators to create and manage bouldering competitions for their assigned gym.

---

#### US-011: Gym Admin Dashboard

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view my gym dashboard, so that I can access the competitions and management tools for my gym.

**Description:**  
The Gym Admin Dashboard displays competition information associated with the Gym Administrator's assigned gym.

**Acceptance Criteria:**

1. The Gym Admin can view competitions associated with their assigned gym.
2. The Gym Admin can identify upcoming competitions.
3. The Gym Admin can select a competition to manage.
4. The Gym Admin can access available competition-management tools.
5. Private competition information from an unauthorized gym is not displayed.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-014, US-016, US-018

---

#### US-012: Competition Creation

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to create a bouldering competition, so that my gym can organize a local event through TopSend.

**Description:**  
Competition Creation allows the Gym Administrator to enter the basic information required to create an event, including when it starts.

**Acceptance Criteria:**

1. The Gym Admin can enter a competition name.
2. The Gym Admin can select an event date, a start time, and an end time after the start time, in Toronto time.
3. The competition's location is the location of the Gym Admin's assigned gym.
4. The Gym Admin can enter an event description.
5. The Gym Admin can set the maximum number of participants.
6. Saving valid competition information creates an event associated with the Gym Admin's assigned gym.
7. The Gym Admin can choose the competition's first divisions from Open, Beginner, Youth, and Advanced.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-013, US-014, US-016

---

#### US-013: Competition Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to manage an existing competition's details, so that event information and registration settings remain current.

**Description:**  
The Competition Details page provides controls for managing an event after it has been created.

**Acceptance Criteria:**

1. The Gym Admin can view and edit permitted competition information, including the start and end times.
2. The Gym Admin can view the current number of registered Climbers.
3. The Gym Admin can update the maximum participant capacity.
4. The Gym Admin can change registration between open and closed.
5. Saved changes apply only to the selected competition.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-014, US-028

---

#### US-014: Divisions and Climbers

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to organize competition divisions and registered Climbers, so that participants are placed in the correct categories.

**Description:**  
This feature allows the Gym Administrator to create event divisions and organize Climbers who have registered for that competition. A competition's divisions come from four names: Open, Beginner, Youth, and Advanced.

**Acceptance Criteria:**

1. The Gym Admin can create a division for the selected competition by choosing its name from a list of Open, Beginner, Youth, and Advanced. A name the competition already has isn't offered again.
2. The Gym Admin can view Climbers registered for the selected competition.
3. The Gym Admin can assign a registered Climber to an available division.
4. The Gym Admin can change a registered Climber's division.
5. Division assignments are stored only for the selected competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-013, US-015, US-028

---

#### US-015: Climber Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to manage a registered Climber's event information, so that their competition registration remains accurate.

**Description:**  
Climber Details contains competition-specific information about a Climber registered for the selected event.

**Acceptance Criteria:**

1. The Gym Admin can open the details of a registered Climber.
2. The Gym Admin can update permitted competition-related information.
3. The Gym Admin can assign or change the Climber's division.
4. The Gym Admin can remove the Climber's registration when permitted.
5. Changes apply only to the selected Climber and competition.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-014

---

#### US-016: Routes / Boulder Problems

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to create boulder problems for a competition, so that Climbers have defined routes to attempt during the event.

**Description:**  
The Gym Administrator creates the boulder problems that belong to a selected competition.

**Acceptance Criteria:**

1. The Gym Admin can add a boulder problem to the selected competition.
2. The Gym Admin can enter a route name or problem number.
3. The Gym Admin can assign an official V-grade.
4. The Gym Admin assigns a point value to each boulder problem.
5. Saving the route connects it to the selected competition.
6. TopSend does not automatically change the official V-grade.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-017, US-018

---

#### US-017: Route Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to update an existing boulder problem, so that its competition information remains correct.

**Description:**  
Route Details allows an authorized Gym Administrator to manage an existing boulder problem.

**Acceptance Criteria:**

1. The Gym Admin can open a route belonging to the selected competition.
2. The Gym Admin can edit permitted route information, including notes.
3. The Gym Admin can update the official V-grade or point value when permitted.
4. Saved changes apply only to the selected route.
5. Unauthorized users cannot modify official route information.

**Priority:** Medium

**Complexity/Effort Estimate:** Small

**Related Stories:** US-016, US-022

---

### Feature Area 4: Scoring and Live Results

The Scoring and Live Results feature area handles competition scoring, official result entry, rankings, and leaderboard displays.

---

#### US-018: Configure Scoring Format

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to configure the competition scoring format, so that all Climbers are scored using the correct rules.

**Description:**  
The scoring configuration determines how official competition results are converted into scores and rankings.

**Acceptance Criteria:**

1. The Gym Admin can set the deduction per failed attempt and the maximum number of attempts.
2. The scoring settings are saved to the correct competition.
3. Official results for that competition use these scoring rules.
4. Climbers in the same applicable category are scored using the same rules.
5. AI features cannot modify the official scoring format or calculate a different official winner.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-016, US-019, US-020

---

#### US-019: Result Entry

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to record official Climber results, so that TopSend can calculate competition scores and rankings.

**Description:**  
Result Entry allows an authorized Gym Administrator to record a Climber's performance on a competition route.

**Acceptance Criteria:**

1. The Gym Admin can select a Climber registered for the competition.
2. The Gym Admin can select a boulder problem belonging to the same competition.
3. The Gym Admin can record an attempt.
4. The Gym Admin can record a successful send and a flash when supported by the scoring format.
5. The Gym Admin can save the official result.
6. TopSend calculates the score using the competition's selected scoring rules.
7. AI features cannot create or modify an official result.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-018, US-020, US-031

---

#### US-020: Live Leaderboard and Displays

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view the live competition leaderboard, so that I can monitor the current standings.

**Description:**  
The live leaderboard displays current rankings based on official competition results.

**Acceptance Criteria:**

1. The Gym Admin can open the leaderboard for the selected competition.
2. Rankings are calculated from official competition results.
3. The leaderboard updates when an official result changes.
4. Climbers can view the current leaderboard for their competition once it has started.
5. A Visitor can view the public leaderboard when public access is enabled and the competition has started.
6. Public leaderboard access does not provide competition-management permissions.
7. The Gym Admin can choose which division's standings to view. A Climber isn't asked to choose, because they see their own division.
8. The leaderboard has no refresh button, because it updates live. When live updates stop, it offers to reconnect them.
9. On a phone, the competition's details above the standings fold into a bar that opens and closes, and the division to view stays in reach. Nothing folds on a larger screen.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-019, US-021, US-032

---

#### US-021: Display Customization

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to customize the leaderboard display, so that it can represent my gym and competition.

**Description:**  
Display Customization allows organizers to change permitted visual elements of the public competition display.

**Acceptance Criteria:**

1. The Gym Admin can add a gym or competition logo.
2. The Gym Admin can select or upload an available competition background.
3. The Gym Admin can add permitted sponsor images.
4. Saved customization applies only to the selected competition.
5. The saved customization appears on the competition display.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-020

---

### Feature Area 5: Analytics and Competition History

This feature area uses official competition results to provide route statistics, AI-assisted explanations, and historical event information.

---

#### US-022: Route Statistics

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view statistics for each boulder problem, so that I can understand how Climbers performed on the routes.

**Description:**  
TopSend calculates route-level statistics from official competition results.

**Acceptance Criteria:**

1. The Gym Admin can view the completion rate for a route.
2. The Gym Admin can view the average number of attempts for a route.
3. The Gym Admin can view the flash rate for a route.
4. Statistics are calculated using results from the selected competition.
5. Statistics are associated with the correct route.
6. Calculated statistics do not automatically change the route's official grade.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-019, US-023, US-033

---

#### US-023: Gym Admin AI Route Assistant

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to ask the AI about route performance, so that I can better understand the competition statistics.

**Description:**  
The Gym Admin AI Route Assistant explains available competition statistics in natural language. It is a chatbot that opens inside the pages where a Gym Administrator reviews competition performance, not a page of its own.

**Acceptance Criteria:**

1. The Gym Admin can submit a question about route performance from the chatbot on the Route statistics, Result entry, and Live leaderboard pages.
2. The AI response uses available statistics from the selected competition.
3. The response may use information such as V-grade, completion rate, average attempts, and flash rate.
4. The AI can compare routes when sufficient competition information is available.
5. The response provides an explanation based on the available data.
6. The AI cannot modify official scores, results, or route grades.
7. The chatbot opens as a panel on the page, already knows the selected competition and the page, and keeps the conversation visible while the Gym Admin uses it.
8. The first time the Gym Admin opens the chatbot on a kind of page, it shows a short welcome. Suggested questions can be clicked to start a conversation.
9. The chatbot shows that it is working while the AI answers, and a clear message when the AI can't answer.
10. The AI only uses data from gyms and competitions the Gym Admin is allowed to manage, and it can't reveal passwords, tokens, API keys, or another user's private information.

**Priority:** Medium

**Complexity/Effort Estimate:** Large

**Related Stories:** US-022, US-033

---

#### US-024: Competition History

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to review previous competitions, so that I can compare past results and route performance.

**Description:**  
Competition History stores completed event information associated with the Gym Administrator's assigned gym.

**Acceptance Criteria:**

1. The Gym Admin can view previous competitions for their assigned gym.
2. The Gym Admin can open a previous competition.
3. The Gym Admin can review available past results and route statistics.
4. Historical information remains associated with the correct competition.
5. Private competition history from unauthorized gyms is not displayed.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-022, US-023

---

### Feature Area 6: Competition Discovery and Registration

This feature area allows Climbers to find competitions, compare event locations, review event information, and register for available competitions.

---

#### US-025: Discover Competitions

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to discover available competitions, so that I can find an event that I want to join.

**Description:**  
Competition Discovery provides access to upcoming events and allows Climbers to narrow down the available competitions.

**Acceptance Criteria:**

1. The Climber can view available upcoming competitions.
2. The Climber can search available competitions using supported search information.
3. The Climber can apply available competition filters.
4. The Climber can choose to open the List View or Map View.
5. The Climber can select a competition to view its details.
6. The Climber can choose a starting point (their current location, a place they search for, or the location saved with their account), see how far each competition is from it, and keep only the competitions within a chosen distance.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-026, US-027, US-028

---

#### US-026: Competition List View

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to view competitions in a list, so that I can quickly compare upcoming events.

**Description:**  
The List View presents available competitions using a simple list of important event information.

**Acceptance Criteria:**

1. The Climber can open the Competition List View.
2. Each available event displays its competition name and gym name.
3. Each available event displays its date and location.
4. The Climber can select an event from the list.
5. Selecting an event opens the corresponding Event Details page.
6. The Climber can order the list soonest first, closest first, by most Climbers joined, by most spaces left, or in a random order.

**Priority:** High

**Complexity/Effort Estimate:** Small

**Related Stories:** US-025, US-027, US-028

---

#### US-027: Competition Map View

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to view available competitions on a map, so that I can understand where the events are located.

**Description:**  
The Competition Map View uses the Google Maps API to display locations of gyms hosting available TopSend competitions.

**Acceptance Criteria:**

1. The Climber can open the Competition Map View.
2. The map is displayed using the Google Maps API.
3. Available competition locations are represented by map pins.
4. The Climber can select a competition pin.
5. Selecting a pin displays basic information for the corresponding event.
6. The Climber can open Event Details from the selected map event.
7. When the Climber chooses a starting point, the map shows it and the chosen distance around it.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-025, US-026, US-028

---

#### US-028: Event Registration

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to register for a competition after reviewing its event information, so that I can participate in the event.

**Description:**  
The Event Details page provides the information a Climber needs before registering and allows registration when the event is available.

**Acceptance Criteria:**

1. The Climber can view the event description, date, start and end times, and location.
2. The Climber can view available divisions and select an eligible division.
3. The Climber can view the competition's maximum capacity and remaining spaces.
4. The Climber can see whether registration is open or closed.
5. The Climber can register while registration is open and space is available.
6. A successful registration is associated with the correct Climber and competition.
7. Confirmed registrations cannot exceed the competition's maximum capacity.
8. Until the competition starts, the event shows a countdown to its start time, and the leaderboard can't be opened from it.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002, US-013, US-014, US-025, US-029

---

#### US-029: Check Registration Status

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to check my competition registration status, so that I know whether I am confirmed for the event.

**Description:**  
Registration Status displays the current state of the Climber's registration for a selected competition.

**Acceptance Criteria:**

1. The Climber can view whether their registration is confirmed.
2. The Climber can see when the competition has reached capacity.
3. If a waitlist is enabled, the Climber can view their waitlist status.
4. The displayed registration status corresponds to the selected competition.
5. A competition the Climber did not register for is not shown as a confirmed registration.

**Priority:** Medium

**Complexity/Effort Estimate:** Small

**Related Stories:** US-028, US-030

---

### Feature Area 7: Event Participation and Progress

The Climber Event Experience feature area provides the competition tools a registered Climber uses after joining an event, including My Events, scorecards, rankings, and AI assistance.

---

#### US-030: My Events

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to view the competitions I registered for, so that I can quickly access my event information.

**Description:**  
My Events provides a list of competitions connected to the logged-in Climber's registrations.

**Acceptance Criteria:**

1. The Climber can view competitions for which they have a registration.
2. The Climber can select one of their registered events.
3. Selecting an event opens the available event information and tools.
4. A competition the Climber did not register for is not displayed as one of their registered events.
5. Until the competition starts, the event shows its start time and a countdown to it, and only the registration status can be opened.
6. When the start time arrives, My scorecard and the Live leaderboard open without the page being reloaded.
7. While the competition is on, the event shows a countdown to its end time, when scoring closes.
8. 15 minutes and 5 minutes before the end time, the event shows a warning that the scorecard closes then.
9. After the end, the event links to the final leaderboard, and My scorecard can no longer be opened.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-029, US-031, US-032, US-033

---

#### US-031: My Scorecard

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to view my digital scorecard, so that I can track my official competition progress.

**Description:**  
The digital scorecard displays the logged-in Climber's routes and recorded results for the selected competition. It is laid out as a scorecard sheet, like a paper competition scorecard, that scrolls with the page over the competition's background. While scoring is open, the Climber records their attempts on each problem by tapping circles, one for each attempt the competition allows, so they can stop partway through a problem, climb others, and come back to it later. The sheet shows 10 problems at a time, and on a phone the sections above the problems fold away, so the problems are reached without a long scroll.

**Acceptance Criteria:**

1. The Climber can view the boulder problems in the selected competition.
2. The scorecard identifies completed and unfinished problems.
3. The Climber can view their recorded official results.
4. The scorecard updates when the Climber's official result changes.
5. The displayed scorecard belongs to the logged-in Climber and selected competition.
6. The scorecard is a scorecard sheet on every screen size: one row for each problem with its number, name, grade, attempts, and points, over the competition's background.
7. Each problem's attempts are shown against the competition's attempt limit, such as 2/6. The sheet has no Flash column.
8. The scorecard opens at the competition's start time. Before it, the Climber sees the countdown to the start instead.
9. The Climber can set the opacity of the sheet's white background from 10% to 100%, so the competition's background shows through it. The browser keeps the setting until they log out.
10. The Climber records their own results until the competition's end time, and the scorecard counts down to it. When it arrives, the scorecard stops taking results without being reloaded, and the results are final.
11. 15 minutes and 5 minutes before the end time, a warning says when scoring closes and that the scorecard closes then.
12. When the end time arrives, the Climber is moved to the final leaderboard, and the scorecard can't be opened again, by going back, by its address, or by reloading.
13. While scoring is open, each problem has one circle for each attempt the competition allows. Tapping a circle marks that attempt and the ones before it as failed, in red. Sent it marks the next circle as the top, in green, and the circles after it stay empty.
14. The Climber can correct a problem: tapping the last marked circle again clears it, whether it was a failed attempt or the top.
15. Failed attempts, the top, and unused circles can be told apart without relying on colour alone, and every circle is large enough to tap on a phone.
16. The sheet shows 10 problems at a time, with a button for each range of 10 problems, and Previous and Next under them. The filters keep working with the pages, and printing prints every problem.
17. On a phone, the competition's details and the Climber's totals above the sheet, and the sheet's own details, each fold into a bar that opens and closes. They start folded, and the browser keeps the choice until the Climber logs out. Nothing folds on a larger screen.
18. The scorecard has no refresh button, because it updates live. When live updates stop, it offers to reconnect them.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-019, US-030, US-033

---

#### US-032: Ranking and Leaderboard

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to view the competition leaderboard, so that I can see my current position in the event.

**Description:**  
The Ranking and Leaderboard feature displays current standings based on official competition scores.

**Acceptance Criteria:**

1. The Climber can open the leaderboard for the selected competition.
2. The leaderboard displays the current competition rankings.
3. The logged-in Climber can identify their current position.
4. Rankings are based on official competition scores.
5. Rankings update when official results change.
6. The leaderboard shows the standings of the Climber's own division, without a division to choose.
7. The leaderboard opens at the competition's start time. Before it, the Climber sees the countdown to the start instead.
8. While the competition is on, the leaderboard shows a countdown to its end time, when scoring closes, and a warning 15 minutes and 5 minutes before it.
9. After the competition ends, the leaderboard shows the final standings of every division, the Climber's own division first, with their own name and place highlighted.
10. The leaderboard has no refresh button, because it updates live. When live updates stop, it offers to reconnect them.
11. On a phone, the competition's details above the standings fold into a bar that opens and closes, and the Climber's own position stays in view. Nothing folds on a larger screen.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-020, US-030, US-031, US-033

---

#### US-033: Climber AI Route Assistant

**User/Role:** Climber (CLIMBER)

**Story Statement:**  
As a Climber, I want to ask the AI about my available routes and current competition position, so that I can make better decisions during the event.

**Description:**  
The Climber AI Route Assistant uses available competition statistics, current official standings, and the Climber's own recorded results to provide recommendations and explanations. It is a chatbot that opens inside My scorecard and the leaderboard, not a page of its own.

**Acceptance Criteria:**

1. The Climber can ask the AI for a recommendation about which available route to try.
2. Route recommendations use available competition statistics and the Climber's recorded results.
3. When the Climber asks for an unfinished route, completed routes are excluded from the recommendation.
4. The AI provides a recommended route with a short explanation when sufficient information is available.
5. The Climber can ask how many points currently separate them from a target ranking, and the answer uses the current official standings and scoring information.
6. A target-ranking response explains the current point difference without guaranteeing a final placement.
7. The AI cannot create or modify official results, official route grades, official rankings, or competition winners.
8. The Climber opens the chatbot with Ask AI on My scorecard and on the leaderboard. It opens as a panel on the page and already knows the competition and the page.
9. The first time the Climber opens the chatbot on a kind of page, it shows a short welcome. Suggested questions can be clicked to start a conversation.
10. The conversation stays visible while the Climber uses the chatbot. It shows that it is working while the AI answers, and a clear message when the AI can't answer.
11. The AI only uses the Climber's own results and the places and totals of their division. It can't show another Climber's private information, another gym's data, passwords, tokens, or API keys.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-022, US-023, US-031, US-032

---

### Feature Area 8: Gym Registration and Access Management

The Gym Onboarding and Access feature area allows a Visitor who represents a climbing gym to request access to TopSend while ensuring that Gym Administrator permissions are approved by a System Administrator.

---

#### US-034: Submit Gym Registration

**User/Role:** Visitor (VISITOR)

**Story Statement:**  
As a Visitor representing a climbing gym, I want to request Gym Administrator access, so that my gym can use TopSend to manage local competitions.

**Description:**  
A Visitor cannot directly assign themselves the GYM_ADMIN role. A request can either include a new gym that needs to be registered or request access to a gym that already exists in TopSend.

**Acceptance Criteria:**

1. The Visitor can open Request Gym Admin access from the Log in page.
2. The Visitor can indicate whether the request is for a new gym or an existing registered gym.
3. The Visitor can provide the required contact and gym information.
4. Submitting valid information creates a pending access request.
5. Submitting the request does not immediately provide GYM_ADMIN permissions.
6. The Visitor receives confirmation that the request was submitted for review.
7. If the request is approved, the user receives instructions to complete their Gym Administrator account setup.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-001, US-004, US-006, US-035, US-036

---

#### US-035: Review Gym Administrator Access Requests

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to review Gym Administrator access requests, so that only authorized users can manage competitions for a gym.

**Description:**  
The System Administrator reviews requests submitted by Visitors who want to register a new gym or receive administrative access to an existing gym.

**Acceptance Criteria:**

1. The Admin can view pending Gym Administrator access requests.
2. The Admin can view the applicant's submitted contact and gym information.
3. The Admin can approve or reject a pending request.
4. When a new-gym request is approved, the approved gym can be registered in TopSend.
5. When an existing-gym request is approved, the user is associated with the correct registered gym.
6. An approved applicant can complete account setup and receive active GYM_ADMIN access.
7. A rejected request does not provide the applicant with Gym Administrator permissions.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003, US-004, US-006, US-034

---

### Feature Area 9: Visitor Landing Page

The Visitor Landing Page feature area introduces TopSend to people who are not logged in, so that they can see what TopSend offers before they create an account or log in.

---

#### US-036: Visitor Landing Page

**User/Role:** Visitor (VISITOR)

**Story Statement:**  
As a Visitor, I want to view a landing page, so that I can understand what TopSend is, what features it offers, and how I can use the system.

**Description:**  
The landing page gives Visitors a simple overview of TopSend before they create an account or log in. It introduces TopSend, shows its main features, explains what Visitors, Climbers, and Gym Administrators can do, and links to Log in, Sign up, and the public features available to Visitors.

**Acceptance Criteria:**

1. A Visitor can open the landing page without an account.
2. The landing page clearly explains the purpose of TopSend.
3. The main features and services of TopSend are shown.
4. The Log in and Sign up options are easy to find.
5. Public features can be accessed from the landing page.
6. The landing page works properly on desktop and mobile.
7. The landing page matches the existing TopSend design.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-001, US-002, US-025, US-034

---

### Feature Area 10: Onboarding

The Onboarding feature area shows new users around TopSend, so that each role finds its main features the first time it opens the system.

---

#### US-037: First-Time Onboarding Tutorial

**User/Role:** System Administrator (ADMIN), Gym Administrator / Event Organizer (GYM_ADMIN), Climber (CLIMBER)

**Story Statement:**  
As a new TopSend user, I want a short guided tour of my role's main features the first time I open TopSend, so that I know where everything is, and I want to open it again whenever I need a reminder.

**Description:**  
The first time a System Administrator, Gym Administrator, or Climber opens TopSend after logging in, a step-by-step tutorial for their role opens by itself. Each step explains one feature and spotlights the button or menu item it's about, such as Discover competitions and My Events for a Climber, Create competition for a Gym Administrator, or Gym requests for a System Administrator. On a phone, where the menu items are behind the menu button, a step spotlights the menu button. A Climber's tutorial also explains how to record attempts on the scorecard's circles, and on a phone the tutorial explains the sections that fold into a bar. TopSend remembers on the account that the tutorial was seen, so it doesn't open by itself again on any device. An Onboarding tips button opens it again at any time.

**Acceptance Criteria:**

1. The first time an ADMIN, GYM_ADMIN, or CLIMBER opens TopSend after logging in, a step-by-step tutorial for their role opens by itself.
2. Each step explains one feature of the role and spotlights the button or menu item it's about.
3. The user can go to the next step or the previous step, and can skip the tutorial at any time.
4. Once the user finishes or skips the tutorial, it doesn't open by itself again for that account, on any device.
5. An Onboarding tips button opens the tutorial again at any time, without changing what the account remembers.
6. The tutorial works on desktop and mobile screen sizes, with a keyboard, and with a screen reader.
7. The tutorial only shows features the user's role can use.
8. A Climber's tutorial has a step about recording attempts on the scorecard's circles.
9. On a phone, a Climber's and a Gym Administrator's tutorial has a step about the sections that fold into a bar. That step isn't shown on a larger screen, where nothing folds.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-001, US-002, US-011, US-025, US-030, US-034
