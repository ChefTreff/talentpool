import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { expectedSignature, verifyHubspotSignature, MAX_SKEW_MS } from "@/lib/hubspot/signature";

const secret = "test-secret";
const url = "https://portal.chef-treff.de/api/webhooks/hubspot";
const body = JSON.stringify([{ eventId: 1, subscriptionType: "deal.propertyChange", propertyName: "dealstage" }]);
const now = 1_760_000_000_000;

describe("HubSpot-Signatur v3", () => {
  it("nimmt eine korrekte Signatur im Zeitfenster", () => {
    const timestamp = String(now - 1000);
    const signature = expectedSignature(secret, "POST", url, body, timestamp);
    assert.deepEqual(verifyHubspotSignature({ method: "post", url, body, timestamp, signature, secret, now }), { ok: true });
  });

  it("lehnt eine alte Anfrage ab, auch mit korrekter Signatur", () => {
    const timestamp = String(now - MAX_SKEW_MS - 1);
    const signature = expectedSignature(secret, "POST", url, body, timestamp);
    assert.deepEqual(verifyHubspotSignature({ method: "POST", url, body, timestamp, signature, secret, now }), { ok: false, reason: "stale" });
  });

  it("lehnt veränderten Body, andere URL und falsches Secret ab", () => {
    const timestamp = String(now);
    const signature = expectedSignature(secret, "POST", url, body, timestamp);
    assert.equal(verifyHubspotSignature({ method: "POST", url, body: body + " ", timestamp, signature, secret, now }).ok, false);
    assert.equal(verifyHubspotSignature({ method: "POST", url: url + "?x=1", body, timestamp, signature, secret, now }).ok, false);
    assert.equal(verifyHubspotSignature({ method: "POST", url, body, timestamp, signature, secret: "other", now }).ok, false);
  });

  it("fällt geschlossen aus ohne Secret oder Header", () => {
    assert.deepEqual(verifyHubspotSignature({ method: "POST", url, body, timestamp: String(now), signature: "x", secret: undefined, now }), { ok: false, reason: "missing_secret" });
    assert.deepEqual(verifyHubspotSignature({ method: "POST", url, body, timestamp: null, signature: "x", secret, now }), { ok: false, reason: "missing_headers" });
  });
});
