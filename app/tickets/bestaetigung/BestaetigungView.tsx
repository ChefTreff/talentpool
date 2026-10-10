"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Fortschritt } from "@/components/ui/Fortschritt";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useUngesichert, type UngesichertTexte } from "@/components/ui/useUngesichert";
import {
  addonNamen,
  fehlerText,
  felderBeimUmschalten,
  LEERE_FELDER,
  naechstesOffene,
  startetFuerMich,
  zustaendeVon,
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
/** Eine Karte (oder die Abschlusskarte, `FERTIG`) soll den Fokus bekommen; `n` zählt mit, damit derselbe Wunsch ein zweites Mal wirkt. */
type FokusWunsch = { id: string; n: number } | null;
const FERTIG = "fertig";

const TON: Record<Zustand, "warning" | "accent" | "success"> = { pending: "warning", partial: "accent", complete: "success" };

/**
 * Je Ticket eine Karte: „Für mich“ oder eine andere Person, Badge-Minimum (Vorname, Nachname, Firma, Position), speichern
 * oder vorerst überspringen. Der Zustand (offen / teilweise / vollständig) steht als Wort am Ticket. Nach dem Speichern sagt
 * eine Zeile, ob die Übertragung zu vivenu schon gelaufen ist — das Portal-Ergebnis steht in jedem Fall.
 *
 * **Wer ist „ich“ (TAL-020, B2):** höchstens ein Ticket der Bestellung startet „für mich“ mit dem Profil des Käufers — das erste, zu dem noch nichts gespeichert
 * ist (`startetFuerMich`); die übrigen starten „für eine andere Person“ mit leeren Feldern, die E-Mail-Adresse zuerst.
 *
 * **Eine Karte nach der anderen (B4, B7):** aufgeklappt ist nur das erste noch nicht vollständige Ticket, die übrigen stehen als Zeile mit „Ausfüllen“ oder „Ändern“;
 * nach dem Speichern oder Überspringen öffnet sich das nächste, und sein Titel bekommt den Fokus (bei einem Ticket allein die Karte selbst, am Ende die
 * Abschlusskarte). Über der Liste sagt eine Zeile, wie viele vollständig sind. Der Zustand aller Karten liegt hier, damit Zeile, Fortschritt und Abschluss
 * dasselbe zeigen.
 */
export function BestaetigungView({
  tickets,
  profil,
  t,
  rpcMessages,
  unsaved,
}: {
  tickets: TicketZeile[];
  profil: Profil;
  t: Strings;
  rpcMessages: Strings;
  unsaved: UngesichertTexte;
}) {
  const [zustaende, setZustaende] = useState(() => zustaendeVon(tickets));
  const [offen, setOffen] = useState<Record<string, boolean>>(() => {
    const erstes = naechstesOffene(tickets, zustaendeVon(tickets), null);
    return Object.fromEntries(tickets.map((k) => [k.ticket_id, k.ticket_id === erstes]));
  });
  const [wunsch, setWunsch] = useState<FokusWunsch>(null);
  const fertigRef = useRef<HTMLHeadingElement>(null);
  const fuerMichId = startetFuerMich(tickets);
  const fertig = tickets.filter((k) => zustaende[k.ticket_id] === "complete").length;
  const alleFertig = fertig === tickets.length;

  useEffect(() => {
    if (wunsch?.id === FERTIG) fertigRef.current?.focus();
  }, [wunsch]);

  const will = (id: string) => setWunsch((w) => ({ id, n: (w?.n ?? 0) + 1 }));
  function oeffne(id: string) {
    setOffen((o) => ({ ...o, [id]: true }));
    will(id);
  }
  function schliesse(id: string) {
    setOffen((o) => ({ ...o, [id]: false }));
    will(id);
  }
  /** Diese Karte zu, die nächste unvollständige auf; gibt es keine, bekommt die Abschlusskarte (alles vollständig) oder diese Karte den Fokus. */
  function weiter(id: string, stand: Record<string, Zustand>) {
    const naechstes = naechstesOffene(tickets, stand, id);
    setOffen((o) => ({ ...o, [id]: false, ...(naechstes ? { [naechstes]: true } : {}) }));
    will(naechstes ?? (tickets.every((k) => stand[k.ticket_id] === "complete") ? FERTIG : id));
  }
  function gespeichert(id: string, z: Zustand) {
    const stand = { ...zustaende, [id]: z };
    setZustaende(stand);
    weiter(id, stand);
  }

  return (
    <>
      <PageHeader title={t.title} description={tickets.length === 1 ? t.leadOne : t.lead.replace("{n}", String(tickets.length))} />
      {tickets.length > 1 && (
        <Fortschritt
          wert={fertig}
          gesamt={tickets.length}
          label={t.progress.replace("{done}", String(fertig)).replace("{n}", String(tickets.length))}
          className="mb-6"
        />
      )}
      <ul className="flex flex-col gap-4" aria-label={t.listLabel}>
        {tickets.map((k, i) => (
          <li key={k.ticket_id}>
            <TicketKarte
              ticket={k}
              nummer={i + 1}
              profil={profil}
              startetFuerMich={k.ticket_id === fuerMichId}
              zustand={zustaende[k.ticket_id]}
              offen={offen[k.ticket_id]}
              fokus={wunsch?.id === k.ticket_id ? wunsch : null}
              onOeffne={() => oeffne(k.ticket_id)}
              onSchliesse={() => schliesse(k.ticket_id)}
              onUeberspringen={() => weiter(k.ticket_id, zustaende)}
              onGespeichert={(z) => gespeichert(k.ticket_id, z)}
              unsaved={unsaved}
              t={t}
              rpcMessages={rpcMessages}
            />
          </li>
        ))}
      </ul>
      {alleFertig ? (
        <Card className="mt-8">
          <h2 ref={fertigRef} tabIndex={-1} className="ct-h3 text-ink">{t.nextDone}</h2>
          <p className="ct-small mt-1">{t.nextDoneBody}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/profil">{t.nextProfile}</ButtonLink>
            <ButtonLink href="/programm" variant="secondary">{t.nextProgramme}</ButtonLink>
            <ButtonLink href="/tickets" variant="ghost">{t.toTickets}</ButtonLink>
          </div>
        </Card>
      ) : (
        <p className="mt-6">
          <ButtonLink href="/tickets" variant="ghost">{t.toTickets}</ButtonLink>
        </p>
      )}
    </>
  );
}

function TicketKarte({
  ticket: k,
  nummer,
  profil,
  startetFuerMich: startetMit,
  zustand,
  offen,
  fokus,
  onOeffne,
  onSchliesse,
  onUeberspringen,
  onGespeichert,
  unsaved,
  t,
  rpcMessages,
}: {
  ticket: TicketZeile;
  nummer: number;
  profil: Profil;
  startetFuerMich: boolean;
  zustand: Zustand;
  offen: boolean;
  fokus: FokusWunsch;
  onOeffne: () => void;
  onSchliesse: () => void;
  onUeberspringen: () => void;
  onGespeichert: (z: Zustand) => void;
  unsaved: UngesichertTexte;
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
  // Der Stand, gegen den „ungesichert“ gilt: beim Laden und nach jedem Speichern.
  const [basis, setBasis] = useState(() => ({ fuerMich, v }));
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const id = `t${nummer}`;
  const titel = `${t.ticketN.replace("{n}", String(nummer))} · ${k.pass_label}`;
  const set = (feld: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [feld]: e.target.value }));
  const addons = addonNamen(k.addons);
  const geaendert = offen && (fuerMich !== basis.fuerMich || (Object.keys(v) as (keyof typeof v)[]).some((f) => v[f] !== basis.v[f]));
  // Wer Eingaben hat und die Seite verlässt, wird gefragt (B10); mehrere Karten fragen nicht doppelt — der erste Fänger bricht den Klick ab.
  const warnung = useUngesichert(geaendert, unsaved);

  useEffect(() => {
    if (fokus) ueberschrift.current?.focus();
  }, [fokus]);

  function umschalten(an: boolean) {
    setFuerMich(an);
    setV((x) => ({
      ...x,
      ...felderBeimUmschalten({ first_name: x.first_name, last_name: x.last_name, company: x.company, job_position: x.job_position }, eigene, an),
    }));
  }

  /** „Abbrechen“ an einem gespeicherten Ticket: zurück zum Gespeicherten, nichts Halbes bleibt im Formular stehen. */
  function abbrechen() {
    setFuerMich(basis.fuerMich);
    setV(basis.v);
    setFehler(null);
    onSchliesse();
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
      setBasis({ fuerMich, v });
      setHinweis(r.rueck === "ok" ? t.savedSynced : t.savedPortal);
      onGespeichert(v.company.trim() && v.job_position.trim() ? "complete" : "partial");
    });
  }

  return (
    <Card>
      {warnung}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 ref={ueberschrift} tabIndex={-1} className="ct-h3 text-ink">{titel}</h2>
          <Badge tone={TON[zustand]}>{t[`state_${zustand}`]}</Badge>
        </div>
        {!offen && (
          <Button variant="ghost" size="sm" className="sm:ml-auto" aria-label={`${gespeichert ? t.edit : t.fill}: ${titel}`} onClick={onOeffne}>
            {gespeichert ? t.edit : t.fill}
          </Button>
        )}
      </div>
      {addons.length > 0 && <p className="ct-help mt-1">{t.addons.replace("{liste}", addons.join(", "))}</p>}
      {/* Die Statuszeile steht immer im Baum, damit Vorlesegeräte ihre Änderung melden (eine neu eingefügte Zeile wird oft überhört). */}
      <p role="status" className={hinweis ? "ct-small mt-2 text-success-ink" : "sr-only"}>{hinweis}</p>
      {!offen ? (
        gespeichert && (
          <p className="ct-small mt-2">
            {[gespeichert.first_name, gespeichert.last_name].filter(Boolean).join(" ") + (gespeichert.company ? ` · ${gespeichert.company}` : "")}
          </p>
        )
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
            {gespeichert ? (
              <Button type="button" variant="ghost" onClick={abbrechen} disabled={pending}>{t.cancel}</Button>
            ) : (
              <Button type="button" variant="ghost" onClick={onUeberspringen} disabled={pending}>{t.skip}</Button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
