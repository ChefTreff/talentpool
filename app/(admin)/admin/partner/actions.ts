"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import type { DryRunResult } from "./types";

/**
 * Admin-Partnerbereich. Alles über die RPCs mit dem Session-Client; sie prüfen
 * `is_partner_team()` selbst (Admin oder `area_lead_partner`) — andere
 * Team-Mitglieder bekommen 42501 und die Seite sagt, woran es liegt.
 *
 * Zwei Ausnahmen mit Ansage: die beiden Trockenlauf-Routen und die
 * Cron-Routen. Sie brauchen `service_role` bzw. `CRON_SECRET`; beides bleibt
 * serverseitig, der Browser sieht nur das Ergebnis.
 */
const PATH = "/admin/partner";

export type AdminResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/partner] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("partner", PATH);
  return createSupabaseServerClient();
}

function refresh(...paths: string[]) {
  revalidatePath(PATH);
  for (const p of paths) revalidatePath(`${PATH}/${p}`);
}

// === Partner-Liste und Detail ===============================================

export async function setOnboardingStatus(
  orgId: string,
  status: string,
  editionId?: string | null,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("partner_set_onboarding_status", {
    p_org_id: orgId,
    p_status: status,
    p_edition_id: editionId ?? null,
  });
  if (error) return fail(error);
  refresh(orgId);
  return { ok: true, data: undefined };
}

/**
 * Pass-Typ der Talente-Tickets.
 *
 * `""` bedeutet **zurück auf den Rückfall** (Org-Typ) und nicht „leer lassen" —
 * deshalb geht der leere Wert bewusst als `null` an die RPC. Die Antwort nennt
 * die Zahl der betroffenen Kontingente, damit die Oberfläche benennen kann,
 * was die Änderung nach sich zieht.
 */
export async function setPassTypeChoice(
  orgId: string,
  choice: string,
  editionId?: string | null,
): Promise<AdminResult<{ pass_type_choice: string | null; allocations: number }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("set_pass_type_choice", {
    p_org_id: orgId,
    p_choice: choice === "" ? null : choice,
    p_edition_id: editionId ?? null,
  });
  if (error) return fail(error);
  refresh(orgId);
  return {
    ok: true,
    data: (data ?? { pass_type_choice: null, allocations: 0 }) as {
      pass_type_choice: string | null;
      allocations: number;
    },
  };
}

export async function saveBooth(
  orgId: string,
  data: Record<string, unknown>,
  editionId?: string | null,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("upsert_booth", {
    p_org_id: orgId,
    p_data: data,
    p_edition_id: editionId ?? null,
  });
  if (error) return fail(error);
  refresh(orgId);
  return { ok: true, data: undefined };
}

/** Kontakte pflegt das Team über dieselben RPCs wie der Partner selbst. */
export async function adminUpsertContact(input: {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  position?: string | null;
}): Promise<AdminResult<{ person_id: string }>> {
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
  refresh(input.orgId);
  return { ok: true, data: { person_id: data as string } };
}

export async function adminSetContactRoles(
  orgId: string,
  personId: string,
  roles: string[],
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_contact_roles", {
    p_org_id: orgId,
    p_person_id: personId,
    p_roles: roles,
  });
  if (error) return fail(error);
  refresh(orgId);
  return { ok: true, data: undefined };
}

/**
 * Bühnen-Editor für **weitere** Kontakte. Der Hauptkontakt bekommt die Rolle
 * mit der Buchung automatisch (Trigger, Migration 0058) — hier geht es um die
 * Kolleginnen daneben.
 */
export async function grantStageEditor(
  personId: string,
  orgId: string,
  editionId: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("assign_role", {
    p_person_id: personId,
    p_role: "standbuehne_editor",
    p_scope_type: "org",
    p_scope_id: orgId,
    p_edition_id: editionId,
    p_note: "Admin B9",
  });
  if (error) return fail(error);
  refresh(orgId);
  return { ok: true, data: undefined };
}

/** Entzogen wird über die Zuweisung selbst — `revoke_role` kennt nur ihre Id. */
export async function revokeStageEditor(
  assignmentId: string,
  orgId: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("revoke_role", {
    p_assignment_id: assignmentId,
    p_note: "Admin B9",
  });
  if (error) return fail(error);
  refresh(orgId);
  return { ok: true, data: undefined };
}

/** Rollen einer Person — die Oberfläche zeigt daraus nur die Bühnen-Editoren. */
export async function rolesOfPerson(
  personId: string,
): Promise<AdminResult<{ id: string; role: string; scope_id: string | null; active: boolean }[]>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("roles_of_person", { p_person_id: personId });
  if (error) return fail(error);
  return {
    ok: true,
    data: (data ?? []) as { id: string; role: string; scope_id: string | null; active: boolean }[],
  };
}

// === Review-Queue ===========================================================

export async function reviewDeliverable(
  deliverableId: string,
  accepted: boolean,
  note: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("review_deliverable", {
    p_deliverable_id: deliverableId,
    p_accepted: accepted,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error);
  refresh("review");
  return { ok: true, data: undefined };
}

// === Vorlagen ===============================================================

/**
 * Vorlagenpflege. Seit Migration 0056 zieht die RPC bestehende Organisationen
 * laufender Editionen selbst nach — ein Knopf „neu synchronisieren" wäre
 * nur eine Falle.
 */
export async function saveTemplate(
  data: Record<string, unknown>,
): Promise<AdminResult<{ id: string }>> {
  const supabase = await client();
  const { data: id, error } = await supabase.rpc("upsert_deliverable_template", {
    p_data: data,
  });
  if (error) return fail(error);
  refresh("vorlagen");
  return { ok: true, data: { id: id as string } };
}

// === Kontingente ============================================================

export async function saveAllocation(input: {
  id: string;
  quantity?: number | null;
  couponCode?: string | null;
  undershopUrl?: string | null;
  status?: string | null;
  notes?: string | null;
}): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_ticket_allocation", {
    p_id: input.id,
    p_quantity: input.quantity ?? null,
    p_coupon_code: input.couponCode ?? null,
    p_undershop_url: input.undershopUrl ?? null,
    p_status: input.status ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return fail(error);
  refresh("kontingente");
  return { ok: true, data: undefined };
}

/**
 * Rabattkontingent von Hand setzen (0123). Nur 50 % — die 100er-Zeile leitet
 * `sync_ticket_allocations` aus den gebuchten Produkten ab und würde jede
 * Handarbeit beim nächsten Lauf überschreiben; die RPC weist sie mit P0001
 * `derived_allocation` ab. Menge 0 deaktiviert das Kontingent, statt es zu löschen.
 */
export async function saveAllocationDiscount(input: {
  orgEditionId: string;
  passType: string;
  discountPercent: number;
  quantity: number;
}): Promise<AdminResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("set_ticket_allocation_discount", {
    p_org_edition_id: input.orgEditionId,
    p_pass_type: input.passType,
    p_discount_percent: input.discountPercent,
    p_quantity: input.quantity,
  });
  if (error) return fail(error);
  refresh("kontingente");
  return { ok: true, data: { id: data as string } };
}

// === Stände =================================================================

/** Stand einer Teilnahme zuordnen — ohne Tag gilt die Belegung für alle Tage (0124). */
export async function saveBoothAssignment(input: {
  boothId: string;
  orgEditionId: string;
  eventDayId?: string | null;
  note?: string | null;
}): Promise<AdminResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("set_booth_assignment", {
    p_booth_id: input.boothId,
    p_org_edition_id: input.orgEditionId,
    p_event_day_id: input.eventDayId ?? null,
    p_note: input.note ?? null,
  });
  if (error) return fail(error);
  refresh("staende");
  return { ok: true, data: { id: data as string } };
}

/** Belegung lösen. Der Stand selbst bleibt stehen — er wird nur wieder frei. */
export async function removeBoothAssignment(id: string): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("remove_booth_assignment", { p_id: id });
  if (error) return fail(error);
  refresh("staende");
  return { ok: true, data: undefined };
}

// === Shop ===================================================================

export async function adminSetOrderLine(
  orderId: string,
  sku: string,
  qty: number,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("shop_admin_set_line", {
    p_order_id: orderId,
    p_sku: sku,
    p_qty: qty,
  });
  if (error) return fail(error);
  refresh("bestellungen");
  return { ok: true, data: undefined };
}

export async function adminSetOrderStatus(
  orderId: string,
  status: string,
  note: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("shop_admin_set_status", {
    p_order_id: orderId,
    p_status: status,
    p_note: note.trim() ? note.trim() : null,
  });
  if (error) return fail(error);
  refresh("bestellungen");
  return { ok: true, data: undefined };
}

export async function answerRequest(
  id: string,
  answer: string,
  status: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("shop_request_answer", {
    p_id: id,
    p_answer: answer,
    p_status: status,
  });
  if (error) return fail(error);
  refresh("bestellungen");
  return { ok: true, data: undefined };
}

// === Integrationen ==========================================================

export async function saveEditionHubspot(
  editionId: string,
  pipelineId: string,
  stageId: string,
  doneStageId: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_edition_hubspot", {
    p_edition_id: editionId,
    p_pipeline_id: pipelineId,
    p_stage_id: stageId,
    p_done_stage_id: doneStageId.trim() ? doneStageId.trim() : null,
  });
  if (error) return fail(error);
  refresh("integrationen");
  return { ok: true, data: undefined };
}

export async function saveEditionVivenu(
  editionId: string,
  eventId: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_edition_vivenu", {
    p_edition_id: editionId,
    p_vivenu_event_id: eventId.trim() ? eventId.trim() : null,
  });
  if (error) return fail(error);
  refresh("integrationen");
  return { ok: true, data: undefined };
}

export async function saveEditionSwapcard(
  editionId: string,
  eventId: string,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_edition_swapcard", {
    p_edition_id: editionId,
    p_swapcard_event_id: eventId.trim() ? eventId.trim() : null,
  });
  if (error) return fail(error);
  refresh("integrationen");
  return { ok: true, data: undefined };
}

export async function resolveSyncError(id: number): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("resolve_sync_error", { p_id: id });
  if (error) return fail(error);
  refresh("integrationen");
  return { ok: true, data: undefined };
}

/** Eigene Adresse — die Routen laufen über denselben Server, nicht über das Netz. */
async function selfUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/**
 * Einen Deal erneut verarbeiten. Die Cron-Route will `CRON_SECRET` im
 * Authorization-Header — das Geheimnis bleibt hier, der Browser sieht es nie.
 */
export async function reprocessDeal(dealId: string): Promise<AdminResult<{ status: number }>> {
  await requireAdminSection("partner", PATH);
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, key: "config_missing", detail: "CRON_SECRET" };
  const res = await fetch(
    await selfUrl(`/api/cron/hubspot-sweep?deal=${encodeURIComponent(dealId)}`),
    { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" },
  );
  refresh("integrationen");
  if (!res.ok) return { ok: false, key: "unknown", detail: `HTTP ${res.status}` };
  return { ok: true, data: { status: res.status } };
}

/** Ein Kontingent sofort nach vivenu schieben — gleiche Mechanik. */
export async function syncAllocation(id: string): Promise<AdminResult<{ status: number }>> {
  await requireAdminSection("partner", PATH);
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, key: "config_missing", detail: "CRON_SECRET" };
  const res = await fetch(
    await selfUrl(`/api/cron/vivenu-allocations?allocation=${encodeURIComponent(id)}`),
    { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" },
  );
  refresh("kontingente");
  if (!res.ok) return { ok: false, key: "unknown", detail: `HTTP ${res.status}` };
  return { ok: true, data: { status: res.status } };
}

/**
 * SevDesk-Entwürfe und Swapcard-Aussteller. Beide Routen prüfen selbst und
 * laufen ohne `dryRun: false` als Trockenlauf — die Oberfläche fragt vor dem
 * scharfen Lauf noch einmal nach.
 */
/**
 * Antwort der beiden Routen lesen. Sie antworten mit JSON — ausser wenn das
 * Gate umleitet (`requireArea` schickt auf /login). `redirect: "manual"` fängt
 * das ab, statt eine HTML-Seite durch `JSON.parse` zu schicken.
 */
async function postAdminRoute(
  path: string,
  input: { editionId: string; dryRun: boolean; orgId?: string | null },
): Promise<AdminResult<DryRunResult>> {
  const res = await fetch(await selfUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: (await headers()).get("cookie") ?? "" },
    body: JSON.stringify({
      editionId: input.editionId,
      dryRun: input.dryRun,
      orgId: input.orgId ?? undefined,
    }),
    cache: "no-store",
    redirect: "manual",
  });
  let body: DryRunResult | null = null;
  try {
    body = (await res.json()) as DryRunResult;
  } catch {
    body = null;
  }
  if (!res.ok || !body) {
    return { ok: false, key: "unknown", detail: body?.error ?? `HTTP ${res.status}` };
  }
  return { ok: true, data: body };
}

export async function runShopInvoices(input: {
  editionId: string;
  dryRun: boolean;
  orgId?: string | null;
}): Promise<AdminResult<DryRunResult>> {
  await requireAdminSection("partner", PATH);
  const res = await postAdminRoute("/api/admin/sevdesk/shop-invoices", input);
  refresh("bestellungen");
  return res;
}

export async function runSwapcardExhibitors(input: {
  editionId: string;
  dryRun: boolean;
  orgId?: string | null;
}): Promise<AdminResult<DryRunResult>> {
  await requireAdminSection("partner", PATH);
  const res = await postAdminRoute("/api/admin/swapcard/exhibitors", input);
  refresh("integrationen");
  return res;
}

// === Produktstamm ===========================================================

export async function saveProduct(
  data: Record<string, unknown>,
): Promise<AdminResult<{ sku: string }>> {
  const supabase = await client();
  const { data: sku, error } = await supabase.rpc("upsert_product", { p_data: data });
  if (error) return fail(error);
  refresh("produkte");
  return { ok: true, data: { sku: sku as string } };
}

/** Bestandteil eines Bündels. Menge 0 (oder leer) entfernt die Zeile. */
export async function saveProductComponent(
  bundleSku: string,
  componentSku: string,
  qty: number,
): Promise<AdminResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("upsert_product_component", {
    p_bundle_sku: bundleSku,
    p_component_sku: componentSku,
    p_qty: qty,
  });
  if (error) return fail(error);
  refresh("produkte");
  return { ok: true, data: undefined };
}

/**
 * Erlaubnis, das Logo für die Foto-Wand weiß zu drucken (PART-053).
 *
 * **Derselbe Weg wie im Partner-Portal**, Regel vom 22.09.: was ein Portal
 * kann, muss der Admin auch können. Die RPC ist dieselbe und unterscheidet
 * selbst — `partner_can_edit` lässt das Partner-Team durch. Eigen ist hier nur
 * der Zugangsschutz der Route: `requireArea("admin")` statt `"partner"`. Das
 * ist keine zweite Logik, sondern die Tür vor demselben Raum.
 *
 * Gebraucht wird der Weg, wenn ein Partner die Erlaubnis am Telefon oder per
 * Mail gibt — ohne ihn müsste das Team ihn bitten, sich dafür einzuloggen.
 */
export async function adminSetLogoWhiteningConsent(input: {
  orgId: string;
  granted: boolean;
  editionId?: string | null;
}): Promise<AdminResult<{ granted_at: string | null }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("set_logo_whitening_consent", {
    p_org_id: input.orgId,
    p_granted: input.granted,
    p_edition_id: input.editionId ?? null,
  });
  if (error) return fail(error);
  refresh(input.orgId);
  return { ok: true, data: { granted_at: (data as string | null) ?? null } };
}
