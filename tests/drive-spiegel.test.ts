import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { anmeldung, dienstkontoAus, DIENSTKONTO_VARIABLE, DRIVE_BEREICH, TOKEN_ADRESSE } from "@/lib/drive/konto";
import { driveApi, DriveFehler, fehlerSchluessel, ORDNER_TYP, suchWert, type DriveApi, type DriveDatei } from "@/lib/drive/api";
import { aufgabeFuer, dateiName, endung, ordnerIdAus, sichererName, tagName, zielFuer, zustandVon, type Kandidat } from "@/lib/drive/ziel";
import { raeumeAuf, spiegeleAlle, spiegeleEinen, type SpiegelDeps, type SpiegelZeile } from "@/lib/drive/spiegel";

/**
 * SPK-023: Folien in den Technik-Ordner. Kein Test spricht mit Google — jede
 * Antwort kommt aus einem nachgestellten `fetch` oder einem Drive im Speicher.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const KONTO_JSON = JSON.stringify({
  type: "service_account",
  project_id: "zztest",
  client_email: "fls27-portal-drive@zztest-projekt.iam.gserviceaccount.com",
  private_key: privateKey,
  token_uri: "https://boese.example.org/token",
});

function konto() {
  const s = dienstkontoAus(KONTO_JSON);
  assert.ok(s.ok);
  return s.konto;
}

const BASIS: Kandidat = {
  asset_id: "a1",
  asset_version: 1,
  profile_id: "p1",
  session_id: "s1",
  edition_id: "e1",
  storage_path: "e1/p1/presentation/x-deck.pptx",
  filename: "Deck.PPTX",
  mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  size_bytes: 10,
  first_name: "Anna",
  last_name: "Beispiel",
  session_title: "ZZTEST Talk",
  slot_id: "slot1",
  slot_start: "2027-04-16T07:30:00Z",
  stage_id: "st1",
  stage_name: "Main Stage",
  event_day_id: "d1",
  day_date: "2027-04-16",
  day_label: "Tag 1 · Freitag",
  timezone: "Europe/Berlin",
  folder_id: "ZZTESTordner0123456789",
  mirror_id: null,
  drive_file_id: null,
  mirror_asset_id: null,
  target_hash: null,
  mirror_status: null,
  error_key: null,
  error_detail: null,
  attempts: null,
  mirrored_at: null,
};

/** Was die Datenbank nach dem Speichern zurückgäbe: Kandidat plus Spiegelstand. */
function mitStand(k: Kandidat, z: SpiegelZeile | undefined): Kandidat {
  if (!z) return k;
  return {
    ...k,
    mirror_id: "m1",
    drive_file_id: z.drive_file_id,
    mirror_asset_id: z.asset_id,
    target_hash: z.target_hash,
    mirror_status: z.status,
    error_key: z.error_key,
    error_detail: z.error_detail,
    attempts: z.attempts,
    mirrored_at: z.mirrored_at,
  };
}

// === Dienstkonto ==============================================================

describe("Dienstkonto aus der Umgebung", () => {
  it("fehlt, wenn die Variable leer ist oder nur der Platzhalter von vercel env pull", () => {
    for (const roh of [undefined, null, "", "   ", "[SENSITIVE]", "sensitive"]) {
      assert.deepEqual(dienstkontoAus(roh), { ok: false, grund: "fehlt" }, String(roh));
    }
  });

  it("ist ungültig ohne JSON, mit falschem Typ, fremder Adresse oder kaputtem Schlüssel", () => {
    const o = JSON.parse(KONTO_JSON) as Record<string, string>;
    const faelle = [
      "{kein json",
      JSON.stringify({ ...o, type: "authorized_user" }),
      JSON.stringify({ ...o, client_email: "konrad@chef-treff.de" }),
      JSON.stringify({ ...o, private_key: "-----BEGIN PRIVATE KEY-----\nkaputt\n-----END PRIVATE KEY-----\n" }),
      JSON.stringify({ ...o, private_key: undefined }),
    ];
    for (const roh of faelle) assert.deepEqual(dienstkontoAus(roh), { ok: false, grund: "ungueltig" }, roh.slice(0, 40));
  });

  it("nimmt die Datei, auch mit maskierten Zeilenumbrüchen, und ignoriert token_uri", () => {
    const k = konto();
    assert.equal(k.clientEmail, "fls27-portal-drive@zztest-projekt.iam.gserviceaccount.com");
    const eineZeile = KONTO_JSON.replace(/\\n/g, "\\\\n");
    assert.ok(dienstkontoAus(eineZeile).ok, "Schlüssel mit „\\n“ als Text");
    assert.equal(Object.keys(k).sort().join(","), "clientEmail,privateKey", "token_uri kommt nicht mit");
  });

  it("signiert die Anmeldung für Googles Token-Adresse mit dem Drive-Bereich, eine Stunde gültig", () => {
    const jwt = anmeldung(konto(), 1_800_000_000);
    const [kopf, inhalt, signatur] = jwt.split(".");
    const pruefer = createVerify("RSA-SHA256");
    pruefer.update(`${kopf}.${inhalt}`);
    assert.ok(pruefer.verify(publicKey, Buffer.from(signatur, "base64url")), "Signatur passt zum öffentlichen Schlüssel");
    const claims = JSON.parse(Buffer.from(inhalt, "base64url").toString()) as Record<string, unknown>;
    assert.equal(claims.aud, TOKEN_ADRESSE);
    assert.equal(claims.scope, DRIVE_BEREICH);
    assert.equal(claims.iss, "fls27-portal-drive@zztest-projekt.iam.gserviceaccount.com");
    assert.equal((claims.exp as number) - (claims.iat as number), 3600);
  });
});

// === Benennung und Aufgabe ====================================================

describe("Wohin eine Präsentation gehört", () => {
  it("heißt Beginn_Speaker mit der Endung der Datei — der Beginn in der Zeitzone des Events", () => {
    assert.equal(dateiName(BASIS), "0930_Anna Beispiel.pptx");
    assert.equal(dateiName({ ...BASIS, filename: "folien", mime: "application/pdf" }), "0930_Anna Beispiel.pdf");
    assert.equal(dateiName({ ...BASIS, first_name: null, last_name: null }), "0930_Speaker.pptx");
    assert.equal(endung("ohne", null), "");
  });

  it("macht Namen für Drive und jedes Betriebssystem tauglich", () => {
    assert.equal(sichererName("Dr. Müller/Schmidt: \u0007 Bühne?  A"), "Dr. Müller-Schmidt- Bühne- A");
    assert.equal(sichererName("   "), "—");
    assert.equal(sichererName("x".repeat(150)).length, 100);
  });

  it("legt Bühnen- und Tagesordner mit Datum vorn an", () => {
    const z = zielFuer(BASIS);
    assert.ok(z);
    assert.deepEqual(z.buehne, { kennung: "buehne:st1", name: "Main Stage" });
    assert.deepEqual(z.tag, { kennung: "tag:st1:d1", name: "2027-04-16 · Tag 1 · Freitag" });
    assert.equal(tagName("2027-04-17", null), "2027-04-17");
    assert.equal(z.eigenschaften.fls27, "folie:p1:s1");
    assert.equal(z.eigenschaften.slot, "slot1");
  });

  it("ändert das Ziel, wenn der Slot wandert — nicht, wenn nur die Bühne umbenannt wird", () => {
    const z = zielFuer(BASIS)!;
    assert.match(z.hash, /^[0-9a-f]{64}$/);
    assert.notEqual(zielFuer({ ...BASIS, slot_start: "2027-04-16T08:00:00Z" })!.hash, z.hash);
    assert.notEqual(zielFuer({ ...BASIS, event_day_id: "d2", day_date: "2027-04-17" })!.hash, z.hash);
    assert.notEqual(zielFuer({ ...BASIS, last_name: "Neu" })!.hash, z.hash);
    assert.equal(zielFuer({ ...BASIS, stage_name: "Hauptbühne" })!.hash, z.hash);
  });

  it("entscheidet, was zu tun ist", () => {
    const z = zielFuer(BASIS);
    const da = { ...BASIS, drive_file_id: "ZZTESTdatei0123", mirror_asset_id: "a1", target_hash: z!.hash, mirror_status: "ok" as const };
    assert.equal(aufgabeFuer({ ...BASIS, folder_id: null }, zielFuer({ ...BASIS, folder_id: null })), "ohne_ordner");
    assert.equal(aufgabeFuer({ ...BASIS, slot_id: null }, zielFuer({ ...BASIS, slot_id: null })), "ohne_slot");
    assert.equal(aufgabeFuer(BASIS, z), "anlegen");
    assert.equal(aufgabeFuer(da, z), "aktuell");
    assert.equal(aufgabeFuer({ ...da, asset_id: "a2" }, z), "ersetzen");
    assert.equal(aufgabeFuer({ ...da, mirror_status: "error" }, z), "ersetzen");
    assert.equal(aufgabeFuer({ ...da, target_hash: "0".repeat(64) }, z), "verschieben");
    assert.equal(zustandVon({ ...BASIS, mirror_status: "error", error_key: "drive_quota" }), "fehler");
    assert.equal(zustandVon(BASIS), "neu");
    assert.equal(zustandVon({ ...da, asset_id: "a2" }), "offen");
  });

  it("liest die Ordner-ID aus einer eingefügten Drive-Adresse", () => {
    assert.equal(ordnerIdAus("https://drive.google.com/drive/folders/1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE?usp=sharing"), "1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE");
    assert.equal(ordnerIdAus("https://drive.google.com/drive/u/0/folders/1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE"), "1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE");
    assert.equal(ordnerIdAus("https://drive.google.com/open?id=1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE"), "1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE");
    assert.equal(ordnerIdAus("  1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE "), "1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE");
  });
});

// === Drive-API mit nachgestelltem fetch ======================================

type Aufruf = { url: string; init: RequestInit };

function nachgestellt(antwort: (url: string, init: RequestInit) => Response) {
  const aufrufe: Aufruf[] = [];
  const holen = (async (eingabe: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(eingabe);
    aufrufe.push({ url, init });
    if (url === TOKEN_ADRESSE) return Response.json({ access_token: "ZZTEST-zugang", expires_in: 3600 });
    return antwort(url, init);
  }) as typeof fetch;
  return { holen, aufrufe };
}

function googleFehler(status: number, reason: string, status2 = "PERMISSION_DENIED") {
  return Response.json({ error: { code: status, message: `ZZTEST ${reason}`, status: status2, errors: [{ reason }] } }, { status });
}

describe("Drive-API", () => {
  it("meldet sich einmal an, nutzt den Zugang weiter und fragt immer mit supportsAllDrives", async () => {
    const { holen, aufrufe } = nachgestellt(() => Response.json({ files: [] }));
    const drive = driveApi(konto(), { fetch: holen });
    await drive.finden("ZZTESTeltern", "buehne:st1", true);
    await drive.finden("ZZTESTeltern", "tag:st1:d1", true);
    const anmeldungen = aufrufe.filter((a) => a.url === TOKEN_ADRESSE);
    assert.equal(anmeldungen.length, 1);
    assert.match(String(anmeldungen[0].init.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
    for (const a of aufrufe.filter((x) => x.url !== TOKEN_ADRESSE)) {
      assert.ok(new URL(a.url).searchParams.get("supportsAllDrives") === "true", a.url);
      assert.equal((a.init.headers as Record<string, string>).authorization, "Bearer ZZTEST-zugang");
    }
    assert.ok(!JSON.stringify(aufrufe).includes("PRIVATE KEY"), "der private Schlüssel verlässt den Server nie");
  });

  it("sucht nur unter dem Elternordner nach unserer Kennung und nur nicht gelöschte Ordner", async () => {
    const { holen, aufrufe } = nachgestellt(() => Response.json({ files: [{ id: "ZZTESTbuehne01", name: "Main Stage" }] }));
    const d = await driveApi(konto(), { fetch: holen }).finden("ZZTESTeltern", "buehne:st1", true);
    assert.equal(d?.id, "ZZTESTbuehne01");
    const q = new URL(aufrufe[1].url).searchParams.get("q") ?? "";
    assert.ok(q.includes("'ZZTESTeltern' in parents"));
    assert.ok(q.includes("appProperties has { key='fls27' and value='buehne:st1' }"));
    assert.ok(q.includes("trashed = false"));
    assert.ok(q.includes(`mimeType = '${ORDNER_TYP}'`));
    assert.equal(suchWert("a'b\\c"), "'a\\'b\\\\c'");
  });

  it("lädt in zwei Schritten hoch: Metadaten mit Länge, dann der Inhalt an die Sitzungsadresse", async () => {
    const { holen, aufrufe } = nachgestellt((url, init) => {
      if (url.includes("/upload/drive/v3/files") && init.method === "POST") {
        return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/sitzung-1" } });
      }
      if (url === "https://www.googleapis.com/upload/sitzung-1") return Response.json({ id: "ZZTESTdatei01", name: "0930_Anna Beispiel.pptx" });
      return new Response("unerwartet", { status: 500 });
    });
    const inhalt = new TextEncoder().encode("ZZTEST Folien");
    const d = await driveApi(konto(), { fetch: holen }).hochladen("ZZTESTtag01", {
      name: "0930_Anna Beispiel.pptx",
      mime: "application/pdf",
      inhalt,
      eigenschaften: { fls27: "folie:p1:s1" },
    });
    assert.equal(d.id, "ZZTESTdatei01");
    const start = aufrufe.find((a) => a.init.method === "POST" && a.url.includes("uploadType=resumable"));
    assert.ok(start);
    const kopf = start.init.headers as Record<string, string>;
    assert.equal(kopf["x-upload-content-length"], String(inhalt.byteLength));
    assert.equal(kopf["x-upload-content-type"], "application/pdf");
    assert.deepEqual(JSON.parse(String(start.init.body)), {
      name: "0930_Anna Beispiel.pptx",
      parents: ["ZZTESTtag01"],
      appProperties: { fls27: "folie:p1:s1" },
    });
    const put = aufrufe.find((a) => a.init.method === "PUT");
    assert.equal(put?.url, "https://www.googleapis.com/upload/sitzung-1");
  });

  it("ersetzt den Inhalt derselben Datei und zieht sie dabei in den neuen Tagesordner", async () => {
    const { holen, aufrufe } = nachgestellt((url, init) => {
      if (init.method === "PATCH") return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/sitzung-2" } });
      return Response.json({ id: "ZZTESTdatei01", name: "1000_Anna Beispiel.pptx" });
    });
    await driveApi(konto(), { fetch: holen }).ersetzen(
      "ZZTESTdatei01",
      { name: "1000_Anna Beispiel.pptx", mime: "application/pdf", inhalt: new Uint8Array([1]), eigenschaften: {} },
      { hinzu: "ZZTESTtag02", weg: ["ZZTESTtag01"] },
    );
    const patch = new URL(aufrufe.find((a) => a.init.method === "PATCH")!.url);
    assert.equal(patch.pathname, "/upload/drive/v3/files/ZZTESTdatei01");
    assert.equal(patch.searchParams.get("addParents"), "ZZTESTtag02");
    assert.equal(patch.searchParams.get("removeParents"), "ZZTESTtag01");
  });

  it("übersetzt Googles Antworten in Schlüssel für den Admin", () => {
    const k = (status: number, reason: string, s?: string) =>
      fehlerSchluessel(status, { error: { code: status, errors: [{ reason }], status: s } }, "hochladen");
    assert.equal(k(403, "storageQuotaExceeded"), "drive_quota");
    assert.equal(k(403, "insufficientFilePermissions"), "drive_permission");
    assert.equal(k(403, "accessNotConfigured"), "drive_api_off");
    assert.equal(k(403, "rateLimitExceeded"), "drive_rate");
    assert.equal(k(429, ""), "drive_rate");
    assert.equal(k(404, "notFound"), "drive_folder_missing");
    assert.equal(k(401, "authError"), "drive_auth");
    assert.equal(k(503, "backendError"), "drive_unavailable");
    assert.equal(fehlerSchluessel(400, { error: "invalid_grant" }, "anmelden"), "drive_auth");
  });

  it("wirft DriveFehler mit Schlüssel und Googles Meldung, ohne Netz mit drive_network", async () => {
    const { holen } = nachgestellt(() => googleFehler(403, "storageQuotaExceeded"));
    await assert.rejects(
      driveApi(konto(), { fetch: holen }).ordnerAnlegen("ZZTESTeltern", "Main Stage", "buehne:st1"),
      (e: unknown) => e instanceof DriveFehler && e.schluessel === "drive_quota" && e.detail === "ZZTEST storageQuotaExceeded",
    );
    const kaputt = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await assert.rejects(
      driveApi(konto(), { fetch: kaputt }).dateiLesen("ZZTESTdatei01"),
      (e: unknown) => e instanceof DriveFehler && e.schluessel === "drive_network",
    );
  });

  it("nimmt eine fehlende Datei als „nicht da“ und eine schon gelöschte als entfernt", async () => {
    const { holen } = nachgestellt((url, init) =>
      init.method === "PATCH" ? googleFehler(404, "notFound", "NOT_FOUND") : url.includes("papierkorb")
        ? Response.json({ id: "papierkorb", name: "x", trashed: true })
        : googleFehler(404, "notFound", "NOT_FOUND"),
    );
    const drive = driveApi(konto(), { fetch: holen });
    assert.equal(await drive.dateiLesen("ZZTESTweg0001"), null);
    assert.equal(await drive.dateiLesen("papierkorb"), null);
    await drive.loeschen("ZZTESTweg0001");
  });

  it("entfernt über den Papierkorb, nie mit DELETE — endgültig löschen darf in der Ablage nur ein Manager", async () => {
    const { holen, aufrufe } = nachgestellt(() => Response.json({ id: "ZZTESTdatei01" }));
    await driveApi(konto(), { fetch: holen }).loeschen("ZZTESTdatei01");
    const a = aufrufe.find((x) => x.url !== TOKEN_ADRESSE)!;
    assert.equal(a.init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(a.init.body)), { trashed: true });
    assert.ok(!aufrufe.some((x) => x.init.method === "DELETE"));
  });

  it("liest Rechte am Zielordner: geteilte Ablage, anlegen, verschieben, löschen", async () => {
    const { holen } = nachgestellt(() =>
      Response.json({
        id: "ZZTESTordner0123456789",
        name: "[DO NOT CHANGE] FLS27 - Presentations [Automations]",
        driveId: "0AZZTEST",
        capabilities: { canAddChildren: true, canDeleteChildren: false, canTrashChildren: false, canMoveChildrenWithinDrive: false },
      }),
    );
    const r = await driveApi(konto(), { fetch: holen }).ordnerRechte("ZZTESTordner0123456789");
    assert.deepEqual(r, {
      id: "ZZTESTordner0123456789",
      name: "[DO NOT CHANGE] FLS27 - Presentations [Automations]",
      geteilteAblage: true,
      anlegen: true,
      loeschen: false,
      verschieben: false,
    });
    // Inhaltsmanager: Papierkorb ja, endgültig löschen nein — das reicht.
    const { holen: holen2 } = nachgestellt(() =>
      Response.json({ id: "x", name: "x", driveId: "0AZZTEST", capabilities: { canTrashChildren: true, canDeleteChildren: false } }),
    );
    assert.equal((await driveApi(konto(), { fetch: holen2 }).ordnerRechte("x")).loeschen, true);
  });
});

// === Ablauf mit einem Drive im Speicher ======================================

type SpeicherDatei = DriveDatei & { inhalt?: string };

function speicherDrive() {
  const dateien = new Map<string, SpeicherDatei>();
  const aufrufe: string[] = [];
  let nr = 0;
  const neu = () => `ZZTESTid${String(++nr).padStart(6, "0")}`;
  let fehlerBeimHochladen: DriveFehler | null = null;
  const text = (b: Uint8Array) => new TextDecoder().decode(b);
  const api: DriveApi = {
    async ordnerRechte(id) {
      return { id, name: "Ziel", geteilteAblage: true, anlegen: true, loeschen: true, verschieben: true };
    },
    async finden(eltern, kennung, nurOrdner) {
      aufrufe.push(`finden ${kennung}`);
      return (
        [...dateien.values()].find(
          (d) => d.parents?.includes(eltern) && d.appProperties?.fls27 === kennung && (!nurOrdner || d.mimeType === ORDNER_TYP) && !d.trashed,
        ) ?? null
      );
    },
    async ordnerAnlegen(eltern, name, kennung) {
      aufrufe.push(`ordner ${name}`);
      const d: SpeicherDatei = { id: neu(), name, mimeType: ORDNER_TYP, parents: [eltern], appProperties: { fls27: kennung } };
      dateien.set(d.id, d);
      return d;
    },
    async umbenennen(id, name) {
      aufrufe.push(`umbenennen ${name}`);
      dateien.get(id)!.name = name;
    },
    async dateiLesen(id) {
      const d = dateien.get(id);
      return d && !d.trashed ? d : null;
    },
    async hochladen(eltern, datei) {
      if (fehlerBeimHochladen) throw fehlerBeimHochladen;
      aufrufe.push(`hochladen ${datei.name}`);
      const d: SpeicherDatei = { id: neu(), name: datei.name, mimeType: datei.mime, parents: [eltern], appProperties: datei.eigenschaften, inhalt: text(datei.inhalt) };
      dateien.set(d.id, d);
      return d;
    },
    async ersetzen(id, datei, umzug) {
      if (fehlerBeimHochladen) throw fehlerBeimHochladen;
      aufrufe.push(`ersetzen ${datei.name}`);
      const d = dateien.get(id)!;
      Object.assign(d, { name: datei.name, inhalt: text(datei.inhalt), appProperties: datei.eigenschaften });
      if (umzug?.hinzu) d.parents = [umzug.hinzu];
      return d;
    },
    async verschieben(id, name, eigenschaften, umzug) {
      aufrufe.push(`verschieben ${name}`);
      const d = dateien.get(id)!;
      Object.assign(d, { name, appProperties: eigenschaften });
      if (umzug.hinzu) d.parents = [umzug.hinzu];
      return d;
    },
    async loeschen(id) {
      aufrufe.push(`loeschen ${id}`);
      dateien.delete(id);
    },
  };
  return {
    api,
    dateien,
    aufrufe,
    scheitern(f: DriveFehler | null) {
      fehlerBeimHochladen = f;
    },
  };
}

function ablauf(drive: DriveApi) {
  const zeilen = new Map<string, SpiegelZeile>();
  const geladen: string[] = [];
  const entfernt: string[] = [];
  const deps: SpiegelDeps = {
    drive,
    async datei(pfad) {
      geladen.push(pfad);
      if (pfad.includes("fehlt")) throw new Error("Object not found");
      return new TextEncoder().encode(`Inhalt ${pfad}`);
    },
    async speichern(z) {
      zeilen.set(`${z.profile_id}:${z.session_id}`, z);
    },
    async zeileEntfernen(id) {
      entfernt.push(id);
    },
    jetzt: () => new Date("2026-10-01T18:00:00Z"),
  };
  return { deps, zeilen, geladen, entfernt };
}

describe("Spiegelung", () => {
  it("legt Bühne, Tag und Datei an und vermerkt Drive-ID und Ziel", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    const e = await spiegeleEinen(deps, BASIS);
    assert.ok(e.ok);
    assert.deepEqual(d.aufrufe.filter((a) => !a.startsWith("finden")), [
      "ordner Main Stage",
      "ordner 2027-04-16 · Tag 1 · Freitag",
      "hochladen 0930_Anna Beispiel.pptx",
    ]);
    const z = zeilen.get("p1:s1")!;
    assert.equal(z.status, "ok");
    assert.equal(z.asset_id, "a1");
    assert.equal(z.target_hash, zielFuer(BASIS)!.hash);
    assert.equal(d.dateien.get(z.drive_file_id!)?.inhalt, `Inhalt ${BASIS.storage_path}`);
  });

  it("fasst eine aktuelle Kopie nicht an", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    const vorher = d.aufrufe.length;
    const e = await spiegeleEinen(deps, mitStand(BASIS, zeilen.get("p1:s1")));
    assert.deepEqual([e.aufgabe, d.aufrufe.length], ["aktuell", vorher]);
  });

  it("ersetzt bei einer neuen Fassung den Inhalt derselben Datei — keine zweite Datei", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    const id = zeilen.get("p1:s1")!.drive_file_id;
    const v2 = { ...mitStand(BASIS, zeilen.get("p1:s1")), asset_id: "a2", asset_version: 2, storage_path: "e1/p1/presentation/v2.pdf", filename: "v2.pdf", mime: "application/pdf" };
    const e = await spiegeleEinen(deps, v2);
    assert.equal(e.aufgabe, "ersetzen");
    assert.equal(zeilen.get("p1:s1")!.drive_file_id, id, "dieselbe Drive-Datei");
    assert.equal(d.dateien.get(id!)?.name, "0930_Anna Beispiel.pdf");
    assert.equal(d.dateien.get(id!)?.inhalt, "Inhalt e1/p1/presentation/v2.pdf");
    assert.equal([...d.dateien.values()].filter((x) => x.mimeType !== ORDNER_TYP).length, 1);
  });

  it("verschiebt bei einem neuen Slot nur Name und Ort, ohne die Datei neu zu laden", async () => {
    const d = speicherDrive();
    const { deps, zeilen, geladen } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    const id = zeilen.get("p1:s1")!.drive_file_id!;
    const verschoben = { ...mitStand(BASIS, zeilen.get("p1:s1")), event_day_id: "d2", day_date: "2027-04-17", day_label: "Tag 2 · Samstag", slot_start: "2027-04-17T08:00:00Z" };
    const e = await spiegeleEinen(deps, verschoben);
    assert.equal(e.aufgabe, "verschieben");
    assert.equal(geladen.length, 1, "nur der erste Lauf lädt die Datei");
    const tag2 = [...d.dateien.values()].find((x) => x.name === "2027-04-17 · Tag 2 · Samstag")!;
    assert.deepEqual(d.dateien.get(id)?.parents, [tag2.id]);
    assert.equal(d.dateien.get(id)?.name, "1000_Anna Beispiel.pptx");
    assert.equal(zeilen.get("p1:s1")!.target_hash, zielFuer(verschoben)!.hash);
  });

  it("benennt den Bühnenordner um, wenn die Bühne einen neuen Namen hat", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    await spiegeleEinen(deps, { ...mitStand(BASIS, zeilen.get("p1:s1")), stage_name: "Hauptbühne", asset_id: "a2" });
    assert.ok(d.aufrufe.includes("umbenennen Hauptbühne"));
    assert.equal([...d.dateien.values()].filter((x) => x.mimeType === ORDNER_TYP).length, 2, "kein zweiter Bühnenordner");
  });

  it("findet die Kopie über ihre Kennung wieder, wenn die Datenbankzeile fehlt", async () => {
    const d = speicherDrive();
    const { deps } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    const e = await spiegeleEinen(deps, { ...BASIS, asset_id: "a2" });
    assert.equal(e.aufgabe, "anlegen");
    assert.equal([...d.dateien.values()].filter((x) => x.mimeType !== ORDNER_TYP).length, 1, "ersetzt statt verdoppelt");
  });

  it("legt eine neue Kopie an, wenn jemand die alte in Drive gelöscht hat", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    d.dateien.delete(zeilen.get("p1:s1")!.drive_file_id!);
    await spiegeleEinen(deps, { ...mitStand(BASIS, zeilen.get("p1:s1")), asset_id: "a2" });
    assert.ok(zeilen.get("p1:s1")!.drive_file_id);
    assert.ok(d.dateien.has(zeilen.get("p1:s1")!.drive_file_id!));
  });

  it("vermerkt Fehler mit Schlüssel und zählt die Versuche — die alte Kopie bleibt verzeichnet", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    await spiegeleEinen(deps, BASIS);
    const id = zeilen.get("p1:s1")!.drive_file_id;
    d.scheitern(new DriveFehler(403, "drive_permission", "ersetzen", "ZZTEST insufficientFilePermissions"));
    const e = await spiegeleEinen(deps, { ...mitStand(BASIS, zeilen.get("p1:s1")), asset_id: "a2" });
    assert.ok(!e.ok);
    const z = zeilen.get("p1:s1")!;
    assert.deepEqual([z.status, z.error_key, z.attempts, z.drive_file_id], ["error", "drive_permission", 1, id]);
    d.scheitern(null);
    const wieder = await spiegeleEinen(deps, mitStand({ ...BASIS, asset_id: "a2" }, z));
    assert.ok(wieder.ok);
    assert.deepEqual([zeilen.get("p1:s1")!.status, zeilen.get("p1:s1")!.attempts], ["ok", 0]);
  });

  it("meldet eine fehlende Datei im Speicher als storage_missing", async () => {
    const { deps, zeilen } = ablauf(speicherDrive().api);
    const e = await spiegeleEinen(deps, { ...BASIS, storage_path: "e1/p1/presentation/fehlt.pdf" });
    assert.ok(!e.ok && e.fehler === "storage_missing");
    assert.equal(zeilen.get("p1:s1")!.error_key, "storage_missing");
  });

  it("tut ohne Slot und ohne Zielordner nichts", async () => {
    const d = speicherDrive();
    const { deps, zeilen } = ablauf(d.api);
    assert.equal((await spiegeleEinen(deps, { ...BASIS, slot_id: null })).aufgabe, "ohne_slot");
    assert.equal((await spiegeleEinen(deps, { ...BASIS, folder_id: null })).aufgabe, "ohne_ordner");
    assert.equal(d.aufrufe.length + zeilen.size, 0);
  });

  it("hält beim Nachholen Mengen- und Zeitgrenze ein und zählt den Rest als offen", async () => {
    const d = speicherDrive();
    const { deps } = ablauf(d.api);
    const liste = [1, 2, 3, 4].map((i) => ({ ...BASIS, profile_id: `p${i}`, asset_id: `a${i}`, first_name: `Nr${i}` }));
    const z = await spiegeleAlle(deps, [...liste, { ...BASIS, profile_id: "p9", slot_id: null }], { max: 2, bisMs: Infinity });
    assert.deepEqual([z.gespiegelt, z.offen, z.ohneSlot], [2, 2, 1]);
    let uhr = 0;
    const z2 = await spiegeleAlle(deps, liste, { max: 10, bisMs: 1, jetztMs: () => uhr++ });
    assert.deepEqual([z2.gespiegelt + z2.fehler, z2.offen], [1, 3]);
  });

  it("räumt verwaiste Kopien ab: erst Drive, dann die Zeile; scheitert Drive, bleibt die Zeile", async () => {
    const d = speicherDrive();
    const { deps, entfernt } = ablauf(d.api);
    const gemerkt: string[] = [];
    const tief = { ...deps, async fehlerMerken(id: string, f: string) { gemerkt.push(`${id}:${f}`); } };
    const datei = await d.api.hochladen("ZZTESTtag", { name: "x.pdf", mime: "application/pdf", inhalt: new Uint8Array([1]), eigenschaften: {} });
    const r = await raeumeAuf(tief, [{ mirror_id: "m1", drive_file_id: datei.id }, { mirror_id: "m2", drive_file_id: null }]);
    assert.deepEqual([r.entfernt, r.fehler, entfernt, d.dateien.has(datei.id)], [2, 0, ["m1", "m2"], false]);

    const stur: DriveApi = { ...d.api, async loeschen() { throw new DriveFehler(403, "drive_permission", "loeschen", "ZZTEST"); } };
    const r2 = await raeumeAuf({ ...tief, drive: stur }, [{ mirror_id: "m3", drive_file_id: "ZZTESTstur01" }]);
    assert.deepEqual([r2.entfernt, r2.fehler, gemerkt], [0, 1, ["m3:drive_permission"]]);
    assert.ok(!entfernt.includes("m3"));
  });
});

// === Verdrahtung (Quelltext) =================================================

describe("Verdrahtung", () => {
  it("liest den Schlüssel nur in lib/drive/server.ts, und das Modul ist server-only", () => {
    const server = lies("lib/drive/server.ts");
    assert.ok(server.startsWith('import "server-only";'));
    assert.ok(server.includes("process.env[DIENSTKONTO_VARIABLE]"));
    for (const datei of ["lib/drive/konto.ts", "lib/drive/api.ts", "lib/drive/ziel.ts", "lib/drive/spiegel.ts", "lib/drive/anzeige.ts"]) {
      assert.ok(!lies(datei).includes("process.env"), `${datei} liest keine Umgebung`);
    }
    assert.equal(DIENSTKONTO_VARIABLE, "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
    assert.match(lies(".env.local.example"), /^GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=$/m);
  });

  it("spiegelt nach dem Upload erst, wenn die RPC das Recht geprüft hat — auf allen drei Wegen", () => {
    const wege: [string, string][] = [
      ["app/(speaker)/speaker/session/actions.ts", 'supabase.rpc("register_speaker_asset"'],
      ["app/(speaker-leads)/speaker-leads/actions.ts", "registrierePraesentation(supabase, input)"],
      ["app/(admin)/admin/actions.ts", "registrierePraesentation(supabase, input)"],
    ];
    for (const [datei, rpc] of wege) {
      const src = lies(datei);
      const aufruf = src.indexOf(rpc);
      const fehler = src.indexOf("if (error) return fail(error", aufruf);
      const spiegel = src.indexOf("after(() => spiegelePraesentation(", aufruf);
      assert.ok(aufruf > 0 && fehler > aufruf && spiegel > fehler, `${datei}: erst RPC, dann Fehlerprüfung, dann Spiegelung`);
    }
    const loeschen = lies("app/(speaker)/speaker/session/actions.ts");
    const rpc = loeschen.indexOf('supabase.rpc("delete_speaker_asset"');
    assert.ok(loeschen.indexOf("after(() => spiegelNachLoeschen(assetId))", rpc) > loeschen.indexOf("if (error) return fail(error)", rpc));
  });

  it("öffnet die Admin-Aktionen und die Seite nur für den Abschnitt tech", () => {
    const aktionen = lies("app/(admin)/admin/technik/drive-actions.ts");
    const teile = aktionen.split("export async function ").slice(1);
    assert.equal(teile.length, 3);
    for (const teil of teile) {
      const erstesAwait = teil.indexOf("await ");
      assert.ok(teil.slice(erstesAwait).startsWith('await requireAdminSection("tech"'), teil.slice(0, 40));
    }
    const seite = lies("app/(admin)/admin/technik/page.tsx");
    assert.ok(seite.indexOf('requireAdminSection("tech"') < seite.indexOf("driveUebersicht("));
  });

  it("lädt in der Client-Karte nichts aus dem Server-Teil", () => {
    const karte = lies("app/(admin)/admin/technik/DriveSpiegel.tsx");
    const importe = karte.split("\n").filter((z) => z.startsWith("import "));
    for (const z of importe.filter((x) => x.includes("@/lib/drive/"))) {
      assert.ok(z.startsWith("import type ") || z.includes('"@/lib/drive/anzeige"'), z);
    }
    assert.ok(!karte.includes("lib/drive/server"));
  });

  it("räumt im Cron auf und gibt Upload-Seiten und Admin 300 s", () => {
    assert.ok(lies("app/api/cron/mail/route.ts").includes("await driveAufraeumen()"));
    for (const seite of [
      "app/(speaker)/speaker/session/page.tsx",
      "app/(speaker-leads)/speaker-leads/praesentationen/page.tsx",
      "app/(admin)/admin/technik/praesentationen/page.tsx",
      "app/(admin)/admin/technik/page.tsx",
    ]) {
      assert.match(lies(seite), /^export const maxDuration = 300;$/m, seite);
    }
  });

  it("hat jeden Text der Karte und jeden Fehlerschlüssel in beiden Sprachen", () => {
    const karte = lies("app/(admin)/admin/technik/DriveSpiegel.tsx");
    const genutzt = new Set([...karte.matchAll(/\bt\.([A-Za-z]+)\b/g)].map((m) => m[1]));
    for (const m of karte.matchAll(/:\s*"((?:state|count)[A-Z][A-Za-z]+)"/g)) genutzt.add(m[1]);
    const fehler = [
      "drive_auth", "drive_api_off", "drive_folder_missing", "drive_quota", "drive_permission", "drive_rate",
      "drive_unavailable", "drive_network", "drive_error", "storage_missing",
      "drive_account_missing", "drive_account_invalid", "drive_no_folder", "drive_run_failed",
    ];
    for (const sprache of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { admin: { techDrive: Record<string, string> }; rpc: Record<string, string> };
      for (const k of genutzt) assert.ok(d.admin.techDrive[k], `${sprache}: admin.techDrive.${k}`);
      for (const f of fehler) assert.ok(d.admin.techDrive[`err_${f}`], `${sprache}: err_${f}`);
      assert.ok(d.rpc.invalid_folder_id, `${sprache}: rpc.invalid_folder_id`);
    }
  });
});
