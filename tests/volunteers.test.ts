import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isTooYoung } from "@/lib/volunteers/rules";
import { canSeeShifts, type VolunteerProfile } from "@/app/(volunteers)/volunteers/types";

/** Summit 27 beginnt am 16.04.2027 (Masterplan). */
const FIRST_DAY = "2027-04-16";

describe("Mindestalter am ersten Eventtag", () => {
  it("lässt durch, wer am ersten Tag genau 18 ist", () => {
    assert.equal(isTooYoung("2009-04-16", FIRST_DAY), false);
    assert.equal(isTooYoung("2009-04-15", FIRST_DAY), false);
  });

  it("weist ab, wer am ersten Tag einen Tag zu jung ist", () => {
    assert.equal(isTooYoung("2009-04-17", FIRST_DAY), true);
  });

  it("rechnet gegen den Eventtag, nicht gegen heute", () => {
    // Am 11.09.2026 noch 17, am 16.04.2027 aber 18 — das ist erlaubt.
    assert.equal(isTooYoung("2009-03-01", FIRST_DAY), false);
  });

  it("ohne bekannten Eventtag gegen heute — strenger, nie lockerer", () => {
    const today = new Date();
    const justUnder = new Date(today);
    justUnder.setFullYear(justUnder.getFullYear() - 18);
    justUnder.setDate(justUnder.getDate() + 1);
    assert.equal(isTooYoung(justUnder.toISOString().slice(0, 10), null), true);
  });

  it("sagt bei leerer oder unsinniger Eingabe nichts", () => {
    assert.equal(isTooYoung("", FIRST_DAY), false);
    assert.equal(isTooYoung("keindatum", FIRST_DAY), false);
  });
});

describe("Wer Schichten sieht", () => {
  const profile = (status: VolunteerProfile["status"]) =>
    ({
      id: "p",
      edition_id: "e",
      status,
      shirt_size: null,
      areas: [],
      day_prefs: [],
      availability: null,
      buddy_person_id: null,
      buddy_note: null,
      applied_at: "",
      decided_at: null,
      decision_note: null,
      shifts: 0,
    }) satisfies VolunteerProfile;

  it("nur mit angenommener Bewerbung", () => {
    assert.equal(canSeeShifts(profile("accepted")), true);
  });

  it("nicht in Prüfung, abgesagt oder zurückgezogen", () => {
    for (const status of ["applied", "declined", "withdrawn"] as const) {
      assert.equal(canSeeShifts(profile(status)), false, status);
    }
  });

  it("nicht ohne Bewerbung", () => {
    assert.equal(canSeeShifts(null), false);
  });
});
