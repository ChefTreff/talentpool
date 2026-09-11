import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { ApplicationTable } from "./ApplicationTable";
import { volunteerAdminShell } from "./shell";
import type { VolunteerDay, VolunteerRow } from "./types";

export const dynamic = "force-dynamic";

/** Bewerbungen: Stand setzen, Wünsche lesen, exportieren. */
export default async function AdminVolunteersPage() {
  const shell = await volunteerAdminShell("/admin/volunteers");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: rows }, { data: dayRows }, vocab] = await Promise.all([
    supabase.rpc("volunteer_admin_overview"),
    supabase.rpc("volunteer_days"),
    loadVocabMap(supabase, locale),
  ]);
  const volunteers = (rows ?? []) as VolunteerRow[];
  const open = volunteers.filter((v) => v.status === "applied").length;

  return frame(
    t.adminVolunteers.title,
    `${t.adminVolunteers.lead} · ${volunteers.length}` +
      (open > 0 ? ` · ${open} ${t.adminVolunteers.countOpen}` : ""),
    volunteers.length === 0 ? (
      <EmptyState
        title={t.adminVolunteers.emptyTitle}
        description={t.adminVolunteers.emptyBody}
      />
    ) : (
      <div className="flex flex-col gap-4">
        <div>
          {/* Der Export läuft als Route, damit der Browser die Datei
              herunterlädt statt sie anzuzeigen. */}
          <ButtonLink href="/admin/volunteers/export" variant="secondary" size="sm">
            {t.adminVolunteers.exportCsv}
          </ButtonLink>
        </div>
        <ApplicationTable
          rows={volunteers}
          days={(dayRows ?? []) as VolunteerDay[]}
          areas={vgroup(vocab, "volunteer_area")}
          shirtSizes={vgroup(vocab, "shirt_size")}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.adminVolunteers}
          common={{ none: t.common.none, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      </div>
    ),
  );
}
