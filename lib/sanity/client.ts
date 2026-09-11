import "server-only";

/**
 * Sanity HTTP-API (Welle 3 A11). Kein SDK. Werte nur aus der Server-Umgebung (`SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN`).
 * Regeln (Entscheidungslog 11.09.): bis zur Freigabe durch das Web-Team nur ein Viewer-Token (Lesen); geschrieben wird ausschließlich
 * unser Dokumenttyp `portalPartnerLogo`, nie Schema oder fremde Dokumente; `dryRun=true` der API validiert, ohne zu schreiben.
 */
const API_VERSION = "v2025-02-19";

export class SanityError extends Error {
  constructor(
    public readonly status: number,
    public readonly operation: string,
    detail: string,
  ) {
    super(`sanity ${status} ${operation}: ${detail}`);
  }
}

export type SanityConfig = { projectId: string; dataset: string; token: string };

export function sanityConfig(): SanityConfig | null {
  const projectId = process.env.SANITY_PROJECT_ID?.trim();
  const token = process.env.SANITY_API_TOKEN?.trim();
  const dataset = process.env.SANITY_DATASET?.trim() || "production";
  if (!projectId || !token) return null;
  return { projectId, dataset, token };
}

export function hasSanityConfig(): boolean {
  return sanityConfig() !== null;
}

async function call<T>(operation: string, path: string, init: RequestInit, cfg: SanityConfig): Promise<T> {
  const res = await fetch(`https://${cfg.projectId}.api.sanity.io/${API_VERSION}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${cfg.token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new SanityError(res.status, operation, text.slice(0, 500));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SanityError(res.status, operation, `keine JSON-Antwort: ${text.slice(0, 200)}`);
  }
}

/** GROQ-Abfrage (auch mit Viewer-Token). */
export async function sanityQuery<T>(groq: string, params: Record<string, unknown> = {}): Promise<T> {
  const cfg = sanityConfig();
  if (!cfg) throw new Error("SANITY_PROJECT_ID/SANITY_API_TOKEN fehlen (docs/zugangs-liste.md)");
  const q = new URLSearchParams({ query: groq });
  for (const [k, v] of Object.entries(params)) q.set(`$${k}`, JSON.stringify(v));
  const data = await call<{ result: T }>("query", `/data/query/${cfg.dataset}?${q}`, { method: "GET" }, cfg);
  return data.result;
}

export type SanityMutation = { createOrReplace: Record<string, unknown> } | { patch: Record<string, unknown> } | { delete: { id: string } };
export type SanityMutateResult = { transactionId: string; results: { id?: string; documentId?: string; operation: string }[] };

/** Mutationen; `dryRun` lässt Sanity prüfen, ohne zu schreiben (Trockenlauf). */
export async function sanityMutate(mutations: SanityMutation[], opts: { dryRun?: boolean } = {}): Promise<SanityMutateResult> {
  const cfg = sanityConfig();
  if (!cfg) throw new Error("SANITY_PROJECT_ID/SANITY_API_TOKEN fehlen (docs/zugangs-liste.md)");
  const q = new URLSearchParams({ returnIds: "true", dryRun: opts.dryRun ? "true" : "false" });
  return call<SanityMutateResult>(
    opts.dryRun ? "mutate(dryRun)" : "mutate",
    `/data/mutate/${cfg.dataset}?${q}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutations }) },
    cfg,
  );
}

export type SanityAsset = { _id: string; url?: string; mimeType?: string; originalFilename?: string };

/** Bild-Asset hochladen (SVG als Bild; fällt bei Ablehnung auf ein Datei-Asset zurück). */
export async function sanityUploadImage(blob: Blob, filename: string, contentType: string): Promise<SanityAsset> {
  const cfg = sanityConfig();
  if (!cfg) throw new Error("SANITY_PROJECT_ID/SANITY_API_TOKEN fehlen (docs/zugangs-liste.md)");
  const q = new URLSearchParams({ filename });
  const body = await blob.arrayBuffer();
  try {
    const data = await call<{ document: SanityAsset }>("assets/images", `/assets/images/${cfg.dataset}?${q}`, { method: "POST", headers: { "content-type": contentType }, body }, cfg);
    return data.document;
  } catch (e) {
    if (!(e instanceof SanityError) || e.status !== 400) throw e;
    const data = await call<{ document: SanityAsset }>("assets/files", `/assets/files/${cfg.dataset}?${q}`, { method: "POST", headers: { "content-type": contentType }, body }, cfg);
    return data.document;
  }
}
