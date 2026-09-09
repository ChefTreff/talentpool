"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Supabase-Client für den Browser (Teilnehmer-Portal). anon-Key + RLS.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    supabaseUrl()!,
    supabaseAnonKey()!,
  );
}
