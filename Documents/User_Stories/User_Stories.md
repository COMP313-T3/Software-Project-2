# User Stories

## Overview

This document contains the user stories for TopSend. The user stories are based on our project proposal, user roles and personas, and low fidelity prototypes.

The user roles used in this document are:

- ADMIN - System Administrator
- GYM_ADMIN - Gym Administrator / Event Organizer
- COMP - Competitor

---

# Feature Area 1: System Administrator

## US-001: Admin Login

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to login to TopSend so that I can access the admin side of the system.

**Description:** The System Administrator needs to sign in before accessing the Admin Dashboard and management tools.

**Acceptance Criteria:**
1. Admin can enter their login information.
2. Admin can sign in using a valid ADMIN account.
3. Correct login information opens the Admin Dashboard.
4. Wrong login information shows an error message.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002

---

## US-002: Admin Dashboard

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to view the Admin Dashboard so that I can see an overview of the TopSend platform.

**Description:** The Admin Dashboard is the main page where the System Administrator can see platform information and open the different admin tools.

**Acceptance Criteria:**
1. Admin can view the platform overview.
2. Admin can see the number of registered gyms.
3. Admin can see user totals.
4. Admin can access the available admin management tools.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-001, US-003, US-005, US-007, US-009

---

## US-003: Manage Gyms

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage climbing gyms so that I can control which gyms are registered in TopSend.

**Description:** The Manage Gyms page lets the Admin view registered gyms, add a new gym, and open gym details.

**Acceptance Criteria:**
1. Admin can view the gym list.
2. Admin can add a new gym.
3. Admin can select a gym from the list.
4. Admin can open the selected gym's details.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002, US-004

---

## US-004: Gym Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage a gym's details so that its information and access stay updated.

**Description:** After selecting a gym, the Admin can view and manage more information about that gym.

**Acceptance Criteria:**
1. Admin can edit the gym information.
2. Admin can view the Gym Administrators connected to the gym.
3. Admin can deactivate or remove a gym when needed.
4. Changes are connected to the selected gym.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-003, US-005

---

## US-005: Manage Gym Administrators

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage Gym Administrators so that authorized gym staff can access their gym management features.

**Description:** A gym can have multiple Gym Administrator accounts such as an owner, manager, or competition staff.

**Acceptance Criteria:**
1. Admin can select a gym.
2. Admin can view the Gym Administrators under that gym.
3. Admin can add a new Gym Administrator.
4. The new Gym Administrator is connected to the selected gym.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-004, US-006

---

## US-006: Administrator Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage a Gym Administrator's details so that their access stays correct.

**Description:** The Admin can open a Gym Administrator account and manage their access.

**Acceptance Criteria:**
1. Admin can open a Gym Administrator's details.
2. Admin can edit the Gym Administrator's access.
3. Admin can remove a Gym Administrator from the gym.
4. Admin can deactivate the Gym Administrator account.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-005

---

## US-007: Manage Users

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage TopSend users so that I can find and check registered user accounts.

**Description:** The Manage Users page gives the Admin access to the users registered in TopSend.

**Acceptance Criteria:**
1. Admin can view all registered users.
2. Admin can search for a user.
3. Admin can filter the user list.
4. Admin can select a user.
5. Admin can open the selected user's details.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002, US-008

---

## US-008: User Details

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage a user's details so that their information and access stay correct.

**Description:** After selecting a user, the Admin can manage information related to that account.

**Acceptance Criteria:**
1. Admin can edit allowed user information.
2. Admin can change the user's role or permissions when allowed.
3. Admin can deactivate the user account.
4. Changes are applied to the selected user.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-007

---

## US-009: System Configuration and Advanced Settings

**User/Role:** System Administrator (ADMIN)

**Story Statement:** As a System Administrator, I want to manage the system configuration so that I can control the main TopSend platform settings.

**Description:** The System Administrator can manage the general and advanced settings for TopSend.

**Acceptance Criteria:**
1. Admin can manage platform information.
2. Admin can manage email notification settings.
3. Admin can manage user registration settings.
4. Admin can access security settings.
5. Admin can manage maintenance mode.
6. Saved settings stay updated after the changes are made.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-002

---

# Feature Area 2: Gym Administrator / Event Organizer

## US-010: Gym Administrator Login

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to login to TopSend so that I can manage competitions for my gym.

**Description:** The Gym Administrator needs to sign in before accessing their gym competition tools.

**Acceptance Criteria:**
1. Gym Admin can enter their login information.
2. Gym Admin can sign in using a valid account.
3. Correct login information opens the Gym Admin Dashboard.
4. Gym Admin only gets management access to their assigned gym.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-011

---

## US-011: Gym Admin Dashboard

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to view my dashboard so that I can see and manage my gym competitions.

**Description:** The dashboard is the main page for competition management.

**Acceptance Criteria:**
1. Gym Admin can view competitions from their gym.
2. Gym Admin can see upcoming events.
3. Gym Admin can open competition management tools.
4. Gym Admin can see a competition overview.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-010, US-012, US-014, US-016, US-018, US-020, US-022, US-024

---

## US-012: Competition Creation

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to create a competition so that my gym can run a bouldering event using TopSend.

**Description:** The Competition Creation page lets the Gym Admin enter the basic information needed for a new event.

**Acceptance Criteria:**
1. Gym Admin can enter the event name.
2. Gym Admin can set the event date.
3. Gym Admin can set the location.
4. Gym Admin can add an event description.
5. Gym Admin can set the maximum number of climbers.
6. Gym Admin can save the competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-011, US-013

---

## US-013: Competition Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to manage the competition details so that I can update the event after it is created.

**Description:** The Competition Details page gives the Gym Admin more control over an existing event.

**Acceptance Criteria:**
1. Gym Admin can edit the competition information.
2. Gym Admin can view the number of registered competitors.
3. Gym Admin can update the maximum number of climbers.
4. Gym Admin can open registration.
5. Gym Admin can close registration.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-012, US-014

---

## US-014: Divisions and Competitors

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to manage divisions and competitors so that participants are organized properly for the competition.

**Description:** The Gym Admin can create divisions and see the climbers registered for the event.

**Acceptance Criteria:**
1. Gym Admin can create a competition division.
2. Gym Admin can assign competitors to a division.
3. Gym Admin can view registered competitors.
4. Division information is connected to the correct competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-013, US-015

---

## US-015: Competitor Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to manage a competitor's competition details so that their registration information stays correct.

**Description:** The Gym Admin can open a registered competitor and make changes when needed.

**Acceptance Criteria:**
1. Gym Admin can update allowed competitor information.
2. Gym Admin can assign the competitor to a division.
3. Gym Admin can change the competitor's division.
4. Gym Admin can remove the competitor's registration.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-014

---

## US-016: Routes / Boulder Problems

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to add boulder problems so that the competition has routes for competitors to climb.

**Description:** The Gym Admin creates the boulder problems that will be used in the competition.

**Acceptance Criteria:**
1. Gym Admin can add a boulder problem.
2. Gym Admin can assign a route grade.
3. Gym Admin can set the point value when needed.
4. The boulder problem is connected to the correct competition.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-011, US-017

---

## US-017: Route Details

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to manage route details so that the information for each boulder stays correct.

**Description:** The Route Details page lets the Gym Admin update an existing boulder problem.

**Acceptance Criteria:**
1. Gym Admin can edit the route notes.
2. Gym Admin can edit the V-grade.
3. Gym Admin can edit the point value.
4. Changes are saved to the selected route.

**Priority:** High

**Complexity/Effort Estimate:** Small

**Related Stories:** US-016, US-022

---

## US-018: Scoring and Results

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to configure the scoring format so that the competition follows the correct scoring rules.

**Description:** The scoring format controls how official competitor scores will be calculated.

**Acceptance Criteria:**
1. Gym Admin can open the Scoring and Results section.
2. Gym Admin can select a supported scoring format.
3. The selected scoring format is saved to the competition.
4. The same scoring rules are used for competitors in the event.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-011, US-019

---

## US-019: Result Entry

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to enter competitor results so that TopSend can calculate their official competition scores.

**Description:** Competition results are entered based on what the competitor completed during the event.

**Acceptance Criteria:**
1. Gym Admin can record a route attempt.
2. Gym Admin can record a successful send.
3. Gym Admin can record a flash when the scoring format supports it.
4. Gym Admin can save the result.
5. TopSend calculates the official score using the saved result.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-018, US-020, US-028

---

## US-020: Live Leaderboard and Displays

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to view the live leaderboard so that I can see the current rankings during the competition.

**Description:** The live leaderboard uses the recorded results to show the current competition standings.

**Acceptance Criteria:**
1. Gym Admin can view live competitor rankings.
2. Rankings update when official results change.
3. Gym Admin can access the display customization options.
4. The leaderboard uses the competition's official scoring rules.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-019, US-021, US-033

---

## US-021: Display Customization

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to customize the leaderboard display so that it matches the gym and competition.

**Description:** The Gym Admin can change the appearance of the event's public leaderboard.

**Acceptance Criteria:**
1. Gym Admin can add a gym or event logo.
2. Gym Admin can add a competition background.
3. Gym Admin can add sponsor images.
4. The customization is saved to the correct competition.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-020

---

## US-022: Route Statistics and AI Analysis

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to view route statistics so that I can understand how competitors performed on each route.

**Description:** TopSend uses the competition results to provide useful statistics about each boulder problem.

**Acceptance Criteria:**
1. Gym Admin can view the completion rate.
2. Gym Admin can view the average number of attempts.
3. Gym Admin can view the flash rate.
4. Statistics use the recorded competition results.
5. Statistics are connected to the correct route.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-017, US-019, US-023

---

## US-023: Gym Admin AI Route Assistant

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to ask the AI about route performance so that I can better understand the competition data.

**Description:** The AI Route Assistant uses the available route and competition statistics to answer questions about route performance.

**Acceptance Criteria:**
1. Gym Admin can ask a question about route performance.
2. AI can use available competition statistics.
3. AI can use information such as V-grade, completion rate, average attempts, and flash rate.
4. AI can explain how a route performed compared to other routes.
5. AI does not change official scores or route grades.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-022, US-034

---

## US-024: Competition History

**User/Role:** Gym Administrator / Event Organizer (GYM_ADMIN)

**Story Statement:** As a Gym Administrator, I want to view previous competitions so that I can review past results and route performance.

**Description:** Competition History keeps information from previous events organized under the gym.

**Acceptance Criteria:**
1. Gym Admin can view previous events.
2. Gym Admin can review past competition results.
3. Gym Admin can review previous route performance.
4. Gym Admin only sees competition history from their own gym.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-022, US-023

---

# Feature Area 3: Competitor

## US-025: Competitor Login and Account Creation

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to create an account or login so that I can use TopSend and register for competitions.

**Description:** The competitor needs an account before accessing their registered competition features.

**Acceptance Criteria:**
1. A new competitor can create an account.
2. An existing competitor can sign in.
3. Correct login information gives access to competitor features.
4. The account is registered as a Competitor account.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-026

---

## US-026: Discover Competitions

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to discover available competitions so that I can find an event I want to join.

**Description:** The competitor can search available events and choose between list and map views.

**Acceptance Criteria:**
1. Competitor can browse available events.
2. Competitor can search or filter events.
3. Competitor can open the list view.
4. Competitor can open the map view.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-025, US-027, US-028

---

## US-027: Competition List View

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to view competitions in a list so that I can quickly compare available events.

**Description:** The List View shows basic information about upcoming competitions.

**Acceptance Criteria:**
1. Competitor can see upcoming events.
2. Competitor can see the gym name.
3. Competitor can see the event date.
4. Competitor can select an event.

**Priority:** High

**Complexity/Effort Estimate:** Small

**Related Stories:** US-026, US-029

---

## US-028: Competition Map View

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to see competitions on a map so that I can see where the events are located.

**Description:** The Map View shows competitions based on the location of the gym hosting the event.

**Acceptance Criteria:**
1. Competitor can see event location pins.
2. Competitor can view the gym location.
3. Competitor can select an event from the map.
4. Selecting an event allows the competitor to continue to the event details.

**Priority:** Medium

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-026, US-029

---

## US-029: Event Details and Registration

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to view the event details and register so that I can join a competition that I am interested in.

**Description:** The competitor can review the important information before registering for an event.

**Acceptance Criteria:**
1. Competitor can view the event description.
2. Competitor can view the available divisions.
3. Competitor can view the event date and location.
4. Competitor can view the maximum number of climbers.
5. Competitor can view the number of spots remaining.
6. Competitor can register for the event when registration is available.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-027, US-028, US-030

---

## US-030: Check Registration Status

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to check my registration status so that I know if I successfully joined the competition.

**Description:** TopSend shows the competitor what happened after they register for an event.

**Acceptance Criteria:**
1. Competitor can see when their registration is confirmed.
2. Competitor can see when an event is already full.
3. If waitlist is available, the competitor can join the waitlist.
4. The registration status is connected to the correct competition.

**Priority:** High

**Complexity/Effort Estimate:** Small

**Related Stories:** US-029, US-031

---

## US-031: My Events

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to view my registered events so that I can access the competitions I joined.

**Description:** My Events contains the competitions that the competitor has already registered for.

**Acceptance Criteria:**
1. Competitor can view registered events.
2. Competitor can select a registered event.
3. Competitor can open the event dashboard.
4. Competitor can access the available digital competition tools.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-030, US-032, US-033, US-034

---

## US-032: My Scorecard

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to view my digital scorecard so that I can track my progress during the competition.

**Description:** The digital scorecard shows the competitor's routes and recorded competition results.

**Acceptance Criteria:**
1. Competitor can view the competition routes.
2. Competitor can track completed problems.
3. Competitor can track unfinished problems.
4. Competitor can see their recorded results.
5. Scorecard information updates when official results change.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-019, US-031, US-034

---

## US-033: Ranking and Leaderboard

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to view the live ranking so that I can see my position in the competition.

**Description:** The leaderboard lets competitors follow the current standings while the event is running.

**Acceptance Criteria:**
1. Competitor can view the live ranking.
2. Competitor can see their current position.
3. Competitor can see standings updates when results change.
4. Rankings use the official competition scores.

**Priority:** High

**Complexity/Effort Estimate:** Medium

**Related Stories:** US-020, US-031

---

## US-034: Competitor AI Route Assistant

**User/Role:** Competitor (COMP)

**Story Statement:** As a Competitor, I want to ask the AI what route I should try next so that I can decide which unfinished route may be good for me.

**Description:** The AI Route Assistant uses the competitor's results and competition statistics to provide a route recommendation.

**Acceptance Criteria:**
1. Competitor can ask what route they should try next.
2. Competitor can see the recommended route.
3. AI can use available competition statistics.
4. AI can give an explanation for the recommendation.
5. Completed routes are not recommended when asking for an unfinished route.
6. AI recommendations do not change the competitor's official score.

**Priority:** High

**Complexity/Effort Estimate:** Large

**Related Stories:** US-023, US-031, US-032
