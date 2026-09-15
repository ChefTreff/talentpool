import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket und Dateinamen des Partner-Bereichs — geteilt von Onboarding und Checkliste. */

export const BUCKET = "partner-assets";

/**
 * Dateinamen auf das reduzieren, was in einem Storage-Pfad nicht stört.
 * Der Originalname bleibt als `filename` am Datensatz erhalten.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "");
  return (cleaned || "datei").slice(-80);
}

/**
 * Eine Datei zu einer Pflicht hochladen — Bucket, Registrierung, Einreichung.
 *
 * Die drei Schritte gehören zusammen und dürfen nicht auseinanderlaufen:
 * ohne `register_partner_asset` liegt die Datei verwaist im Bucket, ohne
 * `submit_deliverable` sieht das Team sie nicht. Sie standen zuerst nur in der
 * Checkliste; seit die Messestand-Seite denselben Upload anbietet (Konrads
 * „Jetzt hochladen"), stehen sie hier.
 *
 * Fehler werden **gemeldet, nicht geheilt**: schlägt die Registrierung fehl,
 * bleibt die Datei im Bucket liegen. Sie hier zu löschen wäre der zweite
 * Fehlerfall im selben Ablauf.
 */
export type UploadErgebnis =
  | { ok: true; version: number }
  | { ok: false; stage: "storage"; message: string }
  | { ok: false; stage: "rpc"; key: string; detail?: string };

export async function uploadDeliverableFile(input: {
  supabase: SupabaseClient;
  registerAsset: (args: {
    orgId: string;
    kind: string;
    storagePath: string;
    filename: string;
    mime: string | null;
    sizeBytes: number;
    deliverableId: string;
  }) => Promise<{ ok: true; data: { id: string; version: number } } | { ok: false; key: string; detail?: string }>;
  submit: (
    deliverableId: string,
    assetIds: string[],
  ) => Promise<{ ok: true } | { ok: false; key: string; detail?: string }>;
  orgId: string;
  editionId: string;
  deliverableId: string;
  kind: string;
  file: File;
}): Promise<UploadErgebnis> {
  // Die Art im Pfad ist der Schlüssel der Pflicht — dieselbe Regel prüft die
  // Storage-Policy und danach `register_partner_asset` noch einmal.
  const path = `${input.editionId}/${input.orgId}/${input.kind}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
  const up = await input.supabase.storage.from(BUCKET).upload(path, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });
  if (up.error) return { ok: false, stage: "storage", message: up.error.message };

  const reg = await input.registerAsset({
    orgId: input.orgId,
    kind: input.kind,
    storagePath: path,
    filename: input.file.name,
    mime: input.file.type || null,
    sizeBytes: input.file.size,
    deliverableId: input.deliverableId,
  });
  if (!reg.ok) return { ok: false, stage: "rpc", key: reg.key, detail: reg.detail };

  const sub = await input.submit(input.deliverableId, [reg.data.id]);
  if (!sub.ok) return { ok: false, stage: "rpc", key: sub.key, detail: sub.detail };
  return { ok: true, version: reg.data.version };
}
