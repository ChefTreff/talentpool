/**
 * Sandbox-Lauf gegen vivenu (Arbeitsauftrag Welle 4, PR 23).
 *
 * Läuft in Schritten, jeder einzeln aufrufbar, jeder erst lesend:
 *
 *   node --env-file=.env.local scripts/vivenu-sandbox-lauf.mjs event
 *   …                                                          typen        # ticket_type_map vorschlagen
 *   …                                                          typen --apply
 *   …                                                          shops        # Undershops und Coupons lesen
 *   …                                                          freiticket   # anlegen, Id merken
 *   …                                                          kette        # SPK-068: ganze Kette an Konrads Freiticket
 *   …                                                          kontingent-probe  # PART-111: hält der Shop die Menge je Kategorie? (nur Sandbox)
 *   …                                                          transaktion <transactionId>  # TAL-019: Käufer-Adresse und Tickets lesen
 *   …                                                          datenfelder [ticketTypeId]   # TAL-019: data-fields/resolve, Slugs company/position?
 *   …                                                          personalisieren <ticketId>   # TAL-019: Probe-Rückschreiben (nur mit --apply)
 *   …                                                          storno <ticketId>
 *
 * Regeln für das Dev-Event (Konrads Vorgabe): **nichts löschen, was Konrad
 * angelegt hat**. Alles, was dieses Skript anlegt, trägt den Präfix
 * `ZZTEST` im Namen und wird am Ende wieder entfernt.
 *
 * Gibt niemals Schlüssel oder Ticket-Secrets aus.
 */
import { createClient } from "@supabase/supabase-js";
import { url as supabaseUrl, secretKey, requireEnv } from "./supabase-env.mjs";

requireEnv(true);

const MARK = "ZZTEST";
const args = process.argv.slice(2);
const step = args[0] ?? "event";
const apply = args.includes("--apply");

const sandbox = process.env.VIVENU_SANDBOX?.trim().toLowerCase() !== "false";
const base = sandbox ? "https://vivenu.dev/api" : "https://vivenu.com/api";
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function vv(path, init) {
  const key = process.env.VIVENU_API_KEY?.trim();
  if (!key) throw new Error("VIVENU_API_KEY fehlt");
  const res = await fetch(base + path, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`vivenu ${res.status} ${path}: ${String(text).slice(0, 300)}`);
  return body;
}

async function edition() {
  const { data } = await admin
    .from("event")
    .select("id, slug, name, vivenu_event_id")
    .eq("is_edition", true)
    .not("vivenu_event_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Keine Edition mit vivenu_event_id (set_edition_vivenu im Admin setzen).");
  return data;
}

/** Pass-Typ aus dem Namen des Tickettyps raten — der Mensch prüft es danach. */
function guessPassType(name) {
  const n = (name ?? "").toLowerCase();
  // Die Pässe des FLS27: Student, Talent, Professional, Startup, Investor,
  // Supporter (dazu Partner, Speaker, Crew für interne Kontingente).
  //
  // Reihenfolge ist die Logik: das engere Muster zuerst. `student` stand
  // ursprünglich in derselben Zeile wie `talent` und wäre vom Talent Pass
  // verschluckt worden — beide gibt es nebeneinander. Was auf nichts passt,
  // wird `professional`; das ist der Pass für alle übrigen Gäste.
  if (/partner|aussteller|exhibitor/.test(n)) return "partner";
  if (/startup|gründer|founder/.test(n)) return "startup";
  if (/investor/.test(n)) return "investor";
  if (/supporter|förder/.test(n)) return "supporter";
  if (/speaker/.test(n)) return "speaker";
  if (/crew|volunteer|helfer/.test(n)) return "crew";
  if (/student|studi/.test(n)) return "student";
  if (/talent/.test(n)) return "talent";
  return "professional";
}

/**
 * Zaehlt ein vivenu-Ticket als „gibt es schon"? Dieselbe Liste wie
 * `istLebendesTicket` in `lib/vivenu/naming.ts` und `vivenu_ticket_status()`
 * in der Datenbank — hier noch einmal, weil ein .mjs-Skript kein TypeScript
 * laedt. Alle drei zusammen aendern.
 */
const LEBENDE = new Set(["VALID", "DETAILSREQUIRED", "CHECKEDIN", "CHECKED_IN", "BLOCKED"]);
const lebt = (status) => LEBENDE.has(String(status ?? "").trim().toUpperCase());

async function konradTicket() {
  const { data: pe, error: e1 } = await admin.from("person_email")
    .select("person_id").eq("email", "konrad@chef-treff.de").limit(1).single();
  if (e1) throw new Error(`Person nicht gefunden: ${e1.message}`);
  const { data: sp, error: e2 } = await admin.from("speaker_profile")
    .select("id").eq("person_id", pe.person_id).limit(1).single();
  if (e2) throw new Error(`Speaker-Profil nicht gefunden: ${e2.message}`);
  const { data: t, error: e3 } = await admin.from("ticket")
    .select("id, source, status").eq("speaker_profile_id", sp.id).eq("source", "speaker").limit(1).single();
  if (e3) throw new Error(`Freiticket nicht gefunden: ${e3.message}`);
  return t;
}

const steps = {
  /** Das Dev-Event lesen und zeigen, welche Felder wirklich ankommen. */
  async event() {
    const ed = await edition();
    const ev = await vv(`/events/${encodeURIComponent(ed.vivenu_event_id)}`);
    console.log(`Edition ${ed.slug} → vivenu ${ed.vivenu_event_id}`);
    console.log(`Event: ${JSON.stringify(ev.name)} · Felder: ${Object.keys(ev).sort().join(", ")}`);
    const tickets = ev.tickets ?? ev.ticketTypes ?? [];
    console.log(`\nTickettypen (${tickets.length}):`);
    for (const t of tickets) {
      console.log(`  ${t._id ?? t.id}  ${JSON.stringify(t.name)}  preis=${t.price ?? "-"}  aktiv=${t.active ?? "-"}`);
      console.log(`      Felder: ${Object.keys(t).sort().join(", ")}`);
    }
    const shops = ev.underShops ?? [];
    console.log(`\nUndershops (${shops.length}):`);
    for (const s of shops) {
      console.log(`  ${s._id}  ${JSON.stringify(s.name)}  unlockMode=${s.unlockMode ?? "-"}  aktiv=${s.active ?? "-"}`);
      console.log(`      Felder: ${Object.keys(s).sort().join(", ")}`);
    }
  },

  /** ticket_type_map aus den Tickettypen des Events vorschlagen. */
  async typen() {
    const ed = await edition();
    const ev = await vv(`/events/${encodeURIComponent(ed.vivenu_event_id)}`);
    const tickets = ev.tickets ?? ev.ticketTypes ?? [];
    if (tickets.length === 0) {
      console.log("Das Event hat keine Tickettypen.");
      return;
    }
    const { data: known } = await admin
      .from("ticket_type_map")
      .select("vivenu_ticket_type_id")
      .eq("event_id", ed.id);
    const have = new Set((known ?? []).map((k) => k.vivenu_ticket_type_id));

    const rows = tickets.map((t) => ({
      event_id: ed.id,
      vivenu_ticket_type_id: String(t._id ?? t.id),
      vivenu_ticket_name: t.name ?? null,
      pass_type: guessPassType(t.name),
      active: t.active !== false,
    }));
    for (const r of rows) {
      console.log(`${have.has(r.vivenu_ticket_type_id) ? "vorhanden" : apply ? "angelegt  " : "wuerde    "}  ${r.vivenu_ticket_type_id}  ${JSON.stringify(r.vivenu_ticket_name)} ⇒ ${r.pass_type}`);
    }
    if (!apply) {
      console.log("\nNichts geschrieben. Pass-Typen prüfen, dann mit --apply.");
      return;
    }
    const neu = rows.filter((r) => !have.has(r.vivenu_ticket_type_id));
    if (neu.length > 0) {
      const { error } = await admin.from("ticket_type_map").insert(neu);
      if (error) throw error;
      console.log(`\n${neu.length} Zeile(n) angelegt.`);
    }
    // Name und Pass-Typ bestehender Zeilen nachziehen — Konrad benennt im
    // Dashboard um, die Zuordnung soll dem folgen.
    for (const r of rows.filter((x) => have.has(x.vivenu_ticket_type_id))) {
      const { error } = await admin
        .from("ticket_type_map")
        .update({ vivenu_ticket_name: r.vivenu_ticket_name, active: r.active, updated_at: new Date().toISOString() })
        .eq("event_id", r.event_id)
        .eq("vivenu_ticket_type_id", r.vivenu_ticket_type_id);
      if (error) throw error;
    }
    // Zeilen, deren Tickettyp es im Event nicht mehr gibt, sind tot.
    const live = new Set(rows.map((r) => r.vivenu_ticket_type_id));
    const tot = (known ?? []).filter((k) => !live.has(k.vivenu_ticket_type_id));
    for (const k of tot) {
      const { error } = await admin
        .from("ticket_type_map")
        .delete()
        .eq("event_id", ed.id)
        .eq("vivenu_ticket_type_id", k.vivenu_ticket_type_id);
      if (error) throw error;
      console.log(`entfernt    ${k.vivenu_ticket_type_id} (Tickettyp im Event nicht mehr vorhanden)`);
    }
    console.log("\nFertig. Danach lohnt ein Sweep-Lauf (backfill_ticket_pass_types).");
  },

  /** Undershops und Coupons lesen — Feldnamen gegen lib/vivenu abgleichen. */
  async shops() {
    const ed = await edition();
    const ev = await vv(`/events/${encodeURIComponent(ed.vivenu_event_id)}`);
    const typen = new Map((ev.tickets ?? []).map((t) => [String(t._id), t.name]));
    const shopBase = process.env.VIVENU_SHOP_BASE?.trim().replace(/\/+$/, "");
    for (const s of ev.underShops ?? []) {
      console.log(`Undershop ${s._id} ${JSON.stringify(s.name)}`);
      console.log(`  unlockMode=${s.unlockMode ?? "—"}  aktiv=${s.active ?? "—"}  link=${shopBase ? `${shopBase}/event/${ed.vivenu_event_id}/${s._id}` : "(VIVENU_SHOP_BASE fehlt)"}`);
      for (const t of s.tickets ?? []) {
        console.log(`    baseTicket=${t.baseTicket ?? "— (verwaist)"} ${JSON.stringify(typen.get(t.baseTicket) ?? "?")} preis=${t.price} menge=${t.amount ?? "—"} aktiv=${t.active}`);
      }
    }
    // Liste: `/coupon` kennt nur POST, gelesen wird ueber `/coupon/rich`.
    const coupons = await vv(`/coupon/rich?top=50`);
    const list = Array.isArray(coupons) ? coupons : (coupons.docs ?? coupons.rows ?? []);
    console.log(`\nCoupons (${list.length}):`);
    for (const c of list) {
      console.log(`  ${c._id}  code=${c.code ?? "—"}  ${c.discountType ?? "—"}/${c.discountValue ?? "—"}  maxTickets=${c.maxTickets ?? "—"}  maxUsage=${c.maxUsage ?? "—"}  aktiv=${c.active}`);
      console.log(`      allowAllEvents=${c.allowAllEvents}  allowAllTickets=${c.allowAllTickets}  unlocks=${JSON.stringify(c.unlocks ?? [])}`.slice(0, 300));
    }
  },

  /**
   * Personalisierung wie im Portal: `POST /tickets/personalize/{id}/{secret}`.
   * Das Secret kommt aus `ticket_secret` und wird nie ausgegeben.
   */
  async personalisieren() {
    const id = args[1];
    if (!id) throw new Error("Ticket-Id angeben: … personalisieren <vivenuTicketId>");
    const { data: row, error: ticketErr } = await admin
      .from("ticket").select("id").eq("vivenu_ticket_id", id).maybeSingle();
    if (ticketErr) throw ticketErr;
    if (!row) throw new Error(`Ticket ${id} ist bei uns nicht bekannt.`);
    const { data: sec, error } = await admin
      .from("ticket_secret").select("secret").eq("ticket_id", row.id).maybeSingle();
    if (error) throw error;
    const data = sec?.secret;
    if (!data) throw new Error(`Kein Secret zu Ticket ${id} gespeichert.`);
    const body = { firstname: MARK, lastname: "Personalisiert", extraFields: {} };
    console.log("Anfrage:", JSON.stringify(body), "(Secret verborgen)");
    const res = await vv(`/tickets/personalize/${encodeURIComponent(id)}/${encodeURIComponent(data)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log("Antwort:", JSON.stringify(res).slice(0, 400));
  },

  /**
   * Ein Freiticket anlegen — ohne Mailversand, klar gekennzeichnet.
   * Der Pfad ist `POST /tickets/free`; `create-free-tickets` aus der Doku gibt es
   * nicht. Die Positionen heissen `items` (nicht `tickets`), der Vorname `prename`.
   */
  async freiticket() {
    const ed = await edition();
    const ev = await vv(`/events/${encodeURIComponent(ed.vivenu_event_id)}`);
    const type = (ev.tickets ?? []).find((t) => !String(t.name ?? "").startsWith(MARK));
    if (!type) throw new Error("Kein Tickettyp im Event.");
    const body = {
      eventId: ed.vivenu_event_id,
      items: [{ type: "ticket", ticketTypeId: String(type._id), amount: 1 }],
      prename: MARK,
      lastname: "Freiticket",
      email: "delivered+vvsandbox@resend.dev",
      sendMail: false,
      addToCustomers: false,
    };
    console.log("Anfrage:", JSON.stringify(body));
    const res = await vv(`/tickets/free`, { method: "POST", body: JSON.stringify(body) });
    const list = Array.isArray(res) ? res : (res.tickets ?? [res]);
    console.log("Antwort-Felder:", Object.keys(Array.isArray(res) ? res[0] ?? {} : res).sort().join(", "));
    for (const t of list) console.log(`  Ticket ${t._id ?? "?"} ${JSON.stringify(t.ticketName ?? t.name ?? "")} status=${t.status ?? "?"}`);
  },

  /**
   * **Die ganze Kette an Konrads Freiticket** (SPK-068, Nachweis fuer
   * `docs/schnittstellen-pruefung-2026-09.md`).
   *
   * Spiegelt `issueSpeakerTicket` Schritt fuer Schritt — dieselben Aufrufe in
   * derselben Reihenfolge mit demselben Rumpf wie `lib/vivenu/free-tickets.ts`.
   * Was hier **nicht** geprueft wird, ist der Klick selbst: `requireAdminSection`
   * braucht eine Anmeldung, und die macht Konrad. Vorher
   * `--apply --nur=ticket-zurueck` in `scripts/testdaten-konrad.mjs`.
   */
  async kette() {
    const ed = await edition();
    const konrad = await konradTicket();
    console.log(`Ticket ${konrad.id} · Quelle ${konrad.source} · Status ${konrad.status}`);

    // 1 Lesefunktion wie die Action
    const { data: zeilen, error: leseFehler } = await admin.rpc("speaker_ticket_for_issue", { p_ticket_id: konrad.id });
    if (leseFehler) throw new Error(`speaker_ticket_for_issue: ${leseFehler.message}`);
    const z = (zeilen ?? [])[0];
    if (!z) throw new Error("Lesefunktion gab nichts zurueck");
    console.log(`1 gelesen: ${z.holder_first_name} ${z.holder_last_name} · Event ${z.vivenu_event_id} · Typ ${z.vivenu_ticket_type_id}`);
    if (z.vivenu_ticket_id) { console.log(`   schon ausgestellt (${z.vivenu_ticket_id}) — erst zuruecksetzen`); return; }

    // 2 Idempotenz: gibt es zu unserer Kennung schon ein Ticket?
    const vorher = await vv(`/tickets?batch=${encodeURIComponent(konrad.id)}&top=10`);
    const vorhandene = vorher.docs ?? vorher.rows ?? [];
    const lebende = vorhandene.filter((x) => lebt(x.status));
    console.log(`2 Idempotenz-Abfrage: ${vorhandene.length} Treffer zu batch=${konrad.id}, davon lebend ${lebende.length}`
      + (vorhandene.length ? ` [${vorhandene.map((x) => x.status).join(", ")}]` : ""));
    if (lebende.length) { console.log(`   es gibt schon ein gueltiges Ticket (${lebende[0]._id}) — es wuerde wiederverwendet, kein zweites angelegt`); return; }

    // 3 anlegen — derselbe Rumpf wie lib/vivenu/free-tickets.ts
    const body = {
      eventId: z.vivenu_event_id,
      items: [{ type: "ticket", amount: 1, ticketTypeId: z.vivenu_ticket_type_id }],
      prename: z.holder_first_name, lastname: z.holder_last_name, email: z.holder_email,
      sendMail: false, batchId: konrad.id, requiresPersonalization: false, addToCustomers: true,
    };
    const antwort = await vv("/tickets/free", { method: "POST", body: JSON.stringify(body) });
    const karte = Array.isArray(antwort) ? antwort[0] : antwort;
    console.log(`3 angelegt: ${karte._id} · barcode=${karte.barcode ? "ja" : "NEIN"} · secret=${karte.secret ? "ja" : "nein"} · batch=${karte.batch === konrad.id ? "stimmt" : karte.batch} · status=${karte.status}`);

    // 3b dieselbe Abfrage noch einmal — findet sie das eigene Ticket wieder?
    const nachher = await vv(`/tickets?batch=${encodeURIComponent(konrad.id)}&top=10`);
    const wieder = (nachher.docs ?? nachher.rows ?? []);
    const wiederLebend = wieder.filter((x) => lebt(x.status));
    console.log(`3b Idempotenz greift: ${wieder.length} Treffer gesamt, ${wiederLebend.length} lebend, das neue dabei: ${wiederLebend.some((x) => x._id === karte._id) ? "ja" : "NEIN"}`);

    // 4 zurueckschreiben
    const { error: f1 } = await admin.rpc("set_ticket_issued", {
      p_ticket_id: konrad.id, p_vivenu_ticket_id: String(karte._id), p_barcode: karte.barcode,
      p_vivenu_transaction_id: karte.transactionId ?? null, p_ticket_type_map_id: z.ticket_type_map_id,
    });
    if (f1) throw new Error(`set_ticket_issued: ${f1.message}`);
    let secret = typeof karte.secret === "string" && karte.secret.trim() !== "" ? karte.secret.trim() : null;
    if (!secret && karte.transactionId) {
      const tx = await vv(`/transactions/${encodeURIComponent(karte.transactionId)}/tickets`);
      const liste = Array.isArray(tx) ? tx : (tx.docs ?? []);
      const treffer = liste.find((x) => x._id === karte._id) ?? liste[0];
      secret = treffer?.secret ?? null;
      console.log(`4b Secret ueber die Transaktion nachgeladen: ${secret ? "ja" : "nein"}`);
    }
    if (secret) {
      const { error: f2 } = await admin.rpc("set_ticket_secret", { p_ticket_id: konrad.id, p_secret: secret });
      if (f2) throw new Error(`set_ticket_secret: ${f2.message}`);
    }
    const { data: nach } = await admin.from("ticket")
      .select("status, barcode, vivenu_ticket_id, ticket_type_map_id").eq("id", konrad.id).single();
    console.log(`4 eingetragen: status=${nach.status} · barcode=${nach.barcode ? "ja" : "NEIN"} · vivenu=${nach.vivenu_ticket_id} · typ_zuordnung=${nach.ticket_type_map_id ? "ja" : "nein"}`);

    // 5 Wallet-Ziel — dieselbe Adresse, die /api/speaker/ticket-wallet baut
    const ziel = `${sandbox ? "https://vivenu.dev" : "https://vivenu.com"}/ticket/${encodeURIComponent(String(karte._id))}/${encodeURIComponent(secret ?? "")}`;
    if (secret) {
      const probe = await fetch(ziel, { redirect: "manual" });
      console.log(`5 Wallet-Ziel: HTTP ${probe.status} (Adresse nicht ausgegeben — sie enthaelt das Secret)`);
    } else {
      console.log("5 Wallet-Ziel: kein Secret, der Knopf bliebe ohne Ziel");
    }

    // 6 Swapcard-Export
    const { data: sp, error: f3 } = await admin.rpc("event_app_speakers", { p_edition_id: ed.id });
    if (f3) throw new Error(`event_app_speakers: ${f3.message}`);
    const drin = (sp ?? []).filter((r) => String(r.email ?? "").toLowerCase() === String(z.holder_email ?? "").toLowerCase());
    console.log(`6 Swapcard-Export: ${(sp ?? []).length} Speaker, davon Konrad ${drin.length ? "enthalten" : "NICHT enthalten"}`);
  },

  /**
   * **Kontingent-Probe (PART-111): hält der Undershop die Menge je Kategorie, wenn ein einziger Coupon
   * mehr erlaubt?**
   *
   * „Ein Code für alle Kategorien“ heißt: ein Coupon je Organisation mit `maxTickets` als Summe und
   * `allowedTickets` als Vereinigung der Kategorien. Die Grenze je Kategorie soll dann der Undershop
   * halten — seine Zeilen tragen `amount` je Tickettyp (`inventoryStrategy: independent`). Ob vivenu das
   * beim Anlegen eines Warenkorbs wirklich durchsetzt, steht im Code und im Runbook, ist aber nicht
   * belegt. Dieser Schritt belegt es:
   *
   * Er legt einen Undershop mit zwei Zeilen an (Typ A: 2 Stück, Typ B: 3 Stück, alle übrigen Typen des
   * Events geschlossen) und einen Coupon, der für beide Typen bis zu 10 Stück erlaubt — also mehr, als die
   * Zeilen hergeben. Dann legt er Warenkörbe an (`POST /checkout`; nichts wird bezahlt oder abgeschlossen,
   * jeder Warenkorb wird sofort wieder abgebrochen): bis zur Zeilengrenze muss es klappen, **ein Stück
   * darüber muss abgelehnt werden** — auch bei einem einzelnen Typ, an dem die Summe des Shops und der
   * Coupon noch Platz ließen.
   *
   * Nur gegen die Sandbox. Alles trägt den Präfix `ZZTEST`. Am Ende — auch nach einem Fehler — werden die
   * Warenkörbe abgebrochen, der Coupon abgeschaltet (vivenu kennt kein Löschen von Coupons) und der
   * Undershop entfernt; Konrads Undershops, Coupons und Tickettypen bleiben unberührt. Während der Schritt
   * läuft, darf der Cron `/api/cron/vivenu-allocations` nicht schreiben (beide ersetzen das ganze
   * `underShops`-Array des Events); Kollisionen erkennt man an einer Fehlermeldung, dann Schritt wiederholen.
   *
   * Ausgabe nur Zahlen und Zustände: keine Schlüssel, keine Ids, keine Warenkorb-Geheimnisse.
   */
  async "kontingent-probe"() {
    if (!sandbox) throw new Error("kontingent-probe läuft nur gegen die Sandbox (VIVENU_SANDBOX=true).");
    const ed = await edition();
    const eventId = ed.vivenu_event_id;
    const eventPfad = `/events/${encodeURIComponent(eventId)}`;
    const ev = await vv(eventPfad);
    const typen = (ev.tickets ?? []).filter((t) => t.active !== false && !String(t.name ?? "").startsWith(MARK));
    if (typen.length < 2) throw new Error("Das Event braucht mindestens zwei aktive Tickettypen.");
    const [a, b] = typen;
    const idA = String(a._id);
    const idB = String(b._id);
    const MENGE_A = 2;
    const MENGE_B = 3;
    const COUPON_MAX = 10;
    const stempel = Date.now().toString(36);
    const shopName = `${MARK} Kontingent-Probe ${stempel}`;
    const code = `${MARK}-PROBE-${stempel.toUpperCase()}`;
    // Ids und Zeilenumbrüche aus Fehlertexten nehmen: ausgegeben werden nur Zahlen und Zustände.
    const maskiere = (text) => String(text ?? "").replace(/[0-9a-f]{24}/gi, "<id>").replace(/\s+/g, " ").slice(0, 160);

    const offen = [];
    const ergebnisse = [];
    let couponId = null;
    let couponFelder = null;

    /** Einen Warenkorb abbrechen — das Geheimnis kommt aus der Antwort und wird nie ausgegeben. */
    const abbrechen = async (k) => {
      try {
        const antwort = await vv(`/checkout/${encodeURIComponent(k.id)}/abort`, { method: "POST", body: JSON.stringify({ secret: k.secret }) });
        k.erledigt = true;
        return antwort.status ?? "?";
      } catch (e) {
        return `Fehler ${maskiere(e.message)}`;
      }
    };

    try {
      // 1 Undershop: ein Lesen-Ändern-Schreiben des ganzen Arrays, wie in lib/vivenu/allocations.ts
      const fenster = {};
      if (typeof ev.sellStart === "string") fenster.sellStart = ev.sellStart;
      if (typeof ev.sellEnd === "string") fenster.sellEnd = ev.sellEnd;
      const zeile = (t, amount, aktiv) => ({
        baseTicket: String(t._id),
        name: String(t.name ?? "Ticket"),
        price: aktiv ? 0 : typeof t.price === "number" ? t.price : 0,
        amount,
        active: aktiv,
      });
      const geschlossen = (ev.tickets ?? []).filter((t) => ![idA, idB].includes(String(t._id))).map((t) => zeile(t, 0, false));
      const shop = {
        name: shopName,
        active: true,
        unlockMode: "couponCode",
        maxAmount: MENGE_A + MENGE_B,
        maxAmountPerOrder: MENGE_A + MENGE_B,
        ...fenster,
        tickets: [zeile(a, MENGE_A, true), zeile(b, MENGE_B, true), ...geschlossen],
      };
      await vv(eventPfad, { method: "PUT", body: JSON.stringify({ underShops: [...(ev.underShops ?? []), shop] }) });
      const nach = await vv(eventPfad);
      const unser = (nach.underShops ?? []).find((s) => s.name === shopName);
      if (!unser?._id) throw new Error("Undershop ohne _id in der Antwort");
      console.log(`Undershop angelegt: Typ A ${MENGE_A} Stück, Typ B ${MENGE_B} Stück, Summe ${MENGE_A + MENGE_B}, ${geschlossen.length} übrige Typen geschlossen`);

      // 2 Coupon: erlaubt beide Typen bis COUPON_MAX — mehr, als die Zeilen hergeben
      couponFelder = {
        name: `${MARK} Kontingent-Probe`,
        discountType: "var",
        discountValue: 1,
        maxUsage: COUPON_MAX,
        maxTickets: COUPON_MAX,
        singleUsage: false,
        allowAllEvents: false,
        allowedEvents: [eventId],
        allowAllTickets: false,
        allowedTickets: [idA, idB],
        unlocks: [{ target: "underShop", eventId, underShopId: String(unser._id) }],
      };
      const coupon = await vv(`/coupon`, { method: "POST", body: JSON.stringify({ ...couponFelder, code, active: true }) });
      couponId = String(coupon._id);
      console.log(`Coupon angelegt: beide Typen bis ${COUPON_MAX} Stück, Rabatt 100 %\n`);

      // 3 Versuche. Die ersten Versuche je Typ gehen durch (Gegenprobe: der Shop verkauft überhaupt),
      //   die darüber müssen scheitern — sonst hielte die Zeile die Menge nicht.
      const versuch = async (name, wunsch, erwartet) => {
        const items = wunsch.map(([t, amount]) => ({ type: "ticket", ticketTypeId: t, amount }));
        const beschreibung = wunsch.map(([t, n]) => `${t === idA ? "A" : "B"}×${n}`).join(" + ");
        let ok = false;
        let zustand;
        let k = null;
        try {
          const antwort = await vv(`/checkout`, {
            method: "POST",
            body: JSON.stringify({ type: "transaction", eventId, shopId: String(unser._id), coupons: [code], items }),
          });
          k = { id: String(antwort._id), secret: String(antwort.secret ?? ""), erledigt: false };
          offen.push(k);
          ok = true;
          zustand = `angelegt (${antwort.status}), Preis ${antwort.realPrice}`;
        } catch (e) {
          const m = /^vivenu (\d+)/.exec(e.message ?? "");
          zustand = `abgelehnt (HTTP ${m ? m[1] : "?"}: ${maskiere(String(e.message ?? "").replace(/^vivenu \d+ \S+: /, ""))})`;
        }
        // Sofort freigeben, damit die Reservierung den nächsten Versuch nicht verfälscht.
        const frei = k ? ` · abgebrochen: ${await abbrechen(k)}` : "";
        if (k) await new Promise((r) => setTimeout(r, 1000));
        const wie = ok === erwartet ? "wie erwartet" : "ABWEICHUNG";
        console.log(`${name}  ${beschreibung.padEnd(10)} ${erwartet ? "soll durchgehen" : "soll scheitern "} → ${zustand}${frei} — ${wie}`);
        ergebnisse.push({ name, erwartet, ok });
      };

      await versuch("1", [[idA, MENGE_A]], true);
      await versuch("2", [[idA, MENGE_A + 1]], false);
      await versuch("3", [[idB, MENGE_B]], true);
      await versuch("4", [[idB, MENGE_B + 1]], false);
      await versuch("5", [[idA, MENGE_A], [idB, MENGE_B]], true);
      await versuch("6", [[idA, MENGE_A], [idB, MENGE_B + 1]], false);
    } finally {
      // 4 Aufräumen — immer, auch nach einem Fehler.
      const abgebrochen = [];
      for (const k of offen.filter((x) => !x.erledigt)) abgebrochen.push(await abbrechen(k));
      let coupon = "nicht angelegt";
      if (couponId) {
        try {
          // vivenu kennt kein Löschen von Coupons: abschalten. `PUT` ersetzt den Coupon, deshalb der volle
          // Satz mit zugedrehten Grenzen — wie `disabled` in lib/vivenu/allocations.ts.
          await vv(`/coupon/${encodeURIComponent(couponId)}`, {
            method: "PUT",
            body: JSON.stringify({ ...couponFelder, active: false, maxTickets: 0, maxUsage: 0 }),
          });
          coupon = "abgeschaltet";
        } catch (e) {
          coupon = `NICHT abgeschaltet (${maskiere(e.message)}) — Coupon „${couponFelder?.name}“ von Hand im Dashboard abschalten`;
        }
      }
      let shopStand = "nicht angelegt";
      try {
        const aktuell = await vv(eventPfad);
        const vorher = aktuell.underShops ?? [];
        // Nur unsere eigenen Probe-Shops, auch Reste eines früheren Abbruchs — nie, was Konrad angelegt hat.
        const rest = vorher.filter((s) => !String(s.name ?? "").startsWith(`${MARK} Kontingent-Probe`));
        if (rest.length !== vorher.length) {
          await vv(eventPfad, { method: "PUT", body: JSON.stringify({ underShops: rest }) });
          shopStand = `${vorher.length - rest.length} entfernt`;
        }
      } catch (e) {
        shopStand = `NICHT entfernt (${maskiere(e.message)}) — Undershop „${shopName}“ von Hand im Dashboard entfernen`;
      }
      console.log(
        `\nAufgeräumt: ${offen.filter((k) => k.erledigt).length} von ${offen.length} Warenkörben abgebrochen${abgebrochen.length ? ` (${abgebrochen.length} erst beim Aufräumen)` : ""}, Coupon ${coupon}, Undershop ${shopStand}`,
      );
    }

    const passt = ergebnisse.filter((r) => r.ok === r.erwartet).length;
    const drueber = ergebnisse.filter((r) => !r.erwartet);
    const durchgesetzt = drueber.length > 0 && drueber.every((r) => !r.ok);
    console.log(`\nErgebnis: ${passt} von ${ergebnisse.length} Versuchen wie erwartet.`);
    console.log(
      durchgesetzt
        ? "Die Zeilengrenze je Kategorie wird durchgesetzt: JA — ein Coupon für alle Kategorien ist gedeckt."
        : "Die Zeilengrenze je Kategorie wird durchgesetzt: NEIN oder nicht belegt — die Menge je Kategorie müsste am Coupon je Kategorie hängen.",
    );
    if (passt !== ergebnisse.length) process.exitCode = 2;
  },

  /**
   * TAL-019: Was liefert `GET /transactions/{id}`? Prüft, ob die Käufer-Adresse in einem der Felder steht, die
   * `kaeuferAdresse()` liest (email, customer.email, buyer.email), und wie viele Tickets die Transaktion trägt.
   * Nur lesen; gibt weder Adressen noch Ticket-Secrets aus.
   */
  async transaktion() {
    const id = args[1];
    if (!id) throw new Error("Transaktions-Id angeben: … transaktion <transactionId>");
    const tx = await vv(`/transactions/${encodeURIComponent(id)}`);
    console.log(`Felder: ${Object.keys(tx).sort().join(", ")}`);
    const adresse = (o) => (typeof o?.email === "string" && o.email.includes("@") ? "ja" : "nein");
    console.log(`Adresse in email: ${adresse(tx)} · customer.email: ${adresse(tx.customer)} · buyer.email: ${adresse(tx.buyer)}`);
    const tickets = Array.isArray(tx.tickets) ? tx.tickets : null;
    console.log(`Tickets in der Transaktion: ${tickets ? tickets.length : "kein Feld tickets"}`);
    if (!tickets) {
      const zweiter = await vv(`/transactions/${encodeURIComponent(id)}/tickets`).catch((e) => e.message);
      console.log(`GET …/tickets: ${Array.isArray(zweiter) ? zweiter.length + " Tickets" : String(zweiter).slice(0, 200)}`);
    }
    if (tickets?.[0]) console.log(`Felder eines Tickets: ${Object.keys(tickets[0]).sort().join(", ")} (Secret vorhanden: ${tickets[0].secret ? "ja" : "nein"})`);
  },

  /**
   * TAL-019: Welche Extrafelder je Tickettyp? Prüft, ob die Slugs `company` und `position` vorkommen
   * (`BADGE_SLUGS` in lib/vivenu/bestaetigung.ts) und woher die sellerId kommt (Event).
   */
  async datenfelder() {
    const ed = await edition();
    const ev = await vv(`/events/${encodeURIComponent(ed.vivenu_event_id)}`);
    const sellerId = typeof ev.sellerId === "string" ? ev.sellerId : null;
    console.log(`sellerId am Event: ${sellerId ? "ja" : "NEIN — das Rückschreiben ließe Firma und Position weg"}`);
    if (!sellerId) return;
    const typ = args[1] ?? (ev.tickets ?? ev.ticketTypes ?? [])[0]?._id;
    const q = new URLSearchParams({ sellerId, scope: "TICKET", eventId: ed.vivenu_event_id });
    if (typ) q.set("ticketTypeId", typ);
    const res = await vv(`/data-fields/resolve?${q}`);
    const felder = Array.isArray(res) ? res : (res.docs ?? []);
    console.log(`Antwort: ${Array.isArray(res) ? "Liste" : "Objekt mit " + Object.keys(res).join(", ")} · ${felder.length} Felder`);
    for (const f of felder) console.log(`  slug=${JSON.stringify(f.slug)} name=${JSON.stringify(f.name ?? f.label ?? null)} pflicht=${f.required ?? "-"}`);
    const slugs = new Set(felder.map((f) => f.slug));
    for (const s of ["company", "position"]) console.log(`Slug ${s}: ${slugs.has(s) ? "vorhanden" : "FEHLT"}`);
  },

  /**
   * TAL-019: Probe-Rückschreiben an EIN Wegwerf-Ticket (Sandbox, `ZZTEST`-Angaben). Das Secret kommt aus
   * `ticket_secret` und wird nie ausgegeben. Ohne `--apply` nur die Vorschau.
   */
  async personalisieren() {
    if (!sandbox) throw new Error("Nur in der Sandbox (VIVENU_SANDBOX nicht auf false setzen).");
    const id = args[1];
    if (!id) throw new Error("vivenu-Ticket-Id angeben: … personalisieren <vivenuTicketId>");
    const { data: t } = await admin.from("ticket").select("id").eq("vivenu_ticket_id", id).maybeSingle();
    if (!t) throw new Error("Ticket ist im Portal nicht bekannt (erst Webhook oder Sweep abwarten).");
    const { data: sec } = await admin.from("ticket_secret").select("secret").eq("ticket_id", t.id).maybeSingle();
    if (!sec?.secret) throw new Error("Kein Secret gespeichert.");
    const body = { firstname: `${MARK}Vorname`, lastname: `${MARK}Nachname`, extraFields: { company: `${MARK} GmbH`, position: `${MARK} Lead` } };
    console.log(`Würde schreiben an Ticket ${id}: ${JSON.stringify(body)}`);
    if (!apply) return console.log("\n(ohne --apply nichts geschrieben)");
    const res = await vv(`/tickets/personalize/${encodeURIComponent(id)}/${encodeURIComponent(sec.secret)}`, { method: "POST", body: JSON.stringify(body) });
    console.log("Antwort:", JSON.stringify(res).replaceAll(sec.secret, "***").slice(0, 400));
  },

  /** Das Wegwerf-Ticket wieder entwerten. */
  async storno() {
    const id = args[1];
    if (!id) throw new Error("Ticket-Id angeben: … storno <ticketId>");
    const res = await vv(`/tickets/${encodeURIComponent(id)}/invalidate`, { method: "POST" });
    console.log("storniert:", JSON.stringify(res).slice(0, 400));
  },
};

const run = steps[step];
if (!run) {
  console.error(`Unbekannter Schritt "${step}". Bekannt: ${Object.keys(steps).join(", ")}`);
  process.exit(1);
}
console.log(`vivenu ${sandbox ? "Sandbox (vivenu.dev)" : "PRODUKTION (vivenu.com)"} · Schritt ${step}\n`);
await run();
