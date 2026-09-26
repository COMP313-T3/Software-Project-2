# User Stories

## Overview

This document contains the user stories for TopSend. The stories are based on the Project Proposal, User Roles and Personas, low-fidelity prototypes, and professor feedback.

The authenticated roles are:

- ADMIN - System Administrator
- GYM_ADMIN - Gym Administrator / Event Organizer
- COMP - Competitor

The document also uses:

- Registered User - any authenticated ADMIN, GYM_ADMIN, or COMP user
- Unauthenticated User - someone who has not logged in yet

All registered users use the same Authentication subsystem. After login, TopSend identifies the user's assigned role and provides access to the correct features.

The feature areas are organized by system subsystem instead of by user role.

---

# Feature Area 1: Authentication

## US-001: User Login

**User/Role:** Registered User

**Story Statement:**  
As a registered TopSend user, I want to login to my account so that I can access the features available to my role.

**Description:**  
TopSend uses one authentication system for System Administrators, Gym Administrators, and Competitors.

**Acceptance Criteria:**

1. A registered user can enter their login information.
2. Valid login information allows the user to sign in.
3. Invalid login information shows an error message.
4. After login, the system identifies the user's assigned role.
5. ADMIN users receive access to System Administration features.
6. GYM_ADMIN users receive access to competition-management features for their assigned gym.
7. COMP users receive access to Competitor features.
8. A user cannot access protected features that are not allowed for their role.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002, US-003, US-011, US-025

---

## US-002: Create Competitor Account

**User/Role:** Unauthenticated User

**Story Statement:**  
As an unauthenticated user, I want to create a Competitor account so that I can register for competitions and use TopSend.

**Description:**  
A new visitor can create a Competitor account before accessing private Competitor features.

**Acceptance Criteria:**

1. An unauthenticated user can open the account-creation page.
2. The user can enter the required account information.
3. Required information must be completed before the account is created.
4. Duplicate account information is rejected when required.
5. A successful registration creates a COMP account.
6. The new user can use the account to login.
7. Creating an account does not automatically register the user for a competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-001, US-025, US-028

---

# Feature Area 2: System Administration

## US-003: Admin Dashboard

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to view the Admin Dashboard so that I can see an overview of the TopSend platform.

**Description:**  
The Admin Dashboard is the main page for platform administration.

**Acceptance Criteria:**

1. Admin can view the platform overview.
2. Admin can see registered gym information.
3. Admin can see user totals.
4. Admin can access the available administration tools.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-006, US-008, US-010

---

## US-004: Manage Gyms

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage registered gyms so that climbing gyms can use TopSend.

**Description:**  
The Admin can view registered gyms, add a new gym, and open gym details.

**Acceptance Criteria:**

1. Admin can view the gym list.
2. Admin can add a new gym.
3. Admin can select a gym.
4. Admin can open the selected gym's details.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003, US-005, US-006

---

## US-005: Gym Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage a gym's details so that its information stays correct.

**Description:**  
The Admin can manage information for a selected climbing gym.

**Acceptance Criteria:**

1. Admin can edit gym information.
2. Admin can view Gym Administrators connected to the gym.
3. Admin can deactivate or remove a gym when allowed.
4. Changes are applied to the correct gym.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-006

---

## US-006: Manage Gym Administrators

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage Gym Administrators so that authorized staff can manage competitions for their gym.

**Description:**  
A gym can have more than one Gym Administrator account. These accounts could belong to the owner, manager, event organizer, or another authorized staff member.

**Acceptance Criteria:**

1. Admin can select a gym.
2. Admin can view Gym Administrators assigned to that gym.
3. Admin can add a new Gym Administrator.
4. A new Gym Administrator is connected to the selected gym.
5. More than one Gym Administrator can be assigned to the same gym.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-005, US-007

---

## US-007: Administrator Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage a Gym Administrator's details so that their access stays correct.

**Description:**  
The System Administrator can review and manage the access of a selected Gym Administrator account.

**Acceptance Criteria:**

1. Admin can open a Gym Administrator account.
2. Admin can edit allowed account information.
3. Admin can edit allowed access or permissions.
4. Admin can remove the Gym Administrator from a gym when allowed.
5. Admin can deactivate the account.
6. A deactivated Gym Administrator cannot access protected Gym Admin features.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-006

---

## US-008: Manage Users

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage TopSend users so that I can find and review registered accounts.

**Description:**  
The Manage Users section allows the System Administrator to search and review users registered in TopSend.

**Acceptance Criteria:**

1. Admin can view registered users.
2. Admin can search for users.
3. Admin can filter the user list.
4. Admin can select a user.
5. Admin can open User Details.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003, US-009

---

## US-009: User Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage a user's details so that their information and access stay correct.

**Description:**  
The Admin can manage allowed information and access for a selected platform user.

**Acceptance Criteria:**

1. Admin can edit allowed user information.
2. Admin can change a role or permission when allowed.
3. Admin can deactivate a user account.
4. Changes apply to the selected user.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-008

---

## US-010: System Configuration and Advanced Settings

**User/Role:** System Administrator (ADMIN)

**Story Statement:**  
As a System Administrator, I want to manage system settings so that I can control important TopSend platform options.

**Description:**  
This section contains general and advanced settings for the TopSend platform.

**Acceptance Criteria:**

1. Admin can manage platform information.
2. Admin can manage email notification settings.
3. Admin can manage user-registration settings.
4. Admin can access security settings.
5. Admin can manage maintenance mode.
6. Saved settings remain after the page is refreshed.

**Priority:** Low

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003

---

# Feature Area 3: Competition Management

## US-011: Gym Admin Dashboard

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view my dashboard so that I can access my gym's competitions and management tools.

**Description:**  
The Gym Admin Dashboard provides an overview of competitions for the assigned gym.

**Acceptance Criteria:**

1. Gym Admin can view competitions from their assigned gym.
2. Gym Admin can see upcoming events.
3. Gym Admin can access competition-management tools.
4. Gym Admin can see a competition overview.
5. Gym Admin does not see private management information from another gym.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-014, US-016, US-018

---

## US-012: Competition Creation

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to create a competition so that my gym can run a local bouldering event.

**Description:**  
The Gym Administrator enters the basic information needed for a new competition.

**Acceptance Criteria:**

1. Gym Admin can enter the event name.
2. Gym Admin can set the event date.
3. Gym Admin can set the gym or event location.
4. Gym Admin can add an event description.
5. Gym Admin can set the maximum number of climbers.
6. Gym Admin can save the competition.
7. The saved competition is connected to the Gym Admin's assigned gym.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-013, US-014, US-016

---

## US-013: Competition Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to manage competition details so that I can update the event after creating it.

**Description:**  
The Competition Details page gives the Gym Administrator more control over an existing event.

**Acceptance Criteria:**

1. Gym Admin can edit competition information.
2. Gym Admin can view the registered competitor count.
3. Gym Admin can update the maximum number of climbers.
4. Gym Admin can open registration.
5. Gym Admin can close registration.
6. Changes are saved to the correct competition.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-014, US-028

---

## US-014: Divisions and Competitors

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to manage divisions and competitors so that participants are organized properly.

**Description:**  
The Gym Administrator can create divisions and organize the competitors registered for the competition.

**Acceptance Criteria:**

1. Gym Admin can create a competition division.
2. Gym Admin can assign competitors to a division.
3. Gym Admin can view registered competitors.
4. Division information belongs to the correct competition.
5. Only competitors registered for the selected competition appear in its competitor list.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-013, US-015, US-028

---

## US-015: Competitor Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to manage competitor details so that their competition information stays correct.

**Description:**  
The Gym Administrator can open a registered competitor and update competition-related information when needed.

**Acceptance Criteria:**

1. Gym Admin can update allowed competitor information.
2. Gym Admin can assign a competitor to a division.
3. Gym Admin can change a competitor's division.
4. Gym Admin can remove a competition registration when allowed.
5. Changes are connected to the correct competitor and competition.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-014

---

## US-016: Routes / Boulder Problems

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to create boulder problems so that competitors have routes to climb during the competition.

**Description:**  
The Gym Administrator creates the boulder problems used during the competition.

**Acceptance Criteria:**

1. Gym Admin can add a boulder problem.
2. Gym Admin can enter a route name or problem number.
3. Gym Admin can assign an official V-grade.
4. Gym Admin can set a point value when needed.
5. The boulder problem is connected to the correct competition.
6. TopSend does not automatically change the official V-grade.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-017, US-018

---

## US-017: Route Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to manage route details so that route information stays correct.

**Description:**  
The Route Details page allows the Gym Administrator to update an existing boulder problem.

**Acceptance Criteria:**

1. Gym Admin can edit route notes.
2. Gym Admin can edit the V-grade.
3. Gym Admin can edit the point value.
4. Changes are saved to the correct route.
5. Only an authorized user can change the official route information.

**Priority:** Medium

**Complexity/Effort Estimate:** Small

**Related Stories:** US-016, US-022

---

# Feature Area 4: Scoring and Live Results

## US-018: Scoring and Results

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to configure the scoring format so that competitors are scored using the correct rules.

**Description:**  
The selected scoring format controls how official competition scores are calculated.

**Acceptance Criteria:**

1. Gym Admin can select a supported scoring format.
2. The selected format is saved to the competition.
3. The same scoring rules are used for competitors in the event.
4. Official scoring uses normal system logic.
5. AI cannot change the official scoring rules.
6. AI cannot decide the competition winner.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-016, US-019, US-020

---

## US-019: Result Entry

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to record competitor results so that TopSend can calculate official scores.

**Description:**  
Official competition results are entered based on what the competitor completed during the event.

**Acceptance Criteria:**

1. Gym Admin can select a registered competitor.
2. Gym Admin can select a boulder problem from the competition.
3. Gym Admin can record a route attempt.
4. Gym Admin can record a successful send.
5. Gym Admin can record a flash when supported by the scoring format.
6. Gym Admin can save the result.
7. The result is connected to the correct competitor and route.
8. TopSend calculates the official score from the saved result.
9. AI cannot create or change an official result.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-018, US-020, US-031

---

## US-020: Live Leaderboard and Displays

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view the live leaderboard so that I can monitor the current competition rankings.

**Description:**  
The live leaderboard uses official competition results to display the current standings. A public version of the leaderboard may also be displayed to competitors and spectators.

**Acceptance Criteria:**

1. Gym Admin can view current rankings.
2. Rankings use official competition scores.
3. Rankings update when official results change.
4. Gym Admin can open display options.
5. Competitors can view the competition leaderboard.
6. A public leaderboard can be displayed to spectators without requiring a management account when public viewing is enabled.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-019, US-021, US-032

---

## US-021: Display Customization

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to customize the leaderboard display so that it matches the gym and event.

**Description:**  
Display customization allows the Gym Administrator to change the appearance of the public competition display.

**Acceptance Criteria:**

1. Gym Admin can add a gym or event logo.
2. Gym Admin can add a competition background.
3. Gym Admin can add sponsor images.
4. Customization belongs to the correct competition.
5. Saved customization appears on the competition display.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-020

---

# Feature Area 5: Analytics and Competition History

## US-022: Route Statistics and AI Analysis

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view route statistics so that I can understand how competitors performed on each route.

**Description:**  
TopSend calculates route statistics using recorded official competition results.

**Acceptance Criteria:**

1. Gym Admin can view completion rate.
2. Gym Admin can view average attempts.
3. Gym Admin can view flash rate.
4. Statistics use recorded competition results.
5. Statistics belong to the correct route.
6. Statistics do not automatically change the official route grade.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-019, US-023, US-033

---

## US-023: Gym Admin AI Route Assistant

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to ask the AI about route performance so that I can better understand competition data.

**Description:**  
The AI Route Assistant uses available competition statistics to help explain route performance.

**Acceptance Criteria:**

1. Gym Admin can ask a question about route performance.
2. AI uses available competition statistics.
3. AI can use the official V-grade, completion rate, average attempts, and flash rate.
4. AI can compare routes using available event data.
5. AI provides an explanation based on available data.
6. AI cannot change official scores.
7. AI cannot automatically change official route grades.

**Priority:** Medium

**Complexity/Effort Estimate:** Large

**Related Stories:** US-022, US-033

---

## US-024: Competition History

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:**  
As a Gym Administrator, I want to view previous competitions so that I can review past results and route performance.

**Description:**  
Competition History keeps previous event information connected to the gym.

**Acceptance Criteria:**

1. Gym Admin can view previous events.
2. Gym Admin can review past competition results.
3. Gym Admin can review previous route statistics.
4. Gym Admin only sees private competition history from their assigned gym.
5. Historical information remains connected to the correct competition.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-022, US-023

---

# Feature Area 6: Competition Discovery and Registration

## US-025: Discover Competitions

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to discover available competitions so that I can find an event I want to join.

**Description:**  
The Competitor can browse available events and use the available discovery views.

**Acceptance Criteria:**

1. Competitor can browse upcoming competitions.
2. Competitor can search or filter competitions.
3. Competitor can open the Competition List View.
4. Competitor can open the Competition Map View.
5. Selecting an available event allows the Competitor to continue to Event Details.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-026, US-027, US-028

---

## US-026: Competition List View

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to view competitions in a list so that I can quickly compare upcoming events.

**Description:**  
The List View displays basic information about upcoming competitions.

**Acceptance Criteria:**

1. Competitor can see upcoming events.
2. Competitor can see the gym name.
3. Competitor can see the event date.
4. Competitor can see the event location.
5. Competitor can select an event.
6. Selecting an event opens its Event Details page.

**Priority:** High

**Complexity/Effort Estimate:** Small

**Related Stories:** US-025, US-027, US-028

---

## US-027: Competition Map View

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to view competitions on a map so that I can see where each event is located.

**Description:**  
TopSend will use the Google Maps API to show the locations of gyms hosting available competitions using map pins.

**Acceptance Criteria:**

1. Competitor can open the Map View.
2. The map is displayed using the Google Maps API.
3. Available competitions appear as location pins.
4. Each pin represents the gym or event location connected to a competition.
5. Competitor can select a pin.
6. Selecting a pin shows basic event information.
7. Competitor can open Event Details from the selected map event.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-025, US-026, US-028

---

## US-028: Event Details and Registration

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to view event details and register so that I can participate in a competition.

**Description:**  
The Competitor can review important event information before deciding to register.

**Acceptance Criteria:**

1. Competitor can view the event description.
2. Competitor can view available divisions.
3. Competitor can view the event date.
4. Competitor can view the gym or event location.
5. Competitor can view the maximum number of climbers.
6. Competitor can view the number of remaining spaces.
7. Competitor can see whether registration is open or closed.
8. Competitor can select an available division.
9. Competitor can register while registration is open and space is available.
10. A successful registration is connected to the correct Competitor and competition.
11. The system does not allow confirmed registrations to exceed the competition's maximum participant capacity.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002, US-013, US-014, US-025, US-029

---

## US-029: Check Registration Status

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to check my registration status so that I know whether I am confirmed for the competition.

**Description:**  
Registration Status shows the current state of the Competitor's registration for a selected event.

**Acceptance Criteria:**

1. Competitor can see when registration is confirmed.
2. Competitor can see when the competition is full.
3. If waitlist functionality is enabled, the Competitor can see their waitlist status.
4. Registration status belongs to the correct event.
5. The system does not show the Competitor as registered for an event they did not join.

**Priority:** Medium

**Complexity/Effort Estimate:** Small

**Related Stories:** US-028, US-030

---

# Feature Area 7: Competitor Event Experience

## US-030: My Events

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to view my registered events so that I can access competitions I have joined.

**Description:**  
My Events gives the Competitor one place to view the competitions connected to their account.

**Acceptance Criteria:**

1. Competitor can view competitions they registered for.
2. Competitor can select a registered event.
3. Competitor can open the selected event dashboard.
4. Competitor can access the event tools available to them.
5. Events the Competitor did not register for do not appear as their registered events.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-029, US-031, US-032, US-033

---

## US-031: My Scorecard

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to view my digital scorecard so that I can track my competition progress.

**Description:**  
My Scorecard displays the Competitor's routes and official recorded results for the selected event.

**Acceptance Criteria:**

1. Competitor can view the competition routes.
2. Competitor can see completed problems.
3. Competitor can see unfinished problems.
4. Competitor can see their recorded official results.
5. The scorecard updates when official results change.
6. Results displayed on the scorecard belong to the logged-in Competitor and selected competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-019, US-030, US-033

---

## US-032: Ranking and Leaderboard

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to view the live leaderboard so that I can see my position in the competition.

**Description:**  
The Ranking and Leaderboard section uses official competition scores to display the current standings.

**Acceptance Criteria:**

1. Competitor can open the leaderboard.
2. Competitor can see current rankings.
3. Competitor can see their current position.
4. Rankings use official competition scores.
5. Rankings update when official results change.
6. The leaderboard reflects the selected competition's scoring rules.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-020, US-030, US-031, US-033

---

## US-033: Competitor AI Route Assistant

**User/Role:** Competitor (COMP)

**Story Statement:**  
As a Competitor, I want to ask the AI for information about my available routes and current competition position so that I can make a better decision during the competition.

**Description:**  
The Competitor AI Route Assistant uses available competition information, route statistics, official standings, and the Competitor's recorded results to provide recommendations and explanations.

**Acceptance Criteria:**

1. Competitor can ask the AI for a route recommendation.
2. AI uses available competition information.
3. Completed routes are excluded when the Competitor asks for an unfinished route.
4. AI may use the official V-grade, completion rate, flash rate, average attempts, and the Competitor's recorded results.
5. AI can recommend an unfinished route using the available competition information.
6. AI provides a short explanation for its recommendation.
7. Competitor can ask how many points currently separate them from a target ranking.
8. When answering a target-ranking question, AI uses the current official leaderboard and scoring information.
9. AI explains the current point difference but does not guarantee that the Competitor will finish in the target ranking because standings may continue to change.
10. AI cannot create, edit, or delete official competition results.
11. AI cannot change an official route grade.
12. AI cannot decide the competition winner.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-022, US-031, US-032
