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
