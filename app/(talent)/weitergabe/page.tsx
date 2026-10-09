import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { PRIVACY_URL } from "@/components/layout/PortalFooter";

/**
 * Weitergabe an Partner (PART-129, K-72, Fassung B): der Langtext zur Einwilligung in der Bewerbung. Enthält keine
 * Daten einer Person; der Kurztext in der Bewerbungsmaske verlinkt hierher.
 */
export default async function WeitergabePage() {
  await requireUser("/weitergabe");
  const { t } = await getI18n();
  const s = t.talentShare as unknown as Record<string, string>;
  const abschnitte: [string, string][] = [
    [s.notTitle, s.not],
    [s.purposeTitle, s.purpose],
    [s.basisTitle, s.basis],
    [s.durationTitle, s.duration],
    [s.withdrawTitle, s.withdraw],
    [s.recipientTitle, s.recipient],
    [s.controllerTitle, s.controller],
  ];
  return (
    <>
      <PageHeader title={s.title} description={s.lead} />
      <Card>
        <ul className="ct-small flex list-disc flex-col gap-1 pl-5">
          {[s.data1, s.data2, s.data3, s.data4].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-4">
          {abschnitte.map(([titel, text]) => (
            <section key={titel} className="flex flex-col gap-1">
              <h2 className="ct-label">{titel}</h2>
              <p className="ct-small">{text}</p>
            </section>
          ))}
        </div>
        <p className="ct-help mt-6">{s.draft}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/meine" variant="secondary">
            {s.back}
          </ButtonLink>
          <a href={PRIVACY_URL} {...neuesFenster} className="ct-link self-center">
            {s.privacyLink}
          </a>
        </div>
      </Card>
    </>
  );
}
