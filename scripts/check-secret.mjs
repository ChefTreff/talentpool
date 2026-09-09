// Prüft, ob der lokale Secret Key (service_role) gültig ist — ohne ihn auszugeben.
// Aufruf: node --env-file=.env.local scripts/check-secret.mjs
// Liest eine Tabelle, die nur service_role sehen darf (staff_user). Fehler "Invalid API key" = Schlüssel falsch/Platzhalter.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const shape = key.startsWith("sb_secret_") ? "sb_secret_ (neu)" : key.startsWith("eyJ") ? "JWT (alt)" : "unbekannt";
console.log(`Secret Key: ${key ? `${key.length} Zeichen, Form ${shape}` : "FEHLT"}`);
if (!url || !key) { console.error("URL oder Secret Key fehlt in der Env."); process.exit(1); }
if (key.length < 30) { console.error("Zu kurz für einen echten Schlüssel (echte Secret Keys haben rund 40 Zeichen). Wert im Supabase-Dashboard unter Project Settings → API Keys → Secret keys kopieren."); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const { count, error } = await sb.from("staff_user").select("*", { count: "exact", head: true });
if (error) { console.error(`❌ service_role-Zugriff fehlgeschlagen: ${error.message}`); process.exit(1); }
console.log(`✅ service_role ok — staff_user: ${count} Eintrag/Einträge.`);
