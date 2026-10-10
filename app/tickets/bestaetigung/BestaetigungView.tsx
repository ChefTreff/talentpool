"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  addonNamen,
  fehlerText,
  felderBeimUmschalten,
  LEERE_FELDER,
  startetFuerMich,
  zaehleZustaende,
  zustandVon,
  type Felder,
  type Zustand,
} from "@/lib/vivenu/bestaetigung";
import { personalisiereTicket } from "./actions";

export type TicketZeile = {
  ticket_id: string;
  pass_type: string | null;
  pass_label: string;
  personalization_status: string;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_company: string | null;
  holder_position: string | null;
  holder_email: string | null;
  for_me: boolean;
  addons: unknown;
  writeback_pending: boolean;
};

type Strings = Record<string, string>;
type Profil = Felder;

const TON: Record<Zustand, "warning" | "accent" | "success"> = { pending: "warning", partial: "accent", complete: "success" };

/**
 * Je Ticket eine Karte: „Für mich“ oder eine andere Person, Badge-Minimum (Vorname, Nachname, Firma, Position), speichern
 * oder vorerst überspringen. Der Zustand (offen / teilweise / vollständig) steht als Wort am Ticket. Nach dem Speichern sagt
 * eine Zeile, ob die Übertragung zu vivenu schon gelaufen ist — das Portal-Ergebnis steht in jedem Fall.
 *
 * **Wer ist „ich“ (TAL-020, B2):** höchstens ein Ticket der Bestellung startet „für mich“ mit dem Profil des Käufers — das erste, zu dem noch nichts gespeichert
 * ist (`startetFuerMich`); die übrigen starten „für eine andere Person“ mit leeren Feldern, die E-Mail-Adresse zuerst.
 */
export function BestaetigungView({ tickets, profil, t, rpcMessages }: { tickets: TicketZeile[]; profil: Profil; t: Strings; rpcMessages: Strings }) {
  const zahlen = zaehleZustaende(tickets);
  const alleFertig = zahlen.pending === 0 && zahlen.partial === 0;
  const fuerMichId = startetFuerMich(tickets);
  return (
    <>
      <PageHeader title={t.title} description={t.lead.replace("{n}", String(tickets.length))} />
      <ul className="flex flex-col gap-4" aria-label={t.listLabel}>
        {tickets.map((k, i) => (
          <li key={k.ticket_id}>
            <TicketKarte ticket={k} nummer={i + 1} profil={profil} startetFuerMich={k.ticket_id === fuerMichId} t={t} rpcMessages={rpcMessages} />
          </li>
        ))}
      </ul>
      <Card className="mt-8">
        <h2 className="ct-h3 text-ink">{alleFertig ? t.nextDone : t.nextTitle}</h2>
        <p className="ct-small mt-1">{alleFertig ? t.nextDoneBody : t.nextBody}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/profil">{t.nextProfile}</ButtonLink>
          <ButtonLink href="/programm" variant="secondary">{t.nextProgramme}</ButtonLink>
          <ButtonLink href="/tickets" variant="ghost">{t.toTickets}</ButtonLink>
        </div>
      </Card>
    </>
  );
}

function TicketKarte({
  ticket: k,
  nummer,
  profil,
  startetFuerMich: startetMit,
  t,
  rpcMessages,
}: {
  ticket: TicketZeile;
  nummer: number;
  profil: Profil;
  startetFuerMich: boolean;
  t: Strings;
  rpcMessages: Strings;
}) {
  // Gespeichert (teilweise oder vollständig): dann gelten die Werte der Datenbank samt `for_me`. Ein offenes Ticket ist ein leeres Blatt — `for_me` sagt dort nichts,
  // der Ingest hängt es schon an die Person, deren Adresse der Käufer hat (TAL-020, B1/B2).
  const vorher = zustandVon(k.personalization_status) !== "pending";
  const [fuerMich, setFuerMich] = useState(vorher ? k.for_me : startetMit);
  const vorbelegung = fuerMich ? profil : LEERE_FELDER;
  const [v, setV] = useState({
    first_name: (vorher ? k.holder_first_name : null) ?? vorbelegung.first_name,
    last_name: (vorher ? k.holder_last_name : null) ?? vorbelegung.last_name,
    company: (vorher ? k.holder_company : null) ?? vorbelegung.company,
    job_position: (vorher ? k.holder_position : null) ?? vorbelegung.job_position,
    holder_email: vorher && !k.for_me ? (k.holder_email ?? "") : "",
  });
  // Die Angaben der Person selbst: ihr Profil, bei einem schon für sie gespeicherten Ticket dessen Werte. Beim Umschalten gilt nur die Vorbelegung als „ihre“.
  const eigene: Felder =
    vorher && k.for_me
      ? {
          first_name: k.holder_first_name ?? profil.first_name,
          last_name: k.holder_last_name ?? profil.last_name,
          company: k.holder_company ?? profil.company,
          job_position: k.holder_position ?? profil.job_position,
        }
      : profil;
  // Was wirklich gespeichert ist — die Zusammenfassung zeigt nur das, nie die Formularwerte (ein übersprungenes Ticket sah sonst aus, als wäre es eingetragen).
  const [gespeichert, setGespeichert] = useState<Felder | null>(() =>
    vorher && (k.holder_first_name || k.holder_last_name)
      ? { first_name: k.holder_first_name ?? "", last_name: k.holder_last_name ?? "", company: k.holder_company ?? "", job_position: k.holder_position ?? "" }
      : null,
  );
  const [zustand, setZustand] = useState<Zustand>(zustandVon(k.personalization_status));
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [offen, setOffen] = useState(zustand !== "complete");
  const id = `t${nummer}`;
  const set = (feld: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [feld]: e.target.value }));
  const addons = addonNamen(k.addons);

  function umschalten(an: boolean) {
    setFuerMich(an);
    setV((x) => ({
      ...x,
      ...felderBeimUmschalten({ first_name: x.first_name, last_name: x.last_name, company: x.company, job_position: x.job_position }, eigene, an),
    }));
  }

  function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setHinweis(null);
    start(async () => {
      const r = await personalisiereTicket({ ticketId: k.ticket_id, fuerMich, ...v });
      if (!r.ok) {
        setFehler(fehlerText(r.key, t, rpcMessages));
        return;
      }
      setGespeichert({ first_name: v.first_name.trim(), last_name: v.last_name.trim(), company: v.company.trim(), job_position: v.job_position.trim() });
      setZustand(v.company.trim() && v.job_position.trim() ? "complete" : "partial");
      setHinweis(r.rueck === "ok" ? t.savedSynced : t.savedPortal);
      setOffen(false);
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="ct-h3 text-ink">{t.ticketN.replace("{n}", String(nummer))} · {k.pass_label}</h2>
        <Badge tone={TON[zustand]}>{t[`state_${zustand}`]}</Badge>
      </div>
      {addons.length > 0 && <p className="ct-help mt-1">{t.addons.replace("{liste}", addons.join(", "))}</p>}
      {hinweis && <p role="status" className="ct-small mt-2 text-success-ink">{hinweis}</p>}
      {!offen ? (
        <div className="mt-3">
          <p className="ct-small">{gespeichert ? [gespeichert.first_name, gespeichert.last_name].filter(Boolean).join(" ") + (gespeichert.company ? ` · ${gespeichert.company}` : "") : t.skippedText}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOffen(true)}>{gespeichert ? t.edit : t.fill}</Button>
        </div>
      ) : (
        <form onSubmit={speichern} className="mt-4 flex flex-col gap-4">
          <Checkbox label={t.forMe} checked={fuerMich} onChange={(e) => umschalten(e.target.checked)} />
          {!fuerMich && (
            <Field label={t.holderEmail} htmlFor={`${id}-em`} hint={t.holderEmailHint} required requiredLabel={t.required}>
              <Input id={`${id}-em`} type="email" value={v.holder_email} onChange={set("holder_email")} autoComplete="off" maxLength={200} required />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.firstName} htmlFor={`${id}-fn`} required requiredLabel={t.required}>
              <Input id={`${id}-fn`} value={v.first_name} onChange={set("first_name")} autoComplete={fuerMich ? "given-name" : "off"} maxLength={120} required />
            </Field>
            <Field label={t.lastName} htmlFor={`${id}-ln`} required requiredLabel={t.required}>
              <Input id={`${id}-ln`} value={v.last_name} onChange={set("last_name")} autoComplete={fuerMich ? "family-name" : "off"} maxLength={120} required />
            </Field>
            <Field label={t.company} htmlFor={`${id}-co`} hint={t.badgeHint}>
              <Input id={`${id}-co`} value={v.company} onChange={set("company")} autoComplete={fuerMich ? "organization" : "off"} maxLength={120} />
            </Field>
            <Field label={t.position} htmlFor={`${id}-po`}>
              <Input id={`${id}-po`} value={v.job_position} onChange={set("job_position")} autoComplete={fuerMich ? "organization-title" : "off"} maxLength={120} />
            </Field>
          </div>
          {fehler && <p role="alert" className="ct-help leading-5 text-error-ink">{fehler}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={pending}>{t.save}</Button>
            <Button type="button" variant="ghost" onClick={() => setOffen(false)} disabled={pending}>{t.skip}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
