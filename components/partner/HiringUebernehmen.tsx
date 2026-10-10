"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import type { HiringEintrag } from "./hiring";
import { eintragOptionen } from "./hiring-uebernehmen";
import type { ProfilFeld, ProfilOption } from "./profil";

/** Was eine Maske für „Aus ‚Wen sucht ihr?‘ übernehmen“ braucht: die Einträge der Organisation, die Texte (`partnerHiring`) und wohin der Hinweis ohne Einträge führt. */
export type HiringVorbelegung = {
  eintraege: HiringEintrag[];
  /** `applyLabel`, `applyChoose`, `applyButton`, `applyHint`, `applied`, `applyNone`, `applyNoneLink` aus `partnerHiring`. */
  t: Record<string, string>;
  /** Partner: „Eure Daten“ (`/partner/onboarding#hiring`), Admin: der Abschnitt auf derselben Seite (`#hiring`). */
  leerHref: string;
};

/**
 * „Aus ‚Wen sucht ihr?‘ übernehmen“ (K-94 Stufe 2b, PART-140): ein Eintrag der Organisation füllt das Wunschprofil des Formats **vor** — Vorbelegung statt Verweis (Plan 10.10.).
 * Die Auswahl steht über den Fragen des Wunschprofils; „Übernehmen“ ersetzt Kategorie, Fachbereich, Skills und Studienfelder im **Entwurf** der Maske (der Status bleibt),
 * gespeichert wird erst mit „Speichern“ der Maske. Eine Zeile, eine Aktion (Skill-Regel 13): der Knopf steht neben der Auswahl, nicht darunter; er ist sekundär, der Hauptknopf der
 * Maske bleibt „Speichern“. Ohne Einträge steht an der Stelle ein Satz mit dem Weg dorthin statt einer leeren Auswahl (Regel 9).
 */
export function HiringUebernehmen({
  vorbelegung,
  felder,
  onUebernehmen,
  disabled,
}: {
  vorbelegung: HiringVorbelegung;
  /** Die Auswahllisten des Wunschprofils — daraus kommen die Beschriftungen von Kategorie und Fachbereich. */
  felder: Record<ProfilFeld, ProfilOption[]>;
  onUebernehmen: (eintrag: HiringEintrag) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { eintraege, t, leerHref } = vorbelegung;
  const [wahl, setWahl] = useState("");
  const [uebernommen, setUebernommen] = useState(false);

  if (eintraege.length === 0) {
    return (
      <p className="ct-help">
        {t.applyNone}{" "}
        <Link href={leerHref} className="ct-link">
          {t.applyNoneLink}
        </Link>
      </p>
    );
  }

  const beschriftung = (liste: ProfilOption[]) => Object.fromEntries(liste.map((o) => [o.key, o.label]));
  const optionen = eintragOptionen(eintraege, { career: beschriftung(felder.career_opportunities), area: beschriftung(felder.function_area) });

  return (
    <Field label={t.applyLabel} htmlFor={`${id}-eintrag`} hint={t.applyHint}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id={`${id}-eintrag`}
          className="w-full sm:w-auto sm:min-w-72 sm:max-w-full"
          value={wahl}
          placeholder={t.applyChoose}
          options={optionen}
          disabled={disabled}
          onChange={(ev) => {
            setWahl(ev.target.value);
            setUebernommen(false);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || wahl === ""}
          onClick={() => {
            const e = eintraege.find((x) => x.id === wahl);
            if (!e) return;
            onUebernehmen(e);
            setUebernommen(true);
          }}
        >
          {t.applyButton}
        </Button>
      </div>
      {/* Eine Ansage für Vorleser: der Entwurf hat sich geändert, ohne dass jemand ein Feld berührt hat. */}
      <p role="status" className="ct-help text-success-ink">
        {uebernommen ? t.applied : ""}
      </p>
    </Field>
  );
}
