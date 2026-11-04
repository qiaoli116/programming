# Devlog

Design records for job-board: what we build, why, and how. One file per feature, design or decision.

## Where things live

| Level | Lives in | Holds |
|---|---|---|
| Milestone (high level) | [docs/process.html](../docs/process.html) | Each iteration: stages, scope, status, links |
| Details | `devlog/` (this folder) | Design and implementation of one feature or decision |
| Work items | `docs/iteration-N/tickets` | Bugs and small tasks that need no design |

The iteration links to its devlogs; devlogs link back to the iteration stage they belong to. Details are never copied into the iteration.

## Layout

```
devlog/
  README.md          this file, with the index of all devlogs
  _TEMPLATE.md       copy into an iteration folder
  iteration-1/
    yyyymmdd-nn-name.md
    assets/          images and files used by this iteration's devlogs
  iteration-2/
    ...
```

Each iteration has one subfolder, named like the docs folder (`iteration-N`). A devlog lives in the folder of the iteration that **starts** it. If a later iteration extends or replaces it, the new devlog goes in the later folder and links back (Depends on / Supersedes). A decision record that applies to several iterations stays in the iteration where it was made.

Keep devlogs generic: no real people, companies, secrets or links. Sample data is fictional.

## Process

A feature devlog is written in two stages, using [_TEMPLATE.md](_TEMPLATE.md):

1. **Stage 1, Design** (`Draft` → `Design`): context, initial design, use cases, open questions. Agree on *what* and *why* from the user's side. No technology choices yet.
2. **Stage 2, Spec** (`Design` → `Spec`): design sections, phases with deliverables and tests, implementation order. Someone can build from the doc alone.

Then `In Progress` → `Done` (with date, and fill in **Outcome**), or `Superseded` (with a link).

A devlog moves to the next status only when agreed in review. Until then, every bullet is **Agreed** (decided in discussion, with a link) or **Proposed** (this devlog's suggestion). A devlog does not authorize building by itself; `In Progress` does.

**Building:** work through the implementation order, ticking off steps in the devlog as they are done. Stop only when a decision is needed: something the devlog doesn't settle, a change to its design, a live check only a person can do, or an outward action (push, deploy) nobody has asked for.

A **decision record** (a technology or architecture choice, not a feature) has `**Type:** Decision record`, no use cases or spec, and goes `Draft` → `Accepted` or `Superseded`. Feature devlogs link to it rather than re-arguing it.

## Naming

`yyyymmdd-nn-short-kebab-name.md`: the date, a 2-digit sequence within the day starting at `01`, and a name under 30 characters.

A devlog that is part of a larger one takes the parent's name plus `-b<N>-<short-name>`: `yyyymmdd-nn-<parent-name>-bN-<name>.md`. It keeps the parent's date and number so the family sorts together. The parent lists its children in a Builds table.

## Index

Grouped by iteration, newest iteration last. Paths are relative to this folder.

### Iteration 1

| Devlog | Status | About |
|---|---|---|
| _none yet_ | | |

### Iteration 2

| Devlog | Status | About |
|---|---|---|
| [iteration-2/20261104-01-ai-match-scoring.md](iteration-2/20261104-01-ai-match-scoring.md) | Draft | After the keyword search returns its list, an AI reads each job's criteria, matches them one by one against the seeker's profile and scores each criterion, with an overall match the list can be sorted by. Advisory only; needs a seeker profile |
| [iteration-2/20261104-02-ai-provider.md](iteration-2/20261104-02-ai-provider.md) | Draft | Decision record: Claude Haiku 5.5 for match scoring, called from the server with structured output (up to five criteria, each with a level and a reason). Key from an environment variable; tests use a fake provider, plus a manual live check with the sample profile |
