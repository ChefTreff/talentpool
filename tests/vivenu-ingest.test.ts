import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { expectedDigest, verifyVivenuSignature } from "@/lib/vivenu/signature";
import { retryDelayMs } from "@/lib/vivenu/backoff";
import {
  isIngestable,
  TICKET_EVENTS,
  ticketsOf,
  toIngestPayload,
  webhookId,
  webhookType,
} from "@/lib/vivenu/tickets";

const SECRET = "wh_test_secret";

/**
 * Aufgezeichnetes Beispiel nach der Doku und den vivenu-Antworten vom
 * 11.09. — bis zum ersten Sandbox-Lauf die Grundlage aller Tests.
 */
const TICKET = {
  _id: "tkt_1",
  eventId: "evt_1",
  ticketTypeId: "tt_student",
  transactionId: "trx_1",
  barcode: "ABC123",
  secret: "s3cr3t",
  status: "VALID",
  personalizationStatus: "DETAILSREQUIRED",
  email: "kauf@example.org",
  firstname: "Mia",
  lastname: "Muster",
  realPrice: 4900,
  currency: "EUR",
  createdAt: "2027-01-05T10:00:00.000Z",
  addOns: [{ name: "Hotel" }],
  meta: { person_id: "p-1" },
  extraFields: { email: "inhaber@example.org" },
  appliedDiscountInfo: [{ discountId: "cpn_partner_1" }],
};

describe("vivenu-Webhook-Signatur", () => {
  const body = JSON.stringify({ id: "wh_1", type: "ticket.updated", data: TICKET });

  it("nimmt den Hex-Digest über den Raw-Body", () => {
    const sig = expectedDigest(SECRET, body, "hex");
    assert.deepEqual(verifyVivenuSignature({ rawBody: body, signature: sig, secret: SECRET }), {
      ok: true,
      encoding: "hex",
    });
  });

  it("nimmt Base64 und ein vorangestelltes sha256=", () => {
    const b64 = expectedDigest(SECRET, body, "base64");
    assert.equal(verifyVivenuSignature({ rawBody: body, signature: b64, secret: SECRET }).ok, true);
    assert.equal(
      verifyVivenuSignature({ rawBody: body, signature: `sha256=${b64}`, secret: SECRET }).ok,
      true,
    );
  });

  it("weist ab, wenn der Body auch nur ein Zeichen anders ist", () => {
    const sig = expectedDigest(SECRET, body, "hex");
    const v = verifyVivenuSignature({ rawBody: body + " ", signature: sig, secret: SECRET });
    assert.deepEqual(v, { ok: false, reason: "mismatch" });
  });

  it("weist ab, wenn der neu zusammengesetzte JSON-String gehasht würde", () => {
    // Genau die Falle aus der vivenu-Antwort: Felder werden umsortiert.
    const reserialised = JSON.stringify(JSON.parse(body));
    const sig = expectedDigest(SECRET, body, "hex");
    if (reserialised !== body) {
      assert.equal(
        verifyVivenuSignature({ rawBody: reserialised, signature: sig, secret: SECRET }).ok,
        false,
      );
    }
  });

  it("ohne Secret und ohne Header wird abgelehnt, nicht durchgewunken", () => {
    assert.deepEqual(verifyVivenuSignature({ rawBody: body, signature: "x", secret: undefined }), {
      ok: false,
      reason: "missing_secret",
    });
    assert.deepEqual(verifyVivenuSignature({ rawBody: body, signature: null, secret: SECRET }), {
      ok: false,
      reason: "missing_header",
    });
  });
});

describe("vivenu-Nutzlast lesen", () => {
  it("findet die Ereignis-Id unter id und _id", () => {
    assert.equal(webhookId({ id: "wh_1" }), "wh_1");
    assert.equal(webhookId({ _id: "wh_2" }), "wh_2");
    assert.equal(webhookId({}), null);
    assert.equal(webhookId({ id: "  " }), null);
  });

  it("liest die Ereignisart aus type oder event", () => {
    assert.equal(webhookType({ type: "ticket.updated" }), "ticket.updated");
    assert.equal(webhookType({ event: "ticket.created" }), "ticket.created");
    assert.equal(webhookType({}), "unknown");
  });

  it("kennt genau die drei Ticket-Ereignisse", () => {
    assert.deepEqual([...TICKET_EVENTS], ["ticket.created", "ticket.updated", "ticket.deleted"]);
  });

  it("findet Tickets in allen Formen, die vivenu schickt", () => {
    assert.equal(ticketsOf(TICKET).length, 1);
    assert.equal(ticketsOf([TICKET, TICKET]).length, 2);
    assert.equal(ticketsOf({ tickets: [TICKET] }).length, 1);
    assert.equal(ticketsOf({ ticket: TICKET }).length, 1);
    assert.equal(ticketsOf({ data: { tickets: [TICKET] } }).length, 1);
    assert.equal(ticketsOf({ nichts: true }).length, 0);
    assert.equal(ticketsOf(null).length, 0);
  });

  it("nimmt nur Tickets mit eigener Id und Event", () => {
    assert.equal(isIngestable(TICKET), true);
    assert.equal(isIngestable({ _id: "x" }), false);
    assert.equal(isIngestable({ eventId: "e" }), false);
  });

  it("zieht die Inhaber-Mail aus dem Extra-Feld nach oben", () => {
    // vivenu kann die Inhaber-Adresse nicht am Kunden ändern (Antwort 11.09.),
    // deshalb steht sie in einem Extra-Feld — der Ingest liest sie von dort.
    const payload = toIngestPayload(TICKET);
    assert.equal(payload.holderEmail, "inhaber@example.org");
    assert.equal(payload.transactionId, "trx_1");
  });

  it("nimmt die Transaktions-Id aus dem Umfeld, wenn sie am Ticket fehlt", () => {
    const ohne = { ...TICKET, transactionId: undefined };
    const payload = toIngestPayload(ohne, { transactionId: "trx_9" });
    assert.equal(payload.transactionId, "trx_9");
  });

  it("setzt holderEmail auf null, wenn es kein Extra-Feld gibt", () => {
    const ohne = { ...TICKET, extraFields: undefined };
    assert.equal(toIngestPayload(ohne).holderEmail, null);
  });
});

describe("Wartezeit bei 429", () => {
  it("folgt retry-after, wenn vivenu einen Wert schickt", () => {
    assert.equal(retryDelayMs(0, "2"), 2000);
    assert.equal(retryDelayMs(3, "1"), 1000);
  });

  it("verdoppelt sonst und deckelt bei 30 Sekunden", () => {
    assert.equal(retryDelayMs(0, null), 500);
    assert.equal(retryDelayMs(1, null), 1000);
    assert.equal(retryDelayMs(2, null), 2000);
    assert.equal(retryDelayMs(20, null), 30_000);
  });

  it("ignoriert Unsinn im Header", () => {
    assert.equal(retryDelayMs(0, "bald"), 500);
    assert.equal(retryDelayMs(0, "-5"), 500);
  });
});
