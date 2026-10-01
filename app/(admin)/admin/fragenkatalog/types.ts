/** Eine Zeile aus `question_catalog`, ergänzt um die Zahl der Sessions, die sie benutzen. */
export type KatalogFrage = {
  id: string;
  key: string;
  label_de: string;
  label_en: string;
  help_de: string | null;
  help_en: string | null;
  type: string;
  options: { key: string; label_de: string; label_en: string }[] | null;
  active: boolean;
  partner_selectable: boolean;
  sort_order: number;
  /** Sessions, die diese Frage stellen — dann sind Typ und Schlüssel fest. */
  in_use: number;
};

export const FRAGETYPEN = ["text", "textarea", "select", "multiselect", "boolean", "url", "file", "number"] as const;
export const MIT_OPTIONEN = new Set(["select", "multiselect"]);
