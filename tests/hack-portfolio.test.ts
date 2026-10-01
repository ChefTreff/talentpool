import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

describe("Portfolio-Links nur in der Hackathon-Bewerbung (HACK-007)", () => {
  it("prüft je Feld den Dienst und gibt die Links in my_hack zurück", () => {
    const sql = migrationText("v6_hack_portfolio");
    assert.match(sql, /github\\\.com/);
    assert.match(sql, /behance\\\.net/);
    assert.match(sql, /'github_url', v_app\.github_url/);
    assert.match(sql, /github_url = null, website_url = null, behance_url = null/);
  });

  it("das allgemeine Profil fragt keine Portfolio-Links ab", () => {
    const profil = readFileSync(new URL("../app/(talent)/profil/ProfileForm.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(profil, /github|behance|portfolio/i);
  });
});
