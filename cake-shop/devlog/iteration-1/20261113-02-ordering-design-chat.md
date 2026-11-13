# cake-shop: Ordering stage, designing the cake with an AI assistant

**Date:** 2026-11-13

**Status:** Design

**Iteration:** Iteration 1, Stage 1 Requirements (see [process.html](../../docs/process.html#i1-requirements))

**Scope:** Business Stage 1 (Ordering), from the customer's first message to an approved order. The customer designs the cake in a back-and-forth chat with an AI assistant, choosing only from predefined templates and options. While the wish is still open, the assistant offers a few options side by side, each with a picture, a price and a designer's note. After the customer chooses one, each turn shows the refined design, a preview picture and the price. The customer confirms the design, and the baker approves or declines it. Not covered: Stages 2–4, real payment, and changing an order after the baker has approved it.

**Depends on:** [20261113-01-business-lifecycle.md](20261113-01-business-lifecycle.md): four sequential stages, stage contracts, one `orders` table.

**Visual:** [assets/ordering-design.html](assets/ordering-design.html). It shows the live design loop, a playable design conversation with live rule checks, the baker approval screen and the order row, the template catalog with previews, a sandbox for the rule agents, and the Stage 1 statuses. Final app design (static, high fidelity): [assets/app-design.html](assets/app-design.html), with a design review, every customer and baker screen (desktop), and components.

**Replaces:** the Stage 1 agent chain in 20261113-01 and its visuals (one message in, then Intake, Pricing, Capacity, Design brief, Review router, Baker review only if flagged, Confirmer). The life-cycle decisions there still stand.

---

<!-- ========================= STAGE 1 -- DESIGN ========================= -->

## Context

In the first design, the customer sent one message and was never asked anything again. The baker could change the design without the customer agreeing to it. A real cake order is a conversation: the customer asks, the bakery says what is possible and what it costs, and both agree before anything is baked. This devlog redesigns Ordering around that conversation. To keep the AI honest, everything it offers comes from a **fixed catalog of templates and options** that the bakery knows it can make.

---

## Initial design

- **Agreed** (discussion, 2026-11-13): The customer and an **AI design assistant** talk back and forth until the design is final. On each turn the assistant takes the customer's input into account, updates the design, makes suggestions, and says what the bakery can and cannot do.
- **Agreed** (discussion, 2026-11-13): Designs are built from **predefined templates**, each with its own **customization options**. A design that fits a template and its options is one we know we can make, so agreeing it is easy.
- **Agreed** (discussion, 2026-11-13): Like a real designer, the assistant **shows possibilities**. When the wish is still vague, it presents **several possible designs (2–4)**, each with its own **picture, price, designer's note and suggestions**, so the customer can compare and choose.
- **Agreed** (discussion, 2026-11-13): There is **no Capacity agent** in Stage 1. The **baker** checks that the kitchen has room on the day when approving, and declines if it doesn't. An automatic capacity check could come back in a later iteration.
- **Agreed** (discussion, 2026-11-13): On every turn the customer sees the **price** and a clear **"we can't do that"** (with the nearest alternative) when a request is outside the catalog or not realistic.
- **Agreed** (discussion, 2026-11-13): The customer sees a **picture of the cake** as it is designed.
- **Agreed** (discussion, 2026-11-13): The checker, Pricing and Preview run **live**, at the same moment as each change to the design, and their results show beside the chat while the customer is still talking. It is a loop, not a pipeline after the chat.
- **Agreed** (discussion, 2026-11-13): There are **two ways to change the design**: ask the AI ("make it purple"), or use **quick changes** in the design panel (colour swatches, tick boxes, a size menu). A quick change goes through the same checker, Pricing and Preview. It is also **written into the chat** as a note, so it is in the AI's context, and the AI replies with a short **confirmation** ("I see you changed the colour to purple"). Where useful it adds a designer's comment, such as "that's fewer than the 20 kids you mentioned". The AI never undoes a quick change.
- **Agreed** (discussion, 2026-11-13): The **customer confirms the design**. The order then waits for a **human (the baker) to approve** it. Once approved, Ordering is finished.
- **Proposed:** The AI **chooses, it does not decide.** It only proposes a design as a template plus option values. Rule agents then check that design (including the minimum notice for the date), price it and draw it. The AI cannot invent an option or a price (→ §Guardrail below).
- **Proposed:** The **preview picture is drawn by rules from the design**, by layering pictures for the template, colour, decoration, topper and inscription. It is not AI-generated. The customer then sees exactly what the bakery will make, at no cost, and the same design always looks the same (→ Q1).
- **Proposed:** **Confirming is a button, not a chat message.** The AI never decides that "sounds good" means yes. The Confirm button appears only when one design is chosen and it is valid.
- **Proposed:** **Choosing an option is a button too** (**Choose** on the option card), for the same reason. The chosen option becomes the current design.
- **Proposed:** Rejected candidates are dropped before the customer sees them. If the assistant proposes four options and the checker rejects one, the customer sees three.
- **Proposed:** At confirmation the design and price are **frozen**.
- **Proposed:** The baker **approves or declines**, without editing. Editing would mean going back to the customer, which is a loop. A decline gives a reason, and the order ends.
- **Proposed:** **Every order goes to the baker**, so there is no review rule any more. The baker reviews a design that is already valid and priced, so each review is quick.

### Who does what in Stage 1

| Agent | Kind | Job | When |
|---|---|---|---|
| Customer | Human | Chats, compares options and presses **Choose**, presses **Confirm design** | Every turn, then once |
| Design assistant | AI | Reads the chat and the catalog. Proposes 2–4 candidate designs with a designer's note each (open wish), or one refined design (template + options). Writes the reply | Every turn |
| Design checker | Rules | Checks the proposed design against the catalog: allowed options, limits, dietary, lead time | Every turn |
| Pricing | Rules | Prices the design from the price table | Every turn |
| Preview | Rules | Draws the cake picture from the design | Every turn |
| Baker approval | Human gate | Approves or declines the confirmed design. Checks the kitchen's own calendar for room on the day | Once |
| Confirmer | Rules | Records the (simulated) payment, tells the customer. Stage 1 output | Once |

### The live design loop

Designing is live, not a pipeline. The rule agents don't wait for the conversation to finish. They run at the same moment as each change, and their results show beside the chat.

```
            ┌──────────── the conversation ────────────┐
            │  Customer ⇄ Design assistant (AI)         │
            └──────┬───────────────────┬────────────────┘
          [Choose] │                   │ proposes / updates (1 design, or 2–4 candidates)
                   ▼                   ▼
                  ┌── current design ──┐
                  └─────────┬──────────┘
            every change, all three at the same moment
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
  Design checker         Pricing            Preview         (rules)
  can we make it?        the total          the picture
         │                  │                  │
         └────────► design panel beside the chat ◄┘  ← the customer sees it while still talking
                    ✓ can be made / Confirm unlocks · $ line by line · picture

  checker says no → that version is never shown; the reasons go back to the AI,
                    which proposes something else or explains the problem
```

Each candidate in an options turn goes through the same loop. Its card in the chat shows its own picture and price.

The conversation is a loop **inside one step** of the stage. The stage itself still only goes forward.

### The stage as a whole

```
DESIGNING ──(customer presses Confirm)──► AWAITING_BAKER ──approve──► CONFIRMED  → Stage 2
   │  chat turns repeat here                    │
   │                                            └──decline──► DECLINED (ends)
   └──(no activity for 7 days)──► ABANDONED (ends)
```

### Guardrail: why the AI cannot promise something we cannot make

The assistant's output is not taken as true. Before the customer sees anything, the Design checker validates the proposed design against the catalog, and Pricing works out the price. The assistant's reply text must use those numbers, not its own. So even if the AI is wrong, the customer still only sees designs and prices that the rules accept. This is the main teaching point of the stage: **AI for the conversation, rules for the promises.**

### Example catalog (fictional)

| Template | Sizes (serves) | Options | Limits |
|---|---|---|---|
| **Classic round** | 6" (8), 8" (16), 10" (24) | flavour: vanilla, chocolate, lemon, red velvet · frosting colour: 8 colours · decoration: sprinkles, drip, piped rosettes, fresh flowers · topper: none, number candles, theme topper (unicorn, dinosaur, football, crown) · inscription | inscription up to 30 characters · gluten-free available |
| **Two-tier** | 30, 50 | flavour per tier · finish: buttercream or fondant · decoration: flowers, ribbon, drip · topper · inscription | at least 5 days' notice · **no gluten-free** |
| **Number cake** | 1 or 2 digits, 12 per digit | flavour · toppings: fruit, macarons, flowers | no inscription |
| **Sheet cake** | half (24), full (48) | flavour · printed edible image · inscription | inscription up to 40 characters |

Always out: 3D sculpted shapes, likenesses of real people, more than 2 tiers, orders with under 3 days' notice, delivery outside the local zone.

Example: *"unicorn cake with a big sculpted horn, gluten-free, 20 people"* → the assistant explains that sculpted shapes are not offered and proposes **Classic round 10" (serves 24), chocolate, white frosting, rainbow drip, unicorn theme topper (horn and ears), gluten-free**. It also offers two other directions (a rainbow-drip round and a cheaper sheet cake with a printed unicorn), each with its picture and price.

### Data model changes (one table still)

| Column | Written by | Rule |
|---|---|---|
| `chat` | Customer and Design assistant | List of messages. Added to while `DESIGNING` |
| `options` | Design assistant, only candidates the checker accepted, each with its price | Replaced on a turn that offers options, cleared when the next turn refines one |
| `design` | Design assistant after the checker accepts it, or the option the customer chose | Template + options, including the pickup date. **Replaced when it changes** while `DESIGNING`, frozen at confirmation |
| `quote` | Pricing | Replaced every turn, frozen at confirmation |
| `approval` | Baker | Written once |
| `confirmation` | Confirmer | Written once |

`request`, `spec`, `brief`, `review` and `slot` are dropped: the chat replaces the request, and the design replaces the spec and the brief. The rule "one writer per column, written once" becomes "**draft columns may change while `DESIGNING`. Every column is frozen once the status moves on.**" Statuses for Stage 1: `DESIGNING → AWAITING_BAKER → CONFIRMED`, plus the end states `DECLINED` and `ABANDONED`.

**Effect on the stage contract:** Stage 2 now reads `design` instead of `spec` and `brief`. A design made of a template and options is easier for the kitchen to follow than a free-text brief. This is the only change to the Stage 1 → Stage 2 contract.

---

## Use cases

### Map

| Id | Actor | Goal | Priority (MoSCoW) |
|---|---|---|---|
| UC-01 | Customer | Start an order by describing the cake I want | Must |
| UC-02 | Customer | Compare a few possible designs (picture, price, designer's note) and choose one | Must |
| UC-02b | Customer | Refine the chosen design in conversation and see the picture and price each time | Must |
| UC-03 | Customer | Be told clearly when something can't be done, with the nearest alternative | Must |
| UC-04 | Customer | Confirm the final design | Must |
| UC-05 | Baker | See confirmed designs waiting for me, and approve or decline each one | Must |
| UC-06 | Customer | Get the final answer: confirmed (with date and price) or declined (with reason) | Must |
| UC-07 | Baker | See an order's full chat and event log | Should |
| UC-08 | Customer | Start from a template picture instead of typing | Could |

### UC-02: Refine the design in conversation

> As a customer, I want to adjust the cake by chatting and see what it will look like and cost, so that I know exactly what I'm getting before I commit.

| # | Customer does | Sees |
|---|---|---|
| 1 | Writes "can it be purple instead, and add her name?" | A reply that changes the frosting to purple and adds the inscription "Mia" |
| 2 | Looks at the preview | The picture redrawn in purple with "Mia" on top |
| 3 | Reads the summary | Template, options, price (unchanged, because the inscription is free) |
| 4 | Sees the **Confirm design** button | Active, because one design is chosen and it is valid |

**Note:** every value on screen comes from the rule agents, never from the AI's own text.

### UC-03: Told when something can't be done

| # | Customer does | Sees |
|---|---|---|
| 1 | Asks for a three-tier cake for this Saturday (two days away) | "We can't make tiered cakes with under 5 days' notice." Two options that can be ready in time, each with a picture and price: a Classic round 10" (serves 24) and a half sheet cake (serves 24) |
| 2 | Presses **Choose** on one | It becomes the current design. The Confirm button appears |

### UC-04 → UC-05 → UC-06: Confirm, approve, answer

| # | Who | Does | Sees |
|---|---|---|---|
| 1 | Customer | Presses **Confirm design** | "Thanks! The baker will check your order and reply soon." The chat closes |
| 2 | System | Freezes design and quote | Status `AWAITING_BAKER` |
| 3 | Baker | Opens the approval inbox, reads the design, picture, price and chat, checks the kitchen calendar for the day before pickup | The order with Approve and Decline buttons |
| 4a | Baker | Approves | The customer gets the confirmation. Status `CONFIRMED`. Stage 1 is done |
| 4b | Baker | Declines with a reason (for example, the kitchen is full that day) | The customer gets the reason. Status `DECLINED` |

### Coverage and gaps

Covered: the conversation, the catalog limits, the confirm button, the baker gate, both outcomes. Left out on purpose: the baker editing the design (it would loop back to the customer), changes after confirmation, real payment, and customers coming back to an abandoned chat.

---

## Open questions

All settled on 2026-11-13. The build plan is [20261113-04-ordering-app-build.md](20261113-04-ordering-app-build.md#decisions-settled-here-2026-11-13).

### Q1: The preview picture

Options: (a) **layered pictures drawn by rules** from the design: exact and free, but simple-looking; (b) an **AI image** from the design: prettier, but slow, costly, and it may show things the bakery cannot make. **Decided** (2026-11-13, see [20261113-04-ordering-app-build.md](20261113-04-ordering-app-build.md#decisions-settled-here-2026-11-13)): (a). It keeps the promise ("what you see is what we make") and fits the lesson. (b) could be a later extra.

### Q2: Who makes sure the kitchen has room?

**Agreed** (discussion, 2026-11-13): the baker, when approving. There is no Capacity agent in Stage 1. The checker only enforces the minimum notice. An automatic capacity check could come back in a later iteration.

### Q3: Abandoned chats

**Decided** (2026-11-13, see [20261113-04-ordering-app-build.md](20261113-04-ordering-app-build.md#decisions-settled-here-2026-11-13)): an order still in `DESIGNING` after 7 days without customer activity becomes `ABANDONED`.

### Q4: How many templates for the demo

Superseded by the product catalog: see [20261113-03-product-catalog.md](20261113-03-product-catalog.md). The four templates above stay as the demo's working subset until that catalog is agreed.

### Q5: How many options per turn

**Decided** (2026-11-13, see [20261113-04-ordering-app-build.md](20261113-04-ordering-app-build.md#decisions-settled-here-2026-11-13)): 2–4 when the wish is open, 1 when the customer is refining a chosen design.

---

## Outcome

<!-- Fill in when Done. -->
