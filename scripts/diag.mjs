import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const t of ["vocab_term","person","event","registration","potential_duplicate","staff_user"]) {
  const { data, error } = await s.from(t).select("*").limit(3);
  console.log(t.padEnd(20), error ? ("ERROR " + (error.code||"") + " :: " + error.message) : ("OK " + data.length + " row(s)"));
}
const { data: v } = await s.from("vocab_term").select("vocabulary,key,label_de").limit(5);
console.log("sample vocab_term:", JSON.stringify(v));
