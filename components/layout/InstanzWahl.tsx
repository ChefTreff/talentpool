import { SectionTabs } from "@/components/layout/SectionTabs";
import { instanzHref, type InstanzLeiste } from "@/lib/partner/instanz";

/**
 * Der Umschalter einer Seite mit mehreren Instanzen (QS-079, Skill-Regel 12; `referenzen/muster.md` → „Mehrere Instanzen“): ein Reiter je Instanz,
 * die gewählte steht in der Adresse als `?instanz=<id>`, und darunter zeichnet die Seite genau eine Instanz mit ihren Formularen.
 *
 * Eine dünne Hülle um `SectionTabs` mit `aktiv` — die Seite weiß, welche Instanz gewählt ist, `usePathname()` kennt die Abfrage nicht. Entstanden beim
 * zweiten Einsatz (Masterclass, Interview Tables), weil die Zuordnung `Instanz → Reiter` sonst an jeder Seite stünde. `leiste` kommt aus `instanzLeiste`
 * (`lib/partner/instanz.ts`) und gibt es erst ab zwei Instanzen; ohne sie zeichnet die Hülle nichts, die Seite ist dann wie vorher.
 *
 * Der Umschalter steht **über** den Sichten der Seite (Reiter wie „Inhalt · Bewerbungen“), nie in derselben Leiste.
 */
export function InstanzWahl({ leiste, label }: { leiste: InstanzLeiste | null; label: string }) {
  if (!leiste) return null;
  return (
    <SectionTabs
      label={label}
      items={leiste.items.map((x) => ({ href: instanzHref(x.id), label: x.label, aktiv: x.id === leiste.gewaehlt }))}
    />
  );
}
