---
name: topsend-traceability-testing
description: Use when deriving implementation checks or tests for a TopSend User Story from its approved acceptance criteria, requirements, contracts, and non-functional requirements.
---

# TopSend Traceability and Testing

## Build the trace for one story

Before implementation or review, create a short working trace for the single requested story:

`US-NNN -> linked FR-NNN -> applicable AC-NNN -> relevant contract/domain/event -> tests`

Use the complete story in `docs/User_Stories/User_Stories.md`; confirm links and acceptance criteria in `specs/specs.md` and `docs/Requirements/requirements.md`. Read only relevant sections of the contracts and implementation plan, but verify every linked boundary used by the story. Do not renumber, merge, rewrite, or supplement approved identifiers.

The trace is a work aid, not permission to edit approved documentation or create new requirements. If a criterion lacks a defined outcome, or two sources conflict, report the gap and ask before implementing or claiming compliance.

## Test expectations

Derive tests from the requested story and contracts. Prefer observable assertions for each applicable acceptance criterion, including:

- Positive and validation/error paths explicitly described by the story or FR.
- Exact role and gym authorization boundaries involved in that story.
- Data association, persistence, and failure integrity where the requirements apply.
- UI behavior and responsive constraints if the story changes a user-facing page.
- External integration success/failure behavior only where its story, contract, or NR defines it.

Use the project's existing test tooling and patterns. Do not add a test framework or dependency, invent expected HTTP codes/error shapes, or impose generic coverage thresholds not required by TopSend documentation. Tests must assert real behavior and must not encode a behavior from another User Story.

## Apply applicable NRs, not all NRs blindly

Check the six documented non-functional requirements when relevant to the story:

- `NR-001`: 95% of normal page loads and actions within 3 seconds, excluding unavailable third-party services.
- `NR-002`: protected-page authorization tests pass; passwords are not plain text; Visitors cannot access protected features.
- `NR-003`: Google Maps shows markers or a clear loading/error state within 5 seconds, and List View remains usable when maps fail.
- `NR-004`: successful registrations/results persist; failed saves do not leave partial/duplicate results; leaderboards and scorecards reflect valid official results.
- `NR-005`: core pages remain usable at approximately 360px, 768px, and 1440px without horizontal page scrolling.
- `NR-006`: user-readable errors, contextual server-side logging, and no sensitive technical details exposed to normal users.

Apply only requirements relevant to the story's behavior. Do not use these summaries to broaden a story or invent implementation details beyond the approved documents.

## Completion report

Report:

1. The single US/task addressed.
2. Implemented acceptance criteria with US/FR/AC traceability.
3. Tests/checks run and their actual outcomes.
4. Applicable NRs verified or not verified.
5. Any blocked criteria, unresolved dependency, or documentation conflict.

Do not claim all acceptance criteria pass based only on a build, a subset of tests, or code inspection.
