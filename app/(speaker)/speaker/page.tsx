import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDay, formatRange } from "@/lib/tz";
import { loadEventDays } from "@/lib/event-days";
import { googleKalenderUrl, outlookKalenderUrl } from "@/lib/kalender-links";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Ansprechpartner } from "@/components/kontakt/Ansprechpartner";
import { loadMyContacts } from "@/components/kontakt/load";
import { ReceptionCard } from "./ReceptionCard";
import { Termine, type Termin } from "./Termine";
import { STEP_HREF, type MyReception, type SpeakerProfile } from "./types";
import type { MySession } from "./session/types";

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

  // Das Vokabular braucht die Startseite seit SPK-025 nicht mehr: mit der Karte
  // „Dein Stand" ist die einzige Stelle weggefallen, die es übersetzte.
  const [{ data: profileJson }, { data: photoRows }] = await Promise.all([
    supabase.rpc("my_speaker_profile"),
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

  // Die Veranstaltungstage stehen an der Edition. Der Helfer liegt in
  // `lib/event-days.ts`, weil die Kalenderroute dieselbe Liste braucht.
  const eventDays = await loadEventDays(supabase, profile.edition_id);

  // Der eigene Slot fuer die Terminliste (SPK-026).
  const { data: sessionRows } = await supabase.rpc("my_sessions");
  const sessions = (sessionRows ?? []) as MySession[];

  // Die eigenen Ansprechpersonen (SPK-015). `my_contacts` liefert Lead und
  // Buddy beider Bereiche; hier zählt nur die Speaker-Seite — ein Partner-Buddy
  // hat mit dem Auftritt nichts zu tun.
  const kontakte = (await loadMyContacts(profile.edition_id)).filter(
    (k) => k.via === "speaker",
  );

  // Die Reception kommt nur, wenn diese Person eingeladen ist — die RPC gibt
  // sie sonst gar nicht heraus (SPK-003).
  const { data: receptionRows } = await supabase.rpc("my_receptions");
  const receptions = (receptionRows ?? []) as MyReception[];

  const open = profile.next_steps?.open ?? [];
  const person = profile.person;
  const speakerName =
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    (person.email ?? "");

  const STEPS: Record<string, { title: string; body: string }> = {
    profile: {
      title: t.speaker.stepProfileTitle,
      body: t.speaker.stepProfileBody,
    },
    photo: { title: t.speaker.stepPhotoTitle, body: t.speaker.stepPhotoBody },
    consents: {
      title: t.speaker.stepConsentsTitle,
      body: t.speaker.stepConsentsBody,
    },
    session: {
      title: t.speaker.stepSessionTitle,
      body: t.speaker.stepSessionBody,
    },
    session_content: {
      title: t.speaker.stepContentTitle,
      body: t.speaker.stepContentBody,
    },
    presentation: {
      title: t.speaker.stepPresentationTitle,
      body: t.speaker.stepPresentationBody,
    },
    ticket: {
      title: t.speaker.stepTicketTitle,
      body: t.speaker.stepTicketBody,
    },
  };
  const done = Object.keys(STEPS).filter((key) => !open.includes(key));

  // --- Termine (SPK-026) ---------------------------------------------------
  // Alles, was feststeht, in einer Liste: der Summit als Rahmen, der eigene
  // Slot, eine zugesagte Reception. Sortiert nach Beginn, damit die Reihenfolge
  // der Wirklichkeit entspricht und nicht der Bauart dieser Datei.
  const tagFormat = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "medium",
  });
  const gesammelt: { start: Date; termin: Termin }[] = [];

  if (eventDays.length > 0) {
    const start = new Date(`${eventDays[0]}T00:00:00.000Z`);
    const ende = new Date(`${eventDays[eventDays.length - 1]}T00:00:00.000Z`);
    const titel = profile.edition_name ?? t.speakerCalendar.editionFallback;
    const daten = { titel, start, ende, ganztaegig: true };
    gesammelt.push({
      start,
      termin: {
        key: "edition",
        datum: eventDays
          .map((d) => formatDay(d, t.meta.dateLocale))
          .join(" \u00b7 "),
        titel,
        google: googleKalenderUrl(daten),
        outlook: outlookKalenderUrl(daten),
        ics: "/api/speaker/kalender?edition=1",
      },
    });
  }

  for (const sitzung of sessions) {
    if (!sitzung.start_at) continue;
    const titel =
      (locale === "de" ? sitzung.title_de : sitzung.title_en) ??
      sitzung.title_de ??
      sitzung.title_en ??
      t.speaker.untitled;
    const ort =
      [sitzung.stage_name, sitzung.room].filter(Boolean).join(", ") ||
      undefined;
    const start = new Date(sitzung.start_at);
    const daten = {
      titel,
      start,
      ende: sitzung.end_at ? new Date(sitzung.end_at) : null,
      ort,
    };
    gesammelt.push({
      start,
      termin: {
        key: `slot-${sitzung.session_id}`,
        datum: tagFormat.format(start),
        zeit: sitzung.end_at
          ? formatRange(
              sitzung.start_at,
              sitzung.end_at,
              sitzung.timezone ?? "Europe/Berlin",
            )
          : undefined,
        titel: `${t.speaker.dateSlotLabel}: ${titel}`,
        ort,
        google: googleKalenderUrl(daten),
        outlook: outlookKalenderUrl(daten),
        ics: `/api/speaker/kalender?session=${sitzung.session_id}`,
      },
    });
  }

  for (const r of receptions) {
    // Nur zugesagte: ein Termin, den man abgesagt hat, gehoert in keinen
    // Kalender \u2014 dieselbe Regel wie in der Kalenderroute.
    if (r.my_status !== "yes") continue;
    const titel = (locale === "en" ? r.title_en : r.title_de) || r.title_de;
    const ort = [r.location, r.address].filter(Boolean).join(", ") || undefined;
    const start = new Date(r.starts_at);
    const daten = {
      titel,
      start,
      ende: r.ends_at ? new Date(r.ends_at) : null,
      ort,
    };
    gesammelt.push({
      start,
      termin: {
        key: `reception-${r.id}`,
        datum: tagFormat.format(start),
        zeit: r.ends_at
          ? formatRange(r.starts_at, r.ends_at, "Europe/Berlin")
          : new Intl.DateTimeFormat(t.meta.dateLocale, {
              timeStyle: "short",
            }).format(start),
        titel,
        ort,
        google: googleKalenderUrl(daten),
        outlook: outlookKalenderUrl(daten),
        ics: `/api/speaker/kalender?reception=${r.id}`,
      },
    });
  }

  const termine = gesammelt
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((g) => g.termin);

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
                    <p className="ct-help mt-3 font-semibold">
                      {t.speaker.soon}
                    </p>
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

      {/* „Dein Stand" ist raus (SPK-025, Konrad 22.09.): die Karte zeigte
          Speaker-Art und Pipeline-Status \u2014 beides interne Felder der
          Speaker-Leitung. Der Pipeline-Status ist eine Akquise-Information; ob
          der Auftritt steht, sagt die Session. */}
      <section aria-labelledby="h-dates" className="mb-8">
        <h2 id="h-dates" className="ct-h3 mb-3 text-ink">
          {t.speaker.datesTitle}
        </h2>
        <Termine
          termine={termine}
          t={{
            empty: t.speaker.datesEmpty,
            add: t.speaker.calendarAdd,
            google: t.speaker.calGoogle,
            outlook: t.speaker.calOutlook,
            apple: t.speaker.calApple,
          }}
        />
        {termine.length > 1 && (
          <a className="ct-link mt-3 inline-block" href="/api/speaker/kalender">
            {t.speaker.calendarAll}
          </a>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {kontakte.length === 0 && (
          <Card className="p-4 sm:col-span-2">
            <h2 className="ct-h3 text-ink">{t.speaker.supportTitle}</h2>
            <p className="ct-help mt-2">{t.speaker.supportBody}</p>
            <a
              className="ct-link mt-2 inline-block"
              href={`mailto:${SPEAKER_MAILBOX}`}
            >
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
