import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  formatDay,
  formatMinutes,
  formatRange,
  formatTime,
  minutesOfDay,
  parseClock,
  snapTo5,
  zonedTimeToInstant,
  zoneOffsetMinutes,
} from "@/lib/tz";

const TZ = "Europe/Berlin";

describe("Zeitrechnung in der Event-Zone", () => {
  it("rechnet Sommerzeit (UTC+2)", () => {
    assert.equal(
      zonedTimeToInstant("2027-04-16", 9 * 60, TZ).toISOString(),
      "2027-04-16T07:00:00.000Z",
    );
    assert.equal(minutesOfDay("2027-04-16T07:00:00.000Z", TZ), 9 * 60);
  });

  it("rechnet Winterzeit (UTC+1)", () => {
    assert.equal(
      zonedTimeToInstant("2027-01-15", 9 * 60, TZ).toISOString(),
      "2027-01-15T08:00:00.000Z",
    );
  });

  it("kommt über die Zeitumstellung im Frühjahr (28.03.2027)", () => {
    // 02:00 -> 03:00; davor gilt +1, danach +2.
    assert.equal(
      zonedTimeToInstant("2027-03-28", 90, TZ).toISOString(),
      "2027-03-28T00:30:00.000Z",
    );
    assert.equal(
      zonedTimeToInstant("2027-03-28", 210, TZ).toISOString(),
      "2027-03-28T01:30:00.000Z",
    );
  });

  it("kommt über die Zeitumstellung im Herbst (31.10.2027)", () => {
    assert.equal(
      zonedTimeToInstant("2027-10-31", 9 * 60, TZ).toISOString(),
      "2027-10-31T08:00:00.000Z",
    );
  });

  it("ist über einen ganzen Tag hin- und rückrechenbar", () => {
    for (let m = 0; m < 1440; m += 5) {
      const iso = zonedTimeToInstant("2027-04-16", m, TZ).toISOString();
      assert.equal(minutesOfDay(iso, TZ), m, `Minute ${m}`);
    }
  });

  it("richtet sich nach der Event-Zone, nicht nach der des Browsers", () => {
    const iso = "2027-04-16T07:00:00.000Z";
    assert.equal(minutesOfDay(iso, "Europe/Berlin"), 9 * 60);
    assert.equal(minutesOfDay(iso, "America/New_York"), 3 * 60);
    assert.equal(minutesOfDay(iso, "UTC"), 7 * 60);
  });

  it("liefert den Offset der Zone", () => {
    assert.equal(zoneOffsetMinutes(new Date("2027-04-16T07:00:00Z"), TZ), 120);
    assert.equal(zoneOffsetMinutes(new Date("2027-01-15T08:00:00Z"), TZ), 60);
  });
});

describe("Formatierung", () => {
  it("formatiert Minuten und Zeitpunkte", () => {
    assert.equal(formatMinutes(575), "09:35");
    assert.equal(formatMinutes(0), "00:00");
    assert.equal(formatMinutes(1439), "23:59");
    assert.equal(formatTime("2027-04-16T07:35:00Z", TZ), "09:35");
    assert.equal(
      formatRange("2027-04-16T07:00:00Z", "2027-04-16T07:30:00Z", TZ),
      "09:00 – 09:30",
    );
  });

  it("formatiert den Tag je Sprache", () => {
    assert.equal(formatDay("2027-04-16", "de-DE"), "Fr., 16.04.2027");
    assert.equal(formatDay("2027-04-16", "en-GB"), "Fri, 16/04/2027");
  });
});

describe("Raster und Eingaben", () => {
  it("rastert auf fünf Minuten", () => {
    assert.equal(snapTo5(547), 545);
    assert.equal(snapTo5(548), 550);
    assert.equal(snapTo5(542.5), 545); // genau dazwischen -> auf
    assert.equal(snapTo5(0), 0);
  });

  it("liest Uhrzeiten aus der Datenbank", () => {
    assert.equal(parseClock("09:30:00"), 570);
    assert.equal(parseClock("09:30"), 570);
    assert.equal(parseClock(null), null);
    assert.equal(parseClock(""), null);
    assert.equal(parseClock("Unsinn"), null);
  });
});
