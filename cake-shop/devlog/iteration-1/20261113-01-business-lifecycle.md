# cake-shop: Business life cycle and stage contracts

**Date:** 2026-11-13

**Status:** Draft

**Iteration:** Iteration 1, Stage 1 Requirements (see [process.html](../../docs/process.html#i1-requirements))

**Scope:** The whole life of one cake order, split into four sequential stages, with the input and output of each stage. It does not cover how each stage is built inside (Ordering gets its own devlog), or anything that loops back: rework, changes after confirmation, complaints.

**Depends on:** none (first devlog of the project).

**Visual:** [assets/business-lifecycle.html](assets/business-lifecycle.html). It shows the life cycle diagram, the stage contracts with sample data, the Stage 1 agent flowchart and a step-through of two example orders.

---

<!-- ========================= STAGE 1 -- DESIGN ========================= -->

## Context

A small bakery makes celebration cakes to order. Requests arrive as free text. Today the baker reads each one, prices it, checks the calendar and replies by hand. The **Cake Order Desk** is a teaching example of a multi-agent system that takes over this work. AI agents read and write natural language, rule agents handle money, calendar and routing, and the baker approves at set points (human in the loop). The goal of the course is to show the design process, so the business is kept small and the flow kept simple.

---

## Initial design

- **Agreed** (discussion, 2026-11-13): The life cycle has **four stages in a straight line**: Ordering → Production → Fulfillment → Done.
- **Agreed** (discussion, 2026-11-13): **No loop-backs.** No stage sends work back to an earlier one. The only branch is that the baker may decline an order in Ordering, which ends it.
- **Agreed** (discussion, 2026-11-13): Each stage has **one input and one output**, and the output of one stage is the input of the next. These are the stage contracts (see the table below). The stages talk to each other only through them, so each stage can be designed, built and tested on its own.
- **Agreed** (discussion, 2026-11-13): The system mixes three kinds of agent: **AI** (language), **rules** (deterministic), and **human** (work or approval). At least one step is a **human gate**, where the flow waits for a person to approve.
- **Agreed** (discussion, 2026-11-13): **Iteration 1 builds only Stage 1 Ordering**, as an orchestrated chain of agents. Stages 2 to 4 are described here so the Ordering output is shaped for them, but they are not built yet.
- **Proposed:** One **order record** grows through the life cycle. Each stage adds its sections and moves the status forward. Each stage's output is the record at the point the stage ends.
- **Proposed:** Two human gates in the whole life cycle: **Baker review** in Ordering (only for flagged orders) and **Baker release** in Production (every cake).
- **Proposed:** Payment is **simulated** and recorded at confirmation (→ Q2).

### Stage contracts

| Stage | Input | Agents (kind) | Output | Status at the end |
|---|---|---|---|---|
| 1 Ordering | **Order request**: message, name, contact, wanted date, pickup or delivery | Intake (AI), Pricing (rules), Capacity (rules), Design brief (AI), Review router (rules), Baker review (human gate, only if flagged), Confirmer (rules) | **Confirmed order**: spec, quote, slot, brief, approval, confirmation. Or **Declined** (order ends) | `CONFIRMED` or `DECLINED` |
| 2 Production | **Confirmed order** | Production planner (rules), Ingredient reserver (rules), Kitchen staff (human), Photo check (AI), Baker release (human gate) | **Finished cake record**: tasks done, photo, check result, release | `READY` |
| 3 Fulfillment | **Finished cake record**, plus pickup or delivery details | Dispatcher (rules), Notifier (rules), Driver or counter staff (human) | **Handover record**: time, by whom, proof | `HANDED_OVER` |
| 4 Done | **Handover record** | Closer (rules), Feedback summariser (AI) | **Closed order**: receipt, feedback summary, archived | `CLOSED` |

### Data model: one table

Visual: [assets/data-model.html](assets/data-model.html).

- **Proposed:** The whole life cycle uses **one table, `orders`, with one row per order**, from the customer's request to `CLOSED`. Agents never call each other. They coordinate only through this table.
- **Proposed:** **`status` is the inbox.** Each agent looks for rows in the one status it handles, writes its output, and moves `status` on. The human steps work the same way: the baker's review screen lists the rows with `status = 'AWAITING_BAKER'`.
- **Proposed:** **One JSON column per agent**, and exactly **one writer per column**, written once. Corrections by the baker go in `approval` (for example `priceOverride`), not over `quote`. Plain columns: `id`, `status`, `created_at`, `updated_at`.
- **Proposed:** The **event log is a JSON list** in the same row (`events`), with one entry added on every status change.
- **Proposed:** A hand-on is one `UPDATE … WHERE id = :id AND status = :expected`. If the status has already moved, nothing changes, so two workers can never both take the same step.
- **Proposed:** **No other tables.** The customer is inside `request`. Prices and the catalog are config files. Day capacity is the sum of `slot.units` over the other orders' rows.

| Stage | Columns it fills | Row status at the start → end |
|---|---|---|
| 1 Ordering | `request spec quote slot brief review approval confirmation` | `REQUESTED` → `CONFIRMED` / `DECLINED` |
| 2 Production | `plan made qc release` | `CONFIRMED` → `READY` |
| 3 Fulfillment | `fulfillment handover` | `READY` → `HANDED_OVER` |
| 4 Done | `receipt feedback` | `HANDED_OVER` → `CLOSED` |

### Order status, in order

`REQUESTED → PARSED → PRICED → SLOT_HELD → BRIEFED → (AWAITING_BAKER) → APPROVED → CONFIRMED → PRODUCTION_PLANNED → MADE → QC_CHECKED → READY → AWAITING_PICKUP | OUT_FOR_DELIVERY → HANDED_OVER → COMPLETED → CLOSED`, plus the end state `DECLINED` from Ordering.

---

## Use cases

The use cases for iteration 1 belong to Stage 1 Ordering and will be written in the Ordering devlog (`20261113-02-ordering-orchestrator.md`, next). At the life-cycle level, the two example journeys in the visual are the reference cases:

| Id | Journey | Shows |
|---|---|---|
| J-A | Standard catalog cake, pickup | The baker never sees it: the review rule approves it, then the rest of the life cycle runs |
| J-B | Custom gluten-free unicorn cake, delivery | The order stops at the baker gate, the baker edits it and approves, then delivery |

### Coverage and gaps

Left out on purpose: rework after a failed photo check, changes or cancellations after confirmation, failed deliveries, complaints and refunds. These are the loop-backs the simple design avoids. They are a good topic for a later iteration.

---

## Open questions / future extensions

### Q1: Missing information in a request

If Intake cannot find the servings or the date, what happens without a loop back to the customer? **Proposed:** the review rule sends the order to the baker, who fills in the gap (for example after a phone call) before approving. A "clarify with the customer" step can come later.

### Q2: Payment

**Proposed:** simulated, recorded by the Confirmer as paid. Real payment is out of scope for the course.

### Q3: Simulated clock

The life cycle takes days. For a live demo of later stages, a clock we can fast-forward would help. Not needed for iteration 1, which ends at `CONFIRMED`.

---

## Outcome

<!-- Fill in when Done. -->
