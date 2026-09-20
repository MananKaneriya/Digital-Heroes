# Digital Heroes

Golf performance tracking, a subscription platform, charity giving, and a monthly
frequency-weighted prize draw with winner verification and payout tracking.

This repository implements the full Digital Heroes build through **Phase H (Production
Hardening)**: authentication and role-based access control, the subscription/payment
lifecycle, Stableford score tracking, the charity system, the monthly draw engine, winner
verification and payout tracking, admin reporting, and a security/integrity hardening pass.

## Stack

- **Frontend**: Vite + React + TypeScript SPA (`apps/web`)
- **Backend**: Node.js + Express + TypeScript REST API (`apps/api`)
- **Database, Auth & Storage**: Supabase (PostgreSQL + Supabase Auth + Supabase Storage)
- **Payments**: Stripe (with a built-in, clearly labeled development mock adapter — see below)
- **Shared code**: `packages/shared` — plan configuration, roles, draw/prize rules, and types
  used by both apps

## Architecture

```
Web (React SPA) --HTTP--> API (Express) --service-role client--> Supabase (PostgreSQL)
                                          --service-role client--> Supabase Storage
```

The frontend never talks to Supabase or Stripe directly. Every read and write goes through
the API, which uses Supabase's **service-role key** for all database and storage access —
Row Level Security (RLS) is enabled on every table as defense-in-depth (so a leaked anon key
can never read or write more than a signed-in user's own rows), but authorization decisions
themselves are enforced in the API layer (`requireAuth` / `requireRole` middleware, plus
ownership checks in the service functions).

## Project layout

```
apps/
  api/    Express API — auth, users, subscriptions, webhooks, golf scores, charities,
          donations, draws, winner verification/payouts, admin reporting
  web/    React SPA — public site, auth, pricing/checkout, dashboards, score tracker,
          charity directory, draw results, admin console
packages/
  shared/ Single source of truth for plan pricing, roles, subscription-status logic,
          Stableford scoring rules, charity contribution rules, draw/prize rules, and
          API types
```

## Getting started

```bash
npm install
npm run build --workspace=packages/shared   # required once, and after any change to packages/shared
```

### Backend

`apps/api/.env` is already populated with **placeholder** values so the server boots without
a real Supabase project:

```bash
npm run dev:api    # http://localhost:4000
npm run test --workspace=apps/api
```

To connect a real Supabase project:

1. Create a **new** Supabase project (do not reuse a personal or production one).
2. Run the SQL files in `apps/api/src/db/migrations/` in order (`001` through `006`). Notable
   ones: `003_golf_scores.sql` creates the `create_golf_score_with_retention` Postgres
   function the score API depends on; `004_charity.sql` creates the **public**
   `charity-media` storage bucket; `005_draws.sql` adds the trigger that makes a published
   draw immutable; `006_winner_verification.sql` creates the **private** `winner-proof`
   storage bucket (no RLS grants — accessed only via short-lived signed URLs generated
   server-side).
3. Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env`.
4. Seed demo data: `npm run seed --workspace=apps/api`.

### Payments

Leave `STRIPE_SECRET_KEY` blank to use the built-in **development mock Stripe adapter**
(`apps/api/src/modules/subscriptions/stripe.provider.dev.ts`). It simulates the full
checkout → active-subscription flow via an in-app `/dev-checkout` page, without needing a
Stripe account. Every event still flows through the same idempotent webhook-processing code
path a real Stripe webhook would use, so business logic is identical either way.

To use real Stripe (test mode), set `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` in
`apps/api/.env`, and point a Stripe CLI or dashboard webhook at
`POST /api/subscriptions/webhook` with `STRIPE_WEBHOOK_SECRET` set accordingly.

### Frontend

```bash
npm run dev:web     # http://localhost:5173
```

`apps/web/.env` only needs `VITE_API_URL` (defaults to `http://localhost:4000`).

## Environment variables

Names only — see `.env.example` for the full annotated list. Never commit a populated
`.env` file or paste real secret values anywhere outside your own local `.env`.

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | API | Database, auth, storage |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | API | Payments (blank = dev mock adapter) |
| `APP_URL`, `API_URL`, `PORT`, `NODE_ENV` | API | App URLs, listen port, environment |
| `CORS_ORIGIN` | API | Comma-separated list of origins allowed to call the API |
| `VITE_API_URL` | Web | Base URL the SPA calls |

## Testing, typecheck, and build

```bash
npm run test --workspace=apps/api    # full backend test suite (Vitest)
npm run build                        # shared -> api -> web, tsc on all three (+ vite build for web)
```

There is no automated frontend test suite; the web app is verified via TypeScript's build-time
checks and manual walkthroughs of the golden paths (public, subscriber, admin) in a browser.

## Demo credentials

**DEVELOPMENT ONLY — DO NOT USE THESE CREDENTIALS IN PRODUCTION.**

Created by `npm run seed --workspace=apps/api` (requires a real Supabase project connected):

| Role | Email | Password |
|---|---|---|
| Subscriber (active monthly plan) | `subscriber@digitalheroes.dev` | `DevSubscriber123!` |
| Administrator | `admin@digitalheroes.dev` | `DevAdmin123!` |

## What's implemented

**Accounts & access**
- Email/password auth via Supabase Auth, proxied through the API (rate-limited, audited)
- Session refresh and logout; role-based access control (`subscriber` / `admin`), enforced
  server-side on every protected route
- Admin user directory (search + pagination)

**Subscriptions & payments**
- Subscription plans (monthly/discounted yearly), configurable via the `subscription_plans`
  table
- Stripe Checkout (or the dev mock equivalent) → subscription activation, with idempotent
  webhook processing (duplicate provider events are safely ignored)
- Subscription cancellation (immediate or at period end) and server-side status
  re-validation on every protected request

**Golf scores**
- Create/edit/delete Stableford scores (1–45), one per date, with the latest-five-by-date
  retention rule enforced atomically in the database, ownership + admin-override
  authorization, and a subscriber dashboard with inline validation

**Charity**
- Public charity directory with search/filter, profiles with media and upcoming events,
  homepage featured charity
- Subscriber charity selection with a server-enforced 10% minimum contribution (voluntarily
  increasable), integer-cents contribution calculation recorded at each billing period and
  preserved historically even if the subscriber later changes charity
- Independent one-off donations via the same checkout architecture, kept fully separate
  from subscriptions/draws/scores (never affects draw eligibility or prize pool)
- Admin charity/media/event/featured-charity management, all audited

**Monthly prize draw**
- Each subscriber's 5 retained scores (1–45) are their draw numbers for that period
- A seeded, reproducible PRNG (`mulberry32`) selects 5 winning numbers, weighted by how
  frequently each number appears among eligible participants that period
- Matches are scored by count of overlapping numbers; 5/4/3-match tiers split the prize pool
  40% / 35% / 25%, with any unclaimed jackpot (no 5-match winner) rolled into the following
  period's pool
- Admin simulate → review → publish workflow; a published draw is immutable at the database
  level (trigger-enforced) — re-simulating only replaces a not-yet-published candidate
- Subscribers see only published results; simulated candidates are admin-only

**Winner verification & payouts**
- A winning match starts a `pending → submitted → approved/rejected` verification state
  machine; only the winner can upload their own proof image (PNG/JPEG/WEBP, ≤5MB), stored in
  a **private** Supabase Storage bucket accessible only via short-lived (5-minute) signed
  URLs handed out to the winner or an admin
- Admin approve/reject with an audited reason; a rejected winner can resubmit
- Payout tracking (`pending/paid/failed`) gated on verification approval before a payout can
  be marked paid — this project tracks payout status; it does not integrate a real bank,
  KYC, or payment-settlement provider
- All verification and payout state transitions are atomic, conditional database updates
  (not read-then-write), so two concurrent admin actions on the same record cannot both
  succeed — the loser gets a clean conflict response, never a silent double-decision

**Reporting & operations**
- Read-only admin reporting: platform overview, per-draw analytics (eligible participants,
  winners by tier, paid/pending amounts), winner analytics (filterable by tier/verification
  status/payout status), subscription analytics, and charity contribution/donation reporting
  — all computed from live records, never estimated or cached
- Structured logging, consistent error envelopes, and an append-only audit log covering
  every meaningful state change (signup/login, subscription changes, score changes, charity
  admin actions, draw simulate/publish, winner verification decisions, payout decisions)
- A bounded 10-second timeout on every Supabase call, so an unreachable/slow database
  degrades to a clean error instead of hanging a request indefinitely

## Development assumptions

These are the concrete rules this build encodes, useful context if extending it:

- One draw period per calendar month; a subscriber's draw numbers are their 5 most recently
  retained Stableford scores (each 1–45) at simulation time, frozen into `draw_entries` so
  later score edits never retroactively change a past draw
- 5 winning numbers are selected per draw, frequency-weighted toward numbers that appear more
  often among that period's eligible participants
- Prize tiers: 5-match, 4-match, 3-match, splitting the configured prize pool 40% / 35% / 25%
  respectively; an unclaimed 5-match jackpot rolls into the next period's 5-match allocation
- A winner's payout cannot be marked "paid" until an admin has approved their proof of
  identity/eligibility (verification-approved gating)
- All monetary values are stored and computed as integer cents — never floating point
- Reporting is read-only and derived from live tables, not a separate analytics store

## Scope & limitations

This is a skill-assessment build, deliberately scoped to avoid infrastructure the project
doesn't need:

- No real bank transfer, KYC provider, or payment-settlement integration — payout status is
  tracked, not executed
- No Kubernetes, microservices, message queues (Redis, etc.), or a separate BI/analytics
  system — a single Express API and a single Postgres database are sufficient at this scale
- No automated frontend test suite; frontend correctness is verified via TypeScript's
  build-time checks and manual browser walkthroughs
- Development/local verification (this repository's own test suite, typecheck, and build)
  is distinct from live verification against a running Supabase project — the latter, when
  performed, is done directly against a dedicated Supabase DEV project and is never a
  substitute for the former in this document
