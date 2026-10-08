"use client";

import { useState } from "react";
import { Badge } from "./Badge";
import { Button, ButtonLink } from "./Button";
import { Card, CardHeader, StatCard } from "./Card";
import { HeroBand, BandStat } from "./HeroBand";
import { NextStepBanner } from "./NextStepBanner";
import { StepBar } from "./StepBar";
import { PersonCard } from "./PersonCard";
import { ContactCard } from "./ContactCard";
import { PhotoCard } from "./PhotoCard";
import { TicketCard } from "./TicketCard";
import { Accordion, AccordionItem } from "./Accordion";
import { DateRow, DateList } from "./DateRow";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Field } from "./Field";
import { Input } from "./Input";
import { AbschnittsNavigation } from "./Abschnitte";
import { FristMarke } from "./FristMarke";
import { Fortschritt } from "./Fortschritt";
import { KalenderKnoepfe } from "./KalenderKnoepfe";
import { SuchFeld } from "./SuchFeld";
import { TestbetriebHinweis } from "./TestbetriebHinweis";
import { MehrfachAuswahl } from "./MehrfachAuswahl";
import { PortalFooter } from "@/components/layout/PortalFooter";
import type { FehlerTexte } from "@/components/fehler/fehler";

export type KitTexte = Record<string, string>;

/**
 * Die Bausteine des Design-Systems v2 an einem Ort, mit Musterinhalten.
 *
 * Wozu: Ein Baustein lässt sich nicht beurteilen, solange er in einer Seite
 * steckt, für die man erst die passenden Daten und die passende Rolle
 * braucht. Hier stehen alle neun nebeneinander — Konrad sieht sie ohne
 * Login, die Build-Chats sehen, was es gibt, bevor sie etwas nachbauen.
 *
 * **Keine echten Daten.** Alles hier sind erfundene Beispiele; die Seite
 * zeigt Form, nicht Inhalt. Die Beschriftungen kommen als Props herein,
 * damit auch diese Seite DE und EN kann.
 */
export function KitSchau({
  t,
  fehler,
  testbetrieb,
}: {
  t: KitTexte;
  fehler: FehlerTexte;
  /** Texte des Testbetrieb-Hinweises (`t.testbetrieb`) — dieselben wie in der Shell. */
  testbetrieb: { label: string; kurz: string; mehr: string };
}) {
  const [schritt, setSchritt] = useState(1);
  const [themen, setThemen] = useState<string[]>([]);
  const [studium, setStudium] = useState<string[]>(["fach-0", "fach-5"]);
  const [stufe, setStufe] = useState<string[]>(["stufe-1"]);

  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6">
      <HeroBand
        eyebrow={t.bandEyebrow}
        title={t.bandTitle}
        highlight={t.bandHighlight}
        lead={t.bandLead}
        action={<Button>{t.bandAction}</Button>}
        aside={<BandStat value="12" label={t.bandStatLabel} hint={t.bandStatHint} />}
      />

      <NextStepBanner
        label={t.nextLabel}
        title={t.nextTitle}
        hint={t.nextHint}
        action={<ButtonLink href="#" variant="onAccent">{t.nextAction}</ButtonLink>}
      />

      <Abschnitt titel={t.sStats} quelle="Ticket Section · 54:4052">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.statA} value="3 / 8" hint={t.statAHint} />
          <StatCard label={t.statB} value="12 / 20" hint={t.statBHint} />
          <StatCard label={t.statC} value="4" />
          <StatCard label={t.statD} value="7" />
        </div>
      </Abschnitt>

      <Abschnitt titel={t.sStep} quelle="Step Section · 54:9522">
        <Card>
          <StepBar
            steps={[
              { label: t.step1, hint: t.step1Hint, done: true },
              { label: t.step2, hint: t.step2Hint },
              { label: t.step3, hint: t.step3Hint },
              { label: t.step4, hint: t.step4Hint },
            ]}
            current={schritt}
            srLabel={t.stepSr}
            onSelect={setSchritt}
          />
        </Card>
      </Abschnitt>

      {/* QS-073: die Tönung der Karte wirkt jetzt (`kartenFlaeche`) — Hinweis und Warnung als Fläche mit Rand der Familie. */}
      <Abschnitt titel={t.sCards}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="ct-label text-ink">{t.cardPlain}</p>
            <p className="ct-small mt-1 text-muted">{t.cardPlainBody}</p>
          </Card>
          <Card className="border-accent-soft bg-accent-soft">
            <p className="ct-label text-accent-deep">{t.cardAccent}</p>
            <p className="ct-small mt-1 text-accent-deep">{t.cardAccentBody}</p>
          </Card>
          <Card className="border-warning-soft bg-warning-soft">
            <p className="ct-label text-warning-ink">{t.cardWarning}</p>
            <p className="ct-small mt-1 text-warning-ink">{t.cardWarningBody}</p>
          </Card>
        </div>
      </Abschnitt>

      <Abschnitt titel={t.sDates} quelle="Social-Post „Next up…“ · 319:692">
        <Card className="p-0">
          <DateList>
            <DateRow
              date="22. Sept."
              note={t.dateOverdue}
              overdue
              title={t.date1}
              subtitle={t.date1Sub}
              status={<Badge tone="error">{t.badgeOverdue}</Badge>}
            />
            <DateRow
              date="8. Okt."
              note={t.dateIn}
              title={t.date2}
              subtitle={t.date2Sub}
              status={<Badge tone="warning">{t.badgeOpen}</Badge>}
            />
            <DateRow
              date="15. Okt."
              title={t.date3}
              subtitle={t.date3Sub}
              status={<Badge tone="success">{t.badgeDone}</Badge>}
            />
          </DateList>
        </Card>
      </Abschnitt>

      <Abschnitt titel={t.sPersons} quelle="Speaker Section · 54:6114 · Marken-Referenz 3:20146">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <PersonCard name="Miriam van Straelen" role={t.roleLead} organization="Stadt Hamburg" />
          <PersonCard name="Philipp Westermeyer" role={t.roleSpeaker} organization="OMR" />
          <PersonCard name="Barbara Frenkel" role={t.roleJury} organization="Porsche" />
        </div>
        {/* Die dichte Fassung derselben Form (QS-022). Sie stand vorher in
            keiner Schau und war deshalb nur dort zu sehen, wo eine
            Organisation Ansprechpartner zugeordnet hat — beim Testpartner also
            nirgends. Ein Baustein, den man nicht vorführen kann, wird nicht
            beurteilt. */}
        <p className="ct-help mt-8 mb-3">{t.personsDenseHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ContactCard
            name="Laura Kessler"
            role={t.roleLead}
            email="partner@chef-treff.de"
            phone="+49 40 1234567"
            photoUrl={null}
          />
          <ContactCard
            name="Patrick Jansen"
            role={t.roleBuddy}
            email="partner@chef-treff.de"
            phone="+49 40 7654321"
            photoUrl={null}
          />
        </div>
      </Abschnitt>

      <Abschnitt titel={t.sPhotos} quelle="Detail Section · 54:2153">
        <div className="grid gap-6 sm:grid-cols-3">
          <PhotoCard word={t.photo1} description={t.photo1Body} />
          <PhotoCard word={t.photo2} description={t.photo2Body} />
          <PhotoCard word={t.photo3} description={t.photo3Body} />
        </div>
      </Abschnitt>

      <Abschnitt titel={t.sTicket} quelle="Ticket Section · 54:4052">
        <div className="grid gap-6 sm:grid-cols-2">
          <TicketCard
            passType={t.ticketPass}
            title={t.ticketTitle}
            count="12 / 20"
            countLabel={t.ticketCount}
            status={<Badge tone="success">{t.ticketStatus}</Badge>}
            includes={[t.ticketI1, t.ticketI2, t.ticketI3]}
            footer={<Button size="sm">{t.ticketAction}</Button>}
          />
          <Card>
            <CardHeader ebene="h2" title={t.formTitle} description={t.formHint} />
            <div className="flex flex-col gap-4">
              <Field label={t.formField} htmlFor="kit-a" hint={t.formFieldHint} required requiredLabel={t.formRequired}>
                <Input id="kit-a" placeholder={t.formPlaceholder} />
              </Field>
              <Field label={t.formFieldError} htmlFor="kit-b" error={t.formError}>
                <Input id="kit-b" invalid defaultValue="post@" />
              </Field>
              <div className="flex gap-2">
                <Button>{t.formSave}</Button>
                <Button variant="ghost">{t.formCancel}</Button>
              </div>
            </div>
          </Card>
        </div>
      </Abschnitt>

      <Abschnitt titel={t.sFaq} quelle="FAQ Section · 54:3972">
        <Accordion>
          <AccordionItem question={t.faqQ1} defaultOpen>{t.faqA1}</AccordionItem>
          <AccordionItem question={t.faqQ2}>{t.faqA2}</AccordionItem>
          <AccordionItem question={t.faqQ3}>{t.faqA3}</AccordionItem>
        </Accordion>
      </Abschnitt>

      {/* Neu am 24.09. (QS-042, QS-043, QS-044): die Bausteine, die Seiten nur
          mit Daten zeigen — hier mit Musterinhalten zum Nachschlagen. */}
      <Abschnitt titel={t.sSection}>
        <AbschnittsNavigation
          label={t.onThisPage}
          items={[
            { id: "kit-a", label: t.secA },
            { id: "kit-b", label: t.secB },
            { id: "kit-c", label: t.secC },
          ]}
        />
        <Card>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <h3 className="ct-h2 text-ink">{t.sectionTitle}</h3>
            <FristMarke
              className="ml-auto"
              dueAt="2027-03-15T22:59:00Z"
              dateText={t.deadlineDate}
              t={{
                label: t.deadlineLabel,
                days: t.deadlineDays,
                hours: t.deadlineHours,
                soon: t.deadlineSoon,
                passed: t.deadlinePassed,
                done: t.deadlineDone,
              }}
            />
          </div>
          <KalenderKnoepfe
            beschriftung="sichtbar"
            termin={{ titel: t.calTitle, start: new Date("2027-04-16T08:30:00Z"), ende: new Date("2027-04-16T09:15:00Z") }}
            ics="#"
            t={{ add: t.calAdd, google: t.calGoogle, outlook: t.calOutlook, apple: t.calApple }}
          />
        </Card>
      </Abschnitt>

      {/* QS-038: aus den Quellen 21st.dev („Search Bars") und Dribbble-Dashboards. */}
      <Abschnitt titel={t.sSearch}>
        <Card>
          <Field label={t.searchLabel} htmlFor="kit-suche">
            <SuchFeld id="kit-suche" placeholder={t.searchPlaceholder} />
          </Field>
          {/* SPK-051: Mehrfachauswahl mit Suche statt vieler Kästchen. */}
          <Field label={t.multiLabel} htmlFor="kit-mehrfach" className="mt-6">
            <MehrfachAuswahl
              id="kit-mehrfach"
              options={t.multiOptions.split(" · ").map((label, i) => ({ value: `thema-${i}`, label }))}
              value={themen}
              onChange={setThemen}
              placeholder={t.multiPlaceholder}
              t={{ remove: t.multiRemove, noHits: t.multiNoHits }}
            />
          </Field>
          {/* PART-128: dieselbe Wahl aufklappbar, für kurze Listen — zugeklappt eine Zeile mit der Zusammenfassung. */}
          <Field label={t.foldLabel} htmlFor="kit-aufklappbar" hint={t.foldHint} className="mt-6">
            <MehrfachAuswahl
              aufklappbar
              id="kit-aufklappbar"
              options={t.foldOptions.split(" · ").map((label, i) => ({ value: `fach-${i}`, label }))}
              value={studium}
              onChange={setStudium}
              leer={t.foldEmpty}
              describedBy="kit-aufklappbar-hint"
            />
          </Field>
          <Field label={t.foldOpenLabel} htmlFor="kit-aufklappbar-offen" className="mt-6">
            <MehrfachAuswahl
              aufklappbar
              offen
              id="kit-aufklappbar-offen"
              options={t.foldOpenOptions.split(" · ").map((label, i) => ({ value: `stufe-${i}`, label }))}
              value={stufe}
              onChange={setStufe}
              leer={t.foldEmpty}
            />
          </Field>
          <Fortschritt className="mt-6" wert={3} gesamt={8} label={t.progressLabel} />
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <Fortschritt form="ring" wert={4} gesamt={7} label={t.progressRing} />
            <div className="rounded-ct-lg bg-navy p-4">
              <Fortschritt form="ring" ton="navy" wert={4} gesamt={7} label={t.progressRing} />
            </div>
          </div>
        </Card>
      </Abschnitt>

      <Abschnitt titel={t.sEmpty}>
        <EmptyState title={t.emptyTitle} description={t.emptyBody} action={<Button>{t.emptyAction}</Button>} />
      </Abschnitt>

      {/* Die Fehlergrenze (QS-023) mit einer erfundenen Fehler-ID. Die echte
          Seite zeigt `/admin/ui/fehlerprobe` im Admin-Bereich. */}
      <Abschnitt titel={t.sError}>
        <ErrorState
          level={3}
          title={fehler.boundaryTitle}
          description={fehler.boundaryBody.replace("{mailbox}", "portal@chef-treff.de")}
          idLabel={fehler.boundaryId}
          id="1784632415"
          actions={
            <>
              <Button>{fehler.boundaryRetry}</Button>
              <Button variant="secondary">{fehler.boundaryHome}</Button>
            </>
          }
        />
      </Abschnitt>

      {/* Der Streifen unter der Kopfzeile jeder Seite (QS-056 c). Hier im Rahmen,
          damit man ihn als Streifen sieht und nicht als Hinweis in einer Karte. */}
      <Abschnitt titel={t.sTestbetrieb}>
        <div className="overflow-hidden rounded-ct-md border">
          <TestbetriebHinweis label={testbetrieb.label} kurz={testbetrieb.kurz} mehr={testbetrieb.mehr} />
        </div>
        <p className="ct-help mt-3">{t.testbetriebHint}</p>
      </Abschnitt>

      <Abschnitt titel={t.sButtons}>
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{t.btnPrimary}</Button>
            <Button variant="secondary">{t.btnSecondary}</Button>
            <Button variant="ghost">{t.btnGhost}</Button>
            <Button variant="destructive">{t.btnDestructive}</Button>
            <Button disabled>{t.btnDisabled}</Button>
            <Button loading>{t.btnLoading}</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>{t.badgeNeutral}</Badge>
            <Badge tone="accent">{t.badgeAccent}</Badge>
            <Badge tone="success">{t.badgeDone}</Badge>
            <Badge tone="warning">{t.badgeOpen}</Badge>
            <Badge tone="error">{t.badgeOverdue}</Badge>
          </div>
        </Card>
      </Abschnitt>

      <PortalFooter
        mailbox="portal@chef-treff.de"
        mailboxLabel={t.footerMailbox}
        imprintLabel={t.footerImprint}
        privacyLabel={t.footerPrivacy}
      />
    </div>
  );
}

/** Ein Abschnitt der Schau: Überschrift, Herkunft, Inhalt. */
function Abschnitt({
  titel,
  quelle,
  children,
}: {
  titel: string;
  /** Der Website-Block, aus dem der Baustein kommt. */
  quelle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="mb-4 border-b pb-2">
        <h2 className="ct-h2 text-ink">{titel}</h2>
        {quelle && <p className="ct-help mt-0.5">{quelle}</p>}
      </div>
      {children}
    </section>
  );
}
