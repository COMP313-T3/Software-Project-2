---
name: topsend-story-workflow
description: Use when planning or implementing TopSend work to enforce one approved User Story at a time, iteration boundaries, documented dependencies, and dev-branch integration assumptions.
---

# TopSend Story-by-Story Workflow

## Sources to consult

For every requested story, read its complete entry in `docs/User_Stories/User_Stories.md`, then trace it through:

- `specs/specs.md` for iteration assignment, linked FRs and ACs, business rules, architecture, and review gates.
- `docs/Requirements/requirements.md` for its FRs and applicable NRs.
- `docs/Mvp/mvp.md` for MVP categorization and dependency sequence.
- `docs/Roles_and_Persona/Roles_and_Persona.md` for role boundaries.
- Relevant sections of `specs/contracts/domain.md`, `specs/contracts/interfaces.md`, and `specs/contracts/events.md`.
- `specs/implementation-plan.md` for relevant dependencies and test expectations, not as authority to combine stories.
- Existing relevant code/tests and repository instructions before editing.

The existing `.github/skills/specs-driven-dev/` skill is general spec-authoring guidance. Preserve it. Use it when the user requests specification work; do not create or alter requirements/specs during an application implementation task.

## Required sequence

1. Identify the single requested US ID (or one explicitly bounded non-story task). Ask the user to choose one if multiple stories are requested or the requested scope is unclear.
2. Read that story, its acceptance criteria, related stories, linked FRs/NRs, relevant contracts, and documented dependencies before proposing or changing implementation.
3. Verify the story's iteration and scope against the project sources. Do not infer implementation scope from a broad feature area or task group.
4. Work only on the requested story and necessary integration surfaces. Do not implement future stories to anticipate a dependency.
5. Trace the result to the requested story's US, FR, and AC identifiers and verify it with appropriate tests.
6. Report completed scope, traceability, validation, and any blocker. Do not mark an unimplemented or unverified criterion complete.

## One-story and iteration rules

- The professor's rule is **one User Story at a time**. Multiple named stories in one request still require the agent to ask which single story to handle first.
- Do not implement future User Stories unless the user requests them as a separate task after the current story.
- Iteration 1 must not depend on an Iteration 2 User Story.
- If a story is blocked by another story in the same iteration, identify the exact dependency from the documentation and stop rather than implementing unrelated functionality or the dependency story.
- If source documents disagree about a story's iteration, MVP release category, dependencies, scope, or acceptance criteria, surface the conflicting statements and ask the user before coding. Do not silently treat MVP priority, Must-Have status, or implementation-plan ordering as permission to move a story between iterations.
- If approved project sources genuinely conflict about the requested story's scope, requirements, acceptance criteria, or dependencies, report the conflict before coding. For development scheduling, use the latest team-approved Iteration 1 and Iteration 2 assignments in specs/specs.md.

## Branch/workflow assumption

Assume development work is integrated through the `dev` branch and follow the team's documented Gitflow process. Leave branch creation, switching, merging, pushing, and other source-control operations to the human. Do not target `main` as the development integration branch.

## Scope protection

Do not change approved project documentation, add new USs/FRs/ACs, rename roles, or introduce features, requirements, architecture, workflows, technologies, or permissions. Do not scaffold the full application. If the requested behavior cannot be derived from the documentation, identify the exact gap and ask before filling it with an assumption.
