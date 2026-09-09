import { createClient } from "@supabase/supabase-js";
import { url, secretKey, requireEnv } from "./supabase-env.mjs";
requireEnv(true);
const s = createClient(url, secretKey, { auth: { persistSession: false } });
const { data, error } = await s.auth.admin.generateLink({
  type: "magiclink",
  email: "konrad@chef-treff.de",
  options: { redirectTo: "http://localhost:3000/auth/callback" },
});
if (error) { console.error("ERR", error.message); process.exit(1); }
const h = data.properties?.hashed_token;
console.log("CALLBACK_URL=http://localhost:3000/auth/callback?token_hash=" + encodeURIComponent(h) + "&type=magiclink");
