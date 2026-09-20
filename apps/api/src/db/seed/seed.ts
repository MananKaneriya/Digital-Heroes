/**
 * Development seed script.
 *
 * DEVELOPMENT ONLY — DO NOT USE THESE CREDENTIALS IN PRODUCTION.
 *
 * Seeds:
 *  - subscription_plans from the single source of truth in packages/shared/planConfig.ts
 *  - one demo subscriber (with an active monthly subscription already attached)
 *  - one demo administrator
 *  - five clearly-fictional demo golf scores for the demo subscriber, dated in the
 *    past so the "exactly five retained" state is visible immediately, and "today"
 *    is left open so the evaluator can add a sixth score and watch the oldest one
 *    (score_date 20 days ago) get automatically removed by the rolling-five rule.
 *
 * Run with: npm run seed --workspace=apps/api
 */
import { PLAN_DEFAULTS } from "@digital-heroes/shared";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";

const DEMO_SUBSCRIBER = { email: "subscriber@digitalheroes.dev", password: "DevSubscriber123!", fullName: "Sam Subscriber" };
const DEMO_ADMIN = { email: "admin@digitalheroes.dev", password: "DevAdmin123!", fullName: "Alex Admin" };

async function seedPlans() {
  for (const plan of PLAN_DEFAULTS) {
    const { error } = await supabaseAdmin.from("subscription_plans").upsert(
      {
        code: plan.code,
        name: plan.name,
        billing_interval: plan.billingInterval,
        price_cents: plan.priceCents,
        currency: plan.currency,
        description: plan.description,
        is_active: true,
      },
      { onConflict: "code" },
    );
    if (error) throw error;
  }
  logger.info(`Seeded ${PLAN_DEFAULTS.length} subscription plans.`);
}

async function ensureUser(email: string, password: string, fullName: string): Promise<string> {
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
  return data.user.id;
}

async function seedSubscriber(): Promise<string> {
  const userId = await ensureUser(DEMO_SUBSCRIBER.email, DEMO_SUBSCRIBER.password, DEMO_SUBSCRIBER.fullName);

  const { data: plan } = await supabaseAdmin.from("subscription_plans").select("id").eq("code", "monthly").single();
  if (!plan) throw new Error("Monthly plan not seeded yet.");

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: plan.id,
      stripe_customer_id: `cus_demo_${userId}`,
      stripe_subscription_id: `sub_demo_${userId}`,
      status: "active",
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  logger.info(`Seeded demo subscriber: ${DEMO_SUBSCRIBER.email} (active monthly plan)`);
  return userId;
}

/** Fictional demo Stableford rounds — never real player data (PRD §26/§31). */
const DEMO_SCORES: ReadonlyArray<{ daysAgo: number; score: number }> = [
  { daysAgo: 20, score: 31 },
  { daysAgo: 16, score: 35 },
  { daysAgo: 12, score: 28 },
  { daysAgo: 8, score: 40 },
  { daysAgo: 4, score: 33 },
];

async function seedGolfScores(subscriberId: string) {
  const rows = DEMO_SCORES.map(({ daysAgo, score }) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return { user_id: subscriberId, score, score_date: date.toISOString().slice(0, 10) };
  });

  const { error } = await supabaseAdmin.from("golf_scores").upsert(rows, { onConflict: "user_id,score_date" });
  if (error) throw error;
  logger.info(`Seeded ${rows.length} demo golf scores (fictional) for ${DEMO_SUBSCRIBER.email}.`);
}

/** Clearly fictional demo charities (PRD §31: never real organizations or people). */
const DEMO_CHARITIES = [
  {
    slug: "bright-path-childrens-fund",
    name: "Bright Path Children's Fund",
    short_description: "Fictional demo charity — after-school programs and school supplies for kids in need.",
    full_description:
      "Bright Path Children's Fund (fictional demo data) supports after-school enrichment programs, tutoring, and school-supply drives for underserved communities.",
    is_featured: true,
    event: { title: "Bright Path Community Fun Day", days_ahead: 21, description: "A fictional demo community fundraising day.", location: "Community Park (demo)" },
  },
  {
    slug: "ocean-renewal-project",
    name: "Ocean Renewal Project",
    short_description: "Fictional demo charity — coastal cleanup and marine habitat restoration.",
    full_description:
      "Ocean Renewal Project (fictional demo data) runs coastal cleanup events and funds marine habitat restoration research.",
    is_featured: false,
    event: { title: "Ocean Renewal Beach Cleanup", days_ahead: 35, description: "A fictional demo beach cleanup event.", location: "Seaside Beach (demo)" },
  },
  {
    slug: "community-harvest-network",
    name: "Community Harvest Network",
    short_description: "Fictional demo charity — fighting food insecurity through local food banks.",
    full_description:
      "Community Harvest Network (fictional demo data) partners with local food banks to reduce food insecurity in the region.",
    is_featured: false,
    event: null,
  },
] as const;

async function seedCharities(): Promise<string> {
  let featuredCharityId = "";

  for (const c of DEMO_CHARITIES) {
    const { data: charity, error } = await supabaseAdmin
      .from("charities")
      .upsert(
        {
          slug: c.slug,
          name: c.name,
          short_description: c.short_description,
          full_description: c.full_description,
          is_active: true,
          is_featured: c.is_featured,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw error;
    if (c.is_featured) featuredCharityId = charity.id;

    if (c.event) {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + c.event.days_ahead);
      await supabaseAdmin.from("charity_events").insert({
        charity_id: charity.id,
        title: c.event.title,
        description: c.event.description,
        event_date: eventDate.toISOString().slice(0, 10),
        location: c.event.location,
      });
    }
  }

  logger.info(`Seeded ${DEMO_CHARITIES.length} demo charities (fictional).`);
  return featuredCharityId;
}

/** Gives the demo subscriber a charity selection above the 10% minimum to demonstrate the "voluntary increase" flow. */
async function seedCharitySelection(subscriberId: string, charityId: string) {
  if (!charityId) return;
  const { error } = await supabaseAdmin
    .from("charity_selections")
    .upsert({ user_id: subscriberId, charity_id: charityId, contribution_percent: 15 }, { onConflict: "user_id" });
  if (error) throw error;
  logger.info(`Seeded demo charity selection for ${DEMO_SUBSCRIBER.email} (15% contribution).`);
}

async function seedAdmin() {
  const userId = await ensureUser(DEMO_ADMIN.email, DEMO_ADMIN.password, DEMO_ADMIN.fullName);
  const { error } = await supabaseAdmin.from("profiles").update({ role: "admin" }).eq("id", userId);
  if (error) throw error;
  logger.info(`Seeded demo administrator: ${DEMO_ADMIN.email}`);
}

async function main() {
  await seedPlans();
  const subscriberId = await seedSubscriber();
  await seedGolfScores(subscriberId);
  const featuredCharityId = await seedCharities();
  await seedCharitySelection(subscriberId, featuredCharityId);
  await seedAdmin();

  logger.warn("==============================================================");
  logger.warn("DEVELOPMENT ONLY — DO NOT USE THESE CREDENTIALS IN PRODUCTION");
  logger.warn(`Subscriber login: ${DEMO_SUBSCRIBER.email} / ${DEMO_SUBSCRIBER.password}`);
  logger.warn(`Admin login:      ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  logger.warn("==============================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "seed failed");
    process.exit(1);
  });
