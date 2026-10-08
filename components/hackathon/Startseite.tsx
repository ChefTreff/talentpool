import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ContactCard } from "@/components/ui/ContactCard";
import { Eckdaten, type Eckdatum } from "@/components/ui/Eckdaten";
import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { contactPhotoUrl } from "@/components/kontakt/photo";

type Strings = Record<string, string>;

/**
 * Die Hackathon-Startseite als Event-Seite (HACK-013, Vorschlag 10-04, Vorbild Luma): Eckdaten und eine Stand-Karte
 * mit genau einer Aktion zuerst, darunter die Karten des Weges (`children`); am Desktop links eine schmale Seitenspalte
 * (Ansprechperson, Zahl, Discord), am Handy nach dem Hauptteil — sonst stünde der Veranstalter vor der Aktion.
 * Fehlt eine Angabe, fehlt die Zeile: nichts Erfundenes (HACK-020).
 */
export function Startseite({
  eckdaten,
  stand,
  contact,
  counts,
  discordUrl,
  t,
  children,
}: {
  eckdaten: Eckdatum[];
  stand: { satz: string; aktion: string | null; anchor: string | null };
  contact: { name: string; role: string | null; email: string; phone: string; photo_path: string | null } | null;
  counts: { accepted: number; teams: number } | null;
  discordUrl: string | null;
  t: Strings;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Eckdaten und Stand-Karte tragen ihren Abstand selbst (das Band hat `mb-6`); der Weg darunter hat seine Lücken. */}
      <div className="flex flex-col lg:order-2 lg:col-span-2">
        <Eckdaten items={eckdaten} className="mb-6" />
        <NextStepBanner
          label={t.standLabel}
          title={stand.satz}
          action={
            stand.aktion && stand.anchor ? (
              <ButtonLink href={`#${stand.anchor}`} variant="onAccent">
                {stand.aktion}
              </ButtonLink>
            ) : undefined
          }
        />
        {children}
      </div>
      <aside className="flex flex-col gap-6 lg:order-1 lg:col-span-1" aria-label={t.sideLabel}>
        {contact && (
          <section className="flex flex-col gap-3">
            <h2 className="ct-eyebrow">{t.sideContact}</h2>
            <ContactCard
              name={contact.name}
              role={contact.role}
              email={contact.email}
              phone={contact.phone}
              photoUrl={contactPhotoUrl(contact.photo_path)}
            />
          </section>
        )}
        {counts && (
          <section className="flex flex-col gap-1">
            <h2 className="ct-eyebrow">{t.sideParticipants}</h2>
            <p className="ct-label tabular-nums">
              {t.sideCounts.replace("{accepted}", String(counts.accepted)).replace("{teams}", String(counts.teams))}
            </p>
          </section>
        )}
        {discordUrl && (
          <Card>
            <CardHeader ebene="h2" title={t.discord} description={t.discordHint} />
            <a className="ct-link" href={discordUrl} {...neuesFenster}>
              {t.sideDiscordAction}
            </a>
          </Card>
        )}
      </aside>
    </div>
  );
}
