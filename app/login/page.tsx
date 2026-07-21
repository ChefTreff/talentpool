"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      {status === "sent" ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          Check deine Mails — wir haben dir einen Login-Link an{" "}
          <strong>{email}</strong> geschickt.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="email">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@example.com"
            className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {status === "sending" ? "Sende Link…" : "Login-Link senden"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">{message}</p>
          )}
        </form>
      )}
    </main>
  );
}
