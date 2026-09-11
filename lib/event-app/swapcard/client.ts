import "server-only";
import { SWAPCARD_GRAPHQL } from "@/lib/event-app/swapcard/queries";

/** GraphQL-Client für die Swapcard Content-API. Kein SDK; der Key kommt nur aus der Server-Umgebung (`SWAPCARD_API_KEY`, in Vercel sensibel). */
export class SwapcardError extends Error {
  constructor(
    public readonly status: number,
    public readonly operation: string,
    detail: string,
  ) {
    super(`swapcard ${status} ${operation}: ${detail}`);
  }
}

export function hasSwapcardKey(): boolean {
  return Boolean(process.env.SWAPCARD_API_KEY?.trim());
}

export async function gql<T>(operation: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const key = process.env.SWAPCARD_API_KEY?.trim();
  if (!key) throw new Error("SWAPCARD_API_KEY fehlt (docs/zugangs-liste.md)");
  const res = await fetch(SWAPCARD_GRAPHQL, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new SwapcardError(res.status, operation, text.slice(0, 500));
  let json: { data?: T; errors?: { message?: string }[] };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new SwapcardError(res.status, operation, `keine JSON-Antwort: ${text.slice(0, 200)}`);
  }
  if (json.errors && json.errors.length > 0) {
    throw new SwapcardError(res.status, operation, json.errors.map((e) => e.message ?? "?").join("; ").slice(0, 500));
  }
  if (json.data === undefined) throw new SwapcardError(res.status, operation, "Antwort ohne data");
  return json.data;
}
