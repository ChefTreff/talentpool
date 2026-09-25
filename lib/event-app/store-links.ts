/**
 * Store-Links der Event-App (Swapcard, App „FLS 2026", Konrad 21./24.09.).
 *
 * Seit PART-072 pflegt das Team die Adressen im Admin unter Videos
 * (`portal_link`, Abschnitt „Links“) — die App wird im Store gerade angepasst,
 * und ein Link im Code bräuchte dafür einen Deploy. Diese Datei nennt nur noch
 * die Schlüssel; gelesen wird über `loadStoreLinks` (`./load-store-links.ts`),
 * vom Teilnehmer-Programm (TAL-014) und vom Partner-Portal dieselben zwei
 * Einträge. Fehlt einer, lässt die Seite den Knopf weg.
 */
export const STORE_LINK_SCHLUESSEL = {
  appStore: "event_app_app_store",
  googlePlay: "event_app_google_play",
} as const;

export type StoreLinks = { appStore: string | null; googlePlay: string | null };

/** Aus den Zeilen von `portal_links_for` die beiden Adressen — nur https, sonst `null`. */
export function storeLinksAus(zeilen: { key: string; url: string | null }[]): StoreLinks {
  const url = (key: string) => {
    const wert = zeilen.find((z) => z.key === key)?.url ?? null;
    return wert && /^https:\/\//.test(wert) ? wert : null;
  };
  return { appStore: url(STORE_LINK_SCHLUESSEL.appStore), googlePlay: url(STORE_LINK_SCHLUESSEL.googlePlay) };
}
