import { neuesFenster } from "@/components/ui/neues-fenster";
import { BEWERBUNG_PROFILFELDER, istVerdeckt, type BewerbungFuerDetails } from "@/components/partner/bewerbung";

type Strings = Record<string, string>;

/**
 * Profil, LinkedIn und Antworten einer Bewerbung (aus `ApplicantList`
 * herausgelöst, ADM-003) — in den Partner-Karten und in den aufgeklappten
 * Zeilen der Admin-Liste dieselbe Darstellung. Die Antworten stehen unter
 * ihrem Schlüssel; wer Fragetexte hat, gibt sie als Schlüssel herein.
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
  const profil = BEWERBUNG_PROFILFELDER.map((key) => [key, a.profile?.[key] ?? null] as const).filter(([, v]) => v);
  const linkedin = typeof a.profile?.linkedin_url === "string" ? a.profile.linkedin_url : null;
  const antworten = a.answers ? Object.entries(a.answers) : [];
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
              <dd className="whitespace-pre-line">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
