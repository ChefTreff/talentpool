import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { hiringOptionen, type HiringEintrag } from "@/components/partner/hiring";
import type { GastRow } from "@/components/partner/gaeste";
import type { TourStopp } from "@/components/partner/tour";
import { profilFelderAus } from "@/components/partner/profil";
import type { OffeneFragen } from "./FragenFreigabe";
import { gastFotoAdressen } from "@/lib/partner/gaeste";
import { instanzKennung, stoppWahlMitTexten } from "@/lib/partner/instanz";
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

/**
 * Eine Organisation im Detail: Status, Stand, Kontakte, Checkliste, Deals.
 *
 * `?instanz=<Stopp>` wählt bei mehreren Tour-Stopps den, der unter „Company Tour“ steht (QS-079, dieselbe Regel wie im Partnerportal).
 */
export default async function AdminPartnerOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ instanz?: string | string[] }>;
}) {
  const { org } = await params;
  const { instanz } = await searchParams;
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
  // K-94 Stufe 2a (PART-107): „Wen sucht ihr?“ der Organisation — dieselbe RPC wie unter „Eure Daten“; das Team darf alles (`partner_can_edit`).
  const { data: hiringZeilen } = await supabase.rpc("partner_org_hiring", { p_org_id: org });
  // QS-079: bei mehreren Stopps wählt der Umschalter einen — dieselbe Regel und dieselbe Beschriftung wie im Partnerportal (`stoppWahlMitTexten`).
  const tour = stoppWahlMitTexten((tourZeilen ?? []) as TourStopp[], instanzKennung(instanz), t.partnerTour);
  // PART-045: eigene Bewerbungsfragen des Partners, die noch auf die Freigabe warten.
  const { data: formatZeilen } = await supabase.rpc("partner_format_sessions", { p_org_id: org });
  const formate = (formatZeilen ?? []) as {
    id: string;
    format: string;
    title_de: string | null;
    format_details: Record<string, unknown> | null;
    stage_id: string | null;
    stage_name: string | null;
  }[];
  const { data: offeneZeilen } = formate.length
    ? await supabase
        .from("session_question")
        .select("id, session_id, label_de, label_en, type, options, purpose")
        .in("session_id", formate.map((x) => x.id))
        .is("question_id", null)
        .is("approved_at", null)
        .order("created_at")
    : { data: [] };
  // PART-150: mit dem Tisch des Gespräches und allen Inhaltsfeldern der Frage — die Freigabe bündelt Gespräche desselben Tisches mit denselben offenen Fragen.
  const offeneFragen: OffeneFragen[] = formate
    .map((x) => ({
      sessionId: x.id,
      sessionTitle: x.title_de ?? "—",
      // Nur die Interview Tables bündeln nach Tisch: dort kommen dieselben Fragen von der Übernahme (`partner_copy_table_questions`).
      stageId: x.format === "interview_table" ? x.stage_id : null,
      stageName: x.stage_name,
      fragen: (
        (offeneZeilen ?? []) as {
          id: string;
          session_id: string;
          label_de: string | null;
          label_en: string | null;
          type: string | null;
          options: unknown;
          purpose: string | null;
        }[]
      )
        .filter((f) => f.session_id === x.id)
        .map((f) => ({ id: f.id, label_de: f.label_de ?? "—", label_en: f.label_en, type: f.type, options: f.options ?? null, purpose: f.purpose })),
    }))
    .filter((x) => x.fragen.length > 0);

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
      tourStopp={tour.gewaehlt}
      tourInstanzen={tour.instanzen}
      tourFelder={profilFelderAus((name) => vgroup(vocab, name))}
      tourTexts={t.partnerTour}
      // PART-054: ob der Partner Goodies zur Masterclass einsendet — dieselbe Maske wie im Portal.
      masterclasses={formate.filter((x) => x.format === "masterclass")}
      goodiesTexts={{
        question: t.partnerMasterclass.goodiesQuestion,
        yes: t.partnerMasterclass.goodiesYes,
        no: t.partnerMasterclass.goodiesNo,
        none: t.partnerMasterclass.goodiesNone,
        hintYes: t.partnerMasterclass.goodiesHintYes,
        wiki: t.partnerMasterclass.goodiesWiki,
        saved: t.partnerMasterclass.goodiesSaved,
      }}
      offeneFragen={offeneFragen}
      frageTypen={Object.fromEntries(
        ["text", "textarea", "select", "multiselect", "boolean", "url", "number"].map((typ) => [
          typ,
          (t.partnerBewerbung as Record<string, string>)[`type_${typ}`] ?? typ,
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
      hiring={{
        eintraege: (hiringZeilen ?? []) as HiringEintrag[],
        optionen: hiringOptionen((name) => vgroup(vocab, name)),
        texts: t.partnerHiring,
      }}
      einwilligung={t.logoWandEinwilligung}
      common={{
        cancel: t.common.cancel,
        none: t.common.none,
        save: t.common.save,
        close: t.common.close,
        required: t.common.required,
        unsaved: t.common.unsaved,
      }}
      rpcMessages={t.rpc}
    />,
  );
}
