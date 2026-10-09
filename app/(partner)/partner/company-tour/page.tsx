import { requireArea } from "@/lib/auth";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card, CardHeader } from "@/components/ui/Card";
import { ContactCard } from "@/components/ui/ContactCard";
import { contactPhotoUrl } from "@/components/kontakt/photo";
import { TourStopp } from "@/components/partner/TourStopp";
import { updateTourStop } from "../actions";
import { ladeTour, zeitraum } from "./daten";
import { TourKopf } from "./TourKopf";

export const dynamic = "force-dynamic";

/**
 * Company Tour (PART-046). Die Seite erscheint bei gebuchtem Produkt
 * `format_key = 'company_tour'`.
 *
 * Ein Partner bucht **einen Stopp**, nicht die Tour (Konrad 18.09., D5): Tour,
 * Reihenfolge und Zeiten setzt das Team, ebenso die Verknüpfung mit der Session,
 * auf die sich Teilnehmende bewerben. Hier sieht der Partner seinen Stopp und
 * seinen Tour Lead (Name, Foto, E-Mail, Telefon — Konrads Serviceversprechen
 * vom 17.09.) und beantwortet die Fragen aus 2026. Die Bewerbungen stehen im
 * zweiten Reiter.
 *
 * **Mehrere Stopps (QS-079, Konrad 09.10.2026: „bitte global immer so handhaben“):** je Tour besetzt ein Partner höchstens einen Stopp, mehrere
 * Stopps heißt also mehrere Touren. Vorher stand jeder Stopp mit Kopfkarte, Tour Lead und dem ganzen Formular untereinander. Ab zwei Stopps wählt ein
 * Umschalter über den Reitern den Stopp (`?instanz=<Stopp>`, Reiter „Stopp 1 · Tour A“), und darunter steht **genau einer**. Bei einem Stopp gibt es
 * keinen Umschalter, die Seite ist wie vorher.
 */
export default async function PartnerCompanyTourPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/company-tour");
  const { instanz } = await searchParams;
  const { supabase, locale, t, stopps, gewaehlt, instanzen, gebucht, canEdit } = await ladeTour(instanz);
  const s = t.partnerTour;
  const vocab = await loadVocabMap(supabase, locale);
  const alsListe = (m: Record<string, string>) => Object.entries(m).map(([key, label]) => ({ key, label }));
  const felder = {
    occupation_status: alsListe(vgroup(vocab, "occupation_status")),
    career_level: alsListe(vgroup(vocab, "career_level")),
    study_field: alsListe(vgroup(vocab, "study_field")),
  };

  return (
    <>
      <TourKopf gebucht={gebucht} stopps={stopps.length} instanzen={instanzen} word={t.partner.wordInvitation} t={s} />
      {gewaehlt && (
        // `key`: ein Wechsel des Stopps setzt das Formular zurück — der Entwurf des einen bleibt nicht im Feld des anderen stehen.
        <section
          key={gewaehlt.stop_id}
          aria-label={s.stopTitle.replace("{n}", String(gewaehlt.sort_order)).replace("{tour}", gewaehlt.tour_name)}
          className="flex flex-col gap-4"
        >
          <Card>
            {/* Der Stopp ist der Abschnitt: sein Titel ist die h2, Tour Lead und Maske stehen darunter (QS-054). */}
            <CardHeader
              ebene="h2"
              title={s.stopTitle.replace("{n}", String(gewaehlt.sort_order)).replace("{tour}", gewaehlt.tour_name)}
              description={gewaehlt.track ?? undefined}
            />
            <dl className="ct-small grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <div>
                <dt className="ct-label text-muted">{s.stopTime}</dt>
                <dd className="tabular-nums text-ink">{zeitraum(gewaehlt.arrival_at, gewaehlt.departure_at, t.meta.dateLocale) ?? s.pending}</dd>
              </div>
              <div>
                <dt className="ct-label text-muted">{s.meetingPoint}</dt>
                <dd className="text-ink">{gewaehlt.meeting_point ?? s.pending}</dd>
              </div>
              <div>
                <dt className="ct-label text-muted">{s.tourTime}</dt>
                <dd className="tabular-nums text-ink">{zeitraum(gewaehlt.tour_starts_at, gewaehlt.tour_ends_at, t.meta.dateLocale) ?? s.pending}</dd>
              </div>
            </dl>
          </Card>

          {/* `edition_contact` verlangt Mail und Telefon (Serviceversprechen); ohne beides keine halbe Karte. */}
          {gewaehlt.lead_name && gewaehlt.lead_email && gewaehlt.lead_phone && (
            <div className="flex flex-col gap-3">
              <h3 className="ct-h3 text-ink">{s.leadTitle}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <ContactCard
                  name={gewaehlt.lead_name}
                  role={(locale === "en" ? gewaehlt.lead_role_en : gewaehlt.lead_role_de) ?? s.leadRole}
                  email={gewaehlt.lead_email}
                  phone={gewaehlt.lead_phone}
                  photoUrl={contactPhotoUrl(gewaehlt.lead_photo_path)}
                />
              </div>
            </div>
          )}

          <Card>
            <CardHeader ebene="h3" title={s.formTitle} description={s.formLead} />
            <TourStopp
              stopp={gewaehlt}
              felder={felder}
              canEdit={canEdit}
              save={updateTourStop}
              dateLocale={t.meta.dateLocale}
              t={s as unknown as Record<string, string>}
              rpcMessages={t.rpc}
              unsaved={t.common.unsaved}
            />
          </Card>
        </section>
      )}
    </>
  );
}
