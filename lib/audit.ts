import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth";

export type AuditEntry = {
  /** `mail.test`, `vocab.toggle`, `duplicate.decide` … (Masterplan §7). */
  action: string;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Admin-Aktion protokollieren.
 *
 * Nicht über `log_audit()`: die Funktion setzt den Handelnden aus
 * `current_person_id()`/`auth.uid()`, und der service_role-Client bringt keinen
 * Auth-Kontext mit — der Eintrag hätte keinen Urheber. Deshalb ein direkter
 * Insert mit dem Handelnden aus der Session; service_role umgeht die RLS.
 *
 * Nur nach bestandener Rollenprüfung aufrufen. Ein Fehler beim Protokollieren
 * bricht die Aktion nicht ab, wird aber geloggt — sonst verlöre man die Aktion
 * *und* die Spur.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const { user, personId } = await getSessionContext();
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("audit_log").insert({
    actor_person_id: personId,
    actor_auth_uid: user?.id ?? null,
    action: entry.action,
    object_type: entry.objectType,
    object_id: entry.objectId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });

  if (error) {
    console.error(`[audit] ${entry.action} nicht protokolliert:`, error.message);
  }
}
