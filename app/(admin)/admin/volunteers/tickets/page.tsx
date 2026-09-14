import { volunteerAdminShell } from "../shell";
import { TicketTable } from "./TicketTable";
import type { VolunteerTicketRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * „Wer hat sein Ticket noch nicht geholt?" — die Liste, die vor dem
 * Schichtplan steht. Einlösen ist der Aktivierungsschritt (Entscheidung E2):
 * wer nach zwei Erinnerungen nicht eingelöst hat, kommt wahrscheinlich nicht.
 */
export default async function VolunteerTicketsPage() {
  const shell = await volunteerAdminShell("/admin/volunteers/tickets");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const { data } = await supabase.rpc("volunteer_tickets_admin", { p_edition_id: null });
  const rows = (data ?? []) as VolunteerTicketRow[];

  return frame(
    t.adminVolunteers.ticketsTitle,
    t.adminVolunteers.ticketsLead,
    <TicketTable rows={rows} locale={locale} t={t.adminVolunteers} />,
  );
}
