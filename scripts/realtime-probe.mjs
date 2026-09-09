// Realtime-Probe: prüft den privaten Board-Kanal Ende-zu-Ende mit einem Wegwerf-Testnutzer.
// Aufruf: node --env-file=.env.local scripts/realtime-probe.mjs
// Ablauf: Testnutzer + Person + Rolle speaker_manager anlegen → Login → privaten Kanal programme-board:<summit-27>
// abonnieren → Client-Send (Policy programme_board_send) → No-op-Update einer DEMO-Session (Trigger → realtime.send)
// → Empfang prüfen → alles wieder entfernen. Gibt keine Schlüssel oder Tokens aus.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !secret) { console.error("Env unvollständig (URL, Publishable Key, Secret Key)."); process.exit(1); }

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `realtime-probe-${Date.now()}@example.com`;
const password = `${crypto.randomUUID()}Aa1!`;
let userId, personId, user, ch;
const log = (s) => console.log(s);

try {
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (e1) throw e1; userId = u.user.id; log(`1 Testnutzer angelegt (${email})`);

  user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e5 } = await user.auth.signInWithPassword({ email, password }); if (e5) throw e5;
  const { error: e2 } = await user.rpc("claim_or_create_person"); if (e2) throw e2;
  const { data: p, error: e2b } = await admin.from("person").select("id").eq("auth_user_id", userId).single(); if (e2b) throw e2b; personId = p.id;
  const { error: e3 } = await admin.from("role_assignment").insert({ person_id: personId, role: "speaker_manager", scope_type: "global", note: "realtime-probe" });
  if (e3) throw e3; log("2 Person (per claim_or_create_person) + Rolle speaker_manager (global) angelegt");

  const { data: ev, error: e4 } = await admin.from("event").select("id").eq("slug", "summit-27").single(); if (e4) throw e4;
  const topic = `programme-board:${ev.id}`;
  const claims = JSON.parse(Buffer.from(s.session.access_token.split(".")[1], "base64url").toString());
  log(`3 Login ok, Token-Rolle: ${claims.role}, sub gesetzt: ${Boolean(claims.sub)}`);
  await user.realtime.setAuth(s.session.access_token);

  const received = [];
  ch = user.channel(topic, { config: { private: true, broadcast: { self: true } } });
  ch.on("broadcast", { event: "*" }, (msg) => received.push(msg));
  const status = await new Promise((resolve) => {
    const t = setTimeout(() => resolve("TIMEOUT (10 s)"), 10000);
    ch.subscribe((st, err) => { if (st !== "SUBSCRIBED" && st !== "CHANNEL_ERROR" && st !== "TIMED_OUT" && st !== "CLOSED") return; clearTimeout(t); resolve(st + (err ? ` ${err.message}` : "")); });
  });
  log(`4 Kanal ${topic}: ${status}`);

  if (status === "SUBSCRIBED") {
    const r = await ch.send({ type: "broadcast", event: "probe", payload: { from: "client" } });
    log(`5a Client-Send (Policy programme_board_send): ${r}`);
    const { data: sess } = await admin.from("session").select("id,title_de").eq("event_id", ev.id).ilike("title_de", "DEMO%").limit(1).maybeSingle();
    if (sess) {
      const { error: e6 } = await admin.from("session").update({ title_de: sess.title_de }).eq("id", sess.id);
      log(`5b DB-Trigger per No-op-Update „${sess.title_de}": ${e6 ? e6.message : "ok"}`);
    } else log("5b keine DEMO-Session gefunden, DB-Trigger-Test übersprungen");
    await new Promise((r) => setTimeout(r, 3000));
    log(`6 Empfangen: ${received.length} Nachricht(en)${received.length ? " → " + received.map((m) => `${m.event}:${JSON.stringify(m.payload)}`).join(" | ") : ""}`);
  }
} catch (e) {
  console.error("FEHLER:", e?.message || e);
} finally {
  try { if (ch && user) await user.removeChannel(ch); if (user) await user.auth.signOut(); } catch {}
  if (personId) {
    await admin.from("role_assignment").delete().eq("person_id", personId);
    await admin.from("person_email").delete().eq("person_id", personId);
    const { error } = await admin.from("person").delete().eq("id", personId);
    if (error) console.error("Person nicht gelöscht:", error.message);
  }
  if (userId) { const { error } = await admin.auth.admin.deleteUser(userId); if (error) console.error("Testnutzer nicht gelöscht:", error.message); }
  log("7 Testnutzer, Person und Rolle wieder entfernt");
  process.exit(0);
}
