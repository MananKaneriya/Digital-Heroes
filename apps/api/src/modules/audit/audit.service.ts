import { supabaseAdmin } from "../../lib/supabase.js";
import { categoryLogger } from "../../lib/logger.js";

const auditLog = categoryLogger("audit");

export interface AuditEntry {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  requestId?: string;
}

/**
 * Records an immutable audit entry for a financial/security-relevant action (PRD §19).
 * `audit_logs` has no UPDATE/DELETE grants for the anon/authenticated roles (see migration
 * 001_foundation.sql) — normal users cannot alter or delete audit history.
 *
 * Audit writes must never block or fail the primary operation; a logging failure is
 * logged itself and swallowed rather than surfaced to the caller.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    previous_state: entry.previousState ?? null,
    new_state: entry.newState ?? null,
    reason: entry.reason ?? null,
    request_id: entry.requestId ?? null,
  });

  if (error) {
    auditLog.error({ err: error, entry }, "failed to write audit log entry");
  }
}
