/** Zeile aus `vocab_terms_admin()` (Migration 0130). */
export type VocabTerm = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string;
  sort_order: number;
  active: boolean;
  parent_vocabulary: string | null;
  parent_key: string | null;
  /**
   * Wie oft der Begriff in den Daten vorkommt. **`null` heisst nicht „nie",
   * sondern „unbekannt"** — für ein Vokabular, dessen Verwendung nicht im
   * Verzeichnis steht. Der Löschknopf unterscheidet die beiden Fälle.
   */
  usage: number | null;
  kinder: number;
};
