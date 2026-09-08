"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE, type Locale } from "./shared";

/**
 * Sprache umschalten: Cookie setzen und — falls eingeloggt — die Präferenz
 * am Profil mitziehen, damit sie auf allen Geräten gilt.
 */
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return { ok: false as const };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // RLS erlaubt nur die eigene Zeile — kein service_role nötig.
    await supabase
      .from("person")
      .update({ preferred_language: locale })
      .eq("auth_user_id", user.id);
  }

  revalidatePath("/", "layout");
  return { ok: true as const };
}
