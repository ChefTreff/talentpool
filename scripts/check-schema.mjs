// Smoke-Test: liest .env.local (via `node --env-file=.env.local`) und prüft über
// den anon-Key, ob das Schema live ist. Gibt nur Zähler/Labels aus — keine Keys.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon || url.includes("<") || anon.includes("<")) {
  console.error("❌ .env.local: URL/ANON_KEY fehlen oder noch Platzhalter.");
  process.exit(1);
}

const supabase = createClient(url, anon);

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
