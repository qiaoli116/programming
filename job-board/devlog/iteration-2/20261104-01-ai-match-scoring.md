# job-board: AI match scoring of search results

**Date:** 2026-11-04

**Status:** Done

**Iteration:** Iteration 2, Stage 1 Requirements and Stage 2 Design, Design and Spec phases (see [process.html](../../docs/process.html))

**Scope:** After a normal keyword search returns its list, an AI reads each job's criteria, compares them one by one with the job seeker's profile, and shows a score per criterion and an overall match. Not covered: changing how the keyword search itself works, employer-side candidate ranking, and anything about hosting.

**Depends on:** Iteration 1 (UC-01 Search for jobs, UC-02 View job details), [summary report](../../docs/iteration-1/summary-report.html).

---

<!-- ========================= DESIGN PHASE ========================= -->

## Context

Search in iteration 1 is mechanical: keywords and filters pick the jobs, and a fixed rule (for example newest first) orders them. The seeker must open each job and judge for themselves whether they fit. The job text already lists what the employer wants (`requirements`, `description`), but nothing reads it against the seeker. This iteration adds that reading step on top of the existing search.

---

## Initial design

- **Agreed** (discussion, 2026-11-04): The keyword search stays as the first step and produces the result list. The AI works only on that list; it does not search the whole board.
- **Agreed** (discussion, 2026-11-04): For each job, the AI reads the posting, lists its criteria, matches them one by one against the seeker's profile, and gives a score per criterion.
- **Agreed** (discussion, 2026-11-04): **Criteria are not predefined.** There is no fixed list such as skills, location or experience. The AI builds each job's criteria from its own reading of that posting's content, so different jobs get different criteria. The only limit is a **maximum of five** per job.
- **Agreed** (discussion, 2026-11-04): The seeker needs a **profile** to match against. Iteration 1 has none (only name and email), so a profile is part of this iteration. It is **free text written as Markdown**, kept rich on purpose so the AI has plenty of evidence to match against (Q1 resolved). A fictional example is in [sample-profile-alex-chen.md](assets/sample-profile-alex-chen.md).
- **Agreed** (discussion, 2026-11-04): Each criterion is scored on a **four-level scale**: Meets, Partly, Does not meet, Unknown (Q2 resolved).
- **Agreed** (discussion, 2026-11-04): An **overall score** is shown per job, a **simple average** of the criterion levels (Unknown left out), and the list can be re-ordered by it. The keyword order stays the default (Q3 resolved).
- **Agreed** (discussion, 2026-11-04): Each criterion shows a score **and a one-line reason** quoting the profile evidence (or saying it is missing), so the score can be checked, not just trusted (→ Q4).
- **Proposed:** Scoring is **advisory only**. It never hides a job and never blocks applying.
- **Agreed** (discussion, 2026-11-04): Scoring runs when the seeker **clicks a button** on the current list, not automatically on every search. This lets a class see the build stage by stage (Q5 resolved).
- **Agreed** (discussion, 2026-11-04): The AI is **Claude Haiku 5.5**, called from the **server**, behind a replaceable interface, so tests can use a fixed fake and no key reaches the browser (Q6 resolved; see [20261104-02-ai-provider.md](20261104-02-ai-provider.md)).

---

## Use cases

### Map

| Id | Actor | Goal | Priority (MoSCoW) |
|---|---|---|---|
| UC-10 | Job seeker | Keep a profile that describes my skills, experience and preferences | Must |
| UC-11 | Job seeker | Score my search results against my profile | Must |
| UC-12 | Job seeker | See, per job, each criterion with its score and reason | Must |
| UC-13 | Job seeker | Sort the results by match score | Should |
| UC-14 | Job seeker | Understand what happens when scoring fails or my profile is empty | Must |
| UC-15 | Job seeker | Correct my profile after seeing a wrong match | Could |

### UC-11: Score my search results

> As a job seeker, I want the results of my search ranked by how well I fit each job's criteria, so that I spend my time on the jobs I am most likely to get.

| # | User does | Sees |
|---|-----------|------|
| 1 | Searches as in UC-01 | The usual keyword result list |
| 2 | Chooses "Score these results" | A progress state; the list stays visible |
| 3 | Waits | When scoring finishes, each card gains an overall match (for example 7 / 10) |
| 4 | Chooses "Sort by match" (UC-13) | The same jobs, highest match first |

**Note:** Scoring never changes which jobs are in the list, only how they are presented.

### UC-12: See the criteria breakdown

> As a job seeker, I want to see how each criterion was scored, so that I can trust the match and know what I lack.

| # | User does | Sees |
|---|-----------|------|
| 1 | Opens a scored job (or expands its card) | Up to five criteria the AI took from this posting, one per row, each worded by the AI |
| 2 | Reads a row | Criterion, score, and a short reason naming the profile evidence or "not in your profile" |

**Note:** A criterion the profile says nothing about is shown as "unknown", not as zero, so a thin profile is not read as a poor fit. Because criteria differ per job, only the overall score is comparable between jobs, not individual criteria.

### UC-14: Failure and empty cases

| Situation | The seeker sees |
|---|---|
| Profile empty | A prompt to complete the profile first (UC-10); no scoring is run |
| AI unavailable or times out | The unscored list, with a message; keyword results are never lost |
| One job fails | That card says "not scored"; the others still show |
| Posting has little to read (fewer than five clear criteria, or none) | Only the criteria it supports, or "No criteria found"; the AI must not pad to five or invent a score |

(UC-10, UC-13 and UC-15 are detailed when the questions below settle.)

### Privacy notice (applies to UC-10 and UC-11)

The profile page and the "Score these results" button each show a disclaimer that the profile and job descriptions go to an external AI company (Q7).

### Coverage and gaps

Covers the seeker side only. Employers are not affected. Deliberately left out: ranking applicants for employers, learning from the seeker's behaviour, and explaining scores to the employer.

---

## Open questions

### Q1: What is in the profile?

_Resolved (2026-11-04):_ a free-text Markdown profile with no required fields. The seeker maintains it, and the richer it is, the better the matching. The sample profile shows the kind of content to encourage: summary, location and availability, work preferences, experience with concrete results, skills (including what the seeker does not have), education, projects and other facts such as languages and checks. The profile page (UC-10) can show a short hint listing these headings, but the headings are a suggestion, not a form.

_Options considered:_ (a) free text, such as a pasted CV; (b) structured fields (skills list, years, location, work type, salary range). Since the AI chooses the criteria, the profile cannot be shaped around a fixed set of them; it must be rich enough for the AI to find evidence for whatever the posting asks. Free text does that best and is the fastest to build. **Recommendation:** (a), a free-text profile (summary, experience, skills, preferences), with no required fields.

### Q2: What does a criterion score mean?

_Resolved (2026-11-04):_ a **four-level scale** per criterion:

| Level | Meaning |
|---|---|
| Meets | The profile clearly shows it |
| Partly | The profile shows some of it, or something close |
| Does not meet | The profile shows it is missing |
| Unknown | The profile says nothing either way |

_Proposed, for the overall score (→ Q3):_ map the levels to numbers only to compute the overall score, with Meets = 1, Partly = 0.5, Does not meet = 0. Unknown is left out of the average, and the card says how many criteria could be checked (for example "3 of 5 checked"), so a thin profile is not scored as a poor fit.

_Options considered:_ a 0–10 number is easier to sort but harder to explain and to test; a small scale won.

### Q3: How is the overall score built, and does it replace the default order?

_Resolved (2026-11-04):_ a **simple average** of the criterion levels, to show the concept first.

- Meets = 1, Partly = 0.5, Does not meet = 0; **Unknown is left out** of the average (Q2). Overall = sum ÷ number of checked criteria, shown as a percentage or out of 10 (display format is for the Spec phase).
- If every criterion is Unknown, the job has **no overall score** and sorts last in match order.
- Ties keep the keyword order.
- The keyword order stays the default; match order is opt-in (UC-13).
- No weighting for now. **Deferred:** a weighted average, where the AI also marks each criterion as must-have or nice-to-have. Revisit if the sort order feels wrong in use.

_Options considered:_ simple average, weighted average, or an "all must-haves met" gate.

### Q8: How do we keep criteria stable?

_Resolved (2026-11-04):_ **not a concern at this stage.** The goal of this iteration is to see the result and show the concept. The AI may word or choose criteria differently each time it reads the same posting, and that is accepted.

- Making it stable would be prompt engineering or model choice, and is out of scope for now.
- **Deferred idea** (raised in discussion): use a type-safe approach to the AI's output, so it always returns the same shape, which may also reduce made-up results. Name the tool, if any, in the AI provider decision record (Q6).
- Caching by (job version, profile version) in Q5 is kept for cost, not for stability.

### Q4: How much of the reasoning is shown?

_Resolved (2026-11-04):_ **show the reasoning.** Each criterion shows its level and a short reason that names the profile evidence, or says the profile is silent (Unknown). This makes a wrong score visible and fixable (UC-15), at the cost of more AI output.

### Q5: When is scoring run, and is it cached?

_Resolved (2026-11-04):_ **a button runs the scoring.** The search returns the keyword list first; the seeker then clicks "Score these results" (UC-11). Cost is not a concern for the prototype. The reason is the class demonstration: the button lets the audience see the step by step, the plain keyword list first and the AI scoring added on top.

- **Proposed:** **no cache** for now. Each click scores afresh, so the demo always shows a live AI run and a changed profile takes effect straight away. This also fits Q8, where changing results are accepted. Add a cache later only if cost or speed becomes a problem.

_Options considered:_ automatic scoring on every search, or a button with a cache by (job version, profile version).

### Q6: Which AI, and how do we test it?

_Resolved (2026-11-04):_ **Claude Haiku 5.5**, called from the server with structured output. Details, testing with a fake provider, and key handling are in the decision record [20261104-02-ai-provider.md](20261104-02-ai-provider.md). The Jev findings are kept below as the reason it was not chosen.

**Investigated: TypeSafe's Jev (2026-11-04, vendor and press sources, early access).** Jev is a "System One" model: it returns typed answers instead of text. You send a state (text or JSON) and questions of three kinds: **Choice** (pick from options), **Score** (a number in a range you set) and **Noul** (yes/no probability). Every answer comes with a calibrated probability.

- **Scaling a value:** yes. A Score question takes a range such as 0 to 100, and a Choice question with our four levels (Meets, Partly, Does not meet, Unknown) fits directly.
- **Reasoning:** **no.** Jev "gives you a number, not a rationale", and it writes no text. This conflicts with Q4, where each criterion shows a reason naming the profile evidence.
- **Making up the criteria:** **no.** You define the questions yourself; Jev does not write them. This conflicts with the agreed point that the AI builds each job's criteria from the posting.
- **"No hallucination":** it means the answer always fits the schema (a valid level, a number in range). It does not mean the answer is right: the vendor's own benchmark reports about 68% agreement, and one independent yes/no test had a small general model ahead.
- **Practicalities:** fast and cheap (about $0.04 per million input tokens), early access behind a waitlist, and the vendor's own numbers are unverified.

_Proposed:_ Jev cannot do this feature alone, because it can neither write criteria nor explain scores. Use a **general language model with structured (type-checked) output** for the whole job: read the posting, write up to five criteria, give a level and a reason for each, in one fixed shape. That also meets the type-safe idea from Q8. Jev could be tried later as a fast second step that only scores criteria written by another model, but it would lose the reasons.

Still needs a decision record (for example `20261104-02-ai-provider.md`): which model, how the key is held, cost per scored list, and a fake provider for tests. The real model's output is not repeatable, so tests check shape and rules (criteria parsed, scores in range, failures handled), not exact wording. Live scoring is a manual check.

### Q7: Privacy

_Resolved (2026-11-04):_ accepted for the prototype. The profile and the job text are sent to an external AI company (Anthropic) when the seeker scores a list. All data is fictional and this is a test application, so it is not a concern. But the information is part of the design:

- **A disclaimer is shown** wherever the seeker triggers or prepares scoring: next to the "Score these results" button, and on the profile page. Draft wording: "Scoring sends your profile and the job descriptions to an external AI company. Don't enter real personal information."
- The disclaimer is visible without a click (not hidden in a tooltip) and is part of the screen design and the test plan (a check that it is present).
- The profile holds only what the seeker chooses to enter.
- A real product would need more (consent, retention, a privacy policy); that is out of scope here.

---

<!-- ========================= SPEC PHASE ========================= -->

## Design summary

| Concern | Decision |
|---------|----------|
| Profile storage | One Markdown text per seeker, in a new `profiles` table (→ §1) |
| Profile API | `GET` and `PUT /api/v1/me/profile`, seekers only (→ §2) |
| Scoring API | One call, `POST /api/v1/scoring`, with the ids of the jobs on screen; the server scores them in parallel and replies when all are done (→ §2, Q9) |
| The agent | A server module `matchAgent`: per job, build prompt → ask the AI → check the answer → compute the overall score (→ §3, [diagram](assets/agent-architecture.html)) |
| Build level | Level 1, a fixed workflow written from scratch: our code decides every step, the AI only answers ([tutorial](assets/choosing-how-to-build-an-agent.html)) |
| AI access | A `ScoringProvider` interface: `AnthropicProvider` (Haiku 5.5) for real use, `FakeProvider` for all automated tests (→ §4, [decision record](20261104-02-ai-provider.md)) |
| Scoring rules | Meets 1, Partly 0.5, Does not meet 0, Unknown left out; overall = average of the checked ones (→ §3) |
| Failure | Per-job "not scored"; empty profile and missing key are refused up front (→ §2) |
| Where results live | In the web app's memory only; nothing about scores is stored on the server (Q5: no cache) |
| Screens | Profile page, scored search results, scored job detail (→ §5, [mockups](../../docs/iteration-2/static-design/s09-profile.html)) |

---

## §1 Data model

New migration `002_profiles.ts`:

| Column | Type | Rule |
|---|---|---|
| `user_id` | integer, primary key, references `users.id` | One profile per user, so saving replaces it |
| `body` | text, not null | Markdown, at most 20,000 characters |
| `updated_at` | string (ISO date-time), not null | Set by the server on every save |

Shared types (in `shared/src/types.ts`):

```ts
export const MATCH_LEVELS = ['Meets', 'Partly', 'Does not meet', 'Unknown'] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];

export interface Profile { body: string; updatedAt: string | null }   // null when never saved

export interface Criterion { criterion: string; level: MatchLevel; reason: string }

export interface JobScore {
  jobId: number;
  status: 'scored' | 'no_criteria' | 'not_scored';
  criteria: Criterion[];        // 0 to 5; empty unless status is 'scored'
  overall: number | null;       // 0 to 1; null when nothing could be checked
  checked: number;              // criteria whose level is not Unknown
}
```

There is no table for scores: results are computed per click and returned to the browser (Q5).

---

## §2 API

All paths are under `/api/v1`, with the same error shape as iteration 1 (`{ error: { code, message, fields? } }`).

| Method and path | Who | Body | Success | Errors |
|---|---|---|---|---|
| `GET /me/profile` | seeker | none | `200 { profile }` (empty `body` and `updatedAt: null` if never saved) | 401 not signed in, 403 not a seeker |
| `PUT /me/profile` | seeker | `{ body: string }` | `200 { profile }` | 422 `VALIDATION` if `body` is not a string or is over 20,000 characters |
| `POST /scoring` | seeker | `{ jobIds: number[] }` (1 to 20 distinct ids) | `200 { results: JobScore[] }`, one per requested id that exists, in request order | 401, 403; 422 `VALIDATION` for a bad list; 422 `PROFILE_EMPTY` if the saved profile is blank; 503 `SCORING_UNAVAILABLE` if no AI is configured |

Rules for `POST /scoring`:
- **The server loads the jobs and the profile itself.** The browser sends only ids, so it cannot send its own job text or someone else's profile to the AI.
- Ids that match no job are skipped silently (a job could have been removed since the search).
- A failure of one job never fails the request: that job comes back `not_scored`. If every job fails, the reply is still `200` with all `not_scored`, and the web app shows the "AI unavailable" message (UC-14).
- A blank profile means empty or only whitespace. No AI call is made in that case.

---

## §3 The agent (`server/src/scoring/matchAgent.ts`)

Per request, in this fixed order (see the [diagram](assets/agent-architecture.html)):

1. Load the profile; if blank, stop with `PROFILE_EMPTY`.
2. Load the jobs by id.
3. **Fork:** one lane per job, all run in parallel (`Promise.allSettled`), each with a 30-second limit.
4. In each lane: build the prompt, call the provider, check the answer, compute the overall score.
5. **Join:** wait for every lane, put the results in request order, reply.

**Checking the answer** (`checkAnswer`, a pure function). The provider's reply is accepted only if it is a list where each item has a non-empty `criterion`, a `level` that is one of the four, and a non-empty `reason`. Then:
- More than five items → keep the first five (the prompt asks for at most five; this is a safety net, not a re-ask).
- Zero items → `no_criteria`.
- Any invalid item, or a thrown error, or a timeout → the whole job is `not_scored`. We do not repair or retry.

**Overall score** (`overallScore`, a pure function): Meets 1, Partly 0.5, Does not meet 0. Unknown is left out. `overall` = sum ÷ number checked, between 0 and 1. If nothing is checked, `overall` is `null`. The screen shows it out of 10, rounded to a whole number, with "3 of 5 checked" beside it.

**Prompt** (`buildPrompt`, a pure function) contains, in this order: the instructions (read the posting, write at most five criteria that the posting itself asks for, do not pad, give each a level and a one-line reason quoting the profile or saying it is silent, use Unknown when the profile says nothing), then the posting (title, description, requirements), then the profile. The exact wording is tuned during the live check and is not tested for its text, only that it includes the profile and the posting.

---

## §4 AI provider (`server/src/scoring/`)

```ts
export interface ScoringProvider {
  /** Returns the model's raw criteria for one posting. Throws on any failure. */
  scoreJob(prompt: string): Promise<unknown>;
}
```

| Provider | Used when | Behaviour |
|---|---|---|
| `AnthropicProvider` | `ANTHROPIC_API_KEY` is set | Calls `claude-haiku-5-5` through `@anthropic-ai/sdk` with a JSON schema for the criteria list; throws if `stop_reason` is not a normal end (refusal, cut off) |
| `FakeProvider` | `SCORING_PROVIDER=fake`, and in every automated test | Deterministic, offline (rules below) |
| none | neither is set | `POST /scoring` answers `503 SCORING_UNAVAILABLE` |

`createApp({ db, scoring })` takes the provider as an option, so tests pass the fake directly. `config.ts` gains `anthropicApiKey` and `scoringProvider`. `app/.env` is loaded at server start (small loader in `config.ts`; the file is git-ignored and `.env.example` shows the names).

**FakeProvider rules** (so tests can predict the output):
- Criteria are the first five non-empty lines of the posting's `requirements` section of the prompt, as written.
- A criterion is `Meets` if the profile contains the first word of four or more letters from that line (case-insensitive), otherwise `Unknown`. The reason is `Profile mentions "<word>"` or `Profile is silent`.
- If the posting title contains `[FAIL]`, it throws. If it contains `[NONE]`, it returns an empty list. If it contains `[BAD]`, it returns a level outside the four.

---

## §5 Screens (match the approved mockups)

| Screen | Change |
|---|---|
| Header | A "My profile" link for signed-in seekers |
| Profile page `/profile` (seeker only) | A large Markdown text box with a live preview beside it (rendered by a small Markdown library, output sanitised so pasted HTML cannot run), a hint listing the suggested headings, a Save button, a "Saved at ..." line, and the privacy disclaimer (always visible) |
| Search results (`HomePage`) | For a signed-in seeker: a "Score these results" button with the disclaimer beside it. While waiting: the button is disabled and a progress message shows; the list stays visible. After: each card shows its overall match ("7 / 10", "3 of 5 checked") or "not scored". A "Sort by match" toggle appears; off by default |
| Job detail | If the job was scored in this visit: the criteria list (criterion, level badge, reason). Otherwise nothing changes |
| Messages | Empty profile: "Complete your profile first" with a link to `/profile`. All failed: "Scoring is unavailable right now; your results are unchanged." |

Web behaviour:
- Scores are held in a React context (`ScoresProvider`) keyed by job id, so moving from the list to a job and back keeps them. A new search or a page reload clears them.
- "Sort by match" is a stable sort on `overall` descending; `null` and `not_scored` go last; ties keep the keyword order.
- Employers and signed-out visitors see no button and no profile link.

---

## Phase A: Scoring rules (pure functions)

### What to implement

- `shared/src/types.ts`: the types in §1.
- `server/src/scoring/rules.ts`: `overallScore`, `checkAnswer` (→ §3).

### Test plan

**Automated tests** (`server/tests/scoring-rules.test.ts`)
- `overall_is_average_of_checked_levels`: Meets, Partly, Does not meet gives 0.5.
- `overall_ignores_unknown`: Meets, Unknown, Unknown gives 1 with `checked` 1.
- `overall_is_null_when_all_unknown`.
- `check_accepts_a_valid_list_of_five`.
- `check_keeps_only_the_first_five_of_six`.
- `check_empty_list_means_no_criteria`.
- `check_rejects_unknown_level_name`.
- `check_rejects_empty_reason_or_criterion`.
- `check_rejects_non_list_input`.

### Verify

```
npm test -w server
```

---

## Phase B: Provider and agent

### What to implement

- `server/src/scoring/provider.ts`: the `ScoringProvider` interface and `FakeProvider` (→ §4).
- `server/src/scoring/prompt.ts`: `buildPrompt` (→ §3).
- `server/src/scoring/matchAgent.ts`: fork, per-lane steps, join (→ §3).

### Test plan

**Automated tests** (`server/tests/match-agent.test.ts`, fake provider only)
- `prompt_contains_profile_and_posting_text`.
- `scores_every_job_and_keeps_request_order`.
- `lanes_run_in_parallel`: a fake that waits 100 ms per job finishes five jobs in well under 500 ms.
- `one_failing_job_is_not_scored_and_others_still_scored` (`[FAIL]` in a title).
- `invalid_answer_marks_job_not_scored` (`[BAD]`).
- `empty_answer_is_no_criteria` (`[NONE]`).
- `slow_job_times_out_as_not_scored`: a fake that never answers (`[HANG]` in the title), with the limit shortened for the test.
- `more_than_five_requirements_give_at_most_five_criteria`.
- `all_jobs_failing_still_returns_a_result_for_each`.

### Verify

```
npm test -w server
```

---

## Phase C: Profile

### What to implement

- `server/src/db/migrations/002_profiles.ts` (→ §1), a profile repository, and `getProfile` / `saveProfile` services with the 20,000-character limit.
- Routes `GET` and `PUT /me/profile` (→ §2).
- `web/src/pages/ProfilePage.tsx` with the live preview, its route, and the header link (→ §5).

### Test plan

**Automated tests** (`server/tests/profile.test.ts`, API level)
- `seeker_without_profile_gets_empty_profile`.
- `saving_then_reading_returns_the_same_text`.
- `saving_again_replaces_the_profile`.
- `profiles_are_private_to_each_seeker`: another seeker sees their own empty profile.
- `employer_cannot_read_or_save_a_profile` (403).
- `signed_out_visitor_gets_401`.
- `profile_over_20000_characters_is_rejected` (422).
- `non_string_body_is_rejected` (422).

**Browser tests** (`e2e/tests/profile.spec.ts`)
- `preview_renders_markdown_and_strips_scripts`: a heading shows as a heading, and a `<script>` tag typed in the box does nothing.

**Live check**
- [ ] Sign in as the demo seeker, paste the sample profile, save, reload: the text is still there (UC-10).
- [ ] The privacy disclaimer is visible on the profile page without clicking (Q7).

### Verify

```
npm test -w server
npm run typecheck
```

---

## Phase D: Scoring API and the real provider

### What to implement

- Route `POST /scoring` and its service (→ §2), using the agent from Phase B.
- `AnthropicProvider` with the JSON schema, `config.ts` settings and `.env` loading (→ §4). Add `@anthropic-ai/sdk` to the server.

### Test plan

**Automated tests** (`server/tests/scoring-api.test.ts`, fake provider)
- `seeker_scores_a_list_of_jobs`: 200, one result per id, criteria and overall present.
- `blank_profile_returns_profile_empty_and_calls_no_ai`: the fake's call count stays at 0.
- `no_provider_configured_returns_503`.
- `employer_and_signed_out_are_refused`.
- `more_than_20_ids_is_rejected`; `empty_list_is_rejected`; `duplicate_ids_are_rejected`.
- `server_uses_saved_profile_not_one_sent_in_the_request`: extra fields in the body are ignored.
- `one_failing_job_does_not_fail_the_request`.
- `unknown_job_ids_are_skipped` (moved here from Phase B: the agent receives jobs, the service looks them up).
- `scoring_changes_nothing_in_the_database`: counts of jobs and applications are unchanged.

**Live check** (needs a real key; manual)
- [ ] Score the demo seeker's results with the sample profile. Criteria come from each posting, reasons quote the profile or say it is silent, and the levels look sensible (UC-11, UC-12).
- [ ] Remove the key and restart: the button reports scoring unavailable (UC-14).

### Verify

```
npm test -w server
npm run typecheck
```

---

## Phase E: Scored screens

### What to implement

- `ScoresProvider` context, `api.score(jobIds)` in `web/src/api.ts`.
- `HomePage`: button, disclaimer, progress, per-card overall, "Sort by match" (→ §5).
- `JobDetailPage`: criteria list when scored.
- New styles from the mockup stylesheet.

### Test plan

**Automated tests** (browser, `e2e/tests/scoring.spec.ts`, server started with `SCORING_PROVIDER=fake`)
- `seeker_scores_results_and_sees_overall_on_each_card` (UC-11).
- `disclaimer_is_visible_next_to_the_button` (Q7).
- `sort_by_match_orders_highest_first_and_default_order_is_unchanged` (UC-13).
- `job_detail_shows_criteria_with_level_and_reason` (UC-12).
- `empty_profile_shows_complete_your_profile_prompt` (UC-14).
- `failing_job_card_says_not_scored_and_others_show` (UC-14, `[FAIL]` job added in the test data).
- `employer_sees_no_score_button_or_profile_link`.
- `scores_clear_on_new_search`.

**Live check**
- [ ] Compare the page with the three approved mockups, in a narrow window too.

### Verify

```
npm run test:e2e
```

---

## Phase F: Test plan, docs and close

### What to implement

- Add the new tests to the iteration 2 test plan and a manual checklist entry for the live checks.
- Update `docs/process.html` (stages 3 to 6 for iteration 2), the README, and this devlog's Outcome.

### Verify

```
npm run verify
```

---

## Open questions / future extensions

### Q9: One reply, or cards filling in as each job finishes?

UC-11 step 3 says each card gains its score "as its scoring finishes". The simplest design (§2) replies once, after every job is done, so all cards update together. _Agreed (2026-11-04, spec review):_ accept that for now, since it keeps one plain request and one result shape. To get cards filling in one by one, either stream the reply from `POST /scoring`, or have the browser call a per-job endpoint in parallel. Revisit if waiting for the slowest job feels long in the live check. UC-11 step 3 is reworded accordingly.

### Q10: Profile size and the cost of a click

The 20,000-character limit and the 20-job limit are guesses to keep a click cheap and quick. Adjust after the live check.

### Future extensions

- Weighted average (must-have vs nice-to-have), deferred in Q3.
- A cache by (job version, profile version), deferred in Q5.
- Streaming results (Q9), a larger model (decision record), and Jev as a second step.
- UC-15 Correct my profile after a wrong match: today the seeker just edits the profile and scores again.

---

## Implementation order

1. [x] Shared types and `rules.ts` with its tests (Phase A)
2. [x] `FakeProvider`, `buildPrompt`, `matchAgent` with its tests (Phase B)
3. [x] Migration, profile repository, service, routes, tests (Phase C, server)
4. [x] `POST /scoring` with the fake provider and its tests (Phase D, server)
5. [x] Profile page and header link (Phase C, web)
6. [x] `AnthropicProvider`, config and `.env` loading; first live check (Phase D)
7. [x] `ScoresProvider`, search-page button, disclaimer, sort (Phase E)
8. [x] Job detail criteria list (Phase E)
9. [x] Browser tests; compare with mockups (Phase E)
10. [x] Test plan, process.html, README, Outcome (Phase F)

---

## Outcome

Built as designed: UC-10 to UC-14, screens S-09, S-01, S-02, a level-1 fixed-workflow agent (one parallel lane per job, 30 s timeout, validated answers, overall computed in code), Claude Haiku 5.5 behind a provider interface with a fake for tests.

**Tests:** 150 ran, 0 failed; 42 plan items pass (`docs/iteration-2/test-result/test-result-20261104-130858.html`). The manual mockup check (MC2-1) was done by eye and recorded in `app/e2e/verify/notes-iteration-2.json`.

**Live check (real model):** 20 jobs scored in 6.3 s. Reasons quote the profile or say it is silent.

**Observations (not defects; recorded as tickets `docs/iteration-2/tickets/JB-003.html` and `JB-004.html`):**
- With only one criterion checked, the overall is extreme (0 or 10). A plain average has no way to show low confidence.
- The AI sometimes adds generic criteria (for example a cover letter). The prompt could be tuned.

**Fixed along the way:** the level pill stretched in the narrow sidebar (CSS); a browser test lost its scores by reloading the page (it now navigates with the in-app link).

**Next:** weighted criteria, a cache by job and profile version, streaming, UC-15, prompt tuning.
