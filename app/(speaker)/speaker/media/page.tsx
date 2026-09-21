import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { MySession } from "../session/types";
import {
  BUCKET,
  POST_VORLAGEN,
  URL_GUELTIG_SEKUNDEN,
  type GefuellterPost,
  type PhotoMitUrls,
  type SessionPhoto,
} from "./types";

export const dynamic = "force-dynamic";

/** Platzhalter der Vorlagen füllen; unbekannte Namen fallen leer heraus. */
function fuellen(vorlage: string, werte: Record<string, string>): string {
  return vorlage.replace(/\{(\w+)\}/g, (_, name: string) => werte[name] ?? "");
}

/**
 * „Deine Medien" (SPK-019).
 *
 * Konrad am 17.09.: „elementarer Bestandteil unseres Marketings — wir setzen
 * auf die Reichweite der Speaker." Die Seite hat deshalb genau eine Aufgabe:
 * es einer Speakerin leicht machen, über ihren Auftritt zu posten. Fotos
 * herunterladen, einen Text mitnehmen, die Grafik holen.
 *
 * **Die Seite ist das ganze Jahr nützlich.** Fotos gibt es erst nach dem Slot,
 * die Ankündigungsvorlage aber schon vorher — deshalb steht der Leerzustand
 * nur über den Fotos und nicht über der Seite.
 *
 * **Die Vorlagen sind ein Gerüst, kein fertiger Post.** Die eckigen Klammern
 * bleiben absichtlich im kopierten Text stehen: ein Post, den hundert Leute
 * wortgleich absetzen, nützt niemandem. Der Wortlaut gehört Marketing
 * (ADM-027) und liegt deshalb im Wörterbuch, nicht im Code.
 */
export default async function SpeakerMediaPage() {
  await requireArea("speaker", "/speaker/media");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: photoRows }, { data: sessionRows }] = await Promise.all([
    supabase.rpc("my_session_photos"),
    supabase.rpc("my_sessions"),
  ]);
  const fotos = (photoRows ?? []) as SessionPhoto[];
  const sessions = (sessionRows ?? []) as MySession[];

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
  const gruppen = new Map<string, { titel: string | null; start: string | null; fotos: PhotoMitUrls[] }>();
  for (const f of mitUrls) {
    const g = gruppen.get(f.session_id) ?? { titel: f.session_title, start: f.start_at, fotos: [] };
    g.fotos.push(f);
    gruppen.set(f.session_id, g);
  }

  const zeit = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Vorlagen je Session mit Titel. Ohne Titel gibt es nichts zu füllen, und
  // ein Post mit einer Lücke darin wäre schlechter als keiner.
  const mitTitel = sessions
    .map((s) => ({ session: s, titel: (locale === "de" ? s.title_de : s.title_en) ?? s.title_de ?? s.title_en }))
    .filter((s): s is { session: MySession; titel: string } => Boolean(s.titel));

  const vorlagenJeSession = mitTitel.map(({ session, titel }) => ({
    session,
    titel,
    posts: POST_VORLAGEN.map<GefuellterPost>((key) => ({
      key,
      label: t.speakerMedia[`${key}Label`],
      hint: t.speakerMedia[`${key}Hint`],
      text: fuellen(t.speakerMedia[`${key}Text`], {
        title: titel,
        event: session.event_name ?? "",
      }),
    })),
  }));

  return (
    <div className="max-w-[900px]">
      <PageHeader title={t.speakerMedia.title} description={t.speakerMedia.lead} />

      <section aria-labelledby="h-photos" className="mb-10">
        <h2 id="h-photos" className="ct-h3 mb-3 text-ink">
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
                      {f.credit && <p className="ct-help">{t.speakerMedia.credit}: {f.credit}</p>}
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
      </section>

      <section aria-labelledby="h-posts" className="mb-10">
        <h2 id="h-posts" className="ct-h3 mb-1 text-ink">
          {t.speakerMedia.postsTitle}
        </h2>
        <p className="ct-help mb-3">{t.speakerMedia.postsLead}</p>
        {vorlagenJeSession.length === 0 ? (
          <p className="ct-help">{t.speakerMedia.postsNoSession}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {vorlagenJeSession.map(({ session, titel, posts }) => (
              <div key={session.session_id}>
                {vorlagenJeSession.length > 1 && (
                  <h3 className="ct-label mb-2 text-ink">{titel}</h3>
                )}
                <Accordion>
                  {posts.map((p, i) => (
                    <AccordionItem key={p.key} question={p.label} defaultOpen={i === 0}>
                      <p className="ct-help">{p.hint}</p>
                      <p className="ct-small mt-3 whitespace-pre-line rounded-ct-md border bg-canvas p-4 text-ink">
                        {p.text}
                      </p>
                      <CopyButton
                        className="mt-3"
                        size="sm"
                        value={p.text}
                        label={t.speakerMedia.copy}
                        copiedLabel={t.speakerMedia.copied}
                        failedLabel={t.speakerMedia.copyFailed}
                      />
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="h-graphic">
        <h2 id="h-graphic" className="ct-h3 mb-3 text-ink">
          {t.speakerMedia.graphicTitle}
        </h2>
        <Card className="p-4">
          <p className="ct-help">{t.speakerMedia.graphicBody}</p>
          <Link href="/speaker/grafik" className="ct-link mt-3 inline-block">
            {t.speakerMedia.toGraphicAction}
          </Link>
        </Card>
      </section>
    </div>
  );
}
