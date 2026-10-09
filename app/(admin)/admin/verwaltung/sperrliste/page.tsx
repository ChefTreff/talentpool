import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";

/**
 * Die Sperrliste wohnt seit ADM-097 als Abschnitt auf `/admin/loeschantraege` (beide gehören zu „Datenschutz“). Die alte
 * Adresse bleibt für gemerkte Links und den Menüpunkt; wer den Abschnitt nicht öffnen darf, bekommt wie immer 404.
 */
export default async function SperrlisteUmleitung() {
  await requireAdminSection("suppression", "/admin/verwaltung/sperrliste");
  redirect("/admin/loeschantraege?ansicht=sperrliste");
}
