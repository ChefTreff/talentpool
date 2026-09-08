import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  areasFor,
  canEnterArea,
  AREAS,
  type Area,
  type AreaKey,
} from "@/lib/areas";

export type RoleAssignment = {
  role: string;
  scope_type: string;
  scope_id: string | null;
  edition_id: string | null;
  portal: string | null;
  valid_to: string | null;
};

export type SessionContext = {
  user: User | null;
  roles: RoleAssignment[];
  roleNames: string[];
  isStaff: boolean;
  preferredLanguage: string | null;
};

const ANONYMOUS: SessionContext = {
  user: null,
  roles: [],
  roleNames: [],
  isStaff: false,
  preferredLanguage: null,
};

/**
 * Session + Rollen einmal pro Request. `cache()` teilt das Ergebnis zwischen
 * Layout, Seite und Server Actions, ohne die Datenbank mehrfach zu fragen.
 * Gelesen wird mit dem Anon-Client, also unter RLS — nie mit service_role.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANONYMOUS;

  const [{ data: roles }, { data: isStaff }, { data: person }] = await Promise.all([
    supabase.rpc("my_roles"),
    supabase.rpc("is_staff"),
    supabase.from("person").select("preferred_language").maybeSingle(),
  ]);

  const list = (roles ?? []) as RoleAssignment[];
  return {
    user,
    roles: list,
    roleNames: [...new Set(list.map((r) => r.role))],
    isStaff: Boolean(isStaff),
    preferredLanguage: person?.preferred_language ?? null,
  };
});

/** Login-Pflicht. Merkt sich das Ziel in `next`, damit der Link zurückführt. */
export async function requireUser(nextPath?: string): Promise<User> {
  const { user } = await getSessionContext();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

/**
 * Echte, serverseitige Rollenprüfung — die einzige, auf die man sich verlassen darf.
 * Der Check in `proxy.ts` ist nur ein optimistischer Redirect.
 * Erst nach diesem Aufruf darf der service_role-Client benutzt werden.
 */
export async function requireRole(
  role: string,
  scope?: { scopeType?: string; scopeId?: string; editionId?: string },
): Promise<User> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_role", {
    p_role: role,
    p_scope_type: scope?.scopeType ?? null,
    p_scope_id: scope?.scopeId ?? null,
    p_edition_id: scope?.editionId ?? null,
  });
  if (!allowed) notFound();
  return user;
}

/** Team-Zugriff (Admin, Programm, Produktion, Bereichsleads oder Alt-`staff_user`). */
export async function requireStaff(): Promise<User> {
  const { user, isStaff } = await getSessionContext();
  if (!user) redirect("/login");
  if (!isStaff) redirect("/");
  return user;
}

/**
 * Bereichs-Gate für die Route-Gruppen. Ohne Login → `/login?next=…`,
 * mit Login aber ohne Rolle → 404 (der Bereich existiert für diese Person nicht).
 */
export async function requireArea(key: AreaKey): Promise<SessionContext> {
  const area = AREAS.find((a) => a.key === key);
  if (!area) notFound();

  const ctx = await getSessionContext();
  if (!ctx.user) redirect(`/login?next=${encodeURIComponent(area.path)}`);
  if (!canEnterArea(area, ctx.roleNames, ctx.isStaff)) notFound();
  return ctx;
}

/** Für den Bereichs-Umschalter: nur Bereiche, für die eine Rolle vorliegt. */
export async function getMyAreas(): Promise<Area[]> {
  const { user, roleNames, isStaff } = await getSessionContext();
  if (!user) return [];
  return areasFor(roleNames, isStaff);
}
