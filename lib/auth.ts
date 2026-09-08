import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  areasFor,
  canEnterArea,
  loginUrl,
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
  personId: string | null;
  firstName: string | null;
  preferredLanguage: string | null;
  tier: string | null;
  roles: RoleAssignment[];
  roleNames: string[];
  isStaff: boolean;
};

const ANONYMOUS: SessionContext = {
  user: null,
  personId: null,
  firstName: null,
  preferredLanguage: null,
  tier: null,
  roles: [],
  roleNames: [],
  isStaff: false,
};

/** Rückgabe von `session_context()` (Migration 0014). NULL ohne Person. */
type SessionContextRow = {
  person_id: string | null;
  first_name: string | null;
  preferred_language: string | null;
  tier: string | null;
  is_staff: boolean;
  roles: RoleAssignment[] | null;
};

/**
 * Session, Profil-Basics und Rollen — ein RPC (`session_context()`), einmal pro
 * Request. `cache()` teilt das Ergebnis zwischen Layout, Seite und Server Actions.
 * Gelesen wird mit dem Anon-Client, also unter RLS — nie mit service_role.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  // Ohne Supabase-Env (frischer Checkout vor `.env.local`) bleibt alles anonym,
  // statt in jeder Route zu werfen — dieselbe No-Op-Haltung wie im Proxy.
  if (!hasSupabaseEnv()) {
    return ANONYMOUS;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANONYMOUS;

  const { data } = await supabase.rpc("session_context");
  const ctx = (data ?? null) as SessionContextRow | null;
  const roles = ctx?.roles ?? [];

  return {
    user,
    personId: ctx?.person_id ?? null,
    firstName: ctx?.first_name ?? null,
    preferredLanguage: ctx?.preferred_language ?? null,
    tier: ctx?.tier ?? null,
    roles,
    roleNames: [...new Set(roles.map((r) => r.role))],
    isStaff: Boolean(ctx?.is_staff),
  };
});

/** Login-Pflicht. Merkt sich das Ziel in `next`, damit der Link zurückführt. */
export async function requireUser(nextPath?: string): Promise<User> {
  const { user } = await getSessionContext();
  if (!user) redirect(loginUrl(nextPath));
  return user;
}

/**
 * Echte, serverseitige Rollenprüfung — die einzige, auf die man sich verlassen darf.
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

/**
 * Bereichs-Gate. Ohne Login → `/login?next=…`, mit Login aber ohne Rolle → 404
 * (der Bereich existiert für diese Person nicht).
 *
 * Gehört in **jede** Seite und Server Action des Bereichs, nicht nur ins Layout:
 * Layouts rendern bei Client-Navigation nicht neu, ein Layout allein schützt also
 * nichts. Der Aufruf ist gecacht und kostet innerhalb eines Requests nichts.
 *
 * `pathname` ist das tatsächlich angeforderte Ziel; ohne Angabe der Bereichseinstieg.
 */
export async function requireArea(
  key: AreaKey,
  pathname?: string,
): Promise<SessionContext> {
  const area = AREAS.find((a) => a.key === key);
  if (!area) notFound();

  const ctx = await getSessionContext();
  if (!ctx.user) redirect(loginUrl(pathname ?? area.path));
  if (!canEnterArea(area, ctx.roleNames, ctx.isStaff)) notFound();
  return ctx;
}

/** Team-Zugriff = Admin-Bereich. Die Team-Definition lebt in SQL `is_staff()`. */
export async function requireStaff(pathname?: string): Promise<SessionContext> {
  return requireArea("admin", pathname);
}

/** Für den Bereichs-Umschalter: nur Bereiche, für die eine Rolle vorliegt. */
export async function getMyAreas(): Promise<Area[]> {
  const { user, roleNames, isStaff } = await getSessionContext();
  if (!user) return [];
  return areasFor(roleNames, isStaff);
}
