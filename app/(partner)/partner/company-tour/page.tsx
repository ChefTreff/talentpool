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
 */
export default async function PartnerCompanyTourPage() {
  await requireArea("partner", "/partner/company-tour");
  const { supabase, locale, t, stopps, gebucht, canEdit } = await ladeTour();
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
      <TourKopf gebucht={gebucht} stopps={stopps.length} word={t.partner.wordInvitation} t={s} />
      <div className="flex flex-col gap-8">
        {stopps.map((x) => {
          const titel = s.stopTitle.replace("{n}", String(x.sort_order)).replace("{tour}", x.tour_name);
          return (
          <section key={x.stop_id} aria-label={titel} className="flex flex-col gap-4">
            <Card>
              <CardHeader title={titel} description={x.track ?? undefined} />
              <dl className="ct-small grid gap-x-6 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="ct-label text-muted">{s.stopTime}</dt>
                  <dd className="tabular-nums text-ink">{zeitraum(x.arrival_at, x.departure_at, t.meta.dateLocale) ?? s.pending}</dd>
                </div>
                <div>
                  <dt className="ct-label text-muted">{s.meetingPoint}</dt>
                  <dd className="text-ink">{x.meeting_point ?? s.pending}</dd>
                </div>
                <div>
                  <dt className="ct-label text-muted">{s.tourTime}</dt>
                  <dd className="tabular-nums text-ink">{zeitraum(x.tour_starts_at, x.tour_ends_at, t.meta.dateLocale) ?? s.pending}</dd>
                </div>
              </dl>
            </Card>

            {/* `edition_contact` verlangt Mail und Telefon (Serviceversprechen); ohne beides keine halbe Karte. */}
            {x.lead_name && x.lead_email && x.lead_phone && (
              <div className="flex flex-col gap-3">
                <h3 className="ct-h3 text-ink">{s.leadTitle}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ContactCard
                    name={x.lead_name}
                    role={(locale === "en" ? x.lead_role_en : x.lead_role_de) ?? s.leadRole}
                    email={x.lead_email}
                    phone={x.lead_phone}
                    photoUrl={contactPhotoUrl(x.lead_photo_path)}
                  />
                </div>
              </div>
            )}

            <Card>
              <CardHeader title={s.formTitle} description={s.formLead} />
              <TourStopp
                stopp={x}
                felder={felder}
                canEdit={canEdit}
                save={updateTourStop}
                dateLocale={t.meta.dateLocale}
                t={s as unknown as Record<string, string>}
                rpcMessages={t.rpc}
              />
            </Card>
          </section>
          );
        })}
      </div>
    </>
  );
}
