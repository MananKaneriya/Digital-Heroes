import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import type { ListUsersQuery, UpdateProfileInput } from "./users.schemas.js";

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string;
}

export async function listUsers(query: ListUsersQuery): Promise<{ users: AdminUserRow[]; total: number }> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query.search) {
    // PostgREST's .or() filter treats `,()` as syntax metacharacters (condition separators
    // and grouping) — strip them from user input so a search term can't alter the filter
    // structure or produce a parse error, rather than trusting the raw value.
    const safeSearch = query.search.replace(/[,()%]/g, " ").trim();
    if (safeSearch) {
      builder = builder.or(`email.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%`);
    }
  }

  const { data, error, count } = await builder;
  if (error) throw AppError.internal("Failed to load users.");

  return {
    users: (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      createdAt: row.created_at,
    })),
    total: count ?? 0,
  };
}

export async function updateOwnProfile(
  userId: string,
  actorRole: string,
  input: UpdateProfileInput,
  requestId: string,
): Promise<void> {
  if (input.fullName === undefined) return;

  const { data: before } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).single();

  const { error } = await supabaseAdmin.from("profiles").update({ full_name: input.fullName }).eq("id", userId);
  if (error) throw AppError.internal("Failed to update profile.");

  await recordAudit({
    actorId: userId,
    actorRole,
    action: "user.profile_updated",
    entityType: "user",
    entityId: userId,
    previousState: before ? { fullName: before.full_name } : undefined,
    newState: { fullName: input.fullName },
    requestId,
  });
}
