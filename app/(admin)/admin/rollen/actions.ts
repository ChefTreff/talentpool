"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Rollenverwaltung. Alles über die RPCs aus Migration 0022 mit dem
 * Session-Client: `search_people` prüft `is_staff()` (E-Mail nur für Admins),
 * die drei Rollen-RPCs prüfen `has_role('admin')` und schreiben das Audit-Log
 * unter dem Actor der Session. Kein service_role.
 */
const PATH = "/admin/rollen";

export type RoleResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[rollen] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("roles", PATH);
  return createSupabaseServerClient();
}

export type FoundPerson = {
  id: string;
  display_name: string | null;
  email: string | null;
  tier: string | null;
  city: string | null;
};

export async function findPeople(query: string): Promise<FoundPerson[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("search_people", {
    p_query: query,
    p_limit: 10,
  });
  if (error) {
    console.error("[rollen] search_people:", error.message);
    return [];
  }
  return (data ?? []) as FoundPerson[];
}

export type FoundOrganization = {
  id: string;
  name: string | null;
  type: string | null;
  slug: string | null;
  city: string | null;
  active: boolean;
};

/**
 * Organisationssuche für den Scope `org`. `organization` hat RLS ohne
 * Lesepolicy — der Weg ist die RPC (Migration 0024), die `is_staff()` prüft
 * und die Eingabe selbst escaped.
 */
export async function findOrganizations(query: string): Promise<FoundOrganization[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("search_organizations", {
    p_query: query,
    p_limit: 10,
  });
  if (error) {
    console.error("[rollen] search_organizations:", error.message);
    return [];
  }
  return (data ?? []) as FoundOrganization[];
}

export type RoleRow = {
  id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  edition_id: string | null;
  portal: string | null;
  scope_label: string | null;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
  note: string | null;
  granted_by: string | null;
  created_at: string;
};

export async function rolesOfPerson(personId: string): Promise<RoleResult<RoleRow[]>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("roles_of_person", {
    p_person_id: personId,
  });
  if (error) return fail(error);
  return { ok: true, data: (data ?? []) as RoleRow[] };
}

export type AssignInput = {
  personId: string;
  role: string;
  scopeType: string;
  scopeId?: string | null;
  editionId?: string | null;
  portal?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  note?: string | null;
};

/** Vergeben ist idempotent: gleiche Rolle im gleichen Scope wird reaktiviert. */
export async function assignRole(input: AssignInput): Promise<RoleResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("assign_role", {
    p_person_id: input.personId,
    p_role: input.role,
    p_scope_type: input.scopeType,
    p_scope_id: input.scopeId || null,
    p_edition_id: input.editionId || null,
    p_portal: input.portal || null,
    p_valid_from: input.validFrom || null,
    p_valid_to: input.validTo || null,
    p_note: input.note?.trim() ? input.note.trim() : null,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: { id: data as string } };
}

/** Entziehen setzt ein Ablaufdatum; die Historie bleibt stehen. */
export async function revokeRole(assignmentId: string): Promise<RoleResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("revoke_role", {
    p_assignment_id: assignmentId,
    p_note: null,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

// === Abschnitte je Rolle und je Person schalten (ADM-053) ====================

export type SectionOverrideRow = {
  id: string;
  section: string;
  role: string | null;
  person_id: string | null;
  person_name: string | null;
  allowed: boolean;
  note: string | null;
  updated_at: string;
};

/** Alle Ausnahmen zur Abschnitts-Vorgabe. Nur `admin`. */
export async function sectionOverrides(): Promise<RoleResult<SectionOverrideRow[]>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_section_overrides");
  if (error) return fail(error);
  return { ok: true, data: (data ?? []) as SectionOverrideRow[] };
}

/**
 * Einen Abschnitt für eine Rolle **oder** eine Person an- oder ausschalten.
 *
 * Genau eine der beiden Kennungen: beides zugleich wäre eine dritte Bedeutung,
 * die niemand erklären kann — die RPC weist es mit `invalid_target` ab.
 */
export async function setSectionOverride(input: {
  section: string;
  allowed: boolean;
  role?: string | null;
  personId?: string | null;
  note?: string | null;
}): Promise<RoleResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("set_admin_section_override", {
    p_section: input.section,
    p_allowed: input.allowed,
    p_role: input.role || null,
    p_person_id: input.personId || null,
    p_note: input.note?.trim() ? input.note.trim() : null,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  // Die Seitenleiste hängt an derselben Antwort — ohne das bliebe sie bis zum
  // nächsten harten Laden stehen.
  revalidatePath("/admin", "layout");
  return { ok: true, data: { id: data as string } };
}

/** Ausnahme entfernen — danach gilt wieder die Vorgabe aus `lib/admin-sections.ts`. */
export async function removeSectionOverride(id: string): Promise<RoleResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_admin_section_override", { p_id: id });
  if (error) return fail(error);
  revalidatePath(PATH);
  revalidatePath("/admin", "layout");
  return { ok: true, data: undefined };
}
