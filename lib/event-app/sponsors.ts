import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExhibitorRow, RemoteSponsor, SponsorUpsert } from "@/lib/event-app/types";
import { listSponsors, sponsorCategories, upsertSponsor } from "@/lib/event-app/swapcard/adapter";
import { publicLogoUrl, ensurePublicLogo } from "@/lib/event-app/logos";

export type SponsorSummary = {
  dryRun: boolean;
  eventId: string | null;
  rows: number;
  create: number;
  update: number;
  unchanged: number;
  errors: number;
  /** Partner ohne freigegebenes PNG — sie können nicht auf die Wand, und das muss sichtbar sein. */
  ohneLogo: { org: string; orgEditionId: string }[];
  /** Einträge auf der Wand, die nicht von uns stammen: der Bestand aus dem Vorjahr. */
  fremd: { id: string; name: string; logoUrl: string | null; categoryName: string | null }[];
  runs: { org: string; outcome: string; detail?: string }[];
  skipped?: string;
};

/** Ein Eintrag gehört uns, wenn wir seine Kennung gemerkt haben. Alles andere ist Bestand. */
export function fremdeEintraege(alle: RemoteSponsor[], unsere: Set<string>): RemoteSponsor[] {
  return alle.filter((s) => !unsere.has(s.id));
}

/**
 * Die Logo-Wand aus dem Portal füllen (Bereich „Sponsoring & Werbung").
 *
 * Quelle ist dieselbe Ausstellerliste wie beim Standsync: Name, freigegebenes
 * PNG-Logo und die Kategorie, die sich aus dem gebuchten Paket ergibt (0139) —
 * mit `official_partner` als Auffangnetz, damit niemand fehlt, der nur eine
 * Masterclass oder eine Company Tour gebucht hat.
 *
 * **Idempotent über `external_ref`** (System `swapcard`, `object_type`
 * `sponsor`): der erste Lauf legt an und merkt sich die Kennung, jeder weitere
 * ändert. Einträge, die wir nicht angelegt haben, fasst der Lauf **nicht** an —
 * er zählt sie als `fremd` auf, damit jemand entscheidet, was damit geschieht.
 *
 * `dryRun` rechnet alles durch und schreibt nichts; im Echtlauf wird die
 * öffentliche Kopie des Logos angelegt, falls sie noch fehlt.
 */
export async function syncSponsors(opts: {
  admin: SupabaseClient;
  editionId?: string | null;
  dryRun: boolean;
  hatSchluessel: boolean;
}): Promise<SponsorSummary> {
  const { admin, dryRun } = opts;
  const summary: SponsorSummary = {
    dryRun, eventId: null, rows: 0, create: 0, update: 0, unchanged: 0, errors: 0,
    ohneLogo: [], fremd: [], runs: [],
  };

  const { data, error } = await admin.rpc("event_app_exhibitors", { p_edition_id: opts.editionId ?? null });
  if (error) throw new Error(`event_app_exhibitors: ${error.message}`);
  const rows = (data ?? []) as ExhibitorRow[];
  summary.rows = rows.length;
  if (rows.length === 0) return summary;
  if (!opts.hatSchluessel) return { ...summary, skipped: "SWAPCARD_API_KEY fehlt – nichts übertragen" };

  const eventId = rows.find((r) => r.swapcard_event_id)?.swapcard_event_id ?? null;
  summary.eventId = eventId;
  if (!eventId) return { ...summary, skipped: "Edition ohne swapcard_event_id (set_edition_swapcard)" };

  const [kategorien, bestand] = await Promise.all([sponsorCategories(eventId), listSponsors(eventId)]);
  // Die Kategorie kommt aus dem Vokabular als Schlüssel, drüben heißt sie beim
  // Namen. Eine umbenannte Kategorie findet der Lauf nicht — dann steht das als
  // Fehler an der Zeile, statt still in der falschen Kategorie zu landen.
  const { data: vocab } = await admin
    .from("vocab_term")
    .select("key,label_en")
    .eq("vocabulary", "swapcard_sponsor_category");
  const nameZuKey = new Map((vocab ?? []).map((v) => [(v.label_en as string).trim().toLowerCase(), v.key as string]));
  const katIdFuer = new Map<string, string>();
  for (const k of kategorien) {
    const key = nameZuKey.get(k.name.trim().toLowerCase());
    if (key) katIdFuer.set(key, k.id);
  }

  const { data: refs } = await admin
    .from("external_ref")
    .select("object_id,external_id")
    .eq("system", "swapcard")
    .eq("object_type", "sponsor");
  const bekannt = new Map((refs ?? []).map((r) => [r.object_id as string, r.external_id as string]));
  summary.fremd = fremdeEintraege(bestand, new Set(bekannt.values())).map((s) => ({
    id: s.id, name: s.name, logoUrl: s.logoUrl, categoryName: s.categoryName,
  }));

  const nachId = new Map(bestand.map((s) => [s.id, s]));

  for (const row of rows) {
    const logoUrl = publicLogoUrl(admin, row);
    if (!logoUrl) {
      summary.ohneLogo.push({ org: row.name, orgEditionId: row.org_edition_id });
      summary.runs.push({ org: row.name, outcome: "kein_logo" });
      continue;
    }
    const categoryId = katIdFuer.get(row.sponsor_category);
    if (!categoryId) {
      summary.errors += 1;
      summary.runs.push({ org: row.name, outcome: "kategorie_fehlt", detail: row.sponsor_category });
      continue;
    }

    const existingId = bekannt.get(row.org_edition_id);
    const vorhanden = existingId ? nachId.get(existingId) : undefined;
    if (vorhanden && vorhanden.name === row.name.trim() && vorhanden.logoUrl === logoUrl && vorhanden.categoryId === categoryId) {
      summary.unchanged += 1;
      summary.runs.push({ org: row.name, outcome: "unchanged", detail: existingId });
      continue;
    }

    const wanted: SponsorUpsert = {
      orgEditionId: row.org_edition_id,
      name: row.name.trim(),
      categoryId,
      logoUrl,
      existingId: vorhanden ? existingId : undefined,
    };
    if (row.website) wanted.redirectUrl = row.website;
    const art = wanted.existingId ? "update" : "create";
    summary[art] += 1;
    summary.runs.push({ org: row.name, outcome: `${dryRun ? "would_" : ""}${art}`, detail: row.sponsor_category });
    if (dryRun) continue;

    try {
      // Erst die öffentliche Kopie sicherstellen, dann schreiben — sonst zeigte
      // die Wand auf eine Adresse, unter der noch nichts liegt.
      const url = (await ensurePublicLogo(admin, row)) ?? logoUrl;
      const id = await upsertSponsor(eventId, { ...wanted, logoUrl: url });
      await admin.rpc("set_event_app_ref", {
        p_org_edition_id: row.org_edition_id,
        p_system: "swapcard",
        p_external_id: id,
        p_meta: { object_type: "sponsor", category: row.sponsor_category, synced_at: new Date().toISOString() },
      });
    } catch (e) {
      summary.errors += 1;
      summary.runs.push({ org: row.name, outcome: "error", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  }
  return summary;
}
