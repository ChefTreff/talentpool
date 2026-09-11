"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { ORG_COOKIE } from "./org";

/**
 * Partner-Portal. Alles über die RPCs aus A3/A4 mit dem Session-Client —
 * kein `service_role` in diesem Bereich. Wer was darf, entscheidet die
 * Datenbank: `partner_can_edit()` für Stammdaten und Uploads, `primary_ops`
 * für die Mitgliederverwaltung. `requireArea("partner")` davor hält Fremde
 * von der Route fern, mehr nicht.
 */
const PATH = "/partner";

export type PartnerResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[partner] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("partner", PATH);
  return createSupabaseServerClient();
}

/** Nach jeder Änderung: Dashboard, Stammdaten, Kontakte neu laden. */
function refresh() {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/onboarding`);
  revalidatePath(`${PATH}/kontakte`);
}

/**
 * Org-Wechsler. Der Cookie ist nur eine Merkhilfe; geprüft wird er beim Lesen
 * gegen `my_partner_orgs()` (siehe `org.ts`).
 */
export async function selectOrg(orgId: string): Promise<void> {
  await requireArea("partner", PATH);
  (await cookies()).set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  refresh();
}

// === Onboarding =============================================================

/**
 * Stammdaten speichern. Es gehen nur die Schlüssel raus, die der Wizard
 * wirklich anzeigt — die RPC hat ihre eigene Whitelist, aber ein Formular
 * soll nicht mehr schicken, als es zeigt.
 */
export async function saveOnboarding(
  orgId: string,
  data: Record<string, string>,
): Promise<PartnerResult<{ onboarding_status: string }>> {
  const supabase = await client();
  const { data: res, error } = await supabase.rpc("update_partner_onboarding", {
    p_org_id: orgId,
    p_data: data,
  });
  if (error) return fail(error);
  refresh();
  return {
    ok: true,
    data: (res ?? { onboarding_status: "invited" }) as { onboarding_status: string },
  };
}

// === Uploads ================================================================

export async function registerPartnerAsset(input: {
  orgId: string;
  kind: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
  deliverableId?: string | null;
}): Promise<PartnerResult<{ id: string; version: number }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("register_partner_asset", {
    p_org_id: input.orgId,
    p_kind: input.kind,
    p_storage_path: input.storagePath,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_deliverable_id: input.deliverableId ?? null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: data as { id: string; version: number } };
}

/** Einreichen. Was mitmuss, hängt am Typ der Pflicht — die RPC prüft es. */
export async function submitDeliverable(
  deliverableId: string,
  assetIds: string[],
  answers: Record<string, unknown> = {},
): Promise<PartnerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("submit_deliverable", {
    p_deliverable_id: deliverableId,
    p_asset_ids: assetIds,
    p_answers: answers,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

// === Kontakte ===============================================================

export async function upsertContact(input: {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  position?: string | null;
}): Promise<PartnerResult<{ person_id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_partner_contact", {
    p_org_id: input.orgId,
    p_email: input.email,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_roles: input.roles,
    p_position: input.position?.trim() ? input.position.trim() : null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { person_id: data as string } };
}

export async function setContactRoles(
  orgId: string,
  personId: string,
  roles: string[],
): Promise<PartnerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_contact_roles", {
    p_org_id: orgId,
    p_person_id: personId,
    p_roles: roles,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

export async function transferPrimary(
  orgId: string,
  personId: string,
): Promise<PartnerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("transfer_primary_contact", {
    p_org_id: orgId,
    p_person_id: personId,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Entzieht die Rechte. Die Person bleibt — Löschen gehört zu „Profil löschen". */
export async function removeContact(
  orgId: string,
  personId: string,
): Promise<PartnerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("remove_partner_contact", {
    p_org_id: orgId,
    p_person_id: personId,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

// === Tickets ================================================================

/**
 * „Mehr Tickets" — eine Anfrage ans Team, kein Selbstbedienungs-Kontingent.
 * Ein Mail-Fallback gibt es mit Absicht nicht (Arbeitsauftrag B5).
 */
export async function requestTicketIncrease(input: {
  orgId: string;
  passType: string;
  additional: number;
  text: string;
}): Promise<PartnerResult<{ request_id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("request_ticket_increase", {
    p_org_id: input.orgId,
    p_pass_type: input.passType,
    p_additional: input.additional,
    p_text: input.text.trim() ? input.text.trim() : null,
  });
  if (error) return fail(error);
  revalidatePath(`${PATH}/tickets`);
  return { ok: true, data: { request_id: data as string } };
}

// === Bewerber ===============================================================

/**
 * Entscheidung über eine Bewerbung. Die Mail geht **nicht** von hier raus —
 * versendet wird erst nach `release_decisions` durch das Team (Antwort 13).
 */
export async function decideApplication(
  applicationId: string,
  status: string,
  rank?: number | null,
): Promise<PartnerResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("decide_application", {
    p_application_id: applicationId,
    p_status: status,
    p_rank: rank ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`${PATH}/bewerber`);
  return { ok: true, data: undefined };
}
