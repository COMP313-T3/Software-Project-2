# specs-driven-dev

A Claude skill that guides you through **specs-driven development (SDD)**: producing a complete, reviewed specification and implementation plan before any code is written.

## What it does

When active, the skill walks you through producing a full specification package for any software feature — from problem statement through to a wave-based multi-agent implementation plan. It asks clarifying questions at every step and never makes assumptions.

### Artifacts produced

All output files are markdown, written into a `specs/` directory:

```
specs/
├── specs.md                  # main spec: problem statement, requirements, acceptance criteria, design
├── implementation-plan.md    # atomic task registry with wave-based parallel execution schedule
└── contracts/
    ├── interfaces.md         # public interfaces: web APIs, service/repository interfaces, external integrations
    ├── events.md             # event contracts with embedded schemas
    └── domain.md             # domain model, aggregates, invariants
```

### Key behaviours

- **Always asks before proceeding.** Any ambiguity in requirements, scope, or design triggers a yes/no question to you. The agent never infers, assumes, or fills in blanks.
- **Never runs git.** All source control operations are left entirely to you.
- **Gate-based workflow.** The spec must be reviewed and accepted before the implementation plan is produced. The implementation plan must be reviewed before any coding begins.
- **Multi-agent ready.** The implementation plan breaks work into atomic tasks grouped into concurrent execution waves, with explicit file-scope boundaries so multiple agents can work in parallel without conflicts.

## How to use it

1. Install `specs-driven-dev.skill` via the Skills section in Claude settings.
2. Start a new conversation and describe the feature you want to build.
3. The skill activates automatically and begins the intake interview.
4. Answer the questions — the skill produces each artifact in order, pausing for your review at each gate.

## Constraints

- Requires human review at each wave gate before the next wave of implementation tasks is dispatched.
- Does not generate code. It produces the specification and plan that agents (or humans) use to generate code.
