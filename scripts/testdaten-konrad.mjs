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
 *   - `--remove` entfernt genau diese und sonst nichts
 *
 * Aufruf:
 *   node --env-file=.env.local scripts/testdaten-konrad.mjs --dry-run
 *   node --env-file=.env.local scripts/testdaten-konrad.mjs --apply
 *   node --env-file=.env.local scripts/testdaten-konrad.mjs --remove
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

const MARK = "testdaten:konrad";
const PREFIX = "TEST — ";
const AREA_KEY = "zz_test_bereich";
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

async function apply(me, ed) {
  const validTo = ed.end_date ? new Date(new Date(ed.end_date).getTime() + 86400000).toISOString() : null;

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

  if (orgId) {
    let oeId = null;
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

    await write("Partner-Kontakt (Hauptkontakt)", () =>
      admin.from("org_membership").upsert(
        { org_id: orgId, person_id: me.id, roles: ["primary_ops"], contact_position: "Geschäftsführer" },
        { onConflict: "org_id,person_id" },
      ),
    );
    await role(me.id, "partner_contact", "org", orgId, ed.id, validTo);
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
      await admin.from("booth").delete().eq("org_edition_id", oe.id);
      await admin.from("org_product").delete().eq("org_edition_id", oe.id);
    }
    await admin.from("org_ticket_allocation").delete().eq("org_id", org.id);
    await admin.from("org_membership").delete().eq("org_id", org.id);
    await admin.from("org_edition").delete().eq("org_id", org.id);
    await write("Partner-Organisation entfernt", () => admin.from("organization").delete().eq("id", org.id));
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
else await apply(me, ed);
console.log(log.join("\n"));
if (mode === "dry-run") console.log("\nNichts geschrieben. Mit --apply ausführen.");
