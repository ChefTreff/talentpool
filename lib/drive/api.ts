import { anmeldung, TOKEN_ADRESSE, type Dienstkonto } from "@/lib/drive/konto";

/**
 * Google Drive v3 über die HTTP-API, ohne SDK (wie `lib/sanity/client.ts`).
 *
 * `fetch` kommt von aussen, damit `tests/drive-spiegel.test.ts` jeden Aufruf
 * nachstellen kann und das Gate nie mit Drive spricht. Jeder Aufruf trägt
 * `supportsAllDrives`: der Technik-Ordner liegt in einer geteilten Ablage
 * („Summit 2027“), und ohne den Schalter antwortet Drive dort mit 404.
 *
 * Keine Parameter-Eigenschaften in Klassen: die Tests laden die Datei mit
 * `--experimental-strip-types`, das Typen nur entfernt, nicht übersetzt.
 */
const DRIVE = "https://www.googleapis.com/drive/v3";
const HOCHLADEN = "https://www.googleapis.com/upload/drive/v3";
export const ORDNER_TYP = "application/vnd.google-apps.folder";

/** Unter diesem Schlüssel stehen unsere Kennungen an Ordnern und Dateien (`appProperties`). */
export const APP_SCHLUESSEL = "fls27";

const DATEI_FELDER = "id,name,mimeType,parents,trashed,appProperties,webViewLink";
const KURZ_MS = 20_000;
/** Ein Upload bis 100 MB (MAX_UPLOAD_BYTES) braucht mehr als eine Metadaten-Anfrage. */
const UPLOAD_MS = 240_000;

/** Fehler der Spiegelung, mit einem Schlüssel für die Admin-Anzeige. */
export type FehlerSchluessel =
  | "drive_auth"
  | "drive_api_off"
  | "drive_folder_missing"
  | "drive_quota"
  | "drive_permission"
  | "drive_rate"
  | "drive_unavailable"
  | "drive_network"
  | "drive_error";

export class DriveFehler extends Error {
  readonly status: number;
  readonly schluessel: FehlerSchluessel;
  readonly schritt: string;
  /** Googles Meldung, gekürzt — für die Admin-Anzeige, nie mit Schlüsseln oder Tokens. */
  readonly detail: string;
  constructor(status: number, schluessel: FehlerSchluessel, schritt: string, detail: string) {
    super(`drive ${status} ${schritt}: ${schluessel}`);
    this.status = status;
    this.schluessel = schluessel;
    this.schritt = schritt;
    this.detail = detail.slice(0, 300);
  }
}

export type DriveDatei = {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
  webViewLink?: string;
};

/** Was das Konto am Zielordner darf — für „Verbindung prüfen“. */
export type OrdnerRechte = {
  id: string;
  name: string;
  geteilteAblage: boolean;
  anlegen: boolean;
  loeschen: boolean;
  verschieben: boolean;
};

export type Hochladen = {
  name: string;
  mime: string;
  inhalt: Uint8Array;
  eigenschaften: Record<string, string>;
};

export type DriveApi = {
  ordnerRechte(ordnerId: string): Promise<OrdnerRechte>;
  /** Kind eines Ordners mit unserer Kennung, das älteste zuerst (falls zwei gleichzeitig entstanden). */
  finden(elternId: string, kennung: string, nurOrdner: boolean): Promise<DriveDatei | null>;
  ordnerAnlegen(elternId: string, name: string, kennung: string): Promise<DriveDatei>;
  umbenennen(id: string, name: string): Promise<void>;
  /** `null`, wenn es die Datei nicht (mehr) gibt oder sie im Papierkorb liegt. */
  dateiLesen(id: string): Promise<DriveDatei | null>;
  hochladen(elternId: string, datei: Hochladen): Promise<DriveDatei>;
  /** Neuer Inhalt für dieselbe Datei — ID, Freigabe und Link bleiben, Drive führt die alte Fassung als Version. */
  ersetzen(id: string, datei: Hochladen, verschieben?: { hinzu: string; weg: string[] }): Promise<DriveDatei>;
  /** Nur Name, Ort und Kennungen — wenn der Slot wandert, die Folie aber dieselbe bleibt. */
  verschieben(id: string, name: string, eigenschaften: Record<string, string>, verschieben: { hinzu: string; weg: string[] }): Promise<DriveDatei>;
  /** In den Papierkorb der Ablage (dort nach 30 Tagen gelöscht); eine schon fehlende Datei gilt als entfernt. */
  loeschen(id: string): Promise<void>;
};

export type DriveDeps = { fetch?: typeof fetch; jetzt?: () => number };

/** Einen Wert für die Drive-Suche in einfache Anführungszeichen setzen. */
export function suchWert(text: string): string {
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

type GoogleFehler = { error?: { code?: number; message?: string; status?: string; errors?: { reason?: string }[] } | string; error_description?: string };

/** HTTP-Status und Googles Begründung → Schlüssel für die Anzeige. */
export function fehlerSchluessel(status: number, koerper: GoogleFehler | null, schritt: string): FehlerSchluessel {
  if (schritt === "anmelden") return status >= 500 ? "drive_unavailable" : "drive_auth";
  const fehler = koerper && typeof koerper.error === "object" ? koerper.error : null;
  const gruende = new Set((fehler?.errors ?? []).map((e) => e.reason ?? ""));
  if (fehler?.status === "UNAUTHENTICATED" || status === 401) return "drive_auth";
  if (gruende.has("accessNotConfigured") || fehler?.status === "SERVICE_DISABLED") return "drive_api_off";
  if (gruende.has("storageQuotaExceeded")) return "drive_quota";
  if (status === 429 || gruende.has("rateLimitExceeded") || gruende.has("userRateLimitExceeded")) return "drive_rate";
  if (status === 404) return "drive_folder_missing";
  if (status === 403) return "drive_permission";
  if (status >= 500) return "drive_unavailable";
  return "drive_error";
}

function meldungAus(koerper: GoogleFehler | null, text: string): string {
  if (koerper && typeof koerper.error === "object" && koerper.error?.message) return koerper.error.message;
  if (koerper && typeof koerper.error === "string") return `${koerper.error}${koerper.error_description ? `: ${koerper.error_description}` : ""}`;
  return text.slice(0, 200);
}

export function driveApi(konto: Dienstkonto, deps: DriveDeps = {}): DriveApi {
  const holen = deps.fetch ?? fetch;
  const jetzt = deps.jetzt ?? Date.now;
  let zugang: { wert: string; bis: number } | null = null;

  async function antwort(schritt: string, url: string, init: RequestInit, dauer: number): Promise<Response> {
    try {
      return await holen(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(dauer) });
    } catch (e) {
      throw new DriveFehler(0, "drive_network", schritt, e instanceof Error ? e.name : "fetch");
    }
  }

  async function fehlerAus(schritt: string, res: Response): Promise<DriveFehler> {
    const text = await res.text().catch(() => "");
    let koerper: GoogleFehler | null = null;
    try {
      koerper = JSON.parse(text) as GoogleFehler;
    } catch {
      koerper = null;
    }
    return new DriveFehler(res.status, fehlerSchluessel(res.status, koerper, schritt), schritt, meldungAus(koerper, text));
  }

  async function token(): Promise<string> {
    if (zugang && zugang.bis > jetzt() + 60_000) return zugang.wert;
    const res = await antwort(
      "anmelden",
      TOKEN_ADRESSE,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: anmeldung(konto, Math.floor(jetzt() / 1000)),
        }).toString(),
      },
      KURZ_MS,
    );
    if (!res.ok) throw await fehlerAus("anmelden", res);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new DriveFehler(res.status, "drive_auth", "anmelden", "kein access_token");
    zugang = { wert: json.access_token, bis: jetzt() + (json.expires_in ?? 3600) * 1000 };
    return zugang.wert;
  }

  async function json<T>(schritt: string, url: string, init: RequestInit = {}, dauer = KURZ_MS): Promise<T> {
    const res = await antwort(
      schritt,
      url,
      { ...init, headers: { authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) } },
      dauer,
    );
    if (!res.ok) throw await fehlerAus(schritt, res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  function adresse(basis: string, pfad: string, werte: Record<string, string | undefined>): string {
    const q = new URLSearchParams({ supportsAllDrives: "true" });
    for (const [k, v] of Object.entries(werte)) if (v) q.set(k, v);
    return `${basis}${pfad}?${q}`;
  }

  /** Resumable Upload: erst die Metadaten (liefert die Sitzungsadresse), dann der Inhalt in einem Stück. */
  async function hochladenNach(
    schritt: string,
    methode: "POST" | "PATCH",
    url: string,
    metadaten: Record<string, unknown>,
    datei: Hochladen,
  ): Promise<DriveDatei> {
    const start = await antwort(
      schritt,
      url,
      {
        method: methode,
        headers: {
          authorization: `Bearer ${await token()}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": datei.mime,
          "x-upload-content-length": String(datei.inhalt.byteLength),
        },
        body: JSON.stringify(metadaten),
      },
      KURZ_MS,
    );
    if (!start.ok) throw await fehlerAus(schritt, start);
    const sitzung = start.headers.get("location");
    if (!sitzung?.startsWith("https://")) throw new DriveFehler(start.status, "drive_error", schritt, "keine Upload-Adresse");
    const res = await antwort(
      schritt,
      sitzung,
      { method: "PUT", headers: { "content-type": datei.mime }, body: datei.inhalt as unknown as BodyInit },
      UPLOAD_MS,
    );
    if (!res.ok) throw await fehlerAus(schritt, res);
    return (await res.json()) as DriveDatei;
  }

  return {
    async ordnerRechte(ordnerId) {
      const d = await json<{
        id: string;
        name: string;
        mimeType?: string;
        driveId?: string;
        capabilities?: Record<string, boolean | undefined>;
      }>(
        "ordner",
        adresse(DRIVE, `/files/${encodeURIComponent(ordnerId)}`, {
          fields: "id,name,mimeType,driveId,capabilities(canAddChildren,canDeleteChildren,canTrashChildren,canMoveChildrenWithinDrive)",
        }),
      );
      const c = d.capabilities ?? {};
      return {
        id: d.id,
        name: d.name,
        geteilteAblage: Boolean(d.driveId),
        anlegen: c.canAddChildren === true,
        // Entfernt wird über den Papierkorb (siehe `loeschen`) — das darf ein Inhaltsmanager.
        loeschen: c.canTrashChildren === true || c.canDeleteChildren === true,
        verschieben: c.canMoveChildrenWithinDrive === true,
      };
    },

    async finden(elternId, kennung, nurOrdner) {
      const q = [
        `${suchWert(elternId)} in parents`,
        `appProperties has { key=${suchWert(APP_SCHLUESSEL)} and value=${suchWert(kennung)} }`,
        "trashed = false",
        nurOrdner ? `mimeType = ${suchWert(ORDNER_TYP)}` : null,
      ]
        .filter(Boolean)
        .join(" and ");
      const r = await json<{ files?: DriveDatei[] }>(
        "suchen",
        adresse(DRIVE, "/files", {
          q,
          corpora: "allDrives",
          includeItemsFromAllDrives: "true",
          orderBy: "createdTime",
          pageSize: "10",
          fields: `files(${DATEI_FELDER})`,
        }),
      );
      return r.files?.[0] ?? null;
    },

    async ordnerAnlegen(elternId, name, kennung) {
      return json<DriveDatei>("ordner_anlegen", adresse(DRIVE, "/files", { fields: DATEI_FELDER }), {
        method: "POST",
        headers: { "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ name, mimeType: ORDNER_TYP, parents: [elternId], appProperties: { [APP_SCHLUESSEL]: kennung } }),
      });
    },

    async umbenennen(id, name) {
      await json<DriveDatei>("umbenennen", adresse(DRIVE, `/files/${encodeURIComponent(id)}`, { fields: "id" }), {
        method: "PATCH",
        headers: { "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ name }),
      });
    },

    async dateiLesen(id) {
      try {
        const d = await json<DriveDatei>("lesen", adresse(DRIVE, `/files/${encodeURIComponent(id)}`, { fields: DATEI_FELDER }));
        return d.trashed ? null : d;
      } catch (e) {
        if (e instanceof DriveFehler && e.status === 404) return null;
        throw e;
      }
    },

    async hochladen(elternId, datei) {
      return hochladenNach(
        "hochladen",
        "POST",
        adresse(HOCHLADEN, "/files", { uploadType: "resumable", fields: DATEI_FELDER }),
        { name: datei.name, parents: [elternId], appProperties: datei.eigenschaften },
        datei,
      );
    },

    async ersetzen(id, datei, verschieben) {
      return hochladenNach(
        "ersetzen",
        "PATCH",
        adresse(HOCHLADEN, `/files/${encodeURIComponent(id)}`, {
          uploadType: "resumable",
          fields: DATEI_FELDER,
          addParents: verschieben?.hinzu,
          removeParents: verschieben?.weg.join(",") || undefined,
        }),
        { name: datei.name, appProperties: datei.eigenschaften },
        datei,
      );
    },

    async verschieben(id, name, eigenschaften, ziel) {
      return json<DriveDatei>(
        "verschieben",
        adresse(DRIVE, `/files/${encodeURIComponent(id)}`, {
          fields: DATEI_FELDER,
          addParents: ziel.hinzu,
          removeParents: ziel.weg.join(",") || undefined,
        }),
        {
          method: "PATCH",
          headers: { "content-type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ name, appProperties: eigenschaften }),
        },
      );
    },

    async loeschen(id) {
      // In den Papierkorb, nicht `DELETE`: endgültig löschen darf in einer
      // geteilten Ablage nur ein Manager der Ablage, und diese Rolle gibt es
      // für einen einzelnen Ordner nicht. Der Papierkorb der Ablage löscht
      // nach 30 Tagen von selbst.
      try {
        await json<DriveDatei>("loeschen", adresse(DRIVE, `/files/${encodeURIComponent(id)}`, { fields: "id" }), {
          method: "PATCH",
          headers: { "content-type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ trashed: true }),
        });
      } catch (e) {
        if (e instanceof DriveFehler && e.status === 404) return;
        throw e;
      }
    },
  };
}
