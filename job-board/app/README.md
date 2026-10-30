# Job Board – iteration 1 prototype

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

## Layout

```
server/src/routes        HTTP endpoints (api/v1)
server/src/services      business rules: validation, ownership, duplicate applications
server/src/repositories  all SQL
server/src/middleware    sessions, role checks, error handling
server/src/db            Knex setup and migrations
server/seed              demo data and the seed script
web/src/pages            one file per screen S-01 … S-08
```

A layer calls only the layer below it: pages → `api.ts` → routes → services → repositories → database.
