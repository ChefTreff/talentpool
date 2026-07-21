"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-Client für den Browser (Teilnehmer-Portal). anon-Key + RLS.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
