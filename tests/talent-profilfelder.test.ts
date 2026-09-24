import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  cleanLanguages,
  EDITABLE_CONSENTS,
  parseGraduationYear,
  PROFILE_MULTI_VOCABS,
  REQUIRED_CONSENTS,
} from "@/app/(talent)/profil/felder";

const migration = migrationText("v6_profilfelder");

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
