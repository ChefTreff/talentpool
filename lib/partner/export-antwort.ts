import "server-only";
import { NextResponse } from "next/server";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Dictionary, Locale } from "@/lib/i18n";
import { toRpcFailure } from "@/lib/rpc-error";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { bewerbungenCsv, exportDateiname, type ExportZeile } from "@/lib/partner/bewerbungen-csv";

/** Fehler der Export-RPC als Antwort: 403 ohne Recht, 404 unbekannt, sonst 400 — nie Datenbanktext. */
export function exportFehler(error: PostgrestError): NextResponse {
  const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
  return NextResponse.json({ error: toRpcFailure(error).key }, { status });
}

/**
 * CSV-Antwort für einen Bewerbungsexport (PART-051): DSGVO-Hinweis zuerst,
 * Spalten in der Sprache der Person, Datei als Anhang und **nicht
 * zwischenspeichern** — es sind Personendaten. Genutzt vom Partner-Portal und
 * von der Entscheidungssicht im Admin (`/admin/bewerbungen/<Session>/export`).
 */
export async function exportAntwort({
  supabase,
  zeilen,
  fragen,
  fragenReihenfolge,
  titel,
  mitWunsch = false,
  locale,
  t,
}: {
  supabase: SupabaseClient;
  zeilen: ExportZeile[];
  /** Schlüssel → Fragetext (Format); die Tour bringt den Text in den Antworten mit. */
  fragen: Map<string, string>;
  fragenReihenfolge: string[];
  titel: string | null;
  /** Tour (PART-092): Spalte „Euer Wunsch“. */
  mitWunsch?: boolean;
  locale: Locale;
  t: Dictionary;
}): Promise<NextResponse> {
  const [{ data: hinweis }, vocab] = await Promise.all([
    supabase.rpc("export_privacy_notice", { p_language: locale }),
    loadVocabMap(supabase, locale),
  ]);
  const b = t.partnerBewerbung;
  const f = t.profile.fields;
  const csv = bewerbungenCsv({
    hinweis: String(hinweis ?? ""),
    zeilen,
    fragen,
    fragenReihenfolge,
    statusLabels: vgroup(vocab, "application_status"),
    vokabeln: {
      occupation_status: vgroup(vocab, "occupation_status"),
      career_level: vgroup(vocab, "career_level"),
      study_field: vgroup(vocab, "study_field"),
    },
    locale,
    texte: {
      kopf: {
        name: b.csvName,
        email: b.csvEmail,
        linkedin: f.linkedin,
        status: b.csvStatus,
        wunsch: mitWunsch ? b.csvWish : undefined,
        beworben: b.csvApplied,
        entschieden: b.csvDecided,
        bestaetigt: b.csvConfirmed,
        taetigkeit: f.occupationStatus,
        karrierestufe: f.careerLevel,
        arbeitgeber: f.employerName,
        hochschule: f.university,
        studienfach: f.studyField,
        stadt: t.onboarding.city,
      },
      ja: t.common.yes,
      nein: t.common.no,
    },
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportDateiname(titel, new Date())}"`,
      "Cache-Control": "no-store",
    },
  });
}
