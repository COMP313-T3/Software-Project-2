# MVP Definition

## Overview

This document explains the Minimum Viable Product (MVP) for TopSend by grouping all the user stories from based on how important they are for the first version of the product.

The MVP is about the number of features needed so that a climbing gym can sign up to TopSend set up and manage a local bouldering competition let Climbers make accounts and sign up for an event record the official results of the competition show the current standings, in real time and offer the Climber AI Route Assistant.

All the user stories are divided into Must-Haves, Should-Haves, Nice-To-Haves and May-Haves. Features that have been decided not to include in the TopSend project are also listed under Out of Scope.

---

## User Story Categorization

### Must-Haves

Must-Have stories are required for TopSend to deliver its core value in the release. Without these stories a gym would not be able to onboard users create a competition run a competition or give climbers the competition experience.

| User Story | Justification |
|-----------|---------------|
| US-001: User Login | Required for ADMIN, GYM_ADMIN, and CLIMBER users to securely access the features available to their roles. |
| US-002: Create Climber Account | Allows a Guest to become a registered Climber and participate in TopSend competitions. |
| US-012: Competition Creation | Allows an approved Gym Administrator to create the local bouldering competition that the rest of the competition workflow depends on. |
| US-014: Divisions and Climbers | Provides the divisions needed for registration and allows the gym to organize Climbers participating in the event. |
| US-016: Routes / Boulder Problems | Allows the Gym Administrator to define the boulder problems that Climbers will attempt and that the scoring system will use. |
| US-018: Scoring and Results | Defines the official scoring rules that TopSend uses consistently for the competition. |
| US-019: Result Entry | Allows authorized Gym Administrators to record official attempts, sends, and results so scores can be calculated. |
| US-020: Live Leaderboard and Displays | Provides current competition standings based on official results, which is a core part of the competition experience. |
| US-025: Discover Competitions | Allows Climbers to find available competitions before deciding which event to join. |
| US-026: Competition List View | Provides the minimum event-browsing interface needed for Climbers to view and select upcoming competitions. |
| US-028: Event Registration | Allows a Climber to select a division and register for an available competition. |
| US-031: My Scorecard | Allows Climbers to track their official progress, completed routes, unfinished routes, and recorded results during the competition. |
| US-033: Climber AI Route Assistant | Validates one of TopSend's main differentiators by using competition data to recommend routes and explain current ranking differences. |
| US-034: Request Gym Administrator Access | Provides a realistic way for a new climbing gym or authorized staff member to begin using TopSend without allowing unrestricted administrative registration. |
| US-035: Review Gym Administrator Access Requests | Allows the System Administrator to approve or reject Gym Administrator requests before administrative access is granted. |

---

### Should-Haves

Should-Have stories significantly improve TopSend and complete common workflows, but the initial product can still deliver its core competition-management value without them.

| User Story | Value & Timeline |
|-----------|-----------------|
| US-004: Manage Gyms | **v1.1 - Post-MVP.** Provides broader management of registered gyms after the initial gym-onboarding workflow is working. |
| US-006: Manage Gym Administrators | **v1.1 - Post-MVP.** Allows ongoing management of multiple Gym Administrators after initial access has been approved. |
| US-011: Gym Admin Dashboard | **v1.1 - Post-MVP.** Gives Gym Administrators a centralized overview, but competition-management features can initially be accessed directly. |
| US-013: Competition Details | **v1.1 - Post-MVP.** Allows organizers to edit competition information and manually open or close registration after event creation. |
| US-015: Climber Details | **v1.1 - Post-MVP.** Gives organizers more control over individual competition registrations and division assignments. |
| US-017: Route Details | **v1.1 - Post-MVP.** Allows existing boulder problems to be edited after creation. |
| US-022: Route Statistics | **v1.1 - Post-MVP.** Provides a dedicated interface for completion rate, average attempts, and flash rate. The calculations needed by the MVP AI feature may still be performed internally. |
| US-023: Gym Admin AI Route Assistant | **v1.2 - Post-MVP.** Extends TopSend's AI functionality to organizers by explaining route-performance statistics. |
| US-024: Competition History | **v1.2 - Post-MVP.** Allows gyms to compare previous competitions and route-performance data over time. |
| US-027: Competition Map View | **v1.1 - Post-MVP.** Adds Google Maps-based event discovery. The List View provides the minimum discovery workflow for the MVP. |
| US-029: Check Registration Status | **v1.1 - Post-MVP.** Gives Climbers a dedicated way to check confirmed, full, or waitlisted registration states. |
| US-030: My Events | **v1.1 - Post-MVP.** Provides a centralized page for competitions a Climber has joined. |
| US-032: Ranking and Leaderboard | **v1.1 - Post-MVP.** Provides a dedicated Climber-focused ranking experience. Basic competition standings are already available through the MVP live leaderboard. |

---

### Nice-To-Haves

Nice-To-Have stories improve administration or presentation but are not required for TopSend's core competition workflow.

| User Story |
|-----------|
| US-003: Admin Dashboard |
| US-005: Gym Details |
| US-007: Administrator Details |
| US-021: Display Customization |

---

### May-Haves

May-Have stories are useful platform-management features, but their value can be re-evaluated after the main competition workflow has been tested with users.

| User Story | Tentative Status |
|-----------|-----------------|
| US-008: Manage Users | Pending post-launch feedback on how much centralized user management the System Administrator requires. |
| US-009: User Details | Depends on the level of account-management functionality required after initial platform use. |
| US-010: System Configuration and Advanced Settings | Advanced platform configuration can be evaluated after the main competition workflow is stable. |

---

### Out of Scope

The following features were considered but are intentionally outside the scope of the first TopSend project.

| Title or User Story | Reason Out of Scope |
|-------------------|-------------------|
| Lead and Speed Climbing Competition Support | TopSend is focused specifically on local bouldering competitions for the initial project. |
| Provincial, National, and IFSC Competition Management | TopSend is designed for smaller gym-hosted competitions rather than official federation-level competitions. |
| Computer Vision, Smart Holds, and Automatic Climb Detection | These features would require additional hardware, computer-vision development, or technical resources outside the current project scope. |
| Full Gym Management, POS, Payroll, and Employee Scheduling | These features would turn TopSend into a general gym-management platform rather than a focused competition-management application. |
| Native Android and iOS Applications | The project will use a responsive web application instead of maintaining separate native mobile applications. |

---

## MVP Definition

**MVP User Stories:**  
US-001, US-002, US-012, US-014, US-016, US-018, US-019, US-020, US-025, US-026, US-028, US-031, US-033, US-034, US-035

**MVP Scope:**  
The TopSend MVP allows a climbing gym to request access to the platform, receive approval from a System Administrator, and use an approved Gym Administrator account to create and run a local bouldering competition. Climbers can create accounts, discover competitions, register for an event, view their digital scorecard and live standings, while Gym Administrators can configure routes and scoring, record official results, and provide the competition data used by the Climber AI Route Assistant.

The MVP is intended to validate whether a focused competition-management workflow combined with competition-specific AI assistance provides useful value for small-scale Toronto bouldering competitions.

**MVP Target Release Date:**  
TBD - To be confirmed by the team based on the Software Project 2 development schedule.

### MVP Assumptions

For the MVP, newly created competitions may use a default open-registration state. Full editing of registration status after event creation is included in US-013: Competition Details as a post-MVP Should-Have.

The dedicated Route Statistics interface in US-022 is also post-MVP. However, calculations required by the Climber AI Route Assistant, such as completion rate, flash rate, and average attempts, may still be calculated internally from official competition results.

The Competition List View is the minimum event-discovery interface for the MVP. The Google Maps-based Competition Map View is planned for v1.1 and will still have dedicated functional and non-functional requirements as required by professor feedback.

---

### MVP Implementation Plan

The implementation order below respects dependencies between the Must-Have user stories. Stories with no direct dependencies can be developed in parallel by different team members.

| Priority | User Story | Depends On | Relates To |
|----------|-----------|-----------|-----------|
| 1 | US-001: User Login | None | US-002, US-034 |
| 2 | US-002: Create Climber Account | None | US-001, US-028 |
| 3 | US-034: Request Gym Administrator Access | None | US-001, US-035 |
| 4 | US-035: Review Gym Administrator Access Requests | US-001, US-034 | US-012 |
| 5 | US-012: Competition Creation | US-001, US-035 | US-014, US-016 |
| 6 | US-014: Divisions and Climbers | US-012 | US-028 |
| 7 | US-016: Routes / Boulder Problems | US-012 | US-018 |
| 8 | US-018: Scoring and Results | US-012, US-016 | US-019 |
| 9 | US-025: Discover Competitions | US-012 | US-026 |
| 10 | US-026: Competition List View | US-025 | US-028 |
| 11 | US-028: Event Registration | US-001, US-002, US-014, US-026 | US-019, US-031 |
| 12 | US-019: Result Entry | US-014, US-016, US-018, US-028 | US-020, US-031 |
| 13 | US-020: Live Leaderboard and Displays | US-019 | US-031, US-033 |
| 14 | US-031: My Scorecard | US-019, US-028 | US-033 |
| 15 | US-033: Climber AI Route Assistant | US-019, US-020, US-031 | US-022, US-023 |

---

## MVP Implementation Summary

The MVP begins with three foundation workflows that can be developed in parallel:

1. Authentication and Climber account creation.
2. Gym Administrator access requests and System Administrator approval.
3. Preparation for the core competition-management workflow.

After Gym Administrator access is available, the team can create competition, create divisions, create routes, and score. Competition discovery and registration can then be developed at the time, as competition-management work.

Once Climbers are registered and official results can be entered TopSend can provide the leaderboard and digital scorecard. The Climber AI Route Assistant is implemented after official competition data, standings and individual scorecard information are available because the official competition data, the standings and the individual scorecard information provide the information needed for recommendations and explanations.
