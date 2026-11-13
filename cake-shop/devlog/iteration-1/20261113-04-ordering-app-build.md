# cake-shop: Building the ordering app (Stage 1 Ordering, desktop)

**Date:** 2026-11-13

**Status:** In Progress

**Iteration:** Iteration 1, Stage 2 Design → Stage 3 Implementation (see [process.html](../../docs/process.html#i1-design))

**Scope:** How to build Stage 1 Ordering as a working web app: the catalog as data, the three rule agents, the order store, the AI design assistant, the customer screens (start, design studio, review and confirm, order status) and the baker approval screens. Desktop only. Not covered: phones, real payment, real email or text messages, a screen for editing the catalog, Stages 2–4.

**Depends on:** [20261113-01-business-lifecycle.md](20261113-01-business-lifecycle.md) (stages, one `orders` table), [20261113-02-ordering-design-chat.md](20261113-02-ordering-design-chat.md) (the chat, the live loop, quick changes, the baker gate), [20261113-03-product-catalog.md](20261113-03-product-catalog.md) (what we sell and the rules).

**Visual:** [assets/app-design.html](assets/app-design.html) is the screen design to build. [assets/ordering-design.html](assets/ordering-design.html) is the playable demo of the agent flow. [assets/cake-preview.js](assets/cake-preview.js) is the starting point for the Preview agent.

---

<!-- ========================= STAGE 1 -- DESIGN ========================= -->

## Context

The design work is done: devlog 02 fixes how ordering works, devlog 03 fixes what the bakery sells, and the app design fixes every screen. This devlog turns them into a build plan, and settles every question the earlier devlogs left open, so the app can be built from this document alone.

---

## Initial design

### Decisions settled here (2026-11-13)

The user asked for the pending questions to be decided so building can start. Each one below is **Agreed** (discussion, 2026-11-13: "You make the decisions that are still pending").

| Was open in | Question | Decision |
|---|---|---|
| 02 Q1 | Preview picture | **Drawn by rules** from the design (layered SVG), never AI-generated. |
| 02 Q3 | Abandoned chats | An order in `DESIGNING` with no customer activity for **7 days** becomes `ABANDONED`. A sweep runs at server start and every hour. |
| 02 Q5 | Options per turn | **2–4** while the wish is open, **1** while refining a chosen design. |
| 03 Q1 | Fully custom requests | **Not in iteration 1.** The assistant says what we can't do and offers the nearest templates. |
| 03 Q2 | Option prices by size | **Flat prices** in iteration 1. |
| 03 Q3 | Party and wedding portions | Sizes state party portions. For the Wedding occasion the screens also show wedding portions (× 1.5, rounded down). |
| 03 Q4 | How much catalog | All **6 product lines** and the **full option library**, and **8 templates** (below). More templates are data only, plus a picture if they need a new topper. |
| App design | Start screen | The customer gives **occasion, guests, pickup date and dietary needs** before the chat. They are kept as the order's **brief**. Free text is optional. |
| App design | Order details strip | The brief stays pinned above the design. Changing it is a quick change: checked, noted in the chat, confirmed by the AI. |
| App design | Size vs guests | When the size serves fewer than the guests in the brief, the panel shows a warning and the AI mentions it. It is a warning, not a rule: the customer may choose a smaller cake. |
| App design | Payment | **Simulated**, and only after the baker approves. Nothing is charged at confirmation. |
| App design | Pickup and delivery | Pickup in one of three slots (10–12, 12–2, 2–4). Local delivery +$10 in the same slots. Three-tier cakes are delivery only (+$25 setup). |
| App design | After confirming | The design and price are **locked**. Changing anything means starting a new order. |
| App design | Phones | **Desktop only** (1280 px and wider). On narrow windows the panels stack, but nothing is designed for phones. |
| 02 vs 03 | Conflicting limits | **Devlog 03 wins**: shop-wide minimum notice 2 days, tiered 7 days (3 tiers 14), at most 3 tiers. Devlog 02's example table is only the demo's subset. |
| 02 | Statuses | `DESIGNING → AWAITING_BAKER → CONFIRMED`, plus `DECLINED` and `ABANDONED`. On approval the Confirmer runs at once (simulated payment, notice to the customer), so there is no separate `APPROVED` status. |
| New | Sign-in | No customer accounts. The customer's link carries a secret token (`/order/C-1043?t=…`). The baker signs in with one shared password from the server's settings. |
| New | Notifications | Not sent. Each "we'd email you" is written to the order's event log and shown on the status page. |
| New | "Today" | The server clock decides notice. Tests set the clock. |

### The 8 templates for iteration 1

| Template | Line | Occasions | Why it is in |
|---|---|---|---|
| Unicorn round | Round | Kids' birthday | The worked example |
| Dinosaur round | Round | Kids' birthday | A second theme on the same line |
| Picture sheet | Sheet | Kids' birthday, Office and events, Achievement | Printed picture, best value |
| Sweet number | Number | Kids' birthday, Adult birthday | Number line, digits |
| Drip cake | Round | Adult birthday | Drip and topper choices |
| Message mini | Mini | Adult birthday, Wedding and anniversary, Just because | Mini line, short message |
| Classic white tiered | Tiered | Wedding and anniversary | Tiered line, no gluten-free, long notice |
| Rainbow cupcakes | Cupcakes | Kids' birthday, Office and events | Cupcake line, 1 decoration |

Baby and Seasonal have no template yet. For those occasions the assistant offers the nearest templates and says so.

---

## Use cases

The use cases are the ones in devlog 02 (UC-01 to UC-08) and devlog 03 (UC-C1 to UC-C5). This devlog adds no new ones. Every Must is built. Of the rest, UC-07 (baker sees the full chat) is built, UC-08 (start from a template picture) is built as the "popular" cards on the start screen, UC-C4 is "the baker edits the catalog file", and UC-C3 and UC-C5 are built only as far as the 8 templates allow.

---

<!-- ========================= STAGE 2 -- SPEC ========================= -->

## Design summary

| Concern | Decision |
|---|---|
| Stack | TypeScript everywhere. npm workspaces `shared`, `server`, `web`, `e2e`, the same layout as the job-board app (→ §1) |
| Catalog | Typed data in `shared/catalog.ts`, read by the AI prompt, the rules and the screens (→ §2) |
| Rule agents | Pure functions in `shared`: `check`, `price`, `drawCake`. The server is the authority, and the browser uses the same code only to draw (→ §3) |
| Store | SQLite, one `orders` table, JSON columns, status as the inbox (→ §4) |
| Changes | Every change goes through one server function, `applyChange`, which runs the live loop (→ §5) |
| AI | Design assistant behind a provider seam. Real: Claude Sonnet 5.5 with a JSON schema reply. Tests: a fake provider (→ §6) |
| API | Small JSON API, customer by order token, baker by session cookie (→ §7) |
| Screens | React, built from app-design.html (→ §8) |

---

## §1 Project layout

```
cake-shop/app/
  package.json              workspaces + scripts (dev, test, test:e2e, typecheck, seed)
  .env.example              ANTHROPIC_API_KEY, BAKER_PASSWORD, ASSISTANT_PROVIDER=fake|anthropic
  shared/src/
    types.ts                Design, Brief, Order, ChatMessage, Status, Quote, CheckResult
    catalog.ts              product lines, option library, templates, shop rules, slots
    check.ts                Design checker (rules, four levels)
    price.ts                Pricing
    preview/                Preview: drawCake(design) → SVG string (ported from cake-preview.js)
    servings.ts             servings, wedding portions, size-vs-guests warning
  server/src/
    index.ts, app.ts        Express app, static web build in production
    db.ts                   SQLite via better-sqlite3 (no ORM), migrations, orders repository
    orders/applyChange.ts   the live loop (§5)
    orders/status.ts        status moves and the abandon sweep
    assistant/              provider.ts (seam + fake), anthropic.ts, prompt.ts, turn.ts
    routes/customer.ts, routes/baker.ts
  web/src/
    customer/  Start.tsx, Studio.tsx, ConfirmSheet.tsx, Status.tsx
    baker/     Login.tsx, Inbox.tsx, OrderDetail.tsx
    ui/        components from app-design.html §6 (buttons, chips, badges, chat bubbles, swatches…)
  e2e/tests/   playwright, against the fake provider
```

---

## §2 The catalog as data

`shared/catalog.ts` holds devlog 03's tables as typed constants. The shapes:

```ts
type LineId = 'cupcakes' | 'mini' | 'round' | 'number' | 'sheet' | 'tiered';
interface ProductLine { id: LineId; name: string; sizes: { id: string; label: string; serves: number; price: number }[];
  noticeDays: number | Record<string, number>; groups: OptionGroup[]; maxDecorations: number; messageMax?: number;
  glutenFree: boolean; vegan: boolean; deliveryOnly?: string[] }
interface Template { id: string; name: string; line: LineId; occasions: OccasionId[];
  fixed: Partial<Design>; defaults: Partial<Design>; changeable: OptionGroup[]; palette?: ColourId[]; season?: { from: string; to: string } }
interface Design { template: string; size: string; sponge: string; filling?: string; finish?: string; colour: ColourId;
  decorations: string[]; topper?: string; message?: string; picture?: string; digits?: string;
  glutenFree: boolean; vegan: boolean; extras: string[] }
interface Brief { occasion: OccasionId; guests: number; date: string; dietary: ('gluten-free' | 'vegan')[]; fulfilment: 'pickup' | 'delivery'; slot?: string }
```

The pickup date and fulfilment live in the **brief**, not the design, because the start screen asks for them and they are not part of the cake. The checker reads both.

---

## §3 The rule agents

All three are pure functions in `shared`, with no I/O, so they are easy to test.

- **`check(design, brief, today) → { ok: true } | { ok: false, reasons: Reason[] }`**: runs the four levels of devlog 03 in order: shop-wide, product line, template, option compatibility. Each `Reason` has a code (`'gf_red_velvet'`), a field (`'sponge'`) and a sentence for people ("Red velvet isn't available gluten-free."). The checker returns **every** reason, not just the first one.
- **`allowedValues(design, brief, field) → { value, ok, reason? }[]`**: for the quick-change controls. It tries each value of a field on a copy of the design through `check`, so a disabled choice shows the same reason the checker would give. No second copy of the rules.
- **`price(design, brief) → { lines: { label, amount }[], total }`**: base price of the line and size, plus each option, plus extras and delivery. Every number comes from the catalog.
- **`drawCake(design) → string`** (SVG): port `cake-preview.js` to TypeScript. Map the demo's `classic`, `tier`, `number` and `sheet` to the round, tiered, number and sheet lines. Add drawings for **cupcakes** (a box seen from above, 6/12/24) and **mini** (a small round with a message on top). Template fixed parts (unicorn topper, dinosaur) come from the template, not from the customer's choices.
- **`sizeWarning(design, brief)`**: "A 8" round serves 16. Your order says 20 guests."

The SVG output is set as HTML in the browser, so `drawCake` must escape every customer text (message, digits). The existing `esc` does this. Keep it, and test it.

---

## §4 The orders table

One table, as agreed in devlogs 01 and 02.

| Column | Type | Written by | Rule |
|---|---|---|---|
| `id` | text `C-1043` | server | Sequential |
| `token` | text | server | Random, 32 bytes, for the customer's link |
| `status` | text | server | `DESIGNING`, `AWAITING_BAKER`, `CONFIRMED`, `DECLINED`, `ABANDONED` |
| `brief` | JSON | customer | Draft while `DESIGNING` |
| `chat` | JSON list | customer, assistant, server | Messages of kind `customer`, `assistant`, `ui` (a quick-change note), `system`. Appended only |
| `options` | JSON list | assistant (checked) | Candidates with their price and picture inputs. Replaced on an options turn, cleared on a refine turn |
| `design` | JSON | assistant, Choose, quick change | Draft while `DESIGNING`, with `version` going up by one on each change. Frozen at confirm |
| `quote` | JSON | Pricing | Kept in step with `design`. Frozen at confirm |
| `contact` | JSON | customer at confirm | Name, phone, email. Written once |
| `approval` | JSON | baker | `{ decision, reason?, at }`. Written once |
| `confirmation` | JSON | Confirmer | `{ paid: 'simulated', amount, at }`. Written once |
| `events` | JSON list | server | Every change with who made it and when, and every "notice sent". Appended only |
| `created_at`, `updated_at`, `last_customer_at` | text | server | `last_customer_at` drives the abandon sweep |

Status moves are allowed only in this order, checked in one place (`status.ts`): `DESIGNING → AWAITING_BAKER` (confirm), `AWAITING_BAKER → CONFIRMED | DECLINED` (baker), `DESIGNING → ABANDONED` (sweep). Any other move is an error. Writing to a draft column outside `DESIGNING` is also an error.

---

## §5 The live loop: `applyChange`

Every change to the design goes through one function, whoever makes it.

```
applyChange(order, proposedDesign, by: 'assistant' | 'choose' | 'panel', note?)
  1. result = check(proposedDesign, order.brief, today)
  2. if not ok → return the reasons. Nothing is saved. (panel: shown inline; assistant: sent back to the AI)
  3. quote = price(proposedDesign, order.brief)
  4. save design (version + 1), quote, and an event { by, change, at }
  5. if by = 'panel' → append a chat message { kind: 'ui', change: "colour white → purple" }
  6. return { design, quote }       (the browser draws the picture with drawCake)
```

The picture is not stored. It is drawn from the design in the browser, with the same code the server has.

**Quick change, end to end:** the browser sends `{ field, value }`. The server builds the new design, runs `applyChange(…, 'panel')`, then asks the assistant for a short **acknowledgement** with the `ui` note in its context (§6). The response carries both the new design and the AI's reply. If the AI call fails, the change still stands and the server writes a plain acknowledgement instead ("Colour changed to purple. Total $112."), so a quick change never depends on the AI.

**Brief changes** (guests, date, dietary, fulfilment) re-run the checker on the current design. If the design no longer passes (for example, gluten-free added to red velvet), the brief change is refused with the reasons, the same as a quick change.

---

## §6 The Design assistant

**Provider seam**, as in the job-board app: `AssistantProvider.turn(input) → unknown`. `AnthropicProvider` calls the Messages API with `@anthropic-ai/sdk` from the server only (the key never reaches the browser), model `claude-sonnet-5-5`, with a JSON schema for the reply (`output_config.format`). A reply counts only when `stop_reason` is `end_turn`, and anything else is treated as a failure. `FakeProvider` is deterministic and offline, and every automated test uses it. Local runs and the deployed app use the same API call. There is no Claude Code or Agent SDK path.

**Choosing the provider** (`config.ts` and `index.ts`, the same order as job-board):

1. If `ASSISTANT_PROVIDER=fake`, use `FakeProvider`.
2. Otherwise, if `ANTHROPIC_API_KEY` is set and starts with `sk-`, use `AnthropicProvider`. A placeholder value in `.env` counts as no key.
3. Otherwise the assistant is not configured. The app still runs, quick changes and Choose still work, and each assistant turn gets the plain fallback reply.

The key is read from `app/.env`, which is git-ignored. Only `.env.example` is committed.

**Input** (built by `prompt.ts`): the catalog for the brief's occasion (templates and options, without prices, on purpose: see below), the brief, the current design, the full chat including `ui` notes, and, on a retry, the checker's reasons.

**Reply schema:**

```json
{
  "kind": "options | refine | answer | ack",
  "text": "the message to the customer, no prices",
  "candidates": [{ "design": { }, "title": "Rainbow unicorn", "note": "The most party-like." }],
  "cantDo": ["3D sculpted shapes"],
  "suggestions": ["Add a rainbow drip"]
}
```

`options` carries 2–4 candidates, `refine` carries 1, `answer` and `ack` carry none.

**The turn** (`turn.ts`):

1. Call the provider. Validate the reply against the schema.
2. Run every candidate through `check`. If some are rejected and fewer than 2 remain on an `options` turn, or the one `refine` candidate is rejected, call the provider again **once** with the reasons. Then keep only what passes.
3. If nothing passes, the reply becomes `answer`: the AI's text is replaced by the checker's reasons and the current design is kept.
4. `refine` → `applyChange(…, 'assistant')`. `options` → store the candidates with their quotes. The customer presses **Choose** to make one current.
5. Append the assistant message. Prices are attached by the server from Pricing, never taken from the AI.

**Prices are never in the AI's words.** The prompt gives the AI no prices and tells it not to write any. If the reply text still contains an amount of money, the server removes that sentence and logs a warning event. Every price the customer sees comes from `price()`. This is the guardrail of devlog 02, made concrete.

**Quick-change acks** use the same call with `kind: 'ack'` expected: one or two sentences, plus a size warning or a designer's suggestion where useful. Several quick changes within 2 seconds are sent as one ack.

---

## §7 API

Customer routes take the order token as `?t=`. Baker routes need the session cookie.

| Method and path | Body | Does |
|---|---|---|
| `POST /api/orders` | `{ brief, text? }` | Checks the brief (notice, dietary), creates the order, runs the first assistant turn. Returns `{ id, token, order }` |
| `GET /api/orders/:id` | | The order as the customer may see it |
| `POST /api/orders/:id/messages` | `{ text }` | One assistant turn (§6) |
| `POST /api/orders/:id/choose` | `{ candidate }` | Makes a candidate the current design (`applyChange`, 'choose') |
| `PATCH /api/orders/:id/design` | `{ field, value }` | Quick change (§5). 422 with reasons if refused |
| `PATCH /api/orders/:id/brief` | `{ field, value }` | Brief change (§5). 422 with reasons if refused |
| `POST /api/orders/:id/confirm` | `{ fulfilment, slot, contact, final: true }` | Re-checks the design and notice, freezes design and quote, `AWAITING_BAKER` |
| `POST /api/baker/login` | `{ password }` | Sets the session cookie |
| `GET /api/baker/orders?status=` | | List, soonest pickup first |
| `GET /api/baker/orders/:id` | | The order with checks, chat, events, and the orders already confirmed for the same bake day (pickup − 1 day) |
| `POST /api/baker/orders/:id/approve` | | `CONFIRMED`, the Confirmer writes `confirmation`, notice event |
| `POST /api/baker/orders/:id/decline` | `{ reason }` | `DECLINED`, the reason is shown to the customer |

Errors are `{ error, reasons? }` with 400 (bad input), 401/404 (wrong token or not signed in: both answer 404 for customer routes, so order ids can't be probed), 409 (wrong status), 422 (checker said no), 502 (the AI failed; the chat shows "The assistant didn't answer. Try again.").

---

## §8 Screens

Build the screens of [app-design.html](assets/app-design.html), sections 1 to 5, using its colours and components (section 6) as the style guide. Notes for the build:

- **Start** (`/order/new`): the occasion tiles come from the catalog. The "popular" cards are the templates tagged with the chosen occasion that fit the guests and dietary needs. Clicking one starts the chat with that template.
- **Design studio** (`/order/:id`): the chat on the left, the design panel on the right. The quick-change controls get their values from `allowedValues`. A disabled value shows its reason as a tooltip. The **Review & confirm** button is enabled only when there is a current design and the latest check passed. While the assistant is answering, the composer is disabled and a typing indicator shows. Quick changes stay possible.
- **Review & confirm**: a dialog over the studio. The confirm button is disabled until the "This design is final" box is ticked and contact details are valid.
- **Order status**: read-only, follows the status. Shows the decline reason or the confirmation. Shows the "we'd email you" notices from the event log.
- **Baker**: inbox with Waiting, Approved, Declined tabs. The detail view is as designed: checks, same-day list, chat, Approve, Decline with a reason (required). No edit.

---

## Phase A: Shared core (catalog and rule agents)

### What to implement

- Workspace skeleton (`app/package.json`, tsconfig, the four packages), like the job-board app
- `shared/catalog.ts` (→ §2), `check.ts`, `price.ts`, `servings.ts`, `preview/` (→ §3)

### Test plan

**Automated tests** (vitest)
- `the worked example prices to 112`: Unicorn round 10", gluten-free → $85 + $15 + $12.
- `option B and C of the worked example price to 122 and 97`.
- `red velvet with gluten-free is rejected with the gf_red_velvet reason`.
- `a tiered cake is rejected for gluten-free and for 6 days' notice`.
- `an order with 1 day's notice is rejected shop-wide`.
- `a third decoration on a round cake is rejected, a second on cupcakes is rejected`.
- `the unicorn topper can't be removed from a Unicorn round`.
- `a message longer than the line allows is rejected (20 mini, 30 round, 40 sheet)`.
- `the checker returns every reason, not just the first`.
- `allowedValues marks red velvet as not allowed when gluten-free is on, with the same reason`.
- `drawCake draws every template without throwing, and escapes a message containing <script>`.
- `sizeWarning fires for an 8" round and 20 guests, not for a 10" round`.

### Verify

```
cd cake-shop/app && npm test -w shared
```

---

## Phase B: Server and the order store

### What to implement

- `db.ts` (→ §4), `status.ts` with the abandon sweep, `applyChange.ts` (→ §5)
- `routes/customer.ts` and `routes/baker.ts` (→ §7), with the fake assistant wired in
- `seed`: three orders waiting for the baker (Sam, Jordan, Priya, as in the app design) and two already confirmed for Fri 20 Nov

### Test plan

**Automated tests** (vitest + supertest, fake provider, fixed clock 2026-11-13)
- `creating an order with a valid brief returns a token and DESIGNING`.
- `a quick change that passes saves design version + 1 and appends a ui note to the chat`.
- `a quick change that fails returns 422 with reasons and changes nothing`.
- `a brief change that breaks the current design is refused`.
- `confirm needs final: true, re-checks notice, freezes the design, and sets AWAITING_BAKER`.
- `after confirm, design and brief changes return 409`.
- `approve sets CONFIRMED and writes the confirmation; decline needs a reason`.
- `a wrong token answers 404, baker routes without the cookie answer 401`.
- `an order idle for 7 days is set to ABANDONED by the sweep, one idle for 6 days is not`.
- `the baker list is sorted by pickup date and the same-bake-day list is right`.

### Verify

```
cd cake-shop/app && npm test -w server
```

---

## Phase C: The Design assistant

### What to implement

- `assistant/provider.ts` (seam and `FakeProvider`), `anthropic.ts`, `prompt.ts`, `turn.ts` (→ §6)
- The fake: a vague first message gives 3 candidates (for the unicorn brief, exactly the three of the worked example). "make it X" or "change the colour to X" gives a refine. `ack` echoes the change. Tags in the text force cases: `[REJECT]` (a candidate the checker refuses), `[PRICE]` (a reply that writes a price), `[FAIL]` (the provider throws).

### Test plan

**Automated tests**
- `an open wish gives 2–4 checked candidates, each with a quote from Pricing`.
- `a rejected candidate is retried once with the reasons, then dropped`.
- `if nothing passes, the reply lists the checker's reasons and the design is unchanged`.
- `a sentence with a price in the AI's text is removed and logged`.
- `a provider failure on a quick change still keeps the change and writes the plain acknowledgement`.
- `the prompt includes ui notes since the last customer message`.

**Live check** (real AI, with a key, run by hand: `npm run live-check -w server`)
- [ ] The unicorn brief gives three different, valid options with useful notes (UC-02)
- [ ] "Can you make a 3D unicorn head?" is refused with the nearest alternatives (UC-03)
- [ ] After a colour quick change, the AI acknowledges it in one or two sentences, without a price of its own (devlog 02, quick changes)

### Verify

```
cd cake-shop/app && npm test -w server
```

---

## Phase D: Customer screens

### What to implement

- `web/` with React, Vite and a router. The `ui/` components from app-design.html §6
- Start, Design studio, Review & confirm, Order status (→ §8)

### Test plan

**Automated tests** (playwright, fake provider)
- `a customer can go from the start screen to AWAITING_BAKER` (UC-01, UC-02, UC-04).
- `a colour swatch changes the picture and the total, adds a note to the chat and an AI ack`.
- `red velvet is disabled with its reason when gluten-free is on`.
- `the confirm button is disabled until the final box is ticked`.

**Live check**
- [ ] Each screen matches app-design.html at 1280 and 1440 px wide
- [ ] Keyboard only: every control can be reached and used

---

## Phase E: Baker screens

### What to implement

- Login, Inbox, Order detail with Approve and Decline (→ §8)

### Test plan

**Automated tests**
- `the baker sees the waiting order, approves it, and the customer's status page shows Confirmed` (UC-05, UC-06).
- `a decline without a reason is not allowed; with one, the customer sees it`.
- `the order detail has no edit control`.

**Live check**
- [ ] The full chat, with quick-change notes, reads clearly to someone who wasn't there (UC-07)

### Verify (Phases D and E)

```
cd cake-shop/app && npm run test:e2e
```

---

## Open questions / future extensions

### Q1: Phones

Not designed in iteration 1. A phone layout (chat first, the design as a bottom sheet) was sketched and set aside on 2026-11-13.

### Q2: Templates for Baby and Seasonal

Adding them is catalog data plus, where needed, a new topper drawing. Do it once the 8 templates have been tried with real conversations.

### Q3: Updating devlog 01 and its visuals

Devlog 01 and `data-model.html` still show the first set of columns. §4 here is the current table. Update them when devlog 01 is next reviewed.

---

## Implementation order

1. [x] Workspace skeleton (`app/`, four packages, scripts, `.env.example`)
2. [x] Shared types and the catalog data
3. [x] Design checker with its tests
4. [x] Pricing and servings with their tests
5. [x] Preview: port `cake-preview.js`, add cupcakes and mini, tests
6. [x] SQLite store, migrations, status moves, abandon sweep
7. [x] `applyChange` and the customer routes, with tests
8. [x] Baker routes, session, seed data, with tests
9. [ ] Assistant seam, fake provider, `turn.ts`, with tests
10. [ ] Anthropic provider, prompt, live check
11. [ ] Web: components from the app design
12. [ ] Web: Start and Design studio
13. [ ] Web: Review & confirm and Order status
14. [ ] Web: Baker login, inbox and detail
15. [ ] End-to-end tests, then the live checks of Phases C, D and E
16. [ ] Fill in Outcome, update the README index and process.html

---

## Outcome

<!-- Fill in when Done. -->
