import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { CopyButton } from "@/components/ui/CopyButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { GrafikMaske } from "./GrafikMaske";
import { PostGenerator } from "./PostGenerator";
import { POST_VORLAGEN, fuellen, type GefuellterPost } from "./posts";
import type { MySession } from "../session/types";
import type { SpeakerProfile } from "../types";

export const dynamic = "force-dynamic";

/** Dateiname ohne Sonderzeichen — er landet im Download-Ordner des Speakers. */
function dateiname(vorname: string | null, nachname: string | null): string {
  const name = [vorname, nachname].filter(Boolean).join("-").toLowerCase();
  const sauber = name
    .normalize("NFKD")
    // Ohne diese Zeile wird aus „Müller" ein „mu-ller": die Zerlegung trennt
    // den Umlaut in „u" und ein kombinierendes Trema, und das Trema fällt in
    // den nächsten Schritt (gefunden beim Bauen von SPK-014, 21.09.).
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sauber ? `hear-me-speak-${sauber}` : "hear-me-speak";
}

/**
 * „Deine Grafik" (SPK-013) — seit SPK-039 zusammen mit den Post-Vorlagen.
 *
 * Konrad am 21.09.: „Texte würde ich als zweiten Punkt auf die Seite von
 * ‚Deine Grafik' passen." Das stimmt: Grafik und Text gehören zu **einem**
 * Post. Die Bühnenfotos sind das getrennte Ding und stehen unter „Deine
 * Bilder".
 *
 * Das Porträt verlässt den Browser nicht; die Seite lädt nur den Namen für den
 * Dateinamen und die Session für die Vorlagen.
 */
export default async function SpeakerGrafikPage() {
  await requireArea("speaker", "/speaker/grafik");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: profileJson }, { data: sessionRows }] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
    supabase.rpc("my_sessions"),
  ]);
  const profile = (profileJson ?? null) as SpeakerProfile | null;
  const sessions = (sessionRows ?? []) as MySession[];

  // Vorlagen je Session mit Titel. Ohne Titel gibt es nichts zu füllen, und
  // ein Post mit einer Lücke darin wäre schlechter als keiner.
  const vorlagenJeSession = sessions
    .map((s) => ({
      session: s,
      titel: (locale === "de" ? s.title_de : s.title_en) ?? s.title_de ?? s.title_en,
    }))
    .filter((s): s is { session: MySession; titel: string } => Boolean(s.titel))
    .map(({ session, titel }) => ({
      session,
      titel,
      posts: POST_VORLAGEN.map<GefuellterPost>((key) => ({
        key,
        label: t.speakerGraphic[`${key}Label`],
        hint: t.speakerGraphic[`${key}Hint`],
        text: fuellen(t.speakerGraphic[`${key}Text`], {
          title: titel,
          event: session.event_name ?? "",
        }),
      })),
    }));

  return (
    <div className="max-w-[1100px]">
      <PageHeader word={t.speaker.wordSpotlight} title={t.speakerGraphic.title} description={t.speakerGraphic.lead} />
      <GrafikMaske
        vorschlag={dateiname(profile?.person.first_name ?? null, profile?.person.last_name ?? null)}
        t={t.speakerGraphic}
      />

      {/* Der Generator steht **vor** den Vorlagen: wer etwas Eigenes sagen
          will, soll nicht erst an drei fertigen Texten vorbeiscrollen. Wer
          nur schnell etwas braucht, findet die Vorlagen direkt darunter. */}
      <section aria-labelledby="h-generator" className="mt-10 max-w-[900px]">
        <h2 id="h-generator" className="sr-only">
          {t.speakerGraphic.genTitle}
        </h2>
        <PostGenerator
          sessions={vorlagenJeSession.map(({ session, titel }) => ({
            id: session.session_id,
            titel,
            event: session.event_name ?? null,
          }))}
          language={locale === "de" ? "de" : "en"}
          t={t.speakerGraphic}
        />
      </section>

      <section aria-labelledby="h-posts" className="mt-10 max-w-[900px]">
        <h2 id="h-posts" className="ct-h2 mb-1 text-ink">
          {t.speakerGraphic.postsTitle}
        </h2>
        <p className="ct-help mb-3">{t.speakerGraphic.postsLead}</p>
        {vorlagenJeSession.length === 0 ? (
          <p className="ct-help">{t.speakerGraphic.postsNoSession}</p>
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
                        label={t.speakerGraphic.copy}
                        copiedLabel={t.speakerGraphic.copied}
                        failedLabel={t.speakerGraphic.copyFailed}
                      />
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
        <Link href="/speaker/media" className="ct-link mt-4 inline-block">
          {t.speakerGraphic.toPhotos}
        </Link>
      </section>
    </div>
  );
}
