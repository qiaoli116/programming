# Devlog

Design records for cake-shop (the Cake Order Desk): what we build, why, and how. One file per feature, design or decision.

## Where things live

| Level | Lives in | Holds |
|---|---|---|
| Milestone (high level) | [docs/process.html](../docs/process.html) | Each iteration: stages, scope, status, links |
| Details | `devlog/` (this folder) | Design and implementation of one feature or decision |
| Work items | `docs/iteration-N/tickets` | Bugs and small tasks that need no design |

The iteration links to its devlogs, and each devlog links back to the iteration stage it belongs to. Details are never copied into the iteration.

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
| [iteration-1/20261113-01-business-lifecycle.md](iteration-1/20261113-01-business-lifecycle.md) | Draft | The bakery's order life cycle as four sequential stages (Ordering → Production → Fulfillment → Done), each with one input and one output contract. No loop-backs. Iteration 1 builds only Stage 1 Ordering. Data model: one `orders` table, one row per order, `status` as each agent's inbox, one JSON column per agent. Visuals: [business-lifecycle.html](iteration-1/assets/business-lifecycle.html), [data-model.html](iteration-1/assets/data-model.html) |
| [iteration-1/20261113-02-ordering-design-chat.md](iteration-1/20261113-02-ordering-design-chat.md) | Design | Stage 1 Ordering redesigned as a back-and-forth chat. An AI assistant proposes designs from a fixed catalog of templates and options. When the wish is vague, it offers 2–4 options, each with a picture, a price and designer's notes. Rule agents check, price and draw each design on every turn. The customer confirms with a button, then the baker approves or declines. Replaces the Stage 1 chain in 01. Visuals: [ordering-design.html](iteration-1/assets/ordering-design.html) (playable demo), [app-design.html](iteration-1/assets/app-design.html) (final app design) |
| [iteration-1/20261113-03-product-catalog.md](iteration-1/20261113-03-product-catalog.md) | Design | The business: what the bakery sells. Four layers (product line, template, option library, design) plus an occasion tag. Six product lines from cupcakes to tiered cakes, eight occasions, about 20 templates, one shared option library with prices, and rules at four levels. This is the catalog the Design assistant reads and the rule agents enforce. Visual: [product-catalog.html](iteration-1/assets/product-catalog.html) |
| [iteration-1/20261113-04-ordering-app-build.md](iteration-1/20261113-04-ordering-app-build.md) | Done | The build plan for Stage 1 Ordering as a desktop web app. Settles every open question from 02 and 03 and the app design's proposals. TypeScript workspaces (shared rule agents, Express + SQLite server, React web, playwright), one orders table, one `applyChange` function for the live loop, the Design assistant behind a provider seam with a fake for tests, the API, the screens, and five phases with tests. Visual: [app-design.html](iteration-1/assets/app-design.html) |
| [iteration-1/20261113-05-assistant-tools-and-test-flows.md](iteration-1/20261113-05-assistant-tools-and-test-flows.md) | Design | The assistant uses tools to change the order (guests, date, design) and talks back; Undo; 13 end-to-end test flows from a first visit to a finished order, simple to hostile, for the fake and the real model. |
