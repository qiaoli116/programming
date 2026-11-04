# job-board: [Feature or decision name]

<!--
==============================================================================
DEVLOG PROCESS  (see README.md)
==============================================================================

A devlog holds the DETAILS of one feature, design or decision. The iteration
(docs/process.html) holds the milestone at a high level and links to its
devlogs; do not copy details back into the iteration.

STAGE 1 -- DESIGN  (Status: Draft -> Design)
  Goal: agree on WHAT is being built and WHY, from the user's side
  (job seeker, employer). No technology choices.
  Sections: Context, Initial design, Use cases / user stories, Open questions.
  Done when: scope and key decisions are agreed.

STAGE 2 -- SPEC  (Status: Design -> Spec)
  Goal: someone can build from this doc alone, without asking questions.
  Sections: Design summary, §1-§n, Phase blocks, Implementation order.
  Open questions left are not blocking.

STATUS: Draft -> Design -> Spec -> In Progress -> Done (date) | Superseded (link)

AGREED vs PROPOSED: until review, mark each decision **Agreed** (with a link to
where it was decided) or **Proposed** (this devlog's suggestion).

TICKETS: bugs and small tasks that need no design are tickets
(docs/iteration-N/tickets), not devlogs. A devlog may link the tickets that
came out of building it.

DECISION RECORDS (a technology or architecture choice) carry
"**Type:** Decision record", no stories or spec, and go Draft -> Accepted.

Keep it generic: no real people, companies, secrets or links.

LOCATION: copy this template into devlog/iteration-N/ (links below assume
that depth). Images, diagrams and other files go in devlog/iteration-N/assets/.

FILENAME: yyyymmdd-nn-short-kebab-name.md (nn from 01; name under 30 chars)
==============================================================================
-->

**Date:** YYYY-MM-DD

**Status:** Draft

**Iteration:** Iteration N, Stage X (link to the section in [process.html](../../docs/process.html))

**Scope:** One sentence: what this devlog covers, and what it explicitly does not.

**Depends on:** Links to devlogs or iteration use cases (UC-n) that must come first.

**Supersedes:** _(delete if not applicable)_ [previous.md](previous.md): reason.

---

<!-- ========================= STAGE 1 -- DESIGN ========================= -->

## Context

<!-- 2-4 sentences: what exists, what is missing, why now. -->

---

## Initial design

<!-- The key decisions that shape scope and behavior. Bullets, not a full table.
     Mark each one Agreed (with a link) or Proposed. -->

- **Agreed** ([source](../../docs/process.html)): _…_
- **Proposed:** _…_ (→ Q1)

---

## Use cases

### Map

<!-- Every use case or story once, with its metadata. -->

| Id | Actor | Goal | Priority (MoSCoW) |
|---|---|---|---|
| UC1 | _…_ | _…_ | _…_ |

### UC1: [Action]

> As a [actor], I want [goal], so that [benefit].

| # | User does | Sees |
|---|-----------|------|
| 1 | _…_ | _…_ |

**Note:** [what this guarantees, or which failure it avoids]

### Coverage and gaps

<!-- What the use cases exercise; what is deliberately left out and why. -->

---

<!-- ========================= STAGE 2 -- SPEC ========================= -->

## Design summary

| Concern | Decision |
|---------|----------|
| _…_ | _… (→ §1)_ |

---

## §1 [Design question]

<!-- The decision, why, and the concrete artifact (data shape, screen, API). -->

---

## Phase A: [Name]

### What to implement

- _module / file_: what it holds (→ §1)

### Test plan

<!-- Logic tests first, then live checks. Name each test as a sentence.
     Trace each live check back to a use case. -->

**Automated tests**
- `test_foo_happy_path`: _…_

**Live check**
- [ ] _… (UC1)_

### Verify

```
<command that runs the tests>
```

---

## Open questions / future extensions

### Q1: [Topic]

_(The options, why it is open, what would settle it, and a recommendation if any.)_

---

## Implementation order

<!-- Flat numbered list across all phases; each step one reviewable unit.
     Tick off as done. -->

1. [ ] _…_

---

## Outcome

<!-- Fill in when Done: what was built, deviations from the design, tickets
     raised, follow-ups. -->
