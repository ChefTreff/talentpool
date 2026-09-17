"use client";

import { useState } from "react";
import { Badge } from "./Badge";
import { Button, ButtonLink } from "./Button";
import { Card, CardHeader, StatCard } from "./Card";
import { HeroBand, BandStat } from "./HeroBand";
import { NextStepBanner } from "./NextStepBanner";
import { StepBar } from "./StepBar";
import { PersonCard } from "./PersonCard";
import { PhotoCard } from "./PhotoCard";
import { TicketCard } from "./TicketCard";
import { Accordion, AccordionItem } from "./Accordion";
import { DateRow, DateList } from "./DateRow";
import { EmptyState } from "./EmptyState";
import { Field } from "./Field";
import { Input } from "./Input";
import { PortalFooter } from "@/components/layout/PortalFooter";

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
export function KitSchau({ t }: { t: KitTexte }) {
  const [schritt, setSchritt] = useState(1);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
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
            <CardHeader title={t.formTitle} description={t.formHint} />
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

      <Abschnitt titel={t.sEmpty}>
        <EmptyState title={t.emptyTitle} description={t.emptyBody} action={<Button>{t.emptyAction}</Button>} />
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

      <PortalFooter mailbox="portal@chef-treff.de" mailboxLabel={t.footerMailbox} />
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
