# cake-shop: The business, what the bakery sells (product catalog)

**Date:** 2026-11-13

**Status:** Design

**Iteration:** Iteration 1, Stage 1 Requirements (see [process.html](../../docs/process.html#i1-requirements))

**Scope:** The bakery's products, defined from the business side before any system design: why people buy cakes, what kinds of cake we make, the designs we offer, how each one can be customized and priced, and the rules that keep every order makeable. Not covered: how the catalog is stored or edited (a later spec), stock and ingredients, kitchen capacity.

**Depends on:** [20261113-01-business-lifecycle.md](20261113-01-business-lifecycle.md) (the order life cycle). **Used by:** [20261113-02-ordering-design-chat.md](20261113-02-ordering-design-chat.md). The Design assistant offers designs from this catalog, and the rule agents check, price and draw them.

**Visual:** [assets/product-catalog.html](assets/product-catalog.html). It shows the product structure, the product lines with a servings ruler, an occasion × product line menu you can click through, the option library, the four levels of rules and a worked example.

---

<!-- ========================= STAGE 1 -- DESIGN ========================= -->

## Context

The ordering flow is clear, but the business behind it is not yet. "We make cakes" is too vague for an AI assistant to make good suggestions, or for rules to check and price an order. A real bakery menu answers four questions: **why** is the customer buying (the occasion), **what** physical cake suits them (the product line and size), **which design** they want (the template), and **what** they can change (the options). This devlog defines that menu for our fictional bakery, so the system can be designed around it.

---

## Initial design

- **Agreed** (discussion, 2026-11-13): People buy cakes for **different occasions** (birthday, wedding and others), and cakes come in **different sizes** (small to big). For each occasion we offer **templates**, and each template has its own **customizations**.
- **Proposed:** The catalog has **four layers plus one tag**:
  1. **Product line**: *what the cake physically is* (cupcakes, mini cake, round cake, number cake, sheet cake, tiered cake). It sets the sizes, base prices, minimum notice and which kinds of options are possible.
  2. **Template**: *a named design* on one product line, such as "Unicorn round". It fixes what makes the design itself (for example the unicorn topper), sets defaults, and says which options the customer may change.
  3. **Options**: *the customizations*, taken from **one shared option library** (size, sponge, filling, finish, colour, decoration, topper, message, dietary, extras). Each option value has a price.
  4. **Design**: *one customer's choices*, a template plus option values. This is what an order holds and what the kitchen makes.
  - **Occasion** is a **tag on templates**, not a layer. One template can serve several occasions (a message mini cake suits a birthday, an anniversary or a thank-you). The occasion is how customers browse and how the assistant chooses what to suggest.
- **Proposed:** **Occasion drives the suggestions, the product line drives the rules.** Notice, sizes, dietary limits and prices belong to the product line, because they come from how the cake is made, not from why it is bought.
- **Proposed:** **Servings drive the size.** Every size states how many it serves (party portions). The assistant turns "about 20 kids" into "sizes that serve 20 or more" across all product lines. That is how it finds several different options (A/B/C in the Ordering chat).
- **Proposed:** **Price = base price of the line and size + the price of each option + extras.** Every number comes from the catalog. For iteration 1 all option prices are flat (→ Q2).
- **Proposed:** Rules sit at **four levels**: shop-wide (never offered), product line (sizes, notice, dietary), template (fixed parts), and option compatibility (for example red velvet can't be gluten-free). The Design checker applies them all.
- **Proposed:** **Seasonal templates** have a date window (for example Christmas templates for pickups from 1 to 24 Dec). Outside the window they are not offered.
- **Proposed:** The **baker owns the catalog**. They add, change or pause templates and prices. A confirmed order keeps its own frozen copy of the design and price, so catalog changes never affect it.

### Product lines

| Line | Sizes (serves, party portions) | Base price | Notice | Option groups | Notes |
|---|---|---|---|---|---|
| **Cupcakes** | box of 6, 12, 24 | $18, $32, $60 | 2 days | sponge, colour, decoration (1), topper (small), dietary | No message on the cupcakes; a message card is an extra |
| **Mini cake** | 4" (2–4) | $28 | 2 days | sponge, filling, colour, decoration (1), message | Short message on top, up to 20 characters |
| **Round cake** | 6" (8), 8" (16), 10" (24) | $40, $60, $85 | 3 days | all groups | Our most flexible line |
| **Number cake** | 1 or 2 characters (12 per character) | $55, $100 | 3 days | sponge, colour, decoration (toppings) | No message, no topper; digits or letters only |
| **Sheet cake** | half (24), full (48) | $70, $120 | 3 days | sponge, filling, colour, decoration, message, printed picture | Best value per slice; easy to cut |
| **Tiered cake** | 2 tiers (30, 50), 3 tiers (80, 120) | $150, $220, $340, $480 | 7 days (3 tiers: 14 days) | all groups, finish required | **No gluten-free**; 3 tiers are delivered and set up only |

### Occasions (tags)

| Occasion | Typical lines | What the designer asks first |
|---|---|---|
| Kids' birthday | round, number, sheet, cupcakes | age, theme or favourite character, number of kids |
| Adult birthday and milestones | round, number, mini, cupcakes | age (milestone?), style (elegant or fun) |
| Wedding and anniversary | tiered, cupcakes, mini | guest count, colour scheme, venue (delivery and setup) |
| Baby and family (shower, gender reveal, christening) | round, cupcakes, tiered | boy, girl or surprise, colours |
| Achievement (graduation, retirement, well done) | sheet, round, cupcakes | what the achievement is, school or team colours |
| Office and events | sheet, cupcakes | headcount, logo (printed picture) |
| Seasonal (Christmas, Easter, Halloween, Valentine's) | round, cupcakes, mini | only offered in its season |
| Just because (thank you, treat) | mini, cupcakes, round | who it is for, a short message |

### Example templates (fictional, about 20)

| Template | Line | Occasions | Fixed | Customer can change |
|---|---|---|---|---|
| Unicorn round | Round | Kids' birthday | unicorn topper | size, sponge, filling, colour, 2 decorations, message, dietary |
| Dinosaur round | Round | Kids' birthday | dinosaur topper, green palette | size, sponge, filling, shade of green, message, dietary |
| Football pitch | Sheet | Kids' birthday, Achievement | green pitch with goals | size, sponge, team colours, message |
| Sweet number | Number | Kids' birthday, Adult birthday | sweets on top | digits, sponge, colour |
| Rainbow cupcakes | Cupcakes | Kids' birthday, Office | rainbow sprinkles | box size, sponge, dietary |
| Drip cake | Round | Adult birthday | drip | size, sponge, filling, colour, drip colour, topper, message |
| Milestone number | Number | Adult birthday | gold leaf and macarons | digits, sponge, colour |
| Message mini | Mini | Adult birthday, Wedding and anniversary, Just because | piped message on top | sponge, filling, colour, message |
| Classic white tiered | Tiered | Wedding and anniversary | white fondant, ribbon | tiers and size, sponge per tier, flowers |
| Rustic semi-naked | Tiered | Wedding and anniversary | semi-naked finish, fresh flowers | tiers and size, sponge per tier, flower colours |
| Cupcake tower | Cupcakes | Wedding and anniversary, Baby | tower stand, white frosting | box size (24 and more), sponge, flower colour |
| Gender reveal | Round | Baby | secret colour inside | size, sponge, outside colour, message |
| Christening tiered | Tiered | Baby | 2 tiers, white, cross or dove topper | size, sponge, message |
| Grad cap | Round | Achievement | graduation cap topper | size, sponge, colour (school colours), message |
| Picture sheet | Sheet | Office, Achievement, Kids' birthday | a printed picture: a logo the customer owns, or one from our picture library (unicorn, dinosaur, football…) | size, sponge, frosting colour, sprinkles, message, dietary |
| Snowy Christmas | Round | Seasonal (1–24 Dec) | white frosting, snowflakes | size, sponge, message |
| Easter nest cupcakes | Cupcakes | Seasonal (Easter weeks) | chocolate nest and eggs | box size, sponge |
| Fruit-topped round | Round | Just because, Adult birthday | fresh fruit on top | size, sponge, filling, message, dietary |
| Love mini | Mini | Wedding and anniversary, Just because | heart in rosettes | sponge, colour, short message |
| Baby shower cupcakes | Cupcakes | Baby | pastel rosettes | box size, sponge, pastel colour, dietary |
| Team cupcakes | Cupcakes | Office | company colours | box size, sponge, two colours, dietary |

### Option library (shared)

| Group | Values (price) | Limits |
|---|---|---|
| Size | per line, see above | sets the base price |
| Sponge | vanilla, chocolate, lemon (free); red velvet (+$8), carrot (+$8) | tiered: one sponge per tier |
| Filling | buttercream (free); jam (+$4), chocolate ganache (+$8), lemon curd (+$6) | not for cupcakes or number cakes |
| Finish | buttercream (free); semi-naked (free); fondant (+$30) | fondant: round and tiered only |
| Colour | 8 frosting colours (free) | template may limit the palette |
| Decoration | sprinkles (free); drip (+$10); rosettes (+$8); fresh flowers (+$15); macarons (+$14); fruit (+$10); gold leaf (+$12) | at most 2 (1 on cupcakes and minis) |
| Topper | theme topper: unicorn, dinosaur, crown, grad cap (+$12); number candles (+$4) | not on number cakes or sheets |
| Message | piped message (free) | length set by the line: 20 (mini), 30 (round, tiered), 40 (sheet) |
| Printed picture | edible print of a picture the customer owns (+$12) | sheet and round only; no photos of people |
| Dietary | gluten-free (+$15); vegan (+$15, vanilla or chocolate sponge only) | not on tiered cakes; not red velvet |
| Extras | candles (+$3), message card (+$2), gift box (+$5), delivery in the local area (+$10), setup at the venue (+$25, tiered only) | |

### Rules, four levels

1. **Shop-wide (never offered):** 3D sculpted shapes, likenesses of real people (sculpted or printed), more than 3 tiers, alcohol in the cake, delivery outside the local area, orders with less than 2 days' notice.
2. **Product line:** sizes, minimum notice, which option groups apply, dietary limits (for example tiered cakes can't be gluten-free).
3. **Template:** fixed parts can't be removed (a Unicorn round always has the unicorn topper), a narrowed palette, and a seasonal date window.
4. **Option compatibility:** red velvet can't be gluten-free or vegan, fondant only on round and tiered, a printed picture only on sheet and round, at most 2 decorations.

### Worked example

*"Unicorn cake for my daughter's 7th birthday, about 20 kids, gluten-free, pickup Sat 21 Nov."*

1. **Occasion:** Kids' birthday. **Servings:** 20 or more. **Dietary:** gluten-free. **Notice:** 8 days.
2. **Lines that fit:** round 10" (24), number cake with 2 characters (24), half sheet (24), cupcakes box of 24. Not tiered: it can't be gluten-free.
3. **Templates tagged Kids' birthday on those lines:** Unicorn round ✓, Picture sheet with the unicorn picture ✓, Rainbow cupcakes (possible, but no unicorn), Sweet number (✗: "7" is one character and serves only 12), Dinosaur round and Football pitch (✗: wrong theme).
4. **Options offered:** A Unicorn round in white, B Unicorn round in purple with a rainbow drip, C Picture sheet (half) with the unicorn picture. Each comes with its price from the catalog. These are the three options in the Ordering chat.

---

## Use cases

| Id | Actor | Goal | Priority (MoSCoW) |
|---|---|---|---|
| UC-C1 | Customer | Tell the assistant the occasion, the number of guests and the date, and get suitable designs | Must |
| UC-C2 | Customer | See what can be changed on a design and what each change costs | Must |
| UC-C3 | Customer | Browse templates by occasion | Could |
| UC-C4 | Baker | Add, change or pause a template or a price | Should (by editing the catalog file in iteration 1) |
| UC-C5 | Baker | Offer seasonal templates only in their season | Could |

### Coverage and gaps

Covered: the product structure, sizes and servings, prices, options and the rules that limit them. Left out on purpose: fully custom cakes outside the catalog (→ Q1), ingredient stock, kitchen capacity, and a screen for editing the catalog.

---

## Open questions

All settled on 2026-11-13 (see [20261113-04-ordering-app-build.md](20261113-04-ordering-app-build.md#decisions-settled-here-2026-11-13)): Q1 not in iteration 1, Q2 flat prices, Q3 party portions with wedding portions shown for weddings, Q4 all six lines, the full option library and 8 templates.

### Q1: Fully custom requests

Some customers will want something no template covers. **Proposed:** not in iteration 1. The assistant says what we can't do and offers the nearest templates. A "custom request" path that goes straight to the baker could come later.

### Q2: Should option prices scale with size?

Fondant or gluten-free costs more on a large cake than on a small one. **Proposed:** flat prices in iteration 1 for simplicity. Later: a price per size band (small, medium, large).

### Q3: Party portions and wedding portions

Wedding slices are usually thinner, so the same cake serves more guests (roughly 1.5 times). **Proposed:** sizes state party portions. For the Wedding occasion, the assistant also shows the wedding-portion number.

### Q4: How much of the catalog to build for iteration 1

**Proposed:** all six product lines and the full option library, but only about 8 templates (2 per main occasion), so the preview pictures stay manageable. The Ordering demo currently uses 4 templates as a subset.

---

## Outcome

<!-- Fill in when Done. -->
