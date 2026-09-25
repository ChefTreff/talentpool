"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { Select } from "@/components/ui/Select";
import {
  MAX_KONTAKT_VIA,
  MAX_THEMA,
  kontaktViaHatAdresse,
  type EinordnungEntwurf,
  type EinordnungFeld,
} from "@/lib/speaker/einordnung";

type Strings = Record<string, string>;

/** Auswahllisten aus dem Vokabular (Schlüssel → Bezeichnung) und die Bühnen der Edition. */
export type EinordnungOptionen = {
  category: Record<string, string>;
  topic_cluster: Record<string, string>;
  priority: Record<string, string>;
  recommended_format: Record<string, string>;
  outreach_channel: Record<string, string>;
  stages: { value: string; label: string }[];
};

/**
 * Die Einordnung aus der Arbeitstabelle als Formular (LEAD-039): Kategorie,
 * Themencluster, Thema oder Rolle, Prio, empfohlenes Format, Bühnen in Frage,
 * Kontakt via und der Weg der Ansprache. Dieselbe Komponente im Fenster der
 * Speaker-Leads und im Admin-Detail, damit die Felder nie auseinanderlaufen.
 *
 * Alle Felder sind freiwillig; „keine Angabe“ leert ein Feld wieder.
 */
export function EinordnungFelder({
  idPrefix,
  value,
  onChange,
  optionen,
  t,
  none,
  disabled,
}: {
  idPrefix: string;
  value: EinordnungEntwurf;
  onChange: (next: EinordnungEntwurf) => void;
  optionen: EinordnungOptionen;
  /** `speakerEinordnung`-Texte. */
  t: Strings;
  /** „keine Angabe“ als erste Zeile jeder Auswahl. */
  none: string;
  disabled?: boolean;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  const set = (k: EinordnungFeld, v: string) => onChange({ ...value, [k]: v });
  const liste = (m: Record<string, string>) => Object.entries(m).map(([v, label]) => ({ value: v, label }));
  const auswahl = (k: Exclude<EinordnungFeld, "topic_role" | "contact_via">, label: string) => (
    <Field label={label} htmlFor={id(k)}>
      <Select
        id={id(k)}
        value={value[k]}
        placeholder={none}
        options={liste(optionen[k])}
        disabled={disabled}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );
  const adresse = kontaktViaHatAdresse(value.contact_via);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {auswahl("category", t.category)}
      {auswahl("topic_cluster", t.topicCluster)}
      <Field label={t.topicRole} htmlFor={id("topic_role")} hint={t.topicRoleHint} className="sm:col-span-2">
        <Input
          id={id("topic_role")}
          value={value.topic_role}
          maxLength={MAX_THEMA}
          disabled={disabled}
          onChange={(e) => set("topic_role", e.target.value)}
        />
      </Field>
      {auswahl("priority", t.priority)}
      {auswahl("recommended_format", t.recommendedFormat)}
      <Field label={t.stages} htmlFor={id("stages")} hint={t.stagesHint} className="sm:col-span-2">
        <MehrfachAuswahl
          id={id("stages")}
          options={optionen.stages}
          value={value.stage_ids}
          onChange={(stage_ids) => onChange({ ...value, stage_ids })}
          placeholder={t.stagesSearch}
          disabled={disabled}
          describedBy={`${id("stages")}-hint`}
          t={{ remove: t.stageRemove, noHits: t.stagesNoHits }}
        />
      </Field>
      <Field
        label={t.contactVia}
        htmlFor={id("contact_via")}
        hint={t.contactViaHint}
        error={adresse ? t.contactViaNoAddress : undefined}
      >
        <Input
          id={id("contact_via")}
          value={value.contact_via}
          maxLength={MAX_KONTAKT_VIA}
          invalid={adresse}
          aria-describedby={adresse ? `${id("contact_via")}-error` : `${id("contact_via")}-hint`}
          disabled={disabled}
          onChange={(e) => set("contact_via", e.target.value)}
        />
      </Field>
      {auswahl("outreach_channel", t.outreachChannel)}
    </div>
  );
}
