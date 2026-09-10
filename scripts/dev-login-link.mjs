/**
 * Lokalen Login-Link erzeugen, ohne eine Mail zu verschicken.
 *
 * `generateLink` ist die Admin-API: sie gibt den Token zurück, statt ihn zu
 * mailen. Damit funktioniert der Login auch, wenn der eingebaute Supabase-
 * Mailer sein Stundenlimit erreicht hat („Email rate limit exceeded").
 *
 * Aufruf:
 *   node --env-file=.env.local scripts/dev-login-link.mjs            # Port 3000
 *   node --env-file=.env.local scripts/dev-login-link.mjs 3001       # Worktree
 *   node --env-file=.env.local scripts/dev-login-link.mjs 3001 /admin/programm
 *   node --env-file=.env.local scripts/dev-login-link.mjs --email=jemand@…
 *   node --env-file=.env.local scripts/dev-login-link.mjs --base=https://…vercel.app
 *
 * Auf macOS landet der Link zusätzlich in der Zwischenablage.
 *
 * Der ausgegebene Link ist ein einmaliger Zugang — nicht weitergeben, nicht in
 * Tickets oder Chats kopieren. Er verfällt nach dem ersten Aufruf.
 */
import { createClient } from "@supabase/supabase-js";
import { url, secretKey, requireEnv } from "./supabase-env.mjs";

requireEnv(true);

const args = process.argv.slice(2);
const emailArg = args.find((a) => a.startsWith("--email="));
const positional = args.filter((a) => !a.startsWith("--"));

const baseArg = args.find((a) => a.startsWith("--base="));
const email = emailArg ? emailArg.slice("--email=".length) : "konrad@chef-treff.de";
const port = positional[0] ?? "3000";
const next = positional[1] ?? "";
// `--base=` für Preview-Deployments; sonst der lokale Server auf dem Port.
const origin = (baseArg ? baseArg.slice("--base=".length) : `http://localhost:${port}`)
  .replace(/\/$/, "");

const callback = new URL("/auth/callback", origin);
if (next) callback.searchParams.set("next", next);

const s = createClient(url, secretKey, { auth: { persistSession: false } });
const { data, error } = await s.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: callback.toString() },
});

if (error) {
  console.error("❌ generateLink:", error.message);
  process.exit(1);
}

const hash = data.properties?.hashed_token;
if (!hash) {
  console.error("❌ Kein token_hash in der Antwort.");
  process.exit(1);
}

const target = new URL(callback.toString());
target.searchParams.set("token_hash", hash);
target.searchParams.set("type", "magiclink");

const link = target.toString();

// Bequemlichkeit auf dem Mac: direkt in die Zwischenablage, dann muss der
// Token nicht aus dem Terminal herausmarkiert werden.
let copied = false;
if (process.platform === "darwin") {
  try {
    const { spawnSync } = await import("node:child_process");
    copied = spawnSync("/usr/bin/pbcopy", { input: link }).status === 0;
  } catch {
    copied = false;
  }
}

console.log(`Login als ${email} auf ${origin}`);
console.log(copied ? "Link liegt in der Zwischenablage. Einmal einfügen und öffnen:\n" : "Link einmal im Browser öffnen:\n");
console.log(link);
