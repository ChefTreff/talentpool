"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { sichtbareNavigation } from "@/lib/admin-navigation";
import type { AdminSectionKey } from "@/lib/admin-sections";

type Strings = Record<string, string>;

/**
 * „So sieht die Leiste für diese Rolle aus" (QS-032).
 *
 * Konrads Konto sieht immer alles — wie die Navigation für ein Teammitglied
 * aussieht, konnte er bisher nur erfahren, indem er sich jemandes Rolle gab.
 * Die Vorschau rechnet mit **derselben** Liste wie die Leiste
 * (`lib/admin-navigation.ts`) und derselben Regel wie das Tor: eine Ausnahme
 * für die Rolle schlägt die Vorgabe. Personen-Ausnahmen gehören zu einer
 * Person, nicht zur Rolle, und bleiben hier aussen vor.
 */
export function LeistenVorschau({
  rollen,
  vorgabe,
  rollenAusnahmen,
  nav,
  t,
}: {
  rollen: { value: string; label: string }[];
  vorgabe: Record<string, readonly string[]>;
  /** Nur Rollenzeilen aus `admin_section_override`. */
  rollenAusnahmen: { section: string; role: string; allowed: boolean }[];
  nav: Record<string, unknown>;
  t: Strings;
}) {
  const [rolle, setRolle] = useState(rollen[0]?.value ?? "");

  const offen = (section: AdminSectionKey) => {
    const ausnahme = rollenAusnahmen.find((a) => a.section === section && a.role === rolle);
    if (ausnahme) return ausnahme.allowed;
    return (vorgabe[section] ?? []).includes(rolle);
  };
  const gruppen = sichtbareNavigation(offen, nav);
  const anzahl = new Set(Object.keys(vorgabe).filter((k) => offen(k as AdminSectionKey))).size;

  return (
    <Card className="mt-8">
      <CardHeader ebene="h2" title={t.navPreviewTitle} description={t.navPreviewLead} />
      <Field label={t.navPreviewRole} htmlFor="leiste-rolle">
        <Select id="leiste-rolle" className="w-72" value={rolle} options={rollen} onChange={(e) => setRolle(e.target.value)} />
      </Field>
      <p className="ct-help mt-3">
        {t.navPreviewCount.replace("{n}", String(anzahl)).replace("{gesamt}", String(Object.keys(vorgabe).length))}
      </p>
      {gruppen.length === 0 ? (
        <p className="ct-small mt-4 text-muted">{t.navPreviewEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gruppen.map((g) => (
            <div key={g.label || "start"}>
              <p className="ct-eyebrow text-muted">{g.label || t.navPreviewStart}</p>
              <ul className="mt-1 ct-small">
                {g.items.map((p) => (
                  <li key={p.href} className="border-b py-1 last:border-0">{p.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
