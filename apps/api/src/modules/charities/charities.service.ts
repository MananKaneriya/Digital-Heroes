import {
  calculateContributionCents,
  type CharityContributionDTO,
  type CharityDTO,
  type CharityEventDTO,
  type CharityMediaDTO,
  type CharitySelectionDTO,
} from "@digital-heroes/shared";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";
import { recordAudit } from "../audit/audit.service.js";

const appLog = categoryLogger("app");
const CHARITY_MEDIA_BUCKET = "charity-media";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CharityRow {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  full_description: string;
  logo_path: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

interface MediaRow {
  id: string;
  charity_id: string;
  storage_path: string;
  media_type: "image";
  alt_text: string | null;
  display_order: number;
}

interface EventRow {
  id: string;
  charity_id: string;
  title: string;
  description: string;
  event_date: string;
  location: string | null;
  is_active: boolean;
}

function publicMediaUrl(storagePath: string): string {
  return supabaseAdmin.storage.from(CHARITY_MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

function charityRowToDTO(row: CharityRow): CharityDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    logoUrl: row.logo_path ? publicMediaUrl(row.logo_path) : null,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mediaRowToDTO(row: MediaRow): CharityMediaDTO {
  return {
    id: row.id,
    charityId: row.charity_id,
    url: publicMediaUrl(row.storage_path),
    mediaType: row.media_type,
    altText: row.alt_text,
    displayOrder: row.display_order,
  };
}

function eventRowToDTO(row: EventRow): CharityEventDTO {
  return {
    id: row.id,
    charityId: row.charity_id,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    location: row.location,
    isActive: row.is_active,
  };
}

/** Resolves a route param that may be either a charity UUID or its slug into a row id. */
async function resolveCharityId(idOrSlug: string, includeInactive: boolean): Promise<string> {
  let builder = supabaseAdmin.from("charities").select("id").eq(UUID_RE.test(idOrSlug) ? "id" : "slug", idOrSlug);
  if (!includeInactive) builder = builder.eq("is_active", true);
  const { data, error } = await builder.maybeSingle();
  if (error) throw AppError.internal("Failed to look up charity.");
  if (!data) throw AppError.notFound("Charity not found.");
  return data.id;
}

export async function listCharities(query: {
  page: number;
  pageSize: number;
  search?: string;
  hasUpcomingEvents?: boolean;
  includeInactive: boolean;
}): Promise<{ charities: CharityDTO[]; total: number }> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabaseAdmin.from("charities").select("*", { count: "exact" }).order("name", { ascending: true });
  if (!query.includeInactive) builder = builder.eq("is_active", true);

  if (query.search) {
    const safeSearch = query.search.replace(/[,()%]/g, " ").trim();
    if (safeSearch) builder = builder.or(`name.ilike.%${safeSearch}%,short_description.ilike.%${safeSearch}%`);
  }

  if (query.hasUpcomingEvents) {
    const { data: withEvents } = await supabaseAdmin
      .from("charity_events")
      .select("charity_id")
      .eq("is_active", true)
      .gte("event_date", new Date().toISOString().slice(0, 10));
    const charityIds = [...new Set((withEvents ?? []).map((r) => r.charity_id))];
    if (charityIds.length === 0) return { charities: [], total: 0 };
    builder = builder.in("id", charityIds);
  }

  const { data, error, count } = await builder.range(from, to);
  if (error) throw AppError.internal("Failed to load charities.");
  return { charities: (data as CharityRow[]).map(charityRowToDTO), total: count ?? 0 };
}

export async function getCharityProfile(
  idOrSlug: string,
  includeInactive: boolean,
): Promise<{ charity: CharityDTO; media: CharityMediaDTO[] }> {
  const charityId = await resolveCharityId(idOrSlug, includeInactive);

  const { data: charityRow, error: charityError } = await supabaseAdmin
    .from("charities")
    .select("*")
    .eq("id", charityId)
    .single();
  if (charityError || !charityRow) throw AppError.notFound("Charity not found.");

  const { data: mediaRows, error: mediaError } = await supabaseAdmin
    .from("charity_media")
    .select("*")
    .eq("charity_id", charityId)
    .order("display_order", { ascending: true });
  if (mediaError) throw AppError.internal("Failed to load charity media.");

  return { charity: charityRowToDTO(charityRow as CharityRow), media: (mediaRows as MediaRow[]).map(mediaRowToDTO) };
}

export async function listCharityEvents(idOrSlug: string, includeInactive: boolean): Promise<CharityEventDTO[]> {
  const charityId = await resolveCharityId(idOrSlug, includeInactive);
  let builder = supabaseAdmin.from("charity_events").select("*").eq("charity_id", charityId).order("event_date", { ascending: true });
  if (!includeInactive) builder = builder.eq("is_active", true);
  const { data, error } = await builder;
  if (error) throw AppError.internal("Failed to load charity events.");
  return (data as EventRow[]).map(eventRowToDTO);
}

export async function getFeaturedCharity(): Promise<CharityDTO | null> {
  const { data, error } = await supabaseAdmin.from("charities").select("*").eq("is_featured", true).eq("is_active", true).maybeSingle();
  if (error) throw AppError.internal("Failed to load the featured charity.");
  return data ? charityRowToDTO(data as CharityRow) : null;
}

export async function getMySelection(userId: string): Promise<CharitySelectionDTO | null> {
  const { data, error } = await supabaseAdmin
    .from("charity_selections")
    .select("charity_id, contribution_percent, effective_from, charities(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw AppError.internal("Failed to load your charity selection.");
  if (!data) return null;
  return {
    charityId: data.charity_id,
    charityName: (data.charities as unknown as { name: string } | null)?.name ?? "",
    contributionPercent: Number(data.contribution_percent),
    effectiveFrom: data.effective_from,
  };
}

export async function selectCharity(
  userId: string,
  input: { charityId: string; contributionPercent: number },
  requestId: string,
): Promise<CharitySelectionDTO> {
  const { data: charity, error: charityError } = await supabaseAdmin
    .from("charities")
    .select("id, name, is_active")
    .eq("id", input.charityId)
    .maybeSingle();
  if (charityError) throw AppError.internal("Failed to validate the charity.");
  if (!charity) throw AppError.validation("Choose a valid charity.");
  if (!charity.is_active) throw AppError.validation("This charity is not currently accepting new supporters.");

  const { data: before } = await supabaseAdmin
    .from("charity_selections")
    .select("charity_id, contribution_percent")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("charity_selections").upsert(
    {
      user_id: userId,
      charity_id: input.charityId,
      contribution_percent: input.contributionPercent,
      effective_from: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw AppError.internal("Failed to save your charity selection.");

  await recordAudit({
    actorId: userId,
    actorRole: "subscriber",
    action: before ? "charity.selection_updated" : "charity.selection_created",
    entityType: "charity_selection",
    entityId: userId,
    previousState: before ?? undefined,
    newState: { charityId: input.charityId, contributionPercent: input.contributionPercent },
    requestId,
  });

  return {
    charityId: input.charityId,
    charityName: charity.name,
    contributionPercent: input.contributionPercent,
    effectiveFrom: new Date().toISOString(),
  };
}

/**
 * Generates the historical charity_contribution record for one billing period
 * (PRD §10.1). Idempotent: the (user_id, period_end) unique constraint means a
 * duplicate call for a period that already has a record is a silent no-op,
 * never a duplicate row — the same pattern used for payment-event webhooks.
 * If the subscriber has never selected a charity, there is nothing to record.
 */
export async function recordContributionForPeriod(
  userId: string,
  subscriptionAmountCents: number,
  periodEnd: Date,
  requestId?: string,
): Promise<void> {
  const { data: selection, error: selectionError } = await supabaseAdmin
    .from("charity_selections")
    .select("charity_id, contribution_percent")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectionError) {
    appLog.error({ err: selectionError, userId }, "failed to load charity selection for contribution recording");
    return;
  }
  if (!selection) return;

  const contributionPercent = Number(selection.contribution_percent);
  const contributionCents = calculateContributionCents(subscriptionAmountCents, contributionPercent);

  const { error } = await supabaseAdmin.from("charity_contributions").insert({
    user_id: userId,
    charity_id: selection.charity_id,
    contribution_percent: contributionPercent,
    subscription_amount_cents: subscriptionAmountCents,
    contribution_cents: contributionCents,
    period_end: periodEnd.toISOString(),
  });

  if (error) {
    if (error.code === "23505") return; // already recorded for this billing period
    appLog.error({ err: error, userId }, "failed to record charity contribution");
    return;
  }

  await recordAudit({
    actorId: userId,
    actorRole: "subscriber",
    action: "charity.contribution_recorded",
    entityType: "charity_contribution",
    entityId: userId,
    newState: {
      charityId: selection.charity_id,
      contributionPercent,
      subscriptionAmountCents,
      contributionCents,
      periodEnd: periodEnd.toISOString(),
    },
    requestId,
  });
}

export async function listMyContributions(userId: string): Promise<CharityContributionDTO[]> {
  const { data, error } = await supabaseAdmin
    .from("charity_contributions")
    .select("id, charity_id, contribution_percent, subscription_amount_cents, contribution_cents, period_end, created_at, charities(name)")
    .eq("user_id", userId)
    .order("period_end", { ascending: false });
  if (error) throw AppError.internal("Failed to load your contribution history.");

  return (data ?? []).map((row) => ({
    id: row.id,
    charityId: row.charity_id,
    charityName: (row.charities as unknown as { name: string } | null)?.name ?? "",
    contributionPercent: Number(row.contribution_percent),
    subscriptionAmountCents: row.subscription_amount_cents,
    contributionCents: row.contribution_cents,
    periodEnd: row.period_end,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminListCharities(query: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{ charities: CharityDTO[]; total: number }> {
  return listCharities({ ...query, includeInactive: true });
}

export async function createCharity(
  actorId: string,
  input: { name: string; slug: string; shortDescription: string; fullDescription: string },
  requestId: string,
): Promise<CharityDTO> {
  const { data, error } = await supabaseAdmin
    .from("charities")
    .insert({ name: input.name, slug: input.slug, short_description: input.shortDescription, full_description: input.fullDescription })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw AppError.conflict("A charity with that slug already exists.");
    throw AppError.internal("Failed to create the charity.");
  }

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.created",
    entityType: "charity",
    entityId: data.id,
    newState: { name: input.name, slug: input.slug },
    requestId,
  });

  return charityRowToDTO(data as CharityRow);
}

export async function updateCharity(
  actorId: string,
  charityId: string,
  input: Partial<{ name: string; slug: string; shortDescription: string; fullDescription: string; isActive: boolean }>,
  requestId: string,
): Promise<CharityDTO> {
  const { data: before, error: beforeError } = await supabaseAdmin.from("charities").select("*").eq("id", charityId).maybeSingle();
  if (beforeError) throw AppError.internal("Failed to load the charity.");
  if (!before) throw AppError.notFound("Charity not found.");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription;
  if (input.fullDescription !== undefined) patch.full_description = input.fullDescription;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabaseAdmin.from("charities").update(patch).eq("id", charityId).select("*").single();
  if (error) {
    if (error.code === "23505") throw AppError.conflict("A charity with that slug already exists.");
    throw AppError.internal("Failed to update the charity.");
  }

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: input.isActive === false ? "charity.deactivated" : input.isActive === true ? "charity.activated" : "charity.updated",
    entityType: "charity",
    entityId: charityId,
    previousState: { name: before.name, slug: before.slug, isActive: before.is_active },
    newState: patch,
    requestId,
  });

  return charityRowToDTO(data as CharityRow);
}

export async function setFeaturedCharity(actorId: string, charityId: string | null, requestId: string): Promise<void> {
  const { data: currentlyFeatured } = await supabaseAdmin.from("charities").select("id").eq("is_featured", true).maybeSingle();

  if (currentlyFeatured && currentlyFeatured.id !== charityId) {
    await supabaseAdmin.from("charities").update({ is_featured: false }).eq("id", currentlyFeatured.id);
  }

  if (charityId) {
    const { data: target, error } = await supabaseAdmin.from("charities").select("id, is_active").eq("id", charityId).maybeSingle();
    if (error) throw AppError.internal("Failed to load the charity.");
    if (!target) throw AppError.notFound("Charity not found.");
    if (!target.is_active) throw AppError.validation("Only an active charity can be featured.");

    const { error: updateError } = await supabaseAdmin.from("charities").update({ is_featured: true }).eq("id", charityId);
    if (updateError) throw AppError.internal("Failed to set the featured charity.");
  }

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.featured_set",
    entityType: "charity",
    entityId: charityId,
    previousState: { previouslyFeaturedCharityId: currentlyFeatured?.id ?? null },
    newState: { featuredCharityId: charityId },
    requestId,
  });
}

export async function createEvent(
  actorId: string,
  charityId: string,
  input: { title: string; description: string; eventDate: string; location?: string },
  requestId: string,
): Promise<CharityEventDTO> {
  const { data: charity } = await supabaseAdmin.from("charities").select("id").eq("id", charityId).maybeSingle();
  if (!charity) throw AppError.notFound("Charity not found.");

  const { data, error } = await supabaseAdmin
    .from("charity_events")
    .insert({ charity_id: charityId, title: input.title, description: input.description, event_date: input.eventDate, location: input.location ?? null })
    .select("*")
    .single();
  if (error) throw AppError.internal("Failed to create the event.");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.event_created",
    entityType: "charity_event",
    entityId: data.id,
    newState: { charityId, title: input.title, eventDate: input.eventDate },
    requestId,
  });

  return eventRowToDTO(data as EventRow);
}

export async function updateEvent(
  actorId: string,
  eventId: string,
  input: Partial<{ title: string; description: string; eventDate: string; location: string; isActive: boolean }>,
  requestId: string,
): Promise<CharityEventDTO> {
  const { data: before } = await supabaseAdmin.from("charity_events").select("*").eq("id", eventId).maybeSingle();
  if (!before) throw AppError.notFound("Event not found.");

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.eventDate !== undefined) patch.event_date = input.eventDate;
  if (input.location !== undefined) patch.location = input.location;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { data, error } = await supabaseAdmin.from("charity_events").update(patch).eq("id", eventId).select("*").single();
  if (error) throw AppError.internal("Failed to update the event.");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.event_updated",
    entityType: "charity_event",
    entityId: eventId,
    previousState: { title: before.title, eventDate: before.event_date, isActive: before.is_active },
    newState: patch,
    requestId,
  });

  return eventRowToDTO(data as EventRow);
}

export async function deleteEvent(actorId: string, eventId: string, requestId: string): Promise<void> {
  const { data: before } = await supabaseAdmin.from("charity_events").select("*").eq("id", eventId).maybeSingle();
  if (!before) throw AppError.notFound("Event not found.");

  const { error } = await supabaseAdmin.from("charity_events").delete().eq("id", eventId);
  if (error) throw AppError.internal("Failed to delete the event.");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.event_deleted",
    entityType: "charity_event",
    entityId: eventId,
    previousState: { title: before.title, eventDate: before.event_date },
    requestId,
  });
}

const ALLOWED_MEDIA_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadCharityMedia(
  actorId: string,
  charityId: string,
  file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  altText: string | undefined,
  requestId: string,
): Promise<CharityMediaDTO> {
  const { data: charity } = await supabaseAdmin.from("charities").select("id").eq("id", charityId).maybeSingle();
  if (!charity) throw AppError.notFound("Charity not found.");

  if (!ALLOWED_MEDIA_MIME_TYPES.has(file.mimetype)) {
    throw AppError.validation("Only PNG, JPEG, or WEBP images are allowed.");
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw AppError.validation("Images must be 5MB or smaller.");
  }

  const extension = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
  const storagePath = `${charityId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(CHARITY_MEDIA_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw AppError.internal("Failed to upload the image.");

  const { data: countRows } = await supabaseAdmin.from("charity_media").select("id").eq("charity_id", charityId);
  const displayOrder = countRows?.length ?? 0;

  const { data, error } = await supabaseAdmin
    .from("charity_media")
    .insert({ charity_id: charityId, storage_path: storagePath, alt_text: altText ?? null, display_order: displayOrder })
    .select("*")
    .single();
  if (error) throw AppError.internal("Failed to record the uploaded image.");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.media_uploaded",
    entityType: "charity_media",
    entityId: data.id,
    newState: { charityId, storagePath, originalFilename: file.originalname },
    requestId,
  });

  return mediaRowToDTO(data as MediaRow);
}

export async function deleteCharityMedia(actorId: string, mediaId: string, requestId: string): Promise<void> {
  const { data: media } = await supabaseAdmin.from("charity_media").select("*").eq("id", mediaId).maybeSingle();
  if (!media) throw AppError.notFound("Image not found.");

  await supabaseAdmin.storage.from(CHARITY_MEDIA_BUCKET).remove([media.storage_path]);
  const { error } = await supabaseAdmin.from("charity_media").delete().eq("id", mediaId);
  if (error) throw AppError.internal("Failed to delete the image.");

  await recordAudit({
    actorId,
    actorRole: "admin",
    action: "charity.media_deleted",
    entityType: "charity_media",
    entityId: mediaId,
    previousState: { charityId: media.charity_id, storagePath: media.storage_path },
    requestId,
  });
}
