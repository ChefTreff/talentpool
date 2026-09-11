import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isTooYoung, volunteerInvite } from "@/lib/volunteers/rules";
import { canSeeShifts, type VolunteerProfile } from "@/app/(volunteers)/volunteers/types";
import {
  candidatesFor,
  freeSeats,
  shiftTotals,
  type ShiftRow,
  type VolunteerRow,
} from "@/app/(admin)/admin/volunteers/types";

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

/**
 * Der Volunteer-Bereich erscheint im Umschalter erst mit der Rolle, die es
 * erst mit der Zusage gibt. Der Hinweis im Teilnehmerportal ist deshalb der
 * einzige Weg von innen zur Bewerbung.
 */
describe("Hinweis im Teilnehmerportal", () => {
  it("lädt ohne Bewerbung zur Bewerbung ein", () => {
    assert.deepEqual(volunteerInvite(null), {
      href: "/volunteers",
      bodyKey: "inviteBody",
      ctaKey: "inviteCta",
    });
  });

  it("zeigt den Stand, solange die Bewerbung läuft", () => {
    assert.equal(volunteerInvite("applied")?.ctaKey, "inviteCtaOpen");
    assert.equal(volunteerInvite("applied")?.href, "/volunteers");
  });

  it("führt nach der Zusage direkt zu den Schichten", () => {
    assert.equal(volunteerInvite("accepted")?.href, "/volunteers/schichten");
  });

  it("fasst nach Absage und Rückzug nicht nach", () => {
    assert.equal(volunteerInvite("declined"), null);
    assert.equal(volunteerInvite("withdrawn"), null);
  });
});

/** Schichtplan-Rechnung: freie Plätze, Kandidaten, Summen (B3). */
describe("Schichtplan", () => {
  const shift = (over: Partial<ShiftRow> = {}): ShiftRow => ({
    id: "s1",
    event_day_id: "d1",
    area: "checkin",
    position: "Einlass",
    start_at: "2027-04-16T08:00:00Z",
    end_at: "2027-04-16T12:00:00Z",
    capacity: 2,
    overbook: 1,
    location: null,
    lead_person_id: null,
    lead_name: null,
    briefing_md: null,
    active: true,
    taken: 0,
    waitlisted: 0,
    people: [],
    ...over,
  });
  const person = (id: string, status: VolunteerRow["status"]): VolunteerRow => ({
    profile_id: `p-${id}`,
    person_id: id,
    display_name: id,
    email: `${id}@test`,
    status,
    shirt_size: null,
    areas: null,
    day_prefs: null,
    availability: null,
    buddy_note: null,
    notes_internal: null,
    applied_at: "",
    decided_at: null,
    shifts_assigned: 0,
    shifts_confirmed: 0,
    birthdate: null,
  });

  it("rechnet die Überbuchung in die freien Plätze ein (E9)", () => {
    assert.equal(freeSeats(shift({ taken: 0 })), 3);
    assert.equal(freeSeats(shift({ taken: 3 })), 0);
    assert.equal(freeSeats(shift({ taken: 4 })), -1);
  });

  it("schlägt nur angenommene Bewerbungen vor", () => {
    const people = [person("a", "accepted"), person("b", "applied"), person("c", "declined")];
    assert.deepEqual(
      candidatesFor(shift(), people).map((v) => v.person_id),
      ["a"],
    );
  });

  it("schlägt niemanden vor, der schon auf der Schicht steht", () => {
    const s = shift({
      people: [{ assignment_id: "x", person_id: "a", status: "waitlisted", name: "a" }],
    });
    assert.deepEqual(candidatesFor(s, [person("a", "accepted"), person("d", "accepted")]).map((v) => v.person_id), ["d"]);
  });

  it("zählt Plätze, Belegung und Warteliste zusammen", () => {
    const totals = shiftTotals([shift({ taken: 1 }), shift({ taken: 3, waitlisted: 2 })]);
    assert.deepEqual(totals, { shifts: 2, seats: 6, taken: 4, waitlisted: 2, open: 2 });
  });
});
