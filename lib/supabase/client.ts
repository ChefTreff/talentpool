"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseBrowserKey, supabaseUrl } from "./env";

/**
 * Supabase-Client für den Browser (Teilnehmer-Portal). anon-Key + RLS.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl()!, supabaseBrowserKey()!);
}
