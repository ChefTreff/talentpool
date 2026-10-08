import { neuesFenster } from "@/components/ui/neues-fenster";
import {
  antwortZeilen,
  linkedinUrl,
  profilFelder,
  type BewerbungFuerDetails,
  type ProfilWerte,
} from "@/components/partner/bewerbung";

type Strings = Record<string, string>;

/**
 * Das Profil einer Bewerbung für das Schubfach (PART-122, Konrad 05.10.: „Person anklickbar →
 * Profilansicht, nur die Felder, die die Person zur Weitergabe freigegeben hat“).
 *
 * Gezeigt wird genau das, was `applications_for_session` mit Einwilligung der Person liefert: sechs
 * Profilfelder, die LinkedIn-Adresse und die Antworten auf die Fragen der Session. Ohne Einwilligung
 * liefert die Funktion nichts davon, und die Liste öffnet das Schubfach gar nicht erst (die Person ist
 * dort nicht anklickbar). Mehr Profilfelder — Skills, Interessen — gibt es erst, wenn die Weitergabe
 * geklärt ist (K-72, K-78) und die Funktion mehr liefert.
 *
 * Die Admin-Liste (ADM-003) zeigt Profil und Antworten weiter in `BewerbungDetails`, aufgeklappt in der
 * Zeile; dieser Baustein ist die große Fassung für das Schubfach.
 *
 * `werte` übersetzt die Vokabelfelder (Status, Erfahrung, Fach) in ihre Beschriftung; ohne sie stünde
 * „master“ statt „Master-Student“ da.
 */
export function BewerbungProfil({
  application: a,
  t,
  werte,
}: {
  application: BewerbungFuerDetails;
  t: Strings;
  werte?: ProfilWerte;
}) {
  const felder = profilFelder(a.profile, werte);
  const link = linkedinUrl(a.profile);
  const antworten = antwortZeilen(a.answers);
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="ct-eyebrow text-muted">{t.detailProfile}</h3>
        {felder.length === 0 && !link ? (
          <p className="ct-help mt-2">{t.detailNoProfile}</p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              {felder.map(([key, value]) => (
                <div key={key} className="col-span-2 grid grid-cols-subgrid">
                  <dt className="ct-help">{t[`profile_${key}`] ?? key}</dt>
                  <dd className="ct-small text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {link && (
              <a className="ct-link mt-3 inline-flex items-center pointer-coarse:min-h-11" href={link} {...neuesFenster}>
                LinkedIn
              </a>
            )}
          </>
        )}
      </section>

      <section>
        <h3 className="ct-eyebrow text-muted">{t.detailAnswers}</h3>
        {antworten.length === 0 ? (
          <p className="ct-help mt-2">{t.detailNoAnswers}</p>
        ) : (
          <dl className="mt-2 flex flex-col gap-4">
            {antworten.map(([frage, antwort]) => (
              <div key={frage}>
                <dt className="ct-label text-ink">{frage}</dt>
                <dd className="ct-small mt-1 whitespace-pre-line text-ink">{antwort}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <p className="ct-help">{t.detailNote}</p>
    </div>
  );
}
