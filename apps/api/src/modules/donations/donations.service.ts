import type { IndependentDonationDTO } from "@digital-heroes/shared";
import { env } from "../../config/env.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";
import { recordAudit } from "../audit/audit.service.js";
import { claimPaymentEvent, markPaymentEventProcessed } from "../payments/paymentEvents.service.js";
import { subscriptionProvider, type ProviderEvent } from "../subscriptions/stripe.provider.js";

const webhookLog = categoryLogger("webhook");

interface DonationRow {
  id: string;
  charity_id: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
}

function rowToDTO(row: DonationRow): IndependentDonationDTO {
  return { id: row.id, charityId: row.charity_id, amountCents: row.amount_cents, currency: row.currency, status: row.status, createdAt: row.created_at };
}

/**
 * Independent donations are deliberately isolated from every other financial
 * concept in the product (PRD §7): no subscription row, no charity_contribution
 * row, no draw/prize-pool interaction — just its own table and its own Stripe
 * checkout session, reusing the existing provider architecture (real Stripe or
 * the dev-mock) rather than inventing a second payment integration.
 */
export async function createDonationCheckout(
  userId: string,
  email: string,
  input: { charityId: string; amountCents: number },
): Promise<{ url: string; sessionId: string; provider: "stripe" | "dev-mock" }> {
  const { data: charity, error: charityError } = await supabaseAdmin
    .from("charities")
    .select("id, name, slug, is_active")
    .eq("id", input.charityId)
    .maybeSingle();
  if (charityError) throw AppError.internal("Failed to validate the charity.");
  if (!charity) throw AppError.validation("Choose a valid charity.");
  if (!charity.is_active) throw AppError.validation("This charity is not currently accepting donations.");

  const result = await subscriptionProvider.createDonationCheckoutSession({
    userId,
    email,
    charityId: charity.id,
    charityName: charity.name,
    amountCents: input.amountCents,
    currency: "usd",
    successUrl: `${env.APP_URL}/charities/${charity.slug}?donation=success`,
    cancelUrl: `${env.APP_URL}/charities/${charity.slug}?donation=canceled`,
  });

  const { error } = await supabaseAdmin.from("independent_donations").insert({
    user_id: userId,
    charity_id: charity.id,
    amount_cents: input.amountCents,
    currency: "usd",
    stripe_checkout_session_id: result.sessionId,
    status: "pending",
  });
  if (error) throw AppError.internal("Failed to start the donation.");

  return { ...result, provider: subscriptionProvider.name };
}

/**
 * Handles the `checkout.session.completed` event for a donation-mode session
 * (dispatched here by the shared webhook controller, which distinguishes
 * donation sessions from subscription sessions by `metadata.kind`). Shares the
 * same payment_events idempotency ledger subscriptions use, so a duplicate
 * webhook delivery can never mark a donation "completed" twice.
 */
export async function processDonationEvent(event: ProviderEvent): Promise<void> {
  const isNew = await claimPaymentEvent(event);
  if (!isNew) return;

  if (event.type === "checkout.session.completed") {
    const object = event.data.object;
    const sessionId = object.id as string;

    const { data: donation, error } = await supabaseAdmin
      .from("independent_donations")
      .update({ status: "completed" })
      .eq("stripe_checkout_session_id", sessionId)
      .select("id, user_id, charity_id, amount_cents")
      .maybeSingle();

    if (error) {
      webhookLog.error({ err: error, sessionId }, "failed to mark donation completed");
    } else if (donation) {
      await recordAudit({
        actorId: donation.user_id,
        actorRole: "subscriber",
        action: "donation.completed",
        entityType: "independent_donation",
        entityId: donation.id,
        newState: { charityId: donation.charity_id, amountCents: donation.amount_cents },
      });
    } else {
      webhookLog.warn({ sessionId }, "donation checkout completed for an unknown session");
    }
  }

  await markPaymentEventProcessed(event.id);
}

export async function listMyDonations(userId: string): Promise<IndependentDonationDTO[]> {
  const { data, error } = await supabaseAdmin
    .from("independent_donations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw AppError.internal("Failed to load your donation history.");
  return (data as DonationRow[]).map(rowToDTO);
}
