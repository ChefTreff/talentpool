import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { formatDay } from "@/lib/tz";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ansprechpartner } from "@/components/kontakt/Ansprechpartner";
import { loadMyContacts } from "@/components/kontakt/load";
import { ReceptionCard } from "./ReceptionCard";
import { STEP_HREF, type MyReception, type SpeakerProfile } from "./types";

export const dynamic = "force-dynamic";

/**
 * Rückfall, solange dieser Speakerin niemand zugeordnet ist.
 *
 * Bis zum 17.09. stand hier nur dieses Postfach — Antwort 71 verbot private
 * Kontaktdaten im Portal. Konrad hat die Regel an diesem Tag aufgehoben:
 * „Ich möchte keine Rollenpostfächer … die sind elementar für unser
 * Serviceversprechen." Seither steht die betreuende Person mit Namen, Foto,
 * Mail und Telefon hier (SPK-015). Das Postfach bleibt als Notausgang: eine
 * Seite ohne jede Erreichbarkeit wäre schlechter als eine mit Sammeladresse.
 */
const SPEAKER_MAILBOX = "speaker@chef-treff.de";

export default async function SpeakerPage() {
  await requireArea("speaker", "/speaker");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: profileJson }, vocab, { data: photoRows }] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
    loadVocabMap(supabase, locale),
    // Nur die Anzahl zählt hier. Vor dem Summit ist die Liste leer, danach ist
    // sie das Erste, was eine Speakerin sehen will (SPK-019).
    supabase.rpc("my_session_photos"),
  ]);
  const fotoZahl = (photoRows ?? []).length;
  const profile = (profileJson ?? null) as SpeakerProfile | null;

  if (!profile) {
    return (
      <>
        <PageHeader title={t.speaker.title} description={t.speaker.lead} />
        <EmptyState
          title={t.speaker.noProfileTitle}
          description={t.speaker.noProfileBody}
          action={
            <a className="ct-link" href={`mailto:${SPEAKER_MAILBOX}`}>
              {SPEAKER_MAILBOX}
            </a>
          }
        />
      </>
    );
  }

  // Die Veranstaltungstage stehen an der Edition; ohne Slot ist das alles, was
  // ein Speaker vorab braucht.
  const { data: dayRows } = await supabase
    .from("event_day")
    .select("day_date, event_id, event:event_id(edition_id, id)")
    .order("day_date");
  const days = ((dayRows ?? []) as unknown as {
    day_date: string;
    event: { edition_id: string | null; id: string } | { edition_id: string | null; id: string }[] | null;
  }[])
    .filter((d) => {
      const e = Array.isArray(d.event) ? d.event[0] : d.event;
      return e && (e.edition_id === profile.edition_id || e.id === profile.edition_id);
    })
    .map((d) => d.day_date);
  // Summit und Hackathon teilen sich Tage — die Edition hat jeden Tag einmal.
  const eventDays = [...new Set(days)].sort();

  // Die eigenen Ansprechpersonen (SPK-015). `my_contacts` liefert Lead und
  // Buddy beider Bereiche; hier zählt nur die Speaker-Seite — ein Partner-Buddy
  // hat mit dem Auftritt nichts zu tun.
  const kontakte = (await loadMyContacts(profile.edition_id)).filter((k) => k.via === "speaker");

  // Die Reception kommt nur, wenn diese Person eingeladen ist — die RPC gibt
  // sie sonst gar nicht heraus (SPK-003).
  const { data: receptionRows } = await supabase.rpc("my_receptions");
  const receptions = (receptionRows ?? []) as MyReception[];

  const types = vgroup(vocab, "speaker_type");
  const pipeline = vgroup(vocab, "speaker_pipeline");
  const open = profile.next_steps?.open ?? [];
  const person = profile.person;
  const speakerName =
    [person.first_name, person.last_name].filter(Boolean).join(" ") || (person.email ?? "");

  const STEPS: Record<string, { title: string; body: string }> = {
    profile: { title: t.speaker.stepProfileTitle, body: t.speaker.stepProfileBody },
    photo: { title: t.speaker.stepPhotoTitle, body: t.speaker.stepPhotoBody },
    consents: { title: t.speaker.stepConsentsTitle, body: t.speaker.stepConsentsBody },
    session: { title: t.speaker.stepSessionTitle, body: t.speaker.stepSessionBody },
    session_content: {
      title: t.speaker.stepContentTitle,
      body: t.speaker.stepContentBody,
    },
    presentation: {
      title: t.speaker.stepPresentationTitle,
      body: t.speaker.stepPresentationBody,
    },
    ticket: { title: t.speaker.stepTicketTitle, body: t.speaker.stepTicketBody },
  };
  const done = Object.keys(STEPS).filter((key) => !open.includes(key));

  return (
    <div className="max-w-[900px]">
      <PageHeader title={t.speaker.title} description={t.speaker.lead} />

      {profile.is_assistant && (
        <p className="mb-6 rounded-ct-md border border-accent-soft bg-accent-soft px-4 py-3 ct-small text-accent-deep">
          {t.speaker.assistantBanner.replace("{name}", speakerName)}{" "}
          {t.speaker.assistantConsentNote}
        </p>
      )}

      {fotoZahl > 0 && (
        <NextStepBanner
          label={t.speaker.photosReadyLabel}
          title={t.speaker.photosReadyTitle}
          hint={t.speaker.photosReadyHint}
          action={
            <ButtonLink href="/speaker/media" variant="onAccent">
              {t.speaker.photosReadyAction}
            </ButtonLink>
          }
        />
      )}

      <section aria-labelledby="h-next" className="mb-8">
        <h2 id="h-next" className="ct-h3 mb-3 text-ink">
          {open.length > 0 ? t.speaker.openSteps : t.speaker.allDone}
        </h2>
        {open.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((key) => {
              const step = STEPS[key];
              if (!step) return null;
              const href = STEP_HREF[key];
              return (
                <Card as="li" key={key} className="p-4">
                  <h3 className="ct-label text-ink">{step.title}</h3>
                  <p className="ct-help mt-1">{step.body}</p>
                  {href ? (
                    <Link href={href} className="ct-link mt-3 inline-block">
                      {step.title}
                    </Link>
                  ) : (
                    // Seite gibt es noch nicht (B3/B5, Upload mit A4) — dann
                    // lieber sagen, dass es kommt, als ins Leere verlinken.
                    <p className="ct-help mt-3 font-semibold">{t.speaker.soon}</p>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
        {done.length > 0 && (
          <p className="ct-help mt-3">
            {t.speaker.doneLabel}: {done.map((k) => STEPS[k].title).join(" · ")}
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="ct-h3 text-ink">{t.speaker.statusTitle}</h2>
          <dl className="ct-help mt-2 flex flex-col gap-1">
            <div className="flex gap-2">
              <dt className="font-semibold">{t.speaker.statusType}:</dt>
              <dd>{types[profile.speaker_type] ?? profile.speaker_type}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold">{t.speaker.statusPipeline}:</dt>
              <dd>
                <Badge>{pipeline[profile.pipeline_status] ?? profile.pipeline_status}</Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="ct-h3 text-ink">{t.speaker.eventTitle}</h2>
          <p className="ct-help mt-2">{profile.edition_name}</p>
          {eventDays.length > 0 && (
            <p className="ct-help mt-1">
              {t.speaker.eventDays}:{" "}
              {eventDays.map((d) => formatDay(d, t.meta.dateLocale)).join(" · ")}
            </p>
          )}
        </Card>

        {kontakte.length === 0 && (
          <Card className="p-4 sm:col-span-2">
            <h2 className="ct-h3 text-ink">{t.speaker.supportTitle}</h2>
            <p className="ct-help mt-2">{t.speaker.supportBody}</p>
            <a className="ct-link mt-2 inline-block" href={`mailto:${SPEAKER_MAILBOX}`}>
              {SPEAKER_MAILBOX}
            </a>
          </Card>
        )}
      </div>

      {/* Die Einladung steht vor den Ansprechpersonen: sie ist das Einzige auf
          dieser Seite, das eine Antwort verlangt. */}
      {receptions.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          {receptions.map((r) => (
            <ReceptionCard
              key={r.id}
              reception={r}
              isAssistant={profile.is_assistant}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              t={t.speakerReception}
              common={{ save: t.common.save }}
              rpcMessages={t.rpc}
            />
          ))}
        </div>
      )}

      {/* Wer für dich zuständig ist — mit Gesicht, Mail und Telefon. Die Karte
          fällt weg, wenn niemand zugeordnet ist; dann steht oben das Postfach. */}
      {kontakte.length > 0 && (
        <div className="mt-8">
          <Ansprechpartner
            kontakte={kontakte}
            locale={locale}
            title={t.speaker.contactsTitle}
            lead={t.speaker.contactLead}
            buddy={t.speaker.contactBuddy}
          />
        </div>
      )}
    </div>
  );
}
