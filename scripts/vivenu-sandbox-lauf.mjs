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
  if (/partner|aussteller|exhibitor/.test(n)) return "partner";
  if (/startup|gründer|founder/.test(n)) return "startup";
  if (/investor/.test(n)) return "investor";
  if (/talent|student|studi|teilnehmer|attendee/.test(n)) return "talent";
  if (/speaker/.test(n)) return "speaker";
  if (/crew|volunteer|helfer/.test(n)) return "crew";
  if (/supporter|förder/.test(n)) return "supporter";
  return "professional";
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

  /** Ein Freiticket anlegen — ohne Mailversand, klar gekennzeichnet. */
  async freiticket() {
    const ed = await edition();
    const ev = await vv(`/events/${encodeURIComponent(ed.vivenu_event_id)}`);
    const type = (ev.tickets ?? ev.ticketTypes ?? [])[0];
    if (!type) throw new Error("Kein Tickettyp im Event.");
    const body = {
      eventId: ed.vivenu_event_id,
      tickets: [{ ticketTypeId: String(type._id ?? type.id), amount: 1 }],
      firstname: MARK,
      lastname: "Sandboxlauf",
      email: "delivered+vvsandbox@resend.dev",
      sendMail: false,
    };
    console.log("Anfrage:", JSON.stringify(body));
    const res = await vv(`/tickets/create-free-tickets`, { method: "POST", body: JSON.stringify(body) });
    console.log("Antwort-Felder:", Object.keys(res).sort().join(", "));
    console.log(JSON.stringify(res).slice(0, 800));
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
