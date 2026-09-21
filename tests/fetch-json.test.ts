import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { postJson, readJson } from "@/lib/fetch-json";

const echtesFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = echtesFetch;
});

function antwort(body: string, init: { status?: number; type?: string }): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "application/json" },
  });
}

/** Die Antwort, die die Plattform bei einem zu grossen Rumpf schickt. */
const PLATTFORM_413 = "<!DOCTYPE html><html><body>Request Entity Too Large</body></html>";
/** Die Antwort, die ein abgelaufenes Login schickt: Status 200, aber HTML. */
const LOGIN_HTML = "<!DOCTYPE html><html><body>Login</body></html>";

/**
 * Diese Tests halten fest, was am 21.09.2026 die Seite gekostet hat: ein
 * `await res.json()` auf einer Antwort, die kein JSON war. In einer
 * `startTransition` reisst so ein Wurf den ganzen Seitenbaum mit, weil es
 * nirgends eine Fehlergrenze gibt. Wer `readJson`/`postJson` für Umstand hält
 * und wieder direkt parst, bekommt hier rote Zeilen.
 */
describe("readJson: liest nur, was wirklich JSON ist", () => {
  it("gibt bei HTML null zurück, statt zu werfen", async () => {
    assert.equal(await readJson(antwort(PLATTFORM_413, { status: 413, type: "text/html" })), null);
  });

  it("gibt auch bei kaputtem JSON null zurück", async () => {
    assert.equal(await readJson(antwort("{kein json", {})), null);
  });

  it("nimmt den Zeichensatz im Content-Type hin", async () => {
    const res = antwort('{"a":1}', { type: "application/json; charset=utf-8" });
    assert.deepEqual(await readJson(res), { a: 1 });
  });
});

describe("postJson: jede Antwort ist ein Ergebnis, kein Absturz", () => {
  it("meldet den zu grossen Rumpf der Plattform als file_too_large", async () => {
    // Die Plattform antwortet, bevor unsere Route läuft — es gibt also keinen
    // Fehlerschlüssel im Rumpf, nur den Status.
    globalThis.fetch = async () => antwort(PLATTFORM_413, { status: 413, type: "text/html" });
    const res = await postJson("/api/x", {});
    assert.deepEqual(res, { ok: false, status: 413, key: "file_too_large", detail: undefined });
  });

  it("verschluckt sich nicht an der Loginseite mit Status 200", async () => {
    globalThis.fetch = async () => antwort(LOGIN_HTML, { status: 200, type: "text/html" });
    const res = await postJson("/api/x", {});
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.key, "unknown");
  });

  it("nimmt Schlüssel und Detail aus unserer eigenen Fehlerantwort", async () => {
    globalThis.fetch = async () =>
      antwort(JSON.stringify({ error: "wrong_type", detail: "image/heic" }), { status: 415 });
    const res = await postJson("/api/x", {});
    assert.deepEqual(res, { ok: false, status: 415, key: "wrong_type", detail: "image/heic" });
  });

  it("gibt bei Erfolg die Daten heraus", async () => {
    globalThis.fetch = async () => antwort(JSON.stringify({ path: "a/b/c", token: "t" }), {});
    const res = await postJson<{ path: string }>("/api/x", {});
    assert.equal(res.ok, true);
    assert.equal(res.ok === true && res.data.path, "a/b/c");
  });

  it("macht auch aus einem Netzfehler ein Ergebnis", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const res = await postJson("/api/x", {});
    assert.deepEqual(res, { ok: false, status: 0, key: "network" });
  });
});
