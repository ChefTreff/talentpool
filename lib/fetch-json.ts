/**
 * Eine Antwort lesen, ohne die Seite aufs Spiel zu setzen.
 *
 * `await res.json()` ist harmlos, solange die Antwort von uns kommt. Sie kommt
 * aber nicht immer von uns: die Plattform weist einen zu grossen Rumpf mit
 * einer **HTML**-Seite ab, ein abgelaufenes Login endet auf der Loginseite
 * (Status 200, ebenfalls HTML), und ein Gateway-Fehler schickt was auch immer.
 * In allen drei Fällen wirft `res.json()` — und wer das in einer
 * `startTransition` tut, verliert nicht den Aufruf, sondern die ganze Seite:
 * React reicht den Fehler nach oben, findet keine Fehlergrenze und ersetzt den
 * Baum durch die Fehlerseite.
 *
 * Genau das ist Konrad am 21.09.2026 beim Bild-Upload passiert („This page
 * couldn't load" statt einer Meldung). Deshalb liest niemand mehr eine Antwort
 * direkt, sondern hierüber: JSON gibt es nur, wenn wirklich JSON dasteht,
 * sonst `null` — und `null` ist ein Fall, den der Aufrufer behandeln muss.
 */
export async function readJson<T>(res: Response): Promise<T | null> {
  const typ = res.headers.get("content-type") ?? "";
  if (!typ.toLowerCase().includes("application/json")) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Was eine Anfrage an unsere eigenen Routen zurückgibt. */
export type JsonErgebnis<T> =
  | { ok: true; data: T }
  /**
   * `key` ist der Fehlerschlüssel für die Oberfläche. Kam gar kein JSON an,
   * steht hier, was der Status verrät — `file_too_large` bei 413,
   * `not_allowed` bei 401/403, sonst `unknown`.
   */
  | { ok: false; status: number; key: string; detail?: string };

/**
 * Eine JSON-Anfrage an eine eigene Route stellen und **nie** werfen.
 *
 * Auch das Netz selbst kann ausfallen (Tunnel, Flugmodus, Serverneustart);
 * `fetch` wirft dann, bevor es eine Antwort gibt. Auch das ist hier ein
 * Ergebnis, kein Absturz.
 */
export async function postJson<T>(url: string, body: unknown): Promise<JsonErgebnis<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, key: "network" };
  }

  const json = await readJson<T & { error?: string; detail?: string }>(res);
  if (res.ok && json) return { ok: true, data: json };
  if (res.ok) return { ok: false, status: res.status, key: "unknown" };
  return {
    ok: false,
    status: res.status,
    key: json?.error ?? statusSchluessel(res.status),
    detail: json?.detail,
  };
}

/** Ohne JSON im Rumpf sagt allein der Status, was passiert ist. */
function statusSchluessel(status: number): string {
  if (status === 413) return "file_too_large";
  if (status === 401 || status === 403) return "not_allowed";
  if (status === 415) return "wrong_type";
  return "unknown";
}
