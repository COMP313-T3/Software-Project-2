---
name: topsend-domain-guardrails
description: Use when TopSend work touches roles, gym authorization, competition data, scoring, rankings, or the AI Route Assistant.
---

# TopSend Roles, Data Integrity, and AI Guardrails

Use `specs/specs.md`, `docs/Roles_and_Persona/Roles_and_Persona.md`, `docs/Requirements/requirements.md`, and the relevant domain, interface, event, and User Story sections as the authority. Do not infer missing permission or data rules.

## Exact roles and access

Use only these role identifiers:

- `ADMIN` — System Administrator.
- `GYM_ADMIN` — Gym Administrator / Event Organizer.
- `CLIMBER` — registered Climber.
- `VISITOR` — unauthenticated/public user.

All authenticated roles share the documented authentication subsystem and receive access according to their assigned role. A Visitor may use documented public functions such as Climber account creation and Gym Administrator access requests, but cannot use protected account features. Do not let users choose or self-assign privileged roles.

Only an `ADMIN` may approve or reject Gym Administrator access requests. Approval must precede active `GYM_ADMIN` access. A `GYM_ADMIN` may manage only competitions and routes for a gym to which that user is authorized. Enforce authorization at the server/API boundary, not only in interface navigation. Public leaderboard viewing, when enabled, does not grant competition-management permission. A Climber's private scorecard must belong to the logged-in Climber and selected competition.

## Official competition data

- The official route grade is setter-assigned and controlled by authorized users; AI and calculated statistics do not automatically change it.
- Official scoring follows the selected competition scoring format. Do not add, override, or infer scoring rules.
- Official results are persisted authoritative records; failed result saves must not leave partial or duplicate official records.
- Leaderboards and scorecards derive from official saved results, not AI output.
- Keep competition, gym, division, route, registration, and result associations scoped to their documented owners and selected competition.
- If a story or contract does not define the relevant permission, mutation, visibility, or failure behavior, surface the gap and ask rather than inventing it.

## TopSend AI Route Assistant

The Anthropic Claude API is used by TopSend's application-level **AI Route Assistant**. It is separate from GitHub Copilot and other coding agents.

The assistant may provide recommendations and explanations grounded in available official competition information, including documented route statistics, current standings, and the Climber's own results where the relevant story allows it. If the needed data is unavailable, do not fabricate values or present guesses as official facts.

The AI must never:

- Modify official scores or results.
- Modify official rankings or choose competition winners.
- Change official route grades.
- Override official scoring rules or official result data.

Keep AI output out of authoritative write paths. Route AI/service calls through the documented backend boundary. Handle AI service failure only as specified by the relevant story/contracts; do not invent fallback behavior.

## Security and scope

Use the documented JWT and RBAC architecture without replacing it or creating a new authorization scheme. Protect secrets and do not expose sensitive technical details in user-facing errors. Implement only the requested story; preserve iteration limits and do not introduce future-story behavior as a convenience.

Relevant references: `specs/specs.md` §7, §9–§14; `specs/contracts/domain.md`; `specs/contracts/interfaces.md`; `specs/contracts/events.md`; `docs/Requirements/requirements.md`; and the full requested story in `docs/User_Stories/User_Stories.md`.
