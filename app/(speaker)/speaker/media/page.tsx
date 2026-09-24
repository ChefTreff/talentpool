import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { BUCKET, URL_GUELTIG_SEKUNDEN, type PhotoMitUrls, type SessionPhoto } from "./types";

export const dynamic = "force-dynamic";

/**
 * „Deine Bilder" (SPK-019, umbenannt und aufgeräumt mit SPK-039).
 *
 * Konrad am 17.09.: „elementarer Bestandteil unseres Marketings — wir setzen
 * auf die Reichweite der Speaker." Am 21.09. kam der Zuschnitt dazu: **diese
 * Seite zeigt nur noch Bilder.** Die Post-Vorlagen und die Speaker-Grafik
 * stehen jetzt gemeinsam unter „Deine Grafik" — Grafik und Text gehören zu
 * einem Post, die Fotos sind das getrennte Ding.
 */
export default async function SpeakerMediaPage() {
  await requireArea("speaker", "/speaker/media");
  const { t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const { data: photoRows } = await supabase.rpc("my_session_photos");
  const fotos = (photoRows ?? []) as SessionPhoto[];

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
    <div className="max-w-[900px]">
      <PageHeader title={t.speakerMedia.title} description={t.speakerMedia.lead} />

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
              <h2 className="ct-label text-ink">{g.titel ?? t.speaker.untitled}</h2>
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
    </div>
  );
}
