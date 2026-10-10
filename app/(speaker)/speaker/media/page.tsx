import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { MediaKitListe } from "@/components/partner/MediaKitListe";
import type { SpeakerProfile } from "../types";
import { BUCKET, URL_GUELTIG_SEKUNDEN, type PhotoMitUrls, type SessionPhoto } from "./types";

export const dynamic = "force-dynamic";

/** Eine Zeile aus `edition_files` — hier interessiert nur das Media Kit. */
type MediaKitDatei = {
  id: string;
  kind: string;
  storage_path: string;
  filename: string;
  size_bytes: number | null;
  label_de: string | null;
  label_en: string | null;
};

/**
 * „Deine Bilder" (SPK-019, umbenannt und aufgeräumt mit SPK-039).
 *
 * Konrad am 17.09.: „elementarer Bestandteil unseres Marketings — wir setzen
 * auf die Reichweite der Speaker." Am 21.09. kam der Zuschnitt dazu: **diese
 * Seite zeigt nur noch Bilder.** Die Post-Vorlagen und die Speaker-Grafik
 * stehen jetzt gemeinsam unter „Deine Grafik" — Grafik und Text gehören zu
 * einem Post, die Fotos sind das getrennte Ding.
 *
 * **Dazu das Media Kit** (SPK-090, Konrad 05.10.: „Logos von ChefTreff oder ein
 * ChefTreff-Media-Kit einmal zum Download zur Verfügung stellen für
 * beispielsweise eigene Postings"): die Dateien der Edition mit der Art
 * `media_kit` und der Zielgruppe `speaker`, als Download-Liste wie auf
 * `/partner/media`. Das Marketing pflegt sie unter `/admin/grafiken`, je Datei
 * mit der Wahl „Partner / Speaker". Es steht **oben**: vor dem Summit ist es das
 * Einzige, was hier liegt; die Bühnenfotos kommen erst nach dem Auftritt. Der
 * Bucket ist privat, `edition_file_path_allowed` lässt nur Konten lesen, deren
 * Zielgruppe an der Datei steht — die Links signiert die Seite mit der Sitzung.
 */
export default async function SpeakerMediaPage() {
  await requireArea("speaker", "/speaker/media");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: photoRows }, { data: profileJson }] = await Promise.all([
    supabase.rpc("my_session_photos"),
    supabase.rpc("my_speaker_profile"),
  ]);
  const fotos = (photoRows ?? []) as SessionPhoto[];

  // Das Media Kit der Edition des eigenen Profils; ohne Profil (z. B. ein Admin) wählt die Funktion die laufende
  // oder nächste Edition. Zielgruppe `speaker`: die Funktion leitet sie aus den Rollen ab, sie glaubt dem Aufruf nicht.
  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const { data: kitRows } = await supabase.rpc("edition_files", {
    p_audience: "speaker",
    p_edition_id: profile?.edition_id ?? null,
  });
  const kit = ((kitRows ?? []) as MediaKitDatei[]).filter((d) => d.kind === "media_kit");
  const kitLinks = await Promise.all(
    kit.map(
      async (d) =>
        (await supabase.storage.from("edition-files").createSignedUrl(d.storage_path, URL_GUELTIG_SEKUNDEN, { download: d.filename }))
          .data?.signedUrl ?? null,
    ),
  );

  // Zwei Sätze signierter URLs: einer zum Ansehen, einer mit
  // `Content-Disposition: attachment`. Das HTML-Attribut `download` wirkt an
  // einem fremden Ursprung nicht — ohne die zweite URL öffnete der Knopf das
  // Bild bloss in einem neuen Tab, statt es zu speichern.
  const pfade = fotos.map((f) => f.storage_path);
  const [ansicht, download] = pfade.length
    ? await Promise.all([
        supabase.storage.from(BUCKET).createSignedUrls(pfade, URL_GUELTIG_SEKUNDEN),
        supabase.storage
          .from(BUCKET)
          .createSignedUrls(pfade, URL_GUELTIG_SEKUNDEN, { download: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const ansichtUrl = new Map((ansicht.data ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));
  const downloadUrl = new Map((download.data ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));

  const mitUrls: PhotoMitUrls[] = fotos.map((f) => ({
    ...f,
    url: ansichtUrl.get(f.storage_path) ?? null,
    downloadUrl: downloadUrl.get(f.storage_path) ?? null,
  }));

  // Fotos nach Session bündeln — die Reihenfolge aus der RPC (nach Slotzeit)
  // bleibt erhalten, weil `Map` die Einfügereihenfolge behält.
  const gruppen = new Map<
    string,
    { titel: string | null; start: string | null; fotos: PhotoMitUrls[] }
  >();
  for (const f of mitUrls) {
    const g = gruppen.get(f.session_id) ?? { titel: f.session_title, start: f.start_at, fotos: [] };
    g.fotos.push(f);
    gruppen.set(f.session_id, g);
  }

  const zeit = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="max-w-detail">
      <PageHeader word={t.speaker.wordMemories} title={t.speakerMedia.title} description={t.speakerMedia.lead} />

      <div className="flex flex-col gap-8">
        {/* Media Kit (SPK-090): Logos, Vorlagen, Textbausteine für eigene Beiträge. Ohne Datei ein Satz, der sagt, dass es kommt. */}
        <Card id="media-kit">
          <CardHeader ebene="h2" title={t.speakerMedia.kitTitle} description={t.speakerMedia.kitLead} />
          {kit.length === 0 ? (
            <EmptyState title={t.speakerMedia.kitEmptyTitle} description={t.speakerMedia.kitEmptyBody} />
          ) : (
            <MediaKitListe
              dateien={kit}
              links={kitLinks}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              downloadLabel={t.speakerMedia.download}
            />
          )}
        </Card>

        {/* Die Bühnenfotos: ein eigener Abschnitt, damit die Überschriften der Sessions darunter eine Ebene tiefer stehen. */}
        <section id="fotos" aria-labelledby="h-fotos" className="scroll-mt-20">
          <h2 id="h-fotos" className="ct-h2 mb-4 text-ink">
            {t.speakerMedia.photosTitle}
          </h2>
          {gruppen.size === 0 ? (
            <EmptyState
              title={t.speakerMedia.photosEmptyTitle}
              description={t.speakerMedia.photosEmptyBody}
              action={<ButtonLink href="/speaker/grafik">{t.speakerMedia.toGraphicAction}</ButtonLink>}
            />
          ) : (
            <div className="flex flex-col gap-6">
              {[...gruppen.entries()].map(([sessionId, g]) => (
                <Card key={sessionId} className="p-4">
                  <h3 className="ct-label text-ink">{g.titel ?? t.speaker.untitled}</h3>
                  {g.start && <p className="ct-help mt-1">{zeit.format(new Date(g.start))}</p>}
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.fotos.map((f) => (
                      <li key={f.id} className="flex flex-col gap-2 rounded-ct-md border p-3">
                        {f.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige URL; kein Loader-Ziel
                          <img
                            src={f.url}
                            alt={t.speakerMedia.photoAlt.replace("{title}", g.titel ?? "")}
                            className="aspect-video w-full rounded-ct-sm object-cover"
                          />
                        ) : (
                          <div className="aspect-video w-full rounded-ct-sm bg-surface-hover" />
                        )}
                        {f.credit && (
                          <p className="ct-help">
                            {t.speakerMedia.credit}: {f.credit}
                          </p>
                        )}
                        {f.downloadUrl && (
                          <ButtonLink
                            href={f.downloadUrl}
                            // Lädt herunter (signierte Adresse mit `download: true`),
                            // deshalb kein neues Fenster — es bliebe leer (QS-034).
                            download
                            variant="secondary"
                            size="sm"
                            className="self-start"
                          >
                            {t.speakerMedia.download}
                          </ButtonLink>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="ct-help mt-4">{t.speakerMedia.usageNote}</p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
