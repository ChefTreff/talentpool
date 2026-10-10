"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

const PFAD = "/admin/verwaltung/zugaenge";
/** Reversibel und lang: „gesperrt" heisst nicht „für hundert Jahre weg", sondern „bis jemand es zurücknimmt". */
const BANN = "876000h";

/**
 * Zugang sperren oder wieder öffnen (PORT4b).
 *
 * Zwei Schritte, in dieser Reihenfolge:
 *
 * 1. **Die Datenbank** (`set_person_access`) — sie prüft das Abschnittsrecht,
 *    verweigert die Selbstsperre und schreibt das Audit. Scheitert sie, endet
 *    es hier; ein gebanntes Konto ohne Eintrag wäre der schlechtere Zustand.
 * 2. **Das Auth-Konto** bannen oder entbannen (K-42, Empfehlung angewendet).
 *    Reversibel: `ban_duration: "none"` hebt es auf. Ohne diesen Schritt bliebe
 *    die Anmeldung möglich — die Person käme herein und sähe nichts, statt
 *    draussen zu bleiben.
 *
 * Schlägt Schritt 2 fehl, sagt die Antwort das: die Rechte sind weg, die Tür
 * ist es nicht. Das ist etwas anderes als „hat geklappt".
 */
export async function setzeZugang(personId: string, sperren: boolean, notiz: string): Promise<Ergebnis> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_person_access", {
    p_person_id: personId,
    p_blocked: sperren,
    p_note: notiz,
  });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }

  const admin = createSupabaseAdminClient();
  const { data: person } = await admin.from("person").select("auth_user_id").eq("id", personId).single();
  const uid = person?.auth_user_id as string | null | undefined;
  if (uid) {
    const { error: bannFehler } = await admin.auth.admin.updateUserById(uid, {
      ban_duration: sperren ? BANN : "none",
    });
    if (bannFehler) {
      console.error("[zugaenge] Bann nicht gesetzt:", bannFehler.message);
      revalidatePath(PFAD);
      return { ok: false, key: "auth_ban_failed", detail: bannFehler.message.slice(0, 200) };
    }
  }
  revalidatePath(PFAD);
  return { ok: true };
}

/**
 * Eine Anmelde-Mail an die hinterlegte Adresse (PORT4b).
 *
 * Über den Admin-Client und **erst nach** der Rollenprüfung. Die Adresse kommt
 * aus unserer Datenbank, nicht aus dem Formular: eine Einladung an eine
 * eingetippte Adresse wäre ein Weg, jemand Fremdem ein Konto zu verschaffen.
 */
export async function ladeEin(personId: string): Promise<Ergebnis> {
  await requireAdminSection("access", PFAD);
  const admin = createSupabaseAdminClient();
  const { data: mail } = await admin
    .from("person_email").select("email").eq("person_id", personId).eq("is_primary", true).maybeSingle();
  const adresse = (mail?.email as string | undefined)?.trim();
  if (!adresse) return { ok: false, key: "email_missing" };

  const { error } = await admin.auth.admin.inviteUserByEmail(adresse);
  if (error) {
    console.error("[zugaenge] Einladung:", error.message);
    return { ok: false, key: "invite_failed", detail: error.message.slice(0, 200) };
  }
  // Über die Nutzer-Sitzung, damit im Protokoll steht, **wer** eingeladen hat.
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("log_access_invite", { p_person_id: personId });
  revalidatePath(PFAD);
  return { ok: true };
}

export type GeraeteErgebnis =
  | { ok: true; eingeladen: boolean; email: string }
  | { ok: false; key: string; detail?: string };

/**
 * Kiosk-Gerätekonto anlegen (ADM-038).
 *
 * 1. `create_kiosk_account` über die Sitzung: prüft Abschnitt, Team-Adresse und
 *    Edition, legt Person und Rolle an und schreibt das Audit.
 * 2. Hat die Person noch kein Login, geht die Einladung an **die Adresse aus der
 *    Datenbank** — dieselbe, die Schritt 1 gerade geprüft hat, nicht die aus dem
 *    Formular. Beim ersten Klick verknüpft der Login-Rückweg das Konto.
 *
 * Scheitert die Einladung, sagt die Antwort das: Rolle und Person stehen, die
 * Mail ist nicht raus — „Einladen" in der Liste holt sie nach.
 */
export async function legeGeraetAn(label: string, email: string, editionId: string): Promise<GeraeteErgebnis> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_kiosk_account", {
    p_label: label,
    p_email: email,
    p_edition_id: editionId,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[zugaenge] create_kiosk_account:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  const r = data as { person_id: string; email: string; has_login: boolean };
  revalidatePath(PFAD);
  if (r.has_login) return { ok: true, eingeladen: false, email: r.email };

  const einladung = await ladeEin(r.person_id);
  if (!einladung.ok) return { ok: false, key: "kiosk_invite_failed", detail: einladung.detail };
  return { ok: true, eingeladen: true, email: r.email };
}

/** `queued`: Hinweismail an eine Person mit Konto steht in der Warteschlange; `suppressed`: Adresse gesperrt; `none`: keine neue Rolle oder keine Mail nötig. */
export type TeamMail = "queued" | "suppressed" | "none";

export type TeamErgebnis =
  | { ok: true; neu: boolean; eingeladen: boolean; email: string; mail: TeamMail }
  | { ok: false; key: string; detail?: string };

/**
 * Teammitglied anlegen und einladen (QS-056, Team-Testrunde ab 06.10.).
 *
 * 1. `create_team_member` über die Sitzung: prüft den Abschnitt `access`, nur
 *    Team-Rollen ohne `admin`, legt Person und Rollen für die Edition an, Audit.
 * 2. Hat die Person noch kein Login, geht die Einladung an **die Adresse aus
 *    der Datenbank** — wie bei `ladeEin`, nie an die eingetippte.
 * 3. Hat sie schon eines (ADM-086), schickt Supabase nichts; deshalb queued
 *    `create_team_member` selbst die Mail „Du bist jetzt im Team" (Vorlage
 *    `team_member_added`, nur bei neu vergebenen Rollen, Adresse aus der
 *    Datenbank, Audit ohne Klartext-Adresse). Die Antwort sagt in `mail`, was
 *    daraus wurde — der Hinweis im Admin nennt den Mailversand.
 */
export async function ladeTeamEin(
  vorname: string,
  nachname: string,
  email: string,
  rollen: string[],
  editionId: string,
): Promise<TeamErgebnis> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_team_member", {
    p_first_name: vorname, p_last_name: nachname, p_email: email, p_roles: rollen, p_edition_id: editionId,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[zugaenge] create_team_member:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  const r = data as { person_id: string; email: string; created: boolean; has_login: boolean; mail?: TeamMail };
  revalidatePath(PFAD);
  if (r.has_login) return { ok: true, neu: r.created, eingeladen: false, email: r.email, mail: r.mail ?? "none" };
  const einladung = await ladeEin(r.person_id);
  if (!einladung.ok) return { ok: false, key: einladung.key, detail: einladung.detail };
  return { ok: true, neu: r.created, eingeladen: true, email: r.email, mail: "none" };
}


export type GefundenePerson = { id: string; display_name: string | null; email: string | null; city: string | null };

/** Suche für „Person aufnehmen“. Gleiche Grenze wie die Liste: Abschnitt `access`; die Funktion filtert selbst. */
export async function findPeople(query: string): Promise<GefundenePerson[]> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_people", { p_query: query, p_limit: 10 });
  if (error) {
    console.error("[zugaenge] search_people:", error.message);
    return [];
  }
  return (data ?? []) as GefundenePerson[];
}

export type RollenErgebnis = { ok: true; neu: boolean; mail: TeamMail } | { ok: false; key: string; detail?: string };

/**
 * Eine Teamrolle vergeben (vorher `/admin/team`, ADM-094) — „+ Rolle“ in der Liste und „Aus dem Talentpool“.
 *
 * Über `grant_team_role` (Abschnitt `access`, ruft `assign_role`, schreibt das Audit): dieselbe Regel wie „Neu einladen“ (ADM-086) — hat die Person
 * schon ein Konto und ist die Rolle neu, reiht die Datenbank die Hinweismail „Du bist jetzt im Team“ ein (Adresse aus der Datenbank, nie aus dem
 * Formular). Die Antwort sagt in `mail`, was daraus wurde, und in `neu`, ob die Rolle überhaupt dazukam.
 *
 * `editionId` setzt die Geltung auf die Edition. Die Rolle `admin` ist ausdrücklich global: ein Admin, der nur für eine Edition gilt, wäre im
 * nächsten Jahr lautlos keiner mehr — die Datenbank erzwingt das, die Oberfläche bietet es gar nicht erst an.
 */
export async function grantTeamRole(personId: string, role: string, editionId?: string | null): Promise<RollenErgebnis> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("grant_team_role", {
    p_person_id: personId,
    p_role: role,
    p_edition_id: role !== "admin" && editionId ? editionId : null,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[zugaenge] grant_team_role:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  const r = data as { granted: boolean; mail?: TeamMail };
  revalidatePath(PFAD);
  revalidatePath("/admin/rollen");
  return { ok: true, neu: r.granted, mail: r.mail ?? "none" };
}

/**
 * Eine Rolle entziehen. Setzt ein Ablaufdatum, die Historie bleibt. Den letzten globalen Admin schützt die
 * Datenbank selbst (P0001 `last_admin`); die Oberfläche warnt vorher.
 */
export async function revokeTeamRole(assignmentId: string): Promise<Ergebnis> {
  await requireAdminSection("access", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_role", { p_assignment_id: assignmentId, p_note: null });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[zugaenge] revoke_role:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  revalidatePath("/admin/rollen");
  return { ok: true };
}
