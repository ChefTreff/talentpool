import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Serverseitige Staff-Absicherung für den Admin-Bereich.
 * Prüft die Session (NICHT service_role) via is_staff(). Redirect sonst.
 * Nach diesem Aufruf darf gefahrlos der service_role-Client genutzt werden.
 */
export async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) redirect("/");
  return user;
}
