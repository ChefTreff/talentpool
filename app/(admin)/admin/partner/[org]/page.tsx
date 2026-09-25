import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import type { GastRow } from "@/components/partner/gaeste";
import type { TourStopp } from "@/components/partner/tour";
import type { OffeneFragen } from "./FragenFreigabe";
import { gastFotoAdressen } from "@/lib/partner/gaeste";
import { partnerAdminShell } from "../shell";
import { OrgDetail } from "./OrgDetail";
import type {
  AdminContact,
  AdminDeal,
  AdminDeliverable,
  AdminTalkSpeaker,
  OverviewPayload,
  RoleAssignment,
} from "./types";

export const dynamic = "force-dynamic";

/** Eine Organisation im Detail: Status, Stand, Kontakte, Checkliste, Deals. */
export default async function AdminPartnerOrgPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const shell = await partnerAdminShell(`/admin/partner/${org}`);
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, isAdmin, frame } = shell;

  const { data: overviewData, error } = await supabase.rpc("partner_overview", {
    p_org_id: org,
  });
  // P0002 `org_not_found` heisst hier schlicht: die Adresse stimmt nicht.
  if (error?.code === "P0002") notFound();
  const overview = overviewData as OverviewPayload | null;
  if (!overview) {
    return frame(
      t.adminPartner.title,
      t.adminPartner.lead,
      <EmptyState title={t.adminPartner.emptyTitle} description={t.adminPartner.emptyBody} />,
    );
  }

  const [{ data: contacts }, { data: deliverables }, { data: deals }, { data: speakerZeilen }, vocab] = await Promise.all([
    supabase.rpc("partner_contacts", { p_org_id: org }),
    supabase.rpc("my_deliverables", { p_org_id: org }),
    supabase.rpc("partner_deals", { p_org_id: org }),
    // PART-091: Speaker der gebuchten Slots mit ihrem Zugangsweg — dieselbe RPC wie unter /partner/talk.
    supabase.rpc("partner_speakers", { p_org_id: org }),
    loadVocabMap(supabase, locale),
  ]);
  // PART-046: Stopps der Company Tour mit den Angaben des Partners — dieselbe RPC wie unter /partner/company-tour.
  const { data: tourZeilen } = await supabase.rpc("partner_company_tour", { p_org_id: org });
  // PART-045: eigene Bewerbungsfragen des Partners, die noch auf die Freigabe warten.
  const { data: formatZeilen } = await supabase.rpc("partner_format_sessions", { p_org_id: org });
  const formate = (formatZeilen ?? []) as { id: string; title_de: string | null }[];
  const { data: offeneZeilen } = formate.length
    ? await supabase
        .from("session_question")
        .select("id, session_id, label_de, type, purpose")
        .in("session_id", formate.map((x) => x.id))
        .is("question_id", null)
        .is("approved_at", null)
        .order("created_at")
    : { data: [] };
  const offeneFragen: OffeneFragen[] = formate
    .map((x) => ({
      sessionId: x.id,
      sessionTitle: x.title_de ?? "—",
      fragen: ((offeneZeilen ?? []) as { id: string; session_id: string; label_de: string | null; type: string | null; purpose: string | null }[])
        .filter((f) => f.session_id === x.id)
        .map((f) => ({ id: f.id, label_de: f.label_de ?? "—", type: f.type, purpose: f.purpose })),
    }))
    .filter((x) => x.fragen.length > 0);
  const alsListe = (m: Record<string, string>) => Object.entries(m).map(([key, label]) => ({ key, label }));

  const contactRows = (contacts ?? []) as AdminContact[];

  // PART-081: Gäste der Standbühne — dieselbe Liste wie im Partnerportal (Regel vom 22.09.).
  let gaeste: GastRow[] = [];
  if (overview.has_stage) {
    const { data: gastZeilen } = await supabase.rpc("partner_stage_guests", { p_org_id: org });
    const roh = (gastZeilen ?? []) as Omit<GastRow, "photo_url">[];
    const adressen = await gastFotoAdressen(
      supabase,
      roh.map((g) => g.photo_path).filter((pfad): pfad is string => !!pfad),
    );
    gaeste = roh.map((g) => ({ ...g, photo_url: g.photo_path ? adressen.get(g.photo_path) ?? null : null }));
  }

  /**
   * Bühnen-Editoren nachschlagen. `roles_of_person` verlangt `admin` — für
   * eine Bereichsleitung Partner bleibt die Spalte deshalb leer, und die
   * Oberfläche sagt das auch.
   */
  const stageRoles: Record<string, RoleAssignment> = {};
  if (isAdmin) {
    const lists = await Promise.all(
      contactRows.map((c) => supabase.rpc("roles_of_person", { p_person_id: c.person_id })),
    );
    lists.forEach(({ data }, i) => {
      const hit = ((data ?? []) as RoleAssignment[]).find(
        (r) => r.role === "standbuehne_editor" && r.scope_id === org && r.active,
      );
      if (hit) stageRoles[contactRows[i].person_id] = hit;
    });
  }

  const name = overview.org.communication_name || overview.org.legal_name || org;

  return frame(
    name,
    `${t.adminPartner.detailLead}${overview.org.website ? ` · ${overview.org.website}` : ""}`,
    <OrgDetail
      overview={overview}
      contacts={contactRows}
      gaeste={gaeste}
      guestTexts={t.partnerGuests}
      talkSpeakers={((speakerZeilen ?? []) as AdminTalkSpeaker[]).filter((sp) => sp.session_id)}
      tourStopps={(tourZeilen ?? []) as TourStopp[]}
      tourFelder={{
        occupation_status: alsListe(vgroup(vocab, "occupation_status")),
        career_level: alsListe(vgroup(vocab, "career_level")),
        study_field: alsListe(vgroup(vocab, "study_field")),
      }}
      tourTexts={t.partnerTour}
      offeneFragen={offeneFragen}
      frageTypen={Object.fromEntries(
        ["text", "textarea", "select", "multiselect", "boolean", "url", "number"].map((typ) => [
          typ,
          (t.partnerMasterclass as Record<string, string>)[`type_${typ}`] ?? typ,
        ]),
      )}
      deliverables={(deliverables ?? []) as AdminDeliverable[]}
      deals={(deals ?? []) as AdminDeal[]}
      stageRoles={stageRoles}
      isAdmin={isAdmin}
      locale={locale}
      dateLocale={t.meta.dateLocale}
      t={t.adminPartner}
      roleLabels={vgroup(vocab, "contact_role")}
      // Dieselben Texte wie im Partnerportal; nur der Hinweis oben spricht das Team an.
      contactTexts={{ ...t.partnerContacts, ownLoginHint: t.adminPartner.contactsHint }}
      dataTexts={t.partner}
      industries={vgroup(vocab, "industry")}
      common={{
        cancel: t.common.cancel,
        none: t.common.none,
        save: t.common.save,
        close: t.common.close,
        required: t.common.required,
      }}
      rpcMessages={t.rpc}
    />,
  );
}
