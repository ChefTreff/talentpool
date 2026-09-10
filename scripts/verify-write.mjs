import { createClient } from "@supabase/supabase-js";
import { url, publicKey as anon, secretKey as svc, requireEnv } from "./supabase-env.mjs";

// Das Skript braucht beides: den geheimen Schlüssel für `generateLink` und den
// öffentlichen für den angemeldeten Client, mit dem geschrieben wird.
requireEnv(true);
requireEnv(false);

const admin = createClient(url, svc, { auth: { persistSession: false } });
const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email: "konrad@chef-treff.de" });
if (le) { console.error("generateLink:", le.message); process.exit(1); }

const authed = createClient(url, anon, { auth: { persistSession: false } });
const { error: ve } = await authed.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (ve) { console.error("verifyOtp:", ve.message); process.exit(1); }
console.log("Session (authenticated):        ok");

const { data: pid } = await authed.rpc("current_person_id");
console.log("current_person_id():            ", pid ? pid.slice(0,8)+"…" : "NULL");

const { error: okErr } = await authed.from("person").update({ first_name: "Konrad", last_name: "Gruner", country: "DE" }).eq("id", pid);
console.log("Whitelist-Update (Name/Land):   ", okErr ? "FEHLER "+okErr.message : "ok");

const { error: badErr } = await authed.from("person").update({ engagement_score: 99 }).eq("id", pid);
console.log("Verbotene Spalte engagement:    ", badErr ? "korrekt abgelehnt ("+(badErr.code||badErr.message)+")" : "⚠️ ERLAUBT — Grant-Leck!");

const { error: insErr } = await authed.from("person_interest").insert({ person_id: pid, vocabulary: "interests", term_key: "tech-ai" });
console.log("n:m insert (person_interest):   ", insErr ? "FEHLER "+insErr.message : "ok");
const { error: delErr } = await authed.from("person_interest").delete().eq("person_id", pid).eq("vocabulary","interests").eq("term_key","tech-ai");
console.log("n:m delete (Round-Trip):        ", delErr ? "FEHLER "+delErr.message : "ok (sauber, kein Rest)");
