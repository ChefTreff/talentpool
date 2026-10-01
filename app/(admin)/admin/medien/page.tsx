import Link from "next/link";
import { requireAnyAdminSection } from "@/lib/auth";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { VIDEO_SCHLUESSEL } from "@/components/video/schluessel";
import { VideoAdmin, type AdminVideo } from "../videos/VideoAdmin";
import { removeLink, saveLink } from "../videos/actions";
import { DateienView, type EditionFileRow } from "../produktion/dateien/DateienView";
import { loadAxes } from "../produktion/load";
import type { AdminKontakt } from "../ansprechpartner/types";

export const dynamic = "force-dynamic";

const BEREICHE = ["videos", "links", "dateien", "bilder"] as const;
type Bereich = (typeof BEREICHE)[number];

/**
 * Zentrale Medienverwaltung (ADM-063, Konrad 25.09.): Videos, Links, Dateien
 * und Bilder an **einem** Ort. Zusammengeführt, nicht neu gebaut — jeder
 * Bereich nutzt den Editor, den es schon gab (`portal_video`, `portal_link`,
 * `edition_file`, `edition_contact.photo_path`), und behält seine eigenen
 * Rechte: wer einen Abschnitt nicht öffnen darf, sieht den Bereich nicht.
 * Die Portale binden einzelne Elemente weiter über ihren Schlüssel bzw. ihre
 * Zielgruppe ein (Partner → Event-App-Video, Produktion → Hallenplan,
 * Ansprechpartner → Foto) — hier ausgetauscht heisst dort ausgetauscht.
 */
export default async function MedienPage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const ctx = await requireAnyAdminSection(["videos", "productionFiles", "contacts", "graphics"], "/admin/medien");
  const { t, locale } = await getI18n();
  const m = t.media as Record<string, string>;
  const [darfVideos, darfDateien, darfKontakte, darfGrafiken] = await Promise.all(
    (["videos", "productionFiles", "contacts", "graphics"] as const).map((s) => mayEnterAdminSection(s, ctx.roleNames)),
  );
  const sichtbar: Record<Bereich, boolean> = { videos: darfVideos, links: darfVideos, dateien: darfDateien, bilder: darfKontakte || darfGrafiken };
  const { bereich: roh } = await searchParams;
  const bereich: Bereich =
    (BEREICHE as readonly string[]).includes(roh ?? "") && sichtbar[roh as Bereich]
      ? (roh as Bereich)
      : (BEREICHE.find((b) => sichtbar[b]) ?? "videos");

  const supabase = await createSupabaseServerClient();
  const common = { save: t.common.save, cancel: t.common.cancel, delete: t.common.delete, none: t.common.none };

  let inhalt: React.ReactNode = null;
  if (bereich === "videos" || bereich === "links") {
    const [{ data: videos }, { data: editions }, { data: links }] = await Promise.all([
      supabase.rpc("portal_videos_admin"),
      supabase.from("event").select("id, slug, name").eq("is_edition", true).order("start_date", { ascending: false }),
      supabase.rpc("portal_links_admin"),
    ]);
    const editionen = (editions ?? []) as { id: string; slug: string; name: string }[];
    const vorhanden = new Set(((videos ?? []) as AdminVideo[]).map((v) => v.key));
    inhalt = bereich === "videos" ? (
      <>
        <Card className="mb-6">
          <h2 className="ct-h3 text-ink">{t.videos.expectedTitle}</h2>
          <p className="ct-help mt-1 max-w-text">{t.videos.expectedLead}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {VIDEO_SCHLUESSEL.map((v) => (
              <li key={v.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="ct-small text-ink">{v.key}</code>
                <Link className="ct-link ct-small" href={v.seite}>{v.seite}</Link>
                {vorhanden.has(v.key) ? (
                  <Badge tone="success">{t.videos.expectedSet}</Badge>
                ) : (
                  <Badge tone="warning">{t.videos.expectedMissing}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <VideoAdmin videos={(videos ?? []) as AdminVideo[]} editions={editionen} t={t.videos} common={common} rpcMessages={t.rpc} />
      </>
    ) : (
      <>
        <p className="ct-help mb-4 max-w-text">{t.videos.linksLead}</p>
        <VideoAdmin
          videos={(links ?? []) as AdminVideo[]}
          editions={editionen}
          t={{
            ...t.videos,
            add: t.videos.linkAdd,
            empty: t.videos.linkEmpty,
            emptyBody: t.videos.linkEmptyBody,
            fieldKeyHint: t.videos.linkKeyHint,
            fieldUrl: t.videos.linkUrl,
            fieldUrlHint: t.videos.linkUrlHint,
          }}
          common={common}
          rpcMessages={t.rpc}
          save={saveLink}
          remove={removeLink}
          idPrefix="l"
        />
      </>
    );
  } else if (bereich === "dateien") {
    const axes = await loadAxes();
    const [{ data: rows }, vocab] = await Promise.all([
      axes.editionId ? supabase.rpc("edition_files_admin", { p_edition_id: axes.editionId }) : Promise.resolve({ data: [] }),
      loadVocabMap(supabase, locale),
    ]);
    inhalt = !axes.editionId ? (
      <EmptyState title={t.productionFiles.emptyTitle} description={t.productionFiles.emptyBody} />
    ) : (
      <>
        <p className="ct-help mb-4 max-w-text">{m.filesLead}</p>
        <DateienView
          editionId={axes.editionId}
          files={(rows ?? []) as EditionFileRow[]}
          kinds={vgroup(vocab, "edition_file_kind")}
          dateLocale={t.meta.dateLocale}
          t={t.productionFiles}
          common={{ cancel: t.common.cancel, delete: t.common.delete, upload: t.common.upload, chooseOtherFile: t.common.chooseOtherFile }}
        />
      </>
    );
  } else {
    const { data: kontakte } = darfKontakte ? await supabase.rpc("edition_contacts_admin") : { data: [] };
    const liste = (kontakte ?? []) as AdminKontakt[];
    const ohneFoto = liste.filter((k) => !k.photo_path);
    inhalt = (
      <div className="grid gap-4 md:grid-cols-2">
        {darfKontakte && (
          <Card>
            <CardHeader
              ebene="h2"
              title={m.photosTitle}
              description={m.photosLead.replace("{mit}", String(liste.length - ohneFoto.length)).replace("{gesamt}", String(liste.length))}
            />
            {ohneFoto.length > 0 && (
              <>
                <p className="ct-label">{m.photosMissing}</p>
                <ul className="ct-small mt-1 flex flex-col gap-1">
                  {ohneFoto.map((k) => <li key={k.id}>{k.display_name}</li>)}
                </ul>
              </>
            )}
            <div className="mt-4">
              <ButtonLink href="/admin/ansprechpartner" variant="secondary" size="sm">{m.photosEdit}</ButtonLink>
            </div>
          </Card>
        )}
        {darfGrafiken && (
          <Card>
            <CardHeader ebene="h2" title={m.graphicsTitle} description={m.graphicsLead} />
            <ButtonLink href="/admin/grafiken" variant="secondary" size="sm">{m.graphicsEdit}</ButtonLink>
          </Card>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader word={t.admin.words.videos} title={m.title} description={m.lead} />
      <nav aria-label={m.areasLabel} className="mb-6 flex flex-wrap gap-2">
        {BEREICHE.filter((b) => sichtbar[b]).map((b) => (
          <ButtonLink
            key={b}
            href={`/admin/medien?bereich=${b}`}
            size="sm"
            variant={b === bereich ? "secondary" : "ghost"}
            aria-current={b === bereich ? "page" : undefined}
          >
            {m[`area_${b}`]}
          </ButtonLink>
        ))}
      </nav>
      {inhalt}
    </>
  );
}
