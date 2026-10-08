import { neuesFenster } from "@/components/ui/neues-fenster";
import { antwortZeilen, istVerdeckt, linkedinUrl, profilFelder, type BewerbungFuerDetails } from "@/components/partner/bewerbung";

type Strings = Record<string, string>;

/**
 * Profil, LinkedIn und Antworten einer Bewerbung in den aufgeklappten Zeilen
 * der Admin-Liste (aus `ApplicantList` herausgelöst, ADM-003). Das Partner-
 * Portal zeigt dieselben Angaben seit PART-122 im Schubfach (`BewerbungProfil`);
 * was angezeigt wird, entscheiden die Helfer in `bewerbung.ts` für beide.
 * Die Antworten stehen unter ihrem Schlüssel; wer Fragetexte hat, gibt sie
 * als Schlüssel herein.
 *
 * `verdeckt` steht vorgabegemäss auf dem Datenstand (`istVerdeckt`). Die
 * Admin-Liste setzt es auf `false`: das Team bekommt Profil und Antworten
 * immer, auch wenn eine Person ohne Einwilligung keinen Namen hinterlegt hat.
 */
export function BewerbungDetails({
  application: a,
  t,
  verdeckt = istVerdeckt(a),
}: {
  application: BewerbungFuerDetails;
  t: Strings;
  verdeckt?: boolean;
}) {
  if (verdeckt) return <p className="ct-help mt-2">{t.hiddenBody}</p>;
  const profil = profilFelder(a.profile);
  // Die Adresse stammt aus dem Profil der Person: nur http und https werden verlinkt (PART-122).
  const linkedin = linkedinUrl(a.profile);
  const antworten = antwortZeilen(a.answers);
  return (
    <>
      {profil.length > 0 && (
        <dl className="ct-help mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {profil.map(([key, value]) => (
            <div key={key} className="flex gap-1">
              <dt className="font-semibold">{t[`profile_${key}`] ?? key}:</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {linkedin && (
        <a className="ct-link mt-1 inline-block" href={linkedin} {...neuesFenster}>
          LinkedIn
        </a>
      )}
      {antworten.length > 0 && (
        <dl className="ct-help mt-2 flex flex-col gap-1">
          {antworten.map(([key, value]) => (
            <div key={key}>
              <dt className="font-semibold">{key}</dt>
              <dd className="whitespace-pre-line">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
