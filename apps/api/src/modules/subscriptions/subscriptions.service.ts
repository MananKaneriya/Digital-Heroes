import {
  effectiveStatus,
  mapStripeStatus,
  type PlanCode,
  type SubscriptionDTO,
  type SubscriptionPlanDTO,
} from "@digital-heroes/shared";
import { env, stripeIsConfigured } from "../../config/env.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";
import { recordAudit } from "../audit/audit.service.js";
import { claimPaymentEvent, markPaymentEventProcessed } from "../payments/paymentEvents.service.js";
import { recordContributionForPeriod } from "../charities/charities.service.js";
import { subscriptionProvider, type ProviderEvent } from "./stripe.provider.js";
import { completeMockCheckout } from "./stripe.provider.dev.js";

const webhookLog = categoryLogger("webhook");

interface PlanRow {
  id: string;
  code: PlanCode;
  name: string;
  billing_interval: "month" | "year";
  price_cents: number;
  currency: string;
  description: string;
  is_active: boolean;
}

function planRowToDTO(row: PlanRow): SubscriptionPlanDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    billingInterval: row.billing_interval,
    priceCents: row.price_cents,
    currency: row.currency,
    description: row.description,
    isActive: row.is_active,
  };
}

export async function listPlans(): Promise<SubscriptionPlanDTO[]> {
  const { data, error } = await supabaseAdmin
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });
  if (error) throw AppError.internal("Failed to load subscription plans.");
  return (data as PlanRow[]).map(planRowToDTO);
}

async function getPlanByCode(code: PlanCode): Promise<PlanRow> {
  const { data, error } = await supabaseAdmin
    .from("subscription_plans")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();
  if (error || !data) throw AppError.validation(`Unknown or inactive plan: ${code}`);
  return data as PlanRow;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  subscription_plans: { code: PlanCode } | null;
}

function subscriptionRowToDTO(row: SubscriptionRow): SubscriptionDTO {
  const rawStatus = row.status as SubscriptionDTO["status"];
  return {
    id: row.id,
    planCode: row.subscription_plans?.code ?? "monthly",
    status: effectiveStatus(rawStatus, row.current_period_end),
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: row.created_at,
  };
}

export async function getMySubscription(userId: string): Promise<SubscriptionDTO | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*, subscription_plans(code)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw AppError.internal("Failed to load subscription.");
  if (!data) return null;
  return subscriptionRowToDTO(data as unknown as SubscriptionRow);
}

/** Server-side source of truth for access control — never trust a client-supplied flag (PRD §5.4). */
export async function hasActiveAccess(userId: string): Promise<boolean> {
  const subscription = await getMySubscription(userId);
  if (!subscription) return false;
  return subscription.status === "active" || subscription.status === "past_due";
}

async function getOrCreateStripeCustomerId(userId: string, email: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("payment_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = await subscriptionProvider.getOrCreateCustomer(userId, email, existing?.stripe_customer_id ?? null);

  if (!existing) {
    await supabaseAdmin.from("payment_customers").insert({ user_id: userId, stripe_customer_id: customerId });
  }
  return customerId;
}

export async function startCheckout(
  userId: string,
  email: string,
  planCode: PlanCode,
): Promise<{ url: string; sessionId: string; provider: "stripe" | "dev-mock" }> {
  const plan = await getPlanByCode(planCode);
  const stripeCustomerId = await getOrCreateStripeCustomerId(userId, email);

  const result = await subscriptionProvider.createCheckoutSession({
    userId,
    email,
    planCode,
    priceCents: plan.price_cents,
    currency: plan.currency,
    stripeCustomerId,
    successUrl: `${env.APP_URL}/dashboard?checkout=success`,
    cancelUrl: `${env.APP_URL}/pricing?checkout=canceled`,
  });

  return { ...result, provider: subscriptionProvider.name };
}

export function computePeriodEnd(interval: "month" | "year", from = new Date()): Date {
  const end = new Date(from);
  if (interval === "year") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

async function upsertSubscription(params: {
  userId: string;
  planCode: PlanCode;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const plan = await getPlanByCode(params.planCode);

  const { data: before } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: params.userId,
      plan_id: plan.id,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      status: params.status,
      current_period_end: params.currentPeriodEnd.toISOString(),
      cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
    },
    { onConflict: "user_id" },
  );
  if (error) throw AppError.internal("Failed to persist subscription state.");

  await recordAudit({
    actorId: params.userId,
    actorRole: "subscriber",
    action: before ? "subscription.updated" : "subscription.created",
    entityType: "subscription",
    entityId: params.userId,
    previousState: before ?? undefined,
    newState: { status: params.status, planCode: params.planCode },
  });
}

async function findSubscriptionByStripeId(stripeSubscriptionId: string) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, status, current_period_end, subscription_plans(price_cents)")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  return data as
    | { user_id: string; status: string; current_period_end: string | null; subscription_plans: { price_cents: number } | null }
    | null;
}

async function handleCheckoutCompleted(object: Record<string, unknown>): Promise<void> {
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const userId = (object.client_reference_id as string | undefined) ?? metadata.userId;
  const planCode = metadata.planCode as PlanCode | undefined;
  const stripeCustomerId = object.customer as string;
  const stripeSubscriptionId = object.subscription as string;

  if (!userId || !planCode || !stripeCustomerId || !stripeSubscriptionId) {
    webhookLog.error({ object }, "checkout.session.completed missing required fields");
    return;
  }

  const plan = await getPlanByCode(planCode);
  const currentPeriodEnd = computePeriodEnd(plan.billing_interval);
  await upsertSubscription({
    userId,
    planCode,
    stripeCustomerId,
    stripeSubscriptionId,
    status: "active",
    currentPeriodEnd,
  });

  // First billing period's charity contribution, if the subscriber has already
  // selected a charity — a no-op otherwise (PRD §10.1). See charities.service.ts.
  await recordContributionForPeriod(userId, plan.price_cents, currentPeriodEnd);
}

async function handleSubscriptionUpdated(object: Record<string, unknown>): Promise<void> {
  const stripeSubscriptionId = object.id as string;
  const existing = await findSubscriptionByStripeId(stripeSubscriptionId);
  if (!existing) return;

  const status = mapStripeStatus(object.status as string);
  const currentPeriodEndUnix = object.current_period_end as number | undefined;
  const cancelAtPeriodEnd = Boolean(object.cancel_at_period_end);
  const newPeriodEndIso = currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : undefined;

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
      ...(newPeriodEndIso ? { current_period_end: newPeriodEndIso } : {}),
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw AppError.internal("Failed to update subscription.");

  await recordAudit({
    actorId: existing.user_id,
    actorRole: "subscriber",
    action: "subscription.updated",
    entityType: "subscription",
    entityId: existing.user_id,
    previousState: { status: existing.status },
    newState: { status },
  });

  // A renewal (a genuinely new billing period, not just a metadata/status change)
  // generates that period's charity contribution — idempotent on (user_id, period_end),
  // so this is safe even if Stripe redelivers a subscription.updated event.
  const isRenewal = status === "active" && newPeriodEndIso && newPeriodEndIso !== existing.current_period_end;
  if (isRenewal && existing.subscription_plans) {
    await recordContributionForPeriod(existing.user_id, existing.subscription_plans.price_cents, new Date(newPeriodEndIso));
  }
}

async function handleSubscriptionDeleted(object: Record<string, unknown>): Promise<void> {
  const stripeSubscriptionId = object.id as string;
  const existing = await findSubscriptionByStripeId(stripeSubscriptionId);
  if (!existing) return;

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  await recordAudit({
    actorId: existing.user_id,
    actorRole: "subscriber",
    action: "subscription.canceled",
    entityType: "subscription",
    entityId: existing.user_id,
    previousState: { status: existing.status },
    newState: { status: "canceled" },
  });
}

async function handlePaymentFailed(object: Record<string, unknown>): Promise<void> {
  const stripeSubscriptionId = object.subscription as string | undefined;
  if (!stripeSubscriptionId) return;
  const existing = await findSubscriptionByStripeId(stripeSubscriptionId);
  if (!existing) return;

  await supabaseAdmin.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", stripeSubscriptionId);

  await recordAudit({
    actorId: existing.user_id,
    actorRole: "subscriber",
    action: "subscription.payment_failed",
    entityType: "subscription",
    entityId: existing.user_id,
    previousState: { status: existing.status },
    newState: { status: "past_due" },
  });
}

/**
 * Processes a provider event exactly once (PRD §29: idempotent webhook handling —
 * "do not create duplicate subscription/payment records when the same event is
 * delivered more than once"). Shared by the real Stripe webhook route and the
 * dev-mock checkout completion route so business logic never diverges between them.
 */
export async function processProviderEvent(event: ProviderEvent): Promise<{ alreadyProcessed: boolean }> {
  const isNew = await claimPaymentEvent(event);
  if (!isNew) return { alreadyProcessed: true };

  const object = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(object);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(object);
      break;
    default:
      webhookLog.info({ type: event.type }, "unhandled provider event type");
  }

  await markPaymentEventProcessed(event.id);
  return { alreadyProcessed: false };
}

export function verifyAndParseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent {
  return subscriptionProvider.constructWebhookEvent(rawBody, signature);
}

/** Dev-only: resolves a mock checkout session directly, without a real Stripe webhook call. */
export async function devCompleteCheckout(sessionId: string): Promise<SubscriptionDTO | null> {
  if (stripeIsConfigured) {
    throw AppError.forbidden("The dev checkout completion endpoint is disabled when real Stripe keys are configured.");
  }
  const event = completeMockCheckout(sessionId);
  await processProviderEvent(event);
  const userId = (event.data.object.client_reference_id as string) ?? null;
  return userId ? getMySubscription(userId) : null;
}

export async function cancelSubscription(
  userId: string,
  actorRole: string,
  immediately: boolean,
): Promise<SubscriptionDTO> {
  const { data: row, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*, subscription_plans(code)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) throw AppError.notFound("No subscription found to cancel.");
  if (row.status === "canceled") throw AppError.conflict("This subscription is already canceled.");

  await subscriptionProvider.cancelSubscription(row.stripe_subscription_id, !immediately);

  const update = immediately
    ? { status: "canceled", cancel_at_period_end: false }
    : { cancel_at_period_end: true };

  const { error: updateError } = await supabaseAdmin.from("subscriptions").update(update).eq("user_id", userId);
  if (updateError) throw AppError.internal("Failed to cancel subscription.");

  await recordAudit({
    actorId: userId,
    actorRole,
    action: "subscription.cancel_requested",
    entityType: "subscription",
    entityId: userId,
    previousState: { status: row.status, cancelAtPeriodEnd: row.cancel_at_period_end },
    newState: update,
  });

  return getMySubscription(userId) as Promise<SubscriptionDTO>;
}
