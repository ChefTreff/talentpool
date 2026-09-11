/**
 * Datei-Regeln einer Pflicht (`deliverable.file_rules`).
 *
 * Dieselbe Prüfung läuft zweimal: hier im Browser, bevor überhaupt etwas
 * hochgeladen wird, und noch einmal in `register_partner_asset`. Der Client
 * spart dem Partner den vergeblichen Upload, verlassen kann man sich nur auf
 * die RPC.
 *
 * **Die Endung entscheidet.** Browser melden EPS oft als
 * `application/octet-stream`, manche gar nichts; ein MIME-Typ, den niemand
 * schickt, darf keine gültige Datei abweisen. Der MIME-Typ ist deshalb nur
 * eine Zusatzprüfung: ist er da und passt er nicht, ist die Datei falsch.
 */

export type FileRules = {
  ext?: string[] | null;
  mime?: string[] | null;
  max_bytes?: number | null;
} | null;

export type FileRuleFailure =
  | { reason: "ext"; detail: string }
  | { reason: "mime"; detail: string }
  | { reason: "size"; detail: string };

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/** `null` = alles in Ordnung. Sonst der erste Verstoß mit Detail für die Meldung. */
export function checkFileRules(
  file: { name: string; type?: string; size: number },
  rules: FileRules,
): FileRuleFailure | null {
  if (!rules) return null;

  const allowedExt = (rules.ext ?? []).map((e) => e.toLowerCase());
  if (allowedExt.length > 0) {
    const ext = extensionOf(file.name);
    if (!allowedExt.includes(ext)) {
      return { reason: "ext", detail: ext ? `.${ext}` : file.name };
    }
  }

  const allowedMime = (rules.mime ?? []).map((m) => m.toLowerCase());
  const mime = (file.type ?? "").toLowerCase();
  // Leer oder `application/octet-stream`: der Browser weiß es nicht. Dann
  // zählt die Endung, die oben schon gestimmt hat.
  const mimeUnknown = mime === "" || mime === "application/octet-stream";
  if (allowedMime.length > 0 && !mimeUnknown && !allowedMime.includes(mime)) {
    return { reason: "mime", detail: mime };
  }

  if (rules.max_bytes != null && file.size > rules.max_bytes) {
    return { reason: "size", detail: formatBytes(rules.max_bytes) };
  }

  return null;
}

/** Für `accept` am Datei-Feld — nur ein Vorfilter im Dateidialog. */
export function acceptAttribute(rules: FileRules): string | undefined {
  if (!rules) return undefined;
  const parts = [
    ...(rules.ext ?? []).map((e) => `.${e.toLowerCase()}`),
    ...(rules.mime ?? []),
  ];
  return parts.length > 0 ? parts.join(",") : undefined;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
