# MVP Definition

## Overview

This document defines the MVP for TopSend based on the user stories from `user_stories.md`.

The user stories are separated into Must-Haves, Should-Haves, Nice-To-Haves, May-Haves, and Out of Scope. The Must-Haves are the features we need first so TopSend can run a local bouldering competition and provide the main value of the project.

---

## User Story Categorization

### Must-Haves

These are the main features needed for TopSend to actually work as a bouldering competition platform. Without these features, the main competition flow would not work.

| User Story | Justification |
|-----------|---------------|
| US-010: Gym Administrator Login | Gym Admin needs to login before they can create and manage their gym competitions. |
| US-012: Competition Creation | A competition needs to be created before routes, competitors, scoring, and results can be added. |
| US-014: Divisions and Competitors | Competitors need to be organized into divisions for the competition. |
| US-016: Routes / Boulder Problems | The competition needs boulder problems for competitors to climb and score on. |
| US-018: Scoring and Results | The gym needs to choose how the competition scores are calculated. |
| US-019: Result Entry | Results such as attempts, sends, and flashes need to be recorded for official scoring. |
| US-020: Live Leaderboard and Displays | Live rankings are one of the main features needed during the competition. |
| US-022: Route Statistics and AI Analysis | Competition data needs to be calculated into statistics so it can also be used by the AI feature. |
| US-025: Competitor Login and Account Creation | Competitors need an account so they can register and access their competition information. |
| US-026: Discover Competitions | Competitors need a way to find available competitions. |
| US-027: Competition List View | The list gives competitors the basic way to browse and select events. |
| US-029: Event Details and Registration | Competitors need to see event information and register before participating. |
| US-032: My Scorecard | Competitors need to see their routes and competition results. |
| US-033: Ranking and Leaderboard | Competitors need to see their current position during the event. |
| US-034: Competitor AI Route Assistant | This is one of TopSend's main differences because it helps competitors decide which unfinished route they may want to try next. |

---

### Should-Haves

These features are important and should be added soon after the MVP, but TopSend can still run a competition without them.

| User Story | Value & Timeline |
|-----------|-----------------|
| US-001: Admin Login | v1.1 - Allows the System Administrator to securely access the platform management side. |
| US-003: Manage Gyms | v1.1 - Makes it easier to add and manage different climbing gyms instead of setting them manually. |
| US-005: Manage Gym Administrators | v1.1 - Allows more staff members from a gym to get Gym Admin access. |
| US-011: Gym Admin Dashboard | v1.1 - Gives Gym Admins a better overview of their competitions and management tools. |
| US-013: Competition Details | v1.1 - Allows Gym Admin to edit competition details, capacity, and registration after creating the event. |
| US-015: Competitor Details | v1.1 - Allows Gym Admin to update competitor information and divisions when needed. |
| US-017: Route Details | v1.1 - Allows route information such as notes, V-grade, and points to be updated. |
| US-023: Gym Admin AI Route Assistant | v1.1 - Gives Gym Admins AI explanations about how routes performed during the competition. |
| US-024: Competition History | v1.2 - Keeps previous competition results and route statistics for later comparison. |
| US-030: Check Registration Status | v1.1 - Makes it easier for competitors to know if their registration is confirmed, full, or waitlisted. |
| US-031: My Events | v1.1 - Gives competitors one place to see all competitions they already registered for. |

---

### Nice-To-Haves

These features would make TopSend better and easier to use but are not needed for the core competition flow.

| User Story |
|-----------|
| US-002: Admin Dashboard |
| US-004: Gym Details |
| US-006: Administrator Details |
| US-021: Display Customization |

---

### May-Haves

These features are being considered, but we do not need to commit to them for the first releases.

| User Story | Tentative Status |
|-----------|-----------------|
| US-007: Manage Users | Can be added later if TopSend needs more advanced platform-wide user management. |
| US-008: User Details | Depends on how much control the System Administrator needs over individual accounts. |
| US-009: System Configuration and Advanced Settings | Can be added later when the platform needs more system-level configuration. |
| US-028: Competition Map View | Depends on time and the map/location service that will be used. The list view can already be used to discover events. |

---

### Out of Scope

These features are not planned for the first version of TopSend because they are outside the main purpose of running local Toronto bouldering competitions.

| Title or User Story | Reason Out of Scope |
|-------------------|-------------------|
| Lead Climbing Competitions | TopSend is currently focused only on bouldering competitions. |
| Speed Climbing Competitions | Outside the current competition scope. |
| Provincial or National Competitions | TopSend is focused first on smaller local gym competitions in Toronto. |
| IFSC-Certified Competitions | Too advanced for the current project scope. |
| Automatic Route Grading from Photos | Would require computer vision and a much larger AI system. |
| Video Movement Analysis | Requires computer vision and video processing that is outside the current project. |
| Automatic Hold Recognition | Requires image recognition and is not needed for the competition workflow. |
| Smart Sensors on Climbing Holds | Requires additional hardware that is outside the project. |
| Automatic Detection of Completed Climbs | Would require sensors or computer vision. |
| Full Gym Membership Management | TopSend is a competition platform, not a full gym management system. |
| Gym Point-of-Sale System | Payment and POS management is outside the main competition purpose. |
| Employee Scheduling and Payroll | This belongs to gym management software, not TopSend. |
| Native Android or iOS App | TopSend will use a responsive web application instead. |
| AI Changing Official Scores | Official scores will be calculated by the normal scoring system, not AI. |
| AI Automatically Changing Route Grades | The route setter or Gym Admin still controls the official route grade. |

---

## MVP Definition

**MVP User Stories:**  
US-010, US-012, US-014, US-016, US-018, US-019, US-020, US-022, US-025, US-026, US-027, US-029, US-032, US-033, US-034

**MVP Scope:**  
The TopSend MVP will allow a gym to create a local bouldering competition, organize competitors and routes, record results, calculate scores, and show a live leaderboard. Competitors will also be able to create an account, find and register for an event, view their scorecard and ranking, and use the AI Route Assistant to help decide which route they may want to try next.

**MVP Target Release Date:** TBD based on the course project schedule.

---

## MVP Implementation Plan

The Must-Have stories will be implemented in an order that makes sure the main dependencies are completed first.

| Priority | User Story | Depends On | Relates To |
|----------|-----------|-----------|-----------|
| 1 | US-010: Gym Administrator Login | None | US-025 |
| 2 | US-025: Competitor Login and Account Creation | None | US-010 |
| 3 | US-012: Competition Creation | US-010 | US-016 |
| 4 | US-014: Divisions and Competitors | US-012 | US-016 |
| 5 | US-016: Routes / Boulder Problems | US-012 | US-014 |
| 6 | US-018: Scoring and Results | US-012, US-016 | US-019 |
| 7 | US-026: Discover Competitions | US-012, US-025 | US-027 |
| 8 | US-027: Competition List View | US-026 | US-029 |
| 9 | US-029: Event Details and Registration | US-014, US-025, US-027 | US-030 |
| 10 | US-019: Result Entry | US-014, US-016, US-018, US-029 | US-020, US-032 |
| 11 | US-020: Live Leaderboard and Displays | US-018, US-019 | US-033 |
| 12 | US-032: My Scorecard | US-019, US-025, US-029 | US-033, US-034 |
| 13 | US-033: Ranking and Leaderboard | US-020, US-025, US-029 | US-032 |
| 14 | US-022: Route Statistics and AI Analysis | US-016, US-019 | US-020 |
| 15 | US-034: Competitor AI Route Assistant | US-022, US-032 | US-033 |
