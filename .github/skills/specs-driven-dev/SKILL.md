---
name: specs-driven-dev
description: "Use this skill whenever the user is working on specs-driven development (SDD): writing a feature spec, creating requirements, drafting behavioral specifications, defining acceptance criteria, building API or data contracts, writing a design doc, or planning any software feature before coding begins. Also trigger when someone asks what artifacts must exist before coding, how to write machine-readable requirements, how to structure a specs.md, how to define guardrails for AI agents, or when they use terms like 'spec-first', 'SDD', 'spec-driven', 'Given/When/Then', 'EARS notation', 'FR-001', 'NFR table', 'acceptance criteria', 'non-goals', or 'engineering constitution'. Proactively suggest this skill if a user describes a feature they want to build and has not yet produced a spec — jumping straight to code without a spec is the single most common cause of AI-generated code drifting from intent."
---

# Specs-Driven Development (SDD)

**Core principle:** A complete, reviewed, versioned specification must exist before implementation begins. Code is derived from the spec, not written and then documented. In AI-accelerated teams, SDD is the primary mechanism for keeping human intent in control of AI-generated code.

## Quick Reference

| The user wants to… | Do this |
|---|---|
| Know what artifacts go in a spec | Walk the 7 categories below, then scaffold `specs.md` |
| Write a spec for feature X | Run the **Intake Interview** first, then produce the spec |
| Write functional requirements | Use the **FR Template** (Inputs / Preconditions / Behavior / Outputs / Error Cases) |
| Write acceptance criteria | Use **Given/When/Then**, link to FR IDs — see `references/artifact-templates.md` |
| Define NFRs | Fill the **NFR Table** — never prose paragraphs |
| Write AI agent guardrails | See `references/ai-guardrails.md` for the engineering constitution template |
| Build the implementation plan | See **Step 5** below and `references/artifact-templates.md` §8 |
| Check if a spec is coding-ready | Run the **Gate Checklist** at the bottom of this file |
| See full templates and examples | `references/artifact-templates.md` |

---

## Hard Constraints (Non-Negotiable)

> **Constraint 1 — Source control belongs to the human.**
>
> Never run `git` commands of any kind — no `git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`, `git rebase`, `git stash`, `git tag`, or any other git subcommand. Do not stage files, create commits, switch branches, open pull requests, or touch the working tree's git state in any way.
>
> This applies unconditionally: not even to "just stage" a file, not even when asked, not even as a convenience. All source control operations belong to the human.

> **Constraint 2 — Never assume. Always ask.**
>
> When anything in the request, requirements, or spec is ambiguous, incomplete, or could be interpreted more than one way, **stop and ask the human** before proceeding. Ask as many yes/no questions as necessary to fully resolve the ambiguity. Do not infer, guess, or fill in blanks with plausible-sounding defaults.
>
> This rule has no exceptions: not for "small" details, not when the answer seems obvious, not when it would be faster to guess. An assumption baked into a spec is a defect that propagates into every downstream artifact, contract, test, and line of generated code. The cost of one question is always lower than the cost of a wrong spec.
>
> **How to ask:** Prefer yes/no or short-answer questions, one or a small batch at a time, so the human can answer quickly without writing an essay. Example: *"Before I fill in the Error Cases for FR-003: should a request with an expired token return 401 (unauthenticated) or 403 (forbidden)? And should it also emit an audit event, or only log locally?"*

---

## Step 1: The Intake Interview

Never start writing a spec cold. Ask these questions conversationally (not as a form), and use the answers to pre-populate sections. Do not proceed past Question 4 if you don't have answers to 1–4.

1. **What problem does this solve?** (business pain, user goal — not the solution)
2. **Who are the target users?** (role, context, usage frequency)
3. **What does success look like, measurably?** (e.g. "activation rate ≥ 30% in 7 days", "P99 latency ≤ 200 ms" — never just "implement X")
4. **What is explicitly out of scope for this iteration?** (required — AI agents treat everything not listed as fair game)
5. **What systems, APIs, or external services does this touch?**
6. **Are there security, privacy, or regulatory constraints?**
7. **What is the rough shape of the implementation?** (frontend, service + DB, event-driven, etc.)

**These seven questions are the floor, not the ceiling.** As you draft each section of the spec, new ambiguities will surface — in business rules, error cases, NFR thresholds, external contract assumptions, and more. Every time one does, apply Constraint 2: stop and ask the human. Do not draft a placeholder and move on. Do not pick the more conservative interpretation and proceed silently. Ask.

Before proceeding to the Step 2, ask the user if there are any additional requirements he wants to provide before continuing.

---

## Step 2: Scaffold the Spec File

When producing or scaffolding a spec, use this canonical layout. Every section must be present; empty sections must include a `<!-- TODO -->` placeholder so gaps are visible.

```
specs/
├── specs.md                  ← single source of truth; diagrams embedded as Mermaid code blocks in §10
├── implementation-plan.md   ← multi-agent execution plan; dependency graph embedded as Mermaid code block
└── contracts/
    ├── interfaces.md        ← public interfaces: web API contracts + code service/repository interfaces
    ├── events.md            ← event contracts: prose + schema definitions as code blocks
    └── domain.md            ← domain model: entities, aggregates, invariants, event table
```

> **All produced files are markdown.** No standalone `.mmd`, `.yaml`, `.json`, `.proto`, or diagram files. Contract schemas (OpenAPI, event schemas, gRPC) are embedded as fenced code blocks inside their respective `.md` files. Mermaid diagrams are embedded as fenced code blocks inside `specs.md` or `implementation-plan.md` as supplementary visuals — the surrounding text must be complete and readable without them.

### specs.md section order (mandatory)

```markdown
# [Feature Name] Spec
_Version: 1.0 | Owner: @name | Status: Draft | Last Updated: YYYY-MM-DD_

## 1. Problem Statement
## 2. Scope & Non-Goals
## 3. Stakeholders & Decision Log
## 4. User Stories
## 5. Functional Requirements
## 6. Non-Functional Requirements
## 7. Business Rules & Edge Cases
## 8. Acceptance Criteria & Scenario Catalog
## 9. Architecture & Design Decisions
## 10. System Diagrams
## 11. Operational & Failure Behavior
## 12. Governance: Engineering Guardrails Reference
## 13. Security & Compliance
## 14. Review Gates
## 15. Work Breakdown & Traceability Map
```

---

## Step 3: The 7 Artifact Categories

Every spec must address all seven. The behavioral spec (Category 2) is the irreducible core — nothing else substitutes for it. For full templates and examples of each, see **`references/artifact-templates.md`**.

### 1 · Vision & Scope
*(Sections 1–3 of specs.md)*

Captures **why** the change exists and its boundaries in business and user terms, before any design or code.

- **Problem statement** — business problem, target users, desired outcomes, *measurable* success criteria
- **Scope & non-goals** — explicit in/out-of-scope list; non-goals are *mandatory* to prevent scope drift by AI agents
- **Decision log** — owners of product and architecture decisions; key decisions with rationale (a table, not a separate ADR repo per feature)

### 2 · Behavioral Specification *(the core artifact)*
*(Sections 4–7 of specs.md)*

The primary document. AI agents are conditioned on this. Coding cannot start until it is reviewed and accepted.

- **User stories** — in a constrained template (EARS notation preferred for precision; see templates file)
- **Functional requirements** (FR-001, FR-002…) — structured form: `Inputs | Preconditions | Behavior | Outputs | Error Cases | Priority | Linked AC`; "machine-readable" so agents can derive tests and code directly
- **Non-functional requirements** — explicit table with ID, category, requirement, measurement method, threshold, and SLO; **never a prose footnote** — LLMs silently choose defaults that violate SLOs if this is vague
- **Business rules & edge cases** — explicit handling of error conditions, invalid inputs, concurrency, and policy rules; this section is the primary antidote to *plausible-but-wrong* AI-generated flows

### 3 · Interface & Contract Artifacts
*(committed to `specs/contracts/`, versioned alongside specs.md)*

Defines boundaries so humans and AI can generate components independently. All contract files are markdown with schemas embedded as fenced code blocks.

- **Public interfaces** (`specs/contracts/interfaces.md`) — every boundary that external callers or implementing classes must conform to: web API endpoints (REST, gRPC, GraphQL), service interfaces, and repository interfaces. Each is described in prose with its schema or signature embedded as a code block.
- **Domain model & data contracts** (`specs/contracts/domain.md`) — entities, aggregates, invariants, schema evolution rules; event schemas embedded as code blocks
- **External integration contracts** (a section within `specs/contracts/interfaces.md`) — assumed rate limits, error semantics, retry and fallback behavior for every third-party dependency, in prose and table form

### 4 · Acceptance & Test Specification
*(Section 8 of specs.md)*

Written before code. Feeds directly into test generation and agent evaluation prompts.

- **Acceptance criteria** — atomic, observable; Given/When/Then form; linked to FR IDs; tagged with priority (P0/P1/P2)
- **Scenario catalog** — table of positive, negative, and edge-case scenarios; source for manual scripts, CI tests, and AI evaluation prompts
- **Contract test outlines** — for APIs: what provider/consumer contracts must hold at boundaries; property/invariant intents for property-based tests

> In AI-accelerated teams, this section is explicitly labeled the **evaluation spec** because it drives both CI tests and automated evaluation of generated code.

### 5 · Architecture & Design Artifacts
*(Sections 9–11 of specs.md)*

Derived from and traceable to the spec. Deliberately lightweight — not big-design-up-front. All diagrams are embedded Mermaid code blocks inside `specs.md §10`; they are supplementary to the text in §9 and §11, which must be complete and readable without them.

- **System & component diagrams** — written first as text descriptions (actors, boundaries, data flows, trust boundaries); Mermaid C4 diagrams embedded below each description as a visual aid
- **Design decisions & patterns** — key patterns (outbox, saga, CQRS, circuit breaker) with rationale tied to NFRs; a subsection in the spec, not a separate ADR file per feature
- **Operational & failure behavior** — timeouts, partial outages, degraded modes, observability requirements (metrics, logs, traces) in prose and table form; written before implementation so SRE constraints are built in from day one

### 6 · Governance & Guardrail Artifacts *(AI-era)*
*(Sections 12–14 of specs.md + shared `engineering-guardrails.md`)*

New in 2025–2026. Keeps AI agents within defined constraints during code generation. See **`references/ai-guardrails.md`** for templates.

- **Engineering guardrails / "constitution"** — shared document of coding standards, security constraints, dependency policies, architectural rules; every feature spec references it
- **Risk & compliance notes** — threat model summary, data classification, regulatory constraints (PII), required approvals; short checklist in spec unless risk is high
- **Review gates** — checklist of what must be true before coding, before merge, and before release; used by bots/agents to block or annotate PRs that violate the spec

### 7 · Planning & Execution Artifacts
*(Section 15 of specs.md for traceability; `specs/implementation-plan.md` for the full execution plan)*

Connect the spec to work tracking. Created after the spec is accepted, before any agent touches code.

- **Traceability map** — table in specs.md mapping requirements → design elements → tasks → tests; the audit trail proving implementation matches spec
- **Implementation plan** — a *separate file* (`specs/implementation-plan.md`) containing the full atomic task registry, dependency graph, wave schedule, and per-task agent briefs; see **Step 5** for how to produce it

---

## Step 4: Machine-Readable Requirement Format

Use this FR template for every functional requirement. The structured schema lets agents derive tests and implementation directly.

> **Before filling any FR field:** if the answer is not explicitly known from the intake interview or prior conversation, ask the human. Do not infer Inputs from the feature name, do not guess Error Cases from common patterns, do not assume an NFR threshold from industry defaults. Each unknown field is a question to ask, not a blank to fill creatively.

```markdown
**FR-NNN: [Short title]**
- **Inputs:** [data, signals, or events that trigger this behavior]
- **Preconditions:** [system state that must be true for this behavior to apply]
- **Behavior:** [what the system must do, in unambiguous imperative terms]
- **Outputs / side effects:** [observable outcomes, state mutations, events emitted]
- **Error cases:** [what happens when preconditions fail or inputs are invalid]
- **Priority:** Must / Should / Could (MoSCoW)
- **Linked AC:** AC-NNN
```

NFR table (mandatory, never prose):

| ID | Category | Requirement | Measurement | Threshold | SLO |
|----|----------|-------------|-------------|-----------|-----|
| NFR-001 | Latency | API P99 response time | Prometheus histogram | ≤ 200 ms | 99.9% |
| NFR-002 | Availability | Service uptime | Uptime monitor | ≥ 99.95% | Monthly |

---

## Step 5: The Implementation Plan

The implementation plan is produced **after the spec is accepted** and **before any agent writes a line of code**. It lives in `specs/implementation-plan.md` — a separate file from the spec so it can be updated as tasks complete without touching the reviewed spec.

Every implementation plan must satisfy three properties:

1. **Atomic tasks** — each task has a single, completable concern. One task, one module, one endpoint, one migration, one adapter. If removing one responsibility from a task would leave it still meaningful, it should be two tasks.
2. **Explicit dependency graph** — every task declares exactly what it depends on. Nothing relies on implied ordering. The dependency declarations form a Directed Acyclic Graph (DAG) that makes the critical path visible.
3. **Wave-based parallel execution** — tasks with no mutual dependencies belong to the same wave and are dispatched to separate agents concurrently. Waves are hard synchronization points: no task in Wave N+1 starts until every task in Wave N is verified complete.

### The canonical wave structure (zero to production)

| Wave | Name | What runs in parallel | Gate before next wave |
|------|------|-----------------------|----------------------|
| **0** | Foundations | Project scaffolding · DB schema · shared types/interfaces · config & env | All contracts locked and reviewed; zero implementation code yet |
| **1** | Domain layer | Domain models · aggregates · value objects · domain event definitions | Domain invariants reviewed; unit tests for domain logic pass |
| **2** | Application layer | Use cases / service layer · repository implementations · application events | Business logic unit test suite green |
| **3** | API layer | HTTP endpoints · request/response DTOs · auth middleware · error mapping | API contract tests pass; endpoints return correct shapes |
| **4** | Integration layer | One task per external service adapter · event producers · event consumers | Integration tests against stubs pass |
| **5** | Cross-cutting | Observability (metrics, logs, traces) · feature flags · caching · rate limiting | NFR observability requirements verified in staging |
| **6** | Test completion | E2E tests · contract tests · load tests · full scenario catalog verification | Every AC in the scenario catalog passes |
| **7** | Production readiness | CI/CD pipeline · infrastructure-as-code · runbooks · alert rules · deployment config | Pre-release gate checklist passes |

### Rules for safe concurrent execution

These rules prevent merge conflicts and dependency violations when multiple agents work simultaneously:

- **No overlapping file scopes within a wave.** No two tasks in the same wave may list the same file in their authorized file set. If they must, split the shared file into Wave 0 as a contract artifact.
- **All shared interfaces are Wave 0.** Any type, interface, schema, or constant consumed by more than one task must be defined and committed in Wave 0 — never added later mid-execution.
- **Inputs are exact paths, not vague references.** A task's "Inputs from prior waves" must list exact file paths or exported symbols, not "the service layer" or "what T-003 produced."
- **Outputs are contracts.** Anything a task lists as an Output is frozen when that task completes. Later-wave tasks that consume it must not redefine it.
- **Wave gate = human review + tests green.** Do not advance to the next wave on task completion alone. A human must confirm the gate checklist for that wave passes before dispatching the next wave.

### Per-task brief

Every task is a self-contained brief that an agent can execute knowing only its own brief plus the referenced spec sections. Required fields: Task ID, Wave, Objective, Implements (FR/AC IDs), Authorized files (exact list), Inputs from prior waves, Outputs/contracts, Definition of done, Tests required.

See **`references/artifact-templates.md` §8** for the full per-task brief template, a Mermaid dependency graph template, and a complete worked example (refund service, Waves 0–7).

---

## Gate Checklist (Pre-Coding)

Before handing a spec to an agent or beginning implementation, every box must be checked. If any are unchecked, flag the gap and complete it before proceeding.

**Vision & Scope**
- [ ] Problem statement written; success criteria are measurable (not "implement X")
- [ ] Non-goals explicitly listed

**Behavioral Spec**
- [ ] Every FR has Inputs, Preconditions, Behavior, Outputs, and Error Cases
- [ ] NFR table complete with thresholds and SLOs, not just categories
- [ ] Business rules and all known edge cases documented in dedicated section

**Contracts**
- [ ] Public interfaces committed to `specs/contracts/interfaces.md` and versioned with the spec (web API endpoints, service interfaces, repository interfaces)
- [ ] External integration contracts documented (rate limits, error semantics, retries)

**Acceptance**
- [ ] All acceptance criteria in Given/When/Then form, linked to FR IDs
- [ ] Scenario catalog covers positive, negative, and key edge cases

**Design**
- [ ] Architecture decisions recorded with rationale tied to NFRs
- [ ] Operational/failure behavior section complete

**Governance**
- [ ] Engineering guardrails document referenced
- [ ] Security & compliance checklist complete

**Planning**
- [ ] Work breakdown derived from spec sections; every task links to at least one FR or AC
- [ ] Traceability map (requirements → tasks → tests) exists

**Implementation Plan**
- [ ] `specs/implementation-plan.md` exists and is human-reviewed
- [ ] Every task is atomic (single concern; no task does two separable things)
- [ ] Every task declares its Authorized files (exact paths, no wildcards)
- [ ] No two tasks in the same wave have overlapping Authorized file sets
- [ ] All shared interfaces, types, and schemas are defined in Wave 0 tasks
- [ ] Every task's Inputs from prior waves references exact file paths or exported symbols
- [ ] Dependency graph is acyclic (no circular dependencies between tasks)
- [ ] Every FR and AC is covered by at least one task
- [ ] Wave 7 (production readiness) tasks exist: CI/CD, infra, runbooks, alerts

---

## Common Mistakes to Flag and Fix

| Mistake | Correct approach |
|---|---|
| "Implement feature X" as success criterion | Replace with measurable outcome: "Activation rate ≥ 30% within 7 days of onboarding" |
| NFRs as prose footnotes | Convert to NFR table with ID, threshold, and SLO |
| No non-goals section | Add explicit non-goals; anything not listed is treated as in-scope by AI agents |
| Edge cases described only in prose | Move to FR "Error Cases" field; add rows to the scenario catalog |
| Acceptance criteria as plain bullets | Rewrite as Given/When/Then, each linked to an FR ID |
| Design decisions scattered in comments or tickets | Consolidate into Section 9 with rationale tied to NFRs |
| No traceability map | Add requirements → tasks table; without it, the spec won't drive execution |
| Single PR covering spec + implementation | Spec review is a separate gate; merge spec first, then open implementation PRs |
| Filling an unknown FR field with a "reasonable default" | That is an assumption. Stop. Ask the human. |
| Writing an NFR threshold not given by the human | That is an assumption. Stop. Ask the human what the actual SLO target is. |
| Choosing an error code, status, or response shape not specified in the request | That is an assumption. Stop. Ask the human. |
| Inferring a non-goal is "obviously" out of scope without asking | That is an assumption. Stop. Ask the human to confirm it belongs in the non-goals list. |
| Proceeding when the scope of a FR could be interpreted two ways | That is an ambiguity. Stop. Ask a yes/no question to resolve it before drafting. |
| Tasks that each do "the backend work" or "the API layer" | Split into atomic tasks: one endpoint per task, one adapter per task, one migration per task |
| Two tasks in the same wave modifying the same file | Resolve the conflict: move the shared file to Wave 0 as a contract, or collapse the tasks into one |
| Shared types/interfaces first appearing in Wave 1 or later | All shared contracts must be Wave 0; later waves only consume, never define, shared interfaces |
| A task's inputs described as "whatever T-003 produces" | Inputs must be exact file paths or exported symbol names — vague references break agent isolation |
| Wave advancement based on task completion alone | Waves advance only after a human reviews the gate checklist and confirms tests are green |
| Implementation plan skips Wave 7 | Production readiness (CI/CD, infra, runbooks, alerts) is not optional; include it explicitly |
| Creating a standalone diagram file (.mmd, .png, .svg, etc.) | All files are markdown; embed the Mermaid diagram as a fenced code block inside specs.md §10, below a text description that stands on its own |
| Writing a diagram without a text description | Mermaid blocks are supplementary; write a prose description of actors, boundaries, and flows first; the text must be complete without the diagram |
| Saving public interface contracts as api.yaml, interfaces.yaml, or other non-markdown files | Embed the schema as a fenced code block inside `specs/contracts/interfaces.md`; the file itself must be markdown |
| Producing any file that is not a .md file | Stop. Convert it: schemas go into code blocks, diagrams go into Mermaid blocks, all inside markdown files |

---

## Reference Files

Load these when you need more detail:

- **`references/artifact-templates.md`** — full templates with examples for all 7 artifact categories, EARS notation guide, domain model skeleton, event contract template, Mermaid diagram starters; **§8 covers the implementation plan**: task registry, dependency graph, per-task brief template, and a complete worked example (refund service, Waves 0–7)
- **`references/ai-guardrails.md`** — engineering constitution template, guardrail patterns for AI agents, risk/compliance checklist, review gate templates for CI/CD bots
