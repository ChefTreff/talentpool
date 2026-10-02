import { EmbedGate } from "@/components/ui/EmbedGate";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { MATTERPORT_ALLOW, MATTERPORT_SANDBOX, rundgangAus } from "./rundgang-adresse";

type Strings = Record<string, string>;

/**
 * Der 3D-Rundgang des Summits im Partner-Portal (PART-093).
 *
 * Fremde Einbettung, also hinter dem Klick der `EmbedGate`: vorher erfährt
 * Matterport nichts. Danach ein Ladezustand, ein Weg ohne Einbettung unter dem
 * Rahmen (für langsame Verbindungen und blockierte Rahmen) und auf dem Handy
 * ein quadratischer Rahmen, auf dem Desktop 16:9. Was nicht genau die Matterport-Form
 * hat, wird nicht eingebettet, sondern verlinkt (`rundgangAus`).
 *
 * `referrer`: Matterport schränkt, wenn Konrad es dort einstellt, die Seiten
 * ein, die den Rundgang einbetten dürfen — über die Herkunft. Mit der Vorgabe
 * der `EmbedGate` („nichts mitschicken“) liefe diese Einschränkung ins Leere.
 */
export function Rundgang({ url, title, t }: { url: string; title: string; t: Strings }) {
  const r = rundgangAus(url);
  if (!r) return null;
  if (!r.einbettung) {
    return (
      <a className="ct-link" href={r.oeffnen} {...neuesFenster}>
        {t.tourOpenGeneric}
      </a>
    );
  }
  return (
    <EmbedGate
      src={r.einbettung}
      title={title}
      provider="Matterport"
      loadLabel={t.tourLoad}
      notice={t.embedNotice}
      openLabel={t.tourOpen}
      sandbox={MATTERPORT_SANDBOX}
      allow={MATTERPORT_ALLOW}
      ratio="aspect-square sm:aspect-video"
      referrer="strict-origin-when-cross-origin"
      loadingLabel={t.loading}
      afterLoadHint={t.tourHint}
    />
  );
}
