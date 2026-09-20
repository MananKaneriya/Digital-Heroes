# Digital Heroes

Golf performance, charity, and monthly prize-draw platform.

This repository currently implements **Phase A (Foundation)**, **Phase B (Subscriptions)**,
**Phase C (Golf Score Tracking)**, and **Phase D (Charity)** of the Digital Heroes build:
authentication, role-based access control, the full subscription/payment lifecycle,
Stableford score tracking with the rolling-latest-five retention rule, and the charity
system (directory, selection, contribution calculation, independent donations, admin
management). The draw/prize engine and winner/payout tracking are later phases and are
not yet implemented.

## Stack

- **Frontend**: Vite + React + TypeScript SPA (`apps/web`)
- **Backend**: Node.js + Express + TypeScript REST API (`apps/api`)
- **Database & Auth**: Supabase (PostgreSQL + Supabase Auth)
- **Payments**: Stripe (with a built-in, clearly labeled development mock adapter — see below)
- **Shared code**: `packages/shared` — plan configuration, roles, and types used by both apps

## Project layout

```
apps/
  api/    Express API — auth, users, subscriptions, webhooks, golf scores, charities, donations
  web/    React SPA — public site, auth, pricing/checkout, dashboards, score tracker, charity directory
packages/
  shared/ Single source of truth for plan pricing, roles, subscription-status logic,
          Stableford scoring rules, charity contribution rules, and API types
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

1. Create a **new** Supabase project (do not reuse a personal one).
2. Run the SQL files in `apps/api/src/db/migrations/` (in order — `003_golf_scores.sql`
   also creates the `create_golf_score_with_retention` Postgres function the score API
   depends on, and `004_charity.sql` creates the public `charity-media` storage bucket)
   via the Supabase SQL editor or CLI.
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

`apps/web/.env` only needs `VITE_API_URL` (defaults to `http://localhost:4000`). The frontend
never talks to Supabase or Stripe directly — all of that goes through the API.

## Demo credentials

**DEVELOPMENT ONLY — DO NOT USE THESE CREDENTIALS IN PRODUCTION.**

Created by `npm run seed --workspace=apps/api` (requires a real Supabase project connected):

| Role | Email | Password |
|---|---|---|
| Subscriber (active monthly plan) | `subscriber@digitalheroes.dev` | `DevSubscriber123!` |
| Administrator | `admin@digitalheroes.dev` | `DevAdmin123!` |

## What's implemented

- Email/password auth via Supabase Auth, proxied through the API (rate-limited, audited)
- Session refresh and logout
- Role-based access control (`subscriber` / `admin`), enforced server-side
- Subscription plans (monthly/discounted yearly), configurable via the `subscription_plans` table
- Stripe Checkout (or the dev mock equivalent) → subscription activation
- Idempotent webhook processing (duplicate provider events are safely ignored)
- Subscription cancellation (immediate or at period end)
- Server-side subscription-status re-validation on every protected request
- Structured logging, consistent error envelopes, audit log for signup/login/subscription events
- Admin user directory (search + pagination)
- Golf score tracking: create/edit/delete Stableford scores (1–45), one per date, with the
  latest-five-by-date retention rule enforced atomically in the database (see
  `apps/api/src/db/migrations/003_golf_scores.sql`), ownership + admin-override authorization,
  and a subscriber dashboard section with add/edit/delete and inline validation
- Charity system: public directory with search/filter, charity profiles with media and
  upcoming events, homepage featured charity, subscriber charity selection with a
  server-enforced 10% minimum contribution (voluntarily increasable), safe-arithmetic
  contribution calculation recorded automatically at each billing period (initial checkout
  and renewal) and preserved historically even if the subscriber later changes charity,
  independent one-off donations via the same Stripe/dev-mock checkout architecture (fully
  separate from subscriptions/draws/scores), and admin charity/media/event/featured-charity
  management with audit logging
- A bounded 10-second timeout on every Supabase call, so an unreachable/slow database
  degrades to a clean error instead of hanging a request indefinitely

## What's next

The draw/prize engine and winner verification/payout tracking are planned in subsequent
phases per the Digital Heroes implementation order.
