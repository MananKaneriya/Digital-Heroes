import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";

const webhookLog = categoryLogger("webhook");

/**
 * Shared idempotency ledger for payment-provider webhook events (PRD §12/§40:
 * "payment webhooks must be verified and idempotent"). Both subscription
 * checkout/renewal events and independent-donation checkout events arrive on
 * the same Stripe webhook endpoint and share this one `payment_events` table —
 * extracted here so the claim-and-dedupe logic is written exactly once rather
 * than reimplemented per event consumer (subscriptions.service.ts used to
 * inline this; it now calls this module too).
 *
 * Returns true when this is a new event the caller should process, false when
 * it has already been claimed (a duplicate delivery) and must be skipped.
 */
export async function claimPaymentEvent(event: { id: string; type: string }): Promise<boolean> {
  const { error } = await supabaseAdmin.from("payment_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event,
  });

  if (error) {
    if (error.code === "23505") {
      webhookLog.info({ eventId: event.id, type: event.type }, "duplicate provider event ignored (idempotent)");
      return false;
    }
    throw AppError.internal("Failed to record provider event.");
  }
  return true;
}

export async function markPaymentEventProcessed(eventId: string): Promise<void> {
  await supabaseAdmin.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("stripe_event_id", eventId);
}
