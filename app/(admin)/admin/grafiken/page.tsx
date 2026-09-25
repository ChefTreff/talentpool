import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GrafikenView } from "./GrafikenView";
import { MediaKitAdmin, type MediaKitDatei } from "./MediaKitAdmin";
import { PartnergrafikenAdmin, type PartnergrafikZeile } from "./PartnergrafikenAdmin";
import type { Bild, SessionZeile } from "./types";

export const dynamic = "force-dynamic";

/** Zeile aus `partner_graphics_admin` (PART-041): Partner der Edition mit aktueller Grafik oder ohne. */
type GrafikRow = Omit<PartnergrafikZeile, "url"> & { storage_path: string | null };

/** Wie lange eine Vorschau-URL gilt. Lang genug zum Arbeiten, kurz genug zum Vergessen. */
const URL_GUELTIG_SEKUNDEN = 60 * 30;

/**
 * Bilder am Auftritt: Bühnenfotos und Slot-Grafiken. Darunter seit PART-041
 * und ADM-023 das **Media Kit** (Dateien, die jeder Partner herunterlädt) und
 * die **Partnergrafiken** („Wir sind dabei“, je Partner eine) — beides pflegt
 * das Marketing hier, die Partner sehen es unter `/partner/media`.
 *
 * Die Vorschau-Links entstehen **hier**, nicht in der Datenbank: signierte URLs
 * sind kurzlebig und gehören nicht in eine Tabelle, die man später exportiert.
 */
export default async function AdminGrafikenPage() {
  await requireAdminSection("graphics", "/admin/grafiken");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: sessionRows, error }, { data: assetRows }] = await Promise.all([
    supabase.rpc("sessions_for_assets"),
    supabase.rpc("session_assets_admin"),
  ]);

  // 42501 heisst: dieses Konto pflegt keine Bilder. Kein Fehler, sondern eine
  // Antwort — die Seite zeigt den Leerzustand.
  if (error) {
    return (
      <>
        <PageHeader word={t.admin.words.graphics} title={t.adminGrafiken.title} description={t.adminGrafiken.lead} />
        <EmptyState title={t.adminGrafiken.noAccessTitle} description={t.adminGrafiken.noAccessBody} />
      </>
    );
  }

  const bilder = (assetRows ?? []) as Bild[];
  const pfade = bilder.map((b) => b.storage_path);
  const { data: urls } = pfade.length
    ? await supabase.storage.from("session-assets").createSignedUrls(pfade, URL_GUELTIG_SEKUNDEN)
    : { data: [] };
  const nachPfad = new Map((urls ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));

  // Media Kit und Partnergrafiken gehören zur neuesten Edition — wie Hallenplan und Produktion.
  const { data: editionen } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1);
  const editionId = (editionen?.[0]?.id as string | undefined) ?? null;
  const [{ data: mediaKitRows }, { data: grafikRows }] = editionId
    ? await Promise.all([
        supabase.rpc("edition_files_admin", { p_edition_id: editionId }),
        supabase.rpc("partner_graphics_admin", { p_edition_id: editionId }),
      ])
    : [{ data: [] }, { data: [] }];
  const mediaKit = ((mediaKitRows ?? []) as (MediaKitDatei & { kind: string })[]).filter((f) => f.kind === "media_kit");
  const grafiken = (grafikRows ?? []) as GrafikRow[];
  const grafikPfade = grafiken.map((z) => z.storage_path).filter((pfad): pfad is string => !!pfad);
  const { data: grafikUrls } = grafikPfade.length
    ? await supabase.storage.from("partner-assets").createSignedUrls(grafikPfade, URL_GUELTIG_SEKUNDEN)
    : { data: [] };
  const grafikNachPfad = new Map((grafikUrls ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));
  const g = t.adminGrafiken as Record<string, string>;

  return (
    <>
      <PageHeader word={t.admin.words.graphics} title={t.adminGrafiken.title} description={t.adminGrafiken.lead} />
      <GrafikenView
        sessions={(sessionRows ?? []) as SessionZeile[]}
        bilder={bilder.map((b) => ({ ...b, url: nachPfad.get(b.storage_path) ?? null }))}
        dateLocale={t.meta.dateLocale}
        t={t.adminGrafiken}
        common={{ none: t.common.none }}
      />

      {editionId && (
        <>
          <section aria-labelledby="h-media-kit" className="mt-10">
            <h2 id="h-media-kit" className="ct-h2 text-ink">{g.mediaKitTitle}</h2>
            <p className="ct-help mt-1 mb-4 max-w-text">{g.mediaKitLead}</p>
            <MediaKitAdmin
              editionId={editionId}
              files={mediaKit}
              dateLocale={t.meta.dateLocale}
              t={{
                addTitle: g.mediaKitAddTitle,
                addBody: g.mediaKitAddBody,
                labelDe: g.mediaKitLabelDe,
                labelEn: g.mediaKitLabelEn,
                labelHint: g.mediaKitLabelHint,
                choose: g.mediaKitChoose,
                uploadHint: g.mediaKitUploadHint,
                uploading: g.uploadingShort,
                uploaded: g.mediaKitUploaded,
                uploadTooLarge: g.uploadTooLargeShort,
                uploadWrongType: g.uploadWrongTypeShort,
                uploadNotAllowed: g.uploadNotAllowedShort,
                uploadFailed: g.uploadFailedShort,
                emptyTitle: g.mediaKitEmptyTitle,
                emptyBody: g.mediaKitEmptyBody,
                deleteTitle: g.mediaKitDeleteTitle,
                deleteBody: g.mediaKitDeleteBody,
                deleted: g.mediaKitDeleted,
                deleteFailed: g.mediaKitDeleteFailed,
              }}
              common={{
                cancel: t.common.cancel,
                delete: t.common.delete,
                upload: t.common.upload,
                chooseOtherFile: t.common.chooseOtherFile,
              }}
            />
          </section>

          <section aria-labelledby="h-partnergrafiken" className="mt-10">
            <h2 id="h-partnergrafiken" className="ct-h2 text-ink">{g.partnerGraphicsTitle}</h2>
            <p className="ct-help mt-1 mb-4 max-w-text">{g.partnerGraphicsLead}</p>
            <PartnergrafikenAdmin
              editionId={editionId}
              zeilen={grafiken.map(({ storage_path, ...z }) => ({
                ...z,
                url: storage_path ? grafikNachPfad.get(storage_path) ?? null : null,
              }))}
              dateLocale={t.meta.dateLocale}
              t={{
                search: g.partnerGraphicsSearch,
                count: g.partnerGraphicsCount,
                version: g.partnerGraphicsVersion,
                statusSet: g.partnerGraphicsSet,
                statusMissing: g.partnerGraphicsMissing,
                preview: g.partnerGraphicsPreview,
                choose: g.partnerGraphicsChoose,
                replace: g.partnerGraphicsReplace,
                uploading: g.uploadingShort,
                uploaded: g.partnerGraphicsUploaded,
                uploadTooLarge: g.uploadTooLargeShort,
                uploadWrongType: g.uploadWrongTypeShort,
                uploadNotAllowed: g.uploadNotAllowedShort,
                uploadFailed: g.uploadFailedShort,
                emptyTitle: g.partnerGraphicsEmptyTitle,
                emptyBody: g.partnerGraphicsEmptyBody,
              }}
              common={{ upload: t.common.upload, chooseOtherFile: t.common.chooseOtherFile }}
            />
          </section>
        </>
      )}
    </>
  );
}
