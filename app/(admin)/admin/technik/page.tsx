import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { driveUebersicht } from "@/lib/drive/server";
import { formatTime } from "@/lib/tz";
import { TechCheckQueue, type CheckAsset, type SpeakerHint } from "./TechCheckQueue";
import { DriveSpiegel } from "./DriveSpiegel";

export const dynamic = "force-dynamic";
// SPK-023: „Spiegelung nachholen“ überträgt bis zu 25 Präsentationen je Klick.
export const maxDuration = 300;

export default async function AdminTechPage() {
  await requireAdminSection("tech", "/admin/technik");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  // SPK-023: Folien im Technik-Ordner. Die laufende Edition wie im Wiki
  // (jüngste `is_edition`); die Daten liest der Server erst nach der
  // Abschnittsprüfung oben.
  const { data: editionen } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1);
  const editionId = (editionen?.[0]?.id as string | undefined) ?? null;
  const drive = await driveUebersicht(editionId);
  const slotTexte = Object.fromEntries(
    drive.zeilen.map((z) => {
      if (!z.beginn) return [z.schluessel, z.buehne ?? "—"];
      const tag = new Intl.DateTimeFormat(t.meta.dateLocale, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        timeZone: z.timezone,
      }).format(new Date(z.beginn));
      return [z.schluessel, `${z.buehne ?? "—"} · ${tag} ${formatTime(z.beginn, z.timezone)}`];
    }),
  );

  // `my_speaker_assets(null)` liefert dem Team alle Dateien; für den
  // Technik-Check zählen die aktuellen Präsentationen. Wessen Datei das ist,
  // steht dort nicht — deshalb `manager_speakers` daneben: eine Datei ohne
  // Namen und Session kann niemand prüfen.
  const [{ data: rows }, { data: speakerRows }] = await Promise.all([
    supabase.rpc("my_speaker_assets", { p_profile_id: null }),
    supabase.rpc("manager_speakers"),
  ]);
  const assets = ((rows ?? []) as CheckAsset[]).filter(
    (a) => a.kind === "presentation" && a.is_current,
  );
  const open = assets.filter((a) => a.tech_check_status === "pending").length;

  const speakers = new Map<string, SpeakerHint>();
  for (const row of (speakerRows ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    sessions: { session_id: string; title_de: string | null; title_en: string | null }[] | null;
  }[]) {
    speakers.set(row.id, {
      name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      sessions: Object.fromEntries(
        (row.sessions ?? []).map((x) => [
          x.session_id,
          (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? "",
        ]),
      ),
    });
  }

  return (
    <>
      <PageHeader
        word={t.admin.words.tech}
        title={t.admin.tech.title}
        description={`${t.admin.tech.lead} · ${open} ${t.admin.tech.openCount}`}
      />
      {/* LEAD-023: der Blick nach Slots — was fehlt, und Upload für Dateien per Mail. */}
      <div className="mb-4">
        <ButtonLink href="/admin/technik/praesentationen" variant="secondary" size="sm">
          {t.presentationsList.bySlots}
        </ButtonLink>
      </div>
      {editionId && (
        <DriveSpiegel
          uebersicht={drive}
          editionId={editionId}
          slotTexte={slotTexte}
          t={t.admin.techDrive}
          rpc={t.rpc}
        />
      )}
      {assets.length === 0 ? (
        <EmptyState title={t.admin.tech.emptyTitle} description={t.admin.tech.emptyBody} />
      ) : (
        <TechCheckQueue
          assets={assets}
          speakers={Object.fromEntries(speakers)}
          dateLocale={t.meta.dateLocale}
          t={t.admin.tech}
          common={{ none: t.common.none }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
