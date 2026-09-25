/**
 * Testdaten für Konrad in allen Bereichen (Querschnitts-Auftrag F5).
 *
 * Legt Konrads eigenem Konto an, was es braucht, um jedes Portal von innen
 * durchzuklicken: Speaker-Profil mit Session, Partner-Organisation mit
 * Kontaktrolle und gebuchten Leistungen, Volunteer-Bewerbung mit Schicht,
 * dazu die Rollen für Hackathon, Produktion und Speaker-Leads.
 *
 * **Alles ist als Test gekennzeichnet** und rückstandsfrei löschbar:
 *   - Rollen tragen `note = 'testdaten:konrad'`
 *   - angelegte Zeilen tragen den Namenspräfix `TEST — ` bzw. den
 *     Vokabular-Schlüssel `zz_test_bereich`
 *   - Codes und Barcodes beginnen mit `ZZTEST`, Testdateien im Bucket mit
 *     `zztest-`
 *   - `--remove` entfernt genau diese und sonst nichts
 *
 * Aufruf:
 *   node --env-file=.env.local scripts/testdaten-konrad.mjs --dry-run
 *   node --env-file=.env.local scripts/testdaten-konrad.mjs --apply
 *   node --env-file=.env.local scripts/testdaten-konrad.mjs --remove
 *   … --apply --nur=ticket,fotos   (nur diese Schritte, siehe `SCHRITTE`)
 *   … --apply --nur=partner        (Test-Organisation mit allen Format-Produkten,
 *                                   Konrad Hauptkontakt und Standbühnen-Editor, Talk,
 *                                   Öffnungszeiten der Teststandbühne — PART-090)
 *   … --apply --nur=gaeste         (PART-081: ein TEST-Gast der Standbühne, braucht
 *                                   v6_standbuehnen_gaeste und den Schritt partner)
 *   … --apply --nur=talk           (PART-091: verwalteter TEST-Speaker am TEST-Talk,
 *                                   Konrad als Kontakt mit Zugang; braucht
 *                                   v6_talk_speaker_zugang und den Schritt partner)
 *   … --apply --nur=tour-bewerbung (PART-046: Bewerbungen auf die TEST-Tour ohne Mail,
 *                                   Konrad zugesagt, TEST-Person ohne Einwilligung;
 *                                   braucht den Schritt tour)
 *   … --apply --nur=masterclass    (PART-045: TEST-Masterclass im TEST-Raum statt auf
 *                                   der Standbühne, beantragte eigene Frage, Speakerin;
 *                                   braucht partner und talk)
 *   … --apply --nur=buehne         (Test-Bühne, auf der Konrad Stage Lead ist,
 *                                   mit Öffnungszeiten für die Markierung — LEAD-033)
 *   … --apply --nur=standstatus    (LEAD-035/036/037: drei TEST-Sessions auf der
 *                                   Teststandbühne in den Partner-Ständen, braucht
 *                                   den Schritt partner)
 *   … --apply --nur=verwaltet      (PART-091: TEST-Speaker, den der Partner verwaltet —
 *                                   Konrad ist der Kontakt, an den die Mails gehen;
 *                                   braucht v6_talk_speaker_zugang und
 *                                   v6_speaker_mail_weiche sowie den Schritt buehne)
 *   … --apply --nur=assistenz      (SPK-071: Konrad als Assistenz eines TEST-Speakers
 *                                   mit eigener Session — zweites Profil für die
 *                                   Profilwahl im Speaker-Portal; braucht buehne)
 *   … --apply --nur=pipeline       (drei Pipeline-Einträge vor der Zusage, mit
 *                                   Einordnung, Bühne in Frage und Verlauf samt
 *                                   überfälliger Aufgabe — LEAD-039)
 *   … --apply --nur=moderation     (LEAD-042: TEST-Person als Stage Lead ohne
 *                                   Speaker-Profil, für die Moderationssuche)
 *   … --apply --nur=summit         (LEAD-014: Teststandbühne und Test-Keynote
 *                                   vom Hackathon aufs Summit, nichts gelöscht)
 *   … --apply --nur=ticket-zurueck (SPK-068: Freiticket zurueck auf `requested`,
 *                                   damit das Ausstellen im Admin pruefbar ist)
 *   … --email=jemand@chef-treff.de   (Standard: konrad@chef-treff.de)
 *
 * Keine erfundenen Personendaten ausser Konrads eigenen: alle Kontakte und
 * Speaker sind er selbst, Mailadressen Dritter kommen nicht vor.
 */
import { createClient } from "@supabase/supabase-js";
import { url, secretKey, requireEnv } from "./supabase-env.mjs";

requireEnv(true);

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : args.includes("--remove") ? "remove" : "dry-run";
const email = (args.find((a) => a.startsWith("--email="))?.split("=")[1] ?? "konrad@chef-treff.de").toLowerCase();
/**
 * Einzelne Schritte nachziehen. Ein volles `--apply` schreibt Profil,
 * Bewerbungen und Rollen neu und setzt damit zurück, was jemand im Walkthrough
 * inzwischen geändert hat — `--nur` lässt das stehen.
 */
const nur = args.find((a) => a.startsWith("--nur="))?.split("=")[1]?.split(",").filter(Boolean) ?? null;

const MARK = "testdaten:konrad";
const PREFIX = "TEST — ";
const AREA_KEY = "zz_test_bereich";
/** Kürzel im Coupon-Code, damit Testkontingente in vivenu-Listen auffallen. */
const PREFIX_CODE = "ZZTEST";
/** Bucket der Bühnenfotos (`v6_session_grafiken`), privat. */
const SESSION_BUCKET = "session-assets";
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const log = [];
const note = (what, detail = "") => {
  log.push(`${mode === "dry-run" ? "wuerde" : "  ok "}  ${what}${detail ? " — " + detail : ""}`);
};
const fail = (what, err) => log.push(`  !!  ${what} — ${err?.message ?? err}`);

/** Im Trockenlauf wird nichts geschrieben; jede Schreibstelle geht hier durch. */
async function write(what, run) {
  if (mode === "dry-run") {
    note(what);
    return null;
  }
  const { data, error } = await run();
  if (error) {
    fail(what, error);
    return null;
  }
  note(what);
  return data;
}

async function person() {
  const { data } = await admin
    .from("person_email")
    .select("person_id, person:person_id (id, first_name, last_name)")
    .eq("email", email)
    .maybeSingle();
  return data?.person ?? null;
}

async function edition() {
  const { data } = await admin
    .from("event")
    .select("id, name, slug, start_date, end_date, timezone")
    .eq("is_edition", true)
    .order("start_date")
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Das Summit der Edition mit seinen Tagen (LEAD-014). Dort stehen die Bühnen,
 * also gehören auch Test-Keynote und Teststandbühne dorthin. Früher nahmen die
 * Schritte die **früheste** Veranstaltung der Edition — das ist seit dem AI
 * Hackathon (einen Tag vor dem Summit) der Hackathon, und Konrad fand seine
 * Standbühne dort.
 */
async function summit(ed) {
  const { data } = await admin.from("event").select("id, event_day(id, day_date)")
    .eq("edition_id", ed.id).eq("format_tag", "summit").order("start_date").limit(1).maybeSingle();
  if (!data) return null;
  return { id: data.id, tage: [...(data.event_day ?? [])].sort((a, b) => a.day_date.localeCompare(b.day_date)) };
}

/**
 * Rolle mit Kennzeichnung; läuft mit der Edition ab.
 *
 * `role_assignment_uidx` steht auf Ausdrücken (`coalesce(scope_id, …)`) — als
 * `onConflict`-Ziel taugt das nicht, deshalb erst nachsehen, dann schreiben.
 */
async function role(personId, roleKey, scopeType, scopeId, editionId, validTo) {
  const row = {
    person_id: personId,
    role: roleKey,
    scope_type: scopeType,
    scope_id: scopeId,
    edition_id: editionId,
    valid_from: new Date().toISOString(),
    valid_to: validTo,
    note: MARK,
  };
  let query = admin
    .from("role_assignment")
    .select("id")
    .eq("person_id", personId)
    .eq("role", roleKey)
    .eq("scope_type", scopeType);
  query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
  query = editionId ? query.eq("edition_id", editionId) : query.is("edition_id", null);
  const { data: found } = await query.maybeSingle();
  return write(`Rolle ${roleKey}`, () =>
    found
      ? admin.from("role_assignment").update(row).eq("id", found.id)
      : admin.from("role_assignment").insert(row),
  );
}

/** Testrollen laufen einen Tag nach dem Ende der Edition ab. */
function gueltigBis(ed) {
  return ed.end_date ? new Date(new Date(ed.end_date).getTime() + 86400000).toISOString() : null;
}

/**
 * Konrads Test-Organisation und ihre Org-Edition — finden oder anlegen. Gemeinsam
 * für das volle `--apply` und den Schritt `partner`.
 */
async function partnerOrg(ed) {
  let orgId = null;
  const { data: existingOrg } = await admin
    .from("organization")
    .select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`)
    .maybeSingle();
  orgId = existingOrg?.id ?? null;
  if (!orgId && mode === "apply") {
    const { data, error } = await admin
      .from("organization")
      .insert({
        legal_name: `${PREFIX}Partner GmbH`,
        communication_name: `${PREFIX}Partner`,
        type: "corporate",
        website: "https://chef-treff.de",
        description: "Testorganisation für die Feedback-Runden.",
      })
      .select("id")
      .single();
    if (error) fail("Partner-Organisation", error);
    else {
      orgId = data.id;
      note("Partner-Organisation");
    }
  } else if (!orgId) {
    note("Partner-Organisation");
  }
  // Im Trockenlauf gibt es keine neue Id — mit einer Platzhalter-Id laufen die
  // folgenden Schritte trotzdem durch und werden aufgelistet.
  if (!orgId && mode === "dry-run") orgId = "00000000-0000-0000-0000-000000000000";

  let oeId = null;
  if (orgId) {
    const { data: oe } = await admin
      .from("org_edition")
      .select("id")
      .eq("org_id", orgId)
      .eq("edition_id", ed.id)
      .maybeSingle();
    oeId = oe?.id ?? null;
    if (!oeId && mode === "apply") {
      const { data, error } = await admin
        .from("org_edition")
        .insert({
          org_id: orgId,
          edition_id: ed.id,
          onboarding_status: "invited",
          description_de: "Testorganisation für die Feedback-Runden.",
          invoice_email: email,
          sponsoring_level: "premium",
        })
        .select("id")
        .single();
      if (error) fail("Org-Edition", error);
      else {
        oeId = data.id;
        note("Org-Edition");
      }
    } else if (!oeId) {
      note("Org-Edition");
    }
  }
  return { orgId, oeId };
}

/**
 * Konrad als Hauptkontakt. Vorhandene Rollen bleiben stehen, `primary_ops` kommt
 * dazu — ein Nachziehen soll nicht zurücksetzen, was im Walkthrough gesetzt wurde.
 * `cc` schließt `primary_ops` aus (PART-063) und fällt dabei weg.
 */
async function partnerKontakt(me, ed, orgId, validTo) {
  const { data: da } = await admin
    .from("org_membership")
    .select("id, roles")
    .eq("org_id", orgId)
    .eq("person_id", me.id)
    .maybeSingle();
  if (da?.roles?.includes("primary_ops")) {
    note("Partner-Kontakt (Hauptkontakt)", "schon eingetragen");
  } else {
    await write("Partner-Kontakt (Hauptkontakt)", () =>
      da
        ? admin
            .from("org_membership")
            .update({ roles: [...new Set([...(da.roles ?? []).filter((r) => r !== "cc"), "primary_ops"])] })
            .eq("id", da.id)
        : admin
            .from("org_membership")
            .insert({ org_id: orgId, person_id: me.id, roles: ["primary_ops"], contact_position: "Geschäftsführer" }),
    );
  }
  await role(me.id, "partner_contact", "org", orgId, ed.id, validTo);
}

/**
 * Ein Produkt je Menüpunkt der Formate. Welcher Artikel welche Seite öffnet,
 * steht am Produkt (`format_key`, Migration 0110) — hier steht nur die Auswahl,
 * mit Ersatz, falls ein Artikel stillgelegt wird.
 */
const PARTNER_PRODUKTE = {
  booth: "I-50131", // All-Inclusive Stand – General (9qm)
  stage: "I-79895", // Standbühne (18qm), vergibt standbuehne_editor
  masterclass: "I-33783",
  company_tour: "I-85973", // Company Tour Spot
  side_event: "I-81745",
  interview_table: "I-66084",
  hackathon: "I-10729", // Hackathon Stand
  branding: "I-21634", // Partner Branding
  talk: "I-87007", // Main Stage Speaking
};

/**
 * Nur Produkte **ohne Pass-Typ**: ein Pass-Typ legt über `sync_ticket_allocations`
 * ein Ticket-Kontingent ohne `synced_at` an, und der vivenu-Cron machte daraus
 * einen echten Coupon (siehe `ticketAllocation`). Die Format-Produkte tragen
 * keinen; die Sperre bleibt, falls sich das im Produktstamm ändert.
 */
async function partnerProdukte(oeId) {
  const felder = "sku, format_key, pass_type, net_price_cents, active";
  for (const [key, sku] of Object.entries(PARTNER_PRODUKTE)) {
    const { data: wunsch } = await admin.from("product").select(felder).eq("sku", sku).maybeSingle();
    let produkt = wunsch?.active && wunsch.format_key === key ? wunsch : null;
    if (!produkt) {
      const { data: ersatz } = await admin.from("product").select(felder)
        .eq("format_key", key).eq("active", true).is("pass_type", null).order("sku").limit(1).maybeSingle();
      produkt = ersatz ?? null;
    }
    if (!produkt) {
      fail(`Produkt ${key}`, "kein aktives Produkt mit diesem format_key");
      continue;
    }
    if (produkt.pass_type) {
      fail(`Produkt ${key} (${produkt.sku})`, "trägt einen Pass-Typ — würde ein vivenu-Kontingent auslösen, übersprungen");
      continue;
    }
    const { data: gebucht } = await admin.from("org_product").select("id")
      .eq("org_edition_id", oeId).eq("product_sku", produkt.sku).maybeSingle();
    if (gebucht) {
      note(`Produkt ${key} (${produkt.sku})`, "schon gebucht");
      continue;
    }
    await write(`Produkt ${key} (${produkt.sku})`, () =>
      admin.from("org_product").insert({
        org_edition_id: oeId,
        product_sku: produkt.sku,
        qty: 1,
        unit_price_cents: produkt.net_price_cents ?? 0,
        status: "booked",
      }),
    );
  }
}

/**
 * PART-084: ein Test-Stand mit Rückwand-Maßen (Dummy), damit `/partner/messestand`
 * Maße und Standnummer zeigt. Seit 0124 hängt der Stand über `booth_assignment`
 * an der Org-Edition. Ist schon ein Stand zugeordnet, bleibt er, wie er ist —
 * nur ein eigener Test-Stand (`notes = MARK`) bekommt die Dummy-Maße nachgezogen.
 */
async function partnerStand(oeId) {
  const masse = { length_m: 3, width_m: 3, backdrop_w_mm: 3000, backdrop_h_mm: 2500 };
  await write("Messestand mit Rückwand-Maßen (Dummy 3x3 m, Rückwand 3x2,5 m)", async () => {
    const { data: zu } = await admin.from("booth_assignment").select("booth_id")
      .eq("org_edition_id", oeId).limit(1).maybeSingle();
    if (zu) return admin.from("booth").update(masse).eq("id", zu.booth_id).eq("notes", MARK);
    const { data: stand, error } = await admin.from("booth")
      .insert({ booth_number: `${PREFIX_CODE}-01`, ...masse, notes: MARK }).select("id").single();
    if (error) return { data: null, error };
    return admin.from("booth_assignment").insert({ booth_id: stand.id, org_edition_id: oeId, note: MARK });
  });
}

/**
 * Ein Talk der Test-Organisation ohne Slot — so, wie ihn das Team nach der
 * Buchung anlegt. Erst damit zeigt `/partner/talk` einen Termin, an dem Konrad
 * „Speaker eintragen“ durchklickt; ohne Session steht dort nur „wird eingeplant“.
 */
async function partnerTalk(ed, orgId) {
  const eventId = (await summit(ed))?.id ?? ed.id;
  await write("Talk der Test-Organisation (ohne Slot)", async () => {
    const { data: da } = await admin.from("session").select("id")
      .eq("event_id", eventId).eq("title_de", `${PREFIX}Talk`).maybeSingle();
    if (da) return { data: da, error: null };
    return admin.from("session").insert({
      event_id: eventId, format: "talk", partner_org_id: orgId,
      title_de: `${PREFIX}Talk`, title_en: `${PREFIX}Talk`,
      description_de: "Testformat für die Feedback-Runden.",
      description_en: "Test format for the feedback rounds.",
      language: "de", access_mode: "open", publish_status: "draft",
    }).select("id").single();
  });
}

/**
 * Öffnungszeiten der Teststandbühne an den beiden Summit-Tagen (PART-090): das
 * Fenster, in dem Konrad als Partner Slots anlegt und verschiebt. Bewusst anders
 * als der Programmrahmen der Tage (13:00–20:30 und 12:00–19:30), damit zu sehen
 * ist, dass die Zeiten der Bühne gelten; alle Test-Slots liegen darin.
 *
 * Eine Zeile mit eigener Kennzeichnung bekommt die Testzeiten zurück; eine, in
 * der schon jemand Zeiten eingetragen hat (Admin, Gerüst), bleibt, wie sie ist.
 */
const TEST_OEFFNUNGSZEITEN = [
  { open_from: "12:00", open_to: "20:00" },
  { open_from: "11:00", open_to: "19:00" },
];

async function partnerOeffnungszeiten(ed, orgId) {
  const ziel = await summit(ed);
  if (!ziel) return fail("Öffnungszeiten der Teststandbühne", "kein Summit");
  const { data: buehne } = await admin.from("stage").select("id")
    .eq("event_id", ziel.id).eq("slug", "zz-test-standbuehne").eq("partner_org_id", orgId).maybeSingle();
  if (!buehne) {
    // Im Trockenlauf gibt es die Bühne vor dem ersten Lauf noch nicht.
    note("Öffnungszeiten der Teststandbühne", mode === "dry-run" ? "nach dem Anlegen der Bühne" : "keine Teststandbühne");
    return;
  }
  for (const [i, tag] of ziel.tage.slice(0, TEST_OEFFNUNGSZEITEN.length).entries()) {
    const zeiten = TEST_OEFFNUNGSZEITEN[i];
    await write(`Öffnungszeiten Teststandbühne ${tag.day_date}: ${zeiten.open_from}–${zeiten.open_to}`, async () => {
      const { data: da } = await admin.from("stage_day").select("id, open_from, open_to, notes")
        .eq("stage_id", buehne.id).eq("event_day_id", tag.id).maybeSingle();
      if (!da) {
        return admin.from("stage_day").insert({ stage_id: buehne.id, event_day_id: tag.id, ...zeiten, notes: MARK });
      }
      if (da.notes === MARK || (!da.open_from && !da.open_to)) {
        return admin.from("stage_day").update(zeiten).eq("id", da.id);
      }
      return { data: da, error: null };
    });
  }
}

/**
 * Schritt `partner` (Regel „Konrads Konto sieht alles“, 25.09.2026): Konrads
 * Test-Organisation führt alle Produkte, an denen Partner-Seiten hängen, Konrad
 * ist Hauptkontakt und Standbühnen-Editor (Scope Organisation), die
 * Teststandbühne hat Öffnungszeiten, und es gibt einen Talk zum Durchklicken.
 * Idempotent; Profil, Bewerbungen und Tickets bleiben unberührt.
 */
async function partnerSchritt(me, ed) {
  const validTo = gueltigBis(ed);
  const { orgId, oeId } = await partnerOrg(ed);
  if (!orgId) return;
  if (oeId) await partnerProdukte(oeId);
  if (oeId) await partnerStand(oeId);
  await partnerKontakt(me, ed, orgId, validTo);
  await partnerStage(me, ed, orgId, validTo);
  await partnerOeffnungszeiten(ed, orgId);
  await partnerTalk(ed, orgId);
}

async function apply(me, ed) {
  const validTo = gueltigBis(ed);

  if (!me.first_name || !me.last_name) {
    await write("Name ergänzt (war leer)", () =>
      admin.from("person").update({ first_name: "Konrad", last_name: "Gruner" }).eq("id", me.id),
    );
  }

  // --- Speaker ------------------------------------------------------------
  await write("Speaker-Profil", () =>
    admin.from("speaker_profile").upsert(
      {
        person_id: me.id,
        edition_id: ed.id,
        speaker_type: "keynote",
        pipeline_status: "confirmed",
        // Beides setzen. Der Ticket-Trigger fragt `pipeline_status`, der
        // Swapcard-Export `confirmed_at` — ohne den Zeitstempel bekaeme das
        // Testprofil ein Ticket, fehlte aber im Export in die Event-App
        // (gefunden bei der Kettenpruefung SPK-068 am 25.09.2026).
        confirmed_at: new Date().toISOString(),
        job_title: "Geschäftsführer",
        organization_name: "ChefTreff",
        bio_short_de: "Testprofil für die Feedback-Runden.",
        bio_short_en: "Test profile for the feedback rounds.",
        reception_eligible: true,
        lounge_access: true,
        pass_type: "speaker",
        hospitality_status: "eligible",
        travel_costs_covered: true,
        internal_notes: MARK,
      },
      { onConflict: "person_id,edition_id" },
    ),
  );
  await role(me.id, "speaker", "edition", null, ed.id, validTo);
  await role(me.id, "speaker_manager", "edition", null, ed.id, validTo);

  // --- Partner ------------------------------------------------------------
  const { orgId, oeId } = await partnerOrg(ed);
  if (orgId) {
    // Gebuchte Leistungen: damit im Partner-Menü Tickets, Bühne und Shop auftauchen.
    if (oeId && mode === "apply") {
      const { data: products } = await admin
        .from("product")
        .select("sku, net_price_cents, pass_type, grants_role")
        .eq("active", true)
        .or("pass_type.not.is.null,grants_role.not.is.null")
        .limit(4);
      for (const p of products ?? []) {
        const { data: exists } = await admin
          .from("org_product")
          .select("id")
          .eq("org_edition_id", oeId)
          .eq("product_sku", p.sku)
          .maybeSingle();
        if (exists) continue;
        const { error } = await admin.from("org_product").insert({
          org_edition_id: oeId,
          product_sku: p.sku,
          qty: 5,
          unit_price_cents: p.net_price_cents ?? 0,
          status: "booked",
        });
        if (error) fail(`Leistung ${p.sku}`, error);
      }
      note("Gebuchte Leistungen", `${(products ?? []).length} Produkte`);
    } else if (oeId) {
      note("Gebuchte Leistungen");
    }

    // Alle Formate (Regel „Konrads Konto sieht alles“) — derselbe Weg wie `--nur=partner`.
    if (oeId) await partnerProdukte(oeId);
    if (oeId) await partnerStand(oeId);
    await partnerKontakt(me, ed, orgId, validTo);
  }

  // --- Volunteers ---------------------------------------------------------
  await write("Vokabular-Bereich (Test)", () =>
    admin.from("vocab_term").upsert(
      {
        vocabulary: "volunteer_area",
        key: AREA_KEY,
        label_de: `${PREFIX}Bereich`,
        label_en: `${PREFIX}area`,
        sort_order: 999,
      },
      { onConflict: "vocabulary,key" },
    ),
  );
  const prof = await write("Volunteer-Bewerbung (angenommen)", () =>
    admin
      .from("volunteer_profile")
      .upsert(
        {
          person_id: me.id,
          edition_id: ed.id,
          status: "accepted",
          shirt_size: "L",
          areas: [AREA_KEY],
          availability: { note: "Testdaten für die Feedback-Runden." },
          notes_internal: MARK,
        },
        { onConflict: "person_id,edition_id" },
      )
      .select("id")
      .maybeSingle(),
  );
  await role(me.id, "volunteer", "edition", null, ed.id, validTo);

  if (mode === "apply" && prof) {
    const { data: day } = await admin
      .from("event_day")
      .select("id, event_id, day_date")
      .order("day_date")
      .limit(1)
      .maybeSingle();
    const start = day ? new Date(`${day.day_date}T09:00:00Z`) : new Date(Date.now() + 7 * 86400000);
    const { data: known } = await admin
      .from("shift")
      .select("id")
      .eq("area", AREA_KEY)
      .eq("edition_id", ed.id)
      .maybeSingle();
    const { data: shift, error } = known
      ? { data: known, error: null }
      : await admin
          .from("shift")
          .insert({
            edition_id: ed.id,
            event_day_id: day?.id ?? null,
            area: AREA_KEY,
            position: `${PREFIX}Einlass`,
            start_at: start.toISOString(),
            end_at: new Date(start.getTime() + 4 * 3600000).toISOString(),
            capacity: 3,
            overbook: 1,
            location: "Halle A · Eingang Nord",
            briefing_md: "Testschicht für die Feedback-Runden. Weste am Infostand abholen.",
          })
          .select("id")
          .maybeSingle();
    if (error) fail("Testschicht", error);
    else if (shift) {
      await write("Schicht-Zuteilung", () =>
        admin
          .from("shift_assignment")
          .upsert({ shift_id: shift.id, person_id: me.id, status: "assigned" }, { onConflict: "shift_id,person_id" }),
      );
    }
  } else {
    note("Testschicht und Zuteilung");
  }

  // --- Hackathon und Produktion ------------------------------------------
  await role(me.id, "hackathon_participant", "edition", null, ed.id, validTo);
  await role(me.id, "production_team", "edition", null, ed.id, validTo);

  // --- Nachtrag: die Wege, die der F4-Abgleich nicht auslösen konnte -------
  // Ticket-Kontingent, eigene Session, Standbühne und eine Bewerbung. Ohne sie
  // zeigen `/partner/tickets`, `/speaker/session`, `/partner/buehne` und
  // `/partner/bewerber` nur ihren Leerzustand — richtig gebaut, aber nicht
  // beurteilbar.
  if (orgId) await ticketAllocation(me, ed, orgId);
  // Vor dem Anlegen: sonst entstünde am Summit eine zweite Test-Keynote neben
  // der alten am Hackathon (LEAD-014).
  await umzugSummit(me, ed);
  await ownSession(me, ed);
  // SPK-063/064: ohne sie zeigen `/speaker/tickets` nur „wird ausgestellt"
  // und „Deine Bilder" nur den Leerzustand.
  await speakerTicket(me, ed);
  await stagePhotos(me, ed);
  if (orgId) await partnerStage(me, ed, orgId, validTo);
  if (orgId) await partnerOeffnungszeiten(ed, orgId);
  if (orgId) await partnerTalk(ed, orgId);
  if (orgId) await formatApplication(me, ed, orgId);
}

/**
 * Ein Kontingent je Pass-Typ, damit `/partner/tickets` Codes, Einlöse-Stand
 * **und** den Weg „mehr anfragen" zeigt.
 *
 * Wichtig: `synced_at` wird gesetzt. `ticket_allocations_pending()` nimmt alles
 * mit, was `status in ('pending_vivenu','error')` **oder** `synced_at is null`
 * hat — ohne den Zeitstempel würde der nächste Cron-Lauf für diese Testzeile
 * einen echten Coupon in vivenu anlegen. Der Code hier existiert nur in der
 * Datenbank und ist am Präfix ZZTEST erkennbar; einlösbar ist er nicht.
 */
async function ticketAllocation(me, ed, orgId) {
  const { data: oe } = await admin
    .from("org_edition").select("id").eq("org_id", orgId).eq("edition_id", ed.id).maybeSingle();
  const paesse = [
    { pass_type: "partner", quantity: 5 },
    { pass_type: "talent", quantity: 5 },
  ];
  for (const p of paesse) {
    await write(`Ticket-Kontingent ${p.pass_type}`, async () => {
      const { data: da } = await admin.from("org_ticket_allocation").select("id")
        .eq("org_id", orgId).eq("event_id", ed.id).eq("pass_type", p.pass_type).maybeSingle();
      if (da) return { data: da, error: null };
      return admin.from("org_ticket_allocation").insert({
        event_id: ed.id, org_id: orgId, org_edition_id: oe?.id ?? null,
        pass_type: p.pass_type, quantity: p.quantity,
        coupon_code: `FLS27-${PREFIX_CODE}-${p.pass_type.toUpperCase()}`,
        used_count: 0, status: "active", synced_at: new Date().toISOString(), notes: MARK,
      }).select("id").single();
    });
  }
}

/**
 * Eine Session mit Konrad als Speaker. Erst damit zeigt `/speaker/session`
 * Inhalte, Frist und Upload statt „Noch keine Session".
 */
async function ownSession(me, ed) {
  const eventId = (await summit(ed))?.id ?? ed.id;
  await write("Session mit Konrad als Speaker", async () => {
    const { data: da } = await admin.from("session").select("id")
      .eq("event_id", eventId).eq("title_de", `${PREFIX}Keynote`).maybeSingle();
    let sessionId = da?.id ?? null;
    if (!sessionId) {
      const { data, error } = await admin.from("session").insert({
        event_id: eventId, format: "keynote",
        title_de: `${PREFIX}Keynote`, title_en: `${PREFIX}Keynote`,
        description_de: "Testsession für die Feedback-Runden.",
        description_en: "Test session for the feedback rounds.",
        language: "de", access_mode: "open", publish_status: "draft",
      }).select("id").single();
      if (error) return { data: null, error };
      sessionId = data.id;
    }
    // Der Primärschlüssel ist (session_id, person_id, role) — die Rolle gehört dazu.
    return admin.from("session_speaker")
      .upsert({ session_id: sessionId, person_id: me.id, role: "speaker", confirmed: true },
              { onConflict: "session_id,person_id,role" });
  });
}

/**
 * SPK-063: Konrads eigenes Speaker-Ticket als ausgestellt, damit
 * `/speaker/tickets` die Ticketkarte mit QR-Code zeigt statt „wird
 * ausgestellt".
 *
 * Das Freiticket legt der Trigger auf `speaker_profile` selbst an, sobald das
 * Profil `confirmed` ist (0034). Hier wird es nur so gesetzt, wie
 * `set_ticket_issued` es täte — **ohne vivenu**: der Barcode beginnt mit
 * ZZTEST, `vivenu_ticket_id` und Secret bleiben leer. Deshalb endet „Zur
 * Wallet hinzufügen" beim Testticket in „not found" (`my_ticket_wallet_link`
 * → `ticket_not_issued`); ein über vivenu ausgestelltes Ticket führt auf
 * seine vivenu-Seite.
 *
 * `team_note` bleibt leer: die Spalte ist der Hinweis des Teams **an den
 * Anfragenden**, keine Kennzeichnung. Erkennbar ist das Testticket am Barcode
 * und daran, dass es am Testprofil hängt — daran hält sich auch `--remove`.
 *
 * Nach aussen geht davon nichts: der vivenu-Abgleich liest nur ein und findet
 * Zeilen über `vivenu_ticket_id`, und eine Ausstellung über die vivenu-API
 * (A7b) gibt es noch nicht.
 */
async function speakerTicket(me, ed) {
  const { data: sp } = await admin.from("speaker_profile").select("id")
    .eq("person_id", me.id).eq("edition_id", ed.id).maybeSingle();
  if (!sp) {
    // Im Trockenlauf ohne Profil gibt es auch noch kein Freiticket.
    if (mode === "dry-run") note("Speaker-Ticket ausgestellt (Testbarcode)");
    else fail("Speaker-Ticket", "kein Speaker-Profil");
    return;
  }
  const { data: t, error } = await admin.from("ticket").select("id, status, barcode")
    .eq("speaker_profile_id", sp.id).eq("source", "speaker").neq("status", "cancelled").maybeSingle();
  if (error) return fail("Speaker-Ticket", error);
  if (!t) return fail("Speaker-Ticket", "keins angelegt — Trigger auf speaker_profile prüfen");
  if (t.barcode) {
    // Ein echter Barcode wird nie überschrieben.
    return note("Speaker-Ticket", t.barcode.startsWith(PREFIX_CODE) ? "schon ausgestellt" : "echtes Ticket, nicht angefasst");
  }
  if (t.status !== "requested") return fail("Speaker-Ticket", `Status ${t.status}, erwartet requested`);
  await write("Speaker-Ticket ausgestellt (Testbarcode)", () =>
    admin.from("ticket").update({
      status: "valid",
      barcode: `${PREFIX_CODE}-SPK-${t.id.slice(0, 8).toUpperCase()}`,
      purchased_at: new Date().toISOString(),
    }).eq("id", t.id).is("barcode", null),
  );
}

/**
 * SPK-064: drei Bühnenfotos an der Testsession, damit „Deine Bilder" Raster,
 * Bildnachweis und Download zeigt.
 *
 * Die Bilder sind gezeichnete Platzhalter — Bühne, Licht, Pult, kein Mensch,
 * kein fremdes Foto. Zwei im Quer-, eines im Hochformat: das Raster schneidet
 * auf 16:9 zu, und wie ein Hochformat dabei aussieht, soll man sehen.
 *
 * Pfad wie in `/api/admin/session-assets`: `<session>/stage_photo/<datei>` —
 * nur so lässt die Bucket-Policy (`session_asset_path_allowed`) die Speakerin
 * lesen. Die Zeile entsteht direkt statt über `register_session_asset`: die
 * RPC verlangt Marketing-Rechte am Nutzerkonto und schickt beim ersten Foto
 * `stage_photos_ready` an alle Speaker der Session; Testdaten lösen keine
 * Mails aus.
 */
async function stagePhotos(me, ed) {
  const eventId = (await summit(ed))?.id ?? ed.id;
  const { data: se } = await admin.from("session").select("id")
    .eq("event_id", eventId).eq("title_de", `${PREFIX}Keynote`).maybeSingle();
  if (!se) {
    if (mode === "dry-run") note("Bühnenfotos 1–3 an der Testsession");
    else fail("Bühnenfotos", "Testsession fehlt");
    return;
  }
  const fotos = [
    { n: 1, w: 1800, h: 1200, credit: "ChefTreff (Testbild)" },
    { n: 2, w: 1920, h: 1080, credit: "ChefTreff (Testbild)" },
    // Ohne Nachweis: so sieht man auch die Karte, der die Zeile fehlt.
    { n: 3, w: 1200, h: 1800, credit: null },
  ];
  let sharp = null;
  for (const f of fotos) {
    const path = `${se.id}/stage_photo/zztest-buehnenfoto-${f.n}.png`;
    const { data: da } = await admin.from("session_asset").select("id").eq("storage_path", path).maybeSingle();
    if (da) {
      note(`Bühnenfoto ${f.n}`, "schon da");
      continue;
    }
    await write(`Bühnenfoto ${f.n} (${f.w}×${f.h})`, async () => {
      // Erst hier laden: `sharp` kommt über Next mit, steht aber nicht in
      // unserer package.json — fehlt es, scheitert nur dieser Schritt.
      sharp ??= (await import("sharp")).default;
      const png = await sharp(Buffer.from(platzhalterSvg(f))).png().toBuffer();
      const { error: upErr } = await admin.storage.from(SESSION_BUCKET)
        .upload(path, png, { contentType: "image/png", upsert: true });
      if (upErr) return { data: null, error: upErr };
      const { data: letzte } = await admin.from("session_asset").select("version")
        .eq("session_id", se.id).eq("kind", "stage_photo").order("version", { ascending: false }).limit(1).maybeSingle();
      const res = await admin.from("session_asset").insert({
        session_id: se.id, kind: "stage_photo", storage_path: path,
        filename: `${PREFIX}Bühnenfoto ${f.n}.png`, mime: "image/png", size_bytes: png.length,
        width: f.w, height: f.h, cutout: false, credit: f.credit,
        version: (letzte?.version ?? 0) + 1, is_current: true, uploaded_by: me.id,
      });
      // Keine Datei ohne Zeile zurücklassen (wie die Upload-Route).
      if (res.error) await admin.storage.from(SESSION_BUCKET).remove([path]);
      return res;
    });
  }
}

/** Ein gezeichnetes Bühnenbild mit deutlicher Aufschrift „Testbild". */
function platzhalterSvg({ n, w, h }) {
  const kante = Math.round(h * 0.7);
  const pultB = Math.round(w * 0.12);
  const pultH = Math.round(h * 0.2);
  const pultX = Math.round(w / 2 - pultB / 2);
  // Nach der Breite bemessen, sonst läuft die Zeile im Hochformat über den Rand.
  const gross = Math.round(Math.min(w * 0.05, h * 0.075));
  // Die Aufschrift steht über der Mitte: das Raster schneidet auf 16:9 zu,
  // beim Hochformat fällt die Bühnenkante weg, die Aufschrift bleibt.
  const zeile = Math.round(h * 0.42);
  const klein = Math.round(gross * 0.45);
  const kegel = (x) =>
    `<polygon points="${x - w * 0.02},0 ${x + w * 0.02},0 ${x + w * 0.16},${kante} ${x - w * 0.16},${kante}" fill="url(#licht)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="grund" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#081a35"/><stop offset="1" stop-color="#4a4ac5"/>
    </linearGradient>
    <linearGradient id="licht" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#grund)"/>
  ${kegel(w * 0.25)}${kegel(w * 0.5)}${kegel(w * 0.75)}
  <rect x="0" y="${kante}" width="${w}" height="${h - kante}" fill="#081a35"/>
  <rect x="${pultX}" y="${kante - pultH}" width="${pultB}" height="${pultH}" rx="${Math.round(pultB * 0.06)}" fill="#6262dc"/>
  <text x="${w / 2}" y="${zeile}" text-anchor="middle" fill="#ffffff"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${gross}">TESTBILD · Bühnenfoto ${n}</text>
  <text x="${w / 2}" y="${zeile + klein * 1.8}" text-anchor="middle" fill="#ffffff" fill-opacity="0.8"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${klein}">${PREFIX}Keynote · keine echte Aufnahme · ${w}×${h}</text>
</svg>`;
}

/**
 * Eine Standbühne der Test-Organisation. `my_partner_stages()` verlangt
 * zusätzlich die Rolle `standbuehne_editor` **im Scope der Organisation** —
 * eine globale Rolle genügt der Funktion nicht.
 */
async function partnerStage(me, ed, orgId, validTo) {
  const eventId = (await summit(ed))?.id ?? ed.id;
  await write("Standbühne der Test-Organisation", async () => {
    const { data: da } = await admin.from("stage").select("id")
      .eq("event_id", eventId).eq("slug", "zz-test-standbuehne").maybeSingle();
    if (da) return { data: da, error: null };
    return admin.from("stage").insert({
      event_id: eventId, name: `${PREFIX}Standbühne`, slug: "zz-test-standbuehne",
      // `stage_type_check` kennt main/side/partner_booth/room — nicht „partner".
      type: "partner_booth", partner_org_id: orgId, capacity: 30,
      default_duration_min: 20, partner_slot_quota: 4, active: true,
    }).select("id").single();
  });
  await role(me.id, "standbuehne_editor", "org", orgId, ed.id, validTo);
}

/**
 * Eine Masterclass mit Bewerbung — Konrad bewirbt sich bei sich selbst, damit
 * `/partner/bewerber` eine Zeile zeigt. Erfundene Dritte kommen nicht vor
 * (siehe Kopf).
 */
async function formatApplication(me, ed, orgId) {
  const eventId = (await summit(ed))?.id ?? ed.id;

  // Veröffentlichen verlangt einen Slot (Trigger „publish requires a slot") —
  // zu Recht: ein Format ohne Bühne und Zeit hat im Programm nichts verloren.
  // Der Slot liegt auf der Teststandbühne und wird mit ihr entfernt.
  const { data: st } = await admin.from("stage").select("id")
    .eq("event_id", eventId).eq("slug", "zz-test-standbuehne").maybeSingle();
  const { data: tag } = await admin.from("event_day").select("id, day_date")
    .eq("event_id", eventId).order("day_date").limit(1).maybeSingle();

  await write("Masterclass mit einer Bewerbung", async () => {
    const { data: da } = await admin.from("session").select("id")
      .eq("event_id", eventId).eq("title_de", `${PREFIX}Masterclass`).maybeSingle();
    let sessionId = da?.id ?? null;
    if (!sessionId) {
      let slotId = null;
      if (st && tag) {
        const start = new Date(`${tag.day_date}T14:00:00Z`).toISOString();
        const ende = new Date(`${tag.day_date}T15:00:00Z`).toISOString();
        const { data: vorhanden } = await admin.from("slot").select("id")
          .eq("stage_id", st.id).eq("event_day_id", tag.id).eq("start_at", start).maybeSingle();
        if (vorhanden) slotId = vorhanden.id;
        else {
          const { data: sl, error: se } = await admin.from("slot").insert({
            stage_id: st.id, event_day_id: tag.id, start_at: start, end_at: ende,
            slot_type: "partner_block", status: "confirmed", internal_title: `${PREFIX}Masterclass`,
          }).select("id").single();
          if (se) return { data: null, error: se };
          slotId = sl.id;
        }
      }
      const { data, error } = await admin.from("session").insert({
        event_id: eventId, format: "masterclass", host_org_id: orgId, slot_id: slotId,
        title_de: `${PREFIX}Masterclass`, title_en: `${PREFIX}Masterclass`,
        description_de: "Testformat für die Feedback-Runden.",
        description_en: "Test format for the feedback rounds.",
        language: "de", access_mode: "application",
        publish_status: slotId ? "published" : "draft",
        capacity: 12,
        application_deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      }).select("id").single();
      if (error) return { data: null, error };
      sessionId = data.id;
    }
    return admin.from("application")
      .upsert({ session_id: sessionId, person_id: me.id, status: "applied",
                answers: { motivation: "Testbewerbung für die Feedback-Runden." },
                consent_share: true },
              { onConflict: "session_id,person_id" });
  });
}

/**
 * SPK-068: Konrads Freiticket zurueck auf `requested`, damit er das Ausstellen
 * im Admin **wirklich** durchklicken kann.
 *
 * Nimmt nur Testdaten zurueck: ein Barcode ohne unser Praefix ist ein echtes
 * vivenu-Ticket und bleibt unberuehrt — sonst stuende ein gueltiges Ticket
 * ploetzlich wieder auf „angefragt" und jemand stellte es ein zweites Mal aus.
 * Secret und vivenu-Kennungen gehen mit zurueck, weil der naechste Lauf sie neu
 * holt.
 */
/**
 * Konrads Freiticket zurueck auf `requested`, damit er „Ausstellen" selbst
 * druecken kann (SPK-068, Regel „Konrads Konto sieht alles" vom 25.09.2026).
 *
 * Auch **nach einem echten Lauf**: dann traegt die Zeile ein echtes
 * vivenu-Ticket. Das wird vorher bei vivenu **storniert** — sonst bliebe dort
 * eine gueltige Karte ohne Gegenstueck bei uns, und die Idempotenz ueber
 * `batchId` gaebe sie beim naechsten Klick wieder aus. Storniert wird
 * **ausschliesslich**, was unser eigener Weg angelegt hat: `GET /tickets/{id}`
 * muss `batch` = unsere Ticket-Kennung zeigen. Ein Ticket, das jemand im
 * vivenu-Dashboard ausgestellt hat, bleibt unberuehrt.
 *
 * Der Status `cancelled` gehoert dazu: der Webhook `ticket.updated` traegt ein
 * Storno bei uns als `cancelled` ein, und genau in diesem Zustand steht die
 * Zeile nach einer Kettenpruefung.
 */
async function ticketZurueck(me, ed) {
  const { data: sp } = await admin.from("speaker_profile").select("id")
    .eq("person_id", me.id).eq("edition_id", ed.id).maybeSingle();
  if (!sp) return fail("Ticket zurueck", "kein Speaker-Profil");
  const { data: alle, error } = await admin.from("ticket")
    .select("id, status, barcode, vivenu_ticket_id")
    .eq("speaker_profile_id", sp.id).eq("source", "speaker").order("created_at");
  if (error) return fail("Ticket zurueck", error);
  const t = (alle ?? []).find((x) => x.status !== "cancelled") ?? (alle ?? [])[0];
  if (!t) return fail("Ticket zurueck", "kein Freiticket gefunden");
  if (t.status === "requested" && !t.barcode && !t.vivenu_ticket_id) {
    return note("Ticket zurueck", "steht schon auf requested");
  }

  // Echtes vivenu-Ticket: erst dort aufraeumen, sonst nicht anfassen.
  const echt = Boolean(t.vivenu_ticket_id) || Boolean(t.barcode && !t.barcode.startsWith(PREFIX_CODE));
  if (echt) {
    const schluessel = process.env.VIVENU_API_KEY?.trim();
    if (!schluessel) return note("Ticket zurueck", "echtes vivenu-Ticket, aber kein VIVENU_API_KEY — nicht angefasst");
    if (!t.vivenu_ticket_id) return note("Ticket zurueck", "echter Barcode ohne vivenu-Kennung — nicht angefasst");
    const basis = process.env.VIVENU_SANDBOX?.trim().toLowerCase() === "false"
      ? "https://vivenu.com/api" : "https://vivenu.dev/api";
    const kopf = { authorization: `Bearer ${schluessel}`, "content-type": "application/json" };
    const lesen = await fetch(`${basis}/tickets/${encodeURIComponent(t.vivenu_ticket_id)}`, { headers: kopf });
    if (lesen.status === 404) {
      note("Ticket zurueck", `vivenu kennt ${t.vivenu_ticket_id} nicht mehr — nur unsere Zeile wird geleert`);
    } else if (!lesen.ok) {
      return fail("Ticket zurueck", `vivenu ${lesen.status} beim Lesen von ${t.vivenu_ticket_id}`);
    } else {
      const karte = await lesen.json();
      if (String(karte.batch ?? "") !== t.id) {
        return note("Ticket zurueck", `vivenu-Ticket ${t.vivenu_ticket_id} stammt nicht aus unserem Weg (batch fremd) — nicht angefasst`);
      }
      if (String(karte.status ?? "").toUpperCase() !== "INVALID") {
        const weg = await write(`vivenu-Ticket ${t.vivenu_ticket_id} storniert`, async () => {
          const r = await fetch(`${basis}/tickets/${encodeURIComponent(t.vivenu_ticket_id)}/invalidate`, { method: "POST", headers: kopf });
          return r.ok ? {} : { error: new Error(`vivenu ${r.status}`) };
        });
        if (weg?.error) return;
      }
    }
  }

  await write("Freiticket zurueck auf requested", async () => {
    const zurueck = await admin.from("ticket").update({
      status: "requested", barcode: null, vivenu_ticket_id: null,
      vivenu_transaction_id: null, vivenu_customer_id: null, purchased_at: null,
    }).eq("id", t.id);
    if (zurueck.error) return zurueck;
    // Ohne das bliebe ein Secret liegen, das zu keinem Ticket mehr gehoert.
    return admin.from("ticket_secret").delete().eq("ticket_id", t.id);
  });
}

/**
 * LEAD-031 (und das Board der Stage Leads): eine Test-Bühne am Summit, auf der
 * Konrad **Stage Lead** ist — `speaker_manager` mit Scope auf genau diese Bühne.
 * Erst damit zeigt `/speaker-leads/regie` die Sicht einer Bühnenleitung: seine
 * eigenen Slots, die Anweisungen bearbeitbar, keine Zeiten. Als Admin sähe er
 * sonst alle Bühnen.
 *
 * Drei Slots an den Summit-Tagen, einer davon mit einer TEST-Session (Entwurf),
 * einer ohne Session — so sieht man auch die leere Zeile. Alles am Präfix
 * `TEST — ` bzw. am Slug `zz-test-stagelead` erkennbar, `--remove` räumt es ab.
 */
async function stageLeadBuehne(me, ed) {
  const validTo = ed.end_date ? new Date(new Date(ed.end_date).getTime() + 86400000).toISOString() : null;
  const ziel = await summit(ed);
  const tage = ziel?.tage ?? [];
  if (!ziel || tage.length === 0) return fail("Stage-Lead-Bühne", "kein Summit mit Tagen");

  const { data: da } = await admin.from("stage").select("id").eq("slug", "zz-test-stagelead").maybeSingle();
  let stageId = da?.id ?? null;
  if (!stageId) {
    if (mode === "dry-run") {
      note("Stage-Lead-Bühne mit drei Slots und Rolle");
      return;
    }
    const { data, error } = await admin.from("stage").insert({
      event_id: ziel.id, name: `${PREFIX}Bühne Stage Lead`, slug: "zz-test-stagelead",
      type: "side", capacity: 80, default_duration_min: 30, active: true,
    }).select("id").single();
    if (error) return fail("Stage-Lead-Bühne", error);
    stageId = data.id;
    note("Stage-Lead-Bühne");
  } else {
    note("Stage-Lead-Bühne", "schon da");
  }

  // In der Programmzeit (Freitag ab 13, Samstag ab 12 Uhr). Bis 25.09. lagen
  // die Slots um 10 Uhr und standen damit ausserhalb des Board-Rasters.
  const slots = [
    { tag: tage[0], von: "15:00", bis: "15:30", titel: `${PREFIX}Stage-Lead-Talk` },
    { tag: tage[0], von: "16:00", bis: "16:45", titel: null },
    { tag: tage[tage.length - 1], von: "14:00", bis: "14:30", titel: `${PREFIX}Stage-Lead-Panel` },
  ];
  for (const sl of slots) {
    // Ortszeit Hamburg im April: UTC+2.
    const start = new Date(`${sl.tag.day_date}T${sl.von}:00+02:00`).toISOString();
    const ende = new Date(`${sl.tag.day_date}T${sl.bis}:00+02:00`).toISOString();
    const titel = sl.titel ?? `${PREFIX}offener Slot`;
    await write(`Slot ${sl.tag.day_date} ${sl.von}`, async () => {
      // Am Titel wiederfinden, nicht an der Uhrzeit: so zieht ein älterer Lauf
      // mit anderen Zeiten nach, statt einen zweiten Slot zu bekommen.
      const { data: vorhanden } = await admin.from("slot").select("id, start_at, end_at")
        .eq("stage_id", stageId).eq("event_day_id", sl.tag.id).eq("internal_title", titel).maybeSingle();
      let slotId = vorhanden?.id ?? null;
      if (slotId && (Date.parse(vorhanden.start_at) !== Date.parse(start) || Date.parse(vorhanden.end_at) !== Date.parse(ende))) {
        const { error } = await admin.from("slot").update({ start_at: start, end_at: ende }).eq("id", slotId);
        if (error) return { data: null, error };
      }
      if (!slotId) {
        const { data, error } = await admin.from("slot").insert({
          stage_id: stageId, event_day_id: sl.tag.id, start_at: start, end_at: ende,
          slot_type: "content", status: "open", internal_title: titel,
        }).select("id").single();
        if (error) return { data: null, error };
        slotId = data.id;
      }
      if (!sl.titel) return { data: slotId, error: null };
      const { data: se } = await admin.from("session").select("id").eq("slot_id", slotId).maybeSingle();
      if (se) return { data: se.id, error: null };
      return admin.from("session").insert({
        event_id: ziel.id, slot_id: slotId, format: "talk",
        title_de: sl.titel, title_en: sl.titel, language: "de", access_mode: "open", publish_status: "draft",
      }).select("id").single();
    });
  }
  // LEAD-033: Öffnungszeiten, enger als das Programm (Freitag 13:00–20:30,
  // Samstag 12:00–19:30) — sonst läge die Schraffur außerhalb des Rasters, und
  // Konrad sähe die Markierung nicht. Die drei Slots oben liegen darin.
  const oeffnungen = [
    { tag: tage[0], von: "14:00", bis: "19:00" },
    { tag: tage[tage.length - 1], von: "13:00", bis: "18:00" },
  ];
  for (const o of oeffnungen) {
    await write(`Öffnungszeit Stage-Lead-Bühne ${o.tag.day_date} ${o.von}–${o.bis}`, () =>
      admin.from("stage_day").upsert(
        { stage_id: stageId, event_day_id: o.tag.id, open_from: o.von, open_to: o.bis, notes: MARK },
        { onConflict: "stage_id,event_day_id" },
      ),
    );
  }
  await role(me.id, "speaker_manager", "stage", stageId, ed.id, validTo);
}

/**
 * LEAD-035/036/037: die Partner-Sicht im Board. Auf der Teststandbühne drei
 * TEST-Sessions in den Ständen „In Bearbeitung“, „Zur Freigabe“ und
 * „Zurückgegeben“ (Rückmeldung der Programmleitung als
 * `partner_session_return`), Tag 1, 17:30–18:50 Uhr Hamburg — frei neben der
 * Test-Masterclass (16–17 Uhr) und im alten wie im neuen Fenster der
 * Standbühne (PART-079/090). Gastgeberin ist die Test-Organisation: nur dann
 * nimmt `partner_request_publish` die Anfrage an. Der zurückgegebenen Session
 * fehlt der englische Titel — so zeigt das Schubfach, was für die Anfrage fehlt.
 * Konrads eigene Slots und Sessions auf der Bühne bleiben unberührt; `--remove`
 * nimmt die Sessions mit dem Präfix und die Bühne samt Slots.
 */
async function standStatus(me, ed) {
  const ziel = await summit(ed);
  const tag = ziel?.tage?.[0];
  if (!ziel || !tag) return fail("Stand-Status", "kein Summit mit Tagen");
  const { data: org } = await admin.from("organization").select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`).maybeSingle();
  if (!org) return fail("Stand-Status", "Test-Organisation fehlt — zuerst --nur=partner");
  const { data: st } = await admin.from("stage").select("id")
    .eq("event_id", ziel.id).eq("slug", "zz-test-standbuehne").maybeSingle();
  if (!st) return fail("Stand-Status", "keine Teststandbühne — zuerst --nur=partner");

  const eintraege = [
    { von: "17:30", bis: "17:50", titel: `${PREFIX}Standbühne in Bearbeitung`, stand: "draft", titelEn: true },
    { von: "18:00", bis: "18:20", titel: `${PREFIX}Standbühne zur Freigabe`, stand: "review", titelEn: true },
    {
      von: "18:30", bis: "18:50", titel: `${PREFIX}Standbühne zurückgegeben`, stand: "draft", titelEn: false,
      rueckgabe: "TEST — Bitte den englischen Titel ergänzen.",
    },
  ];
  for (const e of eintraege) {
    // Ortszeit Hamburg im April: UTC+2.
    const start = new Date(`${tag.day_date}T${e.von}:00+02:00`).toISOString();
    const ende = new Date(`${tag.day_date}T${e.bis}:00+02:00`).toISOString();
    await write(`Standbühne ${e.von}: ${e.titel}`, async () => {
      // Am Titel wiederfinden, nicht an der Uhrzeit — ein zweiter Lauf legt
      // nichts doppelt an und setzt den Stand zurück.
      const { data: da } = await admin.from("session").select("id, slot_id")
        .eq("event_id", ziel.id).eq("title_de", e.titel).maybeSingle();
      let slotId = da?.slot_id ?? null;
      if (!slotId) {
        const { data: sl, error } = await admin.from("slot").insert({
          stage_id: st.id, event_day_id: tag.id, start_at: start, end_at: ende,
          slot_type: "content", status: "open", internal_title: e.titel,
        }).select("id").single();
        if (error) return { data: null, error };
        slotId = sl.id;
      }
      const felder = {
        slot_id: slotId, format: "talk", host_org_id: org.id,
        title_de: e.titel, title_en: e.titelEn ? e.titel : null,
        description_de: "Testsession für die Partner-Sicht im Board.",
        language: "de", access_mode: "open", publish_status: e.stand,
      };
      let sessionId = da?.id ?? null;
      if (sessionId) {
        const { error } = await admin.from("session").update(felder).eq("id", sessionId);
        if (error) return { data: null, error };
      } else {
        const { data, error } = await admin.from("session").insert({ event_id: ziel.id, ...felder })
          .select("id").single();
        if (error) return { data: null, error };
        sessionId = data.id;
      }
      if (!e.rueckgabe) {
        return admin.from("partner_session_return").delete().eq("session_id", sessionId);
      }
      return admin.from("partner_session_return").upsert(
        { session_id: sessionId, note: e.rueckgabe, returned_at: new Date().toISOString(), returned_by: me.id },
        { onConflict: "session_id" },
      );
    });
  }
}

/**
 * LEAD-028: Einträge **vor der Zusage**, damit die Seite „Pipeline" nicht leer
 * ist — auf der Edition stehen sonst nur bestätigte Profile, und Konrad könnte
 * sie nicht abnehmen. Drei Test-Personen mit Adressen in **Konrads eigenem
 * Postfach** (`konrad+zztest-pipeline-N@…`) — keine erfundenen fremden
 * Kontaktdaten; der Name sagt, was sie sind. Owner ist Konrad, damit sie in
 * seiner Sicht stehen. `--remove` löscht die Personen, Profile und Adressen
 * gehen mit.
 *
 * Angelegt über `testdaten_person` (Vorschlag v6_testdaten_person): eine Person
 * braucht beim Commit genau eine primäre E-Mail, und über PostgREST wären
 * Person und Adresse zwei Transaktionen.
 */
const PIPELINE_TESTS = [
  {
    nachname: "Pipeline 1 (angefragt)", status: "lead", notiz: "TEST — Erstkontakt über LinkedIn geplant.",
    // LEAD-039: Einordnung wie in der Arbeitstabelle, und die Stage-Lead-Testbühne in Frage.
    einordnung: {
      category: "politics", topic_cluster: "politics_society", topic_role: "TEST — Stimme der jungen Politik",
      priority: "a", recommended_format: "keynote", contact_via: "TEST — über Konrad", outreach_channel: "linkedin",
    },
    buehne: true,
    // LEAD-039 Schnitt 2: Verlauf — Tage relativ zu heute; die Aufgabe ist
    // überfällig, damit „Fällig“ oben in der Pipeline etwas zeigt.
    verlauf: [
      { kind: "call", body: "TEST — Anruf: Interesse an einer Keynote", vorTagen: 2 },
      { kind: "task", body: "TEST — Nachfassen: Termin fürs Vorgespräch", faelligInTagen: -1 },
    ],
  },
  {
    nachname: "Pipeline 2 (im Gespräch)", status: "contacted", notiz: "TEST — Rückmeldung bis Freitag zugesagt.",
    einordnung: {
      category: "technology", topic_cluster: "tech_science_deeptech", topic_role: "TEST — KI in der Industrie",
      priority: "b", recommended_format: "panel", contact_via: "TEST — über Partner", outreach_channel: "email",
    },
    buehne: true,
    verlauf: [
      { kind: "email", body: "TEST — Mail mit Themenvorschlag geschickt", vorTagen: 5 },
      { kind: "task", body: "TEST — Rückmeldung abfragen", faelligInTagen: 3 },
    ],
  },
  {
    nachname: "Pipeline 3 (abgesagt)", status: "declined", notiz: "TEST — für 2028 vormerken.", grund: "termin",
    einordnung: {
      category: "sport", topic_cluster: "sport_health_lifestyle", topic_role: null,
      priority: "c", recommended_format: "fireside_chat", contact_via: "TEST — über Agentur", outreach_channel: "agency",
    },
    buehne: false,
    verlauf: [{ kind: "note", body: "TEST — Absage: Termin passt nicht, für 2028 vormerken", vorTagen: 1 }],
  },
];

const pipelineAdresse = (i) => email.replace("@", `+zztest-pipeline-${i}@`);

async function pipelineEintraege(me, ed) {
  for (const [i, e] of PIPELINE_TESTS.entries()) {
    await write(`Pipeline-Eintrag ${e.status}`, async () => {
      const { data: personId, error } = await admin.rpc("testdaten_person", {
        p_first_name: "TEST", p_last_name: e.nachname, p_email: pipelineAdresse(i + 1),
      });
      if (error) return { data: null, error };
      const profil = await admin.from("speaker_profile").upsert({
        person_id: personId, edition_id: ed.id, speaker_type: "panelist", pipeline_status: e.status,
        owner_person_id: me.id, internal_notes: e.notiz, ...e.einordnung,
        ...(e.grund ? { declined_at: new Date().toISOString(), decline_reason: e.grund } : {}),
      }, { onConflict: "person_id,edition_id" }).select("id").single();
      if (profil.error) return profil;
      const verlauf = await verlaufEintraege(me, profil.data.id, e.verlauf ?? []);
      if (verlauf?.error) return verlauf;
      if (!e.buehne) return profil;
      // Bühne in Frage (LEAD-039): die Stage-Lead-Testbühne, damit das Feld im
      // Fenster und im Admin-Detail nicht leer ist.
      const { data: st } = await admin.from("stage").select("id").eq("slug", "zz-test-stagelead").maybeSingle();
      if (!st) return profil;
      return admin.from("speaker_stage_candidate").upsert(
        { profile_id: profil.data.id, stage_id: st.id, created_by: me.id },
        { onConflict: "profile_id,stage_id", ignoreDuplicates: true },
      );
    });
  }
}

/**
 * PART-091: ein Speaker, den der Partner verwaltet. Eine TEST-Person mit
 * `+zztest-verwaltet`-Adresse (Konrads Postfach) als bestätigter Speaker;
 * Konrad ist ihr Kontakt der Art `partner` mit Zugang und steht in
 * `mail_via_contact_id` — die Speaker-Mails gehen also an ihn, mit der Zeile
 * „Diese Mail betrifft TEST Verwaltet“. Dazu `TEST — Verwaltet-Talk` auf der
 * Stage-Lead-Testbühne (Samstag 15:00–15:30, in ihren Öffnungszeiten) ohne
 * Bühnenfoto: lädt Konrad unter `/admin/grafiken` das erste hoch, geht
 * „Bühnenfotos bereit“ an ihn statt an den Speaker.
 *
 * Braucht `v6_talk_speaker_zugang` (Spalte, Kontaktart `partner`) und
 * `v6_speaker_mail_weiche`, dazu den Schritt `buehne`.
 */
const verwaltetAdresse = () => email.replace("@", "+zztest-verwaltet@");

async function verwalteterSpeaker(me, ed) {
  const ziel = await summit(ed);
  const tag = ziel?.tage?.[ziel.tage.length - 1];
  if (!ziel || !tag) return fail("Verwalteter Speaker", "kein Summit mit Tagen");
  const { data: st } = await admin.from("stage").select("id").eq("slug", "zz-test-stagelead").maybeSingle();
  if (!st) return fail("Verwalteter Speaker", "Stage-Lead-Testbühne fehlt — zuerst --nur=buehne");

  await write("Verwalteter Speaker (TEST-Person, Profil, Konrad als Kontakt)", async () => {
    const { data: personId, error } = await admin.rpc("testdaten_person", {
      p_first_name: "TEST", p_last_name: "Verwaltet", p_email: verwaltetAdresse(),
    });
    if (error) return { data: null, error };
    const profil = await admin.from("speaker_profile").upsert({
      person_id: personId, edition_id: ed.id, speaker_type: "panelist", pipeline_status: "confirmed",
      confirmed_at: new Date().toISOString(), owner_person_id: me.id, internal_notes: MARK,
    }, { onConflict: "person_id,edition_id" }).select("id").single();
    if (profil.error) return profil;
    const profileId = profil.data.id;
    const { data: da } = await admin.from("speaker_contact").select("id")
      .eq("profile_id", profileId).eq("person_id", me.id).maybeSingle();
    let kontaktId = da?.id ?? null;
    if (!kontaktId) {
      const { data: k, error: ke } = await admin.from("speaker_contact").insert({
        profile_id: profileId, kind: "partner", person_id: me.id,
        first_name: me.first_name, last_name: me.last_name, email,
        has_access: true, consent_at: new Date().toISOString().slice(0, 10),
      }).select("id").single();
      if (ke) return { data: null, error: ke };
      kontaktId = k.id;
    }
    return admin.from("speaker_profile").update({ mail_via_contact_id: kontaktId }).eq("id", profileId).select("id").single();
  });

  const titel = `${PREFIX}Verwaltet-Talk`;
  const start = new Date(`${tag.day_date}T15:00:00+02:00`).toISOString();
  const ende = new Date(`${tag.day_date}T15:30:00+02:00`).toISOString();
  await write(`${titel} (Samstag 15:00, ohne Bühnenfoto)`, async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id").eq("email", verwaltetAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: { message: "TEST-Person fehlt" } };
    const { data: da } = await admin.from("session").select("id, slot_id")
      .eq("event_id", ziel.id).eq("title_de", titel).maybeSingle();
    let slotId = da?.slot_id ?? null;
    if (!slotId) {
      const { data: sl, error } = await admin.from("slot").insert({
        stage_id: st.id, event_day_id: tag.id, start_at: start, end_at: ende,
        slot_type: "content", status: "confirmed_title_open", internal_title: titel,
      }).select("id").single();
      if (error) return { data: null, error };
      slotId = sl.id;
    }
    let sessionId = da?.id ?? null;
    if (!sessionId) {
      const { data, error } = await admin.from("session").insert({
        event_id: ziel.id, slot_id: slotId, format: "talk", title_de: titel, title_en: titel,
        description_de: "Testsession für die Mail-Weiche (PART-091).", language: "de",
        access_mode: "open", publish_status: "draft",
      }).select("id").single();
      if (error) return { data: null, error };
      sessionId = data.id;
    }
    return admin.from("session_speaker").upsert(
      { session_id: sessionId, person_id: adresse.person_id, role: "speaker", confirmed: true },
      { onConflict: "session_id,person_id,role" },
    );
  });
}

/**
 * SPK-071: ein zweites Profil für die Profilwahl im Speaker-Portal. Eine
 * TEST-Person mit `+zztest-assistenz`-Adresse (Konrads Postfach) als
 * bestätigter Speaker; Konrad ist ihre Assistenz mit Zugang (Kontakt der Art
 * `assistant`). Dazu `TEST — Assistenz-Talk` auf der Stage-Lead-Testbühne
 * (Freitag 17:00–17:30, in ihren Öffnungszeiten) — so zeigt „Session“ nach dem
 * Wechsel eine andere Liste als beim eigenen Profil. Braucht den Schritt
 * `buehne`; `--remove` nimmt die TEST-Person mit Profil und Kontakt weg.
 */
const assistenzAdresse = () => email.replace("@", "+zztest-assistenz@");

async function assistenzProfil(me, ed) {
  const ziel = await summit(ed);
  const tag = ziel?.tage?.[0];
  if (!ziel || !tag) return fail("Assistenz-Profil", "kein Summit mit Tagen");
  const { data: st } = await admin.from("stage").select("id").eq("slug", "zz-test-stagelead").maybeSingle();
  if (!st) return fail("Assistenz-Profil", "Stage-Lead-Testbühne fehlt — zuerst --nur=buehne");

  await write("Assistenz-Profil (TEST-Person, Profil, Konrad als Assistenz)", async () => {
    const { data: personId, error } = await admin.rpc("testdaten_person", {
      p_first_name: "TEST", p_last_name: "Assistenz", p_email: assistenzAdresse(),
    });
    if (error) return { data: null, error };
    const profil = await admin.from("speaker_profile").upsert({
      person_id: personId, edition_id: ed.id, speaker_type: "panelist", pipeline_status: "confirmed",
      confirmed_at: new Date().toISOString(), owner_person_id: me.id, internal_notes: MARK,
    }, { onConflict: "person_id,edition_id" }).select("id").single();
    if (profil.error) return profil;
    const { data: da } = await admin.from("speaker_contact").select("id")
      .eq("profile_id", profil.data.id).eq("person_id", me.id).maybeSingle();
    if (da) return { data: da, error: null };
    // Zugang verlangt Person und Adresse (`speaker_contact_access_chk`).
    return admin.from("speaker_contact").insert({
      profile_id: profil.data.id, kind: "assistant", person_id: me.id,
      first_name: me.first_name, last_name: me.last_name, email,
      has_access: true, consent_at: new Date().toISOString().slice(0, 10),
    }).select("id").single();
  });

  const titel = `${PREFIX}Assistenz-Talk`;
  const start = new Date(`${tag.day_date}T17:00:00+02:00`).toISOString();
  const ende = new Date(`${tag.day_date}T17:30:00+02:00`).toISOString();
  await write(`${titel} (Freitag 17:00)`, async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id").eq("email", assistenzAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: { message: "TEST-Person fehlt" } };
    const { data: da } = await admin.from("session").select("id, slot_id")
      .eq("event_id", ziel.id).eq("title_de", titel).maybeSingle();
    let slotId = da?.slot_id ?? null;
    if (!slotId) {
      const { data: sl, error } = await admin.from("slot").insert({
        stage_id: st.id, event_day_id: tag.id, start_at: start, end_at: ende,
        slot_type: "content", status: "confirmed_title_open", internal_title: titel,
      }).select("id").single();
      if (error) return { data: null, error };
      slotId = sl.id;
    }
    let sessionId = da?.id ?? null;
    if (!sessionId) {
      const { data, error } = await admin.from("session").insert({
        event_id: ziel.id, slot_id: slotId, format: "talk", title_de: titel, title_en: titel,
        description_de: "Testsession für die Profilwahl (SPK-071).", language: "de",
        access_mode: "open", publish_status: "draft",
      }).select("id").single();
      if (error) return { data: null, error };
      sessionId = data.id;
    }
    return admin.from("session_speaker").upsert(
      { session_id: sessionId, person_id: adresse.person_id, role: "speaker", confirmed: true },
      { onConflict: "session_id,person_id,role" },
    );
  });
}

/**
 * PART-081: ein Gast der Standbühne — eine TEST-Person mit `+zztest`-Adresse
 * (Konrads eigenes Postfach, über `testdaten_person` aus 0183), als Gast der
 * Test-Organisation mit Einwilligung, am ersten TEST-Programmpunkt der
 * Teststandbühne. Das Porträt fehlt absichtlich: so zeigt `/partner/buehne/gaeste`
 * „Porträt fehlt“, und Konrad lädt es selbst hoch.
 *
 * Braucht die Migration `v6_standbuehnen_gaeste` (Spalte `stage_guest`) und den
 * Schritt `partner` (Test-Organisation, Standbühne).
 */
const gastAdresse = () => email.replace("@", "+zztest-gast-1@");

async function standbuehnenGast(me, ed) {
  const { data: org } = await admin.from("organization").select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`).maybeSingle();
  if (!org) {
    fail("Standbühnen-Gast", "Test-Organisation fehlt — zuerst --nur=partner");
    return;
  }
  if (mode === "dry-run") {
    note("Standbühnen-Gast (TEST-Person, Gastprofil mit Einwilligung, am ersten Programmpunkt der Teststandbühne)");
    return;
  }
  const { data: personId, error: pe } = await admin.rpc("testdaten_person", {
    p_first_name: "TEST", p_last_name: "Standbühnengast", p_email: gastAdresse(),
  });
  if (pe || !personId) {
    fail("Standbühnen-Gast (TEST-Person)", pe ?? "keine Person");
    return;
  }
  note("Standbühnen-Gast (TEST-Person)");
  const jetzt = new Date().toISOString();
  await write("Gastprofil mit Einwilligung", () =>
    admin.from("speaker_profile").upsert(
      {
        person_id: personId, edition_id: ed.id, speaker_type: "other",
        pipeline_status: "confirmed", confirmed_at: jetzt,
        job_title: "Leitung Innovation", organization_name: `${PREFIX}Partner`,
        stage_guest: true, stage_guest_consent_at: jetzt,
        lounge_access: false, reception_eligible: false, travel_costs_covered: false, hospitality_status: "none",
        created_by_org_id: org.id, partner_editable_until_login: true, internal_notes: MARK,
      },
      { onConflict: "person_id,edition_id" },
    ),
  );
  const eventId = (await summit(ed))?.id ?? ed.id;
  const { data: st } = await admin.from("stage").select("id")
    .eq("event_id", eventId).eq("slug", "zz-test-standbuehne").maybeSingle();
  if (!st) {
    fail("Gast zuordnen", "keine Teststandbühne — zuerst --nur=partner");
    return;
  }
  const { data: slots } = await admin.from("slot").select("id").eq("stage_id", st.id).order("start_at");
  const { data: se } = await admin.from("session").select("id, title_de")
    .in("slot_id", (slots ?? []).map((x) => x.id)).like("title_de", `${PREFIX}%`)
    .order("title_de").limit(1).maybeSingle();
  if (!se) {
    fail("Gast zuordnen", "kein TEST-Programmpunkt auf der Teststandbühne");
    return;
  }
  await write(`Gast am Programmpunkt „${se.title_de}“`, () =>
    admin.from("session_speaker").upsert(
      { session_id: se.id, person_id: personId, role: "speaker", confirmed: true },
      { onConflict: "session_id,person_id,role" },
    ),
  );
}

/**
 * Schritt `talk` (PART-091): ein TEST-Speaker am `TEST — Talk`, den die
 * Test-Organisation verwaltet. Konrad ist ihr Operations-Kontakt, bekommt den
 * Speaker-Zugang als Kontakt „Partner“, und die Speaker-Mails gehen an ihn
 * (`mail_via_contact_id`). Geschrieben wird direkt statt über
 * `partner_add_speaker`: die RPC schickte dem Kontakt eine Mail, und Testdaten
 * verschicken nichts. Dazu nimmt der Schritt den TEST-Gast vom TEST-Talk —
 * Gäste gibt es seit PART-091 nur auf der Standbühne. Ein zweiter TEST-Speaker
 * mit eigenem Zugang steht daneben (reguläres Profil `lead`, keine Einladung —
 * die verschickt das Speaker-Team erst ab der Zusage).
 * Braucht `v6_talk_speaker_zugang` und den Schritt `partner`.
 */
const talkSpeakerAdresse = () => email.replace("@", "+zztest-talk-1@");
/** Der zweite TEST-Speaker hat einen eigenen Zugang — beide Fälle nebeneinander. */
const talkSpeakerEigenAdresse = () => email.replace("@", "+zztest-talk-2@");

async function talkSpeaker(me, ed) {
  const { data: org } = await admin.from("organization").select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`).maybeSingle();
  const eventId = (await summit(ed))?.id ?? ed.id;
  const { data: talk } = await admin.from("session").select("id")
    .eq("event_id", eventId).eq("title_de", `${PREFIX}Talk`).maybeSingle();
  if (!org || !talk) {
    fail("Talk-Speaker", "Test-Organisation oder TEST — Talk fehlt — zuerst --nur=partner");
    return;
  }

  await write("TEST-Gast vom TEST-Talk genommen (Gäste nur noch auf der Standbühne)", async () => {
    const { data: gaeste } = await admin.from("speaker_profile").select("person_id")
      .eq("stage_guest", true).eq("created_by_org_id", org.id).eq("internal_notes", MARK);
    const ids = (gaeste ?? []).map((g) => g.person_id);
    if (ids.length === 0) return { data: null, error: null };
    return admin.from("session_speaker").delete().eq("session_id", talk.id).in("person_id", ids);
  });

  if (mode === "dry-run") {
    note("Verwalteter TEST-Speaker am TEST-Talk (Konrad als Kontakt mit Zugang, Speaker-Mails an ihn)");
    return;
  }
  const { data: personId, error: pe } = await admin.rpc("testdaten_person", {
    p_first_name: "TEST", p_last_name: "Talk-Speaker", p_email: talkSpeakerAdresse(),
  });
  if (pe || !personId) {
    fail("Talk-Speaker (TEST-Person)", pe ?? "keine Person");
    return;
  }
  note("Talk-Speaker (TEST-Person)");
  const profil = await write("Speaker-Profil, verwaltet von der Test-Organisation", () =>
    admin.from("speaker_profile").upsert(
      {
        person_id: personId, edition_id: ed.id, speaker_type: "other", pipeline_status: "lead",
        job_title: "Head of Operations", organization_name: `${PREFIX}Partner`,
        created_by_org_id: org.id, partner_editable_until_login: true, internal_notes: MARK,
      },
      { onConflict: "person_id,edition_id" },
    ).select("id").single(),
  );
  if (!profil) return;
  const kontakt = await write("Konrad als Kontakt „Partner“ mit Zugang", async () => {
    const { data: da } = await admin.from("speaker_contact").select("id")
      .eq("profile_id", profil.id).eq("person_id", me.id).maybeSingle();
    if (da) {
      return admin.from("speaker_contact").update({ kind: "partner", has_access: true })
        .eq("id", da.id).select("id").single();
    }
    return admin.from("speaker_contact").insert({
      profile_id: profil.id, kind: "partner", person_id: me.id,
      first_name: me.first_name, last_name: me.last_name, email,
      has_access: true, consent_at: new Date().toISOString().slice(0, 10),
    }).select("id").single();
  });
  if (!kontakt) return;
  await role(me.id, "speaker_assistant", "edition", null, ed.id, gueltigBis(ed));
  await write("Speaker-Mails an den Kontakt (mail_via_contact_id)", () =>
    admin.from("speaker_profile").update({ mail_via_contact_id: kontakt.id }).eq("id", profil.id),
  );
  await write("TEST-Speaker am TEST-Talk", () =>
    admin.from("session_speaker").upsert(
      { session_id: talk.id, person_id: personId, role: "speaker" },
      { onConflict: "session_id,person_id,role" },
    ),
  );

  const { data: eigenId, error: ee } = await admin.rpc("testdaten_person", {
    p_first_name: "TEST", p_last_name: "Talk-Speakerin", p_email: talkSpeakerEigenAdresse(),
  });
  if (ee || !eigenId) {
    fail("Talk-Speakerin mit eigenem Zugang (TEST-Person)", ee ?? "keine Person");
    return;
  }
  await write("Speaker-Profil mit eigenem Zugang", () =>
    admin.from("speaker_profile").upsert(
      {
        person_id: eigenId, edition_id: ed.id, speaker_type: "other", pipeline_status: "lead",
        job_title: "Chief People Officer", organization_name: `${PREFIX}Partner`,
        created_by_org_id: org.id, partner_editable_until_login: true, internal_notes: MARK,
      },
      { onConflict: "person_id,edition_id" },
    ),
  );
  await write("TEST-Speakerin am TEST-Talk", () =>
    admin.from("session_speaker").upsert(
      { session_id: talk.id, person_id: eigenId, role: "speaker" },
      { onConflict: "session_id,person_id,role" },
    ),
  );
}

/**
 * Schritt `tour-bewerbung` (PART-046): zwei Bewerbungen auf die TEST-Tour, damit
 * `/partner/company-tour` → Bewerbungen und Teilnehmende etwas zeigen — Konrad
 * mit Einwilligung und zugesagt (steht unter Teilnehmende) und eine TEST-Person
 * ohne Einwilligung (Zeile ohne Namen). Dazu eine TEST-Frage der Tour-Session,
 * damit die Antwort mit Fragetext erscheint.
 *
 * **Ohne Mail:** der Status `applied` löst über `trg_application_mail` die Mail
 * `application_received` aus. Deshalb `accepted` und `shortlisted` — solange die
 * Entscheidungen der Session nicht freigegeben sind, geht dabei nichts raus; sind
 * sie es, bricht der Schritt ab. Braucht den Schritt `tour`.
 */
const tourBewerbungAdresse = () => email.replace("@", "+zztest-tour-1@");

async function tourBewerbung(me, ed) {
  const { data: se } = await admin.from("session").select("id")
    .eq("event_id", ed.id).eq("title_de", `${PREFIX}Company Tour Session`).maybeSingle();
  if (!se) {
    fail("Tour-Bewerbungen", "TEST — Company Tour Session fehlt — zuerst --nur=tour");
    return;
  }
  const { data: freigegeben, error: fe } = await admin.rpc("decisions_released", { p_session_id: se.id });
  if (fe || freigegeben) {
    fail("Tour-Bewerbungen", fe ?? "Entscheidungen der TEST-Tour sind freigegeben — Zusagen würden Mails auslösen");
    return;
  }
  if (mode === "dry-run") {
    note("Tour-Bewerbungen (Konrad zugesagt mit Einwilligung, TEST-Person vorgemerkt ohne Einwilligung, TEST-Frage)");
    return;
  }
  const frageText = `${PREFIX}Was interessiert dich an der Tour?`;
  let { data: frage } = await admin.from("session_question").select("id")
    .eq("session_id", se.id).eq("label_de", frageText).maybeSingle();
  if (!frage) {
    frage = await write("TEST-Frage der Tour-Session", () =>
      admin.from("session_question").insert({
        session_id: se.id, label_de: frageText, label_en: "TEST — What interests you about the tour?",
        type: "textarea", required: false, sort_order: 1, purpose: "Testdaten", approved_at: new Date().toISOString(),
      }).select("id").single(),
    );
  }
  if (!frage) return;
  await write("Konrads Bewerbung auf die TEST-Tour (zugesagt, mit Einwilligung)", () =>
    admin.from("application").upsert(
      { session_id: se.id, person_id: me.id, status: "accepted", decided_at: new Date().toISOString(),
        answers: { [frage.id]: "Logistik einmal von innen sehen." }, consent_share: true },
      { onConflict: "session_id,person_id" },
    ),
  );
  const { data: personId, error: pe } = await admin.rpc("testdaten_person", {
    p_first_name: "TEST", p_last_name: "Tourbewerbung", p_email: tourBewerbungAdresse(),
  });
  if (pe || !personId) {
    fail("Tour-Bewerbung ohne Einwilligung (TEST-Person)", pe ?? "keine Person");
    return;
  }
  await write("TEST-Bewerbung ohne Einwilligung (vorgemerkt)", () =>
    admin.from("application").upsert(
      { session_id: se.id, person_id: personId, status: "shortlisted",
        answers: { [frage.id]: "Bitte nicht weitergeben." }, consent_share: false },
      { onConflict: "session_id,person_id" },
    ),
  );
}

/**
 * Schritt `masterclass` (PART-045): die TEST-Masterclass so, wie sie im Partner-
 * Portal aussehen soll.
 * - Der Slot zieht von der Teststandbühne in einen TEST-Raum: eine Masterclass
 *   ist kein Programmpunkt der Standbühne, und dort stand sie in der Tabelle und
 *   im Weg (16:00–17:00 am ersten Tag).
 * - Eine eigene Frage, **beantragt** (noch nicht freigegeben), und Konrads
 *   Antwort darauf in seiner Bewerbung — geändert werden nur die Antworten, nicht
 *   der Status, also löst der Mail-Trigger nichts aus.
 * - Die TEST-Speakerin mit eigenem Zugang (Schritt `talk`) spricht auch hier.
 * Braucht die Schritte `partner` und `talk` und die Masterclass aus dem vollen Lauf.
 */
async function masterclassSchritt(me, ed) {
  const ziel = await summit(ed);
  const eventId = ziel?.id ?? ed.id;
  const { data: mc } = await admin.from("session").select("id, slot_id, partner_org_id")
    .eq("event_id", eventId).eq("title_de", `${PREFIX}Masterclass`).maybeSingle();
  if (!mc) {
    fail("Masterclass", "TEST — Masterclass fehlt — zuerst ein voller Lauf (--apply)");
    return;
  }
  const { data: raum } = await admin.from("stage").select("id")
    .eq("event_id", eventId).eq("slug", "zz-test-masterclass-raum").maybeSingle();
  const raumId = raum?.id ?? (await write("TEST-Raum für die Masterclass", () =>
    admin.from("stage").insert({
      event_id: eventId, name: `${PREFIX}Masterclass-Raum`, slug: "zz-test-masterclass-raum",
      type: "room", capacity: 30, active: true,
    }).select("id").single(),
  ))?.id;
  if (mc.slot_id && raumId) {
    const { data: slot } = await admin.from("slot").select("stage_id").eq("id", mc.slot_id).maybeSingle();
    if (slot && slot.stage_id !== raumId) {
      await write("Slot der Masterclass in den TEST-Raum", () =>
        admin.from("slot").update({ stage_id: raumId }).eq("id", mc.slot_id),
      );
    } else {
      note("Slot der Masterclass", "liegt schon im TEST-Raum");
    }
  }

  const frageText = `${PREFIX}Welche Erfahrung bringst du mit?`;
  let { data: frage } = await admin.from("session_question").select("id")
    .eq("session_id", mc.id).eq("label_de", frageText).maybeSingle();
  if (!frage) {
    frage = await write("Eigene Frage der Masterclass (beantragt)", () =>
      admin.from("session_question").insert({
        session_id: mc.id, label_de: frageText, label_en: "TEST — What experience do you bring?",
        type: "textarea", required: false, sort_order: 90, purpose: "Testdaten: Auswahl nach Vorerfahrung",
        requested_by: me.id,
      }).select("id").single(),
    );
  }
  if (frage) {
    await write("Konrads Antwort auf die eigene Frage", async () => {
      const { data: bew } = await admin.from("application").select("id, answers")
        .eq("session_id", mc.id).eq("person_id", me.id).maybeSingle();
      if (!bew) return { data: null, error: null };
      return admin.from("application")
        .update({ answers: { ...(bew.answers ?? {}), [frage.id]: "Zwei Jahre Produktmanagement." } })
        .eq("id", bew.id);
    });
  }

  const { data: adresse } = await admin.from("person_email").select("person_id")
    .eq("email", talkSpeakerEigenAdresse()).maybeSingle();
  if (!adresse) {
    note("Speakerin der Masterclass", "erst nach dem Schritt talk");
    return;
  }
  await write("TEST-Speakerin an der Masterclass", () =>
    admin.from("session_speaker").upsert(
      { session_id: mc.id, person_id: adresse.person_id, role: "speaker" },
      { onConflict: "session_id,person_id,role" },
    ),
  );
}

/**
 * LEAD-014: zieht aufs Summit, was frühere Läufe auf die früheste Veranstaltung
 * gelegt haben (den Hackathon): die Teststandbühne mit allen Slots und den
 * Sessions darin, dazu Test-Sessions ohne Slot. **Gelöscht wird nichts** —
 * auch die Slots und Sessions, die Konrad im Board auf der Teststandbühne
 * angelegt hat, ziehen mit, zur selben Uhrzeit am entsprechenden Summit-Tag
 * (erster Tag auf den ersten, zweiter auf den zweiten).
 *
 * Reihenfolge wegen `slot_consistency_check` — Bühne und Tag eines Slots
 * müssen zur selben Veranstaltung gehören, geprüft wird beim Schreiben des
 * Slots: erst die Bühne, dann jeder Slot mit seinem neuen Tag, dann die
 * Sessions. Regie-Zeilen der Bühne (aus den Regie-Walkthroughs, teils ohne
 * Slot) ziehen um denselben Tagesversatz mit. Hängt ein Tagesrahmen
 * (`stage_day`) an der Bühne, bricht der Schritt ab: den legt nur jemand von
 * Hand an, und dann soll auch jemand hinsehen.
 */
async function umzugSummit(me, ed) {
  const ziel = await summit(ed);
  if (!ziel || ziel.tage.length === 0) return fail("Umzug aufs Summit", "kein Summit mit Tagen");

  const { data: buehne } = await admin.from("stage").select("id, event_id")
    .eq("slug", "zz-test-standbuehne").neq("event_id", ziel.id).maybeSingle();
  /** Slots, die mit der Bühne umziehen — ihre Sessions gehen im selben Zug mit. */
  const mitgezogen = new Set();
  if (!buehne) {
    note("Teststandbühne am Summit", "schon da oder nicht angelegt");
  } else {
    const [{ data: alteTage }, { data: slots }, { data: cues }, { data: rahmen }] = await Promise.all([
      admin.from("event_day").select("id, day_date").eq("event_id", buehne.event_id).order("day_date"),
      admin.from("slot").select("id, event_day_id, start_at, end_at").eq("stage_id", buehne.id),
      admin.from("regie_cue").select("id, event_day_id, cue_start, cue_end").eq("stage_id", buehne.id),
      admin.from("stage_day").select("id").eq("stage_id", buehne.id),
    ]);
    if ((rahmen ?? []).length > 0) {
      return fail("Teststandbühne aufs Summit", "Tagesrahmen an der Bühne — von Hand prüfen");
    }
    const tagIndex = new Map((alteTage ?? []).map((t, i) => [t.id, i]));
    /** Neuer Tag und Versatz in Millisekunden für einen alten Tag der Bühne. */
    const umTag = (eventDayId) => {
      const i = tagIndex.get(eventDayId) ?? 0;
      const alt = (alteTage ?? [])[i];
      const neu = ziel.tage[Math.min(i, ziel.tage.length - 1)];
      return { neu, versatz: Date.parse(`${neu.day_date}T00:00:00Z`) - Date.parse(`${alt.day_date}T00:00:00Z`) };
    };
    await write(`Teststandbühne aufs Summit (${(slots ?? []).length} Slots ziehen mit)`, () =>
      admin.from("stage").update({ event_id: ziel.id }).eq("id", buehne.id),
    );
    for (const sl of slots ?? []) {
      const { neu, versatz } = umTag(sl.event_day_id);
      await write(`Slot ${sl.start_at.slice(0, 16)} → ${neu.day_date}`, () =>
        admin.from("slot").update({
          event_day_id: neu.id,
          start_at: new Date(Date.parse(sl.start_at) + versatz).toISOString(),
          end_at: new Date(Date.parse(sl.end_at) + versatz).toISOString(),
        }).eq("id", sl.id),
      );
    }
    for (const cue of cues ?? []) {
      const { neu, versatz } = umTag(cue.event_day_id);
      await write(`Regie-Zeile → ${neu.day_date}`, () =>
        admin.from("regie_cue").update({
          event_day_id: neu.id,
          cue_start: new Date(Date.parse(cue.cue_start) + versatz).toISOString(),
          cue_end: new Date(Date.parse(cue.cue_end) + versatz).toISOString(),
        }).eq("id", cue.id),
      );
    }
    const slotIds = (slots ?? []).map((sl) => sl.id);
    for (const id of slotIds) mitgezogen.add(id);
    if (slotIds.length > 0) {
      await write("Sessions der Teststandbühne aufs Summit", () =>
        admin.from("session").update({ event_id: ziel.id }).in("slot_id", slotIds),
      );
    }
  }

  // Test-Sessions ohne Slot (etwa die Keynote, bevor sie jemand platziert hat).
  const { data: events } = await admin.from("event").select("id").eq("edition_id", ed.id).neq("id", ziel.id);
  const andere = (events ?? []).map((e) => e.id);
  if (andere.length === 0) return;
  const { data: lose } = await admin.from("session").select("id, title_de, slot_id")
    .in("event_id", andere).like("title_de", `${PREFIX}%`);
  for (const se of lose ?? []) {
    if (se.slot_id && mitgezogen.has(se.slot_id)) continue;
    if (se.slot_id) {
      fail(`${se.title_de} aufs Summit`, "hängt an einem Slot einer anderen Bühne — von Hand prüfen");
      continue;
    }
    await write(`${se.title_de} aufs Summit`, () =>
      admin.from("session").update({ event_id: ziel.id }).eq("id", se.id),
    );
  }
}

/**
 * Eine Company Tour mit Stopp und verknuepfter Session (ADM-058, K-31), damit
 * Konrad `/admin/company-tours` mit Inhalt sieht statt mit dem Leerzustand.
 *
 * Geschrieben wird direkt auf die Tabellen, nicht ueber `upsert_company_tour`:
 * das Skript laeuft mit dem Service-Schluessel, und die RPC verlangt eine
 * angemeldete Person mit Abschnittsrecht. Idempotent ueber den Namen.
 */
async function companyTour(me, ed) {
  const name = `${PREFIX}Company Tour`;
  const titel = `${PREFIX}Company Tour Session`;

  let { data: se } = await admin.from("session").select("id")
    .eq("event_id", ed.id).eq("title_de", titel).maybeSingle();
  if (!se) {
    se = await write("Session der Company Tour", () =>
      admin.from("session").insert({
        event_id: ed.id, format: "company_tour", title_de: titel,
        title_en: "TEST — Company Tour session", access_mode: "application",
      }).select("id").single(),
    );
  }

  let { data: tour } = await admin.from("company_tour").select("id")
    .eq("edition_id", ed.id).eq("name", name).maybeSingle();
  if (!tour) {
    tour = await write("Company Tour", () =>
      admin.from("company_tour").insert({
        edition_id: ed.id, name, track: "ZZTEST",
        starts_at: ed.start_date ? `${ed.start_date}T09:00:00+02:00` : null,
        ends_at: ed.start_date ? `${ed.start_date}T12:00:00+02:00` : null,
        capacity: 12, notes: "Testtour fuer die Abnahme.", session_id: se?.id ?? null,
      }).select("id").single(),
    );
  } else if (se) {
    // Nur melden, wenn die Verknuepfung wirklich fehlt — sonst behauptet jeder
    // Lauf eine Aenderung, die keine war.
    const { data: vorhanden } = await admin.from("company_tour").select("session_id").eq("id", tour.id).single();
    if (vorhanden?.session_id !== se.id) {
      await write("Company Tour verknuepft", () =>
        admin.from("company_tour").update({ session_id: se.id }).eq("id", tour.id),
      );
    } else {
      note("Company Tour", "steht schon");
    }
  }
  if (!tour) return;

  // Begleitung vor Ort (ADM-059): `edition_contact` vom Typ `tour_lead` — kein
  // Konto, keine Rolle. Dienstliche Adresse, damit der CHECK ohne
  // Einwilligungsdatum haelt.
  let { data: lead } = await admin.from("edition_contact").select("id")
    .eq("edition_id", ed.id).eq("type", "tour_lead").eq("display_name", `${PREFIX}Begleitung`).maybeSingle();
  if (!lead) {
    lead = await write("Begleitung der Company Tour", () =>
      admin.from("edition_contact").insert({
        edition_id: ed.id, type: "tour_lead", display_name: `${PREFIX}Begleitung`,
        role_label_de: "Eure Begleitung vor Ort", role_label_en: "Your guide on site",
        email: "zztest-tourlead@chef-treff.de", phone: "+49 40 000000",
      }).select("id").single(),
    );
  }
  if (lead) {
    const { data: jetzt } = await admin.from("company_tour").select("lead_contact_id").eq("id", tour.id).single();
    if (jetzt?.lead_contact_id !== lead.id) {
      await write("Begleitung zugeordnet", () =>
        admin.from("company_tour").update({ lead_contact_id: lead.id }).eq("id", tour.id),
      );
    } else {
      note("Begleitung der Company Tour", "steht schon");
    }
  }

  const { data: org } = await admin.from("organization").select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`).maybeSingle();
  const { data: stopp } = await admin.from("company_tour_stop").select("id")
    .eq("tour_id", tour.id).eq("sort_order", 1).maybeSingle();
  if (!stopp) {
    await write("Stopp der Company Tour", () =>
      admin.from("company_tour_stop").insert({
        tour_id: tour.id, sort_order: 1, host_org_id: org?.id ?? null,
        address: "Testweg 1, 20095 Hamburg",
        arrival_at: ed.start_date ? `${ed.start_date}T09:30:00+02:00` : null,
        departure_at: ed.start_date ? `${ed.start_date}T10:30:00+02:00` : null,
        target_profile: {},
      }),
    );
  } else {
    note("Stopp der Company Tour", "steht schon");
  }
}

/**
 * LEAD-042: eine TEST-Person als **Stage Lead ohne Speaker-Profil**. Nur so zeigt
 * die Moderationssuche im Board den Treffer „Stage Lead · ohne Speaker-Profil“ —
 * Konrad selbst hat ein Test-Speaker-Profil und erscheint dort als Speaker.
 * Adresse in Konrads Postfach (`+zztest-stagelead`), Rolle an der
 * Stage-Lead-Testbühne; `--remove` löscht die Person, die Rolle geht mit.
 */
const moderationAdresse = () => email.replace("@", "+zztest-stagelead@");

async function moderationStageLead(me, ed) {
  const validTo = ed.end_date ? new Date(new Date(ed.end_date).getTime() + 86400000).toISOString() : null;
  const { data: st } = await admin.from("stage").select("id").eq("slug", "zz-test-stagelead").maybeSingle();
  if (!st) return fail("Stage Lead für die Moderation", "Stage-Lead-Testbühne fehlt — erst --nur=buehne");
  const personId = await write("TEST-Person als Stage Lead (Moderation)", () =>
    admin.rpc("testdaten_person", {
      p_first_name: "TEST", p_last_name: "Stage Lead (Moderation)", p_email: moderationAdresse(),
    }),
  );
  if (!personId) return; // Probelauf oder Fehler — dann auch keine Rolle
  await role(personId, "speaker_manager", "stage", st.id, ed.id, validTo);
}

/**
 * LEAD-039 Schnitt 2: Verlaufseinträge eines TEST-Leads, am Text wiedergefunden.
 * Jeder Lauf setzt Zeitpunkt und Frist relativ zu heute neu und öffnet die
 * Aufgabe wieder — so zeigt „Fällig“ immer eine überfällige Aufgabe, egal wann
 * das Skript zuletzt lief. Autor und Zuständige ist Konrad.
 */
async function verlaufEintraege(me, profileId, eintraege) {
  const tag = 86400000;
  for (const v of eintraege) {
    const zeile = {
      profile_id: profileId, kind: v.kind, body: v.body, author_person_id: me.id,
      occurred_at: new Date(Date.now() - (v.vorTagen ?? 0) * tag).toISOString(),
      ...(v.kind === "task"
        ? { due_on: new Date(Date.now() + v.faelligInTagen * tag).toISOString().slice(0, 10),
            assignee_person_id: me.id, done_at: null, done_by: null }
        : {}),
    };
    const { data: da } = await admin.from("speaker_activity").select("id")
      .eq("profile_id", profileId).eq("body", v.body).maybeSingle();
    const res = da
      ? await admin.from("speaker_activity").update(zeile).eq("id", da.id)
      : await admin.from("speaker_activity").insert(zeile);
    if (res.error) return res;
  }
  return null;
}

/**
 * Ein gescanntes Ticket, damit `/admin/checkin` etwas zeigt (ADM-051).
 *
 * Konrads Speaker-Freiticket bleibt unberuehrt — das steht auf `requested`,
 * damit er das Ausstellen selbst pruefen kann. Stattdessen ein eigenes
 * ZZTEST-Ticket auf **seine** Person (keine erfundenen Dritten), gueltig, mit
 * zwei Scans: einmal eingelassen, einmal zweiter Scan. So sieht er beide Faelle
 * und findet sich in der Suche wieder.
 */
async function checkinScans(me, ed) {
  const barcode = `${PREFIX_CODE}-CHECKIN`;
  let { data: t } = await admin.from("ticket").select("id").eq("barcode", barcode).maybeSingle();
  if (!t) {
    t = await write("Ticket fuer den Check-in", () =>
      admin.from("ticket").insert({
        event_id: ed.id, person_id: me.id, pass_type: "talent",
        holder_email: me.email, holder_first_name: me.first_name, holder_last_name: me.last_name,
        barcode, status: "valid", personalization_status: "complete", price_cents: 0, source: "vivenu",
      }).select("id").single(),
    );
  }
  if (!t) return;

  const { data: tag } = await admin.from("event_day").select("day_date, event_id")
    .order("day_date").limit(1).maybeSingle();
  if (!tag) return fail("Scans fuer den Check-in", "kein Veranstaltungstag");
  const { count } = await admin.from("checkin").select("*", { count: "exact", head: true }).eq("ticket_id", t.id);
  if (count && count > 0) return note("Scans fuer den Check-in", "stehen schon");
  await write("Scans fuer den Check-in", () =>
    admin.from("checkin").insert([
      { ticket_id: t.id, edition_id: ed.id, scan_day: tag.day_date, result: "ok",
        device_id: `${PREFIX_CODE}-Tablet-1`, location: "Haupteingang" },
      { ticket_id: t.id, edition_id: ed.id, scan_day: tag.day_date, result: "duplicate",
        device_id: `${PREFIX_CODE}-Tablet-2`, location: "Haupteingang" },
    ]),
  );
}

/**
 * Einwilligung zum Weissen an Konrads Test-Organisation (ADM-048), damit die
 * Logo-Produktionsliste beide Faelle zeigt.
 *
 * **Keine erfundene Logodatei.** Eine `partner_asset`-Zeile ohne Datei im
 * Bucket sieht im Partner-Portal wie ein Download aus, der ins Leere geht.
 * Der druckfertige Fall entsteht in zwei Klicks: Logo im Partner-Portal
 * hochladen, Liste neu laden.
 */
async function logoEinwilligung(me, ed) {
  const { data: org } = await admin.from("organization").select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`).maybeSingle();
  if (!org) return fail("Einwilligung zum Weissen", "Test-Organisation fehlt — erst --nur=partner");
  const { data: oe } = await admin.from("org_edition").select("id, logo_whitening_consent_at")
    .eq("org_id", org.id).eq("edition_id", ed.id).maybeSingle();
  if (!oe) return fail("Einwilligung zum Weissen", "Org-Edition fehlt");
  if (oe.logo_whitening_consent_at) return note("Einwilligung zum Weissen", "steht schon");
  await write("Einwilligung zum Weissen", () =>
    admin.from("org_edition").update({ logo_whitening_consent_at: new Date().toISOString() }).eq("id", oe.id),
  );
}

/** Die Schritte, die `--nur` kennt. */
const SCHRITTE = {
  partner: partnerSchritt,
  gaeste: standbuehnenGast,
  talk: talkSpeaker,
  "tour-bewerbung": tourBewerbung,
  masterclass: masterclassSchritt,
  ticket: speakerTicket,
  fotos: stagePhotos,
  "ticket-zurueck": ticketZurueck,
  buehne: stageLeadBuehne,
  standstatus: standStatus,
  verwaltet: verwalteterSpeaker,
  assistenz: assistenzProfil,
  pipeline: pipelineEintraege,
  summit: umzugSummit,
  tour: companyTour,
  checkin: checkinScans,
  logos: logoEinwilligung,
  moderation: moderationStageLead,
};

async function teilschritte(me, ed, namen) {
  for (const name of namen) {
    if (!SCHRITTE[name]) {
      fail(`Schritt ${name}`, `unbekannt — bekannt sind ${Object.keys(SCHRITTE).join(", ")}`);
      continue;
    }
    await SCHRITTE[name](me, ed);
  }
}

async function remove(me) {
  await write("Rollen entfernt", () =>
    admin.from("role_assignment").delete().eq("person_id", me.id).eq("note", MARK),
  );

  const { data: org } = await admin
    .from("organization")
    .select("id")
    .eq("legal_name", `${PREFIX}Partner GmbH`)
    .maybeSingle();
  if (org) {
    const { data: oes } = await admin.from("org_edition").select("id").eq("org_id", org.id);
    for (const oe of oes ?? []) {
      const { data: orders } = await admin.from("shop_order").select("id").eq("org_edition_id", oe.id);
      for (const o of orders ?? []) {
        await admin.from("stock_ledger").delete().eq("order_id", o.id);
        await admin.from("shop_order_line").delete().eq("order_id", o.id);
      }
      await admin.from("shop_order").delete().eq("org_edition_id", oe.id);
      await admin.from("shop_request").delete().eq("org_edition_id", oe.id);
      await admin.from("deliverable").delete().eq("org_edition_id", oe.id);
      // Stände hängen seit 0124 über `booth_assignment` an der Org-Edition (vorher
      // `booth.org_edition_id`, die Spalte gibt es nicht mehr). Entfernt wird nur der
      // eigene Test-Stand; ein vom Team zugeordneter Stand verliert nur die Zuordnung.
      const { data: zuordnungen } = await admin.from("booth_assignment").select("booth_id").eq("org_edition_id", oe.id);
      await admin.from("booth_assignment").delete().eq("org_edition_id", oe.id);
      const standIds = (zuordnungen ?? []).map((z) => z.booth_id);
      if (standIds.length > 0) await admin.from("booth").delete().in("id", standIds).eq("notes", MARK);
      await admin.from("org_product").delete().eq("org_edition_id", oe.id);
    }
    // Kontingente: **nur die eigenen**. An der Test-Organisation hängen auch
    // Zeilen aus dem vivenu-Sandbox-Lauf, die auf echte Coupons und einen
    // echten Undershop zeigen — die wegzuräumen würde diese Objekte in vivenu
    // verwaisen lassen, ohne dass hier jemand davon erfährt.
    await write("Ticket-Kontingente (nur eigene) entfernt", () =>
      admin.from("org_ticket_allocation").delete().eq("org_id", org.id).eq("notes", MARK),
    );
    const { data: fremd } = await admin
      .from("org_ticket_allocation")
      .select("pass_type, coupon_code")
      .eq("org_id", org.id);
    if ((fremd ?? []).length > 0) {
      log.push(
        `  !!  Partner-Organisation bleibt stehen — ${fremd.length} Kontingent(e) stammen nicht aus diesem Skript ` +
          `(${fremd.map((f) => f.pass_type).join(", ")}). Sie zeigen auf vivenu-Objekte; bitte dort zuerst entscheiden.`,
      );
    } else {
      await admin.from("org_membership").delete().eq("org_id", org.id);
      await admin.from("org_edition").delete().eq("org_id", org.id);
      await write("Partner-Organisation entfernt", () => admin.from("organization").delete().eq("id", org.id));
    }
  } else {
    note("Partner-Organisation entfernt");
  }

  await write("Schicht-Zuteilungen entfernt", () =>
    admin.from("shift_assignment").delete().eq("person_id", me.id),
  );
  await write("Testschichten entfernt", () => admin.from("shift").delete().eq("area", AREA_KEY));
  await write("Volunteer-Bewerbung entfernt", () =>
    admin.from("volunteer_profile").delete().eq("person_id", me.id).eq("notes_internal", MARK),
  );
  await write("Vokabular-Bereich entfernt", () =>
    admin.from("vocab_term").delete().eq("vocabulary", "volunteer_area").eq("key", AREA_KEY),
  );
  // Vor den Sessions: `session_asset` geht per ON DELETE CASCADE mit der
  // Session, die Dateien im Bucket aber nicht — sie blieben als Waisen liegen.
  // Also erst die Dateien, dann die Zeilen. Gemeint sind alle Bilder an
  // Testsessions, auch die, die jemand im Walkthrough selbst hochgeladen hat.
  await write("Bilder an Testsessions entfernt (Dateien und Zeilen)", async () => {
    const { data: sessions } = await admin.from("session").select("id").like("title_de", `${PREFIX}%`);
    const ids = (sessions ?? []).map((s) => s.id);
    if (ids.length === 0) return { data: null, error: null };
    const { data: rows, error } = await admin.from("session_asset").select("storage_path").in("session_id", ids);
    if (error) return { data: null, error };
    const pfade = (rows ?? []).map((r) => r.storage_path);
    if (pfade.length > 0) {
      const { error: wegFehler } = await admin.storage.from(SESSION_BUCKET).remove(pfade);
      if (wegFehler) return { data: null, error: wegFehler };
    }
    return admin.from("session_asset").delete().in("session_id", ids);
  });
  // Reihenfolge ist hier nicht beliebig: `slot` löscht per ON DELETE SET NULL
  // die `session.slot_id`, und der Veröffentlichungs-Trigger weist das für eine
  // veröffentlichte Session mit 23514 ab. Erst die Sessions, dann die Slots.
  await write("Testsessions und Bewerbungen entfernt", async () => {
    const { data: sessions } = await admin.from("session").select("id").like("title_de", `${PREFIX}%`);
    for (const se of sessions ?? []) {
      await admin.from("application").delete().eq("session_id", se.id);
      await admin.from("session_speaker").delete().eq("session_id", se.id);
    }
    return admin.from("session").delete().like("title_de", `${PREFIX}%`);
  });
  // PART-081: der TEST-Gast. Erst die Porträts im Bucket (die Zeilen gehen per
  // ON DELETE CASCADE mit, die Dateien nicht), dann die Person — Profil und
  // Zuordnung hängen mit ON DELETE CASCADE an ihr.
  await write("Standbühnen-Gast entfernt (Porträts, Profil, Zuordnung)", async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id").eq("email", gastAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: null };
    const { data: profile } = await admin.from("speaker_profile").select("id").eq("person_id", adresse.person_id);
    const ids = (profile ?? []).map((x) => x.id);
    if (ids.length > 0) {
      const { data: dateien } = await admin.from("speaker_asset").select("storage_path").in("profile_id", ids);
      const pfade = (dateien ?? []).map((d) => d.storage_path);
      if (pfade.length > 0) {
        const { error: wegFehler } = await admin.storage.from("speaker-assets").remove(pfade);
        if (wegFehler) return { data: null, error: wegFehler };
      }
    }
    return admin.from("person").delete().eq("id", adresse.person_id).eq("first_name", "TEST").is("auth_user_id", null);
  });
  // PART-091: der verwaltete TEST-Speaker. Profil, Kontakt und Zuordnung hängen mit
  // ON DELETE CASCADE an der Person; Konrads Rolle `speaker_assistant` geht mit den Rollen.
  // PART-046: die TEST-Person der Tour-Bewerbung; ihre Bewerbung hängt mit ON DELETE CASCADE an ihr.
  await write("Tour-Bewerbung ohne Einwilligung entfernt", async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id")
      .eq("email", tourBewerbungAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: null };
    return admin.from("person").delete().eq("id", adresse.person_id).eq("first_name", "TEST").is("auth_user_id", null);
  });
  await write("Talk-Speaker entfernt (Profil, Kontakt, Zuordnung)", async () => {
    const { data: adressen } = await admin.from("person_email").select("person_id")
      .in("email", [talkSpeakerAdresse(), talkSpeakerEigenAdresse()]);
    const ids = (adressen ?? []).map((a) => a.person_id);
    if (ids.length === 0) return { data: null, error: null };
    return admin.from("person").delete().in("id", ids).eq("first_name", "TEST").is("auth_user_id", null);
  });
  // Die Test-Personen der Pipeline (nur Vorname TEST, ohne Konto): erst die
  // Profile, dann die Personen.
  await write("Pipeline-Testeinträge entfernt", async () => {
    const { data: adressen } = await admin.from("person_email").select("person_id")
      .in("email", PIPELINE_TESTS.map((_, i) => pipelineAdresse(i + 1)));
    const ids = (adressen ?? []).map((a) => a.person_id);
    if (ids.length === 0) return { data: null, error: null };
    // Profile und Adressen hängen mit ON DELETE CASCADE an der Person.
    return admin.from("person").delete().in("id", ids).eq("first_name", "TEST").is("auth_user_id", null);
  });
  await write("Verwalteter TEST-Speaker entfernt (Profil und Kontakt gehen mit)", async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id")
      .eq("email", verwaltetAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: null };
    return admin.from("person").delete().eq("id", adresse.person_id).eq("first_name", "TEST").is("auth_user_id", null);
  });
  await write("Assistenz-Testprofil entfernt (Profil und Kontakt gehen mit)", async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id")
      .eq("email", assistenzAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: null };
    return admin.from("person").delete().eq("id", adresse.person_id).eq("first_name", "TEST").is("auth_user_id", null);
  });
  await write("TEST-Stage-Lead der Moderation entfernt (Rolle geht mit)", async () => {
    const { data: adresse } = await admin.from("person_email").select("person_id")
      .eq("email", moderationAdresse()).maybeSingle();
    if (!adresse) return { data: null, error: null };
    return admin.from("person").delete().eq("id", adresse.person_id).eq("first_name", "TEST").is("auth_user_id", null);
  });
  await write("Stage-Lead-Bühne entfernt (Slots und Cues gehen mit)", () =>
    admin.from("stage").delete().eq("slug", "zz-test-stagelead"),
  );
  // PART-045: der TEST-Raum der Masterclass; die Sessions sind oben schon weg.
  await write("TEST-Raum der Masterclass entfernt", async () => {
    const { data: raeume } = await admin.from("stage").select("id").eq("slug", "zz-test-masterclass-raum");
    for (const st of raeume ?? []) await admin.from("slot").delete().eq("stage_id", st.id);
    return admin.from("stage").delete().eq("slug", "zz-test-masterclass-raum");
  });
  // Die Öffnungszeiten (`stage_day`, PART-090) hängen mit ON DELETE CASCADE an der Bühne.
  await write("Teststandbühne, ihre Slots und Öffnungszeiten entfernt", async () => {
    const { data: stages } = await admin.from("stage").select("id").eq("slug", "zz-test-standbuehne");
    for (const st of stages ?? []) await admin.from("slot").delete().eq("stage_id", st.id);
    return admin.from("stage").delete().eq("slug", "zz-test-standbuehne");
  });
  // Vor dem Profil: `ticket.speaker_profile_id` ist ON DELETE SET NULL — wer
  // erst das Profil löscht, lässt Freiticket und Begleitticket als Waisen
  // stehen. Was schon an vivenu hängt (`vivenu_ticket_id`), bleibt stehen und
  // wird gemeldet; dahinter steht ein echtes Ticket, das man dort storniert.
  await write("Tickets des Testprofils entfernt", async () => {
    const { data: profile } = await admin.from("speaker_profile").select("id")
      .eq("person_id", me.id).eq("internal_notes", MARK);
    const ids = (profile ?? []).map((p) => p.id);
    if (ids.length === 0) return { data: null, error: null };
    const { data: echt } = await admin.from("ticket").select("id")
      .in("speaker_profile_id", ids).not("vivenu_ticket_id", "is", null);
    if ((echt ?? []).length > 0) {
      log.push(`  !!  ${echt.length} Ticket(s) am Testprofil hängen an vivenu und bleiben stehen — bitte dort stornieren.`);
    }
    return admin.from("ticket").delete().in("speaker_profile_id", ids).is("vivenu_ticket_id", null);
  });
  await write("Speaker-Profil entfernt", () =>
    admin.from("speaker_profile").delete().eq("person_id", me.id).eq("internal_notes", MARK),
  );
}

const me = await person();
if (!me) {
  console.error(`Keine Person zu ${email} gefunden.`);
  process.exit(1);
}
const ed = await edition();
if (!ed) {
  console.error("Keine Edition gefunden.");
  process.exit(1);
}

console.log(`Testdaten für ${email} · Edition ${ed.name} (${ed.slug}) · Modus ${mode}\n`);
if (mode === "remove") await remove(me);
else if (nur) await teilschritte(me, ed, nur);
else await apply(me, ed);
console.log(log.join("\n"));
if (mode === "dry-run") console.log("\nNichts geschrieben. Mit --apply ausführen.");
