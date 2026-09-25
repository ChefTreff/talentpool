"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { LogoWandEinwilligung } from "@/components/partner/LogoWandEinwilligung";
import { ContactList } from "@/components/partner/ContactList";
import { Gaesteliste } from "@/components/partner/Gaesteliste";
import type { GastRow } from "@/components/partner/gaeste";
import type { ProfilFeld, ProfilOption } from "@/components/partner/ProfilAuswahl";
import type { TourStopp as TourStoppZeile } from "@/components/partner/tour";
import { TourStopp } from "@/components/partner/TourStopp";
import {
  BeschreibungFelder,
  RechnungFelder,
  UnternehmenFelder,
  entwurfAus,
  speicherDaten,
  type EureDatenEntwurf,
} from "@/components/partner/EureDaten";
import {
  adminAddStageGuest,
  adminUpdateTourStop,
  adminRegisterStageGuestPhoto,
  adminRemoveContact,
  adminRemoveStageGuest,
  adminSaveOnboarding,
  adminSetCustomerNumber,
  adminSetLogoWhiteningConsent,
  adminTransferPrimary,
  adminUpdateContact,
  adminUpdateStageGuest,
  adminUpsertContact,
  grantStageEditor,
  revokeStageEditor,
  saveBooth,
  setOnboardingStatus,
  setPassTypeChoice,
} from "../actions";
import { ONBOARDING_STATUS } from "../types";
import type {
  AdminContact,
  AdminDeal,
  AdminDeliverable,
  AdminTalkSpeaker,
  OverviewPayload,
  RoleAssignment,
} from "./types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  none: "neutral",
  invited: "warning",
  filled: "accent",
  call_done: "success",
};

const DELIVERABLE_TONE: Record<string, BadgeTone> = {
  open: "neutral",
  submitted: "accent",
  accepted: "success",
  rejected: "error",
  overdue: "warning",
  not_required: "neutral",
};

export function OrgDetail({
  overview,
  contacts,
  gaeste,
  guestTexts,
  talkSpeakers,
  tourStopps,
  tourFelder,
  tourTexts,
  deliverables,
  deals,
  stageRoles,
  isAdmin,
  locale,
  dateLocale,
  t,
  roleLabels,
  contactTexts,
  dataTexts,
  industries,
  common,
  rpcMessages,
}: {
  overview: OverviewPayload;
  contacts: AdminContact[];
  /** Gäste der Standbühne (PART-081); leer, wenn die Organisation keine Standbühne hat. */
  gaeste: GastRow[];
  /** Texte der Gästeliste — dieselben wie im Partnerportal. */
  guestTexts: Strings;
  /** Speaker der gebuchten Slots mit Zugangsweg (PART-091); Pflege im Speaker-Admin. */
  talkSpeakers: AdminTalkSpeaker[];
  /** Stopps der Company Tour mit den Angaben des Partners (PART-046); leer ohne Stopp. */
  tourStopps: TourStoppZeile[];
  /** Vokabulare der gesuchten Profile. */
  tourFelder: Record<ProfilFeld, ProfilOption[]>;
  /** Texte der Stopp-Maske — dieselben wie im Partnerportal. */
  tourTexts: Strings;
  deliverables: AdminDeliverable[];
  deals: AdminDeal[];
  /** Aktive `standbuehne_editor`-Zuweisungen dieser Organisation, je Person. */
  stageRoles: Record<string, RoleAssignment>;
  isAdmin: boolean;
  locale: string;
  dateLocale: string;
  t: Strings;
  /** Bezeichnungen aus dem Vokabular `contact_role`. */
  roleLabels: Record<string, string>;
  /** Texte der Kontaktliste — dieselben wie im Partnerportal, mit Admin-Hinweis. */
  contactTexts: Strings;
  /** Feldtexte von „Eure Daten“ — dieselben wie im Partnerportal (`t.partner`). */
  dataTexts: Strings;
  /** Vokabular `industry` für das Feld Branche. */
  industries: Record<string, string>;
  common: { cancel: string; none: string; save: string; close: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const orgId = overview.org.id;
  const editionId = overview.edition?.edition_id ?? null;

  const [status, setStatus] = useState(overview.edition?.onboarding_status ?? "none");
  const [passType, setPassType] = useState(overview.edition?.pass_type_choice ?? "");
  // „Eure Daten“ mit denselben Feldern wie im Partnerportal (Regel vom 22.09.).
  const [daten, setDaten] = useState<EureDatenEntwurf>(() => entwurfAus(overview));
  const [kundennummer, setKundennummer] = useState(overview.org.customer_number ?? "");
  const setDatenTeil = (part: Partial<EureDatenEntwurf>) => setDaten((d) => ({ ...d, ...part }));
  const [booth, setBooth] = useState({
    booth_number: overview.booth?.booth_number ?? "",
    booth_type: overview.booth?.booth_type ?? "",
    segment: overview.booth?.segment ?? "",
    length_m: overview.booth?.length_m == null ? "" : String(overview.booth.length_m),
    width_m: overview.booth?.width_m == null ? "" : String(overview.booth.width_m),
    backdrop_w_mm:
      overview.booth?.backdrop_w_mm == null ? "" : String(overview.booth.backdrop_w_mm),
    backdrop_h_mm:
      overview.booth?.backdrop_h_mm == null ? "" : String(overview.booth.backdrop_h_mm),
    notes: "",
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const label = (d: AdminDeliverable) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;

  /**
   * Bühnen-Editor je Kontakt (nur Admins vergeben Rollen). Der Hauptkontakt
   * bekommt die Rolle mit der Buchung automatisch (Trigger, Migration 0058) —
   * dort ist nichts zu vergeben.
   */
  const stageEditorCell = (c: AdminContact) => {
    const assignment = stageRoles[c.person_id];
    if (c.roles.includes("primary_ops")) return <span className="ct-help">{t.stageEditorAutomatic}</span>;
    if (!isAdmin) return <span className="ct-help">{t.stageEditorAdminOnly}</span>;
    return assignment?.active ? (
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => run(revokeStageEditor(assignment.id, orgId), t.saved)}
      >
        {t.stageEditorRevoke}
      </Button>
    ) : (
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !editionId}
        onClick={() => run(grantStageEditor(c.person_id, orgId, editionId as string), t.saved)}
      >
        {t.stageEditorGrant}
      </Button>
    );
  };

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  function onBooth() {
    const num = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
    run(
      saveBooth(
        orgId,
        {
          booth_number: booth.booth_number.trim() || null,
          booth_type: booth.booth_type.trim() || null,
          segment: booth.segment.trim() || null,
          length_m: num(booth.length_m),
          width_m: num(booth.width_m),
          backdrop_w_mm: num(booth.backdrop_w_mm),
          backdrop_h_mm: num(booth.backdrop_h_mm),
          ...(booth.notes.trim() ? { notes: booth.notes.trim() } : {}),
        },
        editionId,
      ),
      t.saved,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t.statusTitle}
          description={
            overview.edition
              ? `${t.invitedOn} ${
                  overview.edition.invited_at
                    ? dateTime.format(new Date(overview.edition.invited_at))
                    : common.none
                }`
              : t.noEditionBody
          }
        />
        <div className="flex flex-wrap items-end gap-2">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{t[`status_${status}`] ?? status}</Badge>
          <Field label={t.colStatus} htmlFor="ob-status">
            <Select
              id="ob-status"
              className="w-48"
              value={status}
              options={ONBOARDING_STATUS.map((s) => ({ value: s, label: t[`status_${s}`] ?? s }))}
              onChange={(e) => setStatus(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            disabled={pending || !overview.edition}
            onClick={() => run(setOnboardingStatus(orgId, status, editionId), t.saved)}
          >
            {common.save}
          </Button>
        </div>
        <p className="ct-help mt-2">{t.statusHint}</p>

        {/* Pass-Typ der Talente-Tickets.

            Steht hier und nicht bei den Kontingenten, weil er zur Edition des
            Partners gehört und nicht zum einzelnen Kontingent — und weil er
            beim Anlegen aus der Partnerkategorie vorbelegt wird (Migration
            0105). „Aus der Partnerkategorie" ist ein eigener Eintrag und nicht
            dasselbe wie „Talent": er folgt dem Org-Typ, auch wenn der sich
            später ändert. */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
          <Field label={t.ticketPassLabel} htmlFor="pass-type" hint={t.ticketPassHint}>
            <Select
              id="pass-type"
              className="w-56"
              value={passType}
              placeholder={t.ticketPassFallback}
              options={[
                { value: "talent", label: t.ticketPassTalent },
                { value: "startup", label: t.ticketPassStartup },
              ]}
              onChange={(e) => setPassType(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            variant="secondary"
            disabled={
              pending ||
              !overview.edition ||
              passType === (overview.edition?.pass_type_choice ?? "")
            }
            onClick={() =>
              startTransition(async () => {
                const res = await setPassTypeChoice(orgId, passType, editionId);
                if (!res.ok) {
                  toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
                  return;
                }
                // Die Kontingente ziehen über den Trigger nach. Das sagen wir,
                // statt es still geschehen zu lassen — an einem aktiven
                // Kontingent hängt ein Coupon in vivenu.
                toast(
                  "success",
                  res.data.allocations > 0
                    ? `${t.saved} ${res.data.allocations} ${t.ticketPassAllocations}`
                    : t.saved,
                );
                router.refresh();
              })
            }
          >
            {common.save}
          </Button>
        </div>

        <dl className="mt-4 grid gap-2 md:grid-cols-3">
          <div>
            <dt className="ct-eyebrow text-muted">{t.colChecklist}</dt>
            <dd className="text-ink">
              {overview.checklist
                ? `${overview.checklist.done}/${overview.checklist.total}` +
                  (overview.checklist.overdue > 0
                    ? ` · ${overview.checklist.overdue} ${t.shortOverdue}`
                    : "")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="ct-eyebrow text-muted">{t.sessions}</dt>
            <dd className="text-ink">{overview.sessions_count}</dd>
          </div>
          <div>
            <dt className="ct-eyebrow text-muted">{t.stage}</dt>
            <dd className="text-ink">{overview.has_stage ? t.yes : t.no}</dd>
          </div>
        </dl>
      </Card>

      <AbschnittsNavigation

        label={t.sectionsLabel}

        items={[

          { id: "daten", label: t.dataTitle },

          { id: "stand", label: t.boothTitle },

          { id: "kontakte", label: t.contactsTitle },

          { id: "deals", label: t.dealsTitle },

          { id: "gebucht", label: t.bookedTitle },

        ]}

      />


      {/* PART-059/061: was der Partner unter „Eure Daten“ pflegt — hier sieht und
          korrigiert es das Team, über dieselbe RPC. Dazu die Kundennummer, die nur
          das Team setzt (der Partner sieht sie). */}
      <Card id="daten">
        <CardHeader title={t.dataTitle} description={t.dataLead} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.customerNumberAdmin} htmlFor="d-kundennummer" hint={t.customerNumberAdminHint}>
            <Input
              id="d-kundennummer"
              value={kundennummer}
              autoComplete="off"
              onChange={(e) => setKundennummer(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || kundennummer.trim() === (overview.org.customer_number ?? "")}
              onClick={() => run(adminSetCustomerNumber(orgId, kundennummer), t.customerNumberSaved)}
            >
              {t.customerNumberSave}
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <UnternehmenFelder draft={daten} set={setDatenTeil} t={dataTexts} />
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <BeschreibungFelder
            draft={daten}
            set={setDatenTeil}
            t={dataTexts}
            industries={industries}
            none={common.none}
          />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <RechnungFelder draft={daten} set={setDatenTeil} t={dataTexts} />
        </div>
        <div className="mt-6">
          <Button
            disabled={pending}
            onClick={() => run(adminSaveOnboarding(orgId, editionId, speicherDaten(daten)), t.dataSaved)}
          >
            {t.dataSave}
          </Button>
        </div>
      </Card>

      <Card id="stand">
        <CardHeader title={t.boothTitle} description={t.boothLead} />
        <div className="grid gap-4 md:grid-cols-4">
          {(
            [
              ["booth_number", t.boothNumber],
              ["booth_type", t.boothType],
              ["segment", t.boothSegment],
              ["length_m", t.boothLength],
              ["width_m", t.boothWidth],
              ["backdrop_w_mm", t.boothBackdropW],
              ["backdrop_h_mm", t.boothBackdropH],
            ] as const
          ).map(([key, text]) => (
            <Field key={key} label={text} htmlFor={`b-${key}`}>
              <Input
                id={`b-${key}`}
                value={booth[key]}
                onChange={(e) => setBooth((b) => ({ ...b, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label={t.boothNotes} htmlFor="b-notes" className="md:col-span-4">
            <Textarea
              id="b-notes"
              rows={2}
              value={booth.notes}
              onChange={(e) => setBooth((b) => ({ ...b, notes: e.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button disabled={pending || !overview.edition} onClick={onBooth}>
            {common.save}
          </Button>
        </div>
      </Card>

      {/* Logo-Wand (PART-053, Regel vom 22.09.: was ein Portal kann, kann der Admin auch).
          Dieselbe Komponente wie im Partner-Portal, dieselbe RPC — gebraucht wird der Weg,
          wenn ein Partner die Erlaubnis am Telefon gibt. */}
      <Card>
        <CardHeader title={t.logoWallTitle} description={t.logoWallLead} />
        <LogoWandEinwilligung
          grantedAt={overview.edition?.logo_whitening_consent_at ?? null}
          canEdit={Boolean(overview.edition)}
          onSet={async (granted) => {
            const res = await adminSetLogoWhiteningConsent({
              orgId: overview.org.id,
              granted,
              editionId: overview.edition?.edition_id ?? null,
            });
            return res.ok ? { ok: true } : { ok: false, key: res.key };
          }}
          dateLocale={dateLocale}
          t={t.logoWall as unknown as Record<string, string>}
          rpcMessages={rpcMessages}
        />
      </Card>

      <Card id="kontakte">
        <CardHeader title={t.contactsTitle} description={`${t.contactsLead} · ${contacts.length}`} />
        {/* Dieselbe Liste wie im Partnerportal (Regel vom 22.09.): einladen,
            bearbeiten, löschen, Hauptkontakt übertragen — über dieselben RPCs.
            Nur die Spalte „Bühnen-Editor" gibt es hier zusätzlich. */}
        <ContactList
          orgId={orgId}
          contacts={contacts}
          canManage
          roleLabels={roleLabels}
          actions={{
            invite: adminUpsertContact,
            update: adminUpdateContact,
            remove: adminRemoveContact,
            transferPrimary: adminTransferPrimary,
          }}
          extraColumn={{ header: t.colStageEditor, cell: stageEditorCell }}
          showLegend={false}
          dateLocale={dateLocale}
          t={contactTexts}
          common={{
            save: common.save,
            cancel: common.cancel,
            none: common.none,
            close: common.close,
            required: common.required,
          }}
          rpcMessages={rpcMessages}
        />
      </Card>

      {overview.has_stage && (
        <Card id="gaeste">
          <CardHeader title={t.guestsTitle} description={`${t.guestsLead} · ${gaeste.length}`} />
          {/* Dieselbe Liste wie unter /partner/buehne/gaeste (Regel vom 22.09.), über dieselben RPCs. */}
          <Gaesteliste
            orgId={orgId}
            gaeste={gaeste}
            canManage
            actions={{
              add: adminAddStageGuest,
              update: adminUpdateStageGuest,
              remove: adminRemoveStageGuest,
              registerPhoto: adminRegisterStageGuestPhoto,
            }}
            mitKopf={false}
            dateLocale={dateLocale}
            t={guestTexts}
            rpcMessages={rpcMessages}
          />
        </Card>
      )}

      {tourStopps.map((x) => (
        <Card key={x.stop_id} id={`tour-${x.stop_id}`}>
          <CardHeader
            title={tourTexts.stopTitle.replace("{n}", String(x.sort_order)).replace("{tour}", x.tour_name)}
            description={t.tourStopLead}
          />
          {/* PART-046: dieselbe Maske wie unter /partner/company-tour, über dieselbe RPC.
              Tour, Reihenfolge und Zeiten pflegt das Team unter Company Tours. */}
          <TourStopp
            stopp={x}
            felder={tourFelder}
            canEdit
            save={adminUpdateTourStop}
            dateLocale={dateLocale}
            t={tourTexts}
            rpcMessages={rpcMessages}
          />
          <Link href="/admin/company-tours" className="ct-link mt-4 inline-block">
            {t.tourToAdmin}
          </Link>
        </Card>
      ))}

      {talkSpeakers.length > 0 && (
        <Card id="speaker">
          <CardHeader title={t.talkSpeakersTitle} description={`${t.talkSpeakersLead} · ${talkSpeakers.length}`} />
          {/* PART-091: welcher Speaker einen eigenen Zugang hat und bei welchem die Kommunikation
              über den Operations-Kontakt läuft. Gepflegt wird im Speaker-Admin — dort hebt das
              Entfernen des Kontakts die Umleitung auf. */}
          <ul className="flex flex-col divide-y divide-border">
            {talkSpeakers.map((sp) => (
              <li
                key={`${sp.profile_id}-${sp.session_id}`}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-48">
                  <Link href={`/admin/speaker/${sp.profile_id}`} className="ct-link">
                    {sp.display_name || t.talkSpeakerUnnamed}
                  </Link>
                  <p className="ct-help">{sp.session_title ?? "—"}</p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <Badge tone={sp.mail_contact_name ? "accent" : "neutral"}>
                    {sp.mail_contact_name ? t.talkSpeakerManaged : t.talkSpeakerOwn}
                  </Badge>
                  {sp.mail_contact_name && (
                    <span className="ct-help">{t.talkSpeakerVia.replace("{kontakt}", sp.mail_contact_name)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title={t.checklistTitle}
          description={`${t.checklistLead} · ${deliverables.length}`}
        />
        <Table>
          <Thead>
            <Th>{t.colDeliverable}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{t.colDue}</Th>
            <Th>{t.colSubmitted}</Th>
          </Thead>
          <Tbody>
            {deliverables.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <span className="ct-label text-ink">{label(d)}</span>
                  <div className="ct-help">
                    {d.key}
                    {!d.required && ` · ${t.optional}`}
                    {d.fulfilled_by_sku && ` · ${t.fulfilledBy} ${d.fulfilled_by_sku}`}
                  </div>
                  {d.review_note && <div className="ct-help text-error-ink">{d.review_note}</div>}
                </Td>
                <Td>
                  <Badge tone={DELIVERABLE_TONE[d.status] ?? "neutral"}>
                    {t[`deliverable_${d.status}`] ?? d.status}
                  </Badge>
                </Td>
                <Td className="text-muted tabular-nums">
                  {d.due_at ? dateTime.format(new Date(d.due_at)) : "—"}
                </Td>
                <Td className="text-muted tabular-nums">
                  {d.submitted_at ? dateTime.format(new Date(d.submitted_at)) : "—"}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      <Card id="deals">
        <CardHeader title={t.dealsTitle} description={t.dealsLead} />
        {deals.length === 0 ? (
          <p className="ct-help">{t.dealsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {deals.map((d) => (
              <li key={d.hubspot_deal_id} className="rounded-ct-md border p-3">
                <div className="ct-label text-ink">{d.deal_name ?? d.hubspot_deal_id}</div>
                <div className="ct-help">
                  {d.hubspot_deal_id}
                  {d.ingested_at && ` · ${dateTime.format(new Date(d.ingested_at))}`}
                </div>
                {d.line_items && d.line_items.length > 0 && (
                  <ul className="ct-help mt-2 flex flex-col gap-1">
                    {d.line_items.map((line, i) => (
                      <li key={`${d.hubspot_deal_id}-${i}`}>
                        {line.sku ?? "—"} · {line.name ?? ""} · {line.qty ?? ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="ct-help mt-3">{t.dealsReprocessHint}</p>
      </Card>

      <Card id="gebucht">
        <CardHeader title={t.bookedTitle} description={t.bookedLead} />
        {overview.products.length === 0 ? (
          <p className="ct-help">{t.bookedEmpty}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{t.colProduct}</Th>
              <Th numeric>{t.colQty}</Th>
              <Th>{t.colStatus}</Th>
            </Thead>
            <Tbody>
              {overview.products.map((p) => (
                <Tr key={p.sku}>
                  <Td>
                    {(locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.sku}
                    <div className="ct-help">{p.sku}</div>
                  </Td>
                  <Td numeric>{p.qty}</Td>
                  <Td className="text-muted">{p.status ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
