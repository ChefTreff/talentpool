import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";

/**
 * Videos und Links stehen seit ADM-063 in der zentralen Medienverwaltung.
 * Die alte Adresse bleibt als Weiterleitung, damit Lesezeichen und Verweise
 * in der Doku nicht ins Leere laufen — mit Gate, wie jede Seite unter /admin.
 */
export default async function AdminVideosPage() {
  await requireAdminSection("videos", "/admin/medien");
  redirect("/admin/medien?bereich=videos");
}
