import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { baueZeilen, istPdf, type AssetZeile, type BoardZeile } from "@/components/speaker/praesentationen";
import { holeFassung, type HolenAbhaengigkeiten } from "@/components/speaker/praesentation-holen";

/**
 * LEAD-060 (Feedbackrunde Konrad und Paulina 05.10.2026): in der Präsentationsliste (Stage Leads unter `/speaker-leads/praesentationen`, Admin unter
 * `/admin/technik/praesentationen` — dieselbe Liste) lässt sich jede Präsentation **ansehen** (PDF) und **herunterladen**, auch jede **frühere Fassung**. Der Link wird beim
 * Klick mit der Sitzung signiert; wer lesen darf, entscheidet die Pfadregel `speaker_asset_path_allowed` (DB-Test `supabase/tests/lead060_praesentationen_lesen.sql`, mit
 * Rollenwechsel). **Keine Datenbankänderung.** Dieser Test führt die Zusammensetzung und den Ablauf des Öffnens aus und hält fest, was die Oberfläche daraus macht.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LISTE = "components/speaker/PraesentationenListe.tsx";

const slot = (z: Partial<BoardZeile>): BoardZeile => ({
  slot_id: "sl", session_id: "se", stage_id: "st", stage_name: "Bühne", start_at: "2027-04-16T13:00:00Z",
  end_at: "2027-04-16T13:30:00Z", title_de: "Talk", title_en: "Talk EN", can_edit: true, speakers: [], ...z,
});
const sprecher = (id: string, role = "speaker") => ({ person_id: id, role, first_name: id, last_name: "ZZ" });
const asset = (z: Partial<AssetZeile>): AssetZeile => ({
  id: "a", profile_id: "pr1", session_id: "se", kind: "presentation", storage_path: "ed/pr1/presentation/folien.pdf", filename: "folien.pdf",
  mime: "application/pdf", version: 1, is_current: true, late: false, tech_check_status: "pending", created_at: "2027-04-01T10:00:00Z", ...z,
});

describe("LEAD-060: Fassungen je Speaker (ausgeführt)", () => {
  const zeilen = baueZeilen(
    [slot({ speakers: [sprecher("p1"), sprecher("p2"), sprecher("p3")] })],
    [{ id: "pr1", person_id: "p1" }, { id: "pr2", person_id: "p2" }],
    [
      asset({ id: "v1", version: 1, is_current: false, storage_path: "ed/pr1/presentation/a.pdf", filename: "a.pdf", late: true, created_at: "2027-04-01T10:00:00Z" }),
      asset({ id: "v2", version: 2, is_current: false, storage_path: "ed/pr1/presentation/b.key", filename: "b.key", mime: "application/x-iwork-keynote-sffkey", created_at: "2027-04-02T10:00:00Z" }),
      asset({ id: "v3", version: 3, storage_path: "ed/pr1/presentation/c.pdf", filename: "c.pdf", created_at: "2027-04-03T10:00:00Z" }),
      // gehört nicht dazu: andere Session, andere Art, anderes Profil mit nur einer Fassung
      asset({ id: "x1", session_id: "andere", version: 9, is_current: false }),
      asset({ id: "x2", kind: "photo", version: 5, is_current: false }),
      asset({ id: "x3", kind: "receipt", version: 4, is_current: false }),
      asset({ id: "w1", profile_id: "pr2", version: 1, storage_path: "ed/pr2/presentation/solo.pdf", filename: "solo.pdf" }),
    ],
    "de",
  );
  const [p1, p2, p3] = zeilen[0].speakers;

  it("die aktuelle Fassung trägt Pfad, Dateityp und Kennung — daraus signiert der Browser", () => {
    assert.equal(p1.datei?.id, "v3");
    assert.equal(p1.datei?.version, 3);
    assert.equal(p1.datei?.storage_path, "ed/pr1/presentation/c.pdf");
    assert.equal(p1.datei?.mime, "application/pdf");
    assert.equal(p1.datei?.hochgeladen, "2027-04-03T10:00:00Z");
    assert.equal(p1.datei?.status, "pending");
  });

  it("die früheren Fassungen derselben Session stehen darunter — neueste zuerst, ohne die aktuelle, jede mit eigenem Pfad", () => {
    assert.deepEqual(p1.datei?.fruehere.map((f) => [f.id, f.version]), [["v2", 2], ["v1", 1]]);
    assert.equal(p1.datei?.fruehere[0].storage_path, "ed/pr1/presentation/b.key");
    assert.equal(p1.datei?.fruehere[0].mime, "application/x-iwork-keynote-sffkey");
    assert.equal(p1.datei?.fruehere[1].filename, "a.pdf");
    assert.equal(p1.datei?.fruehere[1].late, true, "„verspätet“ bleibt an der Fassung");
  });

  it("nichts Fremdes: keine Fassung einer anderen Session, keine Foto- oder Beleg-Datei (eine Quittung gehört nie in diese Liste)", () => {
    const ids = [p1.datei?.id, ...(p1.datei?.fruehere.map((f) => f.id) ?? [])];
    assert.deepEqual(ids, ["v3", "v2", "v1"]);
    for (const fremd of ["x1", "x2", "x3"]) assert.ok(!ids.includes(fremd), fremd);
  });

  it("ein Speaker mit nur einer Fassung hat keine früheren; ohne betreutes Profil gibt es keine Datei", () => {
    assert.equal(p2.datei?.id, "w1");
    assert.deepEqual(p2.datei?.fruehere, []);
    assert.equal(p3.profile_id, null);
    assert.equal(p3.datei, null);
  });
});

describe("LEAD-060: „Ansehen“ nur für PDF (ausgeführt)", () => {
  it("maßgeblich ist der Dateityp, hilfsweise die Endung", () => {
    assert.equal(istPdf({ mime: "application/pdf", filename: "x" }), true);
    assert.equal(istPdf({ mime: null, filename: "Folien.PDF" }), true);
    assert.equal(istPdf({ mime: "", filename: "folien.pdf" }), true);
    assert.equal(istPdf({ mime: null, filename: "folien.pptx" }), false);
    assert.equal(istPdf({ mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename: "folien.pptx" }), false);
    assert.equal(istPdf({ mime: "application/x-iwork-keynote-sffkey", filename: "folien.key" }), false);
    // ein gesetzter Typ gewinnt gegen die Endung
    assert.equal(istPdf({ mime: "application/vnd.ms-powerpoint", filename: "folien.pdf" }), false);
  });
});

describe("LEAD-060: der Ablauf beim Klick (ausgeführt, mit Attrappen)", () => {
  function attrappe(opts: { url?: string | null; wirft?: boolean } = {}) {
    const log: string[] = [];
    const d: HolenAbhaengigkeiten = {
      signieren: async (pfad, optionen) => {
        log.push(`signieren ${pfad} ${optionen ? `download=${optionen.download}` : "ansehen"}`);
        if (opts.wirft) throw new Error("kein Netz");
        return { url: opts.url === undefined ? "https://x.test/signed" : opts.url };
      },
      oeffnen: (url) => void log.push(`oeffnen ${url}`),
      herunterladen: (url, name) => void log.push(`laden ${url} ${name}`),
    };
    return { d, log };
  }
  const datei = { storage_path: "ed/pr1/presentation/c.pdf", filename: "c.pdf" };

  it("Ansehen: signiert ohne Dateinamen (die Adresse zeigt die Datei, sie lädt sie nicht als Anhang) und öffnet sie im neuen Fenster", async () => {
    const { d, log } = attrappe();
    assert.equal(await holeFassung("ansehen", datei, d), "ok");
    assert.deepEqual(log, ["signieren ed/pr1/presentation/c.pdf ansehen", "oeffnen https://x.test/signed"]);
  });

  it("Ansehen: ohne Link (kein Recht, Datei weg, kein Netz) bleibt es beim Fehler — es öffnet nichts", async () => {
    for (const opts of [{ url: null }, { wirft: true }]) {
      const { d, log } = attrappe(opts);
      assert.equal(await holeFassung("ansehen", datei, d), "fehler");
      assert.ok(!log.some((z) => z.startsWith("oeffnen ") || z.startsWith("laden ")), JSON.stringify(opts));
    }
  });

  it("Herunterladen: die Adresse trägt den Dateinamen (Anhang), ein Anker löst den Download aus — nichts wird geöffnet", async () => {
    const { d, log } = attrappe();
    assert.equal(await holeFassung("laden", datei, d), "ok");
    assert.deepEqual(log, ["signieren ed/pr1/presentation/c.pdf download=c.pdf", "laden https://x.test/signed c.pdf"]);
  });

  it("Herunterladen: ohne Link kein Download", async () => {
    for (const opts of [{ url: null }, { wirft: true }]) {
      const { d, log } = attrappe(opts);
      assert.equal(await holeFassung("laden", datei, d), "fehler");
      assert.ok(!log.some((z) => z.startsWith("laden ") || z.startsWith("oeffnen ")), JSON.stringify(opts));
    }
  });
});

describe("LEAD-060: die Liste (Stage Lead und Admin teilen sie)", () => {
  it("der Klick geht über `holeFassung`: signiert mit der Sitzung im Bucket `speaker-assets` (60 s), Ansehen im neuen Fenster mit `noopener` (QS-034), Anker für den Download", () => {
    const q = quelle(LISTE);
    assert.match(q, /import \{ holeFassung, type HolenModus \} from "\.\/praesentation-holen";/);
    assert.match(q, /supabase\.storage\.from\(SPEAKER_BUCKET\)\.createSignedUrl\(pfad, 60, optionen\)/);
    assert.match(q, /oeffnen: \(url\) => \{\s*window\.open\(url, "_blank", "noopener"\);\s*\},/);
    assert.match(q, /a\.href = url;\s*a\.download = dateiname;/);
    assert.doesNotMatch(q, /createSupabaseAdminClient|service_role/, "der Browser signiert mit der Sitzung des Nutzers");
  });

  it("jede Zeile mit Datei zeigt „Herunterladen“, „Ansehen“ nur bei einem PDF; je Aktion ein Name mit dem Dateinamen (Vorlesesoftware)", () => {
    const q = quelle(LISTE);
    assert.match(q, /\{istPdf\(f\) && \(\s*<Button size="sm" variant="ghost" aria-label=\{t\.viewFile\.replace\("\{file\}", f\.filename\)\} onClick=\{\(\) => void holen\(key, f, "ansehen"\)\}>/);
    assert.match(q, /<Button size="sm" variant="ghost" aria-label=\{t\.downloadFile\.replace\("\{file\}", f\.filename\)\} onClick=\{\(\) => void holen\(key, f, "laden"\)\}>/);
    assert.match(q, /\{aktionen\(key, s\.datei\)\}/);
  });

  it("frühere Fassungen: aufklappbar, nur wenn es welche gibt, jede mit eigenen Aktionen", () => {
    const q = quelle(LISTE);
    assert.match(q, /\{s\.datei\.fruehere\.length > 0 && \(\s*<details>/);
    assert.match(q, /t\.earlier\.replace\("\{n\}", String\(s\.datei\.fruehere\.length\)\)/);
    assert.match(q, /s\.datei\.fruehere\.map\(\(f\) => \(\s*<li key=\{f\.id\}/);
    assert.match(q, /\{aktionen\(key, f\)\}/);
  });

  it("Fehler stehen an der Zeile (`role=\"alert\"`), nicht als Toast — auch beim Öffnen", () => {
    const q = quelle(LISTE);
    assert.match(q, /if \(ergebnis === "fehler"\) setFehler\(\(e\) => \(\{ \.\.\.e, \[key\]: t\.openFailed \}\)\);/);
    assert.doesNotMatch(q, /toast\("error"/);
    assert.match(q, /role="alert"/);
  });

  it("Admin-Weg: Stage-Lead-Seite und Admin-Seite zeigen dieselbe Liste — jede Funktion gibt es auch unter `/admin/technik/praesentationen`", () => {
    assert.match(quelle("app/(speaker-leads)/speaker-leads/praesentationen/page.tsx"), /<PraesentationenListe\s/);
    assert.match(quelle("app/(admin)/admin/technik/praesentationen/page.tsx"), /<PraesentationenListe\s/);
  });

  it("gelesen wird weiter mit der Sitzung über `my_speaker_assets` (Pfad und Dateityp aller Fassungen), nie mit `service_role`", () => {
    const l = quelle("lib/speaker/praesentationen.ts");
    assert.match(l, /supabase\.rpc\("my_speaker_assets", \{ p_profile_id: null \}\)/);
    assert.doesNotMatch(l, /createSupabaseAdminClient/);
    assert.match(quelle("supabase/snapshot/functions/my_speaker_assets.sql"), /a\.storage_path, a\.filename, a\.mime, a\.size_bytes,\s*a\.version, a\.is_current/);
  });
});

describe("LEAD-060: Texte DE und EN", () => {
  type Woerterbuch = { presentationsList: Record<string, string> };
  const de = JSON.parse(quelle("lib/i18n/de.json")) as Woerterbuch;
  const en = JSON.parse(quelle("lib/i18n/en.json")) as Woerterbuch;

  it("alle neuen Schlüssel haben in beiden Sprachen einen Text", () => {
    for (const w of [de, en]) {
      for (const k of ["view", "download", "viewFile", "downloadFile", "earlier", "openFailed", "rules"]) {
        assert.ok(w.presentationsList[k]?.trim(), `presentationsList.${k}`);
      }
    }
  });

  it("die Platzhalter stehen in beiden Sprachen: {file} an den Namen der Knöpfe, {n} an den früheren Fassungen", () => {
    for (const w of [de, en]) {
      assert.ok(w.presentationsList.viewFile.includes("{file}"));
      assert.ok(w.presentationsList.downloadFile.includes("{file}"));
      assert.ok(w.presentationsList.earlier.includes("{n}"));
    }
  });

  it("die Regel unter der Liste sagt, dass frühere Fassungen bleiben und nur PDF sich ansehen lässt", () => {
    assert.match(de.presentationsList.rules, /die alte bleibt unter „Frühere Fassungen“ erhalten/);
    assert.match(de.presentationsList.rules, /Ansehen lässt sich ein PDF/);
    assert.match(en.presentationsList.rules, /stays available under “Earlier versions”/);
    assert.match(en.presentationsList.rules, /A PDF can be viewed/);
  });
});

describe("LEAD-060: DB-Test, Doku", () => {
  it("DB-Test: sieben Erwartungen mit `99_auswertung`, echter Rollenwechsel auf den Bucket, Stage Lead nur seine Bühne, Rechnung bleibt zu", () => {
    const q = quelle("supabase/tests/lead060_praesentationen_lesen.sql");
    assert.equal((q.match(/^  \('\d\d_[a-z0-9_]+', '\^[^']+'\)[,;]$/gm) ?? []).length, 7);
    assert.match(q, /'99_auswertung'/);
    assert.match(q, /execute 'set local role ' \|\| quote_ident\(p_rolle\);/);
    assert.match(q, /'01_l1_buehne_a'/);
    assert.match(q, /'06_rechnung'/);
    assert.match(q, /\nrollback;\n$/);
    assert.match(quelle("supabase/tests/README.md"), /\| `lead060_praesentationen_lesen\.sql` \| keine Migration \(LEAD-060\) \|/);
  });

  it("Testleitfaden: Stage-Lead-Seite und Admin-Technik nennen Ansehen, Herunterladen und die früheren Fassungen", () => {
    const zeilen = quelle("docs/team-testleitfaden.md").split("\n");
    const lead = zeilen.find((l) => l.startsWith("| `/praesentationen` Präsentationen |"));
    const admin = zeilen.find((l) => l.startsWith("| `/admin/technik` Technik |"));
    assert.ok(lead && admin, "Zeilen fehlen");
    assert.match(lead, /\*\*Jede Präsentation lässt sich ansehen und herunterladen \(LEAD-060\):\*\*/);
    assert.match(lead, /„Frühere Fassungen \(n\)“/);
    assert.match(lead, /„Die Datei ließ sich nicht öffnen …“/);
    assert.match(admin, /„Ansehen“ \(PDF\) und „Herunterladen“ und aufklappbar die früheren Fassungen \(LEAD-060/);
  });

  it("Backlog: LEAD-060 trägt die PR-Nummer, nennt Admin-Weg und DB-Test, und sagt, dass es keine Migration gibt", () => {
    const zeile = quelle("docs/feedback/speaker-leads.md")
      .split("\n")
      .find((l) => l.startsWith("| LEAD-060 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "LEAD-060 trägt keine PR-Nummer");
    assert.match(zeile, /keine Migration/);
    assert.match(zeile, /`\/admin\/technik\/praesentationen`/);
    assert.match(zeile, /lead060_praesentationen_lesen\.sql/);
  });

  it("Befund aus dem DB-Test: QS-080 hält fest, dass Stage Leads Belege (`receipt`) lesen können — Plan entscheidet über die Rechte", () => {
    const zeile = quelle("docs/feedback/querschnitt.md")
      .split("\n")
      .find((l) => l.startsWith("| QS-080 |"));
    assert.ok(zeile, "QS-080 fehlt");
    assert.match(zeile, /`speaker_asset_path_allowed`/);
    assert.match(zeile, /`receipt`/);
    assert.match(zeile, /Stage Lead/);
    assert.match(zeile, /`expense_claim`/);
    assert.match(zeile, /\| P1 \| offen — Plan/);
  });
});
