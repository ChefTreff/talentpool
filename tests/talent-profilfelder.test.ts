import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  cleanLanguages,
  EDITABLE_CONSENTS,
  parseGraduationYear,
  PROFILE_MULTI_VOCABS,
  REQUIRED_CONSENTS,
} from "@/app/(talent)/profil/felder";

// Erst Vorschlag, dann unter der Server-Version angewendet — die Datei wird
// über ihren Namen gefunden, wo auch immer sie gerade liegt.
const DIR = new URL("../supabase/migrations/", import.meta.url);
const datei = readdirSync(DIR).find((n) => n.endsWith("_v6_profilfelder.sql"));
const migration = readFileSync(
  new URL(datei ?? "vorschlag/v6_profilfelder.sql", DIR),
  "utf8",
);

describe("Profilfelder (TAL-013)", () => {
  it("pflegt genau die Listen, die person_interest erlaubt", () => {
    const check = migration.match(/check \(vocabulary in \(([^)]+)\)\)/)?.[1] ?? "";
    const erlaubt = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual([...PROFILE_MULTI_VOCABS].sort(), erlaubt);
  });

  it("nimmt ein Abschlussjahr nur vierstellig im Rahmen 1950–2100", () => {
    assert.equal(parseGraduationYear(""), null);
    assert.equal(parseGraduationYear(" 2027 "), 2027);
    assert.equal(parseGraduationYear("1900"), "invalid");
    assert.equal(parseGraduationYear("27"), "invalid");
    assert.equal(parseGraduationYear("20x7"), "invalid");
  });

  it("führt jede Sprache höchstens einmal und verwirft halbe Zeilen", () => {
    assert.deepEqual(
      cleanLanguages([
        { language: "de", level: "native" },
        { language: "de", level: "a" },
        { language: "en", level: "" },
        { language: "", level: "c" },
        { language: "fr", level: "b" },
      ]),
      [
        { language: "de", level: "native" },
        { language: "fr", level: "b" },
      ],
    );
  });

  it("lässt Pflicht-Einwilligungen im Profil nicht ändern", () => {
    for (const k of REQUIRED_CONSENTS) {
      assert.equal((EDITABLE_CONSENTS as readonly string[]).includes(k), false, k);
    }
  });
});
