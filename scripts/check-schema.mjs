// Smoke-Test: liest .env.local (via `node --env-file=.env.local`) und prüft über
// den anon-Key, ob das Schema live ist. Gibt nur Zähler/Labels aus — keine Keys.
import { createClient } from "@supabase/supabase-js";
import { url, publicKey, requireEnv } from "./supabase-env.mjs";

requireEnv();

const supabase = createClient(url, publicKey);

const { count, error } = await supabase
  .from("vocab_term")
  .select("*", { count: "exact", head: true });

if (error) {
  console.error("❌ Query fehlgeschlagen:", error.message);
  console.error("   (Existiert vocab_term nicht, hat der db push dieses Projekt evtl. nicht erreicht.)");
  process.exit(1);
}

console.log(`✅ Verbindung ok — vocab_term: ${count} Einträge.`);

const { data: vocs } = await supabase.from("vocab_term").select("vocabulary");
const distinct = [...new Set((vocs ?? []).map((v) => v.vocabulary))].sort();
console.log(`   Vokabulare (${distinct.length}): ${distinct.join(", ")}`);
