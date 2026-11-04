# Job Board – prototype (iterations 1 and 2)

A small Seek-style job board built in class to demonstrate the web application development process.
The process, decisions, design and test plan are in [`../docs/process.html`](../docs/process.html).

| | |
|---|---|
| Web app | React + TypeScript + React Router, built with Vite (`web/`) |
| Server | Node 22, Express 4, TypeScript (`server/`) |
| Database | SQLite through Knex (file in `server/data/`) |
| API | REST + JSON under `/api/v1`, session cookie `sid` |
| Shared types | `shared/` – the API contract used by both sides |
| Tests | Vitest + supertest (`server/tests/`), Playwright (`e2e/`) |

## Run it

```bash
npm install            # once, from this folder
npm run seed           # creates server/data/jobboard.sqlite and loads the demo data
npm run dev:server     # API on http://localhost:3000
npm run dev:web        # web app on http://localhost:5173 (forwards /api to the server)
```

Single-process, as in production: `npm run build && npm start`, then open http://localhost:3000.

With Docker: `docker build -t job-board .` then `docker run -p 3000:3000 -v job-board-data:/data job-board`
(the demo data is loaded the first time the database is empty).

## AI match scoring (iteration 2)

Seekers write a profile (**My profile**), search, then press **Score these results**. The server asks Claude Haiku 5.5
to read each job, make up to five criteria and score each one against the profile. Scores are kept only in the browser.

1. Copy `.env.example` to `.env` and put your key in `ANTHROPIC_API_KEY` (the file is git-ignored; never commit it).
2. Start the server as above. The log says `Match scoring: Claude Haiku 5.5`.
3. No key, or no network? Set `SCORING_PROVIDER=fake` for a built-in pretend AI (this is what the tests use).
   Without a key and without `fake`, the Score button answers "Scoring is not available right now."

Read the real model by hand with `npm run live-check -w server` (scores a few seeded jobs against the sample profile).

## Demo accounts

Every account uses the password **`demo1234`**. Accounts are pre-created; there is no sign-up in iteration 1.

| Role | Email | Notes |
|---|---|---|
| Job seeker | `alex.chen@example.com` | 10 applications |
| Job seeker | `daniel.okafor@example.com` | no applications (empty state) |
| Employer | `hiring@northwind.example` | Northwind Digital, 5 posts |

The seed data has 6 employers, 8 seekers, 30 jobs and 45 applications (`server/seed/data.ts`).

## Tests

```bash
npm test               # unit + API tests (in-memory database, a few seconds)
npm run test:e2e       # builds the web app, then runs the browser tests in Chrome
npm run typecheck      # TypeScript, all workspaces
npm run verify -- --iteration 2 --notes verify/notes-iteration-2.json   # run the test plan, write the dated result
                                                                        # (needs Chrome on port 9222: playw browser)
```

Test names start with the id from the test plan, e.g. `TC-03-4` or `SEC-3`, so a result can be traced back to
the use case it checks.

## Configuration (environment variables)

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `DB_FILE` | `server/data/jobboard.sqlite` | SQLite file |
| `SESSION_DAYS` | `7` | session lifetime |
| `BCRYPT_ROUNDS` | `10` | password hashing cost |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `SEED_ON_START` | `false` | load demo data if the database is empty |
| `WEB_DIST` | `../web/dist` | folder with the built web app |
| `ANTHROPIC_API_KEY` | – | key for match scoring (server only) |
| `SCORING_PROVIDER` | `anthropic` | `fake` = offline pretend AI |

## Layout

```
server/src/routes        HTTP endpoints (api/v1)
server/src/services      business rules: validation, ownership, duplicate applications
server/src/repositories  all SQL
server/src/middleware    sessions, role checks, error handling
server/src/db            Knex setup and migrations
server/seed              demo data and the seed script
web/src/pages            one file per screen S-01 … S-09
server/src/scoring       match agent, prompt, rules, AI providers (real and fake)
```

A layer calls only the layer below it: pages → `api.ts` → routes → services → repositories → database.
