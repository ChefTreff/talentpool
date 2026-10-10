import { SectionTabs } from "@/components/layout/SectionTabs";
import { buehnenReiterLinks, type BuehnenReiter } from "@/components/partner/eure-buehne";

/**
 * Die Sichten auf „Eure Bühne“: der Kalender (Board) gehört immer dazu, dahinter je nach Art der eigenen Bühnen die Tabelle (PART-078) und die Gäste
 * (PART-081) der Standbühne und die Speaker der gebrandeten Bühne (PART-138). Welche es gibt, entscheidet `buehnenReiter`, die Links liefert
 * `buehnenReiterLinks` — hier steht nur die Leiste; mit dem Kalender allein gibt es nichts zu wählen, dann bleibt sie weg. `TableTabs` aus dem Board-Kern
 * kennt nur Kalender und Tabelle, also steht die Leiste hier.
 */
export function BuehnenTabs({
  t,
  reiter,
}: {
  t: { label: string; board: string; table: string; guests: string; speakers: string };
  reiter: BuehnenReiter;
}) {
  const items = buehnenReiterLinks(reiter, t);
  if (items.length < 2) return null;
  return <SectionTabs label={t.label} items={items} />;
}
