/** Ein Standpaket mit seiner Stückliste, wie `booth_packages()` es liefert. */
export type BoothPackage = {
  sku: string;
  name_de: string;
  name_en: string | null;
  description_de: string | null;
  description_en: string | null;
  area_sqm: number | null;
  size_note: string | null;
  net_price_cents: number | null;
  components: {
    sku: string;
    qty: number;
    unit: string;
    name_de: string;
    name_en: string | null;
  }[];
};

/** Eine Zeile der Ausstellerliste (`exhibitor_list`) — ohne Personenbezug. */
export type Exhibitor = {
  org_id: string;
  name: string;
  booth_number: string | null;
  booth_type: string | null;
  segment: string | null;
  package_name_de: string | null;
  package_name_en: string | null;
};

/** Eine Datei der Edition (`edition_files`). */
export type EditionFile = {
  id: string;
  kind: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  label_de: string | null;
  label_en: string | null;
  created_at: string;
};
