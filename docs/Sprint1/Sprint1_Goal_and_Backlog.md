# Sprint 1 Goal and Backlog

## Sprint 1 Goal

For Sprint 1, our goal was to build the main foundation and core competition flow of TopSend.

We focused on authentication and role-based access, Admin and Gym Administrator features, competition setup, divisions and Climbers, routes, scoring configuration, competition discovery, and event registration.

By the end of Sprint 1, our goal was to have a working version where the main user roles could use the core features of the system, from creating and managing competitions to allowing Climbers to discover and register for events.

---

## Sprint 1 Main Features

During Sprint 1, we focused on the following main feature areas:

- Authentication and role-based access
- System and gym administration
- Competition management
- Division and Climber management
- Route / boulder problem management
- Scoring configuration
- Competition discovery
- Competition list and map views
- Event registration and registration status
- Gym registration and Gym Administrator access requests

Features such as live results, leaderboards, analytics, competition history, and the AI Route Assistant are planned for Iteration 2.

---

## Sprint 1 Backlog

The following User Stories were selected for Iteration 1. The priorities and statuses below are based on our GitHub Issues.

| User Story | Title | Priority | Assigned Team Member(s) | Expected Completion | Final Status |
|---|---|---|---|---|---|
| US-001 | User Login | Medium | Gabriel - Backend/Frontend | Sprint 1 | Done |
| US-002 | Create Climber Account | High | Gabriel - Backend/Frontend  | Sprint 1 | Done |
| US-003 | Admin Dashboard | Medium | RICHARD - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-004 | Manage Gyms | High | JOSEPH - BACKEND & RUISHENG - FRONTEND | Sprint 1 | Done |
| US-005 | Gym Details | Medium | RICHARD - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-006 | Manage Gym Administrators | Medium | RUISHENG - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-011 | Gym Admin Dashboard | High | JOSEPH - BACKEND & RUISHENG - FRONTEND | Sprint 1 | Done |
| US-012 | Competition Creation | High | JOSPEH - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-013 | Competition Details | Medium | RICHARD - BACKEND & RUISHENG - FRONTEND | Sprint 1 | Done |
| US-014 | Divisions and Climbers | Medium | JOSEPH - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-016 | Climber Details | Medium | RUISHENG - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-016 | Routes / Boulder Problems | Medium | RICHARD - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-017 | Route Details | Medium | RICHARD - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-018 | Configure Scoring Format | High | JOSEPH - BACKEND & RUISHENG - FRONTEND | Sprint 1 | Done |
| US-025 | Discover Competitions | Medium | JOSEPH - BACKEND & RUISHENG - FRONTEND | Sprint 1 | Done |
| US-026 | Competition List View | Low | RICHARD - BACKEND & GAB - FRONTEND | Sprint 1 | Done |
| US-027 | Competition Map View | High | RICHARD - BACKEND & GAB - FRONTEND | Sprint 1 | Done |
| US-028 | Event Registration | High | RUISHENG - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-029 | Check Registration Status | Low | JOSEPH - BACKEND & BRIAN - FRONTEND | Sprint 1 | Done |
| US-034 | Submit Gym Registration | Medium |  JOSEPH - BACKEND & RUISHENG - FRONTEND| Sprint 1 | Done |
| US-035 | Review Gym Administrator Access Requests | Medium | JOSEPH - BACKEND & GAB - BACKEND | Sprint 1 | Done |

All 20 User Stories selected for Sprint 1 are marked as Done in GitHub Issues.

---

## Sprint 1 Priority Changes and Reasons

During Sprint 1, some priorities in our GitHub Issues were different from the original User Stories documentation.

The original priorities were based on our initial planning. As development progressed, we needed to consider which features were more important for the current sprint and which features supported the main competition workflow.

To keep our Sprint 1 backlog consistent with GitHub Issues, we used the priorities recorded in GitHub.

The following table explains the reasoning behind these updated priorities.

| User Story | Original Priority | Updated Priority | Reason for Change |
|---|---|---|---|
| US-001 — User Login | High | Medium | Login is still important because users need access to their accounts. However, we treated it as part of the basic system setup and focused more on the main competition features. |
| US-004 — Manage Gyms | Medium | High | Managing gyms is important because competitions need to be connected to the correct gym. We gave this higher priority to support Gym Administrator features. |
| US-011 — Gym Admin Dashboard | Medium | High | The dashboard is where Gym Administrators access their competitions and management tools, so it became one of the main features we needed. |
| US-014 — Divisions and Climbers | High | Medium | Divisions and Climber management are still needed, but we focused first on competition creation and the basic event setup. |
| US-016 — Routes / Boulder Problems | High | Medium | Routes are important for competitions, but we treated route management as a feature that builds on the initial competition setup. |
| US-025 — Discover Competitions | High | Medium | Climbers need to find available competitions, but our main focus was making sure they could successfully register for an event. |
| US-026 — Competition List View | High | Low | The list view mainly displays available competitions. We treated it as a supporting feature compared to the main event registration process. |
| US-027 — Competition Map View | Medium | High | The map became a bigger focus because it helps Climbers find competitions based on gym locations. This was also important for our location-based competition discovery feature. |
| US-029 — Check Registration Status | Medium | Low | Checking registration status is useful, but we focused more on making sure Climbers could register successfully first. |
| US-034 — Submit Gym Registration | High | Medium | Gym registration requests were still needed, but we focused more on the existing gym and competition management features during Sprint 1. |
| US-035 — Review Gym Administrator Access Requests | High | Medium | Reviewing gym access requests is important for controlling Gym Administrator permissions, but the main competition flow received more attention. |

These priority changes helped us organize the Sprint 1 backlog based on the features we were focusing on.

High-priority stories represented features we wanted to focus on first. Medium-priority stories were still important but had lower priority than the main features. Low-priority stories were supporting features that were less urgent for our main sprint goal.

Even though some priorities were lowered, those User Stories were still part of Sprint 1 and were marked as completed in GitHub Issues.

---

## Task Breakdown and Assignments

Each User Story was broken down into smaller frontend, backend, integration, and testing tasks where needed.

We used GitHub Issues and our GitHub Project board to keep track of the assigned tasks, priorities, and progress.

Some of the tasks we worked on include:

- Building frontend pages and UI components
- Creating backend APIs
- Setting up MongoDB models and schemas
- Connecting the frontend and backend
- Checking user roles and permissions
- Fixing bugs and reviewing implementations
- Updating documentation and diagrams
- Testing features and preparing for deployment

Tasks were assigned to team members so we could keep track of who was working on each feature.

We also used branches, commits, and Pull Requests to record our individual contributions.

---

## Sprint 1 Progress Tracking

We used our GitHub Project board during Sprint 1 to track the progress of our User Stories and tasks.

The board mainly used the following statuses:

- Ready
- In Progress
- Done

Once a task was finished and reviewed, we moved it to Done.

We also used GitHub Issues to check the progress of each User Story and its related tasks.

### GitHub Project

[TopSend Sprint Backlog / Kanban Board](PASTE_GITHUB_PROJECT_LINK_HERE)

---

## Development Workflow

For Sprint 1, our team used Git branches and Pull Requests to manage our work.

Our general workflow was:

`Feature/Fix Branch → Pull Request → dev`

We worked on our assigned features using separate branches.

Once a feature was ready, we created a Pull Request so the changes could be reviewed before merging into the `dev` branch.

This helped us organize our work, avoid unnecessary conflicts, and keep track of what each team member contributed.

---

## Sprint 1 Completion

All 20 User Stories selected for Iteration 1 are marked as completed in our GitHub Issues.

By the end of Sprint 1, we had worked on the main foundation of TopSend, including authentication, gym administration, competition creation, route and division management, scoring configuration, competition discovery, and event registration.

These features provide the foundation for the remaining development work in Iteration 2.

The next iteration will focus on additional features such as live results, leaderboards, analytics, competition history, and the AI Route Assistant.

---

## Related Documentation

More detailed project information can be found in:

- `docs/User_Stories/User_Stories.md` — Full User Stories and Acceptance Criteria
- `docs/Requirements/requirements.md` — Project Requirements
- `docs/Mvp/mvp.md` — MVP Definition
- `docs/Project-Proposal/Project-Proposal.md` — Project Proposal
- `specs/specs.md` — Current Project Specification and Iteration Plan
- GitHub Issues — Individual User Story and task breakdowns
- GitHub Project — Sprint backlog, assignments, priorities, and progress
