"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { filterAdresse, filterAktiv, type ListeWerte } from "@/lib/bewerbungen/liste";

type Option = { value: string; label: string };
type Strings = Record<string, string>;

/**
 * Filter der Bewerbungsliste (ADM-003). Gefiltert wird auf dem Server; hier
 * entsteht nur die Adresse. Mit JavaScript über `filterAdresse` (`neueSuche`
 * aus dem Kit: nur, was von der Vorgabe abweicht, Seite zurück auf 1), ohne
 * JavaScript schickt das Formular dieselben Felder als GET — die Seite liest
 * beides gleich.
 *
 * Die Session-Auswahl folgt dem Format: wer „Masterclass“ wählt, sieht nur
 * Masterclasses. Passt eine gewählte Session nicht mehr, fällt sie heraus.
 */
export function BewerbungsFilter({
  werte,
  formate,
  sessions,
  status,
  t,
}: {
  werte: ListeWerte;
  formate: Option[];
  sessions: (Option & { format: string | null })[];
  status: Option[];
  t: Strings;
}) {
  const router = useRouter();
  const pfad = usePathname();
  const [format, setFormat] = useState(werte.format);
  const [session, setSession] = useState(werte.session);
  const passendeSessions = sessions.filter((s) => !format || s.format === format);

  return (
    <form
      action={pfad}
      method="get"
      role="search"
      aria-label={t.filterLabel}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const daten = new FormData(e.currentTarget);
        const wert = (name: string) => String(daten.get(name) ?? "").trim();
        router.push(
          filterAdresse(pfad, window.location.search, {
            q: wert("q"),
            format: wert("format"),
            session: wert("session"),
            status: wert("status"),
            einwilligung: wert("einwilligung"),
          }),
        );
      }}
    >
      <SuchFeld name="q" defaultValue={werte.q} placeholder={t.filterSearch} aria-label={t.filterSearch} maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.filterFormat} htmlFor="bf-format">
          <Select
            id="bf-format"
            name="format"
            value={format}
            placeholder={t.filterAllFormats}
            options={formate}
            onChange={(e) => {
              setFormat(e.target.value);
              const s = sessions.find((x) => x.value === session);
              if (s && e.target.value && s.format !== e.target.value) setSession("");
            }}
          />
        </Field>
        <Field label={t.filterSession} htmlFor="bf-session">
          <Select
            id="bf-session"
            name="session"
            value={session}
            placeholder={t.filterAllSessions}
            options={passendeSessions}
            onChange={(e) => setSession(e.target.value)}
          />
        </Field>
        <Field label={t.filterStatus} htmlFor="bf-status">
          <Select id="bf-status" name="status" defaultValue={werte.status} placeholder={t.filterAllStatus} options={status} />
        </Field>
        <Field label={t.filterConsent} htmlFor="bf-einwilligung">
          <Select
            id="bf-einwilligung"
            name="einwilligung"
            defaultValue={werte.einwilligung}
            placeholder={t.filterAllConsent}
            options={[
              { value: "mit", label: t.consentWith },
              { value: "ohne", label: t.consentWithout },
            ]}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary">
          {t.filterApply}
        </Button>
        {filterAktiv(werte) && (
          <Link href={pfad} className="ct-link ct-small">
            {t.filterReset}
          </Link>
        )}
      </div>
    </form>
  );
}
