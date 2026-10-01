import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_initiativen_award");
const ohneKommentar = sql.replace(/--.*$/gm, "");
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function funktion(name: string): string {
  const start = ohneKommentar.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return ohneKommentar.slice(start, ohneKommentar.indexOf("end $$;", start));
}

const OEFFENTLICH = ["award_apply", "award_set_images", "award_vote_cast", "award_public_entries"];

describe("Initiativen-Award (ADM-024)", () => {
  it("öffentliche Wege sind Server-Funktionen: mit Sitzung 42501, EXECUTE nur service_role", () => {
    for (const fn of OEFFENTLICH) {
      assert.match(funktion(fn), /if auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'/, fn);
      assert.match(sql, new RegExp(`revoke execute on function ${fn}\\([^)]*\\) from public, anon, authenticated;`), fn);
      assert.match(sql, new RegExp(`grant execute on function ${fn}\\([^)]*\\) to service_role;`), fn);
    }
  });

  it("erwartete Zustände kommen als Wert, nicht als raise — kein Statement mit Quell-Hash im Fehlerprotokoll", () => {
    for (const fn of OEFFENTLICH) {
      const raises = funktion(fn).match(/raise exception/g) ?? [];
      assert.equal(raises.length, 1, `${fn}: nur das 42501 für Aufrufe mit Sitzung`);
    }
    assert.match(funktion("award_vote_cast"), /'duplicate'/);
    assert.match(funktion("award_apply"), /'rate_limited'/);
  });

  it("die Datenbank bekommt nur sha256(ip) und hasht mit Edition und Salz erneut", () => {
    assert.match(funktion("award_hash"), /p_ip_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.match(funktion("award_hash"), /award_secret/);
    const quelle = lies("lib/award/quelle.ts");
    assert.match(quelle, /createHash\("sha256"\)\.update\(ip\)\.digest\("hex"\)/);
    for (const route of ["app/api/award/stimme/route.ts", "app/api/award/bewerbung/route.ts", "app/award/page.tsx"]) {
      const text = lies(route);
      assert.doesNotMatch(text, /x-real-ip|x-forwarded-for/, `${route} liest die Adresse selbst`);
      assert.match(text, /quellHash\(/, route);
    }
  });

  it("Stimme ohne Personendaten: eine je Bewerbung und Hash, keine öffentlichen Zählerstände", () => {
    assert.match(sql, /unique \(application_id, voter_hash\)/);
    assert.doesNotMatch(funktion("award_public_entries"), /count\(\*\)\s+from award_vote/);
    assert.doesNotMatch(funktion("award_public_entries"), /contact_email|contact_first_name|submitter_hash/);
  });

  it("Bewerbungsroute: Honigtopf zuerst, Typ und Größe vor verkleinere(), Upload erst nach award_apply", () => {
    const r = lies("app/api/award/bewerbung/route.ts");
    const honig = r.indexOf("HONIGTOPF");
    const pruefung = r.indexOf("BILD_MIMES.has(datei.type) || datei.size > MAX_BILD_BYTES");
    const verkleinert = r.indexOf("await verkleinere(");
    const apply = r.indexOf('rpc("award_apply"');
    const upload = r.indexOf('.from("award-images").upload(');
    assert.ok(honig > 0 && pruefung > honig && verkleinert > pruefung && apply > verkleinert && upload > apply);
  });

  it("Bucket privat, keine Policy; öffentliche Seite nur mit signierten Adressen", () => {
    assert.match(sql, /values \('award-images', 'award-images', false,/);
    assert.doesNotMatch(ohneKommentar, /create policy[^;]*award-images/i);
    assert.match(lies("app/award/page.tsx"), /createSignedUrls\(ersteBilder, 600\)/);
  });

  it("öffentliche Pfade im Proxy: nur die zwei Seiten und /api/award/", () => {
    const proxy = lies("proxy.ts");
    assert.match(proxy, /"\/award", "\/award\/bewerben"\]/);
    assert.match(proxy, /"\/api\/award\/"\]/);
  });

  it("Fristen als deadline-Zeilen mit Platzhalter, ohne Zeile ist zu", () => {
    for (const k of ["award_apply_until", "award_vote_from", "award_vote_until"]) assert.match(sql, new RegExp(`'${k}'`));
    assert.match(funktion("award_windows"), /coalesce\(now\(\) <= au, false\)/);
  });

  it("Admin hängt am Abschnitt initiatives, mit Anmeldung", () => {
    for (const fn of ["award_applications_admin", "set_award_status", "set_award_organization", "delete_award_application", "initiative_stage_history"]) {
      assert.match(funktion(fn), /errcode = '28000'/, fn);
      assert.match(funktion(fn), /has_admin_section\('initiatives'\)/, fn);
    }
  });

  it("endet mit harden_definer_functions()", () => {
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Initiativen-Funnel und Stand-Tage (ADM-022)", () => {
  it("die Zwei-Parameter-Fassung fällt, sonst gäbe es zwei Überladungen", () => {
    assert.match(sql, /drop function if exists set_initiative_stage\(uuid, text\);/);
    assert.match(funktion("set_initiative_stage"), /insert into initiative_stage_log/);
  });

  it("kein zweiter Rabattsatz am Produkt — der Satz hängt am Kontingent (0123)", () => {
    assert.doesNotMatch(ohneKommentar, /discount_pct/);
  });

  it("stand_days nur 1 oder 2", () => {
    assert.match(sql, /check \(stand_days is null or stand_days in \(1, 2\)\)/);
  });
});
