import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: persons, error } = await s
  .from("person")
  .select("id, auth_user_id, source_first, person_email(email, is_primary)")
  .not("auth_user_id", "is", null);
if (error) { console.error("ERR person:", error.message); process.exit(1); }

console.log("Eingeloggte Personen:", persons.length);
for (const p of persons) {
  const primary = (p.person_email || []).find((e) => e.is_primary)?.email ?? "(keine primaere)";
  const emails = (p.person_email || []).length;
  console.log(`  person ${p.id.slice(0,8)}… | auth ${p.auth_user_id.slice(0,8)}… | src=${p.source_first} | primaer=${primary} | #mails=${emails}`);
}

if (persons.length) {
  const rows = persons.map((p) => ({ auth_user_id: p.auth_user_id, display_name: "ChefTreff Team" }));
  const { error: upErr } = await s.from("staff_user").upsert(rows, { onConflict: "auth_user_id" });
  console.log(upErr ? ("staff_user Fehler: " + upErr.message) : `→ ${rows.length} Person(en) als staff_user eingetragen`);
}
const { data: staff } = await s.from("staff_user").select("auth_user_id");
console.log("staff_user gesamt:", (staff || []).length);
