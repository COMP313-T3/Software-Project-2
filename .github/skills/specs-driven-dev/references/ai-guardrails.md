# AI Guardrails & Engineering Constitution Templates

Templates for the governance layer introduced in 2025–2026 to keep AI agents within constraints during code generation. Load this file when the user needs to write an engineering constitution, define per-feature guardrails, or configure review gates.

---

## Table of Contents

1. [Engineering Constitution (Shared)](#1-engineering-constitution-shared)
2. [Per-Feature Guardrail Reference (in specs.md)](#2-per-feature-guardrail-reference-in-specmd)
3. [Review Gate Templates](#3-review-gate-templates)
4. [Risk & Compliance Checklist Patterns](#4-risk--compliance-checklist-patterns)
5. [Guardrail Enforcement Patterns](#5-guardrail-enforcement-patterns)

---

## 1. Engineering Constitution (Shared)

The engineering constitution is a **single, repository-level document** that every feature spec references by name. AI agents are conditioned on it alongside the feature spec. Keep it in the repo root or `docs/` at a stable path (e.g. `docs/engineering-guardrails.md`).

Every rule must be:
- **Unambiguous** — agents must not need to infer intent
- **Testable** — there must be a way to verify compliance (lint rule, CI check, code review checklist item)
- **Actionable** — describes what to do, not just what not to do

```markdown
# Engineering Guardrails (Constitution)

_Version: [date] | Owner: @platform-team | Applies to: all services in this repo_

## 1. Secrets & Credentials
- Never commit secrets, tokens, API keys, or credentials to source control
- All secrets must be injected at runtime via Vault at path `secret/<service-name>/*`
- Never hardcode secrets in config files, environment defaults, or test fixtures
- **Compliant:** `os.getenv("STRIPE_API_KEY")` with Vault injection in deploy config
- **Non-compliant:** `STRIPE_KEY = "sk_live_abc123"` anywhere in source

## 2. Data Access Patterns
- UI / frontend layers must never make direct database calls; use service APIs only
- Direct cross-service DB queries are prohibited; use the owning service's API
- Read replicas are permitted for reporting queries only; never for write-path reads
- All DB access from a service must go through the service's own repository layer

## 3. Authentication & Authorization
- All HTTP endpoints that mutate state must require authentication (JWT, session, or service-to-service mTLS)
- RBAC roles required by each endpoint must be documented in the FR for that endpoint
- Never implement custom auth logic; use the shared `auth-middleware` library
- Authorization failures must return 401 (unauthenticated) or 403 (unauthorized) — never 404 to obscure resource existence to external callers; 404 is acceptable for internal APIs where resource existence is not sensitive

## 4. Error Handling
- Never swallow exceptions silently; all caught exceptions must be logged with structured context
- Never return raw stack traces or internal error messages to external callers
- External API errors must be mapped to a standard error response schema: `{error_code, message, request_id}`
- Retry logic must use exponential backoff with jitter; never fixed-interval polling

## 5. Observability
- Every new service or significant feature must add: at least one counter metric, at least one latency histogram, and structured logging on all state transitions
- Use OpenTelemetry for distributed tracing; do not use any competing tracing library
- Log format: JSON to stdout; never write to files in the container
- All metrics must include a `service` label and a `env` label

## 6. Dependencies
- No new runtime dependencies may be added without a dependency review comment in the PR
- Prefer libraries already in use in this repo over introducing new ones for the same purpose
- Pin all dependency versions; no floating (`^`, `~`, `*`) version specifiers in production dependencies
- Never include test-only libraries in the production dependency list

## 7. Concurrency & Idempotency
- All event consumers must be idempotent; implement using the event's natural idempotency key
- All external API calls that can result in side effects (payments, emails, mutations) must supply an idempotency key
- Database transactions must be kept short; never hold a transaction open across a network call

## 8. Data Residency & Privacy
- PII (names, emails, addresses, financial data) must be stored only in the `eu-west-1` region
- PII must not appear in log output, metric labels, or trace attributes
- Data deletion requests must propagate within 30 days (see GDPR runbook)

## 9. Testing
- All new endpoints and business logic paths must have at least one unit test and one integration test before merge
- Test coverage threshold: ≥ 80% line coverage for new code added in a PR
- Tests must not depend on shared mutable state; use isolated fixtures per test
- No production database connections in unit tests; use mocks or in-memory DB

## 10. Code Generation Constraints (AI-specific)
- Generated code must be reviewed against every section of this constitution before merge
- Generated code must not introduce new dependencies without explicit human approval
- AI agents must not modify files outside the scope defined in the feature spec's work breakdown
- Generated tests must use real assertions, not stub pass-throughs (`assert True`, `expect(true)`)
- If generated code requires a non-goals behavior from the spec to work, halt and flag to the human
- **Source control is the human's exclusive responsibility.** AI agents must never run any `git` command — no `git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`, `git rebase`, `git stash`, `git tag`, or any other git subcommand. Do not stage, commit, or otherwise modify the repository's git state under any circumstances.
- **Never assume. Always ask.** When any detail required to implement a spec section is missing, ambiguous, or interpretable in more than one way, the agent must stop and ask the human a yes/no or short-answer question before proceeding. This includes: missing error codes, unspecified thresholds, ambiguous scope boundaries, unstated retry policies, unclear authorization rules, and any field in an FR template not explicitly covered by the spec. An assumption baked into generated code is a defect; a question costs seconds.
```

---

## 2. Per-Feature Guardrail Reference (in specs.md)

Section 12 of every `specs.md` must reference the shared constitution and list any **feature-specific additions or overrides**.

```markdown
## 12. Governance: Engineering Guardrails Reference

This feature is governed by the shared [Engineering Guardrails](docs/engineering-guardrails.md).

### Feature-specific additions

| Rule | Applies to | Reason |
|------|------------|--------|
| All refund mutations must emit to the audit event stream before returning a response | FR-007, TASK-005 | Regulatory: all financial mutations must be auditable |
| The `amount` field must never be taken from user input; always compute from the order record | FR-007 | Prevent amount manipulation |
| Manager routing must use `users.manager_id`; never infer from email domain or other heuristics | BR-002 | Avoid incorrect escalation paths |

### Scope boundary for AI agents

> AI agents working on this feature are authorized to modify files in:
> - `src/refund/` (service code)
> - `specs/contracts/` (contract files)
> - `tests/refund/` (tests)
>
> AI agents must NOT modify without explicit human approval:
> - `src/auth/` (authentication layer)
> - `src/payments/` (payment provider integration — handled in TASK-006 only)
> - `db/migrations/` (human reviews all schema changes)
> - Any file not listed in the work breakdown (Section 15)
```

---

## 3. Review Gate Templates

Review gates are checklists that must pass before a defined workflow event (coding starts, PR merges, feature releases). They can be enforced manually (PR description) or automatically (CI bots, GitHub Actions, PR labeling rules).

### Gate 1: Pre-Coding (Spec Review)

The spec must be merged as a standalone PR before any implementation PR is opened.

```markdown
## Spec Review Gate Checklist

**Reviewer:** @tech-lead, @product-owner
**Required before:** any implementation PR is opened

### Vision & Scope
- [ ] Problem statement uses measurable success criteria (not "implement X")
- [ ] Non-goals section is present and non-empty
- [ ] Decision log has at least one entry (scope or architecture)

### Behavioral Spec
- [ ] All FRs follow the Inputs / Preconditions / Behavior / Outputs / Error Cases schema
- [ ] NFR table has IDs, thresholds, and measurement methods (not just categories)
- [ ] Business rules section explicitly handles all edge cases raised in review

### Contracts
- [ ] API contract file committed to `specs/contracts/` and syntactically valid
- [ ] External integration contracts documented (rate limits, retry behavior, fallbacks)

### Acceptance
- [ ] All ACs in Given/When/Then form linked to FR IDs
- [ ] Scenario catalog includes at least one negative and one edge-case scenario per FR

### Design
- [ ] Architecture decisions tied to NFRs (not just "we chose X")
- [ ] Failure modes table complete

### Governance
- [ ] Engineering guardrails document referenced in Section 12
- [ ] AI agent scope boundary defined (what files agents may and may not touch)
- [ ] Security & compliance checklist complete

### Planning
- [ ] Work breakdown covers all spec sections; every task links to at least one FR or AC
- [ ] Traceability map exists

**Outcome:** Spec approved → merge spec PR → open implementation PRs
```

### Gate 2: Pre-Merge (PR Review)

Enforced on every implementation PR. Can be partially automated (CI checks) with remainder as human checklist.

```markdown
## PR Review Gate Checklist

**Automated CI checks (must be green):**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Line coverage ≥ 80% for new code (enforced by coverage tool)
- [ ] No new lint violations
- [ ] No secrets detected (secret scanner)
- [ ] Dependency lock file updated and reviewed

**Human checklist:**
- [ ] Code implements FRs as written — no silent expansion of scope
- [ ] Every scenario in the scenario catalog has a corresponding test
- [ ] All error cases from FR templates are handled and tested
- [ ] NFR thresholds are observable (metrics/logs added per observability requirements)
- [ ] Generated code reviewed against engineering guardrails constitution
- [ ] AI agent did not run any git commands; all source control operations were performed by the human
- [ ] AI agent did not modify files outside the authorized scope boundary
- [ ] No new runtime dependencies added without dependency review comment
```

### Gate 3: Pre-Release

```markdown
## Pre-Release Gate Checklist

- [ ] All PR review gates passed for every implementation PR in this feature
- [ ] Acceptance criteria AC-NNN through AC-NNN manually verified in staging
- [ ] NFR thresholds validated: run load test; attach results to release ticket
- [ ] Security review sign-off (for features touching PII or payment data)
- [ ] Runbook updated (failure modes, alert playbooks)
- [ ] Feature flag configured (if applicable); rollout plan documented
- [ ] Rollback plan documented and tested (can we disable the feature without downtime?)
- [ ] On-call briefed on new alerts added in this feature
```

---

## 4. Risk & Compliance Checklist Patterns

Embed one of these patterns in Section 13 of specs.md, selecting the appropriate tier.

### Tier 1: Standard feature (low risk)

```markdown
## 13. Security & Compliance

**Risk tier:** Low — no new attack surface, no PII, no payment data

- [ ] All new endpoints authenticated per engineering guardrails §3
- [ ] Input validation: all user-supplied strings length-bounded and sanitized
- [ ] No new secrets; existing Vault paths are sufficient
- [ ] No new runtime dependencies requiring security review
- [ ] Formal threat model review: **not required**
```

### Tier 2: Feature handling PII or financial data (medium risk)

```markdown
## 13. Security & Compliance

**Risk tier:** Medium — handles PII and/or financial data

- [ ] Data classification documented: [list PII/financial fields in scope]
- [ ] Data residency: all PII stored in `eu-west-1`; verified in domain model
- [ ] PII must not appear in logs, metrics, or trace attributes
- [ ] Payment data (card numbers, CVVs) never stored locally; remains with Stripe
- [ ] RBAC roles required per endpoint documented in each FR
- [ ] Audit trail: all financial mutations emit to immutable audit stream (FR-NNN)
- [ ] GDPR: deletion propagation path documented
- [ ] PCI-DSS scope: [in scope / out of scope — and why]
- [ ] Formal threat model review: required → @security-team sign-off before release
```

### Tier 3: New authentication mechanism or public API (high risk)

```markdown
## 13. Security & Compliance

**Risk tier:** High — new auth mechanism or new public attack surface

- [ ] All items from Tier 2 checklist
- [ ] Formal threat model: required (use STRIDE methodology)
- [ ] Penetration test: required before GA launch
- [ ] Rate limiting: documented and tested
- [ ] Input fuzzing: required for all public endpoints
- [ ] Security review required: @security-team formal approval before any deployment
```

---

## 5. Guardrail Enforcement Patterns

### GitHub Actions: Spec gate enforcement

```yaml
# .github/workflows/spec-gate.yml
name: Spec gate
on:
  pull_request:
    paths:
      - 'src/**'
      - 'tests/**'

jobs:
  check-spec-exists:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check that spec is merged before implementation
        run: |
          # Fail if specs/specs.md doesn't exist or is still in Draft status
          if [ ! -f specs/specs.md ]; then
            echo "❌ specs/specs.md not found. Merge the spec PR before opening implementation PRs."
            exit 1
          fi
          if grep -q "Status: Draft" specs/specs.md; then
            echo "❌ specs/specs.md is still in Draft status. Get spec reviewed and accepted first."
            exit 1
          fi
          echo "✅ Spec exists and is accepted."
```

### PR Description Template for Agent-Generated Code

Add this to `.github/pull_request_template.md` to force human review of AI output:

```markdown
## AI-generated code checklist

If this PR contains AI-generated code, complete this checklist before requesting review:

- [ ] I have read the feature spec (specs/specs.md) and confirmed the generated code matches the FRs
- [ ] Generated code does not implement any behavior listed in the spec's non-goals
- [ ] Generated code only modifies files within the authorized scope boundary (spec §12)
- [ ] No new dependencies were added without a dependency review comment below
- [ ] Generated tests use real assertions (not pass-throughs)
- [ ] I ran the scenario catalog manually or via automated tests; all scenarios pass
```
